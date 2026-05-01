import { type RawReplay, type RawLogItem, forEachLogEntry } from "./rawReplay.js";
import { type CardDb } from "./cardDb.js";

// -- Types --

// A parsed game action performed during a click (install, play, ability, etc.).
export interface Action {
  type: string;
  card?: string | null;
  cost?: number;
  // TODO: split this up into different types
  // and only allow the relevant fields for those actions
  location?: string;       // install_ice / install / advance: target server or zone
  host_ice?: string;       // install: ice the card is hosted on
  server?: string;         // run: server targeted
  effect?: string;         // ability: description of what the ability does
  trash?: string;          // ability: card trashed to pay for the ability
  target?: string;         // advance: card being advanced
  tags_removed?: number;   // play: tags spent as part of the cost
  count?: number;          // draw / remove_tag: number of cards or tags
  amount?: number;         // gain_credits: credits gained
  raw?: string;            // unknown: the raw log line that could not be parsed
}

// Credit and card-draw side-effects that occurred during a click.
export interface Effects {
  credits_paid?: number;
  credits_from_resources?: Record<string, number>;
  credits_gained?: number;
  triggered_gains?: Record<string, number>;
  cards_drawn?: number;
}

// Click classification used for economy bucketing.
export type ClickBucket = "basic" | "economy" | "run" | "setup" | "impactful" | "tempo";

// All events, action, and effects that happened within a single player click.
export interface ClickGroup {
  click: number;
  events: string[];
  action?: Action;
  effects?: Effects;
  bucket?: ClickBucket;
  breach_hq_snapshot?: ZoneSnapshot;
  breach_rd_snapshot?: ZoneSnapshot;
}

// Card counts and agenda state for a server zone at the moment of a breach.
export interface ZoneSnapshot {
  total: number;
  agenda_cards: number;
  agenda_points: number;
}

// Identity and agenda points of a single card, captured at end-of-turn.
export interface CardSnapshot {
  title: string;
  type: string;
  agenda_points?: number;
}

// Both players' hands captured at the end of a turn.
export interface HandSnapshot {
  corp: CardSnapshot[];
  runner: CardSnapshot[];
}

// Agenda points for a single zone, captured at the start of a turn.
export interface AgendaZoneInfo {
  agenda_points: number;
}

// Agenda distribution across all zones, captured at the start of each turn.
export interface AgendaTurnSnapshot {
  corp_hand: AgendaZoneInfo;
  corp_deck: AgendaZoneInfo;
  corp_discard: AgendaZoneInfo;
  corp_board: AgendaZoneInfo;
  corp_scored: AgendaZoneInfo;
  runner_scored: AgendaZoneInfo;
}

// One full turn (or between-turn phase) with its ordered list of click groups.
export interface Turn {
  turn: number;
  player?: string;
  clicks: ClickGroup[];
  hand_snapshot?: HandSnapshot;
  agenda_snapshot?: AgendaTurnSnapshot;
}

// Install count and total credit cost for a card played during setup.
export interface SetupCardEntry {
  count: number;
  total_cost: number;
}

// Aggregated economy stats for a single card across the whole game.
export interface CardEconEntry {
  uses: number;
  clicks: number;
  total_credits_gained: number;
  total_cost: number;
  total_net_credits: number;
  total_cards_drawn: number;
  credits_per_click?: number;
  run?: true;
}

// The result of accessing a single card during a run.
export interface AccessEntry {
  name?: string;   // undefined = unseen card (R&D/HQ)
  outcome: "stolen" | "trashed" | "seen";
}

// A single run attempt with its outcome and any cards accessed.
export interface RunEntry {
  turn: number;
  click: number;
  server: string;
  successful: boolean;
  card?: string;
  accessed?: AccessEntry[];
  hq_snapshot?: ZoneSnapshot;
  rd_snapshot?: ZoneSnapshot;
}

// Economy statistics for one player across the whole game.
export interface PlayerEcon {
  basic_clicks: number;
  economy_clicks?: number;
  run_clicks?: number;
  setup_clicks?: number;
  econ_click_ratio?: number;
  avg_net_credits_per_econ_click?: number;
  avg_cards_drawn_per_econ_click?: number;
  impactful_clicks?: number;
  tempo_clicks?: number;
  total_econ_clicks?: number;
  basic_econ_ratio?: number;
  setup_cards?: Record<string, SetupCardEntry>;
  total_setup_cost?: number;
  cards: Record<string, CardEconEntry>;
  runs?: RunEntry[];
}

// Economy statistics for both players.
export interface Economy {
  corp: PlayerEcon;
  runner: PlayerEcon;
}

// High-level metadata about the game outcome.
export interface Summary {
  corp_player: string;
  corp_identity: string;
  runner_player: string;
  runner_identity: string;
  turns: number;
  winner: string;
  win_reason: string;
  corp_agenda_points: number;
  runner_agenda_points: number;
}

// Action count broken down by card, for actions where the card identity matters.
export type PerCardBucket = { total: number; by_card: Record<string, number> };

// Per-action-type totals for one player: either a simple count or a per-card breakdown.
export type ActionTotals = Record<string, number | PerCardBucket>;

// Action totals for both players, keyed by "corp" and "runner".
export type ActionSummary = { corp: ActionTotals; runner: ActionTotals };

// The fully parsed and analysed form of a replay.
export interface ParsedReplay {
  summary: Summary;
  action_summary: ActionSummary;
  economy: Economy;
  turns: Turn[];
}

// -- Log extraction --

function extractLogTexts(log: RawLogItem[] | undefined): string[] {
  const texts: string[] = [];
  forEachLogEntry(log, (entry) => {
    if (entry.text && entry.text !== "[hr]") texts.push(entry.text);
  });
  return texts;
}

// -- Action parsing --

function cleanLocation(loc: string): string {
  return loc.replace(/\s*\(.*?\)/g, "").trim();
}

function findRezzedCard(events: string[]): string | null {
  for (const e of events) {
    const m = /to rez (.+?) in /.exec(e);
    if (m) return m[1];
  }
  return null;
}

function findTriggeredEconCard(events: string[]): string | null {
  for (const e of events) {
    if (e.includes("spends [Click]")) continue;
    const m = /use[s]? (.+?) to (?:gain|draw)/.exec(e);
    if (m) return m[1];
  }
  return null;
}

function extractTriggeredGains(events: string[], playerName: string | null): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ev of events) {
    if (ev.includes("spends [Click]")) continue;
    const lineOwner = ev.split(/\s/)[0] ?? "";
    if (playerName && lineOwner !== playerName) continue;
    const m = /uses? (.+?) to gain (\d+) \[Credits?\]/.exec(ev);
    if (m) {
      const card = m[1];
      const amount = parseInt(m[2], 10);
      result[card] = (result[card] ?? 0) + amount;
    }
  }
  return result;
}

