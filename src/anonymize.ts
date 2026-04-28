import type { ParsedReplay } from "./analyzer.js";
import { type RawReplay, type RawLogEntry, forEachLogEntry } from "./rawReplay.js";

const ANON_CORP = "<anonymized-corp>";
const ANON_RUNNER = "<anonymized-runner>";
const ANON_GENERIC = "<anonymized>";

// Redacts the text of a single log entry in place.
function anonymizeLogEntry(entry: RawLogEntry): void {
  const { user } = entry;
  if (typeof user === "object") {
    entry.text = ANON_GENERIC;
  } else if (user === "__system__") {
    // Replace the leading name in spectator join/leave/create messages.
    entry.text = entry.text.replace(
      /^.+? ((?:has )?(?:joined|left|created) the game.*)$/,
      `${ANON_GENERIC} $1`,
    );
  }
}

// Redacts all log entries across every history item.
function anonymizeChatInHistory(history: RawReplay["history"]): void {
  const [initial, ...patches] = history;
  forEachLogEntry(initial.log, anonymizeLogEntry);
  for (const patchArray of patches) {
    for (const patch of patchArray) {
      forEachLogEntry(patch.log, anonymizeLogEntry);
    }
  }
}

// Recursively replaces every emailhash value in the JSON tree with the generic placeholder.
// It traverses the entire replay as raw JSON structure, so it uses unknown as input type.
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

// Anonymizes a raw replay JSON string: redacts emailhashes, chat text, spectator names, and player names.
export function anonymizeRawJson(text: string, corpName: string, runnerName: string): string {
  const data = JSON.parse(text) as RawReplay;
  anonymizeEmailhashes(data);
  anonymizeChatInHistory(data.history);
  let result = JSON.stringify(data);
  if (corpName) result = result.split(corpName).join(ANON_CORP);
  if (runnerName) result = result.split(runnerName).join(ANON_RUNNER);
  return result;
}

// Anonymizes a parsed replay by replacing player names and spectator names throughout.
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

  // Anonymize spectator names in join/leave/create event strings.
  // Negative lookahead avoids re-processing already-anonymized placeholders.
  result = result.replace(
    /"(?!<anonymized)[^"]+? ((?:has )?(?:joined|left|created) the game[^"]*)"/g,
    `"${ANON_GENERIC} $1"`,
  );

  return JSON.parse(result) as ParsedReplay;
}
