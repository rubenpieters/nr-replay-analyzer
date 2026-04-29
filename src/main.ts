import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseReplayFromString } from "./analyzer.js";
import { generateHtml } from "./htmlOutput.js";
import { CardDb } from "./cardDb.js";
import path from "path";

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 2) {
  console.error(`Usage: tsx src/main.ts <replay_file.json> [output_prefix]`);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const cardDb = new CardDb(JSON.parse(readFileSync(join(root, "cards", "cards.json"), "utf-8")));

const replayText = readFileSync(args[0], "utf-8");
const data = parseReplayFromString(replayText, cardDb);

const outputPrefix = args[1];
mkdirSync(path.resolve(outputPrefix, '..'), { recursive: true });
const jsonPath = `${outputPrefix}.json`;
const htmlPath = `${outputPrefix}.html`;
writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
console.log(`Wrote parsed replay to ${jsonPath}`);
writeFileSync(htmlPath, generateHtml(data), "utf-8");
console.log(`Wrote HTML replay to ${htmlPath}`);
