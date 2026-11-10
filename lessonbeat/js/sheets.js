// Printable student worksheets. Rhythm tasks are drawn from the unit's clap-alongs, so they always match.
import { drawPiece, fitCanvas, pieceHeight, PRINT } from "./notation.js";
import { toNotes } from "./music.js";
import { esc } from "./ui.js";

export function worksheetHTML(ws, i, env) {
  const tasks = ws.tasks.map((t, k) => {
    let body = "";
    if (t.kind === "read" || t.kind === "complete") body = `<canvas data-task="${t.kind}" data-clap="${t.clap}"></canvas>`;
    else if (t.kind === "compose") body = `<canvas data-task="compose" data-bars="${t.bars || 2}"></canvas>`;
    else if (t.kind === "match") body = `<div class="ws-match">${t.items.map((p) => `<div><span>${esc(p[0])}</span><i></i><i></i><span>${esc(p[1])}</span></div>`).join("")}</div>`;
    else if (t.kind === "listen") body = `<div class="ws-listen">${t.items.map((q) => `<div><p>${esc(q)}</p><div class="ws-box"></div></div>`).join("")}</div>`;
    else body = `<ol class="ws-q">${t.items.map((q) => `<li><p>${esc(q)}</p><div class="ws-lines"><i></i><i></i></div></li>`).join("")}</ol>`;
    return `<section class="ws-task"><h4><span>${k + 1}</span>${esc(t.prompt)}</h4>${body}</section>`;
  }).join("");
  return `<article class="sheet" data-sheet="${i}"><header><div><h3>${esc(ws.title)}</h3><p>${esc(env.year)}${env.lessons > 1 ? ` · Lesson ${ws.lesson}` : ""}</p></div><div class="ws-name"><span>Name</span><span>Date</span></div></header>
    ${ws.intro ? `<p class="ws-intro">${esc(ws.intro)}</p>` : ""}${tasks}<footer>${esc(env.unitTitle)} · Lessonbeat</footer></article>`;
}

/** Which beat to leave blank in each bar: one that holds complete notes, so the answer is unambiguous. */
function blanksFor(bars, beats) {
  const set = new Set();
  bars.forEach((bar, bi) => {
    const notes = toNotes([bar], beats), ok = [];
    for (let b = 0; b < beats; b++) { const inside = notes.filter((n) => n.inBar >= b - 1e-6 && n.inBar + n.d <= b + 1 + 1e-6); if (Math.abs(inside.reduce((s, n) => s + n.d, 0) - 1) < 1e-6 && inside.some((n) => !n.rest)) ok.push(b); }
    const pick = ok.length ? ok[(bi * 2 + 1) % ok.length] : 0;
    set.add(bi + ":" + pick);
  });
  return set;
}

export function paintSheets(root, claps, width) {
  root.querySelectorAll("canvas[data-task]").forEach((cv) => {
    const w = width || cv.parentElement.clientWidth || 640, kind = cv.dataset.task;
    if (kind === "compose") {
      const n = +cv.dataset.bars || 2, piece = { beats: 4, bars: Array.from({ length: n }, () => [1, 1, 1, 1]) }, perRow = Math.min(n, 2);
      const x = fitCanvas(cv, w, pieceHeight(n, perRow, { count: true }));
      drawPiece(x, { x: 0, y: 0, w }, piece, { perRow, count: true, empty: true, colors: PRINT });
      return;
    }
    const c = claps[(+cv.dataset.clap || 1) - 1] || claps[0]; if (!c) { cv.remove(); return; }
    const beats = c.beats || 4, perRow = w >= 560 && c.bars.length >= 4 ? 4 : 2, o = { perRow, count: true, names: kind === "read", colors: PRINT };
    if (kind === "complete") o.blanks = blanksFor(c.bars, beats);
    const x = fitCanvas(cv, w, pieceHeight(c.bars.length, perRow, o));
    drawPiece(x, { x: 0, y: 0, w }, { beats, bars: c.bars }, o);
  });
}
