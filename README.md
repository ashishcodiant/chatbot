# Looply AI Agent POC

Looply AI is a production-style business assistant built on top of the Vercel Chatbot template. It combines chat, tool calling, memory, RAG over uploaded PDFs, campaign generation, SES delivery, and background analytics in one Next.js app.

## What This POC Covers

- Customer, product, transaction, campaign, campaign log, and customer metrics tables
- Multi-tool agent flows for customer analysis and campaigns
- Multi-layer memory:
  - short-term conversation carryover
  - long-term structured user memory
  - emulative memory for response style
  - analytical memory via `customer_metrics`
- RAG over uploaded PDF documents using pgvector-compatible embeddings
- AWS SES campaign sending with DB logging
- Streaming chat responses with intermediate status updates
- Background analytics job entrypoints

## Architecture Overview

### App layer

- Next.js App Router handles chat UI, API routes, auth, and server actions
- Chat streaming is implemented in [app/(chat)/api/chat/route.ts](app/(chat)/api/chat/route.ts)
- File uploads are handled by [app/(chat)/api/files/upload/route.ts](app/(chat)/api/files/upload/route.ts)
- Scheduled analytics can be triggered through [app/api/jobs/analytics/route.ts](app/api/jobs/analytics/route.ts)

### AI layer

- Main chat orchestration lives in [app/(chat)/api/chat/route.ts](app/(chat)/api/chat/route.ts)
- Prompt and memory injection live in [lib/ai/prompts.ts](lib/ai/prompts.ts)
- Business tools live in:
  - [lib/ai/tools/looply.ts](lib/ai/tools/looply.ts)
  - [lib/ai/tools/rag.ts](lib/ai/tools/rag.ts)
  - [lib/ai/tools/memory.ts](lib/ai/tools/memory.ts)

### Data layer

- Drizzle schema is defined in [lib/db/schema.ts](lib/db/schema.ts)
- General chatbot queries live in [lib/db/queries.ts](lib/db/queries.ts)
- Looply-specific business queries live in [lib/db/looply-queries.ts](lib/db/looply-queries.ts)
- Migrations live in [lib/db/migrations](lib/db/migrations)

### Jobs and integrations

- Customer analytics job logic lives in [lib/jobs/analytics.ts](lib/jobs/analytics.ts)
- SES client config lives in [lib/ses-client.ts](lib/ses-client.ts)
- Manual scripts live in [scripts](scripts)

## Schema Design

### Core Looply tables

- `Customer`: customer identity and ownership
- `Product`: catalog items and ownership
- `Transaction`: purchase records
- `Campaign`: marketing drafts and send state
- `CampaignLog`: per-recipient send results
- `CustomerMetrics`: precomputed LTV, churn risk, recency, frequency
- `DocumentChunk`: embedded PDF chunks for semantic retrieval

### Memory storage

- User memory is stored in `User.preferences`
- The memory object currently includes:
  - `profile`
  - `shortTerm`
  - `longTerm`
  - `emulative`

### Notes

- `DocumentChunk` references the versioned `Document` record using `(documentId, documentCreatedAt)`
- `customer_metrics` is the analytical memory layer used for cached business insights

## Agent Flow

### Campaign flow

Typical flow for a request like "find inactive customers and send them a discount email":

1. Identify the intent from the user message.
2. Call `getChurnRiskCustomers`.
3. Draft content with `createCampaign`.
4. Ask for confirmation before sending.
5. Send via `sendCampaign`.
6. Log per-recipient results in `CampaignLog`.

### RAG flow

1. User uploads a PDF.
2. The PDF is stored in Blob storage.
3. On send, the chat route auto-indexes the PDF:
   - parse text
   - chunk text
   - generate embeddings
   - store chunks in `DocumentChunk`
4. Later questions use `searchKnowledgeBase` to retrieve relevant chunks.

### Memory flow

1. User messages update short-term and long-term memory.
2. Stable facts like names and business context are extracted and persisted.
3. Memory is injected into the system prompt on future requests.

## Local Setup

### Prerequisites

- Node.js 20+
- Postgres with pgvector enabled
- Vercel Blob credentials
- OpenAI API key for embeddings
- AWS SES credentials for campaign sending

### Environment

Copy [.env.example](.env.example) to `.env.local` and fill in:

- `AUTH_SECRET`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`
- `AI_GATEWAY_API_KEY`
- `OPENAI_API_KEY`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SES_SENDER_EMAIL`
- `CRON_SECRET`

### Install and run

```bash
npm install
npm run db:migrate
npm run dev
```

### Run analytics manually

```bash
npm run analytics:run
```

### Trigger analytics endpoint

```bash
curl -X POST http://localhost:3000/api/jobs/analytics \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Supported Example Prompts

- `Who are my top 10 customers?`
- `Which customers haven't purchased in 60 days?`
- `What is the lifetime value of customer <id>?`
- `Create a re-engagement campaign for inactive customers`
- `Send that campaign`
- `What does our refund policy say?`

## Current Notes

- PDF upload and indexing is now supported through the chat composer
- The analytics job is schedulable through an API route, but actual deployment scheduling still needs to be configured in your hosting platform
- SES requires a verified sender and, in sandbox accounts, verified recipients
