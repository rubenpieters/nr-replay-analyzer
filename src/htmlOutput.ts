import type { ParsedReplay, Turn, ClickGroup, Action, Effects, PlayerEcon, SetupCardEntry, RunEntry, AccessEntry } from "./analyzer.js";

const ACTION_COLORS: Record<string, string> = {
  run: "#d32f2f",
  install: "#1565c0",
  install_ice: "#1565c0",
  play: "#2e7d32",
  ability: "#6a1b9a",
  gain_credits: "#f57f17",
  draw: "#00695c",
  advance: "#e65100",
  trash: "#546e7a",
  remove_tag: "#546e7a",
  unknown: "#9e9e9e",
};

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #212121; padding: 16px; }
h1 { font-size: 1.4rem; margin-bottom: 4px; }
.game-summary { background: white; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #e0e0e0; }
.game-summary p { margin: 4px 0; font-size: 0.95rem; }
.player-section { margin-bottom: 32px; }
.player-section h2 { font-size: 1.1rem; margin-bottom: 12px; padding: 8px 12px; border-radius: 6px; }
.corp-section h2 { background: #e3f2fd; border-left: 4px solid #1565c0; }
.runner-section h2 { background: #fce4ec; border-left: 4px solid #c62828; }
.turn-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.turn-label { width: 56px; flex-shrink: 0; font-size: 0.8rem; font-weight: 600; color: #757575; padding-top: 8px; text-align: right; }
.clicks { display: flex; flex-wrap: wrap; gap: 6px; }
.click-cell { background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; width: 140px; flex-shrink: 0; font-size: 0.8rem; }
.click-cell.start-of-turn { background: #fafafa; border-style: dashed; }
.click-label { font-size: 0.7rem; color: #9e9e9e; margin-bottom: 4px; }
.action-badge { display: inline-block; color: white; font-size: 0.65rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; text-transform: uppercase; }
.action-detail { font-size: 0.8rem; margin-bottom: 4px; color: #424242; word-break: break-word; }
.effects { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; border-top: 1px solid #f0f0f0; padding-top: 4px; }
.effect { font-size: 0.7rem; padding: 1px 4px; border-radius: 3px; }
.effect-cost { background: #ffebee; color: #c62828; }
.effect-resource { background: #fff3e0; color: #e65100; }
.effect-gain { background: #e8f5e9; color: #2e7d32; }
.effect-trigger { background: #f3e5f5; color: #6a1b9a; }
.effect-draw { background: #e0f7fa; color: #00695c; }
.econ-summary { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; max-width: 700px; }
.click-tallies { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.click-tally { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
.click-tally-basic { background: #fce4ec; color: #c62828; border: 1px solid #f48fb1; }
.click-tally-impactful { background: #f1f8e9; color: #33691e; border: 1px solid #aed581; }
.click-tally-tempo { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
.click-cell.type-basic { background: #fff0f3; border-color: #f48fb1; }
.click-cell.type-impactful { background: #f9fbe7; border-color: #c5e1a5; }
.click-cell.type-tempo { background: #e8f4fd; border-color: #90caf9; }
.click-tally-economy { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
.click-tally-run { background: #fff3e0; color: #e65100; border: 1px solid #ffb74d; }
.click-tally-setup { background: #f3e5f5; color: #6a1b9a; border: 1px solid #ce93d8; }
.click-cell.type-economy { background: #e3f2fd; border-color: #90caf9; }
.click-cell.type-run { background: #fff8f0; border-color: #ffb74d; }
.click-cell.type-setup { background: #f8f0fc; border-color: #ce93d8; }
.click-cell.undo { background: #f0f0f0; border-color: #bdbdbd; border-style: dashed; opacity: 0.6; }
.click-cell { cursor: pointer; }
.modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100; align-items: center; justify-content: center; }
.modal-backdrop.open { display: flex; }
.modal { background: white; border-radius: 8px; padding: 20px; max-width: 640px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.modal-title { font-size: 0.95rem; font-weight: 600; color: #424242; }
.modal-close { background: none; border: none; font-size: 1.3rem; cursor: pointer; color: #757575; line-height: 1; padding: 0; }
.modal-close:hover { color: #212121; }
.modal-events { list-style: none; font-size: 0.75rem; font-family: monospace; }
.modal-events li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; color: #424242; word-break: break-word; }
.modal-events li:last-child { border-bottom: none; }
.modal-empty { font-size: 0.8rem; color: #9e9e9e; font-style: italic; }
.econ-stats { display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.8rem; flex-wrap: wrap; }
.econ-stat { color: #555; }
.econ-stat strong { color: #212121; }
.setup-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 12px; }
.setup-table th { text-align: left; padding: 4px 8px; border-bottom: 2px solid #e0e0e0; color: #757575; font-weight: 600; }
.setup-table td { padding: 3px 8px; border-bottom: 1px solid #f5f5f5; }
.setup-table tr:last-child td { border-bottom: none; }
.setup-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.setup-total td { font-weight: 600; border-top: 2px solid #e0e0e0; border-bottom: none; }
.card-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.card-table th { text-align: left; padding: 4px 8px; border-bottom: 2px solid #e0e0e0; color: #757575; font-weight: 600; white-space: nowrap; }
.card-table td { padding: 3px 8px; border-bottom: 1px solid #f5f5f5; }
.card-table tr:last-child td { border-bottom: none; }
.card-table-total td { font-weight: 600; border-top: 2px solid #e0e0e0; }
.card-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.net-pos { color: #2e7d32; font-weight: 600; }
.net-neg { color: #c62828; font-weight: 600; }
.net-zero { color: #9e9e9e; }
.runs-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 12px; }
.runs-table th { text-align: left; padding: 4px 8px; border-bottom: 2px solid #e0e0e0; color: #757575; font-weight: 600; }
.runs-table td { padding: 3px 8px; border-bottom: 1px solid #f5f5f5; }
.runs-table tr:last-child td { border-bottom: none; }
.runs-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.run-success { color: #2e7d32; font-weight: 600; }
.run-failure { color: #c62828; font-weight: 600; }
.run-stolen { color: #2e7d32; font-weight: 600; }
.run-trashed { color: #e65100; font-weight: 600; }
`;

const CORP_FACTIONS = ["Haas-Bioroid", "Weyland Consortium", "Jinteki", "NBN"];

function shortIdentity(name: string): string {
  const idx = name.indexOf(": ");
  if (idx === -1) return name;
  const prefix = name.slice(0, idx);
  return CORP_FACTIONS.includes(prefix) ? name.slice(idx + 2) : prefix;
}

function he(text: unknown): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderActionDetail(action: Action): string {
  const atype = action.type ?? "unknown";
  if (["play", "ability", "install", "trash", "unknown"].includes(atype)) {
    return he((action.card ?? action.raw ?? "") as string);
  }
  if (atype === "install_ice") return he((action.location ?? "") as string);
  if (atype === "run") return he((action.server ?? "") as string);
  if (atype === "advance") {
    const target = (action.target ?? "") as string;
    const loc = (action.location ?? "") as string;
    return he(loc ? `${target} @ ${loc}` : target);
  }
  if (atype === "gain_credits") return he(`+${action.amount ?? ""} credits`);
  if (atype === "draw") return he(`${action.count ?? ""} cards`);
  if (atype === "remove_tag") return he(`${action.count ?? ""} tag(s)`);
  return "";
}

function renderEffects(effects: Effects | undefined): string {
  if (!effects) return "";
  const parts: string[] = [];
  const paid = effects.credits_paid ?? 0;
  if (paid) parts.push(`<span class="effect effect-cost">&#8722;${paid} cr</span>`);
  for (const [card, amt] of Object.entries(effects.credits_from_resources ?? {})) {
    parts.push(`<span class="effect effect-resource">${he(shortIdentity(card))}: +${amt} cr</span>`);
  }
  const gained = effects.credits_gained ?? 0;
  if (gained) parts.push(`<span class="effect effect-gain">+${gained} cr</span>`);
  for (const [card, amt] of Object.entries(effects.triggered_gains ?? {})) {
    parts.push(`<span class="effect effect-trigger">${he(shortIdentity(card))}: +${amt} cr</span>`);
  }
  const drawn = effects.cards_drawn ?? 0;
  if (drawn) parts.push(`<span class="effect effect-draw">+${drawn} card(s)</span>`);
  return parts.join("");
}

function renderClick(click: ClickGroup): string {
  const clickNum = click.click ?? 0;
  const isUndo = (click.events ?? []).includes("[undo-click]");

  let label: string;
  if (clickNum === 0) label = "Start of Turn";
  else if (clickNum === -1) label = "End of Turn";
  else label = `Click ${clickNum}`;

  const action = click.action;
  const effects = click.effects;

  const atype = action ? (action.type ?? "unknown") : null;
  const color = atype ? (ACTION_COLORS[atype] ?? "#9e9e9e") : "#bdbdbd";

  let badge = atype ? `<div class="action-badge" style="background:${color}">${he(atype)}</div>` : "";
  let detail = action ? `<div class="action-detail">${renderActionDetail(action)}</div>` : "";
  let effectsHtml = effects ? `<div class="effects">${renderEffects(effects)}</div>` : "";

  let extraClass: string;
  if (isUndo) {
    extraClass = "undo";
    badge = '<div class="action-badge" style="background:#9e9e9e">undo</div>';
    detail = "";
    effectsHtml = "";
  } else if (clickNum === 0 || clickNum === -1) {
    extraClass = "start-of-turn";
  } else {
    const ct = click.bucket;
    extraClass = ct ? `type-${ct}` : "";
  }

  const eventsAttr = he(JSON.stringify(click.events ?? []));
  return (
    `<div class="click-cell ${extraClass}" data-label="${he(label)}" data-events="${eventsAttr}">` +
    `<div class="click-label">${label}</div>` +
    `${badge}${detail}${effectsHtml}` +
    `</div>`
  );
}

function renderTurn(turn: Turn): string {
  let clicks = turn.clicks ?? [];
  if (!clicks.length || clicks[clicks.length - 1].click !== -1) {
    clicks = [...clicks, { click: -1, events: [] }];
  }
  const clicksHtml = clicks.map(renderClick).join("");
  return (
    `<div class="turn-row">` +
    `<div class="turn-label">T${turn.turn ?? "?"}</div>` +
    `<div class="clicks">${clicksHtml}</div>` +
    `</div>`
  );
}

function formatAccessEntry(a: AccessEntry): string {
  const name = a.name ? he(a.name) : "?";
  if (a.outcome === "stolen") return `${name} <span class="run-stolen">stolen</span>`;
  if (a.outcome === "trashed") return `${name} <span class="run-trashed">trashed</span>`;
  return name;
}

function formatAccessed(r: RunEntry): string {
  const accessed = r.accessed ?? [];
  if (accessed.length === 0) return "—";
  const server = r.server;
  if (server === "HQ" || server === "R&D") return String(accessed.length);
  return accessed.map(formatAccessEntry).join(", ");
}

function renderEconomy(economy: PlayerEcon): string {
  const basic = economy.basic_clicks ?? 0;

  let tallies: string;
  if ("economy_clicks" in economy) {
    const ratio = ((economy.econ_click_ratio ?? 0) * 100).toFixed(0);
    const avgCr = (economy.avg_net_credits_per_econ_click ?? 0).toFixed(2);
    const avgDraw = (economy.avg_cards_drawn_per_econ_click ?? 0).toFixed(2);
    tallies =
      `<div class="click-tallies">` +
      `<span class="click-tally click-tally-basic">Basic &nbsp;${basic}</span>` +
      `<span class="click-tally click-tally-economy">Economy &nbsp;${economy.economy_clicks ?? 0}</span>` +
      `<span class="click-tally click-tally-run">Run &nbsp;${economy.run_clicks ?? 0}</span>` +
      `<span class="click-tally click-tally-setup">Setup &nbsp;${economy.setup_clicks ?? 0}</span>` +
      `</div>` +
      `<div class="econ-stats">` +
      `<span class="econ-stat">Econ ratio <strong>${ratio}%</strong></span>` +
      `<span class="econ-stat">Net cr / econ click <strong>${avgCr}</strong></span>` +
      `<span class="econ-stat">Cards / econ click <strong>${avgDraw}</strong></span>` +
      `</div>`;
  } else {
    tallies =
      `<div class="click-tallies">` +
      `<span class="click-tally click-tally-basic">Basic &nbsp;${basic}</span>` +
      `<span class="click-tally click-tally-impactful">Impactful &nbsp;${economy.impactful_clicks ?? 0}</span>` +
      `<span class="click-tally click-tally-tempo">Tempo &nbsp;${economy.tempo_clicks ?? 0}</span>` +
      `</div>`;
  }

  const cards = economy.cards ?? {};
  const sortedCards = Object.entries(cards)
    .filter(([, c]) => !c.run)
    .sort(
      ([, a], [, b]) =>
        b.total_net_credits - a.total_net_credits ||
        b.total_cards_drawn - a.total_cards_drawn
    );

  const rows: string[] = [];
  for (const [name, c] of sortedCards) {
    const net = c.total_net_credits;
    let netHtml: string;
    if (net > 0) netHtml = `<td class="num net-pos">+${net}</td>`;
    else if (net < 0) netHtml = `<td class="num net-neg">${net}</td>`;
    else netHtml = `<td class="num net-zero">0</td>`;

    const drawn = c.total_cards_drawn;
    const drawnHtml = drawn
      ? `<td class="num">${drawn}</td>`
      : `<td class="num">&#8212;</td>`;

    const cpc = c.credits_per_click !== undefined ? c.credits_per_click.toFixed(2) : "&#8212;";

    rows.push(
      `<tr>` +
        `<td>${he(shortIdentity(name))}</td>` +
        `<td class="num">${c.clicks}</td>` +
        `<td class="num">${c.total_cost}</td>` +
        `<td class="num">${c.total_credits_gained}</td>` +
        `${netHtml}` +
        `${drawnHtml}` +
        `<td class="num">${cpc}</td>` +
        `</tr>`
    );
  }

  const totClicks = sortedCards.reduce((s, [, c]) => s + c.clicks, 0);
  const totCost = sortedCards.reduce((s, [, c]) => s + c.total_cost, 0);
  const totGained = sortedCards.reduce((s, [, c]) => s + c.total_credits_gained, 0);
  const totNet = sortedCards.reduce((s, [, c]) => s + c.total_net_credits, 0);
  const totDrawn = sortedCards.reduce((s, [, c]) => s + c.total_cards_drawn, 0);
  const totCpc = totClicks > 0 ? parseFloat((totNet / totClicks).toFixed(2)) : 0;

  let totNetHtml: string;
  if (totNet > 0) totNetHtml = `<td class="num net-pos">+${totNet}</td>`;
  else if (totNet < 0) totNetHtml = `<td class="num net-neg">${totNet}</td>`;
  else totNetHtml = `<td class="num net-zero">0</td>`;

  const totDrawnHtml = totDrawn ? `<td class="num">${totDrawn}</td>` : `<td class="num">&#8212;</td>`;

  const totalRow =
    `<tr class="card-table-total">` +
    `<td>Total</td>` +
    `<td class="num">${totClicks}</td>` +
    `<td class="num">${totCost}</td>` +
    `<td class="num">${totGained}</td>` +
    `${totNetHtml}` +
    `${totDrawnHtml}` +
    `<td class="num">${totCpc}</td>` +
    `</tr>`;

  const table =
    `<table class="card-table">` +
    `<thead><tr>` +
    `<th>Card</th><th>Clicks</th><th>Cost</th><th>Gained</th><th>Net</th><th>Drawn</th><th>cr/click</th>` +
    `</tr></thead>` +
    `<tbody>${rows.join("")}</tbody>` +
    `<tfoot>${totalRow}</tfoot>` +
    `</table>`;

  let setupHtml = "";
  const setupCards = economy.setup_cards as Record<string, SetupCardEntry> | undefined;
  if (setupCards && Object.keys(setupCards).length > 0) {
    const sorted = Object.entries(setupCards).sort(([, a], [, b]) => b.total_cost - a.total_cost);
    const setupRows = sorted.map(([name, e]) =>
      `<tr><td>${he(name)}</td><td class="num">${e.count}</td><td class="num">${e.total_cost}</td></tr>`
    ).join("");
    const totalCost = economy.total_setup_cost as number ?? 0;
    setupHtml =
      `<table class="setup-table">` +
      `<thead><tr><th>Setup</th><th>Count</th><th>Cost</th></tr></thead>` +
      `<tbody>${setupRows}</tbody>` +
      `<tfoot><tr class="setup-total"><td>Total</td><td class="num"></td><td class="num">${totalCost}</td></tr></tfoot>` +
      `</table>`;
  }

  let runsHtml = "";
  const runs = economy.runs as RunEntry[] | undefined;
  if (runs && runs.length > 0) {
    const runRows = runs.map((r) => {
      const outcome = r.successful
        ? `<span class="run-success">&#10003;</span>`
        : `<span class="run-failure">&#10007;</span>`;
      const card = r.card ? he(shortIdentity(r.card)) : "&#8212;";
      const accessed = formatAccessed(r);
      return (
        `<tr>` +
        `<td class="num">T${r.turn}</td>` +
        `<td class="num">C${r.click}</td>` +
        `<td>${he(r.server)}</td>` +
        `<td>${outcome}</td>` +
        `<td>${card}</td>` +
        `<td>${accessed}</td>` +
        `</tr>`
      );
    }).join("");
    runsHtml =
      `<table class="runs-table">` +
      `<thead><tr><th>Turn</th><th>Click</th><th>Server</th><th>Result</th><th>Card</th><th>Accessed</th></tr></thead>` +
      `<tbody>${runRows}</tbody>` +
      `</table>`;
  }

  return `<div class="econ-summary">${tallies}${table}${setupHtml}${runsHtml}</div>`;
}

function renderSection(
  playerLabel: string,
  identity: string,
  turnsList: Turn[],
  cssClass: string,
  economy: PlayerEcon
): string {
  const econHtml = renderEconomy(economy);
  const turnsHtml = turnsList.map(renderTurn).join("");
  return (
    `<section class="player-section ${cssClass}">` +
    `<h2>${he(playerLabel)} : ${he(shortIdentity(identity))}</h2>` +
    `${econHtml}` +
    `<div class="turns-grid">${turnsHtml}</div>` +
    `</section>`
  );
}

export function generateHtml(data: ParsedReplay): string {
  const summary = data.summary;
  const turns = data.turns;

  const corpTurns = turns.filter((t) => t.player === "corp");
  const runnerTurns = turns.filter((t) => t.player === "runner");

  const economy = data.economy;
  const corpSection = renderSection(
    summary.corp_player,
    summary.corp_identity,
    corpTurns,
    "corp-section",
    economy.corp
  );
  const runnerSection = renderSection(
    summary.runner_player,
    summary.runner_identity,
    runnerTurns,
    "runner-section",
    economy.runner
  );

  const winner = summary.winner ?? "";
  const winReason = summary.win_reason ?? "";
  const corpAp = summary.corp_agenda_points ?? 0;
  const runnerAp = summary.runner_agenda_points ?? 0;
  const title = he(`${summary.corp_player} vs ${summary.runner_player}`);

  return (
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>Replay: ${title}</title>` +
    `<style>${CSS}</style>` +
    `</head><body>` +
    `<div class="game-summary">` +
    `<h1>Netrunner Replay</h1>` +
    `<p><strong>Corp:</strong> ${he(summary.corp_player)} : ${he(shortIdentity(summary.corp_identity))}</p>` +
    `<p><strong>Runner:</strong> ${he(summary.runner_player)} : ${he(shortIdentity(summary.runner_identity))}</p>` +
    `<p><strong>Winner:</strong> ${he(winner)} (${he(winReason)})</p>` +
    `<p><strong>Turns:</strong> ${summary.turns ?? "?"} &nbsp;|&nbsp; ` +
    `Corp ${corpAp}&ndash;${runnerAp} Runner agenda points</p>` +
    `</div>` +
    `${corpSection}${runnerSection}` +
    `<div class="modal-backdrop" id="ev-modal">` +
    `<div class="modal">` +
    `<div class="modal-header">` +
    `<span class="modal-title" id="ev-modal-title"></span>` +
    `<button class="modal-close" id="ev-modal-close">&times;</button>` +
    `</div>` +
    `<div id="ev-modal-body"></div>` +
    `</div></div>` +
    `<script>` +
    `(function(){` +
    `var backdrop=document.getElementById('ev-modal');` +
    `var title=document.getElementById('ev-modal-title');` +
    `var body=document.getElementById('ev-modal-body');` +
    `function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}` +
    `function open(label,events){` +
    `title.textContent=label;` +
    `body.innerHTML=events.length` +
    `?'<ul class="modal-events">'+events.map(function(e){return'<li>'+escHtml(e)+'</li>';}).join('')+'</ul>'` +
    `:'<p class="modal-empty">No events.</p>';` +
    `backdrop.classList.add('open');}` +
    `function close(){backdrop.classList.remove('open');}` +
    `document.getElementById('ev-modal-close').addEventListener('click',close);` +
    `backdrop.addEventListener('click',function(e){if(e.target===backdrop)close();});` +
    `document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});` +
    `document.querySelectorAll('.click-cell').forEach(function(el){` +
    `el.addEventListener('click',function(){` +
    `var events=JSON.parse(el.getAttribute('data-events')||'[]');` +
    `open(el.getAttribute('data-label')||'',events);` +
    `});});})();` +
    `</script>` +
    `</body></html>`
  );
}
