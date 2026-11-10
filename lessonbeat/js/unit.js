// The unit page: overview, lessons, playable media, worksheets and assessment,
// plus everything that happens after generation (editing, asking for changes, printing, sharing).
import * as api from "./api.js";
import * as audio from "./audio.js";
import { $, $$, esc, toast, debounce, download, slug, modal, plural } from "./ui.js";
import { levelOf, bandOf } from "./music.js";
import { stateOf, MODELS, AC_URL } from "./data.js";
import { mountClap, mountSing, mountBacking } from "./players.js";
import { worksheetHTML, paintSheets } from "./sheets.js";
import { drawPiece, fitCanvas, pieceHeight, PRINT } from "./notation.js";

let U = null, tab = "overview", openLesson = 0, mounted = [], jobs = new Map(), docCache = null, codeRows = [], view = null;
const TABS = [["overview", "Overview"], ["lessons", "Lessons"], ["play", "Play"], ["worksheets", "Worksheets"], ["assessment", "Assessment"]];
const C = () => U.content;
const env = () => ({ level: levelOf(U.form.year), year: U.form.year, lessons: U.form.lessons, readonly: U.readonly, unitTitle: U.title, onChange: save });
const save = debounce(async () => { if (U.readonly) return; try { await api.updateUnit(U.id, { title: U.title, content: U.content }); flag("Saved"); } catch (e) { flag("Not saved – check your connection", true); } }, 700);
function flag(text, bad) { const f = $("#saveflag"); if (f) { f.textContent = text; f.classList.toggle("bad", !!bad); } }
function unmount() { mounted.forEach((m) => m.destroy()); mounted = []; audio.stopAll(); }

/* ---------- building a new unit ---------- */
export async function createFromForm(form, onStatus) {
  onStatus("Reading your documents…");
  const docs = await api.docTexts(form.docIds || []);
  onStatus(form.lessons === 1 ? "Planning the lesson…" : `Sequencing ${form.lessons} lessons…`);
  const r = await api.generate("outline", { ...form, docs });
  const content = { outline: r.data, plans: Array(form.lessons).fill(null), media: null, assessment: null, worksheets: null, notes: [] };
  const row = await api.createUnit(r.data.title, form, content);
  docCache = { id: row.id, docs };
  return row.id;
}
const wants = (f) => ({ media: f.clap + f.sing + f.backing > 0, assessment: f.formative + f.summative > 0, worksheets: f.worksheets > 0 });
async function formWithDocs() {
  if (!docCache || docCache.id !== U.id) docCache = { id: U.id, docs: await api.docTexts(U.form.docIds || []).catch(() => []) };
  return { ...U.form, docs: docCache.docs };
}
const outlineBrief = () => C().outline.lessons.map((l) => ({ title: l.title, focus: l.focus, li: l.li }));
const mediaFor = (n) => { const m = C().media || {}; return [...(m.clap || []).map((x) => ["Clap-along", x]), ...(m.sing || []).map((x) => ["Sing-along", x]), ...(m.backing || []).map((x) => ["Backing track", x])].filter(([, x]) => x.lesson === n); };

