type RecentChatMemory = {
  chatId: string;
  title: string;
  summary: string;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  updatedAt: string;
};

export type UserMemory = {
  profile: {
    name?: string;
    company?: string;
    role?: string;
    businessType?: string;
  };
  emulative: {
    preferredTone?: string;
    responseStyle: string[];
    doAlways: string[];
    avoid: string[];
  };
  shortTerm: {
    activeChatId?: string;
    activeTopic?: string;
    lastUserMessage?: string;
    lastAssistantMessage?: string;
    updatedAt?: string;
  };
  longTerm: {
    goals: string[];
    notableFacts: string[];
    typicalCampaigns: string[];
    recentChats: RecentChatMemory[];
  };
};

type PartialMemorySection<T> = {
  [K in keyof T]?: T[K] extends Array<infer Item>
    ? Item[]
    : T[K] extends Record<string, unknown>
      ? PartialMemorySection<T[K]>
      : T[K];
};

export type UserMemoryPatch = PartialMemorySection<UserMemory>;

const MAX_RECENT_CHATS = 12;
const MAX_NOTABLE_FACTS = 20;
const MAX_LIST_ITEMS = 12;
const GENERIC_CHAT_TITLES = new Set([
  "new chat",
  "new conversation",
  "chat",
  "conversation",
  "untitled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    )
  );
}

function trimList(values: string[], limit = MAX_LIST_ITEMS) {
  return Array.from(new Set(values)).slice(0, limit);
}

function titleCaseToken(token: string) {
  if (token.length <= 3 && token === token.toUpperCase()) {
    return token;
  }

  if (token.includes(".") || token.includes("+") || token.includes("#")) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function toSentence(text: string, maxLength = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function dedupeRecentChats(chats: RecentChatMemory[]) {
  const seen = new Set<string>();
  const deduped: RecentChatMemory[] = [];

  for (const chat of chats) {
    if (seen.has(chat.chatId)) {
      continue;
    }

    seen.add(chat.chatId);
    deduped.push(chat);
  }

  return deduped.slice(0, MAX_RECENT_CHATS);
}

export function isPlaceholderChatTitle(title: string | null | undefined) {
  const normalized = title?.trim().toLowerCase();
  return !normalized || GENERIC_CHAT_TITLES.has(normalized);
}

export function createFallbackChatTitle(text: string | null | undefined) {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return "New Chat";
  }

  const lower = normalized.toLowerCase();

  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(lower)
  ) {
    return "New Chat";
  }

  if (/what('?s| is) my name/.test(lower)) {
    return "Name Lookup";
  }

  const cleaned = lower
    .replace(
      /^(please|can you|could you|would you|help me|i need|tell me about)\s+/i,
      ""
    )
    .replace(
      /^(what is|what are|how do i|how can i|write|create|build|generate)\s+/i,
      ""
    )
    .replace(/[^\w.+#\s-]/g, " ");

  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "me",
    "my",
    "of",
    "on",
    "please",
    "the",
    "to",
    "what",
    "with",
    "you",
  ]);

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 1 && !stopwords.has(token) && !/^\d+$/.test(token)
    )
    .slice(0, 4);

  if (tokens.length === 0) {
    return "New Chat";
  }

  return tokens.map(titleCaseToken).join(" ");
}

export function normalizeUserMemory(
  rawMemory: unknown,
  userName?: string | null
): UserMemory {
  const raw = isRecord(rawMemory) ? rawMemory : {};
  const rawProfile = isRecord(raw.profile) ? raw.profile : {};
  const rawEmulative = isRecord(raw.emulative) ? raw.emulative : {};
  const rawShortTerm = isRecord(raw.shortTerm) ? raw.shortTerm : {};
  const rawLongTerm = isRecord(raw.longTerm) ? raw.longTerm : {};

  const recentChats = Array.isArray(rawLongTerm.recentChats)
    ? rawLongTerm.recentChats
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }

          const chatId = asString(entry.chatId);
          const title = asString(entry.title);
          const summary = asString(entry.summary);
          const updatedAt = asString(entry.updatedAt);

          if (!chatId || !title || !summary || !updatedAt) {
            return null;
          }

          const recentChat: RecentChatMemory = {
            chatId,
            title,
            summary,
            updatedAt,
            lastUserMessage: asString(entry.lastUserMessage),
            lastAssistantMessage: asString(entry.lastAssistantMessage),
          };

          return recentChat;
        })
        .filter((entry): entry is RecentChatMemory => entry !== null)
    : [];

  return {
    profile: {
      name: asString(rawProfile.name) ?? asString(userName),
      company: asString(rawProfile.company),
      role: asString(rawProfile.role),
      businessType:
        asString(rawProfile.businessType) ?? asString(raw.business_type),
    },
    emulative: {
      preferredTone:
        asString(rawEmulative.preferredTone) ?? asString(raw.preferred_tone),
      responseStyle: asStringArray(rawEmulative.responseStyle),
      doAlways: asStringArray(rawEmulative.doAlways),
      avoid: asStringArray(rawEmulative.avoid),
    },
    shortTerm: {
      activeChatId: asString(rawShortTerm.activeChatId),
      activeTopic: asString(rawShortTerm.activeTopic),
      lastUserMessage: asString(rawShortTerm.lastUserMessage),
      lastAssistantMessage: asString(rawShortTerm.lastAssistantMessage),
      updatedAt: asString(rawShortTerm.updatedAt),
    },
    longTerm: {
      goals: asStringArray(rawLongTerm.goals),
      notableFacts: trimList(
        asStringArray(rawLongTerm.notableFacts).concat(
          asStringArray(raw.notableFacts)
        ),
        MAX_NOTABLE_FACTS
      ),
      typicalCampaigns: trimList(
        asStringArray(rawLongTerm.typicalCampaigns).concat(
          asStringArray(raw.typical_campaigns)
        )
      ),
      recentChats: dedupeRecentChats(recentChats),
    },
  };
}

