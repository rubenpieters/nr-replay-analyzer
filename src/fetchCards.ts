import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = "https://api.netrunnerdb.com/api/v3/public/cards?filter[search]=snapshot:standard_30";
const OUT_DIR = new URL("../cards", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const OUT_FILE = join(OUT_DIR, "cards.json");

async function fetchAllCards(): Promise<unknown[]> {
  const all: unknown[] = [];
  let url: string | null = BASE_URL;

  while (url) {
    console.log(`Fetching: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    const body = await res.json() as { data: unknown[]; links?: { next?: string } };
    all.push(...body.data);
    url = body.links?.next ?? null;
  }

  return all;
}

interface CardAttributes {
  stripped_title: string;
  card_type_id: string;
  card_subtype_ids: string[];
  cost: string | null;
  [key: string]: unknown;
}
interface CardData {
  attributes: CardAttributes;
  [key: string]: unknown;
}

const cards = await fetchAllCards() as CardData[];
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(cards, null, 2), "utf-8");
console.log(`Wrote ${cards.length} cards to ${OUT_FILE}`);

const slim = cards.map((c) => ({
  stripped_title: c.attributes.stripped_title,
  card_type_id: c.attributes.card_type_id,
  card_subtype_ids: c.attributes.card_subtype_ids,
  cost: c.attributes.cost,
}));
const SLIM_FILE = join(OUT_DIR, "cards-slim.json");
writeFileSync(SLIM_FILE, JSON.stringify(slim), "utf-8");
console.log(`Wrote ${slim.length} slim cards to ${SLIM_FILE}`);
