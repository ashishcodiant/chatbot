import path from "node:path";
import { pathToFileURL } from "node:url";
import { openai } from "@ai-sdk/openai";
import { embed, embedMany, tool, type UIMessageStreamWriter } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Session } from "next-auth";
import { PDFParse } from "pdf-parse";
import postgres from "postgres";
import { z } from "zod";
import { document, documentChunk } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";

let ragDb:
  | ReturnType<typeof drizzle<typeof import("@/lib/db/schema")>>
  | undefined;

function getDb() {
  if (!ragDb) {
    const client = postgres(process.env.POSTGRES_URL ?? "", { ssl: "require" });
    ragDb = drizzle(client);
  }

  return ragDb;
}

type RAGToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

type ProcessDocumentParams = {
  documentId: string;
  documentCreatedAt: Date;
  url: string;
  onStatus?: (message: string) => void | Promise<void>;
};

let pdfWorkerConfigured = false;

function configurePdfWorker() {
  if (pdfWorkerConfigured) {
    return;
  }

  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "pdf-parse",
    "esm",
    "pdf.worker.mjs"
  );

  PDFParse.setWorker(pathToFileURL(workerPath).href);
  pdfWorkerConfigured = true;
}

function chunkText(text: string) {
  const chunks: string[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunkSize = 1000;
  const overlap = 200;

  for (let index = 0; index < normalized.length; index += chunkSize - overlap) {
    const chunk = normalized.slice(index, index + chunkSize).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

function extractSourcePdfUrl(content: string | null) {
  if (!content) {
    return null;
  }

  const match = content.match(/^Source PDF:\s*(https?:\/\/\S+)/i);
  return match?.[1] ?? null;
}

async function backfillMissingPdfDocumentsForUser({
  userId,
  onStatus,
}: {
  userId: string;
  onStatus?: (message: string) => void | Promise<void>;
}) {
  const db = getDb();
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
        eq(document.userId, userId),
        sql`${document.content} like 'Source PDF:%'`,
        sql`${documentChunk.id} is null`
      )
    )
    .orderBy(desc(document.createdAt))
    .limit(5);

  let indexedCount = 0;

  for (const pendingDocument of pendingDocuments) {
    const url = extractSourcePdfUrl(pendingDocument.content);

    if (!url) {
      continue;
    }

    await onStatus?.(`Indexing "${pendingDocument.title}" for retrieval...`);

    try {
      await processDocumentFromUrl({
        documentId: pendingDocument.id,
        documentCreatedAt: pendingDocument.createdAt,
        url,
        onStatus,
      });
      indexedCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown indexing error";
      await onStatus?.(
        `Skipping "${pendingDocument.title}" because indexing failed: ${message}`
      );
    }
  }

  return indexedCount;
}

export async function processDocumentFromUrl({
  documentId,
  documentCreatedAt,
  url,
  onStatus,
}: ProcessDocumentParams) {
  const db = getDb();
  await onStatus?.("Downloading and parsing PDF...");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  configurePdfWorker();
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  const result = await parser.getText();
  await parser.destroy();

  const text = result.text?.trim() ?? "";
  if (!text) {
    throw new Error("The uploaded PDF did not contain extractable text");
  }

  await onStatus?.(`Parsed ${text.length} characters. Chunking...`);

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error("No text chunks were generated from the uploaded PDF");
  }

  await onStatus?.(`Generated ${chunks.length} chunks. Creating embeddings...`);

  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks,
  });

  await onStatus?.("Storing chunks in database...");

  await db
    .delete(documentChunk)
    .where(
      and(
        eq(documentChunk.documentId, documentId),
        eq(documentChunk.documentCreatedAt, documentCreatedAt)
      )
    );

  await db.insert(documentChunk).values(
    chunks.map((content, index) => ({
      documentId,
      documentCreatedAt,
      content,
      embedding: embeddings[index],
    }))
  );

  await onStatus?.("Document processed successfully.");

  return {
    success: true,
    chunkCount: chunks.length,
    textLength: text.length,
    message: "Document has been indexed and is ready for retrieval.",
  };
}

export const processDocument = ({ session, dataStream }: RAGToolProps) =>
  tool({
    description:
      "Process a PDF document: parse text, chunk it, generate embeddings, and store in the knowledge base.",
    inputSchema: z.object({
      documentId: z
        .string()
        .uuid()
        .describe("The ID of the document in the Document table"),
      url: z
        .string()
        .url()
        .describe("The URL of the PDF file (e.g., from Vercel Blob)"),
    }),
    execute: async ({ documentId, url }) => {
      const db = getDb();
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      const [targetDocument] = await db
        .select({
          id: document.id,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(and(eq(document.id, documentId), eq(document.userId, userId)))
        .orderBy(desc(document.createdAt))
        .limit(1);

      if (!targetDocument) {
        return {
          success: false,
          error: "Document not found or not accessible by this user",
        };
      }

      return processDocumentFromUrl({
        documentId,
        documentCreatedAt: targetDocument.createdAt,
        url,
        onStatus: (message) => {
          dataStream.write({
            type: "data-textDelta",
            data: ` [status: ${message}] `,
          });
        },
      });
    },
  });

export const searchKnowledgeBase = ({ session, dataStream }: RAGToolProps) =>
  tool({
    description:
      "Search the knowledge base (business documents) for relevant information using semantic search.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The search query or question about business documents"),
    }),
    execute: async ({ query }) => {
      const db = getDb();
      const userId = session.user.id;

      if (!userId) {
        throw new Error("Unauthorized");
      }

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Searching knowledge base for "${query}"...] `,
      });

      const backfilledCount = await backfillMissingPdfDocumentsForUser({
        userId,
        onStatus: (message) => {
          dataStream.write({
            type: "data-textDelta",
            data: ` [status: ${message}] `,
          });
        },
      });

      if (backfilledCount > 0) {
        dataStream.write({
          type: "data-textDelta",
          data: ` [status: Indexed ${backfilledCount} pending document(s) before search.] `,
        });
      }

      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: query,
      });

      const similarity = sql<number>`1 - (${documentChunk.embedding} <=> ${JSON.stringify(embedding)}::vector)`;

      const results = await db
        .select({
          documentId: documentChunk.documentId,
          title: document.title,
          content: documentChunk.content,
          similarity,
        })
        .from(documentChunk)
        .innerJoin(
          document,
          and(
            eq(documentChunk.documentId, document.id),
            eq(documentChunk.documentCreatedAt, document.createdAt)
          )
        )
        .where(eq(document.userId, userId))
        .orderBy(
          sql`${documentChunk.embedding} <=> ${JSON.stringify(embedding)}::vector`
        )
        .limit(5);

      dataStream.write({
        type: "data-textDelta",
        data: ` [status: Found ${results.length} relevant context parts.] `,
      });

      return results;
    },
  });
