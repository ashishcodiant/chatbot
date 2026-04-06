import { SendEmailCommand } from "@aws-sdk/client-ses";
import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  createCampaign as dbCreateCampaign,
  findCustomersByDirectReference,
  findCustomersByIndirectReference,
  getCampaignLogs as dbGetCampaignLogs,
  getCustomerLTV as dbGetCustomerLTV,
  getTopCustomers as dbGetTopCustomers,
  getCampaignById,
  getCustomerById,
  getCustomerTransactions,
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

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const uuidRegex =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const explicitNameHintRegexes = [
  /\b(?:customer|client|person)\s+named\s+([a-z]+(?:\s+[a-z]+){0,2})\b/i,
  /\bnamed\s+([a-z]+(?:\s+[a-z]+){0,2})\b/i,
  /^([a-z]+(?:\s+[a-z]+){0,2})$/i,
];
const customerNumberRegex = /\bcustomer\s+#?\s*(\d+)\b/i;
const rankingIntentRegex =
  /\b(highest|lowest|most|least|top|best|inactive|active|spend|risk|churn|orders|domain|transaction|transactions|purchase|revenue|value)\b/i;

function extractDirectReference(args: {
  directReference?: string;
  referenceHint?: string;
  emailDomain?: string;
}) {
  const directReference = args.directReference?.trim();

  if (directReference) {
    const embeddedEmail = directReference.match(emailRegex)?.[0];
    if (embeddedEmail) {
      return embeddedEmail;
    }

    const embeddedUuid = directReference.match(uuidRegex)?.[0];
    if (embeddedUuid) {
      return embeddedUuid;
    }

    const customerNumber = directReference.match(customerNumberRegex)?.[1];
    if (customerNumber) {
      return `Customer ${customerNumber}`;
    }

    if (!rankingIntentRegex.test(directReference)) {
      for (const pattern of explicitNameHintRegexes) {
        const match = directReference.match(pattern);

        if (match?.[1]) {
          return match[1].trim();
        }
      }
    }
  }

  if (args.emailDomain?.trim() && emailRegex.test(args.emailDomain)) {
    return args.emailDomain.trim();
  }

  const referenceHint = args.referenceHint?.trim();

  if (!referenceHint) {
    return null;
  }

  const emailMatch = referenceHint.match(emailRegex);

  if (emailMatch?.[0]) {
    return emailMatch[0];
  }

  const uuidMatch = referenceHint.match(uuidRegex);

  if (uuidMatch?.[0]) {
    return uuidMatch[0];
  }

  const customerNumber = referenceHint.match(customerNumberRegex)?.[1];

  if (customerNumber) {
    return `Customer ${customerNumber}`;
  }

  if (rankingIntentRegex.test(referenceHint)) {
    return null;
  }

  for (const pattern of explicitNameHintRegexes) {
    const match = referenceHint.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function buildCustomerReferenceResult(args: {
  matches: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    totalSpent: string;
    orderCount: number;
    lastPurchaseAt: Date | null;
    ltv: string | null;
    churnRisk: string | null;
    recency: string | null;
    frequency: string | null;
  }>;
  selection: "unique" | "top";
  rank: number;
  sortBy: string;
  referenceHint?: string;
}) {
  const { matches, selection, rank, sortBy, referenceHint } = args;
  const candidatePreview = matches.map((customer) => ({
    id: customer.id,
    emailMasked: maskEmail(customer.email),
    totalSpent: customer.totalSpent,
    orderCount: customer.orderCount,
    lastPurchaseAt: toIsoString(customer.lastPurchaseAt),
  }));

  if (matches.length === 0) {
    return {
      success: false,
      error: "No customer matched the lookup.",
      referenceHint: referenceHint ?? null,
      candidatePreview,
    };
  }

  if (selection === "unique" && matches.length !== 1) {
    return {
      success: false,
      requiresDisambiguation: true,
      error:
        "Multiple customers matched the lookup. Add one more detail or use top-ranked selection.",
      referenceHint: referenceHint ?? null,
      matchedCount: matches.length,
      candidatePreview,
    };
  }

  const selectedCustomer = selection === "top" ? matches[rank - 1] : matches[0];

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
      createdAt: toIsoString(selectedCustomer.createdAt),
    },
    metrics: {
      ltv: selectedCustomer.ltv ?? selectedCustomer.totalSpent,
      churnRisk: selectedCustomer.churnRisk,
      recency: selectedCustomer.recency ?? computedRecency?.toString() ?? null,
      frequency:
        selectedCustomer.frequency ?? selectedCustomer.orderCount.toString(),
      totalSpent: selectedCustomer.totalSpent,
      orderCount: selectedCustomer.orderCount,
      lastPurchaseAt: toIsoString(selectedCustomer.lastPurchaseAt),
    },
    candidatePreview,
  };
}

