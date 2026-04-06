import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "What are the advantages of using Next.js?",
  "Solve x^2 - 5x + 6 = 0 and show each step using LaTeX",
  "Show me the top 10 customers by spend",
  "Find the inactive gmail customer with the highest spend",
  "Write code to demonstrate Dijkstra's algorithm",
  "Explain Bayes' theorem with formulas and a simple example",
  "What is the weather in San Francisco? Show it as a dashboard",
];
