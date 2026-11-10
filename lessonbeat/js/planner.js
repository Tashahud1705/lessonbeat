// The planning form: a short run of tick-box pages, with a live summary of what will be made.
import * as api from "./api.js";
import { $, $$, esc, toast, tickbox, stepper, plural } from "./ui.js";
import { YEARS, bandOf } from "./music.js";
import { STATES, stateOf, MODELS, FOCUS, INSTRUMENTS, AUDIENCE, ATYPES, INCLUDES, DOC_PURPOSES, DEFAULT_FORM, AC_URL } from "./data.js";
import { extractText, ACCEPT } from "./docs.js";
import { createFromForm } from "./unit.js";

const STEPS = ["Your class", "Curriculum", "What you're teaching", "Lesson design", "Assessment and resources", "Your documents", "Check and create"];
let F = null, step = 0, root = null, codes = [], docs = [], busy = false;

export function loadForm() { try { const s = JSON.parse(sessionStorage.getItem("lb-form")); if (s && s.year) return { ...DEFAULT_FORM(), ...s }; } catch (e) { /* fresh form */ } return DEFAULT_FORM(); }
export function stashForm(f) { try { sessionStorage.setItem("lb-form", JSON.stringify(f)); } catch (e) { /* private mode */ } }
const keep = () => stashForm(F);
const yearLabel = (y) => (y === "Foundation" ? stateOf(F.state).foundation : y);

export async function openPlanner(el, { startAt } = {}) {
  root = el; F = loadForm(); step = startAt ?? 0; busy = false;
  root.innerHTML = `<p class="loading">Opening the planner…</p>`;
  [codes, docs] = await Promise.all([api.codes(), api.listDocs().catch(() => [])]);
  F.docIds = (F.docIds || []).filter((id) => docs.some((d) => d.id === id));
  render();
}

function render() {
  root.innerHTML = `<div class="planner">
    <nav class="steps" aria-label="Steps"><p class="kicker">Plan a unit</p><ol>${STEPS.map((s, i) => `<li><button data-step="${i}" aria-current="${i === step ? "step" : "false"}" class="${i < step ? "done" : ""}"><span>${i + 1}</span>${s}</button></li>`).join("")}</ol></nav>
    <form class="sheet-form" id="pf" novalidate><h1>${STEPS[step]}</h1>${page()}
      <div class="form-nav">${step > 0 ? `<button type="button" class="btn" data-go="-1">Back</button>` : "<span></span>"}${step < STEPS.length - 1 ? `<button type="button" class="btn primary" data-go="1">Next</button>` : `<button type="submit" class="btn primary big">Create my ${F.lessons === 1 ? "lesson" : "unit"}</button>`}</div></form>
    <aside class="rail" aria-label="What you will get"><p class="kicker">You will get</p>${rail()}</aside></div>`;
  bind();
}

function rail() {
  const band = bandOf(F.year), n = F.lessons;
  const rows = [
    [n === 1 ? "1 lesson plan" : `${n} lesson plans`, `${F.length} minutes each, ${MODELS.find((m) => m.id === F.model).name}`],
    F.clap ? [plural(F.clap, "clap-along"), "notation, sound and video"] : null,
    F.sing ? [plural(F.sing, "sing-along"), "an original song in a key that suits " + yearLabel(F.year)] : null,
    F.backing ? [plural(F.backing, "backing track"), "any key, four bass-line levels"] : null,
    F.worksheets ? [plural(F.worksheets, "worksheet"), "printable, matched to the rhythms"] : null,
    F.formative + F.summative ? ["Assessment", `${plural(F.formative, "formative check")}, ${plural(F.summative, "summative task")} with rubric`] : null,
  ].filter(Boolean);
  return `<ul class="gets">${rows.map(([a, b]) => `<li><b>${esc(a)}</b><small>${esc(b)}</small></li>`).join("")}</ul>
    <p class="fine">${esc(yearLabel(F.year))} · ${esc(F.state)}<br>${band === "Senior" ? esc(F.senior.course || stateOf(F.state).senior + " Music") : F.codes.length ? F.codes.map(esc).join(", ") : "Australian Curriculum v9.0 Music, " + esc(band)}</p>
    ${F.docIds.length ? `<p class="fine">Using ${plural(F.docIds.length, "document")} from your school.</p>` : ""}`;
}

