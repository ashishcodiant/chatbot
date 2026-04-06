const singularCustomerSignals = [/\bcustomer\b/i, /\bclient\b/i];

const singularLookupPatterns = [
  /\bcustomer with the highest spend\b/i,
  /\bcustomer with highest spend\b/i,
  /\bcustomer with the lowest spend\b/i,
  /\bcustomer with lowest spend\b/i,
  /\binactive .* customer with the highest spend\b/i,
  /\binactive .* customer with highest spend\b/i,
  /\bhighest[- ]spend .* customer\b/i,
  /\blowest[- ]spend .* customer\b/i,
  /\bmost recent .* customer\b/i,
  /\bleast recent .* customer\b/i,
  /\bcustomer we just discussed\b/i,
  /\bthat customer\b/i,
  /\bwhich customer\b/i,
];

const pluralListSignals = [
  /\bcustomers\b/i,
  /\btop\s+\d+\b/i,
  /\blist\b/i,
  /\branking\b/i,
  /\brank\b/i,
  /\ball customers\b/i,
  /\btop customers\b/i,
];

const customerDetailsSignals = [
  /\bdetails?\b/i,
  /\bprofile\b/i,
  /\binfo(?:rmation)?\b/i,
  /\btell me about\b/i,
];

const customerMetricSignals = [
  /\bltv\b/i,
  /\blifetime value\b/i,
  /\bvalue\b/i,
  /\bmetrics?\b/i,
  /\banalytics?\b/i,
];

const campaignLogSignals = [
  /\bcampaign logs?\b/i,
  /\bdelivery logs?\b/i,
  /\bstatus\b/i,
  /\bsent\b/i,
  /\bfailed\b/i,
];

const campaignCreateSignals = [
  /\bcreate\b.*\bcampaign\b/i,
  /\bdraft\b.*\bcampaign\b/i,
  /\bwrite\b.*\bcampaign\b/i,
];

const campaignSendSignals = [
  /\bsend\b.*\bcampaign\b/i,
  /\bdeliver\b.*\bcampaign\b/i,
  /\bemail\b.*\bcustomer\b/i,
];

const segmentSignals = [/\binactive\b/i, /\bchurn\b/i, /\bat risk\b/i];
const rankingSignals = [/\btop\b/i, /\bhighest\b/i, /\bbest\b/i];

const weatherSignals = [
  /\bweather\b/i,
  /\bforecast\b/i,
  /\btemperature\b/i,
  /\bhumidity\b/i,
];

const knowledgeSignals = [
  /\bpolicy\b/i,
  /\bdocument\b/i,
  /\bpdf\b/i,
  /\bknowledge base\b/i,
];

const artifactSignals = [
  /\bcreate\b.*\b(document|report|sheet|spreadsheet|csv|file|script|code)\b/i,
  /\bwrite\b.*\b(document|report|sheet|spreadsheet|csv|script|code)\b/i,
  /\bedit\b.*\b(document|report|sheet|spreadsheet|csv|script|code)\b/i,
  /\bupdate\b.*\b(document|report|sheet|spreadsheet|csv|script|code)\b/i,
  /\bsuggestions?\b/i,
];

const multiToolSignals = [
  /\band\b/i,
  /\balso\b/i,
  /\bthen\b/i,
  /\bafter that\b/i,
  /\bfollow(?:ed)? by\b/i,
  /\busing that\b/i,
  /\bbased on that\b/i,
  /\balong with\b/i,
  /\bplus\b/i,
];

const baseTools = [
  "getWeather",
  "createDocument",
  "editDocument",
  "updateDocument",
  "requestSuggestions",
  "getTopCustomers",
  "getChurnRiskCustomers",
  "getCustomerByReference",
  "getCustomerDetails",
  "getCustomerLTV",
  "createCampaign",
  "getCampaignLogs",
  "sendCampaign",
  "processDocument",
  "searchKnowledgeBase",
  "updateUserPreferences",
] as const;

export type ActiveToolName = (typeof baseTools)[number];

export type ToolStrategy = {
  activeTools: ActiveToolName[];
  maxSteps: number;
  orchestrationPrompt: string;
};