async function job(key, fn) {
  if (jobs.get(key)?.status === "run") return;
  jobs.set(key, { status: "run" }); softPaint(key);
  const mine = U.id;
  try {
    const out = await fn();
    if (!U || U.id !== mine) return;
    jobs.delete(key);
    if (out?.meta?.repaired?.length) C().notes = [...(C().notes || []), ...out.meta.repaired].slice(-12);
    await api.updateUnit(U.id, { title: U.title, content: U.content });
  } catch (e) {
    if (!U || U.id !== mine) return;
    jobs.set(key, { status: "fail", error: e.message || "Something went wrong." });
  }
  softPaint(key);
}
const writeMedia = () => job("media", async () => { const r = await api.generate("media", await formWithDocs(), { unitTitle: U.title, outline: outlineBrief() }); C().media = r.data; return r; });
const writeAssessment = (instruction) => job("assessment", async () => { const r = await api.generate(instruction ? "revise" : "assessment", await formWithDocs(), { scope: "assessment", instruction, unitTitle: U.title, outline: outlineBrief() }); C().assessment = r.data; return r; });
const writeWorksheets = (instruction) => job("worksheets", async () => { const r = await api.generate(instruction ? "revise" : "worksheets", await formWithDocs(), { scope: "worksheets", instruction, unitTitle: U.title, outline: outlineBrief(), vocab: (C().outline.vocabulary || []).map((v) => v.term), claps: (C().media?.clap || []).map((c) => c.title) }); C().worksheets = r.data.worksheets; return r; });
const writeLesson = (i, instruction) => job("lesson:" + i, async () => {
  const r = await api.generate(instruction ? "revise" : "lesson", await formWithDocs(), { scope: "lesson", instruction, index: i, unitTitle: U.title, outline: outlineBrief(), lesson: C().outline.lessons[i], media: mediaFor(i + 1).map(([k, x]) => `${k} "${x.title}"`) });
  C().plans[i] = r.data; return r;
});
/** Writes whatever the unit is still missing. Safe to call again after a reload or a failure. */
async function fillIn() {
  const w = wants(U.form), first = [];
  if (w.media && !C().media) first.push(writeMedia());
  if (w.assessment && !C().assessment) first.push(writeAssessment());
  await first[0]; // lessons name the media, so wait for it (or for its failure)
  const todo = C().plans.map((p, i) => (p ? null : i)).filter((i) => i != null);
  const queue = todo.map((i) => () => writeLesson(i));
  if (w.worksheets && !C().worksheets) queue.push(() => writeWorksheets());
  const worker = async () => { while (queue.length && U) await queue.shift()(); };
  await Promise.all([worker(), worker(), worker(), ...first]);
}
const remaining = () => { const w = wants(U.form); return C().plans.filter((p) => !p).length + (w.media && !C().media ? 1 : 0) + (w.assessment && !C().assessment ? 1 : 0) + (w.worksheets && !C().worksheets ? 1 : 0); };
const anyRunning = () => [...jobs.values()].some((j) => j.status === "run");

/* ---------- opening ---------- */
export async function openUnit(root, id, { shared } = {}) {
  view = root; unmount(); jobs = new Map(); tab = "overview"; openLesson = 0;
  root.innerHTML = `<p class="loading">Opening…</p>`;
  const [row, mine, rows] = await Promise.all([api.getUnit(id), api.me(), api.codes()]);
  codeRows = rows;
  U = { ...row, readonly: !!shared || (row.user_id && row.user_id !== mine.id && !api.MOCK) };
  if (!C().plans) C().plans = [];
  document.title = `${U.title} – Lessonbeat`;
  paint();
  if (!U.readonly && remaining()) fillIn();
}
export function leaveUnit() { unmount(); U = null; }