function page() {
  const st = stateOf(F.state), band = bandOf(F.year);
  if (step === 0) return `
    <label class="field"><span>State or territory</span><select name="state">${STATES.map((s) => `<option${s.name === F.state ? " selected" : ""}>${s.name}</option>`).join("")}</select></label>
    <fieldset><legend>Year level</legend><div class="ticks years">${YEARS.map((y) => tickbox({ name: "year", value: y, label: yearLabel(y), checked: F.year === y, radio: true })).join("")}</div></fieldset>
    <div class="steppers">${stepper({ name: "lessons", value: F.lessons, min: 1, max: 12, label: "Lessons", unit: F.lessons === 1 ? "a single lesson" : "a unit" })}${stepper({ name: "length", value: F.length, min: 20, max: 120, label: "Minutes per lesson" })}</div>`;
  if (step === 1) {
    if (band === "Senior") return `
      <p class="help">Years 11 and 12 follow ${esc(st.authority)}'s ${esc(st.senior)} courses, not the Australian Curriculum. Lessonbeat doesn't hold the official study design wording, so tell it what you're covering. <a href="${st.seniorUrl}" target="_blank" rel="noopener">${esc(st.authority)} website</a></p>
      <label class="field"><span>Course</span><input name="s-course" list="courses" value="${esc(F.senior.course)}" placeholder="${esc(st.courses[0] || "e.g. Music Level 3")}"><datalist id="courses">${st.courses.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="field"><span>Unit or area of study <small>optional</small></span><input name="s-unit" value="${esc(F.senior.unit)}" placeholder="e.g. Unit 1, Area of Study 2"></label>
      <label class="field"><span>Outcomes or key knowledge you're targeting <small>paste from your study design, or upload it on the documents page</small></span><textarea name="s-outcomes" rows="5" placeholder="Paste the outcome statements or dot points here">${esc(F.senior.outcomes)}</textarea></label>`;
    const rows = codes.filter((c) => c.band === band), strands = [...new Set(rows.map((r) => r.strand))];
    return `<p class="help">Tick the content descriptions to cover, or leave them all blank and Lessonbeat will choose from this list. It can only use these codes, so it can't make one up.</p>
      ${strands.map((s) => `<fieldset><legend>${esc(s)}</legend><div class="ticks wide">${rows.filter((r) => r.strand === s).map((r) => tickbox({ name: "codes", value: r.code, label: r.code, note: r.description + (r.verbatim ? "" : " (summary)"), checked: F.codes.includes(r.code) })).join("")}</div></fieldset>`).join("")}
      <p class="fine">Australian Curriculum v9.0 Music, ${esc(band)} · © ACARA, CC BY 4.0 · <a href="${AC_URL}" target="_blank" rel="noopener">official wording</a>${rows.some((r) => !r.verbatim) ? " · Years 7–10 descriptions are summarised" : ""}</p>
      ${st.f10 !== "Australian Curriculum v9.0" && st.id !== "QLD" ? `<p class="note">${esc(st.name)} reports against the ${esc(st.f10)}. It is closely based on these descriptions. <a href="${st.url}" target="_blank" rel="noopener">Find the matching ${esc(st.authority)} codes</a> to add to your planner.</p>` : ""}`;
  }
  if (step === 2) return `
    <label class="field"><span>What do you want to teach?</span><textarea name="topic" rows="3" maxlength="600" placeholder="e.g. Beat versus rhythm, using body percussion, finishing with a class performance">${esc(F.topic)}</textarea></label>
    <fieldset><legend>Musical focus <small>tick any</small></legend><div class="ticks">${FOCUS.map((x) => tickbox({ name: "focus", value: x, label: x, checked: F.focus.includes(x) })).join("")}</div></fieldset>
    <fieldset><legend>What's in the room</legend><div class="ticks">${INSTRUMENTS.map((x) => tickbox({ name: "instruments", value: x, label: x, checked: F.instruments.includes(x) })).join("")}</div></fieldset>
    <div class="two"><label class="field"><span>Songs or pieces to include <small>optional</small></span><input name="songs" maxlength="300" value="${esc(F.songs)}" placeholder="e.g. Kookaburra, our assembly song"></label>
    <label class="field"><span>Anything to avoid <small>optional</small></span><input name="avoid" maxlength="300" value="${esc(F.avoid)}" placeholder="e.g. no recorders, no partner dancing"></label></div>`;
  if (step === 3) return `
    <fieldset><legend>Lesson structure</legend><div class="ticks wide">${MODELS.map((m) => tickbox({ name: "model", value: m.id, label: m.name, note: m.note, checked: F.model === m.id, radio: true })).join("")}</div></fieldset>
    <fieldset><legend>Include in every lesson</legend><div class="ticks">${INCLUDES.map((x) => tickbox({ name: "include", value: x.id, label: x.name, checked: F.include[x.id] !== false })).join("")}</div></fieldset>
    <fieldset><legend>Who will read the plan?</legend><div class="ticks wide">${AUDIENCE.map((a) => tickbox({ name: "audience", value: a.id, label: a.name, note: a.note, checked: F.audience === a.id, radio: true })).join("")}</div></fieldset>`;
  if (step === 4) return `
    <fieldset><legend>Music made for this unit</legend><div class="steppers">${stepper({ name: "clap", value: F.clap, min: 0, max: 4, label: "Clap-alongs" })}${stepper({ name: "sing", value: F.sing, min: 0, max: 3, label: "Sing-alongs" })}${stepper({ name: "backing", value: F.backing, min: 0, max: 2, label: "Backing tracks" })}</div>
      <p class="fine">Each one is written for these lessons, checked so every bar adds up, and plays on screen. You can save any of them as a video.</p></fieldset>
    <fieldset><legend>Assessment</legend><div class="steppers">${stepper({ name: "formative", value: F.formative, min: 0, max: 6, label: "Formative checks" })}${stepper({ name: "summative", value: F.summative, min: 0, max: 3, label: "Summative tasks" })}</div>
      <div class="ticks">${ATYPES.map((x) => tickbox({ name: "atype", value: x, label: x, checked: F.atype.includes(x) })).join("")}</div></fieldset>
    <fieldset><legend>Worksheets</legend><div class="steppers">${stepper({ name: "worksheets", value: F.worksheets, min: 0, max: 6, label: "Printable worksheets" })}</div></fieldset>`;
  if (step === 5) return `
    <p class="help">Upload your scope and sequence, a planning template or an old unit. Lessonbeat reads the text and follows it. Leave student names out of anything you upload.</p>
    <label class="drop" id="drop"><input type="file" id="file" accept="${ACCEPT}" multiple hidden><b>Choose files</b><span>or drop them here · PDF, Word or text · up to 15 MB each</span></label>
    <div id="doclist">${docList()}</div>`;
  const used = docs.filter((d) => F.docIds.includes(d.id));
  return `<dl class="review">
    <dt>Class</dt><dd>${esc(yearLabel(F.year))}, ${esc(F.state)} · ${F.lessons === 1 ? "one lesson" : F.lessons + " lessons"} of ${F.length} minutes <button type="button" class="link" data-step="0">Change</button></dd>
    <dt>Curriculum</dt><dd>${band === "Senior" ? esc(F.senior.course || "Senior music") + (F.senior.unit ? ", " + esc(F.senior.unit) : "") : F.codes.length ? F.codes.map(esc).join(", ") : "Lessonbeat chooses from the " + esc(band) + " descriptions"} <button type="button" class="link" data-step="1">Change</button></dd>
    <dt>Teaching</dt><dd>${F.topic ? esc(F.topic) : "<em>No topic typed yet</em>"}${F.focus.length ? "<br>" + F.focus.map(esc).join(", ") : ""}<br><span class="fine">In the room: ${F.instruments.length ? F.instruments.map(esc).join(", ") : "nothing ticked"}</span> <button type="button" class="link" data-step="2">Change</button></dd>
    <dt>Lesson design</dt><dd>${esc(MODELS.find((m) => m.id === F.model).name)} · written for ${esc(AUDIENCE.find((a) => a.id === F.audience).name.toLowerCase())}<br><span class="fine">${INCLUDES.filter((x) => F.include[x.id] !== false).map((x) => x.name).join(", ") || "No extras"}</span> <button type="button" class="link" data-step="3">Change</button></dd>
    <dt>Resources</dt><dd>${[F.clap && plural(F.clap, "clap-along"), F.sing && plural(F.sing, "sing-along"), F.backing && plural(F.backing, "backing track"), F.worksheets && plural(F.worksheets, "worksheet"), F.formative && plural(F.formative, "formative check"), F.summative && plural(F.summative, "summative task")].filter(Boolean).join(", ") || "Lesson plans only"} <button type="button" class="link" data-step="4">Change</button></dd>
    <dt>Documents</dt><dd>${used.length ? used.map((d) => esc(d.name)).join(", ") : "None"} <button type="button" class="link" data-step="5">Change</button></dd></dl>
    <label class="field"><span>Anything else Lessonbeat should know? <small>optional</small></span><textarea name="notes" rows="2" maxlength="600" placeholder="e.g. a class of 28 with two students who use ear defenders; we have a double lesson on Fridays">${esc(F.notes)}</textarea></label>
    <p class="fine">Creating takes about ${F.lessons <= 2 ? "one minute" : F.lessons <= 6 ? "two minutes" : "three minutes"}. The outline appears first and the rest fills in while you read.</p>
    <div id="status" class="status" hidden></div>`;
}
function docList() {
  if (!docs.length) return `<p class="fine">No documents yet.</p>`;
  return `<ul class="doclist">${docs.map((d) => `<li>${tickbox({ name: "docIds", value: d.id, label: d.name, note: `${Math.round(d.chars / 100) / 10}k characters read`, checked: F.docIds.includes(d.id) })}
    <select data-purpose="${d.id}" aria-label="How to use ${esc(d.name)}">${DOC_PURPOSES.map((p) => `<option${p === d.purpose ? " selected" : ""}>${p}</option>`).join("")}</select><button type="button" class="link danger" data-deldoc="${d.id}">Remove</button></li>`).join("")}</ul>
    <p class="fine">Lessonbeat uses the first 2,500 characters or so of each ticked document, up to four at a time.</p>`;
}

