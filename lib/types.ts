import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { ExecutionEvent } from "@/lib/execution";
import type { createDocument } from "./ai/tools/create-document";
import type { getWeather } from "./ai/tools/get-weather";
import type {
  createCampaign,
  getCampaignLogs,
  getCustomerByReference,
  getCustomerDetails,
  getChurnRiskCustomers,
  getCustomerLTV,
  getTopCustomers,
  sendCampaign,
} from "./ai/tools/looply";
import type { updateUserPreferences } from "./ai/tools/memory";
import type { processDocument, searchKnowledgeBase } from "./ai/tools/rag";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type getTopCustomersTool = InferUITool<ReturnType<typeof getTopCustomers>>;
type getChurnRiskCustomersTool = InferUITool<
  ReturnType<typeof getChurnRiskCustomers>
>;
type getCustomerByReferenceTool = InferUITool<
  ReturnType<typeof getCustomerByReference>
>;
type getCustomerDetailsTool = InferUITool<ReturnType<typeof getCustomerDetails>>;
type getCustomerLTVTool = InferUITool<ReturnType<typeof getCustomerLTV>>;
type createCampaignTool = InferUITool<ReturnType<typeof createCampaign>>;
type getCampaignLogsTool = InferUITool<ReturnType<typeof getCampaignLogs>>;
type sendCampaignTool = InferUITool<ReturnType<typeof sendCampaign>>;
type processDocumentTool = InferUITool<ReturnType<typeof processDocument>>;
type searchKnowledgeBaseTool = InferUITool<
  ReturnType<typeof searchKnowledgeBase>
>;
type updateUserPreferencesTool = InferUITool<
  ReturnType<typeof updateUserPreferences>
>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  getTopCustomers: getTopCustomersTool;
  getChurnRiskCustomers: getChurnRiskCustomersTool;
  getCustomerByReference: getCustomerByReferenceTool;
  getCustomerDetails: getCustomerDetailsTool;
  getCustomerLTV: getCustomerLTVTool;
  createCampaign: createCampaignTool;
  getCampaignLogs: getCampaignLogsTool;
  sendCampaign: sendCampaignTool;
  processDocument: processDocumentTool;
  searchKnowledgeBase: searchKnowledgeBaseTool;
  updateUserPreferences: updateUserPreferencesTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type { ExecutionEvent };

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
