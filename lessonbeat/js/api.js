// Everything that talks to Supabase: sign-in, saved units, uploaded documents and the AI function.
import { CONFIG } from "./config.js";

export const MOCK = new URLSearchParams(location.search).has("mock") || !CONFIG.supabaseKey;
let sb = null, mock = null, codesCache = null;
if (!MOCK) sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

export class AppError extends Error { constructor(code, message) { super(message); this.code = code; } }
const must = ({ data, error }) => { if (error) throw new AppError(error.code || "DB", error.message); return data; };

async function mockApi() { if (!mock) mock = await import("./mock.js"); return mock; }

/* ---------- session ---------- */
export async function session() {
  if (MOCK) return { user: { id: "mock", is_anonymous: true, email: null } };
  let { data } = await sb.auth.getSession();
  if (!data.session) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) throw new AppError("AUTH", "Could not start a session. Check your connection and reload.");
    data = r.data;
  }
  return data.session;
}
export async function me() { const s = await session(); return { id: s.user.id, email: s.user.email || null, guest: !!s.user.is_anonymous }; }

async function carryOver(fn) {
  // Guest work comes with you when you sign in or create an account.
  const mine = await me();
  const units = mine.guest ? must(await sb.from("units").select("title, form, content")) : [];
  const docs = mine.guest ? must(await sb.from("documents").select("name, purpose, chars, content")) : [];
  const out = await fn();
  if (units.length) await sb.from("units").insert(units);
  if (docs.length) await sb.from("documents").insert(docs);
  return out;
}
export async function signUp(email, password) {
  if (MOCK) throw new AppError("MOCK", "Accounts are switched off in demo mode.");
  return carryOver(async () => {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw new AppError("AUTH", error.message);
    if (!data.session) throw new AppError("CONFIRM", "Check your email to confirm your account, then sign in.");
    return data.session;
  });
}
export async function signIn(email, password) {
  if (MOCK) throw new AppError("MOCK", "Accounts are switched off in demo mode.");
  return carryOver(async () => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("AUTH", error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
    return data.session;
  });
}
export async function signOut() { if (!MOCK) await sb.auth.signOut(); }

/* ---------- AI ---------- */
export async function generate(task, form, context = {}, extra = {}) {
  if (MOCK) return (await mockApi()).generate(task, form, context, extra);
  const s = await session();
  let res;
  try {
    res = await fetch(CONFIG.supabaseUrl + "/functions/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token, apikey: CONFIG.supabaseKey },
      body: JSON.stringify({ task, form, context, ...extra }),
    });
  } catch (e) { throw new AppError("NETWORK", "Could not reach Lessonbeat. Check your connection and try again."); }
  let body = null;
  try { body = await res.json(); } catch (e) { /* not json */ }
  if (!body || !body.ok) throw new AppError(body?.error?.code || "SERVER", body?.error?.message || `Something went wrong (${res.status}). Please try again.`);
  return body;
}

/* ---------- curriculum ---------- */
export async function codes() {
  if (codesCache) return codesCache;
  if (MOCK) return (codesCache = (await mockApi()).CODES);
  codesCache = must(await sb.from("curriculum_codes").select("*").order("sort"));
  return codesCache;
}

/* ---------- units ---------- */
export async function listUnits() {
  if (MOCK) return (await mockApi()).db.list();
  const m = await me();
  return must(await sb.from("units").select("id, title, form, is_shared, updated_at").eq("user_id", m.id).order("updated_at", { ascending: false }));
}
export async function getUnit(id) {
  if (MOCK) return (await mockApi()).db.get(id);
  await session();
  const rows = must(await sb.from("units").select("*").eq("id", id).limit(1));
  if (!rows.length) throw new AppError("MISSING", "That unit could not be found. It may have been deleted, or the share link was turned off.");
  return rows[0];
}
export async function createUnit(title, form, content) {
  if (MOCK) return (await mockApi()).db.create(title, form, content);
  await session();
  return must(await sb.from("units").insert({ title, form, content }).select().single());
}
export async function updateUnit(id, patch) {
  if (MOCK) return (await mockApi()).db.update(id, patch);
  must(await sb.from("units").update(patch).eq("id", id));
}
export async function deleteUnit(id) {
  if (MOCK) return (await mockApi()).db.remove(id);
  must(await sb.from("units").delete().eq("id", id));
}

/* ---------- documents ---------- */
export async function listDocs() {
  if (MOCK) return (await mockApi()).db.docs();
  const m = await me();
  return must(await sb.from("documents").select("id, name, purpose, chars, created_at").eq("user_id", m.id).order("created_at", { ascending: false }));
}
export async function docTexts(ids) {
  if (!ids || !ids.length) return [];
  if (MOCK) return (await mockApi()).db.docTexts(ids);
  return must(await sb.from("documents").select("name, purpose, content").in("id", ids)).map((d) => ({ name: d.name, purpose: d.purpose, text: d.content }));
}
export async function addDoc(file, text, purpose) {
  if (MOCK) return (await mockApi()).db.addDoc(file.name, text, purpose);
  const m = await me();
  let path = null;
  if (file.size <= 10 * 1024 * 1024) {
    path = `${m.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
    const up = await sb.storage.from("documents").upload(path, file, { upsert: false });
    if (up.error) path = null; // the extracted text is what the planner needs; the original is a convenience
  }
  return must(await sb.from("documents").insert({ name: file.name.slice(0, 120), purpose, path, chars: text.length, content: text.slice(0, 20000) }).select("id, name, purpose, chars, created_at").single());
}
export async function setDocPurpose(id, purpose) { if (MOCK) return; must(await sb.from("documents").update({ purpose }).eq("id", id)); }
export async function deleteDoc(id) {
  if (MOCK) return (await mockApi()).db.delDoc(id);
  const rows = must(await sb.from("documents").select("path").eq("id", id));
  if (rows[0]?.path) await sb.storage.from("documents").remove([rows[0].path]);
  must(await sb.from("documents").delete().eq("id", id));
}

export async function sendFeedback(row) { if (MOCK) return; must(await sb.from("feedback").insert(row)); }