function read() {
  const f = $("#pf"); if (!f) return;
  const val = (n) => f.elements[n]?.value, all = (n) => $$(`input[name="${n}"]:checked`, f).map((i) => i.value), has = (n) => !!f.elements[n];
  if (has("state")) F.state = val("state");
  if (has("year")) { const y = all("year")[0]; if (y && y !== F.year) { F.year = y; F.codes = []; } }
  if ($('input[name="codes"]', f)) F.codes = all("codes");
  if (has("s-course")) F.senior = { course: val("s-course").trim(), unit: val("s-unit").trim(), outcomes: val("s-outcomes").trim() };
  if (has("topic")) { F.topic = val("topic").trim(); F.focus = all("focus"); F.instruments = all("instruments"); F.songs = val("songs").trim(); F.avoid = val("avoid").trim(); }
  if ($('input[name="model"]', f)) { F.model = all("model")[0] || F.model; const inc = all("include"); INCLUDES.forEach((x) => (F.include[x.id] = inc.includes(x.id))); F.audience = all("audience")[0] || F.audience; }
  if ($('input[name="atype"]', f)) F.atype = all("atype");
  if ($('input[name="docIds"]', f) || $("#drop", f)) F.docIds = all("docIds").slice(0, 4);
  if (has("notes")) F.notes = val("notes").trim();
  keep();
}
const refreshRail = () => { const r = $(".rail", root); if (r) r.innerHTML = `<p class="kicker">You will get</p>${rail()}`; };