/* ---------- painting ---------- */
function progressHTML() {
  const left = remaining(), running = anyRunning();
  if (!left || U.readonly) return "";
  return `<span class="spin${running ? "" : " off"}" aria-hidden="true"></span><p>${running ? `Writing the rest of your unit. ${plural(left, "part")} to go \u2013 you can start reading now.` : `${plural(left, "part")} still to write.`}</p>${running ? "" : `<button class="btn small primary" data-act="resume">Finish writing</button>`}`;
}
const tabsHTML = () => TABS.map(([id, name]) => `<button role="tab" aria-selected="${tab === id}" data-tab="${id}">${name}${badge(id)}</button>`).join("");
function paint() {
  if (!U || !view) return;
  const f = U.form;
  unmount();
  view.innerHTML = `
  <div class="unit-head">
    <p class="kicker">${esc(f.year)} \u00B7 ${esc(f.state)} \u00B7 ${f.lessons === 1 ? `one ${f.length}-minute lesson` : `${f.lessons} lessons of ${f.length} minutes`} \u00B7 ${esc(MODELS.find((m) => m.id === f.model)?.name || "")}</p>
    <h1 class="unit-title"${U.readonly ? "" : ' contenteditable="plaintext-only" spellcheck="false"'}>${esc(U.title)}</h1>
    <div class="unit-actions">${U.readonly ? `<span class="fine">Shared with you \u00B7 view only</span>` : `<span id="saveflag" class="fine">Saved</span>`}
      <button class="btn small" data-act="print">Print or save as PDF</button><button class="btn small" data-act="word">Download for Word</button>${U.readonly ? "" : `<button class="btn small" data-act="share">${U.is_shared ? "Sharing is on" : "Share"}</button>`}</div>
    <div class="progress" role="status" id="progress"${progressHTML() ? "" : " hidden"}>${progressHTML()}</div>
  </div>
  <div class="tabs" role="tablist" id="tabs">${tabsHTML()}</div>
  <section class="page" id="page">${panel()}</section>
  <div id="askwrap">${U.readonly ? "" : askBar()}</div>`;
  bind(view);
}
/** A background job finished: refresh only what it touched, so nobody loses their place, their typing or the music. */
function softPaint(key) {
  if (!U || !view || !$("#page", view)) return;
  const pr = $("#progress", view); pr.innerHTML = progressHTML(); pr.hidden = !pr.innerHTML; bind(pr);
  const tb = $("#tabs", view); tb.innerHTML = tabsHTML(); bind(tb);
  const kind = key.split(":")[0], shows = { lesson: "lessons", media: "play", assessment: "assessment", worksheets: "worksheets" }[kind] === tab;
  const typing = document.activeElement && document.activeElement.isContentEditable;
  if (shows && !typing) { unmount(); $("#page", view).innerHTML = panel(); bind($("#page", view)); $("#askwrap", view).innerHTML = U.readonly ? "" : askBar(); bind($("#askwrap", view)); }
}
function badge(id) {
  const c = C(), m = c.media || {};
  const n = id === "lessons" ? U.form.lessons : id === "play" ? (m.clap?.length || 0) + (m.sing?.length || 0) + (m.backing?.length || 0) : id === "worksheets" ? c.worksheets?.length || 0 : id === "assessment" ? (c.assessment?.formative?.length || 0) + (c.assessment?.summative?.length || 0) : 0;
  return n ? `<span class="count">${n}</span>` : "";
}
const E = (path, text, tag = "span", cls = "") => `<${tag} class="${cls}"${U.readonly ? "" : ` contenteditable="plaintext-only" data-edit="${path}"`}>${esc(text)}</${tag}>`;
function pending(key, what, retry) {
  const j = jobs.get(key);
  if (j?.status === "run") return `<div class="wait"><span class="spin" aria-hidden="true"></span><p>Writing ${what}…</p></div>`;
  if (j?.status === "fail") return `<div class="wait bad"><p><b>${esc(what[0].toUpperCase() + what.slice(1))} could not be written.</b> ${esc(j.error)}</p>${U.readonly ? "" : `<button class="btn small" data-retry="${retry}">Try again</button>`}</div>`;
  return `<div class="wait"><p>${esc(what[0].toUpperCase() + what.slice(1))} has not been written yet.</p>${U.readonly ? "" : `<button class="btn small" data-retry="${retry}">Write it now</button>`}</div>`;
}
const codeChip = (code) => { const r = codeRows.find((x) => x.code === code); return `<a class="code" href="${AC_URL}" target="_blank" rel="noopener" title="${esc(r ? r.description : "")}">${esc(code)}</a>`; };

function panel() { return { overview, lessons, play, worksheets, assessment }[tab](); }

