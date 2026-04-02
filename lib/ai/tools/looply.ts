import { SendEmailCommand } from "@aws-sdk/client-ses";
import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  createCampaign as dbCreateCampaign,
  findCustomersByIndirectReference,
  getCampaignLogs as dbGetCampaignLogs,
  getCustomerLTV as dbGetCustomerLTV,
  getTopCustomers as dbGetTopCustomers,
  getCampaignById,
  getCustomerById,
  getInactiveCustomers,
  logCampaignAction,
  updateCampaignStatus,
} from "@/lib/db/looply-queries";
import { sesClient } from "@/lib/ses-client";
import type { ChatMessage } from "@/lib/types";

type LooplyToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  const visibleLocal = localPart.slice(0, 2);
  const maskedLocal =
    visibleLocal + "*".repeat(Math.max(localPart.length - visibleLocal.length, 2));

  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

function computeRecencyInDays(lastPurchaseAt: Date | null) {
  if (!lastPurchaseAt) {
    return null;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const diffInMs = Date.now() - new Date(lastPurchaseAt).getTime();

  return Math.max(0, Math.floor(diffInMs / millisecondsPerDay));
}

export const getTopCustomers = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Get the top 10 customers by total transaction volume/spending.",
    inputSchema: z.object({}),
    execute: () => {
      dataStream.write({
        type: "data-textDelta",
        data: " [status: Fetching top customers...] ",
      });

      return dbGetTopCustomers(10);
    },
  });

export const getChurnRiskCustomers = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Identify customers who have not made a purchase in at least 60 days (churn risk).",
    inputSchema: z.object({
      days: z
        .number()
        .default(60)
        .describe("Number of days of inactivity to consider as churn risk."),
    }),
    execute: async ({ days }) => {
      dataStream.write({
        type: "data-textDelta",
        data: " [status: Identifying churn risk...] ",
      });

      const customers = await getInactiveCustomers(days);

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Found ${customers.length} customers at risk.] `,
      });

      return customers;
    },
  });

export const getCustomerLTV = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Get a customer's lifetime value and any precomputed analytics metrics.",
    inputSchema: z.object({
      customerId: z.string().uuid().describe("The customer ID to inspect"),
    }),
    execute: async ({ customerId }) => {
      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Calculating LTV for ${customerId}...] `,
      });

      const [customer, metrics] = await Promise.all([
        getCustomerById(customerId),
        dbGetCustomerLTV(customerId),
      ]);

      if (!customer) {
        return {
          success: false,
          error: "Customer not found",
        };
      }

      return {
        success: true,
        customer,
        metrics,
      };
    },
  });