function parseClickAction(events: string[]): Action | null {
  const clickEvent = events.find((e) => e.includes("spends [Click]"));
  if (!clickEvent) return null;

  const rest = clickEvent.replace(/^.+?spends \[Click\]/, "").trim();

  // Credit cost: sum all "X [Credits]" amounts before "to gain" or "to use"
  const costPart = rest.split(/\bto (?:gain|use\b)/)[0];
  let cost = 0;
  for (const m of costPart.matchAll(/(\d+) \[Credits?\]/g)) {
    cost += parseInt(m[1], 10);
  }

  // 1. Trash-to-use
  let m = /and trashes (.+?) to use (.+?) to (.+?)\./.exec(rest);
  if (m) {
    return { type: "ability", card: m[2], effect: m[3].trim(), trash: m[1] };
  }

  // 2. Play with tag cost
  m = /removes (\d+) tags? to play (.+?)\./.exec(rest);
  if (m) {
    return { type: "play", card: m[2], cost, tags_removed: parseInt(m[1], 10) };
  }

  // 3. Play
  m = /to play (.+)\./.exec(rest);
  if (m) {
    return { type: "play", card: m[1], cost };
  }

  // 4. Install ice
  m = /to install ice protecting (.+?)\./.exec(rest);
  if (m) {
    return { type: "install_ice", location: cleanLocation(m[1]), cost };
  }

  // 5. Install on ice host
  m = /to install (.+?) on ice protecting (.+?) at position \d+\./.exec(rest);
  if (m) {
    return { type: "install", card: m[1], host_ice: cleanLocation(m[2]), cost };
  }

  // 6. Face-down install
  m = /to install a card in the root of (.+?)\./.exec(rest);
  if (m) {
    const location = cleanLocation(m[1]);
    const card = findRezzedCard(events);
    return { type: "install", card, location, cost };
  }

  // 7. Named install
  m = /to install (.+)\./.exec(rest);
  if (m) {
    return { type: "install", card: m[1], cost };
  }

  // 8. Run
  m = /to make a run on (.+?)\./.exec(rest);
  if (m) {
    return { type: "run", server: m[1] };
  }

  // 9. Corp basic action: advance
  m = /to use Corp Basic Action Card to advance (.+?) in (.+?)\./.exec(rest);
  if (m) {
    return { type: "advance", target: m[1], location: cleanLocation(m[2]), cost };
  }

  // 10. Corp basic action: trash
  m = /to use Corp Basic Action Card to trash (.+?)\./.exec(rest);
  if (m) {
    return { type: "trash", card: m[1], cost };
  }

  // 11. Basic action: draw
  m = /to use (?:Runner|Corp) Basic Action Card to draw (\d+) card/.exec(rest);
  if (m) {
    return { type: "draw", count: parseInt(m[1], 10) };
  }

  // 12. Basic action: gain credits
  m = /to use (?:Runner|Corp) Basic Action Card to gain (\d+) \[Credits\]/.exec(rest);
  if (m) {
    return { type: "gain_credits", amount: parseInt(m[1], 10) };
  }

  // 13. Runner basic action: remove tag
  m = /to use Runner Basic Action Card to remove (\d+) tags?/.exec(rest);
  if (m) {
    return { type: "remove_tag", count: parseInt(m[1], 10), cost };
  }

  // 14. Generic ability
  m = /to use (.+?) to (.+?)\./.exec(rest);
  if (m) {
    return { type: "ability", card: m[1], effect: m[2].trim(), cost };
  }

  return { type: "unknown", raw: clickEvent };
}

// -- Click effects --

function extractCreditsGained(events: string[], playerName: string | null = null): number {
  let total = 0;
  for (const ev of events) {
    const lineOwner = ev.split(/\s/)[0] ?? "";
    const isOwnLine = playerName === null || lineOwner === playerName;
    if (isOwnLine) {
      for (const m of ev.matchAll(/gain(?:s)? (\d+) \[Credits?\]/g)) {
        total += parseInt(m[1], 10);
      }
    }
  }
  return total;
}

function extractCardsDrawn(events: string[], playerName: string | null = null): number {
  let total = 0;
  for (const ev of events) {
    const lineOwner = ev.split(/\s/)[0] ?? "";
    if (playerName !== null && lineOwner !== playerName) continue;
    // Strip quoted strings (subroutine descriptions) before matching
    const stripped = ev.replace(/"[^"]*"/g, "");
    for (const m of stripped.matchAll(/draw(?:s)? (\d+) cards?/g)) {
      total += parseInt(m[1], 10);
    }
    for (const _m of stripped.matchAll(/draw(?:s)? a card/g)) {
      total += 1;
    }
  }
  return total;
}

function extractResourceCredits(events: string[], playerName: string | null = null): Record<string, number> {
  const resources: Record<string, number> = {};
  for (const ev of events) {
    const lineOwner = ev.split(/\s/)[0] ?? "";
    if (playerName !== null && lineOwner !== playerName) continue;
    for (const m of ev.matchAll(/(?:pays|and) (\d+) \[Credits?\] from ([^,\n]+?)(?=\s+and\s|\s+to\s)/g)) {
      const amount = parseInt(m[1], 10);
      const card = m[2].trim();
      if (card.endsWith("credit pool")) continue;
      resources[card] = (resources[card] ?? 0) + amount;
    }
  }
  return resources;
}

function econCardKey(action: Action, events: string[] = []): string {
  const atype = action.type;
  if (atype === "gain_credits") return "click for credit";
  if (atype === "draw") return "click to draw";
  if (atype === "advance" && events.length > 0) {
    for (const e of events) {
      const m = /scores (.+?) and gains/.exec(e);
      if (m) return m[1];
    }
  }
  return (action.card as string) || "unknown";
}

function computeClickEffects(action: Action, events: string[], playerName: string | null): Effects | null {
  const cost = (action.cost as number) ?? 0;
  const resourceCredits = extractResourceCredits(events, playerName);
  const triggeredGains = extractTriggeredGains(events, playerName);

  const cardKey = econCardKey(action, events);
  const creditsGainedRaw = extractCreditsGained(events, playerName);
  const secondaryCredits = Object.entries(triggeredGains)
    .filter(([k]) => k !== cardKey)
    .reduce((a, [, v]) => a + v, 0);
  const creditsGained = creditsGainedRaw - secondaryCredits;

  const cardsDrawn = extractCardsDrawn(events, playerName);
  const secondaryGains: Record<string, number> = Object.fromEntries(
    Object.entries(triggeredGains).filter(([k]) => k !== cardKey)
  );

  const effects: Effects = {};
  if (cost) effects.credits_paid = cost;
  if (Object.keys(resourceCredits).length > 0) effects.credits_from_resources = resourceCredits;
  if (creditsGained) effects.credits_gained = creditsGained;
  if (Object.keys(secondaryGains).length > 0) effects.triggered_gains = secondaryGains;
  if (cardsDrawn) effects.cards_drawn = cardsDrawn;

  return Object.keys(effects).length > 0 ? effects : null;
}

function computeSotEffects(events: string[], playerName: string | null): Effects | null {
  const triggeredGains = extractTriggeredGains(events, playerName);
  let cardsDrawn = extractCardsDrawn(events, playerName);

  for (const ev of events) {
    const lineOwner = ev.split(/\s/)[0] ?? "";
    if (playerName && lineOwner !== playerName) continue;
    if (ev.includes("mandatory start of turn draw")) cardsDrawn += 1;
    if (ev.includes("MuslihaT") && ev.includes("add it to the grip")) cardsDrawn += 1;
  }

  const effects: Effects = {};
  if (Object.keys(triggeredGains).length > 0) effects.triggered_gains = triggeredGains;
  if (cardsDrawn) effects.cards_drawn = cardsDrawn;

  return Object.keys(effects).length > 0 ? effects : null;
}

const EOT_RE = /\bis ending (?:their|his|her) turn \d+/;