function overview() {
  const o = C().outline, f = U.form, st = stateOf(f.state), senior = bandOf(f.year) === "Senior";
  const used = [...new Set(o.lessons.flatMap((l) => l.codes || []))];
  return `<div class="cols">
    <div>
      <h2 class="sec">About this ${f.lessons === 1 ? "lesson" : "unit"}</h2>
      ${E("outline.summary", o.summary, "p", "lede")}
      <dl class="facts"><dt>Big idea</dt><dd>${E("outline.bigIdea", o.bigIdea)}</dd><dt>Students already know</dt><dd>${E("outline.priorKnowledge", o.priorKnowledge)}</dd></dl>
      <h2 class="sec">Sequence</h2>
      <ol class="seq">${o.lessons.map((l, i) => `<li><button class="seq-go" data-lesson="${i}"><span class="seq-n">${i + 1}</span><span><b>${esc(l.title)}</b><small>${esc(l.focus)}</small></span></button></li>`).join("")}</ol>
    </div>
    <aside>
      <h2 class="sec">Curriculum</h2>
      ${senior ? `<p><b>${esc(f.senior?.course || st.senior + " Music")}</b>${f.senior?.unit ? `, ${esc(f.senior.unit)}` : ""}</p><p class="fine">Senior courses are set by ${esc(st.authority)}. Lessonbeat does not reproduce the study design, so check outcomes against the <a href="${st.seniorUrl}" target="_blank" rel="noopener">current official document</a>.</p>${f.senior?.outcomes ? `<p class="quote">${esc(f.senior.outcomes)}</p>` : ""}`
      : `<ul class="codes">${used.map((c) => { const r = codeRows.find((x) => x.code === c); return `<li>${codeChip(c)}<span>${esc(r ? r.description : "")}${r && !r.verbatim ? " <em>(summary)</em>" : ""}</span></li>`; }).join("")}</ul>
        <p class="fine">Australian Curriculum v9.0 Music, ${esc(bandOf(f.year))}. ${used.some((c) => codeRows.find((x) => x.code === c && !x.verbatim)) ? "Years 7–10 descriptions are summarised here; " : ""}<a href="${AC_URL}" target="_blank" rel="noopener">read the official wording</a>.</p>
        ${st.id !== "QLD" && st.f10 !== "Australian Curriculum v9.0" ? `<p class="fine">${esc(st.name)} schools report against the ${esc(st.f10)}, which is closely based on these descriptions. <a href="${st.url}" target="_blank" rel="noopener">Check the matching ${esc(st.authority)} codes</a>.</p>` : ""}`}
      ${f.include?.vocab !== false && o.vocabulary?.length ? `<h2 class="sec">Vocabulary</h2><dl class="vocab">${o.vocabulary.map((v) => `<dt>${esc(v.term)}</dt><dd>${esc(v.meaning)}</dd>`).join("")}</dl>` : ""}
      ${C().notes?.length ? `<h2 class="sec">Music check</h2><p class="fine">The checker corrected ${plural(C().notes.length, "thing")} in the AI's music before showing it to you:</p><ul class="fine">${C().notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    </aside></div>`;
}

