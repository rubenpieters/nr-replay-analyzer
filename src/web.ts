import { parseReplayFromString } from "./analyzer.js";
import { generateHtml } from "./htmlOutput.js";
import { CardDb } from "./cardDb.js";
import slimCards from "../cards/cards-slim.json" with { type: "json" };

const cardDb = CardDb.fromSlimData(slimCards);

const input = document.getElementById("fileInput") as HTMLInputElement;
const output = document.getElementById("output") as HTMLDivElement;

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target!.result as string;
      const data = parseReplayFromString(text, cardDb);
      const html = generateHtml(data);
      const iframe = document.createElement("iframe");
      output.innerHTML = "";
      output.appendChild(iframe);
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(html);
      iframe.contentDocument!.close();
    } catch (err) {
      output.innerHTML = `<p style="color:red">Error: ${err}</p>`;
    }
  };
  reader.readAsText(file);
});