function splitEotEvents(events: string[]): [string[], string[]] {
  for (let i = 0; i < events.length; i++) {
    if (EOT_RE.test(events[i])) {
      return [events.slice(0, i + 1), events.slice(i + 1)];
    }
  }
  return [events, []];
}

function computeEotEffects(events: string[], playerName: string | null): Effects | null {
  const triggeredGains = extractTriggeredGains(events, playerName);
  const cardsDrawn = extractCardsDrawn(events, playerName);

  const effects: Effects = {};
  if (Object.keys(triggeredGains).length > 0) effects.triggered_gains = triggeredGains;
  if (cardsDrawn) effects.cards_drawn = cardsDrawn;

  return Object.keys(effects).length > 0 ? effects : null;
}

// -- Turn / click parser --

export function parseTurns(history: RawReplay["history"], corpName: string, runnerName: string): Turn[] {
  const [initial, ...historyRest] = history;
  const corpInitial = initial.corp;
  const initialDeckSize = (corpInitial?.["deck-count"] as number) ?? 0;
  const initialHandSize = (corpInitial?.["hand-count"] as number) ?? 0;
  const totalCorpAgendaPoints = 18 + 2 * Math.floor((initialDeckSize + initialHandSize - 40) / 5);
  const runnerInitial = initial.runner;
  const state = {
    turn: initial.turn ?? 0,
    activePlayer: initial["active-player"] ?? "corp",
    corpClick: (corpInitial?.["click"] as number) ?? 0,
    runnerClick: (runnerInitial?.["click"] as number) ?? 0,
    corpDeckCount: (corpInitial?.["deck-count"] as number) ?? 0,
    corpHandCount: (corpInitial?.["hand-count"] as number) ?? 99,
    runnerHandCount: (runnerInitial?.["hand-count"] as number) ?? 99,
  };

  function activeClick(): number {
    return state.activePlayer === "corp" ? state.corpClick : state.runnerClick;
  }

  // -- Card registry --
  interface CardRegistryEntry {
    title: string;
    type: string;
    agendaPoints?: number;
    side: string;
    zone: string[];
  }
  const cardRegistry = new Map<string, CardRegistryEntry>();
  const runnerScoredCids = new Set<string>();

  // -- Hand state: positional diff accumulator per player --
  interface HandStateEntry {
    cid?: string;
    title?: string;
    type?: string;
    side?: string;
    zone?: string[];
    agendapoints?: number;
    playable?: boolean;
  }
  const corpHandState: HandStateEntry[] = [];
  const runnerHandState: HandStateEntry[] = [];

  function mergeIntoHandSlot(slot: HandStateEntry, e: Partial<HandStateEntry>): void {
    if (e.cid !== undefined) slot.cid = e.cid;
    if (e.title !== undefined) slot.title = e.title;
    if (e.type !== undefined) slot.type = e.type;
    if (e.side !== undefined) slot.side = e.side;
    if (e.zone !== undefined) slot.zone = e.zone;
    if (e.agendapoints !== undefined) slot.agendapoints = e.agendapoints;
    if (e.playable !== undefined) slot.playable = e.playable;
  }

  // Diff token formats:
  //   (integer N, object): merge object fields into handState[N], return N as touched
  //   ("+", object):       append a new entry, return its index as touched
  //   plain object at index i: flat initial-state format, place at handState[i]
  //   bare integer / other: skip
  // Returns the list of handState positions that were updated.
  // logicalSize = handCount before this diff, so "+" inserts at the correct position
  // instead of at handState.length (which accumulates stale slots from prior turns).
  function applyHandDiff(handState: HandStateEntry[], diff: unknown[], logicalSize: number): number[] {
    const touched: number[] = [];
    let size = logicalSize;
    let i = 0;
    while (i < diff.length) {
      const token = diff[i];
      const next = diff[i + 1];
      if (token === "+") {
        if (next && typeof next === "object" && !Array.isArray(next)) {
          const pos = size;
          if (!handState[pos]) handState[pos] = {};
          mergeIntoHandSlot(handState[pos], next as Partial<HandStateEntry>);
          size++;
          touched.push(pos);
        }
        i += 2;
      } else if (typeof token === "number" && next && typeof next === "object" && !Array.isArray(next)) {
        if (!handState[token]) handState[token] = {};
        mergeIntoHandSlot(handState[token], next as Partial<HandStateEntry>);
        touched.push(token);
        i += 2;
      } else if (token && typeof token === "object" && !Array.isArray(token)) {
        // Flat format: full card object at its position (used in initial game state)
        if (!handState[i]) handState[i] = {};
        mergeIntoHandSlot(handState[i], token as Partial<HandStateEntry>);
        touched.push(i);
        i += 1;
      } else {
        i += 1;
      }
    }
    return touched;
  }

  function scanCardObject(o: Record<string, unknown>, inferSide?: string, inferZone?: string[]): void {
    const cid = o["cid"] as string;
    const existing = cardRegistry.get(cid);
    if (!existing) {
      const newEntry: CardRegistryEntry = {
        title: typeof o["title"] === "string" ? o["title"] : "",
        type: typeof o["type"] === "string" ? o["type"] : "",
        side: typeof o["side"] === "string" ? o["side"] : (inferSide ?? ""),
        zone: Array.isArray(o["zone"]) ? (o["zone"] as string[]) : (inferZone ?? []),
        agendaPoints: typeof o["agendapoints"] === "number" ? o["agendapoints"] : undefined,
      };
      cardRegistry.set(cid, newEntry);
      // Retroactively add newly-revealed hand cards to the most recent turn snapshot,
      // but only when we're in the opponent's phase. Cards first seen during your own
      // phase could be mid-turn draws, not start-of-turn hand members.
      if (newEntry.zone[0] === "hand" && newEntry.title && currentPhase.player !== undefined) {
        const cardSnap: CardSnapshot = { title: newEntry.title, type: newEntry.type };
        if (newEntry.type === "Agenda" && newEntry.agendaPoints !== undefined) cardSnap.agenda_points = newEntry.agendaPoints;
        if (newEntry.side === "Corp" && currentPhase.player !== "corp" &&
            augCorpSnap && augCorpSnap.snap.corp.length < augCorpSnap.maxCount) {
          augCorpSnap.snap.corp.push(cardSnap);
        } else if (newEntry.side === "Runner" && currentPhase.player !== "runner" &&
            augRunnerSnap && augRunnerSnap.snap.runner.length < augRunnerSnap.maxCount) {
          augRunnerSnap.snap.runner.push(cardSnap);
        }
      }
    } else {
      if (typeof o["title"] === "string") existing.title = o["title"];
      if (typeof o["type"] === "string") existing.type = o["type"];
      if (typeof o["side"] === "string") existing.side = o["side"];
      else if (inferSide && !existing.side) existing.side = inferSide;
      if (typeof o["agendapoints"] === "number") existing.agendaPoints = o["agendapoints"];
      // Only update zone from explicit field for existing entries
      if (Array.isArray(o["zone"])) existing.zone = o["zone"] as string[];
    }
  }

  function scanPlayerState(ps: Record<string, unknown>, side: string): void {
    for (const [key, val] of Object.entries(ps)) {
      if (!val || typeof val !== "object") continue;
      if (key === "hand" && Array.isArray(val)) {
        const handState = side === "Corp" ? corpHandState : runnerHandState;
        const logicalSize = side === "Corp" ? state.corpHandCount : state.runnerHandCount;
        const touched = applyHandDiff(handState, val, logicalSize);
        // Scan only the touched positions using the fully merged state.
        // Strip zone so existing registry entries don't get their zone overwritten.
        for (const pos of touched) {
          const merged = handState[pos];
          if (!merged?.cid) continue;
          const { zone: _zone, ...withoutZone } = merged;
          scanCardObject(withoutZone as Record<string, unknown>, side, ["hand"]);
        }
        continue;
      }
      if (key === "scored" && side === "Runner" && Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const cid = (item as Record<string, unknown>)["cid"];
            if (typeof cid === "string") runnerScoredCids.add(cid);
          }
        }
      }
      const inferZone: string[] | undefined =
        key === "deck" ? ["deck"] :
        key === "discard" ? ["discard"] : undefined;
      scanCards(val, side, inferZone);
    }
  }

  function scanCards(obj: unknown, inferSide?: string, inferZone?: string[]): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(el => scanCards(el, inferSide, inferZone));
      return;
    }
    const o = obj as Record<string, unknown>;
    if (typeof o["cid"] === "string") {
      scanCardObject(o, inferSide, inferZone);
      return; // don't recurse into card sub-objects
    }
    // Descend into corp/runner with appropriate side context
    if (o["corp"] && typeof o["corp"] === "object" && !Array.isArray(o["corp"])) {
      scanPlayerState(o["corp"] as Record<string, unknown>, "Corp");
    }
    if (o["runner"] && typeof o["runner"] === "object" && !Array.isArray(o["runner"])) {
      scanPlayerState(o["runner"] as Record<string, unknown>, "Runner");
    }
    // Recurse into other keys (servers content, etc.)
    for (const [k, v] of Object.entries(o)) {
      if (k !== "corp" && k !== "runner" && k !== "abilities" && k !== "subroutines" && k !== "log" && k !== "sfx") {
        scanCards(v, inferSide, inferZone);
      }
    }
  }

  function captureHandSnapshot(): HandSnapshot {
    const corp: CardSnapshot[] = [];
    const runner: CardSnapshot[] = [];
    for (const slot of corpHandState.slice(0, state.corpHandCount)) {
      if (!slot.cid) continue;
      const entry = cardRegistry.get(slot.cid);
      if (!entry?.title) continue;
      const snap: CardSnapshot = { title: entry.title, type: entry.type };
      if (entry.type === "Agenda" && entry.agendaPoints !== undefined) snap.agenda_points = entry.agendaPoints;
      corp.push(snap);
    }
    for (const slot of runnerHandState.slice(0, state.runnerHandCount)) {
      if (!slot.cid) continue;
      const entry = cardRegistry.get(slot.cid);
      if (!entry?.title) continue;
      const snap: CardSnapshot = { title: entry.title, type: entry.type };
      if (entry.type === "Agenda" && entry.agendaPoints !== undefined) snap.agenda_points = entry.agendaPoints;
      runner.push(snap);
    }
    return { corp, runner };
  }

  function agendaPointsNotInDeck(): number {
    let points = 0;
    for (const entry of cardRegistry.values()) {
      if (entry.side !== "Corp" || entry.type !== "Agenda" || !entry.title) continue;
      if (entry.zone[0] !== "deck") points += entry.agendaPoints ?? 0;
    }
    return points;
  }

  function captureZoneSnapshot(zone: string): ZoneSnapshot {
    let total = 0, agenda_cards = 0, agenda_points = 0;
    // For the hand zone use handState directly, registry zones for hand cards can be
    // stale (cards that left the hand aren't always explicitly cleared in the registry).
    if (zone === "hand") {
      for (const slot of corpHandState.slice(0, state.corpHandCount)) {
        if (!slot.cid) continue;
        const entry = cardRegistry.get(slot.cid);
        if (!entry?.title) continue;
        total++;
        if (entry.type === "Agenda") {
          agenda_cards++;
          agenda_points += entry.agendaPoints ?? 0;
        }
      }
      return { total, agenda_cards, agenda_points };
    }
    for (const entry of cardRegistry.values()) {
      if (entry.side !== "Corp" || entry.zone[0] !== zone || !entry.title) continue;
      total++;
      if (entry.type === "Agenda") {
        agenda_cards++;
        agenda_points += entry.agendaPoints ?? 0;
      }
    }
    if (zone === "deck") {
      total = state.corpDeckCount;
      const elsewhere = agendaPointsNotInDeck();
      agenda_points = Math.max(0, totalCorpAgendaPoints - elsewhere);
      // agenda_cards stays as registry count (known agendas in deck)
    }
    return { total, agenda_cards, agenda_points };
  }

  function captureAgendaTurnSnapshot(): AgendaTurnSnapshot {
    const hand = captureZoneSnapshot("hand");
    const deck = captureZoneSnapshot("deck");
    const discard = captureZoneSnapshot("discard");

    let board_agenda_points = 0;
    let corp_scored_points = 0;
    let runner_scored_points = 0;

    for (const [cid, entry] of cardRegistry) {
      if (entry.side !== "Corp" || entry.type !== "Agenda" || !entry.title) continue;
      const zone0 = entry.zone[0];
      if (zone0 === "servers") {
        board_agenda_points += entry.agendaPoints ?? 0;
      } else if (zone0 === "scored") {
        if (runnerScoredCids.has(cid)) {
          runner_scored_points += entry.agendaPoints ?? 0;
        } else {
          corp_scored_points += entry.agendaPoints ?? 0;
        }
      }
    }

    return {
      corp_hand: { agenda_points: hand.agenda_points },
      corp_deck: { agenda_points: deck.agenda_points },
      corp_discard: { agenda_points: discard.agenda_points },
      corp_board: { agenda_points: board_agenda_points },
      corp_scored: { agenda_points: corp_scored_points },
      runner_scored: { agenda_points: runner_scored_points },
    };
  }

  const turns: Turn[] = [];
  let currentPhase: Turn = { turn: state.turn, clicks: [] };
  if (state.turn !== 0) {
    currentPhase.player = state.activePlayer;
  }
  let clickNumber = 0;
  let undoneFlag = false;
  let pendingEvents: string[] = [];
  let pendingHqSnapshot: ZoneSnapshot | undefined;
  let pendingRdSnapshot: ZoneSnapshot | undefined;

  // Retroactive hand augmentation: when a corp/runner card is first revealed in hand
  // after the phase snapshot was taken, add it if there's still room.
  let augCorpSnap: { snap: HandSnapshot; maxCount: number } | undefined;
  let augRunnerSnap: { snap: HandSnapshot; maxCount: number } | undefined;

  // Seed registry from initial game state
  scanCards(initial);

  function flushClickGroup(isUndo = false): void {
    if (pendingEvents.length > 0) {
      const playerName = currentPhase.player === "corp" ? corpName : runnerName;
      let clickEvents: string[];
      let eotEvents: string[];
      if (clickNumber > 0 && !isUndo) {
        [clickEvents, eotEvents] = splitEotEvents(pendingEvents);
      } else {
        clickEvents = [...pendingEvents];
        eotEvents = [];
      }

      const group: ClickGroup = { click: clickNumber, events: clickEvents };
      if (!isUndo) {
        if (clickNumber === 0) {
          const effects = computeSotEffects(clickEvents, playerName);
          if (effects) group.effects = effects;
        } else {
          const action = parseClickAction(clickEvents);
          if (action) {
            group.action = action;
            const effects = computeClickEffects(action, clickEvents, playerName);
            if (effects) group.effects = effects;
          }
        }
      }
      if (!isUndo) {
        if (pendingHqSnapshot) {
          group.breach_hq_snapshot = pendingHqSnapshot;
          pendingHqSnapshot = undefined;
        }
        if (pendingRdSnapshot) {
          group.breach_rd_snapshot = pendingRdSnapshot;
          pendingRdSnapshot = undefined;
        }
      }
      currentPhase.clicks.push(group);

      if (eotEvents.length > 0) {
        const eotGroup: ClickGroup = { click: -1, events: eotEvents };
        const effects = computeEotEffects(eotEvents, playerName);
        if (effects) eotGroup.effects = effects;
        currentPhase.clicks.push(eotGroup);
      }
    }
    pendingEvents = [];
  }

  function startNewPhase(turnNum: number, player: string): void {
    flushClickGroup();
    if (currentPhase.clicks.length > 0) {
      turns.push(currentPhase);
    }
    currentPhase = { turn: turnNum, player, clicks: [] };
    if (turnNum > 0) {
      const snap = captureHandSnapshot();
      currentPhase.hand_snapshot = snap;
      currentPhase.agenda_snapshot = captureAgendaTurnSnapshot();
      if (player === "corp") {
        augCorpSnap = { snap, maxCount: state.corpHandCount };
      } else {
        augRunnerSnap = { snap, maxCount: state.runnerHandCount };
      }
    }
    clickNumber = 0;
    undoneFlag = false;
    pendingEvents = [];
    pendingHqSnapshot = undefined;
    pendingRdSnapshot = undefined;
  }

  for (const item of historyRest) {
    if (item.length === 0) continue;
    // Detect mulligan: clear that player's hand before scanning new cards
    for (const patch of item) {
      for (const text of extractLogTexts(patch.log)) {
        if (/takes a mulligan/.test(text)) {
          const side = /<anonymized-corp>/.test(text) ? "Corp" : "Runner";
          for (const entry of cardRegistry.values()) {
            if (entry.side === side && entry.zone[0] === "hand") entry.zone = ["deck"];
          }
        }
      }
    }
    scanCards(item);
    // Track deck-count and hand-count updates across all patches in this history item
    for (const patch of item) {
      const patchCorp = patch.corp;
      if (patchCorp) {
        const dc = patchCorp["deck-count"];
        if (typeof dc === "number") state.corpDeckCount = dc;
        const hc = patchCorp["hand-count"];
        if (typeof hc === "number") state.corpHandCount = hc;
      }
      const patchRunner = patch.runner;
      if (patchRunner) {
        const hc = patchRunner["hand-count"];
        if (typeof hc === "number") state.runnerHandCount = hc;
      }
    }

    const upd = item[0];
    if (!upd) continue;

    const newTurn = upd.turn;
    const newActive = upd["active-player"];
    const newCorpClick = upd.corp?.["click"] as number | undefined;
    const newRunnerClick = upd.runner?.["click"] as number | undefined;

    const phaseChanged =
      (newActive !== undefined && newActive !== state.activePlayer) ||
      (newTurn !== undefined && newTurn !== state.turn);

    const oldClick = activeClick();

    if (newTurn !== undefined) state.turn = newTurn;
    if (newActive !== undefined) state.activePlayer = newActive;
    if (newCorpClick !== undefined) state.corpClick = newCorpClick;
    if (newRunnerClick !== undefined) state.runnerClick = newRunnerClick;

    const newClick = activeClick();
    const logTexts = extractLogTexts(upd["log"]);

    if (phaseChanged) {
      startNewPhase(state.turn, state.activePlayer);
    } else if (newClick < oldClick) {
      flushClickGroup();
      if (undoneFlag) {
        undoneFlag = false;
      } else {
        clickNumber += 1;
      }
    } else if (newClick > oldClick) {
      if (logTexts.some((t) => t.includes("undo-click"))) {
        pendingEvents.push("[undo-click]");
        flushClickGroup(true);
        undoneFlag = true;
        logTexts.length = 0;
      }
    }

    for (const text of logTexts) {
      if (/\bbreaches HQ\b/.test(text) && !pendingHqSnapshot) {
        pendingHqSnapshot = captureZoneSnapshot("hand");
      }
      if (/\bbreaches R&D\b/.test(text) && !pendingRdSnapshot) {
        pendingRdSnapshot = captureZoneSnapshot("deck");
      }
    }
    pendingEvents.push(...logTexts);
  }

  flushClickGroup();
  if (currentPhase.clicks.length > 0) {
    turns.push(currentPhase);
  }

  return turns;
}

