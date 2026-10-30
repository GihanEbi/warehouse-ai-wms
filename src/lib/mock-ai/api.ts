/**
 * PUBLIC API of the mock AI layer. Other modules depend on these exports; the implementations live in
 * ./recommendations, ./reports, ./engine and ./kpis. The AI is a deterministic, read-only mock.
 */
export { generateRecommendations, reorderCandidates } from "./recommendations";
export { summarizeReport } from "./reports";
export { processMessage } from "./engine";
export { explainKpis } from "./kpis";
