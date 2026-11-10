// Reads the text out of a teacher's own planning documents, in the browser.
export const ACCEPT = ".pdf,.docx,.txt,.md,.rtf";
export async function extractText(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  if (file.size > 15 * 1024 * 1024) throw new Error("That file is over 15 MB. Try a smaller export.");
  if (ext === "txt" || ext === "md") return clean(await file.text());
  if (ext === "rtf") return clean((await file.text()).replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, ""));
  if (ext === "docx") {
    if (!window.mammoth) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js");
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return clean(r.value);
  }
  if (ext === "pdf") {
    const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/";
    const pdfjs = await import(PDFJS + "pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
      const page = await doc.getPage(p), tc = await page.getTextContent();
      out += tc.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("") + "\n";
      if (out.length > 60000) break;
    }
    return clean(out);
  }
  throw new Error("Lessonbeat can read PDF, Word (.docx) and text files.");
}
const clean = (t) => t.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load the document reader.")); document.head.appendChild(s); });