// -- Run info extraction --

function extractRunInfo(
  action: Action,
  events: string[]
): { server: string; successful: boolean } {
  let server: string;
  if (action.type === "run" && typeof action.server === "string") {
    server = action.server;
  } else {
    const runOnMatch = events.map((e) => /\bmakes? a run on (.+?)\./.exec(e)).find(Boolean);
    if (runOnMatch) {
      server = runOnMatch[1];
    } else {
      // Fallback: infer from "approaches ice protecting X at position" or "approaches X"
      const approachMatch = events
        .map((e) => /\bapproaches ice protecting (.+?) at position|\bapproaches (HQ|R&D|Archives|Server \d+)\b/.exec(e))
        .find(Boolean);
      if (approachMatch) {
        server = approachMatch[1] ?? approachMatch[2];
      } else {
        // No run-initiation pattern found: event card did not make a run
        server = "no run";
      }
    }
  }
  const successful = events.some((e) => /\bbreaches\b|\buses the replacement effect\b/.test(e));
  return { server, successful };
}

const ACCESS_SERVER_RE = /(?:HQ|R&D|Archives|Server \d+|the root of HQ)/;
const ACCESS_RE = new RegExp(`\\baccesses (.+?) from (${ACCESS_SERVER_RE.source})\\b`);
const TRASH_ACCESS_RE = new RegExp(`\\bpays .+ to trash (.+?) from (${ACCESS_SERVER_RE.source})\\b`);

