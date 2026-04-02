import { customProvider, gateway } from "ai";
import { openai } from "@ai-sdk/openai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

function hasGatewayKey() {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function isOpenAiModel(modelId: string) {
  return modelId.startsWith("openai/");
}

function toDirectOpenAiModelId(modelId: string) {
  return modelId.replace("openai/", "");
}

export function getLanguageModel(modelId: string) {
  console.log(`[getLanguageModel] Requested model: ${modelId}`);
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (hasGatewayKey()) {
    console.log(
      `[getLanguageModel] Using AI Gateway as primary provider for ${modelId}`
    );
    return gateway.languageModel(modelId);
  }

  if (isOpenAiModel(modelId) && hasOpenAiKey()) {
    console.log(
      `[getLanguageModel] AI Gateway key missing, using direct OpenAI fallback for ${modelId}`
    );
    return openai(toDirectOpenAiModelId(modelId));
  }

  console.log(
    `[getLanguageModel] Falling back to Gateway provider for ${modelId} without explicit AI_GATEWAY_API_KEY`
  );
  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (hasGatewayKey()) {
    return gateway.languageModel(titleModel.id);
  }

  if (isOpenAiModel(titleModel.id) && hasOpenAiKey()) {
    return openai(toDirectOpenAiModelId(titleModel.id));
  }

  return gateway.languageModel(titleModel.id);
}

export function getEmbeddingModel(modelId: string) {
  if (hasGatewayKey()) {
    return gateway.embedding(modelId);
  }

  if (isOpenAiModel(modelId) && hasOpenAiKey()) {
    return openai.embedding(toDirectOpenAiModelId(modelId));
  }

  return gateway.embedding(modelId);
}
