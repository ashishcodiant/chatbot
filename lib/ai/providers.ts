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

export function getLanguageModel(modelId: string) {
  console.log(`[getLanguageModel] Requested model: ${modelId}`);
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // If it's an OpenAI model and we have an API key, use it directly to bypass gateway
  if (modelId.startsWith("openai/") && process.env.OPENAI_API_KEY) {
    console.log(`[getLanguageModel] Using direct OpenAI provider for ${modelId}`);
    return openai(modelId.replace("openai/", ""));
  }

  console.log(`[getLanguageModel] Falling back to Gateway provider for ${modelId} (API Key present: ${!!process.env.OPENAI_API_KEY})`);
  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (titleModel.id.startsWith("openai/") && process.env.OPENAI_API_KEY) {
    return openai(titleModel.id.replace("openai/", ""));
  }

  return gateway.languageModel(titleModel.id);
}
