import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  preferences: json("preferences"), // Long-term user memory
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// --- Looply POC Tables ---

export const customer = pgTable("Customer", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Customer = InferSelectModel<typeof customer>;

export const product = pgTable("Product", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  price: text("price").notNull(), // Numeric as text to avoid precision issues in Drizzle
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Product = InferSelectModel<typeof product>;

export const transaction = pgTable("Transaction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  customerId: uuid("customerId")
    .notNull()
    .references(() => customer.id),
  productId: uuid("productId")
    .notNull()
    .references(() => product.id),
  amount: text("amount").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Transaction = InferSelectModel<typeof transaction>;

export const campaign = pgTable("Campaign", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  segment: text("segment").notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, sending, completed, failed
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Campaign = InferSelectModel<typeof campaign>;

export const campaignLog = pgTable("CampaignLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  campaignId: uuid("campaignId")
    .notNull()
    .references(() => campaign.id),
  customerId: uuid("customerId")
    .notNull()
    .references(() => customer.id),
  status: varchar("status", { length: 20 }).notNull(), // sent, failed
  error: text("error"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type CampaignLog = InferSelectModel<typeof campaignLog>;

export const customerMetrics = pgTable("CustomerMetrics", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  customerId: uuid("customerId")
    .notNull()
    .references(() => customer.id),
  ltv: text("ltv").notNull().default("0"),
  churnRisk: text("churnRisk").notNull().default("0"),
  recency: text("recency").notNull(), // Days since last purchase
  frequency: text("frequency").notNull(), // Number of purchases
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type CustomerMetrics = InferSelectModel<typeof customerMetrics>;

export const documentChunk = pgTable(
  "DocumentChunk",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }), // OpenAI standard
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type DocumentChunk = InferSelectModel<typeof documentChunk>;