export const getCustomerByReference = ({ session, dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Resolve and fetch one customer's data using indirect identifiers such as spend, inactivity, order count, email domain, or conversational hints. Do not pass customer names or full emails.",
    inputSchema: z.object({
      referenceHint: z
        .string()
        .max(200)
        .optional()
        .describe(
          "Optional short note describing the conversational hint, such as 'the inactive gmail customer we just discussed'."
        ),
      selection: z
        .enum(["unique", "top"])
        .default("unique")
        .describe(
          "Use 'unique' when the filters should narrow to exactly one customer. Use 'top' when you want the highest-ranked customer in the filtered result set."
        ),
      filters: z
        .object({
          emailDomain: z
            .string()
            .optional()
            .describe(
              "Email domain only, such as 'gmail.com'. Do not send a full email address."
            ),
          createdAfter: z
            .string()
            .datetime()
            .optional()
            .describe("Only include customers created after this ISO timestamp."),
          createdBefore: z
            .string()
            .datetime()
            .optional()
            .describe("Only include customers created before this ISO timestamp."),
          minTotalSpent: z
            .number()
            .nonnegative()
            .optional()
            .describe("Minimum total spend across all transactions."),
          maxTotalSpent: z
            .number()
            .nonnegative()
            .optional()
            .describe("Maximum total spend across all transactions."),
          minOrders: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Minimum number of orders."),
          maxOrders: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Maximum number of orders."),
          inactiveForDaysAtLeast: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Only include customers with no purchases for at least this many days."),
          activeWithinDays: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Only include customers with a purchase inside this many days."),
          minChurnRisk: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Minimum churn-risk score when analytics are available."),
          maxChurnRisk: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Maximum churn-risk score when analytics are available."),
        })
        .default({}),
      sortBy: z
        .enum([
          "highest_spend",
          "lowest_spend",
          "most_recent_purchase",
          "least_recent_purchase",
          "most_orders",
          "highest_churn_risk",
          "newest_customer",
          "oldest_customer",
        ])
        .default("highest_spend")
        .describe("Ranking rule used when selection is 'top'."),
      rank: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(1)
        .describe("The 1-based rank to choose when selection is 'top'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(5)
        .describe("How many matching candidates to inspect before choosing."),
    }),
    execute: async ({ referenceHint, selection, filters, sortBy, rank, limit }) => {
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      dataStream.write({
        type: "data-textDelta",
        data: " [status: Resolving customer from indirect reference...] ",
      });

      const lookupLimit = Math.max(limit, rank);
      const matches = await findCustomersByIndirectReference({
        userId,
        emailDomain: filters.emailDomain,
        createdAfter: filters.createdAfter
          ? new Date(filters.createdAfter)
          : undefined,
        createdBefore: filters.createdBefore
          ? new Date(filters.createdBefore)
          : undefined,
        minTotalSpent: filters.minTotalSpent,
        maxTotalSpent: filters.maxTotalSpent,
        minOrders: filters.minOrders,
        maxOrders: filters.maxOrders,
        inactiveForDaysAtLeast: filters.inactiveForDaysAtLeast,
        activeWithinDays: filters.activeWithinDays,
        minChurnRisk: filters.minChurnRisk,
        maxChurnRisk: filters.maxChurnRisk,
        sortBy,
        limit: lookupLimit,
      });

      const candidatePreview = matches.map((customer) => ({
        id: customer.id,
        emailMasked: maskEmail(customer.email),
        totalSpent: customer.totalSpent,
        orderCount: customer.orderCount,
        lastPurchaseAt: customer.lastPurchaseAt,
      }));

      if (matches.length === 0) {
        return {
          success: false,
          error: "No customer matched the indirect reference.",
          referenceHint: referenceHint ?? null,
          candidatePreview,
        };
      }

      if (selection === "unique" && matches.length !== 1) {
        return {
          success: false,
          requiresDisambiguation: true,
          error:
            "The indirect reference matched multiple customers. Add more attributes or switch to top-ranked selection.",
          referenceHint: referenceHint ?? null,
          matchedCount: matches.length,
          candidatePreview,
        };
      }

      const selectedCustomer =
        selection === "top" ? matches[rank - 1] : matches[0];

      if (!selectedCustomer) {
        return {
          success: false,
          error: `Rank ${rank} is outside the matched customer set.`,
          referenceHint: referenceHint ?? null,
          matchedCount: matches.length,
          candidatePreview,
        };
      }

      const computedRecency = computeRecencyInDays(selectedCustomer.lastPurchaseAt);

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Resolved customer ${selectedCustomer.id}] `,
      });

      return {
        success: true,
        selection,
        sortBy,
        rank,
        referenceHint: referenceHint ?? null,
        matchedCount: matches.length,
        customer: {
          id: selectedCustomer.id,
          name: selectedCustomer.name,
          email: selectedCustomer.email,
          emailMasked: maskEmail(selectedCustomer.email),
          createdAt: selectedCustomer.createdAt,
        },
        metrics: {
          ltv: selectedCustomer.ltv ?? selectedCustomer.totalSpent,
          churnRisk: selectedCustomer.churnRisk,
          recency:
            selectedCustomer.recency ?? computedRecency?.toString() ?? null,
          frequency:
            selectedCustomer.frequency ?? selectedCustomer.orderCount.toString(),
          totalSpent: selectedCustomer.totalSpent,
          orderCount: selectedCustomer.orderCount,
          lastPurchaseAt: selectedCustomer.lastPurchaseAt,
        },
        candidatePreview,
      };
    },
  });

export const createCampaign = ({ session, dataStream }: LooplyToolProps) =>
  tool({
    description: "Create a marketing campaign for a specific customer segment.",
    inputSchema: z.object({
      segment: z
        .string()
        .describe(
          "The name of the customer segment (e.g., 'Inactive Customers')"
        ),
      message: z
        .string()
        .describe("The marketing message/content for the campaign"),
    }),
    execute: async ({ segment, message }) => {
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      dataStream.write({
        type: "data-textDelta",
        data: " [status: Creating campaign draft...] ",
      });

      const campaign = await dbCreateCampaign({
        userId,
        segment,
        message,
      });

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Campaign created with ID: ${campaign.id}] `,
      });

      return {
        success: true,
        campaignId: campaign.id,
        message: `Campaign for segment '${segment}' created as draft. You can now send it.`,
      };
    },
  });

export const getCampaignLogs = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Get campaign delivery logs to see which customer emails were marked sent or failed.",
    inputSchema: z.object({
      campaignId: z
        .string()
        .uuid()
        .optional()
        .describe("Optional campaign ID to inspect"),
      customerId: z
        .string()
        .uuid()
        .optional()
        .describe("Optional customer ID to inspect"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum number of campaign log rows to return"),
    }),
    execute: async ({ campaignId, customerId, limit }) => {
      dataStream.write({
        type: "data-textDelta",
        data: " [status: Loading campaign delivery logs...] ",
      });

      const logs = await dbGetCampaignLogs({
        campaignId,
        customerId,
        limit,
      });

      return {
        success: true,
        count: logs.length,
        logs,
      };
    },
  });

