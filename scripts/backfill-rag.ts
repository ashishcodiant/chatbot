import { config } from "dotenv";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { processDocumentFromUrl } from "@/lib/ai/tools/rag";
import { document, documentChunk } from "@/lib/db/schema";

config({
  path: ".env.local",
});

function extractSourcePdfUrl(content: string | null) {
  if (!content) {
    return null;
  }

  const match = content.match(/^Source PDF:\s*(https?:\/\/\S+)/i);
  return match?.[1] ?? null;
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const client = postgres(process.env.POSTGRES_URL, { ssl: "require" });
  const db = drizzle(client);

  try {
    const pendingDocuments = await db
      .select({
        id: document.id,
        createdAt: document.createdAt,
        title: document.title,
        content: document.content,
      })
      .from(document)
      .leftJoin(
        documentChunk,
        and(
          eq(documentChunk.documentId, document.id),
          eq(documentChunk.documentCreatedAt, document.createdAt)
        )
      )
      .where(
        and(
          sql`${document.content} like 'Source PDF:%'`,
          sql`${documentChunk.id} is null`
        )
      )
      .orderBy(desc(document.createdAt))
      .limit(20);

    console.log(`Found ${pendingDocuments.length} pending document(s).`);

    for (const pendingDocument of pendingDocuments) {
      const url = extractSourcePdfUrl(pendingDocument.content);

      if (!url) {
        console.log(`Skipping ${pendingDocument.title}: source URL missing.`);
        continue;
      }

      console.log(`Indexing ${pendingDocument.title}...`);

      const result = await processDocumentFromUrl({
        documentId: pendingDocument.id,
        documentCreatedAt: pendingDocument.createdAt,
        url,
        onStatus: (message) => {
          console.log(`  - ${message}`);
        },
      });

      console.log(
        `Indexed ${pendingDocument.title}: ${result.chunkCount} chunks stored.`
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("RAG backfill failed");
  console.error(error);
  process.exit(1);
});
