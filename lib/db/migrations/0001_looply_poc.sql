ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "preferences" json;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "Customer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" varchar(255) NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "Product" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "price" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customerId" uuid NOT NULL REFERENCES "Customer"("id"),
  "productId" uuid NOT NULL REFERENCES "Product"("id"),
  "amount" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "segment" text NOT NULL,
  "message" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "CampaignLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaignId" uuid NOT NULL REFERENCES "Campaign"("id"),
  "customerId" uuid NOT NULL REFERENCES "Customer"("id"),
  "status" varchar(20) NOT NULL,
  "error" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "CustomerMetrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customerId" uuid NOT NULL REFERENCES "Customer"("id"),
  "ltv" text NOT NULL DEFAULT '0',
  "churnRisk" text NOT NULL DEFAULT '0',
  "recency" text NOT NULL,
  "frequency" text NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "DocumentChunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "documentId" uuid NOT NULL,
  "documentCreatedAt" timestamp NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  FOREIGN KEY ("documentId", "documentCreatedAt") REFERENCES "Document"("id", "createdAt")
);
