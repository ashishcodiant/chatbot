import { and, asc, desc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  campaign,
  campaignLog,
  customer,
  customerMetrics,
  transaction,
} from "./schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

// Customer Queries
export async function getTopCustomers(limit = 10) {
  return await db
    .select({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      totalSpent: sql<string>`sum(${transaction.amount}::numeric)`,
    })
    .from(customer)
    .innerJoin(transaction, eq(customer.id, transaction.customerId))
    .groupBy(customer.id)
    .orderBy(desc(sql`sum(${transaction.amount}::numeric)`))
    .limit(limit);
}

export async function getInactiveCustomers(days = 60) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Subquery for customers who have any transaction after cutoff
  const recentCustomers = db
    .select({ customerId: transaction.customerId })
    .from(transaction)
    .where(gte(transaction.createdAt, cutoff));

  return await db
    .select()
    .from(customer)
    .where(sql`${customer.id} NOT IN (${recentCustomers})`);
}

export async function getCustomerById(id: string) {
  const [result] = await db.select().from(customer).where(eq(customer.id, id));
  return result;
}

export type IndirectCustomerLookup = {
  userId: string;
  emailDomain?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  minTotalSpent?: number;
  maxTotalSpent?: number;
  minOrders?: number;
  maxOrders?: number;
  inactiveForDaysAtLeast?: number;
  activeWithinDays?: number;
  minChurnRisk?: number;
  maxChurnRisk?: number;
  sortBy?:
    | "highest_spend"
    | "lowest_spend"
    | "most_recent_purchase"
    | "least_recent_purchase"
    | "most_orders"
    | "highest_churn_risk"
    | "newest_customer"
    | "oldest_customer";
  limit?: number;
};

export async function findCustomersByIndirectReference({
  userId,
  emailDomain,
  createdAfter,
  createdBefore,
  minTotalSpent,
  maxTotalSpent,
  minOrders,
  maxOrders,
  inactiveForDaysAtLeast,
  activeWithinDays,
  minChurnRisk,
  maxChurnRisk,
  sortBy = "highest_spend",
  limit = 5,
}: IndirectCustomerLookup) {
  const whereConditions: SQL[] = [eq(customer.userId, userId)];
  const havingConditions: SQL[] = [];

  if (emailDomain) {
    const normalizedDomain = emailDomain.trim().toLowerCase().replace(/^@/, "");

    whereConditions.push(
      sql`lower(split_part(${customer.email}, '@', 2)) = ${normalizedDomain}`
    );
  }

  if (createdAfter) {
    whereConditions.push(gte(customer.createdAt, createdAfter));
  }

  if (createdBefore) {
    whereConditions.push(lte(customer.createdAt, createdBefore));
  }

  if (minChurnRisk !== undefined) {
    whereConditions.push(
      sql`coalesce(nullif(${customerMetrics.churnRisk}, '')::numeric, 0) >= ${minChurnRisk}`
    );
  }

  if (maxChurnRisk !== undefined) {
    whereConditions.push(
      sql`coalesce(nullif(${customerMetrics.churnRisk}, '')::numeric, 0) <= ${maxChurnRisk}`
    );
  }

  if (minTotalSpent !== undefined) {
    havingConditions.push(
      sql`coalesce(sum(${transaction.amount}::numeric), 0) >= ${minTotalSpent}`
    );
  }

  if (maxTotalSpent !== undefined) {
    havingConditions.push(
      sql`coalesce(sum(${transaction.amount}::numeric), 0) <= ${maxTotalSpent}`
    );
  }

  if (minOrders !== undefined) {
    havingConditions.push(sql`count(${transaction.id}) >= ${minOrders}`);
  }

  if (maxOrders !== undefined) {
    havingConditions.push(sql`count(${transaction.id}) <= ${maxOrders}`);
  }

  if (inactiveForDaysAtLeast !== undefined) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveForDaysAtLeast);

    havingConditions.push(
      sql`max(${transaction.createdAt}) is null or max(${transaction.createdAt}) <= ${cutoff}`
    );
  }

  if (activeWithinDays !== undefined) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - activeWithinDays);

    havingConditions.push(sql`max(${transaction.createdAt}) >= ${cutoff}`);
  }

  const orderByClause = (() => {
    switch (sortBy) {
      case "lowest_spend":
        return asc(sql`coalesce(sum(${transaction.amount}::numeric), 0)`);
      case "most_recent_purchase":
        return desc(sql`max(${transaction.createdAt})`);
      case "least_recent_purchase":
        return asc(sql`max(${transaction.createdAt})`);
      case "most_orders":
        return desc(sql`count(${transaction.id})`);
      case "highest_churn_risk":
        return desc(
          sql`coalesce(nullif(${customerMetrics.churnRisk}, '')::numeric, 0)`
        );
      case "newest_customer":
        return desc(customer.createdAt);
      case "oldest_customer":
        return asc(customer.createdAt);
      case "highest_spend":
      default:
        return desc(sql`coalesce(sum(${transaction.amount}::numeric), 0)`);
    }
  })();

  return await db
    .select({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      createdAt: customer.createdAt,
      totalSpent: sql<string>`coalesce(sum(${transaction.amount}::numeric), 0)::text`,
      orderCount: sql<number>`count(${transaction.id})`,
      lastPurchaseAt: sql<Date | null>`max(${transaction.createdAt})`,
      ltv: customerMetrics.ltv,
      churnRisk: customerMetrics.churnRisk,
      recency: customerMetrics.recency,
      frequency: customerMetrics.frequency,
    })
    .from(customer)
    .leftJoin(transaction, eq(customer.id, transaction.customerId))
    .leftJoin(customerMetrics, eq(customer.id, customerMetrics.customerId))
    .where(and(...whereConditions))
    .groupBy(
      customer.id,
      customer.name,
      customer.email,
      customer.createdAt,
      customerMetrics.ltv,
      customerMetrics.churnRisk,
      customerMetrics.recency,
      customerMetrics.frequency
    )
    .having(havingConditions.length > 0 ? and(...havingConditions) : undefined)
    .orderBy(orderByClause, asc(customer.createdAt))
    .limit(limit);
}

