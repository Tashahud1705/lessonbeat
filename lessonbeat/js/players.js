// The three things you can play: clap-alongs, sing-alongs and backing tracks.
// Each player draws from the same data the AI wrote and the checker approved.
import { drawPiece, drawContour, fitCanvas, pieceHeight, INK } from "./notation.js";
import * as audio from "./audio.js";
import { pieceProblems, toNotes, bestKey, doMidiFor, KEYS, pretty, chord, bassLine, BASS_LEVELS, STYLES, cycleBeat, midiName, songSpan, SOLFA } from "./music.js";
import { $, $$, esc, toast, download, slug } from "./ui.js";

const view = new WeakMap(); // per-item display choices that are not worth saving
const stateOf = (item, init) => { if (!view.has(item)) view.set(item, init); return view.get(item); };
let uid = 0;
const toggle = (key, label, on) => `<label class="opt"><input type="checkbox" data-opt="${key}"${on ? " checked" : ""}><span>${label}</span></label>`;
const perRowFor = (w, bars) => (w >= 760 && bars >= 4 ? 4 : w >= 420 ? 2 : 1);

function head(kind, item, env, verdict) {
  return `<header class="player-head"><div><p class="kicker">${kind}${item.lesson && env.lessons > 1 ? ` · Lesson ${item.lesson}` : ""}</p>
    <h3 class="player-title"${env.readonly ? "" : ' contenteditable="plaintext-only" spellcheck="false"'}>${esc(item.title)}</h3></div>${verdict}</header>`;
}
function bindTitle(root, item, env) { const t = $(".player-title", root); if (t && !env.readonly) t.addEventListener("blur", () => { const v = t.textContent.trim().slice(0, 80); if (v && v !== item.title) { item.title = v; env.onChange(); } else t.textContent = item.title; }); }

