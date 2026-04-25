import type { ParsedReplay } from "./analyzer.js";

const ANON_CORP = "<anonymized-corp>";
const ANON_RUNNER = "<anonymized-runner>";
const ANON_GENERIC = "<anonymized>";

function anonymizeChatInHistory(history: unknown[]): void {
  for (const item of history) {
    if (!Array.isArray(item)) continue;
    for (const entry of item) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const log = (entry as Record<string, unknown>)["log"];
      if (!Array.isArray(log)) continue;
      for (let i = 0; i + 1 < log.length; i++) {
        if (log[i] !== "+") continue;
        const logEntry = log[i + 1] as Record<string, unknown>;
        if (!logEntry || typeof logEntry !== "object") continue;
        const user = logEntry["user"];
        if (!user || typeof user !== "object" || Array.isArray(user)) continue;
        // user is an object => chat message
        logEntry["text"] = ANON_GENERIC;
      }
    }
  }
}

function anonymizeEmailhashes(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) anonymizeEmailhashes(item);
  } else {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key === "emailhash") {
        obj[key] = ANON_GENERIC;
      } else {
        anonymizeEmailhashes(obj[key]);
      }
    }
  }
}

export function anonymizeRawJson(text: string, corpName: string, runnerName: string): string {
  const data = JSON.parse(text) as { history?: unknown[] };
  anonymizeEmailhashes(data);
  if (Array.isArray(data.history)) {
    anonymizeChatInHistory(data.history);
  }
  let result = JSON.stringify(data);
  if (corpName) result = result.split(corpName).join(ANON_CORP);
  if (runnerName) result = result.split(runnerName).join(ANON_RUNNER);
  return result;
}

export function anonymizeParsed(data: ParsedReplay): ParsedReplay {
  const corpName = data.summary.corp_player;
  const runnerName = data.summary.runner_player;
  const serialized = JSON.stringify(data);

  let result = serialized;
  for (const [name, placeholder] of [[corpName, ANON_CORP], [runnerName, ANON_RUNNER]] as const) {
    if (!name || name === ANON_CORP || name === ANON_RUNNER) continue;
    // Use JSON.stringify to get the JSON-escaped form of the name (handles \, ", etc.)
    const jsonEscaped = JSON.stringify(name).slice(1, -1);
    result = result.split(jsonEscaped).join(placeholder);
  }

  return JSON.parse(result) as ParsedReplay;
}