function hasPatternMatch(
  query: string,
  patterns: readonly RegExp[]
): boolean {
  return patterns.some((pattern) => pattern.test(query));
}

function dedupeTools(tools: ActiveToolName[]) {
  return [...new Set(tools)] as ActiveToolName[];
}

function getDefaultStrategy(): ToolStrategy {
  return {
    activeTools: [...baseTools],
    maxSteps: 5,
    orchestrationPrompt: "",
  };
}

export function isSingleCustomerLookupQuery(query?: string | null) {
  if (!query) {
    return false;
  }

  const normalized = query.trim();

  if (!normalized) {
    return false;
  }

  if (hasPatternMatch(normalized, pluralListSignals)) {
    return false;
  }

  if (hasPatternMatch(normalized, singularLookupPatterns)) {
    return true;
  }

  const hasSingularSignal = hasPatternMatch(normalized, singularCustomerSignals);
  const hasRankingSignal =
    /\b(highest|lowest|best|top|most|least)\b/i.test(normalized);

  return hasSingularSignal && hasRankingSignal;
}

function buildOrchestrationPrompt(query: string, activeTools: ActiveToolName[]) {
  const promptLines = [
    "**Dynamic Tool Strategy:**",
    `- Active tools for this request: ${activeTools.join(", ")}.`,
    "- Multi-tool calling is allowed for business/data tools when the request needs more than one step.",
    "- Chain tools sequentially. Use IDs, names, or resolved entities from one tool as inputs to the next tool.",
    "- Prefer one final integrated answer after the tool chain completes.",
    "- If an earlier tool succeeds and a later tool fails, keep the successful result, explain the blocked follow-up briefly, and do not show internal validation or routing messages.",
  ];

  if (isSingleCustomerLookupQuery(query)) {
    promptLines.push(
      "- This is a singular customer lookup. Use getCustomerByReference, not getTopCustomers."
    );
  }

  if (
    hasPatternMatch(query, customerMetricSignals) &&
    (hasPatternMatch(query, singularCustomerSignals) ||
      hasPatternMatch(query, customerDetailsSignals))
  ) {
    promptLines.push(
      "- When the user wants one customer's metrics or LTV, first identify the customer with getCustomerByReference or getCustomerDetails, then call getCustomerLTV with the returned customer.id."
    );
  }

  if (
    hasPatternMatch(query, campaignLogSignals) &&
    hasPatternMatch(query, singularCustomerSignals)
  ) {
    promptLines.push(
      "- When the user wants one customer's campaign history or delivery status, first resolve the customer, then call getCampaignLogs with that customerId."
    );
  }

  if (
    hasPatternMatch(query, campaignCreateSignals) &&
    (hasPatternMatch(query, segmentSignals) ||
      hasPatternMatch(query, rankingSignals))
  ) {
    promptLines.push(
      "- For campaign drafting against a segment, identify the audience first with getChurnRiskCustomers or getTopCustomers, then create the draft with createCampaign."
    );
  }

  if (hasPatternMatch(query, campaignSendSignals)) {
    promptLines.push(
      "- Only call sendCampaign after the campaign target is resolved. If the user wants one specific customer, resolve that customer first and pass customerId into sendCampaign."
    );
  }

  if (hasPatternMatch(query, knowledgeSignals)) {
    promptLines.push(
      "- If the question depends on uploaded documents or business policies, include searchKnowledgeBase in the chain before answering."
    );
  }

  return promptLines.join("\n");
}

