import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not found in .env.local");
    process.exit(1);
  }

  const client = postgres(url);
  try {
    console.log("Enabling pgvector extension...");
    await client`CREATE EXTENSION IF NOT EXISTS vector;`;
    console.log("pgvector extension enabled successfully.");
  } catch (error) {
    console.error("Error enabling pgvector extension:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