function updateLastAccess(
  accessed: AccessEntry[],
  cardName: string,
  outcome: "stolen" | "trashed"
): void {
  for (let j = accessed.length - 1; j >= 0; j--) {
    if (accessed[j].outcome === "seen" && (accessed[j].name === undefined || accessed[j].name === cardName)) {
      accessed[j] = { name: cardName, outcome };
      return;
    }
  }
}

function extractRunAccesses(events: string[]): { accessed: AccessEntry[] } {
  const accessed: AccessEntry[] = [];

  for (const ev of events) {
    if (/\baccesses everything else in Archives\b/.test(ev)) continue;
    const accessMatch = ACCESS_RE.exec(ev);
    if (accessMatch) {
      const rawName = accessMatch[1];
      accessed.push({ name: rawName === "an unseen card" ? undefined : rawName, outcome: "seen" });
      continue;
    }
    const stealMatch = /\bsteals (.+?) and gains \d+ agenda points?/.exec(ev);
    if (stealMatch) {
      updateLastAccess(accessed, stealMatch[1], "stolen");
      continue;
    }
    const costStealMatch = /\bto steal (.+?) from /.exec(ev);
    if (costStealMatch) {
      updateLastAccess(accessed, costStealMatch[1], "stolen");
      continue;
    }
    const trashMatch = TRASH_ACCESS_RE.exec(ev);
    if (trashMatch) {
      updateLastAccess(accessed, trashMatch[1], "trashed");
    }
  }

  return { accessed };
}

