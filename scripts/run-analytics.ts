import { computeCustomerMetrics } from "../lib/jobs/analytics";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function runJob() {
  try {
    await computeCustomerMetrics();
    console.log("✅ Analytics job completed successfully.");
  } catch (error) {
    console.error("❌ Analytics job failed:", error);
  }
}

runJob();
