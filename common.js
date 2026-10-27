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

/* ---------- กระดาษคำตอบ (OMR) — พิกัดเป็นมิลลิเมตรบน A4 210×297 ใช้ร่วมกันทั้งตอนพิมพ์และตอนสแกน ---------- */
const SHEET = {
  W: 210, H: 297,
  mk: 9,                                   /* ขนาดสี่เหลี่ยมมุม */
  marks: [[13.5, 13.5], [196.5, 13.5], [196.5, 283.5], [13.5, 283.5]], /* TL TR BR BL (จุดศูนย์กลาง) */
  idY: 13.5, idX0: 48, idPitch: 5.2, idBox: 3.6, idBits: 8,
  rows: 40, y0: 63, pitch: 5.35, x0: 17, colPitch: 36.6, numRight: 8.6, bx0: 12.4, bPitch: 6.2, r: 2.1
};
/* รหัสกระดาษ: full-NN → NN · basic → 50 · topic-k → 50+k ; ค่า = รหัส×2 + (ภาค ข ? 1 : 0) */
function sheetCode(cid, part) {
  let c = 0, m;
  if ((m = /^full-(\d+)$/.exec(cid))) c = +m[1];
  else if (cid === "basic") c = 50;
  else if ((m = /^topic-(\d+)$/.exec(cid))) c = 50 + +m[1];
  return c * 2 + (part === "B" ? 1 : 0);
}
function sheetDecode(v) {
  const c = v >> 1, part = v & 1 ? "B" : "A";
  const cid = c >= 1 && c <= 30 ? "full-" + String(c).padStart(2, "0") : c === 50 ? "basic" : c > 50 && c < 60 ? "topic-" + (c - 50) : null;
  return cid ? { cid, part } : null;
}
/* กล่องรหัส 16 ช่อง: บิตละ 2 ช่อง (บิต, กลับบิต) */
function sheetIdBoxes(v) {
  const out = [];
  for (let b = 0; b < SHEET.idBits; b++) {
    const bit = (v >> (SHEET.idBits - 1 - b)) & 1;
    out.push([SHEET.idX0 + (2 * b) * SHEET.idPitch, SHEET.idY, bit], [SHEET.idX0 + (2 * b + 1) * SHEET.idPitch, SHEET.idY, 1 - bit]);
  }
  return out;
}
/* จุดศูนย์กลางวงกลมของข้อ i (0-based) ตัวเลือก k (0..3) */
function bubbleAt(i, k) {
  const col = Math.floor(i / SHEET.rows), row = i % SHEET.rows;
  return [SHEET.x0 + col * SHEET.colPitch + SHEET.bx0 + k * SHEET.bPitch, SHEET.y0 + row * SHEET.pitch];
}
function rowLabelAt(i) {
  const col = Math.floor(i / SHEET.rows), row = i % SHEET.rows;
  return [SHEET.x0 + col * SHEET.colPitch + SHEET.numRight, SHEET.y0 + row * SHEET.pitch];
}
const appBase = () => location.href.replace(/[^/]*([?#].*)?$/, "");