export const sendCampaign = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Send a previously created campaign to the target segment users or to one specific customer.",
    inputSchema: z.object({
      campaignId: z.string().uuid().describe("The ID of the campaign to send"),
      customerId: z
        .string()
        .uuid()
        .optional()
        .describe(
          "Optional customer ID. When provided, only this customer receives the campaign."
        ),
    }),
    execute: async ({ campaignId, customerId }) => {
      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Preparing to send campaign ${campaignId}...] `,
      });

      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return { success: false, error: "Campaign not found" };
      }

      await updateCampaignStatus(campaignId, "sending");

      let targets: Array<{ id: string; email: string }> = [];

      if (customerId) {
        const targetCustomer = await getCustomerById(customerId);

        if (!targetCustomer) {
          await updateCampaignStatus(campaignId, "failed");
          return {
            success: false,
            error: "Customer not found",
          };
        }

        targets = [
          {
            id: targetCustomer.id,
            email: targetCustomer.email,
          },
        ];
      } else if (campaign.segment.toLowerCase().includes("inactive")) {
        targets = await getInactiveCustomers(60);
      } else if (campaign.segment.toLowerCase().includes("top")) {
        targets = await dbGetTopCustomers(10);
      } else {
        const matchingCustomer =
          campaign.segment.match(/customer\s+(\d+)/i) ||
          campaign.segment.match(/customer\s+([a-f0-9-]{36})/i);

        if (matchingCustomer) {
          const customerLabel = matchingCustomer[0];
          const allCustomers = await getInactiveCustomers(0);
          const exactMatch = allCustomers.find(
            (customer) =>
              customer.name.toLowerCase() === customerLabel.toLowerCase() ||
              customer.id === matchingCustomer[1]
          );

          if (exactMatch) {
            targets = [{ id: exactMatch.id, email: exactMatch.email }];
          }
        }
      }

      if (targets.length === 0) {
        await updateCampaignStatus(campaignId, "failed");
        return {
          success: false,
          error:
            "No campaign recipients were resolved. Provide a specific customer or use a supported segment.",
        };
      }

      const sender = process.env.SES_SENDER_EMAIL;
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

      if (!sender || !accessKeyId || !secretAccessKey) {
        const missing: string[] = [];

        if (!sender) {
          missing.push("SES_SENDER_EMAIL");
        }
        if (!accessKeyId) {
          missing.push("AWS_ACCESS_KEY_ID");
        }
        if (!secretAccessKey) {
          missing.push("AWS_SECRET_ACCESS_KEY");
        }

        const errorMsg = `AWS credentials or sender email are missing: ${missing.join(", ")}`;
        dataStream.write({
          type: "data-textDelta",
          data: ` [error: ${errorMsg}. Please check your .env.local settings.] `,
        });

        await updateCampaignStatus(campaignId, "failed");

        return { success: false, error: errorMsg };
      }

      let sentCount = 0;
      let failCount = 0;
      let lastErrorMessage = "";

      for (const target of targets) {
        dataStream.write({
          type: "data-textDelta",
          data: ` [status: Sending to ${target.email}...] `,
        });

        try {
          const command = new SendEmailCommand({
            Destination: { ToAddresses: [target.email] },
            Message: {
              Body: {
                Text: { Data: campaign.message },
                Html: {
                  Data: `<div style="font-family: sans-serif;">${campaign.message}</div>`,
                },
              },
              Subject: { Data: `Special Offer: ${campaign.segment}` },
            },
            Source: sender,
          });

          await sesClient.send(command);
          await logCampaignAction({
            campaignId,
            customerId: target.id,
            status: "sent",
          });
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to ${target.email}:`, error);

          lastErrorMessage =
            error instanceof Error ? error.message : "Unknown SES error";

          await logCampaignAction({
            campaignId,
            customerId: target.id,
            status: "failed",
            error: lastErrorMessage,
          });
          failCount++;
        }
      }

      await updateCampaignStatus(
        campaignId,
        failCount > 0 && sentCount === 0 ? "failed" : "completed"
      );

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Campaign completed. Sent: ${sentCount}, Failed: ${failCount}] `,
      });

      if (sentCount === 0 && targets.length > 0) {
        return {
          success: false,
          error: `Failed to send any emails. Last error: ${lastErrorMessage}. Check if your SES identities are verified.`,
          sentCount,
          failCount,
        };
      }

      return {
        success: true,
        campaignId,
        scope: customerId ? "single_customer" : "segment",
        sentCount,
        failCount,
        status: failCount > 0 ? "completed_with_errors" : "completed",
      };
    },
  });
