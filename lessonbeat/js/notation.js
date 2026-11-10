// Draws rhythm notation on a single-line staff, with optional time names, solfa and lyrics.
// One renderer is used for the on-screen players, the printable worksheets and the exported videos.
import { toNotes } from "./music.js";

export const INK = { ink: "#1B2233", soft: "#7B8093", rule: "#CFC3AB", hl: "#F7DB6A", red: "#C4412B", blue: "#27457A", paper: "#FBF8F1" };
export const PRINT = { ink: "#111111", soft: "#666666", rule: "#BBBBBB", hl: "#EEEEEE", red: "#111111", blue: "#111111", paper: "#FFFFFF" };
const SERIF = '"Fraunces", Georgia, serif', SANS = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

export function rowHeight(o) { return 86 + (o.count ? 16 : 0) + (o.names ? 20 : 0) + (o.solfa ? 22 : 0) + (o.words ? 24 : 0) + 10; }
export function pieceHeight(nBars, perRow, o) { return Math.ceil(nBars / perRow) * rowHeight(o); }

export function fitCanvas(cv, w, h) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + "px"; cv.style.height = h + "px";
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  return x;
}

/**
 * piece: { beats, bars } where bars are clap bars (numbers) or sing bars ({s,d,w}).
 * o: { perRow, names, solfa, words, count, now (beats from the start, or null), colors, blanks: Set("bar:beat"), edit }
 * Returns { height, hits } where hits are the clickable beat slots.
 */