export function mergeUserMemory(
  memory: UserMemory,
  patch: UserMemoryPatch
): UserMemory {
  return {
    profile: {
      ...memory.profile,
      ...(patch.profile ?? {}),
    },
    emulative: {
      ...memory.emulative,
      ...(patch.emulative ?? {}),
      responseStyle: trimList([
        ...memory.emulative.responseStyle,
        ...((patch.emulative?.responseStyle as string[] | undefined) ?? []),
      ]),
      doAlways: trimList([
        ...memory.emulative.doAlways,
        ...((patch.emulative?.doAlways as string[] | undefined) ?? []),
      ]),
      avoid: trimList([
        ...memory.emulative.avoid,
        ...((patch.emulative?.avoid as string[] | undefined) ?? []),
      ]),
    },
    shortTerm: {
      ...memory.shortTerm,
      ...(patch.shortTerm ?? {}),
    },
    longTerm: {
      ...memory.longTerm,
      ...(patch.longTerm ?? {}),
      goals: trimList([
        ...memory.longTerm.goals,
        ...((patch.longTerm?.goals as string[] | undefined) ?? []),
      ]),
      notableFacts: trimList(
        [
          ...memory.longTerm.notableFacts,
          ...((patch.longTerm?.notableFacts as string[] | undefined) ?? []),
        ],
        MAX_NOTABLE_FACTS
      ),
      typicalCampaigns: trimList([
        ...memory.longTerm.typicalCampaigns,
        ...((patch.longTerm?.typicalCampaigns as string[] | undefined) ?? []),
      ]),
      recentChats: dedupeRecentChats(
        [
          ...((patch.longTerm?.recentChats as RecentChatMemory[] | undefined) ??
            []),
          ...memory.longTerm.recentChats,
        ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      ),
    },
  };
}

export function inferMemoryFromUserMessage(text: string): {
  inferredName?: string;
  memoryPatch: UserMemoryPatch;
} {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized || normalized.includes("?")) {
    return { memoryPatch: {} };
  }

  const explicitNameMatch = normalized.match(
    /(?:my name is|call me|you can call me)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3})/i
  );
  const businessTypeMatch = normalized.match(
    /(?:i run|my business is)\s+(?:an?\s+)?([A-Za-z][A-Za-z\s-]{2,40})/i
  );

  const inferredName = explicitNameMatch?.[1]
    ?.trim()
    ?.replace(/\b\w/g, (character) => character.toUpperCase());

  const notableFacts: string[] = [];

  if (inferredName) {
    notableFacts.push(`User's name is ${inferredName}`);
  }

  const businessType = businessTypeMatch?.[1]?.trim();
  if (businessType) {
    notableFacts.push(`Business context: ${businessType}`);
  }

  return {
    inferredName,
    memoryPatch: {
      profile: {
        ...(inferredName ? { name: inferredName } : {}),
        ...(businessType ? { businessType } : {}),
      },
      longTerm: notableFacts.length > 0 ? { notableFacts } : {},
    },
  };
}

export function recordUserMessageMemory(
  memory: UserMemory,
  {
    chatId,
    title,
    userMessage,
  }: {
    chatId: string;
    title: string;
    userMessage: string;
  }
) {
  const updatedAt = new Date().toISOString();
  const summary = toSentence(userMessage, 140);

  return mergeUserMemory(memory, {
    shortTerm: {
      activeChatId: chatId,
      activeTopic: title,
      lastUserMessage: summary,
      updatedAt,
    },
    longTerm: {
      recentChats: [
        {
          chatId,
          title,
          summary,
          lastUserMessage: summary,
          updatedAt,
        },
      ],
    },
  });
}