// -- Economy tracking --

const BASIC_ECON_TYPES = new Set(["gain_credits", "draw"]);
const TEMPO_TYPES = new Set(["install", "install_ice", "run", "advance", "trash", "remove_tag"]);

function classifyClick(action: Action | null): ClickBucket | null {
  if (!action) return null;
  const atype = action.type;
  if (BASIC_ECON_TYPES.has(atype)) return "basic";
  if (TEMPO_TYPES.has(atype)) return "tempo";
  if (atype === "play" || atype === "ability" || atype === "unknown") return "impactful";
  return "tempo";
}

const RUN_TRIGGER_RE = /\bmakes? a run on\b|approaches (?:ice protecting|[A-Z])/;

function classifyRunnerClick(
  action: Action | null,
  events: string[],
  creditsGained: number,
  cardsDrawn: number,
  cardDb?: CardDb
): ClickBucket | null {
  if (!action) return null;
  const atype = action.type;
  if (BASIC_ECON_TYPES.has(atype)) return "basic";
  if (atype === "run") return "run";
  if (
    atype === "install" ||
    atype === "install_ice" ||
    atype === "remove_tag" ||
    atype === "trash" ||
    atype === "advance"
  ) {
    return "setup";
  }
  const cardTitle = action.card as string | undefined;
  if (cardTitle && cardDb?.isRunEvent(cardTitle)) return "run";
  if (events.some((e) => RUN_TRIGGER_RE.test(e))) return "run";
  if (creditsGained > 0 || cardsDrawn > 0) return "economy";
  return "setup";
}

function addBucketClick(econ: PlayerEcon, bucket: ClickBucket): void {
  if (bucket === "basic")         econ.basic_clicks += 1;
  else if (bucket === "economy")  econ.economy_clicks  = (econ.economy_clicks  ?? 0) + 1;
  else if (bucket === "run")      econ.run_clicks      = (econ.run_clicks      ?? 0) + 1;
  else if (bucket === "setup")    econ.setup_clicks    = (econ.setup_clicks    ?? 0) + 1;
  else if (bucket === "impactful") econ.impactful_clicks = (econ.impactful_clicks ?? 0) + 1;
  else if (bucket === "tempo")    econ.tempo_clicks    = (econ.tempo_clicks    ?? 0) + 1;
}

function emptyEcon(player: "corp" | "runner"): PlayerEcon {
  if (player === "runner") {
    return {
      basic_clicks: 0,
      economy_clicks: 0,
      run_clicks: 0,
      setup_clicks: 0,
      cards: {},
      runs: [],
    };
  }
  return {
    basic_clicks: 0,
    impactful_clicks: 0,
    tempo_clicks: 0,
    total_econ_clicks: 0,
    basic_econ_ratio: 0.0,
    cards: {},
  };
}

function newCardEconEntry(): CardEconEntry {
  return {
    uses: 0,
    clicks: 0,
    total_credits_gained: 0,
    total_cost: 0,
    total_net_credits: 0,
    total_cards_drawn: 0,
  };
}