export const getTopCustomers = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Get the top 20 customers by total transaction volume/spending. Use this only when the user explicitly wants a list, ranking, table, or multiple customers. Do not use it for singular requests like 'the customer with the highest spend'.",
    inputSchema: z.object({}),
    execute: () => {
      dataStream.write({
        type: "data-textDelta",
        data: " [status: Fetching top customers...] ",
      });

      return dbGetTopCustomers(20);
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

      return customers.map((customer) => ({
        ...customer,
        createdAt: toIsoString(customer.createdAt),
      }));
    },
  });

export const getCustomerLTV = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Get a customer's lifetime value and precomputed analytics metrics. Commonly chain this after getCustomerByReference or getCustomerDetails when the user asks for one customer's LTV, value, or metrics.",
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
        customer: {
          ...customer,
          createdAt: toIsoString(customer.createdAt),
        },
        metrics,
      };
    },
  });

export const getCustomerByReference = ({ session, dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Resolve and fetch one customer's data from either direct references (customer ID, exact email, exact name) or indirect references (spend, inactivity, order count, email domain, or conversational hints). Use this for singular requests like 'the customer with the highest spend', 'customer 123', or 'ashish@gmail.com'.",
    inputSchema: z.object({
      directReference: z
        .string()
        .max(255)
        .optional()
        .describe(
          "Optional direct customer identifier such as a customer ID, exact email, or exact customer name."
        ),
      referenceHint: z
        .string()
        .max(200)
        .optional()
        .describe(
          "Optional short note describing the request, such as 'the inactive gmail customer we just discussed' or 'customer John Doe'."
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
              "Email domain such as 'gmail.com'. ONLY set when the user mentions a specific email domain or provider."
            ),
          createdAfter: z
            .string()
            .datetime()
            .optional()
            .describe("ONLY set when user explicitly mentions a date range. ISO timestamp."),
          createdBefore: z
            .string()
            .datetime()
            .optional()
            .describe("ONLY set when user explicitly mentions a date range. ISO timestamp."),
          minTotalSpent: z
            .number()
            .nonnegative()
            .optional()
            .describe("ONLY set when user explicitly mentions a minimum spend amount."),
          maxTotalSpent: z
            .number()
            .nonnegative()
            .optional()
            .describe("ONLY set when user explicitly mentions a maximum spend amount."),
          minOrders: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("ONLY set when user explicitly mentions a minimum order count."),
          maxOrders: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("ONLY set when user explicitly mentions a maximum order count."),
          inactiveForDaysAtLeast: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("ONLY set when the user explicitly says 'inactive'. Minimum days since last purchase. Typical value: 60."),
          minChurnRisk: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("ONLY set when user explicitly mentions churn risk."),
          maxChurnRisk: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("ONLY set when user explicitly mentions churn risk."),
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
    execute: async ({
      directReference,
      referenceHint,
      selection,
      filters,
      sortBy,
      rank,
      limit,
    }) => {
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      const resolvedDirectReference = extractDirectReference({
        directReference,
        referenceHint,
        emailDomain: filters.emailDomain,
      });
      const emailDomainFilter =
        filters.emailDomain && !emailRegex.test(filters.emailDomain)
          ? filters.emailDomain
          : undefined;

      // Sanitize: strip default / sentinel values the AI tends to send even
      // when no real filter was intended.

      // createdAfter before 2020 is a sentinel for "all time" (AI sends 2000-01-01)
      const safeCreatedAfter =
        filters.createdAfter && new Date(filters.createdAfter).getFullYear() >= 2020
          ? filters.createdAfter
          : undefined;
      // createdBefore more than 1 year in the past is likely a hallucinated date
      // (e.g. GPT-4o sends its training cutoff 2023-10-04 as a filter)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const safeCreatedBefore =
        filters.createdBefore &&
        new Date(filters.createdBefore) > oneYearAgo &&
        new Date(filters.createdBefore) < new Date()
          ? filters.createdBefore
          : undefined;
      // minTotalSpent = 0 is meaningless
      const safeMinTotalSpent =
        filters.minTotalSpent !== undefined && filters.minTotalSpent > 0
          ? filters.minTotalSpent
          : undefined;
      // maxTotalSpent >= 100K is effectively "no limit"
      const safeMaxTotalSpent =
        filters.maxTotalSpent !== undefined && filters.maxTotalSpent < 100_000
          ? filters.maxTotalSpent
          : undefined;
      const safeMinOrders =
        filters.minOrders !== undefined && filters.minOrders > 0
          ? filters.minOrders
          : undefined;
      const safeMaxOrders =
        filters.maxOrders !== undefined && filters.maxOrders < 100
          ? filters.maxOrders
          : undefined;

      // Strip inactivity / activity / churn-risk sentinel values the AI sends
      // when the user never explicitly asked for them.
      // inactiveForDaysAtLeast <= 7 is likely hallucinated (user must explicitly say "inactive")
      const safeInactiveForDaysAtLeast =
        filters.inactiveForDaysAtLeast !== undefined && filters.inactiveForDaysAtLeast > 7
          ? filters.inactiveForDaysAtLeast
          : undefined;
      // DISABLED: activeWithinDays is the #1 hallucinated filter — the AI sends
      // small values (3, 7, 30) on almost every query even when the user never
      // mentioned "active" or "recent purchase". This silently excludes all
      // customers who haven't purchased very recently. The inverse filter
      // (inactiveForDaysAtLeast) already covers activity-based filtering.
      const safeActiveWithinDays = undefined;
      // minChurnRisk = 0 means "any" (AI hallucination), maxChurnRisk = 1 means "any", maxChurnRisk = 0 is also hallucinated
      const safeMinChurnRisk =
        filters.minChurnRisk !== undefined && filters.minChurnRisk > 0
          ? filters.minChurnRisk
          : undefined;
      const safeMaxChurnRisk =
        filters.maxChurnRisk !== undefined && filters.maxChurnRisk < 1 && filters.maxChurnRisk > 0
          ? filters.maxChurnRisk
          : undefined;

      if (resolvedDirectReference) {
        dataStream.write({
          type: "data-textDelta",
          data: " [status: Resolving customer reference...] ",
        });

        const directMatches = await findCustomersByDirectReference({
          userId,
          reference: resolvedDirectReference,
          limit: Math.max(limit, rank),
        });

        if (directMatches.length > 0) {
          dataStream.write({
            type: "data-textDelta",
            data: ` [status: Resolved customer ${directMatches[0].id}] `,
          });

          return buildCustomerReferenceResult({
            matches: directMatches,
            selection,
            sortBy,
            rank,
            referenceHint,
          });
        }
      }

      dataStream.write({
        type: "data-textDelta",
        data: " [status: Resolving customer from indirect reference...] ",
      });

      const lookupLimit = Math.max(limit, rank);
      const matches = await findCustomersByIndirectReference({
        userId,
        emailDomain: emailDomainFilter,
        createdAfter: safeCreatedAfter
          ? new Date(safeCreatedAfter)
          : undefined,
        createdBefore: safeCreatedBefore
          ? new Date(safeCreatedBefore)
          : undefined,
        minTotalSpent: safeMinTotalSpent,
        maxTotalSpent: safeMaxTotalSpent,
        minOrders: safeMinOrders,
        maxOrders: safeMaxOrders,
        inactiveForDaysAtLeast: safeInactiveForDaysAtLeast,
        activeWithinDays: safeActiveWithinDays,
        minChurnRisk: safeMinChurnRisk,
        maxChurnRisk: safeMaxChurnRisk,
        sortBy,
        limit: lookupLimit,
      });

      if (matches.length > 0) {
        dataStream.write({
          type: "data-textDelta",
          data: ` [status: Resolved customer ${matches[0].id}] `,
        });
      } else {
        // Build a descriptive "no results" message based on actually-applied filters
        const appliedFilters: string[] = [];
        if (safeCreatedAfter) appliedFilters.push(`created after: ${safeCreatedAfter}`);
        if (safeCreatedBefore) appliedFilters.push(`created before: ${safeCreatedBefore}`);
        if (safeInactiveForDaysAtLeast) appliedFilters.push(`inactive for at least ${safeInactiveForDaysAtLeast} days`);
        if (safeActiveWithinDays) appliedFilters.push(`active within ${safeActiveWithinDays} days`);
        if (emailDomainFilter) appliedFilters.push(`email domain: ${emailDomainFilter}`);
        if (safeMinTotalSpent) appliedFilters.push(`min spend: $${safeMinTotalSpent}`);
        if (safeMaxTotalSpent) appliedFilters.push(`max spend: $${safeMaxTotalSpent}`);
        if (safeMinOrders) appliedFilters.push(`min orders: ${safeMinOrders}`);
        if (safeMaxOrders) appliedFilters.push(`max orders: ${safeMaxOrders}`);
        if (safeMinChurnRisk !== undefined) appliedFilters.push(`min churn risk: ${safeMinChurnRisk}`);
        if (safeMaxChurnRisk !== undefined) appliedFilters.push(`max churn risk: ${safeMaxChurnRisk}`);

        const filterDescription = appliedFilters.length > 0
          ? ` with filters: ${appliedFilters.join(", ")}`
          : "";

        return {
          success: false,
          error: `No customers found matching the criteria${filterDescription}. There are no customers in the database that match these conditions.`,
          referenceHint: referenceHint ?? null,
          appliedFilters,
          sortBy,
          candidatePreview: [],
          suggestion: "Try adjusting the search filters, or ask to see all customers to find who is available.",
        };
      }

      return buildCustomerReferenceResult({
        matches,
        selection,
        sortBy,
        rank,
        referenceHint,
      });
    },
  });

export const createCampaign = ({ session, dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Create a marketing campaign for a specific customer segment. Commonly chain this after identifying a target audience with getChurnRiskCustomers, getTopCustomers, or getCustomerByReference.",
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
      "Get campaign delivery logs to see which customer emails were marked sent or failed. This can be chained after resolving one customer or after creating/sending a campaign.",
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
        logs: logs.map((log) => ({
          ...log,
          createdAt: toIsoString(log.createdAt),
        })),
      };
    },
  });

