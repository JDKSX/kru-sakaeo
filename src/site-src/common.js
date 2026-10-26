/* shared helpers for index.html and print.html */
const TH = ["ก", "ข", "ค", "ง"];
const SUBJ = {
  ana: ["A", "คิดวิเคราะห์", 100], eng: ["A", "ภาษาอังกฤษ", 50], gov: ["A", "ข้าราชการที่ดี", 50],
  com: ["B", "วิชาเอกคอมพิวเตอร์", 100], ped: ["B", "การจัดการเรียนการสอน", 75], law: ["B", "กฎหมาย", 25]
};
const PARTNAME = { A: "ภาค ก ความรู้ความสามารถทั่วไป", B: "ภาค ข มาตรฐานความรู้และประสบการณ์วิชาชีพ" };
const ORDER = ["ana", "eng", "gov", "com", "ped", "law"];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
/* fixed per-question shuffle (same order online, on paper and in the answer key) */
function perm(seed) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const o = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}
const orderOf = q => perm("s0" + q.id);
const keyOf = q => orderOf(q).indexOf(q.a);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function loadManifest() { return (await fetch("data/manifest.json")).json(); }
async function loadCollection(id) { return (await fetch("data/" + id + ".json")).json(); }
/* items of one part, in exam order */
function partItems(items, part) {
  return items.filter(q => !part || part === "all" || SUBJ[q.s][0] === part)
    .sort((a, b) => ORDER.indexOf(a.s) - ORDER.indexOf(b.s));
}
/* parse "1ก 2ข 3 ค" or "กขคง..." into {no: posIndex} */
function parseAnswers(text, n) {
  const map = {};
  const t = text.replace(/[,;\n\t]/g, " ");
  const re = /(\d{1,3})\s*[.):\-]?\s*([กขคงabcdABCD])/g;
  let m, hit = 0;
  const conv = c => { const i = "กขคง".indexOf(c); if (i >= 0) return i; return "abcd".indexOf(c.toLowerCase()); };
  while ((m = re.exec(t))) { const no = +m[1]; if (no >= 1 && no <= n) { map[no] = conv(m[2]); hit++; } }
  if (!hit) {
    const seq = t.replace(/[^กขคงxX\-]/g, "");
    [...seq].forEach((c, i) => { if (i < n && "กขคง".includes(c)) map[i + 1] = "กขคง".indexOf(c); });
  }
  return map;
}