export function drawPiece(x, box, piece, o = {}) {
  const C = o.colors || INK, beats = piece.beats || 4, bars = piece.bars, perRow = o.perRow || 4;
  const notes = o.notes || toNotes(bars, beats);
  const rH = rowHeight(o), lead = 30, hits = [];
  const bw = (box.w - lead - 4) / perRow, padL = 14, padR = 8, slot = (bw - padL - padR) / beats;
  const r = Math.max(5, Math.min(8.5, slot * 0.17));
  const rowY = (ri) => box.y + ri * rH, lineY = (ri) => rowY(ri) + 62;
  const barX = (bi) => box.x + lead + (bi % perRow) * bw;
  const nx = (n) => barX(n.bar) + padL + n.inBar * slot + r + 2;
  const now = o.now;

  // staff line, time signature and bar lines
  const rows = Math.ceil(bars.length / perRow);
  for (let ri = 0; ri < rows; ri++) {
    const y = lineY(ri), inRow = Math.min(perRow, bars.length - ri * perRow), xe = box.x + lead + inRow * bw;
    x.strokeStyle = C.rule; x.lineWidth = 1.5; x.beginPath(); x.moveTo(box.x, y); x.lineTo(xe, y); x.stroke();
    if (ri === 0) { x.fillStyle = C.ink; x.font = `700 22px ${SERIF}`; x.textAlign = "center"; x.fillText(String(beats), box.x + 12, y - 4); x.fillText("4", box.x + 12, y + 18); }
    for (let k = 0; k <= inRow; k++) {
      const bx = box.x + lead + k * bw, last = ri * perRow + k === bars.length;
      x.strokeStyle = C.ink; x.lineWidth = last ? 3.5 : 1.3; x.beginPath(); x.moveTo(bx, y - 22); x.lineTo(bx, y + 22); x.stroke();
      if (last) { x.lineWidth = 1.3; x.beginPath(); x.moveTo(bx - 6, y - 22); x.lineTo(bx - 6, y + 22); x.stroke(); }
    }
  }
  // beat slots: highlight, hit areas, counts
  bars.forEach((_, bi) => {
    const ri = Math.floor(bi / perRow), y = lineY(ri);
    for (let b = 0; b < beats; b++) {
      const sx = barX(bi) + padL + b * slot, p = bi * beats + b;
      hits.push({ x: sx - 2, y: rowY(ri), w: slot, h: rH, bar: bi, beat: b });
      if (now != null && now >= p && now < p + 1) { x.fillStyle = C.hl; rr(x, sx - 3, y - 54, slot - 2, 80, 6); x.fill(); }
      if (o.edit) { x.setLineDash([3, 4]); x.strokeStyle = C.soft; x.lineWidth = 1; rr(x, sx - 3, y - 54, slot - 2, 80, 6); x.stroke(); x.setLineDash([]); }
      if (o.blanks && o.blanks.has(bi + ":" + b)) { x.setLineDash([5, 4]); x.strokeStyle = C.soft; x.lineWidth = 1.5; rr(x, sx - 1, y - 50, slot - 6, 72, 6); x.stroke(); x.setLineDash([]); }
      if (o.count) { x.fillStyle = C.soft; x.font = `13px ${MONO}`; x.textAlign = "left"; x.fillText(String(b + 1), sx + 2, y + 40); }
    }
  });
  if (o.empty) return { height: rows * rH, hits };

  const hidden = (n) => o.blanks && o.blanks.has(n.bar + ":" + Math.floor(n.inBar + 1e-6));
  const live = (n) => now != null && now >= n.pos && now < n.pos + n.d;
  const col = (n) => (live(n) && !n.rest ? C.red : C.ink);

  // beam groups: neighbouring short notes inside one beat
  const groups = []; let g = [];
  notes.forEach((n, i) => {
    const prev = notes[i - 1];
    const joins = prev && !prev.rest && !n.rest && prev.d < 1 && n.d < 1 && prev.bar === n.bar && Math.floor(prev.inBar + 1e-6) === Math.floor(n.inBar + 1e-6) && !hidden(n);
    if (!joins) { if (g.length > 1) groups.push(g); g = []; }
    if (!n.rest && n.d < 1 && !hidden(n)) g.push(n); else { if (g.length > 1) groups.push(g); g = []; }
  });
  if (g.length > 1) groups.push(g);
  const beamed = new Set(groups.flat());

  notes.forEach((n) => {
    if (hidden(n)) return;
    const ri = Math.floor(n.bar / perRow), y = lineY(ri), cx = nx(n), c = col(n);
    if (n.rest) drawRest(x, cx, y, n.d, C.ink);
    else {
      const hollow = n.d >= 2;
      x.beginPath(); x.ellipse(cx, y, r, r * 0.74, -0.38, 0, Math.PI * 2);
      if (hollow) { x.strokeStyle = c; x.lineWidth = 2.4; x.stroke(); } else { x.fillStyle = c; x.fill(); }
      if (n.d < 4) { x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + r - 1, y - 2); x.lineTo(cx + r - 1, y - 46); x.stroke(); }
      if (n.d === 1.5 || n.d === 3 || n.d === 0.75) { x.fillStyle = c; x.beginPath(); x.arc(cx + r + 5, y - 4, 2.2, 0, Math.PI * 2); x.fill(); }
      if (n.d < 1 && !beamed.has(n)) { // lone quaver or semiquaver: flag(s)
        const flags = n.d <= 0.25 ? 2 : 1;
        for (let k = 0; k < flags; k++) { const fy = y - 46 + k * 8; x.strokeStyle = c; x.lineWidth = 2.2; x.beginPath(); x.moveTo(cx + r - 1, fy); x.quadraticCurveTo(cx + r + 9, fy + 6, cx + r + 6, fy + 18); x.stroke(); }
      }
    }
    // text rows
    let ty = y + 40 + (o.count ? 16 : 0);
    x.textAlign = "center";
    if (o.names) { x.fillStyle = n.rest ? C.soft : live(n) ? C.red : C.ink; x.font = `${live(n) ? "700 " : ""}${n.d <= 0.25 ? Math.min(13, Math.max(9, slot * 0.2)) : 14}px ${SANS}`; x.fillText(n.rest ? "—" : n.name, cx, ty); ty += 20; }
    if (o.solfa && n.s && n.s !== "z") { x.fillStyle = live(n) ? C.red : C.blue; x.font = `700 15px ${MONO}`; x.fillText(n.s, cx, ty + 2); }
    if (o.solfa) ty += 22;
    if (o.words && n.w) {
      const room = Math.max(14, n.d * slot - 3); let size = 15;
      x.font = `${live(n) ? "700 " : ""}${size}px ${SANS}`;
      const wide = x.measureText(n.w).width; if (wide > room) { size = Math.max(10, Math.floor((size * room) / wide)); x.font = `${live(n) ? "700 " : ""}${size}px ${SANS}`; }
      x.fillStyle = live(n) ? C.red : C.ink; x.textAlign = "left"; x.fillText(n.w, cx - r, ty + 4);
    }
  });
  // beams
  groups.forEach((grp) => {
    const ri = Math.floor(grp[0].bar / perRow), y = lineY(ri) - 46;
    const a = nx(grp[0]) + r - 1, b = nx(grp[grp.length - 1]) + r - 1;
    x.strokeStyle = C.ink; x.lineWidth = 5; x.lineCap = "butt";
    x.beginPath(); x.moveTo(a - 1, y + 2); x.lineTo(b + 1, y + 2); x.stroke();
    grp.forEach((n, i) => {
      if (n.d > 0.25) return;
      const me = nx(n) + r - 1, nextN = grp[i + 1], prevN = grp[i - 1];
      let from = me, to = me;
      if (nextN && nextN.d <= 0.25) to = nx(nextN) + r - 1; else if (prevN && prevN.d <= 0.25) return; else if (prevN) from = me - Math.min(10, (me - (nx(prevN) + r - 1)) / 2); else if (nextN) to = me + Math.min(10, (nx(nextN) + r - 1 - me) / 2);
      x.beginPath(); x.moveTo(from - 1, y + 10); x.lineTo(to + 1, y + 10); x.stroke();
    });
  });
  // playhead
  if (now != null && now >= 0 && now < bars.length * beats) {
    const bi = Math.floor(now / beats), ri = Math.floor(bi / perRow), px = barX(bi) + padL + (now - bi * beats) * slot + r + 2;
    x.strokeStyle = C.red; x.lineWidth = 2.5; x.beginPath(); x.moveTo(px, lineY(ri) - 56); x.lineTo(px, lineY(ri) + 28); x.stroke();
  }
  x.textAlign = "left";
  return { height: rows * rH, hits };
}