/* ---------- video frames ---------- */
function videoCanvas() { const c = document.createElement("canvas"); c.width = 1280; c.height = 720; c.className = "offscreen"; document.body.appendChild(c); return c; }
function videoFrame(c, { kicker, title, sub, piece, opts, now, count, contour }) {
  const x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = "#F5EFE3"; x.fillRect(0, 0, 1280, 720);
  x.strokeStyle = "#D8CDB8"; x.lineWidth = 1; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, 122 + i * 5); x.lineTo(1280, 122 + i * 5); x.stroke(); }
  x.fillStyle = "#7B8093"; x.font = '600 18px "IBM Plex Mono", monospace'; x.fillText(kicker.toUpperCase(), 64, 54);
  x.fillStyle = "#1B2233"; x.font = '700 44px "Fraunces", Georgia, serif'; x.fillText(title, 64, 102);
  x.textAlign = "right"; x.fillStyle = "#7B8093"; x.font = '400 20px "Atkinson Hyperlegible", sans-serif'; x.fillText(sub, 1216, 100); x.textAlign = "left";
  const perRow = piece.bars.length >= 4 ? 4 : 2, natural = pieceHeight(piece.bars.length, perRow, opts) + (contour ? 96 : 0);
  const scale = Math.min(1.45, 520 / natural), w = 1152 / scale;
  x.save(); x.translate(64, 170); x.scale(scale, scale);
  let y = 0;
  if (contour) { drawContour(x, { x: 30, y: 0, w: w - 34, h: 80 }, piece, contour.doMidi, now, INK); y = 96; }
  drawPiece(x, { x: 0, y, w }, piece, { ...opts, perRow, now });
  x.restore();
  if (count != null) {
    x.fillStyle = "rgba(245,239,227,0.82)"; x.fillRect(0, 150, 1280, 570);
    x.fillStyle = "#C4412B"; x.font = '800 220px "Fraunces", Georgia, serif'; x.textAlign = "center"; x.fillText(String(count), 640, 470);
    x.fillStyle = "#1B2233"; x.font = '400 30px "Atkinson Hyperlegible", sans-serif'; x.fillText("Get ready", 640, 540); x.textAlign = "left";
  }
  x.fillStyle = "#7B8093"; x.font = '600 16px "IBM Plex Mono", monospace'; x.fillText("LESSONBEAT", 64, 690);
}
async function saveVideo(btn, title, seconds, begin) {
  if (!audio.canRecord()) { toast("This browser can't record video. Try Chrome or Edge on a computer.", "bad"); return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = `Recording… about ${Math.round(seconds)} s`;
  const canvas = videoCanvas();
  try {
    const { blob, ext } = await audio.recordVideo(canvas, (dest, done) => begin(canvas, dest, done));
    download(blob, `${slug(title)}.${ext}`); toast(`Video saved as ${ext.toUpperCase()}.`);
  } catch (e) { if (e.message !== "stopped") toast("The video could not be recorded. Try again in Chrome.", "bad"); }
  canvas.remove(); btn.disabled = false; btn.textContent = label;
}

/* ---------- clap-along ---------- */
export function mountClap(root, item, env) {
  const st = stateOf(item, { countIn: true, clicks: true, sound: true, names: true, count: false, edit: false });
  const id = "clap" + ++uid, beats = item.beats || 4;
  const verdict = () => { const p = pieceProblems(item.bars, beats, env.level); return p.length ? `<p class="verdict bad">${esc(p[0])}</p>` : `<p class="verdict ok">Checked: every bar adds up to ${beats} beats</p>`; };
  root.innerHTML = `<article class="player">${head("Clap-along", item, env, `<span data-verdict>${verdict()}</span>`)}
    <div class="stage"><canvas class="score" role="img" aria-label="Rhythm notation: ${esc(item.title)}"></canvas><div class="countin" hidden></div></div>
    <div class="transport"><button class="playbtn" type="button" aria-pressed="false"><span class="playicon" aria-hidden="true"></span><span data-label>Play</span></button>
      <label class="tempo"><span>Tempo</span><input type="range" min="50" max="160" step="2" value="${item.tempo}" aria-label="Tempo"><output>${item.tempo}</output><span class="unit">bpm</span></label></div>
    <div class="options">${toggle("countIn", "Count-in", st.countIn)}${toggle("clicks", "Beat clicks", st.clicks)}${toggle("sound", "Clap sound", st.sound)}${toggle("names", "Time names", st.names)}${toggle("count", "Beat numbers", st.count)}${env.readonly ? "" : toggle("edit", "Edit the rhythm", st.edit)}</div>
    <p class="edit-help" hidden>Click any beat to change it. The worksheets that use this rhythm change too.</p>
    ${item.tip ? `<p class="tip"><b>In class</b> ${esc(item.tip)}</p>` : ""}
    <div class="player-actions"><button class="btn small" type="button" data-video>Save as video</button></div></article>`;
  const cv = $("canvas", root), ci = $(".countin", root), btn = $(".playbtn", root);
  let hits = [];
  const opts = () => ({ names: st.names, count: st.count });
  const draw = (now = null, count = null) => {
    const w = cv.parentElement.clientWidth - 2; if (w < 50) return;
    const perRow = perRowFor(w, item.bars.length), h = pieceHeight(item.bars.length, perRow, opts());
    const x = fitCanvas(cv, w, h);
    hits = drawPiece(x, { x: 0, y: 0, w }, { beats, bars: item.bars }, { ...opts(), perRow, now, edit: st.edit && now == null }).hits;
    ci.hidden = count == null; if (count != null) ci.textContent = count;
  };
  const setPlaying = (on) => { btn.setAttribute("aria-pressed", on); $("[data-label]", btn).textContent = on ? "Stop" : "Play"; };
  btn.onclick = () => {
    if (audio.isPlaying(id)) return audio.stopAll();
    setPlaying(true);
    audio.playClap({ beats, bars: item.bars }, { id, tempo: item.tempo, countIn: st.countIn, clicks: st.clicks, sound: st.sound }, { onFrame: draw, onEnd: () => { setPlaying(false); draw(); } });
  };
  const range = $("input[type=range]", root);
  range.oninput = () => { item.tempo = +range.value; $("output", root).textContent = item.tempo; if (audio.isPlaying(id)) audio.stopAll(); };
  range.onchange = () => env.onChange();
  $$("[data-opt]", root).forEach((c) => (c.onchange = () => { st[c.dataset.opt] = c.checked; if (audio.isPlaying(id)) audio.stopAll(); $(".edit-help", root).hidden = !st.edit; cv.classList.toggle("editable", st.edit); draw(); }));
  cv.onclick = (e) => {
    if (!st.edit || env.readonly) return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const h = hits.find((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h); if (!h) return;
    item.bars[h.bar] = cycleBeat(item.bars[h.bar], h.beat, beats, env.level);
    $("[data-verdict]", root).innerHTML = verdict(); draw(); env.onChange();
  };
  $("[data-video]", root).onclick = (e) => saveVideo(e.currentTarget, item.title, (item.bars.length * beats * 2 + beats) * 60 / item.tempo, (canvas, dest, done) =>
    audio.playClap({ beats, bars: item.bars }, { id: id + "v", tempo: item.tempo, countIn: true, clicks: st.clicks, sound: true, recordTo: dest }, {
      onFrame: (now, count) => videoFrame(canvas, { kicker: "Clap-along", title: item.title, sub: `${item.tempo} beats per minute`, piece: { beats, bars: item.bars }, opts: { names: st.names, count: st.count }, now, count }),
      onEnd: done }));
  bindTitle(root, item, env);
  const ro = new ResizeObserver(() => { if (!audio.isPlaying(id)) draw(); }); ro.observe(cv.parentElement);
  $(".edit-help", root).hidden = !st.edit; draw();
  return { destroy() { ro.disconnect(); if (audio.isPlaying(id)) audio.stopAll(); } };
}

/* ---------- sing-along ---------- */
export function mountSing(root, item, env) {
  const st = stateOf(item, { voice: true, chords: true, clicks: true, claps: false, solfa: true, names: false });
  const id = "sing" + ++uid, beats = item.beats || 4;
  if (!item.key || !KEYS.includes(item.key)) item.key = bestKey(item.bars, env.level).key;
  const doMidi = () => doMidiFor(item.key, item.bars, env.level);
  const rangeText = () => { const [lo, hi] = songSpan(item.bars), d = doMidi(); return `${midiName(d + lo, item.key)} to ${midiName(d + hi, item.key)}`; };
  const suggested = bestKey(item.bars, env.level).key;
  root.innerHTML = `<article class="player">${head("Sing-along · original song", item, env, `<p class="verdict ok">Checked: rhythm adds up, range <span data-range>${rangeText()}</span></p>`)}
    <div class="stage"><canvas class="contour" aria-hidden="true"></canvas><canvas class="score" role="img" aria-label="Song notation with solfa and words: ${esc(item.title)}"></canvas><div class="countin" hidden></div></div>
    <div class="transport"><button class="playbtn" type="button" aria-pressed="false"><span class="playicon" aria-hidden="true"></span><span data-label>Play</span></button>
      <label class="tempo"><span>Tempo</span><input type="range" min="56" max="150" step="2" value="${item.tempo}" aria-label="Tempo"><output>${item.tempo}</output><span class="unit">bpm</span></label>
      <label class="pick"><span>Key (do)</span><select data-key>${KEYS.map((k) => `<option value="${k}"${k === item.key ? " selected" : ""}>${pretty(k)}${k === suggested ? " – best fit" : ""}</option>`).join("")}</select></label></div>
    <div class="options">${toggle("voice", "Guide voice", st.voice)}${toggle("chords", "Chords", st.chords)}${toggle("clicks", "Beat clicks", st.clicks)}${toggle("claps", "Clap the beat", st.claps)}${toggle("solfa", "Solfa", st.solfa)}${toggle("names", "Time names", st.names)}</div>
    ${item.tip ? `<p class="tip"><b>In class</b> ${esc(item.tip)}</p>` : ""}
    <div class="player-actions"><button class="btn small" type="button" data-video>Save as video</button><span class="fine">Words and tune written for this unit, so you can share it freely.</span></div></article>`;
  const cv = $("canvas.score", root), cc = $("canvas.contour", root), ci = $(".countin", root), btn = $(".playbtn", root);
  const opts = () => ({ names: st.names, solfa: st.solfa, words: true });
  const piece = () => ({ beats, bars: item.bars });
  const draw = (now = null, count = null) => {
    const w = cv.parentElement.clientWidth - 2; if (w < 50) return;
    const perRow = perRowFor(w, item.bars.length);
    const xc = fitCanvas(cc, w, 70); drawContour(xc, { x: 30, y: 2, w: w - 34, h: 66 }, piece(), doMidi(), now, INK);
    const x = fitCanvas(cv, w, pieceHeight(item.bars.length, perRow, opts()));
    drawPiece(x, { x: 0, y: 0, w }, piece(), { ...opts(), perRow, now });
    ci.hidden = count == null; if (count != null) ci.textContent = count;
  };
  const setPlaying = (on) => { btn.setAttribute("aria-pressed", on); $("[data-label]", btn).textContent = on ? "Stop" : "Play"; };
  const playOpts = (extra = {}) => ({ id, tempo: item.tempo, key: item.key, doMidi: doMidi(), voice: st.voice, chords: st.chords, clicks: st.clicks, claps: st.claps, ...extra });
  btn.onclick = () => { if (audio.isPlaying(id)) return audio.stopAll(); setPlaying(true); audio.playSing({ ...piece(), chords: item.chords }, playOpts(), { onFrame: draw, onEnd: () => { setPlaying(false); draw(); } }); };
  const range = $("input[type=range]", root);
  range.oninput = () => { item.tempo = +range.value; $("output", root).textContent = item.tempo; if (audio.isPlaying(id)) audio.stopAll(); };
  range.onchange = () => env.onChange();
  $("[data-key]", root).onchange = (e) => { item.key = e.target.value; if (audio.isPlaying(id)) audio.stopAll(); $("[data-range]", root).textContent = rangeText(); draw(); env.onChange(); };
  $$("[data-opt]", root).forEach((c) => (c.onchange = () => { st[c.dataset.opt] = c.checked; if (audio.isPlaying(id)) audio.stopAll(); draw(); }));
  $("[data-video]", root).onclick = (e) => saveVideo(e.currentTarget, item.title, (item.bars.length * beats + beats) * 60 / item.tempo, (canvas, dest, done) =>
    audio.playSing({ ...piece(), chords: item.chords }, playOpts({ id: id + "v", voice: true, recordTo: dest }), {
      onFrame: (now, count) => videoFrame(canvas, { kicker: "Sing-along", title: item.title, sub: `Key of ${pretty(item.key)} · ${item.tempo} bpm`, piece: piece(), opts: opts(), now, count, contour: { doMidi: doMidi() } }),
      onEnd: done }));
  bindTitle(root, item, env);
  const ro = new ResizeObserver(() => { if (!audio.isPlaying(id)) draw(); }); ro.observe(cv.parentElement);
  draw();
  return { destroy() { ro.disconnect(); if (audio.isPlaying(id)) audio.stopAll(); } };
}

/* ---------- backing track ---------- */
export function mountBacking(root, item, env) {
  const st = stateOf(item, { level: 1, bass: true, drums: true, chords: true, countIn: true });
  const id = "back" + ++uid;
  if (!KEYS.includes(item.key)) item.key = "C";
  if (!STYLES[item.style]) item.style = "pop";
  const beats = () => STYLES[item.style].beats;
  const live = () => ({ id, key: item.key, tempo: item.tempo, style: item.style, level: st.level, bass: st.bass, drums: st.drums, chords: st.chords, countIn: st.countIn });
  let player = null, s = live();
  root.innerHTML = `<article class="player">${head("Backing track", item, env, `<p class="verdict ok">${item.bars.length}-bar loop · plays until you stop it</p>`)}
    <div class="now" aria-live="off"><div class="now-chord"><span data-chord>—</span><small data-deg></small></div>
      <div class="now-bass"><small>Bass notes this bar</small><p data-bass></p></div>
      <div class="now-next"><small data-count>Ready</small><div class="dots" data-dots></div><p data-next></p></div></div>
    <div class="bars" data-bars></div>
    <div class="transport"><button class="playbtn" type="button" aria-pressed="false"><span class="playicon" aria-hidden="true"></span><span data-label>Play</span></button>
      <label class="tempo"><span>Tempo</span><input type="range" min="56" max="170" step="2" value="${item.tempo}" aria-label="Tempo"><output>${item.tempo}</output><span class="unit">bpm</span></label>
      <label class="pick"><span>Feel</span><select data-style>${Object.entries(STYLES).map(([k, v]) => `<option value="${k}"${k === item.style ? " selected" : ""}>${v.name}</option>`).join("")}</select></label></div>
    <fieldset class="keys"><legend>Key</legend>${KEYS.map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === item.key}">${pretty(k)}</button>`).join("")}</fieldset>
    <fieldset class="levels"><legend>Bass line for students to play</legend>${BASS_LEVELS.map((l) => `<button type="button" data-l="${l.id}" aria-pressed="${l.id === st.level}"><b>${l.id}. ${l.name}</b><small>${l.desc}</small></button>`).join("")}</fieldset>
    <div class="options">${toggle("bass", "Bass guide (turn off so students are the bass)", st.bass)}${toggle("drums", "Drums", st.drums)}${toggle("chords", "Chords", st.chords)}${toggle("countIn", "Count-in", st.countIn)}</div>
    ${item.use ? `<p class="tip"><b>Students</b> ${esc(item.use)}</p>` : ""}${item.tip ? `<p class="tip"><b>In class</b> ${esc(item.tip)}</p>` : ""}</article>`;
  const grid = $("[data-bars]", root), btn = $(".playbtn", root);
  const renderBars = () => {
    grid.innerHTML = item.bars.map((n, i) => { const c = chord(n, item.key), line = bassLine(item.bars, i, item.key, st.level, beats()); return `<div class="bar" data-i="${i}"><div class="bar-top"><span>${i + 1}</span><span>${esc(n)}</span></div><div class="bar-chord">${esc(c.name)}</div><div class="bar-bass">${line.map((x) => `<span>${esc(x.name)}</span>`).join("")}</div></div>`; }).join("");
    $("[data-dots]", root).innerHTML = Array.from({ length: beats() }, () => "<i></i>").join("");
    readout(0, null);
  };
  const readout = (bar, beat) => {
    const c = chord(item.bars[bar], item.key), nx = chord(item.bars[(bar + 1) % item.bars.length], item.key), line = bassLine(item.bars, bar, item.key, st.level, beats());
    $("[data-chord]", root).textContent = c.name; $("[data-deg]", root).textContent = `${item.bars[bar]} chord · bar ${bar + 1}`;
    $("[data-bass]", root).innerHTML = line.map((x, i) => `<span class="${beat === i ? "on" : ""}">${esc(x.name)}</span>`).join("");
    $("[data-next]", root).textContent = "Next: " + nx.name;
  };
  const onBeat = (e) => {
    $$(".bar.on", grid).forEach((b) => b.classList.remove("on")); $$(".bar-bass .on", grid).forEach((b) => b.classList.remove("on"));
    const dots = $$("[data-dots] i", root); dots.forEach((d) => d.classList.remove("on"));
    if (!e) { $("[data-count]", root).textContent = "Ready"; readout(0, null); return; }
    if (e.count) { $("[data-count]", root).textContent = "Count-in " + e.count; dots[e.count - 1] && dots[e.count - 1].classList.add("on"); return; }
    $("[data-count]", root).textContent = "Time through: " + e.round;
    const cell = $(`.bar[data-i="${e.bar}"]`, grid); if (cell) { cell.classList.add("on"); const sp = $$(".bar-bass span", cell)[e.beat]; sp && sp.classList.add("on"); }
    dots[e.beat] && dots[e.beat].classList.add("on"); readout(e.bar, e.beat);
  };
  const setPlaying = (on) => { btn.setAttribute("aria-pressed", on); $("[data-label]", btn).textContent = on ? "Stop" : "Play"; };
  const sync = () => { Object.assign(s, live()); if (player && player.on) player.setMix(); };
  btn.onclick = () => {
    if (player && player.on) return player.stop();
    s = live(); player = new audio.Backing(item, s, { onBeat, onStop: () => setPlaying(false) }); player.start(); setPlaying(true);
  };
  const range = $("input[type=range]", root);
  range.oninput = () => { item.tempo = +range.value; $("output", root).textContent = item.tempo; sync(); };
  range.onchange = () => env.onChange();
  $("[data-style]", root).onchange = (e) => { const was = beats(); item.style = e.target.value; if (beats() !== was && player && player.on) player.stop(); sync(); renderBars(); env.onChange(); };
  $$("[data-k]", root).forEach((b) => (b.onclick = () => { item.key = b.dataset.k; $$("[data-k]", root).forEach((q) => q.setAttribute("aria-pressed", q === b)); sync(); renderBars(); env.onChange(); }));
  $$("[data-l]", root).forEach((b) => (b.onclick = () => { st.level = +b.dataset.l; $$("[data-l]", root).forEach((q) => q.setAttribute("aria-pressed", q === b)); sync(); renderBars(); }));
  $$("[data-opt]", root).forEach((c) => (c.onchange = () => { st[c.dataset.opt] = c.checked; sync(); }));
  bindTitle(root, item, env);
  renderBars();
  return { destroy() { if (player && player.on) player.stop(); } };
}

/** A small backing track for the home page, so the first thing a teacher meets is the sound. */
export function mountTaster(root) {
  const item = { title: "Four chords, any key", lesson: 0, style: "pop", tempo: 96, key: "C", bars: ["I", "V", "vi", "IV"], use: "", tip: "" };
  return mountBacking(root, item, { level: 2, lessons: 1, readonly: true, onChange() {} });
}
export { SOLFA, toNotes };