export function computeEconomy(
  turns: Turn[],
  corpName: string | null = null,
  runnerName: string | null = null,
  cardDb?: CardDb
): Economy {
  const result: Economy = { corp: emptyEcon("corp"), runner: emptyEcon("runner") };
  const playerNames: Record<string, string | null> = { corp: corpName, runner: runnerName };

  // Pre-scan: collect play/install costs and counts per card per player
  const cardCosts: Record<string, Record<string, number>> = { corp: {}, runner: {} };
  const cardPlayCounts: Record<string, Record<string, number>> = { corp: {}, runner: {} };

  for (const phase of turns) {
    if (!("player" in phase)) continue;
    const player = phase.player as string;
    for (const click of phase.clicks) {
      const a = click.action;
      if (a && (a.type === "play" || a.type === "install") && a.card && click.click > 0) {
        const card = a.card as string;
        const resPaid = Object.values(
          (click.effects?.credits_from_resources ?? {}) as Record<string, number>
        ).reduce((s, v) => s + v, 0);
        const rawCost = ((a.cost as number) ?? 0) + resPaid;
        const printedCost = cardDb?.getPrintedCost(card);
        const installCostEntry = printedCost !== null && printedCost !== undefined ? Math.min(rawCost, printedCost) : rawCost;
        cardCosts[player][card] = (cardCosts[player][card] ?? 0) + installCostEntry;
        cardPlayCounts[player][card] = (cardPlayCounts[player][card] ?? 0) + 1;
      }
    }
  }

  for (const phase of turns) {
    if (!("player" in phase)) continue;
    const player = phase.player as string;
    const econ = result[player as "corp" | "runner"];
    const playerName = playerNames[player] ?? null;

    for (const click of phase.clicks) {
      const action = click.action;
      if (!action || click.click === 0) continue;

      const events = click.events;
      let creditsGained = extractCreditsGained(events, playerName);
      let cardsDrawn = extractCardsDrawn(events, playerName);
      const cost = (action.cost as number) ?? 0;

      let cardKey = econCardKey(action, events);

      let isEcon = creditsGained > 0 || (cardsDrawn > 0 && action.type !== "install");

      let isTrigger = false;
      let promotedFromUnknown = false;
      if (isEcon && cardKey === "unknown") {
        const triggered = findTriggeredEconCard(events);
        if (triggered) {
          cardKey = triggered;
          isTrigger = cardKey in econ.cards;
          promotedFromUnknown = !isTrigger;
        }
      }

      const triggeredGains = extractTriggeredGains(events, playerName);
      const secondaryCredits = Object.entries(triggeredGains)
        .filter(([k]) => k !== cardKey)
        .reduce((a, [, v]) => a + v, 0);
      creditsGained -= secondaryCredits;
      isEcon = creditsGained > 0 || (cardsDrawn > 0 && action.type !== "install");

      let bucket: ClickBucket | null;
      if (player === "runner") {
        bucket = classifyRunnerClick(action, events, creditsGained, cardsDrawn, cardDb);
      } else {
        bucket = classifyClick(action);
        if (isEcon && bucket === "tempo" && !isTrigger) {
          bucket = "impactful";
        }
      }

      if (bucket === null) continue;

      click.bucket = bucket;

      if (bucket === "run" && player === "runner") {
        const { server, successful } = extractRunInfo(action, events);
        const runEntry: RunEntry = { turn: phase.turn, click: click.click, server, successful };
        const cardTitle = action.card as string | undefined;
        if (cardTitle && cardDb?.isRunEvent(cardTitle)) runEntry.card = cardTitle;
        const { accessed } = extractRunAccesses(events);
        if (accessed.length > 0) runEntry.accessed = accessed;
        if (click.breach_hq_snapshot) runEntry.hq_snapshot = click.breach_hq_snapshot;
        if (click.breach_rd_snapshot) runEntry.rd_snapshot = click.breach_rd_snapshot;
        econ.runs!.push(runEntry);
      }

      if (isEcon) {
        if (!isTrigger) {
          addBucketClick(econ, bucket);
        }
        const isNewEntry = !(cardKey in econ.cards);
        if (!(cardKey in econ.cards)) econ.cards[cardKey] = newCardEconEntry();
        const entry = econ.cards[cardKey];
        if (isNewEntry) {
          const cardTitle = action.card as string | undefined;
          if (cardTitle && cardDb?.isRunEvent(cardTitle)) entry.run = true;
        }
        const resourceCreditsPaid = Object.values(
          (click.effects?.credits_from_resources ?? {}) as Record<string, number>
        ).reduce((s, v) => s + v, 0);
        const rawEffectiveCost = promotedFromUnknown
          ? (cardCosts[player][cardKey] ?? 0)
          : cost + resourceCreditsPaid;
        const printedCostForKey = cardDb?.getPrintedCost(cardKey);
        const effectiveCost = printedCostForKey !== null && printedCostForKey !== undefined
          ? Math.min(rawEffectiveCost, printedCostForKey)
          : rawEffectiveCost;
        if (isNewEntry && !isTrigger && !promotedFromUnknown && action.type !== "play" && action.type !== "install") {
          const installCost = cardCosts[player][cardKey] ?? cardDb?.getPrintedCost(cardKey) ?? 0;
          entry.total_cost += installCost;
          entry.total_net_credits -= installCost;
        }
        if (!isTrigger) {
          entry.uses += 1;
          if (!promotedFromUnknown) entry.clicks += 1;
          entry.total_cost += effectiveCost;
        }
        entry.total_credits_gained += creditsGained;
        entry.total_net_credits += creditsGained - (isTrigger ? 0 : effectiveCost);
        entry.total_cards_drawn += cardsDrawn;
      } else {
        addBucketClick(econ, bucket);
      }

      // Attribute secondary triggered gains to their own econ entries
      for (const [trigCard, trigCreds] of Object.entries(triggeredGains)) {
        if (trigCard === cardKey) continue;
        const trigIsNew = !(trigCard in econ.cards);
        if (!(trigCard in econ.cards)) econ.cards[trigCard] = newCardEconEntry();
        const trigEntry = econ.cards[trigCard];
        if (trigIsNew) {
          const playCost = cardCosts[player][trigCard] ?? 0;
          const playCount = cardPlayCounts[player][trigCard] ?? 1;
          trigEntry.uses = playCount;
          trigEntry.clicks = playCount;
          trigEntry.total_cost += playCost;
          trigEntry.total_net_credits -= playCost;
        }
        trigEntry.total_credits_gained += trigCreds;
        trigEntry.total_net_credits += trigCreds;
      }

      // Track credits provided by resource cards
      const eventRes = extractResourceCredits(events, playerName);
      const annotatedRes = (click.effects?.credits_from_resources) ?? {};
      const combinedRes: Record<string, number> = { ...eventRes };
      for (const [card, amt] of Object.entries(annotatedRes)) {
        if (!(card in combinedRes)) combinedRes[card] = amt;
      }
      for (const [resCard, resAmount] of Object.entries(combinedRes)) {
        const isNew = !(resCard in econ.cards);
        if (!(resCard in econ.cards)) econ.cards[resCard] = newCardEconEntry();
        const resEntry = econ.cards[resCard];
        if (isNew) {
          const playCost = cardCosts[player][resCard] ?? cardDb?.getPrintedCost(resCard) ?? 0;
          const playCount = cardPlayCounts[player][resCard] ?? 0;
          resEntry.uses = playCount;
          if (resCard === action.card && action.type !== "install") {
            resEntry.clicks = playCount;
            if (cardDb?.isRunEvent(resCard)) resEntry.run = true;
          }
          resEntry.total_cost += playCost;
          resEntry.total_net_credits -= playCost;
        }
        if (!cardPlayCounts[player][resCard]) {
          resEntry.uses += 1;
        }
        resEntry.total_credits_gained += resAmount;
        resEntry.total_net_credits += resAmount;
      }
    }
  }

  // Process SOT/EOT triggered gains/draws (skipped by main loop which requires click.click > 0)
  const triggeredDrawRe = /\buses (.+?) to draw \d/;
  for (const phase of turns) {
    if (!("player" in phase)) continue;
    const player = phase.player as string;
    const playerName = playerNames[player] ?? null;
    const econ = result[player as "corp" | "runner"];
    for (const click of phase.clicks) {
      if (click.click !== 0 && click.click !== -1) continue;

      const tg = (click.effects?.triggered_gains as Record<string, number> | undefined) ?? {};
      for (const [card, amount] of Object.entries(tg)) {
        const isNew = !(card in econ.cards);
        if (isNew) econ.cards[card] = newCardEconEntry();
        const entry = econ.cards[card];
        if (isNew) {
          const playCost = cardCosts[player][card] ?? cardDb?.getPrintedCost(card) ?? 0;
          entry.uses = cardPlayCounts[player][card] ?? 0;
          entry.total_cost += playCost;
          entry.total_net_credits -= playCost;
        }
        entry.total_credits_gained += amount;
        entry.total_net_credits += amount;
      }

      // Attribute triggered card draws ("uses X to draw N cards")
      const totalDrawn = (click.effects?.cards_drawn as number | undefined) ?? 0;
      if (totalDrawn > 0) {
        for (const ev of (click.events ?? [])) {
          if (playerName && !ev.startsWith(playerName)) continue;
          const m = triggeredDrawRe.exec(ev);
          if (!m) continue;
          const card = m[1];
          const isNew = !(card in econ.cards);
          if (isNew) econ.cards[card] = newCardEconEntry();
          const entry = econ.cards[card];
          if (isNew) {
            const playCost = cardCosts[player][card] ?? cardDb?.getPrintedCost(card) ?? 0;
            entry.uses = cardPlayCounts[player][card] ?? 0;
            entry.total_cost += playCost;
            entry.total_net_credits -= playCost;
          }
          entry.total_cards_drawn += totalDrawn;
        }
      }
    }
  }

  // Post-hoc: reclassify runner install/play clicks for econ cards
  const runnerEcon = result.runner;

  const econCardNames = new Set<string>(
    Object.entries(runnerEcon.cards)
      .filter(([, entry]) => entry.total_credits_gained > 0 || entry.total_cards_drawn > 0)
      .map(([name]) => name)
  );

  const sotEotDrawRe = /uses? (.+?) to draw/;
  for (const phase of turns) {
    if (phase.player !== "runner") continue;
    for (const click of phase.clicks) {
      if (click.click !== 0 && click.click !== -1) continue;
      const tg = extractTriggeredGains(click.events ?? [], runnerName ?? null);
      for (const k of Object.keys(tg)) econCardNames.add(k);
      for (const ev of click.events ?? []) {
        if (runnerName && !ev.startsWith(runnerName)) continue;
        const m = sotEotDrawRe.exec(ev);
        if (m) econCardNames.add(m[1]);
      }
    }
  }

  for (const phase of turns) {
    if (phase.player !== "runner") continue;
    for (const click of phase.clicks) {
      if (click.bucket !== "setup") continue;
      const action = click.action;
      if (!action || (action.type !== "install" && action.type !== "play")) continue;
      if (action.card && econCardNames.has(action.card as string)) {
        click.bucket = "economy";
        runnerEcon.setup_clicks! -= 1;
        runnerEcon.economy_clicks! += 1;
        const cardKey = action.card as string;
        if (!(cardKey in runnerEcon.cards)) {
          runnerEcon.cards[cardKey] = newCardEconEntry();
          const playCost = cardCosts["runner"][cardKey] ?? cardDb?.getPrintedCost(cardKey) ?? 0;
          runnerEcon.cards[cardKey].uses = cardPlayCounts["runner"][cardKey] ?? 0;
          runnerEcon.cards[cardKey].total_cost += playCost;
          runnerEcon.cards[cardKey].total_net_credits -= playCost;
        }
        runnerEcon.cards[cardKey].clicks += 1;
      }
    }
  }

  // Collect setup card breakdown for runner (buckets are final after reclassification)
  const setupCards: Record<string, SetupCardEntry> = {};
  for (const phase of turns) {
    if (phase.player !== "runner") continue;
    for (const click of phase.clicks) {
      if (click.bucket !== "setup") continue;
      const action = click.action;
      if (!action) continue;
      const card = ((action.card ?? action.raw ?? "unknown") as string);
      const cost = (action.cost as number) ?? 0;
      if (!(card in setupCards)) setupCards[card] = { count: 0, total_cost: 0 };
      setupCards[card].count += 1;
      setupCards[card].total_cost += cost;
    }
  }
  runnerEcon.setup_cards = setupCards;
  runnerEcon.total_setup_cost = Object.values(setupCards).reduce((s, e) => s + e.total_cost, 0);

  // MuslihaT identity
  const muslihatLookRe = /uses (MuslihaT[^.]+?) to look at the top card/;
  const muslihatAddRe = /MuslihaT.+add it to the grip/;
  let muslihatName: string | null = null;
  let muslihatGripAdds = 0;

  for (const phase of turns) {
    if (phase.player !== "runner") continue;
    for (const click of phase.clicks) {
      if (click.click !== 0) continue;
      for (const ev of click.events ?? []) {
        if (runnerName && !ev.startsWith(runnerName)) continue;
        const m = muslihatLookRe.exec(ev);
        if (m) muslihatName = m[1].trim();
        if (muslihatAddRe.test(ev)) muslihatGripAdds += 1;
      }
    }
  }

  if (muslihatName && muslihatGripAdds > 0) {
    if (!(muslihatName in runnerEcon.cards)) runnerEcon.cards[muslihatName] = newCardEconEntry();
    const entry = runnerEcon.cards[muslihatName];
    entry.uses = muslihatGripAdds;
    entry.total_cards_drawn += muslihatGripAdds;
  }

  // Compute derived stats for runner
  const econBasic = (runnerEcon.basic_clicks ?? 0) + (runnerEcon.economy_clicks ?? 0);
  runnerEcon.econ_click_ratio =
    econBasic > 0 ? parseFloat(((runnerEcon.economy_clicks ?? 0) / econBasic).toFixed(2)) : 0.0;
  const totalNetCredits = Object.values(runnerEcon.cards).reduce((s, e) => s + e.total_net_credits, 0);
  const totalCardsDrawn = Object.values(runnerEcon.cards).reduce((s, e) => s + e.total_cards_drawn, 0);
  const totalClicksSpent = Object.values(runnerEcon.cards).reduce((s, e) => s + e.clicks, 0);
  runnerEcon.avg_net_credits_per_econ_click =
    totalClicksSpent > 0 ? parseFloat((totalNetCredits / totalClicksSpent).toFixed(2)) : 0.0;
  runnerEcon.avg_cards_drawn_per_econ_click =
    totalClicksSpent > 0 ? parseFloat((totalCardsDrawn / totalClicksSpent).toFixed(2)) : 0.0;

  // Compute derived stats for corp
  const corpEcon = result.corp;
  const corpEconClicks = (corpEcon.basic_clicks ?? 0) + (corpEcon.impactful_clicks ?? 0);
  corpEcon.total_econ_clicks = corpEconClicks;
  corpEcon.basic_econ_ratio =
    corpEconClicks > 0 ? parseFloat((corpEcon.basic_clicks / corpEconClicks).toFixed(2)) : 0.0;

  for (const playerEcon of [result.corp, result.runner] as PlayerEcon[]) {
    for (const entry of Object.values(playerEcon.cards)) {
      entry.credits_per_click =
        entry.clicks > 0 ? parseFloat((entry.total_net_credits / entry.clicks).toFixed(2)) : undefined;
    }
  }

  return result;
}