function lessons() {
  const o = C().outline, f = U.form, i = Math.min(openLesson, o.lessons.length - 1), l = o.lessons[i], p = C().plans[i], inc = f.include || {};
  const media = mediaFor(i + 1);
  let t = 0;
  const plan = !p ? pending("lesson:" + i, "this lesson plan", "lesson:" + i) : `
    <table class="phases"><thead><tr><th>Time</th><th>Teacher</th><th>Students</th></tr></thead><tbody>
    ${p.phases.map((ph, k) => { const from = t; t += ph.minutes; return `<tr><th scope="row">${inc.timings !== false ? `<span class="mins">${from}–${t}<small>min</small></span>` : ""}<span class="phase">${esc(ph.name)}</span></th><td>${E(`plans.${i}.phases.${k}.teacher`, ph.teacher)}</td><td>${E(`plans.${i}.phases.${k}.students`, ph.students)}</td></tr>`; }).join("")}
    </tbody></table>
    <div class="cols tight">
      ${inc.diff !== false ? `<div><h3 class="sub">Support</h3><p>${E(`plans.${i}.support`, p.support)}</p><h3 class="sub">Extend</h3><p>${E(`plans.${i}.extend`, p.extend)}</p></div>` : "<div></div>"}
      <div>${p.materials?.length ? `<h3 class="sub">You will need</h3><ul class="plain">${p.materials.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${p.notes ? `<h3 class="sub">Tips</h3><p>${E(`plans.${i}.notes`, p.notes)}</p>` : ""}
      ${p.search?.length ? `<h3 class="sub">Find a listening example</h3><ul class="plain">${p.search.map((s) => `<li><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(s.query)}" target="_blank" rel="noopener">${esc(s.label || s.query)}</a> <span class="fine">(opens a YouTube search – preview before class)</span></li>`).join("")}</ul>` : ""}</div>
    </div>`;
  return `<div class="lesson-layout">
    <nav class="lesson-nav" aria-label="Lessons">${o.lessons.map((x, k) => `<button data-lesson="${k}" aria-current="${k === i}"><span>${k + 1}</span>${esc(x.title)}${jobs.get("lesson:" + k)?.status === "run" ? '<i class="spin" aria-hidden="true"></i>' : !C().plans[k] ? '<i class="dot" aria-hidden="true"></i>' : ""}</button>`).join("")}</nav>
    <article class="lesson">
      <p class="kicker">Lesson ${i + 1} of ${o.lessons.length} · ${f.length} minutes ${(l.codes || []).map(codeChip).join(" ")}</p>
      ${E(`outline.lessons.${i}.title`, l.title, "h2", "lesson-title")}
      ${E(`outline.lessons.${i}.focus`, l.focus, "p", "lede")}
      ${inc.li !== false || inc.sc !== false ? `<div class="lisc">${inc.li !== false ? `<div><h3 class="sub">Learning intention</h3><p>${E(`outline.lessons.${i}.li`, l.li)}</p></div>` : ""}${inc.sc !== false ? `<div><h3 class="sub">Success criteria</h3><ul class="plain">${(l.sc || []).map((s, k) => `<li>${E(`outline.lessons.${i}.sc.${k}`, s)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
      ${media.length ? `<p class="uses">Uses ${media.map(([k, x]) => `<button class="link" data-tab="play">${esc(k.toLowerCase())} “${esc(x.title)}”</button>`).join(", ")}</p>` : ""}
      ${plan}
      ${l.formative ? `<p class="check"><b>Quick check</b> ${E(`outline.lessons.${i}.formative`, l.formative)}</p>` : ""}
    </article></div>`;
}

function play() {
  const m = C().media;
  if (!wants(U.form).media && !m) return `<p class="empty">This unit was planned without clap-alongs, sing-alongs or backing tracks.</p>`;
  if (!m) return pending("media", "the clap-alongs, sing-along and backing track", "media");
  const sec = (title, list, kind) => (list?.length ? `<h2 class="sec">${title}</h2>${list.map((_, i) => `<div data-player="${kind}:${i}"></div>`).join("")}` : "");
  return sec("Clap-alongs", m.clap, "clap") + sec("Sing-alongs", m.sing, "sing") + sec("Backing tracks", m.backing, "backing") || `<p class="empty">No media in this unit.</p>`;
}
function worksheets() {
  const w = C().worksheets;
  if (!wants(U.form).worksheets && !w) return `<p class="empty">This unit was planned without worksheets.</p>`;
  if (!w) return pending("worksheets", "the worksheets", "worksheets");
  if (jobs.get("worksheets")?.status === "run") return pending("worksheets", "the worksheets", "worksheets");
  if (!w.length) return `<p class="empty">No worksheets came back. Ask for a change below to write some.</p>`;
  return w.map((ws, i) => `<div class="sheet-wrap">${worksheetHTML(ws, i, env())}<p class="sheet-actions"><button class="btn small" data-printsheet="${i}">Print this worksheet</button></p></div>`).join("");
}
function assessment() {
  const a = C().assessment;
  if (!wants(U.form).assessment && !a) return `<p class="empty">This unit was planned without assessment.</p>`;
  if (!a || jobs.get("assessment")?.status === "run") return pending("assessment", "the assessment", "assessment");
  return `${a.formative?.length ? `<h2 class="sec">Formative checks</h2><div class="formative">${a.formative.map((x, i) => `<div><p class="kicker">Lesson ${x.lesson}</p><h3>${E(`assessment.formative.${i}.title`, x.title)}</h3><p>${E(`assessment.formative.${i}.how`, x.how)}</p><p class="fine"><b>Look for</b> ${E(`assessment.formative.${i}.lookFor`, x.lookFor)}</p></div>`).join("")}</div>` : ""}
    ${(a.summative || []).map((s, i) => `<h2 class="sec">Summative task${a.summative.length > 1 ? " " + (i + 1) : ""}</h2><article class="task"><p class="kicker">${esc(s.type)}</p><h3>${E(`assessment.summative.${i}.title`, s.title)}</h3><p>${E(`assessment.summative.${i}.task`, s.task)}</p>${s.student ? `<p class="quote"><b>Say to students</b> ${E(`assessment.summative.${i}.student`, s.student)}</p>` : ""}
      ${s.criteria?.length ? `<div class="scroll"><table class="rubric"><thead><tr><th>Criteria</th><th>Beginning</th><th>Developing</th><th>Achieving</th><th>Excelling</th></tr></thead><tbody>${s.criteria.map((c, k) => `<tr><th scope="row">${E(`assessment.summative.${i}.criteria.${k}.name`, c.name)}</th>${c.levels.map((lv, q) => `<td>${E(`assessment.summative.${i}.criteria.${k}.levels.${q}`, lv)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}</article>`).join("")}`;
}

/* ---------- ask for a change ---------- */
function scopes() {
  const m = C().media || {};
  if (tab === "overview") return [["outline", "the unit outline"]];
  if (tab === "lessons") return C().plans[openLesson] ? [["lesson:" + openLesson, `lesson ${openLesson + 1}`]] : [];
  if (tab === "play") return [...(m.clap || []).map((x, i) => ["clap:" + i, `clap-along “${x.title}”`]), ...(m.sing || []).map((x, i) => ["sing:" + i, `sing-along “${x.title}”`]), ...(m.backing || []).map((x, i) => ["backing:" + i, `backing track “${x.title}”`])];
  if (tab === "worksheets") return C().worksheets ? [["worksheets", "the worksheets"]] : [];
  return C().assessment ? [["assessment", "the assessment"]] : [];
}
const HINTS = { overview: "e.g. add a lesson on dynamics before the performance", lessons: "e.g. make this easier, or add a movement game at the start", play: "e.g. make it slower with no semiquavers, or change the words to be about rain", worksheets: "e.g. add a listening task, or make them suit Year 2 readers", assessment: "e.g. make the summative a group performance" };
function askBar() {
  const sc = scopes(); if (!sc.length) return "";
  return `<form class="ask" id="ask"><label for="ask-in">Ask for a change to</label>${sc.length > 1 ? `<select id="ask-scope" aria-label="What to change">${sc.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select>` : `<b>${esc(sc[0][1])}</b><input type="hidden" id="ask-scope" value="${sc[0][0]}">`}
    <input id="ask-in" type="text" maxlength="400" autocomplete="off" placeholder="${HINTS[tab]}"><button class="btn primary" type="submit">Change it</button></form>`;
}
async function ask(scope, instruction) {
  const [kind, idx] = scope.split(":"), i = +idx;
  const btn = $("#ask button"); if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try {
    if (kind === "lesson") await writeLesson(i, instruction);
    else if (kind === "assessment") await writeAssessment(instruction);
    else if (kind === "worksheets") await writeWorksheets(instruction);
    else if (kind === "outline") {
      const r = await api.generate("revise", await formWithDocs(), { scope: "outline", instruction, current: C().outline });
      C().outline = r.data; if (r.data.title) U.title = r.data.title;
      await api.updateUnit(U.id, { title: U.title, content: U.content });
      toast("Outline changed. Lesson plans keep their wording – rewrite any lesson whose focus moved.");
    } else {
      const r = await api.generate("revise", await formWithDocs(), { scope: kind, instruction, current: C().media[kind][i] });
      const keep = C().media[kind][i];
      C().media[kind][i] = { ...r.data, lesson: keep.lesson, key: r.data.key || keep.key };
      if (r.meta?.repaired?.length) toast("Changed. The music checker corrected: " + r.meta.repaired[0]); else toast("Changed.");
      await api.updateUnit(U.id, { title: U.title, content: U.content });
    }
    const j = jobs.get(kind === "lesson" ? "lesson:" + i : kind);
    if (j?.status === "fail") { toast(j.error, "bad"); jobs.delete(kind === "lesson" ? "lesson:" + i : kind); }
  } catch (e) { toast(e.message || "That change did not work. Try again.", "bad"); }
  paint();
}

/* ---------- events ---------- */
function setPath(path, value) { const keys = path.split("."); let o = C(); for (let k = 0; k < keys.length - 1; k++) o = o[keys[k]]; o[keys[keys.length - 1]] = value; }
function bind(root) {
  $$("[data-tab]", root).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; paint(); $("#page").scrollIntoView({ block: "nearest" }); }));
  $$("[data-lesson]", root).forEach((b) => (b.onclick = () => { openLesson = +b.dataset.lesson; tab = "lessons"; paint(); }));
  $$("[data-retry]", root).forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.retry.split(":"); jobs.delete(b.dataset.retry); k === "lesson" ? writeLesson(+i) : k === "media" ? writeMedia() : k === "assessment" ? writeAssessment() : writeWorksheets(); }));
  $$("[data-edit]", root).forEach((el) => el.addEventListener("blur", () => { const v = el.textContent.replace(/\s+/g, " ").trim(); setPath(el.dataset.edit, v); save(); flag("Saving…"); }));
  const title = $(".unit-title", root);
  if (title && !U.readonly) title.addEventListener("blur", () => { const v = title.textContent.trim().slice(0, 90); if (v) { U.title = v; C().outline.title = v; save(); } else title.textContent = U.title; });
  $$("[data-act]", root).forEach((b) => (b.onclick = () => ({ print: () => printUnit(), word: wordUnit, share, resume: () => { jobs = new Map(); fillIn(); } }[b.dataset.act]())));
  $$("[data-printsheet]", root).forEach((b) => (b.onclick = () => printUnit(+b.dataset.printsheet)));
  const form = $("#ask", root);
  if (form) form.onsubmit = (e) => { e.preventDefault(); const v = $("#ask-in").value.trim(); if (v.length < 3) { toast("Type what you would like changed."); return; } ask($("#ask-scope").value, v); };
  $$("[data-player]", root).forEach((el) => { const [kind, i] = el.dataset.player.split(":"), item = C().media[kind][+i]; mounted.push({ clap: mountClap, sing: mountSing, backing: mountBacking }[kind](el, item, env())); });
  if (tab === "worksheets" && C().worksheets && $(".sheet", root)) paintSheets(root, C().media?.clap || []);
}

/* ---------- sharing and export ---------- */
async function share() {
  const link = location.origin + location.pathname + "#/s/" + U.id;
  modal(`<h2>Share this unit</h2><p>Anyone with the link can view and play it. They cannot change it.</p>
    <label class="opt big"><input type="checkbox" id="sh-on"${U.is_shared ? " checked" : ""}><span>Turn on the share link</span></label>
    <div class="copyrow"${U.is_shared ? "" : " hidden"}><input id="sh-link" readonly value="${esc(link)}"><button class="btn primary" id="sh-copy">Copy link</button></div>`, (card) => {
    $("#sh-on", card).onchange = async (e) => { try { await api.updateUnit(U.id, { is_shared: e.target.checked }); U.is_shared = e.target.checked; $(".copyrow", card).hidden = !U.is_shared; const b = $('[data-act="share"]'); if (b) b.textContent = U.is_shared ? "Sharing is on" : "Share"; } catch (err) { toast("Could not change sharing. Try again.", "bad"); e.target.checked = U.is_shared; } };
    $("#sh-copy", card).onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch (e) { $("#sh-link", card).select(); toast("Press Ctrl or Cmd + C to copy."); } };
  });
}
function notationImage(piece, o) {
  const cv = document.createElement("canvas"), w = 680, perRow = piece.bars.length >= 4 ? 4 : 2;
  const x = fitCanvas(cv, w, pieceHeight(piece.bars.length, perRow, o));
  drawPiece(x, { x: 0, y: 0, w }, piece, { ...o, perRow, colors: PRINT });
  return `<img class="notation" src="${cv.toDataURL("image/png")}" alt="Notation">`;
}
function docHTML({ images }) {
  const o = C().outline, f = U.form, a = C().assessment, m = C().media || {}, inc = f.include || {};
  const used = [...new Set(o.lessons.flatMap((l) => l.codes || []))];
  let h = `<h1>${esc(U.title)}</h1><p class="meta">${esc(f.year)} · ${esc(f.state)} · ${f.lessons} × ${f.length} minutes</p><p>${esc(o.summary)}</p><p><b>Big idea:</b> ${esc(o.bigIdea)}</p><p><b>Students already know:</b> ${esc(o.priorKnowledge)}</p>`;
  if (used.length) h += `<h2>Curriculum (Australian Curriculum v9.0 Music)</h2><ul>${used.map((c) => `<li><b>${c}</b> ${esc(codeRows.find((x) => x.code === c)?.description || "")}</li>`).join("")}</ul>`;
  if (o.vocabulary?.length && inc.vocab !== false) h += `<h2>Vocabulary</h2><ul>${o.vocabulary.map((v) => `<li><b>${esc(v.term)}</b>: ${esc(v.meaning)}</li>`).join("")}</ul>`;
  o.lessons.forEach((l, i) => {
    const p = C().plans[i]; let t = 0;
    h += `<section class="brk"><h2>Lesson ${i + 1}: ${esc(l.title)}</h2><p>${esc(l.focus)} ${(l.codes || []).map((c) => `<b>${c}</b>`).join(" ")}</p>`;
    if (inc.li !== false) h += `<p><b>Learning intention:</b> ${esc(l.li)}</p>`;
    if (inc.sc !== false && l.sc?.length) h += `<p><b>Success criteria:</b></p><ul>${l.sc.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    if (p) {
      h += `<table><thead><tr><th>Time</th><th>Teacher</th><th>Students</th></tr></thead><tbody>${p.phases.map((ph) => { const from = t; t += ph.minutes; return `<tr><td><b>${esc(ph.name)}</b>${inc.timings !== false ? `<br>${from}–${t} min` : ""}</td><td>${esc(ph.teacher)}</td><td>${esc(ph.students)}</td></tr>`; }).join("")}</tbody></table>`;
      if (p.materials?.length) h += `<p><b>You will need:</b> ${p.materials.map(esc).join(", ")}</p>`;
      if (inc.diff !== false) h += `<p><b>Support:</b> ${esc(p.support)}</p><p><b>Extend:</b> ${esc(p.extend)}</p>`;
      if (p.notes) h += `<p><b>Tips:</b> ${esc(p.notes)}</p>`;
    }
    if (l.formative) h += `<p><b>Quick check:</b> ${esc(l.formative)}</p>`;
    h += `</section>`;
  });
  if (m.clap?.length || m.sing?.length || m.backing?.length) {
    h += `<section class="brk"><h2>Music for this unit</h2>`;
    (m.clap || []).forEach((c) => (h += `<h3>Clap-along: ${esc(c.title)} (${c.tempo} bpm)</h3>${images ? notationImage({ beats: c.beats || 4, bars: c.bars }, { names: true, count: true }) : ""}${c.tip ? `<p>${esc(c.tip)}</p>` : ""}`));
    (m.sing || []).forEach((s) => (h += `<h3>Sing-along: ${esc(s.title)} (do = ${esc(s.key || "C")}, ${s.tempo} bpm)</h3>${images ? notationImage({ beats: s.beats || 4, bars: s.bars }, { solfa: true, words: true }) : `<p>${s.bars.map((b) => b.map((n) => n.w).join(" ")).join(" / ")}</p>`}${s.tip ? `<p>${esc(s.tip)}</p>` : ""}`));
    (m.backing || []).forEach((b) => (h += `<h3>Backing track: ${esc(b.title)}</h3><p>Chords: ${b.bars.map(esc).join(" | ")} · ${b.tempo} bpm. ${esc(b.use || "")}</p>`));
    h += `<p><i>Play these at ${location.origin + location.pathname}</i></p></section>`;
  }
  if (a && (a.formative?.length || a.summative?.length)) {
    h += `<section class="brk"><h2>Assessment</h2>`;
    (a.formative || []).forEach((x) => (h += `<p><b>Lesson ${x.lesson} – ${esc(x.title)}:</b> ${esc(x.how)} <i>Look for: ${esc(x.lookFor)}</i></p>`));
    (a.summative || []).forEach((s) => (h += `<h3>${esc(s.title)} (${esc(s.type)})</h3><p>${esc(s.task)}</p>${s.student ? `<p><b>Say to students:</b> ${esc(s.student)}</p>` : ""}${s.criteria?.length ? `<table><thead><tr><th>Criteria</th><th>Beginning</th><th>Developing</th><th>Achieving</th><th>Excelling</th></tr></thead><tbody>${s.criteria.map((c) => `<tr><td><b>${esc(c.name)}</b></td>${c.levels.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}`));
    h += `</section>`;
  }
  return h;
}
function printUnit(sheetIndex) {
  const p = $("#print"), ws = C().worksheets || [];
  const sheets = (sheetIndex != null ? [ws[sheetIndex]] : ws).filter(Boolean).map((w, i) => `<div class="brk">${worksheetHTML(w, i, env())}</div>`).join("");
  p.innerHTML = sheetIndex != null ? sheets : `<div class="doc">${docHTML({ images: true })}</div>${sheets}`;
  paintSheets(p, C().media?.clap || [], 660);
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); p.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 150);
}
function wordUnit() {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(U.title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:22pt}h2{font-size:15pt;margin-top:18pt}h3{font-size:12pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5pt;vertical-align:top;text-align:left}th{background:#eee}.meta{color:#555}</style></head><body>${docHTML({ images: false })}<p><i>Worksheets and notation print from Lessonbeat (Print or save as PDF).</i></p></body></html>`;
  download(new Blob(["﻿", html], { type: "application/msword" }), slug(U.title) + ".doc");
  toast("Downloaded. Open it in Word or Google Docs to edit.");
}