function drawRest(x, cx, y, d, c) {
  x.strokeStyle = c; x.fillStyle = c; x.lineJoin = "round"; x.lineCap = "round";
  if (d === 1) { x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 4, y - 30); x.lineTo(cx + 4, y - 20); x.lineTo(cx - 4, y - 10); x.lineTo(cx + 5, y); x.quadraticCurveTo(cx - 8, y - 3, cx - 1, y + 10); x.stroke(); }
  else if (d === 2) { x.fillRect(cx - 9, y - 7, 18, 7); }
  else if (d >= 4) { x.fillRect(cx - 9, y, 18, 7); }
  else { x.lineWidth = 2.4; x.beginPath(); x.arc(cx - 3, y - 18, 3, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(cx - 1, y - 17); x.quadraticCurveTo(cx + 5, y - 16, cx + 7, y - 21); x.lineTo(cx + 1, y + 2); x.stroke(); }
  x.lineCap = "butt";
}
function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }

/** Melody contour: one bar per note, higher notes sit higher. Sits above the notation for sing-alongs. */
export function drawContour(x, box, song, doMidi, now, C = INK) {
  const beats = song.beats || 4, notes = toNotes(song.bars, beats), total = song.bars.length * beats;
  let lo = 99, hi = -99; notes.forEach((n) => { if (!n.rest) { lo = Math.min(lo, n.sv); hi = Math.max(hi, n.sv); } });
  const X = (p) => box.x + (p / total) * box.w, Y = (v) => box.y + box.h - 10 - ((v - lo) / Math.max(1, hi - lo)) * (box.h - 20);
  for (let b = 0; b <= song.bars.length; b++) { x.strokeStyle = C.rule; x.lineWidth = 1; x.beginPath(); x.moveTo(X(b * beats), box.y); x.lineTo(X(b * beats), box.y + box.h); x.stroke(); }
  notes.forEach((n) => {
    if (n.rest) return;
    const on = now != null && now >= n.pos && now < n.pos + n.d, past = now != null && now >= n.pos + n.d;
    x.fillStyle = on ? C.red : past ? C.blue : C.soft; x.globalAlpha = on || past ? 1 : 0.55;
    rr(x, X(n.pos) + 2, Y(n.sv) - 5, Math.max(6, X(n.pos + n.d) - X(n.pos) - 4), 10, 5); x.fill(); x.globalAlpha = 1;
  });
  if (now != null && now >= 0 && now < total) { x.strokeStyle = C.red; x.lineWidth = 2.5; x.beginPath(); x.moveTo(X(now), box.y); x.lineTo(X(now), box.y + box.h); x.stroke(); }
}
