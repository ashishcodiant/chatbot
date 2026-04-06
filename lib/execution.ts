import type { ChatMessage } from "@/lib/types";

export type ExecutionEvent = {
  id: string;
  action: string;
  detail?: string;
  tool?: string;
  kind: "lifecycle" | "status" | "error";
  timestamp: string;
};

const toolNameMap: Record<string, string> = {
  "tool-getWeather": "Weather Tool",
  "tool-getTopCustomers": "Customer Ranking Tool",
  "tool-getChurnRiskCustomers": "Churn Risk Tool",
  "tool-getCustomerByReference": "Customer Lookup Tool",
  "tool-getCustomerDetails": "Customer Profile Tool",
  "tool-getCustomerLTV": "Customer Analytics Tool",
  "tool-createCampaign": "Campaign Tool",
  "tool-getCampaignLogs": "Campaign Logs Tool",
  "tool-sendCampaign": "Campaign Delivery Tool",
  "tool-processDocument": "Document Processing Tool",
  "tool-searchKnowledgeBase": "Knowledge Base Tool",
  "tool-updateUserPreferences": "Memory Tool",
  "tool-createDocument": "Document Tool",
  "tool-editDocument": "Document Edit Tool",
  "tool-updateDocument": "Document Rewrite Tool",
  "tool-requestSuggestions": "Suggestion Tool",
};

const toolStatusKeywords: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /weather/i, tool: "Weather Tool" },
  { pattern: /top customers|customer ranking/i, tool: "Customer Ranking Tool" },
  { pattern: /churn risk|inactive customers/i, tool: "Churn Risk Tool" },
  { pattern: /customer.*reference|resolved customer|customer lookup/i, tool: "Customer Lookup Tool" },
  { pattern: /ltv|lifetime value|customer analytics/i, tool: "Customer Analytics Tool" },
  { pattern: /campaign delivery logs|delivery logs/i, tool: "Campaign Logs Tool" },
  { pattern: /campaign draft|send campaign|sending to/i, tool: "Campaign Tool" },
  { pattern: /knowledge base|pdf|document/i, tool: "Knowledge Base Tool" },
  { pattern: /memory|preferences/i, tool: "Memory Tool" },
];

export function getToolDisplayName(type: string) {
  return toolNameMap[type] ?? type.replace(/^tool-/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function inferToolFromStatus(action: string) {
  const match = toolStatusKeywords.find(({ pattern }) => pattern.test(action));
  return match?.tool;
}

export function parseExecutionEventFromTextDelta(text: string) {
  const match = text.match(/^\s*\[(status|error):\s*([\s\S]*?)\]\s*$/i);

  if (!match) {
    return null;
  }

  const [, label, rawMessage] = match;
  const action = rawMessage.trim();

  if (!action) {
    return null;
  }

  return {
    action,
    detail:
      label.toLowerCase() === "error"
        ? "The system reported an execution issue."
        : "Live system activity from the current response.",
    kind: label.toLowerCase() === "error" ? ("error" as const) : ("status" as const),
    tool: inferToolFromStatus(action),
  };
}

export type ToolActivityPart = {
  type: string;
  state: string;
  toolCallId?: string;
};

export function getToolParts(message?: ChatMessage): ToolActivityPart[] {
  if (!message) {
    return [];
  }

  return message.parts.flatMap((part) => {
    if ( 
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      "state" in part &&
      typeof part.state === "string"
    ) {
      return [
        {
          type: part.type,
          state: part.state,
          toolCallId:
            "toolCallId" in part && typeof part.toolCallId === "string"
              ? part.toolCallId
              : undefined,
        },
      ];
    }

    return [];
  });
}