// Transaction Queries
export async function getCustomerTransactions(customerId: string) {
  return await db
    .select()
    .from(transaction)
    .where(eq(transaction.customerId, customerId))
    .orderBy(desc(transaction.createdAt));
}

export async function getCustomerLTV(customerId: string) {
  const [metrics] = await db
    .select({
      ltv: customerMetrics.ltv,
      churnRisk: customerMetrics.churnRisk,
      recency: customerMetrics.recency,
      frequency: customerMetrics.frequency,
    })
    .from(customerMetrics)
    .where(eq(customerMetrics.customerId, customerId));

  if (metrics) {
    return metrics;
  }

  const [aggregate] = await db
    .select({
      ltv: sql<string>`coalesce(sum(${transaction.amount}::numeric)::text, '0')`,
      frequency: sql<string>`count(*)::text`,
    })
    .from(transaction)
    .where(eq(transaction.customerId, customerId));

  return {
    ltv: aggregate?.ltv ?? "0",
    frequency: aggregate?.frequency ?? "0",
    recency: null,
    churnRisk: null,
  };
}

// Campaign Queries
export async function createCampaign({
  userId,
  segment,
  message,
}: {
  userId: string;
  segment: string;
  message: string;
}) {
  const [result] = await db
    .insert(campaign)
    .values({
      userId,
      segment,
      message,
      status: "draft",
    })
    .returning();
  return result;
}

export async function getCampaignById(id: string) {
  const [result] = await db.select().from(campaign).where(eq(campaign.id, id));
  return result;
}

export async function getCampaignLogs({
  campaignId,
  customerId,
  limit = 20,
}: {
  campaignId?: string;
  customerId?: string;
  limit?: number;
}) {
  const conditions: SQL[] = [];

  if (campaignId) {
    conditions.push(eq(campaignLog.campaignId, campaignId));
  }

  if (customerId) {
    conditions.push(eq(campaignLog.customerId, customerId));
  }

  return await db
    .select({
      id: campaignLog.id,
      campaignId: campaignLog.campaignId,
      customerId: campaignLog.customerId,
      email: customer.email,
      customerName: customer.name,
      status: campaignLog.status,
      error: campaignLog.error,
      createdAt: campaignLog.createdAt,
    })
    .from(campaignLog)
    .leftJoin(customer, eq(campaignLog.customerId, customer.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(campaignLog.createdAt))
    .limit(limit);
}

export async function updateCampaignStatus(id: string, status: string) {
  return await db
    .update(campaign)
    .set({ status: status as any })
    .where(eq(campaign.id, id));
}

export async function logCampaignAction({
  campaignId,
  customerId,
  status,
  error,
}: {
  campaignId: string;
  customerId: string;
  status: "sent" | "failed";
  error?: string;
}) {
  return await db.insert(campaignLog).values({
    campaignId,
    customerId,
    status,
    error,
  });
}

// Metrics Queries
export async function getCustomerMetrics(customerId: string) {
  const [result] = await db
    .select()
    .from(customerMetrics)
    .where(eq(customerMetrics.customerId, customerId));
  return result;
}

export async function updateCustomerMetrics(
  customerId: string,
  metrics: {
    ltv: string;
    churnRisk: string;
    recency: string;
    frequency: string;
  }
) {
  const existing = await getCustomerMetrics(customerId);
  if (existing) {
    return await db
      .update(customerMetrics)
      .set({ ...metrics, updatedAt: new Date() })
      .where(eq(customerMetrics.customerId, customerId));
  }
  return await db.insert(customerMetrics).values({
    customerId,
    ...metrics,
  });
}