export function getToolStrategyForQuery(query?: string | null): ToolStrategy {
  if (!query?.trim()) {
    return getDefaultStrategy();
  }

  const normalized = query.trim();
  const isMultiToolQuery = hasPatternMatch(normalized, multiToolSignals);
  const asksForWeather = hasPatternMatch(normalized, weatherSignals);
  const asksForKnowledge = hasPatternMatch(normalized, knowledgeSignals);
  const asksForArtifact = hasPatternMatch(normalized, artifactSignals);
  const asksForCustomerDetails = hasPatternMatch(
    normalized,
    customerDetailsSignals
  );
  const asksForCustomerMetrics = hasPatternMatch(
    normalized,
    customerMetricSignals
  );
  const asksForCampaignLogs = hasPatternMatch(normalized, campaignLogSignals);
  const asksToCreateCampaign = hasPatternMatch(
    normalized,
    campaignCreateSignals
  );
  const asksToSendCampaign = hasPatternMatch(normalized, campaignSendSignals);
  const asksForCustomers = hasPatternMatch(normalized, singularCustomerSignals);
  const asksForChurn = hasPatternMatch(normalized, segmentSignals);
  const asksForRanking =
    /\b(top|highest|lowest|best|most|least|ranking|rank)\b/i.test(normalized);
  const asksForPluralList = hasPatternMatch(normalized, pluralListSignals);

  if (asksForArtifact && !isMultiToolQuery) {
    const activeTools = dedupeTools([
      "createDocument",
      "editDocument",
      "updateDocument",
      "requestSuggestions",
      "updateUserPreferences",
    ]);

    return {
      activeTools,
      maxSteps: 3,
      orchestrationPrompt: buildOrchestrationPrompt(normalized, activeTools),
    };
  }

  if (asksForWeather && !isMultiToolQuery && !asksForCustomers) {
    const activeTools = dedupeTools(["getWeather", "updateUserPreferences"]);

    return {
      activeTools,
      maxSteps: 3,
      orchestrationPrompt: buildOrchestrationPrompt(normalized, activeTools),
    };
  }

  if (asksForKnowledge && !isMultiToolQuery && !asksForCustomers) {
    const activeTools = dedupeTools([
      "searchKnowledgeBase",
      "processDocument",
      "updateUserPreferences",
    ]);

    return {
      activeTools,
      maxSteps: 4,
      orchestrationPrompt: buildOrchestrationPrompt(normalized, activeTools),
    };
  }

  let activeTools = [...baseTools] as ActiveToolName[];

  if (
    asksForCustomers ||
    asksForCustomerDetails ||
    asksForCustomerMetrics ||
    asksForCampaignLogs ||
    asksToCreateCampaign ||
    asksToSendCampaign
  ) {
    activeTools = dedupeTools([
      "updateUserPreferences",
      "getCustomerByReference",
      "getCustomerDetails",
      ...(asksForPluralList || (!isSingleCustomerLookupQuery(normalized) && asksForRanking)
        ? (["getTopCustomers"] as ActiveToolName[])
        : []),
      ...(asksForChurn ? (["getChurnRiskCustomers"] as ActiveToolName[]) : []),
      ...(asksForCustomerMetrics ? (["getCustomerLTV"] as ActiveToolName[]) : []),
      ...(asksForCampaignLogs ? (["getCampaignLogs"] as ActiveToolName[]) : []),
      ...(asksToCreateCampaign ? (["createCampaign"] as ActiveToolName[]) : []),
      ...(asksToSendCampaign ? (["sendCampaign"] as ActiveToolName[]) : []),
      ...(asksForKnowledge ? (["searchKnowledgeBase"] as ActiveToolName[]) : []),
      ...(asksForWeather ? (["getWeather"] as ActiveToolName[]) : []),
    ]);

    if (activeTools.length <= 2) {
      activeTools = [...baseTools];
    }
  }

  let maxSteps = 5;

  if (isMultiToolQuery || asksForCustomerMetrics || asksForCampaignLogs) {
    maxSteps = 7;
  }

  if (asksToCreateCampaign || asksToSendCampaign) {
    maxSteps = 8;
  }

  if (asksForKnowledge && asksForCustomers) {
    maxSteps = Math.max(maxSteps, 8);
  }

  if (isSingleCustomerLookupQuery(normalized)) {
    activeTools = activeTools.filter(
      (toolName) => toolName !== "getTopCustomers"
    ) as ActiveToolName[];
  }

  return {
    activeTools,
    maxSteps,
    orchestrationPrompt: buildOrchestrationPrompt(normalized, activeTools),
  };
}

export function getActiveToolsForQuery(query?: string | null) {
  return getToolStrategyForQuery(query).activeTools;
}
