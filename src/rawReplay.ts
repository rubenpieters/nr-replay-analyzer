// Types describing the raw replay JSON as received from jnet.
// The history array has two distinct item formats:
//   history[0]      RawHistoryInitial: a plain object with the initial game state,
//                   whose log array contains RawLogEntry objects directly.
//   history[1..N]   RawHistoryPatch[][]: arrays of patch objects, whose log arrays
//                   use a "+" prefix: ["+", RawLogEntry, "+", RawLogEntry, ...]

// The user object inside a player chat message.
export type RawChatUser = { username: string; emailhash?: string };

// A single entry in a log array: a player chat (user is RawChatUser) or a game event (user is "__system__").
export type RawLogEntry = {
  user: RawChatUser | "__system__";
  text: string;
  timestamp: string;
};

// Items in a patch log array: either the "+" prefix indicator or a log entry.
export type RawLogItem = "+" | RawLogEntry;

// Player identity and account info at the start of the game, nested under corp/runner in history[0].
export type RawPlayerState = {
  user: { username: string };
  identity: { title: string };
  [k: string]: unknown;
};

// The initial game state object at history[0]; its log uses the direct-object format.
export type RawHistoryInitial = {
  log?: RawLogEntry[];
  turn?: number;
  "active-player"?: string;
  corp?: RawPlayerState;
  runner?: RawPlayerState;
  [k: string]: unknown;
};

// A single patch applied to the game state; its log uses the "+" prefix format.
export type RawHistoryPatch = {
  log?: RawLogItem[];
  turn?: number;
  "active-player"?: string;
  corp?: Record<string, unknown>;
  runner?: Record<string, unknown>;
  [k: string]: unknown;
};

// The top-level shape of a raw JSON replay.
export type RawReplay = {
  metadata: Record<string, unknown>;
  history: [RawHistoryInitial, ...RawHistoryPatch[][]];
};

// Iterates log entries from a replay.
export function forEachLogEntry(
  log: RawLogItem[] | undefined,
  callback: (entry: RawLogEntry) => void,
): void {
  if (!log) return;
  let i = 0;
  while (i < log.length) {
    const item = log[i];
    if (item === "+") {
      const next = log[i + 1];
      if (next !== undefined && next !== "+") callback(next as RawLogEntry);
      i += 2;
    } else {
      callback(item as RawLogEntry);
      i += 1;
    }
  }
}
