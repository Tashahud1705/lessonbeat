// Small DOM helpers shared by every screen.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

let toastT;
export function toast(msg, kind = "") {
  const t = $("#toast"); t.textContent = msg; t.className = kind; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), kind === "bad" ? 7000 : 3500);
}

/** A tick box that looks like one. Works for single choice (radio) and multiple choice (checkbox). */
export function tickbox({ name, value, label, note, checked, radio, disabled }) {
  return `<label class="tick${note ? " has-note" : ""}"><input type="${radio ? "radio" : "checkbox"}" name="${esc(name)}" value="${esc(value)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span class="box" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M3.5 10.5l4.2 4.3L17 4.6"/></svg></span><span class="tick-text"><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></label>`;
}
export function stepper({ name, value, min, max, label, unit = "" }) {
  return `<div class="stepper" data-stepper="${esc(name)}" data-min="${min}" data-max="${max}"><span class="stepper-label">${esc(label)}</span><span class="stepper-ctl"><button type="button" data-d="-1" aria-label="Fewer: ${esc(label)}">−</button><output>${value}</output><button type="button" data-d="1" aria-label="More: ${esc(label)}">+</button></span>${unit ? `<span class="stepper-unit">${esc(unit)}</span>` : ""}</div>`;
}

let closeModal = null;
export function modal(html, onMount) {
  const m = $("#modal");
  m.innerHTML = `<div class="modal-back" data-close></div><div class="modal-card" role="dialog" aria-modal="true"><button class="modal-x" data-close aria-label="Close">×</button>${html}</div>`;
  m.hidden = false;
  const prev = document.activeElement;
  const close = () => { m.hidden = true; m.innerHTML = ""; document.removeEventListener("keydown", onKey); closeModal = null; prev && prev.focus && prev.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  m.onclick = (e) => { if (e.target.closest("[data-close]")) close(); };
  closeModal = close;
  const first = m.querySelector("input, textarea, select, button:not(.modal-x)"); first && first.focus();
  onMount && onMount(m.querySelector(".modal-card"), close);
  return close;
}
export const dismissModal = () => closeModal && closeModal();

export function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const slug = (s) => String(s || "lessonbeat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "lessonbeat";
export const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" }); };
