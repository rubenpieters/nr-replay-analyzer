import { parseReplayFromString } from "./analyzer.js";
import { generateHtml } from "./htmlOutput.js";

const input = document.getElementById("fileInput") as HTMLInputElement;
const output = document.getElementById("output") as HTMLDivElement;

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target!.result as string;
      const data = parseReplayFromString(text);
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