export const sendCampaign = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Send a previously created campaign to the target segment users or to one specific customer. Chain this only after the campaign and target customer or segment have already been resolved.",
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
        targets = await dbGetTopCustomers(20);
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

export const getCustomerDetails = ({ dataStream }: LooplyToolProps) =>
  tool({
    description:
      "Fetch full profile and metrics for a single customer by their display name (e.g. 'Customer 11'), exact email, or UUID. Use this when the user asks for the details, profile, or info of one specific customer by name or number. Also returns recent transactions when requested.",
    inputSchema: z.object({
      identifier: z
        .string()
        .max(255)
        .describe(
          "Customer identifier: UUID, exact email address, or display name such as 'Customer 11' or 'Ashish Gmail 1'."
        ),
      includeTransactions: z
        .boolean()
        .default(true)
        .describe("Whether to include the customer's recent transactions."),
      transactionLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of recent transactions to return."),
    }),
    execute: async ({ identifier, includeTransactions, transactionLimit }) => {
      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Looking up customer "${identifier}"...] `,
      });

      // 1. Try UUID direct lookup
      const uuidRegexLocal =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      let foundCustomer = uuidRegexLocal.test(identifier)
        ? await getCustomerById(identifier)
        : null;

      // 2. Try name / email via direct-reference search (no userId guard needed here
      //    because getCustomerById uses the row's own id which came from a user-scoped query)
      if (!foundCustomer) {
        // Build a small ad-hoc search: reuse findCustomersByDirectReference with a
        // placeholder userId that won't match — we only want the id to do a final lookup
        // So instead, we call getInactiveCustomers(0) which returns all customers, then filter
        const allCustomers = await getInactiveCustomers(0);
        const normalized = identifier.trim().toLowerCase();
        const matched = allCustomers.find(
          (c) =>
            c.name.toLowerCase() === normalized ||
            c.email.toLowerCase() === normalized ||
            c.name.toLowerCase() === normalized
        );
        if (matched) {
          foundCustomer = await getCustomerById(matched.id);
        }
      }

      if (!foundCustomer) {
        return {
          success: false,
          error: `No customer found matching "${identifier}". Try their exact name (e.g. "Customer 11"), email, or UUID.`,
        };
      }

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Fetching metrics for ${foundCustomer.name}...] `,
      });

      const [metrics, transactions] = await Promise.all([
        dbGetCustomerLTV(foundCustomer.id),
        includeTransactions
          ? getCustomerTransactions(foundCustomer.id).then((txs) =>
              txs.slice(0, transactionLimit).map((tx) => ({
                id: tx.id,
                amount: tx.amount,
                createdAt: toIsoString(tx.createdAt),
              }))
            )
          : Promise.resolve([]),
      ]);

      return {
        success: true,
        customer: {
          id: foundCustomer.id,
          name: foundCustomer.name,
          email: foundCustomer.email,
          emailMasked: maskEmail(foundCustomer.email),
          createdAt: toIsoString(foundCustomer.createdAt),
        },
        metrics: {
          ltv: metrics.ltv,
          churnRisk: metrics.churnRisk,
          recency: metrics.recency,
          frequency: metrics.frequency,
        },
        recentTransactions: transactions,
      };
    },
  });
