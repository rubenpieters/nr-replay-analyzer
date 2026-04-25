import type { ParsedReplay } from "./analyzer.js";

const ANON = "<anonymized>";

export function anonymizeRawJson(text: string, corpName: string, runnerName: string): string {
  let result = text;
  for (const name of [corpName, runnerName]) {
    if (!name) continue;
    result = result.split(name).join(ANON);
  }
  return result;
}

export function anonymizeParsed(data: ParsedReplay): ParsedReplay {
  const corpName = data.summary.corp_player;
  const runnerName = data.summary.runner_player;
  const serialized = JSON.stringify(data);

  let result = serialized;
  for (const name of [corpName, runnerName]) {
    if (!name || name === ANON) continue;
    // Use JSON.stringify to get the JSON-escaped form of the name (handles \, ", etc.)
    const jsonEscaped = JSON.stringify(name).slice(1, -1);
    result = result.split(jsonEscaped).join(ANON);
  }

  return JSON.parse(result) as ParsedReplay;
}