// -- Action summary --

const PER_CARD_ACTIONS = new Set(["install", "install_ice", "play", "ability"]);

export function computeActionSummary(turns: Turn[]): ActionSummary {
  const totals: ActionSummary = { corp: {}, runner: {} };

  for (const phase of turns) {
    if (!("player" in phase)) continue;
    const player = phase.player as string;
    const playerTotals = totals[player as "corp" | "runner"];

    for (const click of phase.clicks) {
      const action = click.action;
      if (!action) continue;

      const atype = action.type;

      if (PER_CARD_ACTIONS.has(atype)) {
        if (!(atype in playerTotals)) {
          playerTotals[atype] = { total: 0, by_card: {} };
        }
        const bucket = playerTotals[atype] as PerCardBucket;
        bucket.total += 1;
        let cardKey: string;
        if (atype === "install_ice") {
          cardKey = (action.location as string) || "unknown";
        } else {
          cardKey = (action.card as string) || "unknown";
        }
        bucket.by_card[cardKey] = (bucket.by_card[cardKey] ?? 0) + 1;
      } else {
        playerTotals[atype] = ((playerTotals[atype] as number) ?? 0) + 1;
      }
    }
  }

  return totals;
}

// -- Az credit annotation --

function annotateAzCredits(
  turns: Turn[],
  runnerIdentity: string,
  cardDb?: CardDb
): void {
  if (!runnerIdentity.includes("Az McCaffrey")) return;
  for (const turn of turns) {
    if (turn.player !== "runner") continue;
    let azFired = false;
    for (const click of turn.clicks) {
      if (click.click === 0 || azFired) continue;
      const action = click.action;
      if (!action || action.type !== "install") continue;
      const card = action.card as string | undefined;
      const eligible = card && cardDb?.isAzEligible(card);
      if (eligible) {
        if (!click.effects) click.effects = {};
        if (!click.effects.credits_from_resources) click.effects.credits_from_resources = {};
        const cfr = click.effects.credits_from_resources;
        cfr[runnerIdentity] = (cfr[runnerIdentity] ?? 0) + 1;
        azFired = true;
      }
    }
  }
}

// -- Top-level parse --

export function parseReplayFromString(
  jsonText: string,
  cardDb?: CardDb
): ParsedReplay {
  const data = JSON.parse(jsonText) as RawReplay;

  const metadata = data.metadata;
  const history = data.history;
  const initial = history[0];
  const corp = initial.corp!;
  const runner = initial.runner!;

  const summary: Summary = {
    corp_player: corp.user.username,
    corp_identity: corp.identity.title,
    runner_player: runner.user.username,
    runner_identity: runner.identity.title,
    turns: metadata["turn"] as number,
    winner: metadata["winner"] as string,
    win_reason: metadata["reason"] as string,
    corp_agenda_points: metadata["corp.agenda-points"] as number,
    runner_agenda_points: metadata["runner.agenda-points"] as number,
  };

  const turns = parseTurns(history, summary.corp_player, summary.runner_player);
  annotateAzCredits(turns, summary.runner_identity, cardDb);
  const actionSummary = computeActionSummary(turns);
  const economy = computeEconomy(turns, summary.corp_player, summary.runner_player, cardDb);

  return { summary, action_summary: actionSummary, economy, turns };
}
