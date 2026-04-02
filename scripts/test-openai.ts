import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const key = process.env.OPENAI_API_KEY;
  console.log("Using key starting with:", key?.substring(0, 10));
  
  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: "Hello, are you working?",
    });
    console.log("OpenAI Response:", text);
  } catch (error) {
    console.error("OpenAI Error:", error);
  }
}

main();
