// Lessonbeat: routes, the home page, saved units, accounts and feedback.
import * as api from "./api.js";
import * as audio from "./audio.js";
import { $, $$, esc, toast, modal, ago, tickbox } from "./ui.js";
import { EXAMPLES, DEFAULT_FORM } from "./data.js";
import { mountTaster } from "./players.js";
import { openPlanner, loadForm, stashForm } from "./planner.js";
import { openUnit, leaveUnit } from "./unit.js";

const view = $("#view");
let taster = null, who = null;

async function route() {
  audio.stopAll(); leaveUnit(); if (taster) { taster.destroy(); taster = null; }
  const [, name = "", arg = ""] = location.hash.split("/");
  $$("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === name || (a.dataset.nav === "units" && name === "unit") ? "page" : "false"));
  document.title = "Lessonbeat";
  window.scrollTo({ top: 0 });
  try {
    if (name === "plan") await openPlanner(view, { startAt: arg === "review" ? 6 : undefined });
    else if (name === "units") await units();
    else if (name === "unit" && arg) await openUnit(view, arg);
    else if (name === "s" && arg) await openUnit(view, arg, { shared: true });
    else await home();
  } catch (e) {
    view.innerHTML = `<div class="oops"><h1>That page didn't open</h1><p>${esc(e.message || "Something went wrong.")}</p><p><a class="btn" href="#/">Back to the start</a></p></div>`;
  }
}

/* ---------- home ---------- */
async function home() {
  view.innerHTML = `
  <section class="hero">
    <div class="hero-text">
      <p class="kicker">For primary and secondary music teachers</p>
      <h1>Plan the lesson.<br>Get the <em>sound</em> that goes with it.</h1>
      <p class="lede">Say what you're teaching. Lessonbeat writes the unit, lines it up with the curriculum, and makes clap-alongs, sing-alongs and backing tracks for those exact lessons.</p>
      <form id="prompt" class="prompt"><label for="prompt-in">What are you teaching?</label>
        <textarea id="prompt-in" rows="3" maxlength="800" placeholder="e.g. Year 4, five 50-minute lessons on reading rhythms with semiquavers, with a song to sing and a worksheet each week"></textarea>
        <div class="prompt-go"><button class="btn primary big" type="submit">Start planning</button><a href="#/plan">or tick the boxes yourself</a></div></form>
      <div class="examples"><span>Or start from one of these</span>${EXAMPLES.map((x) => `<button type="button" class="example">${esc(x)}</button>`).join("")}</div>
    </div>
    <div class="hero-play"><p class="kicker">Press play, then change the key</p><div id="taster"></div><p class="fine">Every backing track in Lessonbeat works like this one. Nothing to install.</p></div>
  </section>
  <section class="how"><h2 class="sec">How it works</h2><ol>
    <li><b>Tick the boxes</b><p>Year level, curriculum codes, lesson structure, how many worksheets and assessments. Upload your school's planner if you want it followed.</p></li>
    <li><b>Read, edit, ask</b><p>Click any sentence to rewrite it yourself, or ask for a change in plain words: “make lesson 3 easier”.</p></li>
    <li><b>Press play in class</b><p>Rhythms and songs are written as music data and checked before you see them, so every bar adds up and every note is in range.</p></li></ol></section>
  <section id="recent"></section>
  <div id="setup"></div>`;
  taster = mountTaster($("#taster"));
  const input = $("#prompt-in");
  $$(".example").forEach((b) => (b.onclick = () => { input.value = b.textContent; input.focus(); }));
  $("#prompt").onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text.length < 8) { toast("Type a sentence about what you want to teach, or use the tick-box form."); input.focus(); return; }
    const btn = $("#prompt button"); btn.disabled = true; btn.textContent = "Reading your request…";
    const base = DEFAULT_FORM();
    try { const r = await api.generate("prefill", {}, {}, { prompt: text }); stashForm({ ...base, ...r.data, include: base.include, senior: base.senior, docIds: [], codes: [] }); location.hash = "#/plan/review"; }
    catch (err) { stashForm({ ...base, topic: text }); toast(err.code === "NO_KEY" ? err.message : "Couldn't read that automatically, so it's in the topic box for you.", err.code === "NO_KEY" ? "bad" : ""); location.hash = "#/plan"; }
  };
  api.listUnits().then((rows) => { const el = $("#recent"); if (el && rows.length) el.innerHTML = `<h2 class="sec">Pick up where you left off</h2>${unitRows(rows.slice(0, 3), false)}<p><a href="#/units">All my units</a></p>`; }).catch(() => {});
  if (!api.MOCK) api.generate("ping", {}).then((r) => { const el = $("#setup"); if (el && !r.data.ready) el.innerHTML = `<p class="note warn"><b>Setup isn't finished.</b> The AI key hasn't been added in Supabase yet, so planning won't work until it is (Edge Functions → Secrets → DEEPSEEK_API_KEY).</p>`; }).catch(() => {});
}

