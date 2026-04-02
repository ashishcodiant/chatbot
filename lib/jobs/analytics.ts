import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { updateCustomerMetrics } from "../db/looply-queries";
import { customer, transaction } from "../db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export async function computeCustomerMetrics() {
  console.log("Starting background analytics job...");

  // 1. Fetch all customers
  const allCustomers = await db.select().from(customer);

  let processedCustomers = 0;

  for (const c of allCustomers) {
    // 2. Compute LTV (sum of all transactions)
    const [ltvResult] = await db
      .select({ total: sql<string>`sum(${transaction.amount})` })
      .from(transaction)
      .where(eq(transaction.customerId, c.id));

    const ltv = ltvResult?.total || "0";

    // 3. Compute Frequency (count of transactions)
    const [freqResult] = await db
      .select({ count: sql<string>`count(*)` })
      .from(transaction)
      .where(eq(transaction.customerId, c.id));

    const frequency = freqResult?.count || "0";

    // 4. Compute Recency (days since last transaction)
    const [lastTx] = await db
      .select({ date: transaction.createdAt })
      .from(transaction)
      .where(eq(transaction.customerId, c.id))
      .orderBy(sql`${transaction.createdAt} DESC`)
      .limit(1);

    let recency = "999"; // default for no transactions
    if (lastTx) {
      const diffTime = Math.abs(Date.now() - new Date(lastTx.date).getTime());
      recency = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString();
    }

    // 5. Churn Risk (simple logic: if recency > 30 days, higher risk)
    const churnRisk = Number.parseInt(recency, 10) > 30 ? "0.8" : "0.2";

    // 6. Update metrics table
    await updateCustomerMetrics(c.id, {
      ltv,
      frequency,
      recency,
      churnRisk,
    });

    processedCustomers++;
    console.log(
      `Updated metrics for customer ${c.id}: LTV=${ltv}, Freq=${frequency}, Recency=${recency}`
    );
  }

  console.log("Background analytics job completed.");

  return {
    processedCustomers,
  };
}