export function recordAssistantMessageMemory(
  memory: UserMemory,
  {
    chatId,
    title,
    assistantMessage,
  }: {
    chatId: string;
    title: string;
    assistantMessage: string;
  }
) {
  const updatedAt = new Date().toISOString();
  const summary = toSentence(assistantMessage, 160);
  const existingChat = memory.longTerm.recentChats.find(
    (recentChat) => recentChat.chatId === chatId
  );

  return mergeUserMemory(memory, {
    shortTerm: {
      activeChatId: chatId,
      activeTopic: title,
      lastAssistantMessage: summary,
      updatedAt,
    },
    longTerm: {
      recentChats: [
        {
          chatId,
          title,
          summary: existingChat?.lastUserMessage
            ? `${existingChat.lastUserMessage} | ${summary}`
            : summary,
          lastUserMessage: existingChat?.lastUserMessage,
          lastAssistantMessage: summary,
          updatedAt,
        },
      ],
    },
  });
}

export function renameRecentChatMemory(
  memory: UserMemory,
  {
    chatId,
    title,
  }: {
    chatId: string;
    title: string;
  }
) {
  return {
    ...memory,
    shortTerm:
      memory.shortTerm.activeChatId === chatId
        ? { ...memory.shortTerm, activeTopic: title }
        : memory.shortTerm,
    longTerm: {
      ...memory.longTerm,
      recentChats: memory.longTerm.recentChats.map((recentChat) =>
        recentChat.chatId === chatId ? { ...recentChat, title } : recentChat
      ),
    },
  };
}

export function buildUserMemoryContext(memory: UserMemory) {
  const sections: string[] = [];

  if (
    memory.profile.name ||
    memory.profile.company ||
    memory.profile.role ||
    memory.profile.businessType
  ) {
    sections.push(
      [
        "Profile:",
        memory.profile.name ? `- Name: ${memory.profile.name}` : null,
        memory.profile.company ? `- Company: ${memory.profile.company}` : null,
        memory.profile.role ? `- Role: ${memory.profile.role}` : null,
        memory.profile.businessType
          ? `- Business type: ${memory.profile.businessType}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (
    memory.emulative.preferredTone ||
    memory.emulative.responseStyle.length > 0 ||
    memory.emulative.doAlways.length > 0 ||
    memory.emulative.avoid.length > 0
  ) {
    sections.push(
      [
        "Emulative memory:",
        memory.emulative.preferredTone
          ? `- Preferred tone: ${memory.emulative.preferredTone}`
          : null,
        memory.emulative.responseStyle.length > 0
          ? `- Response style: ${memory.emulative.responseStyle.join(", ")}`
          : null,
        memory.emulative.doAlways.length > 0
          ? `- Always do: ${memory.emulative.doAlways.join(", ")}`
          : null,
        memory.emulative.avoid.length > 0
          ? `- Avoid: ${memory.emulative.avoid.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (
    memory.shortTerm.activeTopic ||
    memory.shortTerm.lastUserMessage ||
    memory.shortTerm.lastAssistantMessage
  ) {
    sections.push(
      [
        "Short-term carryover:",
        memory.shortTerm.activeTopic
          ? `- Current topic: ${memory.shortTerm.activeTopic}`
          : null,
        memory.shortTerm.lastUserMessage
          ? `- Last user note: ${memory.shortTerm.lastUserMessage}`
          : null,
        memory.shortTerm.lastAssistantMessage
          ? `- Last assistant note: ${memory.shortTerm.lastAssistantMessage}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (
    memory.longTerm.goals.length > 0 ||
    memory.longTerm.notableFacts.length > 0 ||
    memory.longTerm.typicalCampaigns.length > 0 ||
    memory.longTerm.recentChats.length > 0
  ) {
    sections.push(
      [
        "Long-term memory:",
        memory.longTerm.goals.length > 0
          ? `- Goals: ${memory.longTerm.goals.join(", ")}`
          : null,
        memory.longTerm.notableFacts.length > 0
          ? `- Important facts: ${memory.longTerm.notableFacts.join("; ")}`
          : null,
        memory.longTerm.typicalCampaigns.length > 0
          ? `- Typical campaigns: ${memory.longTerm.typicalCampaigns.join(", ")}`
          : null,
        memory.longTerm.recentChats.length > 0
          ? `- Recent chats: ${memory.longTerm.recentChats
              .slice(0, 6)
              .map(
                (recentChat) => `${recentChat.title} (${recentChat.summary})`
              )
              .join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return sections.join("\n\n");
}
