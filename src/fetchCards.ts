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

const cards = await fetchAllCards();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(cards, null, 2), "utf-8");
console.log(`Wrote ${cards.length} cards to ${OUT_FILE}`);