function bind() {
  const f = $("#pf");
  f.addEventListener("change", (e) => { read(); if (e.target.name === "state" || e.target.name === "year") render(); else refreshRail(); });
  f.addEventListener("input", (e) => { if (e.target.matches("textarea, input[type=text], input:not([type])")) { read(); } });
  $$("[data-stepper]", f).forEach((s) => $$("button", s).forEach((b) => (b.onclick = () => { const k = s.dataset.stepper, stepBy = k === "length" ? 5 : 1; F[k] = Math.min(+s.dataset.max, Math.max(+s.dataset.min, F[k] + stepBy * +b.dataset.d)); $("output", s).textContent = F[k]; const u = $(".stepper-unit", s); if (u && k === "lessons") u.textContent = F[k] === 1 ? "a single lesson" : "a unit"; keep(); refreshRail(); })));
  $$("[data-step]", root).forEach((b) => (b.onclick = () => go(+b.dataset.step)));
  $$("[data-go]", f).forEach((b) => (b.onclick = () => go(step + +b.dataset.go)));
  f.onsubmit = (e) => { e.preventDefault(); create(); };
  const file = $("#file", f), drop = $("#drop", f);
  if (file) {
    file.onchange = () => addFiles([...file.files]);
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));
    bindDocs();
  }
}
function bindDocs() {
  $$("[data-deldoc]", root).forEach((b) => (b.onclick = async () => { b.disabled = true; try { await api.deleteDoc(b.dataset.deldoc); docs = docs.filter((d) => d.id !== b.dataset.deldoc); F.docIds = F.docIds.filter((x) => x !== b.dataset.deldoc); keep(); $("#doclist").innerHTML = docList(); bindDocs(); refreshRail(); } catch (e) { toast("Could not remove that document.", "bad"); b.disabled = false; } }));
  $$("[data-purpose]", root).forEach((s) => (s.onchange = async () => { const d = docs.find((x) => x.id === s.dataset.purpose); d.purpose = s.value; try { await api.setDocPurpose(d.id, s.value); } catch (e) { /* keeps local choice */ } }));
}
async function addFiles(files) {
  const list = $("#doclist");
  for (const file of files.slice(0, 6)) {
    const row = document.createElement("p"); row.className = "fine reading"; row.textContent = `Reading ${file.name}…`; list.prepend(row);
    try {
      const text = await extractText(file);
      if (text.length < 40) throw new Error("No readable text was found. If it is a scanned PDF, upload a typed version.");
      const d = await api.addDoc(file, text, DOC_PURPOSES[0]);
      docs.unshift(d); if (F.docIds.length < 4) F.docIds.push(d.id);
    } catch (e) { toast(`${file.name}: ${e.message}`, "bad"); }
  }
  keep(); list.innerHTML = docList(); bindDocs(); refreshRail();
}
function go(n) { if (busy) return; read(); step = Math.max(0, Math.min(STEPS.length - 1, n)); render(); window.scrollTo({ top: 0 }); $(".sheet-form h1", root)?.focus?.(); }

async function create() {
  if (busy) return; read();
  if (!F.topic && !F.focus.length) { toast("Tell Lessonbeat what to teach first: type a topic or tick a focus."); go(2); return; }
  busy = true;
  const st = $("#status"), btn = $('#pf button[type="submit"]'); st.hidden = false; btn.disabled = true;
  const say = (m) => (st.innerHTML = `<span class="spin" aria-hidden="true"></span><p>${esc(m)}</p>`);
  try {
    const id = await createFromForm(F, say);
    sessionStorage.removeItem("lb-form");
    location.hash = "#/unit/" + id;
  } catch (e) {
    busy = false; btn.disabled = false;
    st.innerHTML = `<p class="bad"><b>That didn't work.</b> ${esc(e.message || "Please try again.")}</p>`;
  }
}