/* ---------- my units ---------- */
const unitRows = (rows, actions) => `<ul class="unitlist">${rows.map((u) => `<li><a href="#/unit/${u.id}"><b>${esc(u.title)}</b><small>${esc(u.form?.year || "")} · ${u.form?.lessons === 1 ? "1 lesson" : (u.form?.lessons || "") + " lessons"} · edited ${ago(u.updated_at)}${u.is_shared ? " · shared" : ""}</small></a>${actions ? `<span><button class="link" data-dup="${u.id}">Duplicate</button><button class="link danger" data-del="${u.id}">Delete</button></span>` : ""}</li>`).join("")}</ul>`;
async function units() {
  view.innerHTML = `<p class="loading">Opening your units…</p>`;
  const rows = await api.listUnits();
  view.innerHTML = `<div class="page-head"><h1>My units</h1><a class="btn primary" href="#/plan">Plan a new unit</a></div>
    ${rows.length ? unitRows(rows, true) : `<div class="empty"><p>Nothing here yet. Your first unit takes about two minutes.</p><p><a class="btn primary" href="#/plan">Plan a unit</a></p></div>`}
    ${who?.guest && rows.length ? `<p class="note">You're using Lessonbeat as a guest, so these units live in this browser only. <button class="link" id="save-acct">Create a free account</button> to keep them and open them anywhere.</p>` : ""}`;
  $("#save-acct")?.addEventListener("click", account);
  $$("[data-dup]").forEach((b) => (b.onclick = async () => { b.disabled = true; try { const u = await api.getUnit(b.dataset.dup); await api.createUnit(u.title + " (copy)", u.form, u.content); toast("Copied."); units(); } catch (e) { toast("Could not copy that unit.", "bad"); b.disabled = false; } }));
  $$("[data-del]").forEach((b) => (b.onclick = () => { const u = rows.find((r) => r.id === b.dataset.del); modal(`<h2>Delete this unit?</h2><p>“${esc(u.title)}” will be removed for good, including its lessons, worksheets and music. This can't be undone.</p><div class="modal-go"><button class="btn" data-close>Keep it</button><button class="btn danger" id="del-yes">Delete</button></div>`, (card, close) => { $("#del-yes", card).onclick = async () => { try { await api.deleteUnit(u.id); close(); toast("Deleted."); units(); } catch (e) { toast("Could not delete it. Try again.", "bad"); } }; }); }));
}

/* ---------- account ---------- */
async function refreshWho() {
  try { who = await api.me(); } catch (e) { who = null; }
  const b = $("#account-btn"); b.textContent = who && !who.guest ? "Account" : "Sign in";
}
function account() {
  if (api.MOCK) { modal(`<h2>Demo mode</h2><p>Accounts are switched off in demo mode. Everything you make here disappears when you close the page.</p>`); return; }
  if (who && !who.guest) {
    modal(`<h2>Your account</h2><p>Signed in as <b>${esc(who.email)}</b>.</p><div class="modal-go"><button class="btn" id="out">Sign out</button></div>`, (card, close) => { $("#out", card).onclick = async () => { await api.signOut(); close(); await refreshWho(); location.hash = "#/"; route(); toast("Signed out."); }; });
    return;
  }
  modal(`<h2>Keep your units</h2><p>You're using Lessonbeat as a guest. An account keeps your units safe and lets you open them on any computer. Anything you've made as a guest comes with you.</p>
    <div class="seg" role="tablist"><button role="tab" aria-selected="true" data-mode="up">Create account</button><button role="tab" aria-selected="false" data-mode="in">Sign in</button></div>
    <form id="acct"><label class="field"><span>School or personal email</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="field"><span>Password <small id="pw-hint">at least 8 characters</small></span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
      <p class="bad" id="acct-err" hidden></p><div class="modal-go"><button class="btn primary" type="submit">Create account</button></div></form>`, (card, close) => {
    let mode = "up";
    $$("[data-mode]", card).forEach((b) => (b.onclick = () => { mode = b.dataset.mode; $$("[data-mode]", card).forEach((q) => q.setAttribute("aria-selected", q === b)); $('button[type="submit"]', card).textContent = mode === "up" ? "Create account" : "Sign in"; $("#pw-hint", card).hidden = mode !== "up"; $('input[name="password"]', card).autocomplete = mode === "up" ? "new-password" : "current-password"; }));
    $("#acct", card).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = $('button[type="submit"]', card), err = $("#acct-err", card);
      btn.disabled = true; err.hidden = true;
      try { await (mode === "up" ? api.signUp : api.signIn)(f.email.value.trim(), f.password.value); close(); await refreshWho(); toast(mode === "up" ? "Account created. Your units are saved to it." : "Signed in."); route(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    };
  });
}

/* ---------- pilot feedback ---------- */
function feedback() {
  const group = (name, opts) => `<div class="ticks">${opts.map((o) => tickbox({ name, value: o, label: o, radio: true })).join("")}</div>`;
  modal(`<h2>Tell us what you think</h2><p>Lessonbeat is a pilot built by a music teacher. Three quick questions help decide what happens next.</p>
    <form id="fb"><fieldset><legend>Would you pay for Lessonbeat?</legend>${group("would_pay", ["Yes", "Maybe", "No", "My school should"])}</fieldset>
      <fieldset><legend>What would be a fair price per month?</legend>${group("price", ["$5", "$10", "$15", "More", "Nothing"])}</fieldset>
      <fieldset><legend>Have you used the clap-alongs, sing-alongs or backing tracks with a class?</legend>${group("used_media", ["Most lessons", "Once or twice", "Not yet"])}</fieldset>
      <label class="field"><span>Anything you'd change? <small>optional</small></span><textarea name="comment" rows="3" maxlength="1000"></textarea></label>
      <div class="modal-go"><button class="btn primary" type="submit">Send</button></div></form>`, (card, close) => {
    $("#fb", card).onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await api.sendFeedback({ would_pay: f.get("would_pay") || "", price: f.get("price") || "", used_media: f.get("used_media") || "", comment: (f.get("comment") || "").slice(0, 1000) }); close(); toast("Thank you. That helps a lot."); }
      catch (ex) { toast("Could not send that. Try again.", "bad"); }
    };
  });
}

$("#account-btn").onclick = account;
$("#feedback-btn").onclick = feedback;
window.addEventListener("hashchange", route);
refreshWho().finally(route);
