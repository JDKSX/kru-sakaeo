/* omr.js — อ่านกระดาษคำตอบจากรูปถ่ายในเบราว์เซอร์ (ไม่ส่งรูปออกนอกเครื่อง)
   ขั้นตอน: ย่อภาพ → ขาวดำแบบปรับตามพื้นที่ → หาสี่เหลี่ยมดำ 4 มุม → homography (มม. → พิกเซล)
   → อ่านแถบรหัสกระดาษ (ใช้ตัดสินทิศของภาพด้วย) → วัดความเข้มในวงกลมทุกข้อ
   ต้องโหลด common.js ก่อน (ใช้ SHEET, sheetIdBoxes, bubbleAt, sheetDecode) */
const OMR = (() => {
  const MAXDIM = 2000;

  async function toGray(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await createImageBitmap(file); }
    const k = Math.min(1, MAXDIM / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0, w, h);
    const px = cx.getImageData(0, 0, w, h).data, g = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
    return { w, h, g, canvas: cv };
  }

  /* ขาวดำแบบ adaptive: มืดกว่าค่าเฉลี่ยรอบข้าง 28% = ดำ */
  function binarize({ w, h, g }) {
    const I = new Uint32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 28)), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const mean = s / ((x1 - x0) * (y1 - y0));
        out[y * w + x] = g[y * w + x] < mean * 0.72 ? 1 : 0;
      }
    }
    return out;
  }

  function components(bin, w, h) {
    const lab = new Int32Array(w * h), st = new Int32Array(w * h), comps = [];
    let id = 0;
    for (let p = 0; p < w * h; p++) {
      if (!bin[p] || lab[p]) continue;
      id++; let sp = 0; st[sp++] = p; lab[p] = id;
      let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (sp) {
        const q = st[--sp], x = q % w, y = (q - x) / w;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bin[q - 1] && !lab[q - 1]) { lab[q - 1] = id; st[sp++] = q - 1; }
        if (x < w - 1 && bin[q + 1] && !lab[q + 1]) { lab[q + 1] = id; st[sp++] = q + 1; }
        if (y > 0 && bin[q - w] && !lab[q - w]) { lab[q - w] = id; st[sp++] = q - w; }
        if (y < h - 1 && bin[q + w] && !lab[q + w]) { lab[q + w] = id; st[sp++] = q + w; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      comps.push({ area, cx: sx / area, cy: sy / area, bw, bh, side: Math.sqrt(area), fill: area / (bw * bh) });
    }
    return comps;
  }

  /* homography: แก้สมการ 8 ตัวแปรจาก 4 คู่จุด */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const hv = b.map((v, i) => v / A[i][i]);
    return [...hv, 1];
  }
  const proj = (H, x, y) => { const d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };

  function mean(img, cx, cy, rad) {
    const { w, h, g } = img; let s = 0, n = 0;
    const r2 = rad * rad, x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r2) { s += g[y * w + x]; n++; } }
    return n ? s / n : 255;
  }
  /* ความเข้มในวงกลมรัศมี rmm (มม.) ที่จุด (x,y) มม. */
  function sampleMM(img, H, x, y, rmm) {
    const [u, v] = proj(H, x, y), [u2, v2] = proj(H, x + 1, y), [u3, v3] = proj(H, x, y + 1);
    const pxmm = (Math.hypot(u2 - u, v2 - v) + Math.hypot(u3 - u, v3 - v)) / 2;
    return mean(img, u, v, Math.max(1.5, rmm * pxmm));
  }

  /* เรียงจุด 4 จุดเป็น ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง ตามภาพ */
  function orderQuad(p) {
    const c = [p.reduce((s, q) => s + q[0], 0) / 4, p.reduce((s, q) => s + q[1], 0) / 4];
    const a = p.map(q => [q, Math.atan2(q[1] - c[1], q[0] - c[0])]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
    let s = 0; for (let i = 1; i < 4; i++) if (a[i][0] + a[i][1] < a[s][0] + a[s][1]) s = i;
    return [0, 1, 2, 3].map(i => a[(s + i) % 4]);
  }
  function convex(q) {
    let sg = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (z === 0) return false; const s = Math.sign(z); if (sg && s !== sg) return false; sg = s;
    }
    return true;
  }

  /* อ่านแถบรหัส: คืน {v, margin} margin = ความต่างของคู่ที่แย่ที่สุด (0..1) */
  function readId(img, H, black, white) {
    const boxes = sheetIdBoxes(0), dk = [];
    for (const [x, y] of boxes) dk.push(Math.max(0, Math.min(1, (white - sampleMM(img, H, x, y, SHEET.idBox * 0.3)) / Math.max(20, white - black))));
    let v = 0, margin = 1;
    for (let b = 0; b < SHEET.idBits; b++) {
      const d1 = dk[2 * b], d2 = dk[2 * b + 1];
      margin = Math.min(margin, Math.abs(d1 - d2));
      v = (v << 1) | (d1 > d2 ? 1 : 0);
    }
    return { v, margin };
  }
  const WHITE_SPOTS = [[30, 13.5], [13, 40], [10, 150], [201, 150], [105, 284], [140, 18.5]];

  function tryQuad(img, quad) {
    let best = null;
    const marks = SHEET.marks;
    for (let r = 0; r < 4; r++) {
      const dst = [0, 1, 2, 3].map(i => quad[(i + r) % 4]);
      const H = homography(marks, dst); if (!H) continue;
      const black = marks.reduce((s, [x, y]) => s + sampleMM(img, H, x, y, SHEET.mk * 0.25), 0) / 4;
      const ws = WHITE_SPOTS.map(([x, y]) => sampleMM(img, H, x, y, 1.5)).sort((a, b) => b - a);
      const white = (ws[0] + ws[1] + ws[2]) / 3;
      if (white - black < 40) continue;
      const id = readId(img, H, black, white);
      if (!best || id.margin > best.id.margin) best = { H, black, white, id, rot: r };
    }
    return best;
  }

  function findSheet(img) {
    const bin = binarize(img), comps = components(bin, img.w, img.h);
    const minSide = Math.max(img.w, img.h) * 0.008;
    const cand = comps.filter(c => c.side >= minSide && c.fill >= 0.7 && c.bw / c.bh > 0.6 && c.bw / c.bh < 1.65 && c.area > 30)
      .sort((a, b) => b.side - a.side).slice(0, 60);
    const tried = new Set();
    for (const seed of cand) {
      const grp = cand.filter(c => c.side >= seed.side * 0.7 && c.side <= seed.side * 1.3);
      if (grp.length < 4) continue;
      const key = grp.map(c => c.cx | 0).join(","); if (tried.has(key)) continue; tried.add(key);
      const ext = [
        grp.reduce((a, c) => (c.cx + c.cy < a.cx + a.cy ? c : a)),
        grp.reduce((a, c) => (c.cx - c.cy > a.cx - a.cy ? c : a)),
        grp.reduce((a, c) => (c.cx + c.cy > a.cx + a.cy ? c : a)),
        grp.reduce((a, c) => (c.cx - c.cy < a.cx - a.cy ? c : a))
      ];
      if (new Set(ext).size < 4) continue;
      const quad = orderQuad(ext.map(c => [c.cx, c.cy]));
      if (!convex(quad)) continue;
      const res = tryQuad(img, quad);
      if (!res || res.id.margin < 0.45) continue;
      /* ขนาดสี่เหลี่ยมมุมที่เจอต้องตรงกับที่ homography คาด (กันจับจุดผิด) */
      const okSize = ext.every(c => {
        const [u, v] = proj(res.H, ...SHEET.marks[0]), [u2, v2] = proj(res.H, SHEET.marks[0][0] + SHEET.mk, SHEET.marks[0][1]);
        const exp = Math.hypot(u2 - u, v2 - v); return c.side > exp * 0.55 && c.side < exp * 1.6;
      });
      if (okSize) return { ...res, quad };
    }
    return null;
  }

  /* อ่านคำตอบ N ข้อ: ans[i] = 0..3 | -1 เว้น | -2 ฝนหลายวง ; flag[i] = true ถ้าควรตรวจซ้ำ */
  function readAnswers(img, S, N) {
    const ans = [], flag = [], score = [];
    for (let i = 0; i < N; i++) {
      const m = [0, 1, 2, 3].map(k => { const [x, y] = bubbleAt(i, k); return sampleMM(img, S.H, x, y, SHEET.r * 0.62); });
      const wl = Math.max(...m, S.white * 0.6), den = Math.max(25, wl - S.black);
      const s = m.map(v => Math.max(0, (wl - v) / den));
      const ord = [0, 1, 2, 3].sort((a, b) => s[b] - s[a]), b1 = s[ord[0]], b2 = s[ord[1]];
      let a, f = false;
      if (b1 < 0.22) { a = -1; f = b1 >= 0.12; }
      else if (b2 >= 0.22 && b2 >= b1 * 0.6) { a = -2; f = true; }
      else { a = ord[0]; f = b1 < 0.3 || b2 >= b1 * 0.45; }
      ans.push(a); flag.push(f); score.push(s);
    }
    return { ans, flag, score };
  }

  async function scan(file, N) {
    const img = await toGray(file);
    const S = findSheet(img);
    if (!S) return { ok: false, reason: "nosheet", img };
    const meta = sheetDecode(S.id.v);
    const R = N ? readAnswers(img, S, N) : null;
    return { ok: true, img, sheet: S, code: S.id.v, meta, ...(R || {}) };
  }

  /* วาดผลทับรูป: สีตามสถานะ */
  function overlay(res, N, keyFn, maxW) {
    const { img, sheet } = res, k = Math.min(1, maxW / img.w);
    const cv = document.createElement("canvas"); cv.width = Math.round(img.w * k); cv.height = Math.round(img.h * k);
    const cx = cv.getContext("2d"); cx.drawImage(img.canvas, 0, 0, cv.width, cv.height);
    cx.lineWidth = Math.max(1.5, 2 * k * img.w / 1000);
    const css = getComputedStyle(document.documentElement);
    const col = { ok: css.getPropertyValue("--ok-ink").trim() || "#15784A", bad: css.getPropertyValue("--bad-ink").trim() || "#B8261C", warn: "#E4621B", q: css.getPropertyValue("--primary").trim() || "#1E3A8A" };
    cx.strokeStyle = col.q;
    cx.beginPath(); sheet.quad.forEach(([x, y], i) => (i ? cx.lineTo(x * k, y * k) : cx.moveTo(x * k, y * k))); cx.closePath(); cx.stroke();
    for (let i = 0; i < N; i++) {
      const a = res.ans[i], key = keyFn ? keyFn(i) : -9;
      const ring = (kk, c) => { const [x, y] = bubbleAt(i, kk), [u, v] = proj(sheet.H, x, y), [u2, v2] = proj(sheet.H, x + SHEET.r + 0.6, y); cx.strokeStyle = c; cx.beginPath(); cx.arc(u * k, v * k, Math.hypot(u2 - u, v2 - v) * k, 0, 7); cx.stroke(); };
      if (res.flag[i] || a === -2) for (let kk = 0; kk < 4; kk++) if (res.score[i][kk] >= 0.12) ring(kk, col.warn);
      if (a >= 0) ring(a, key === -9 ? col.q : a === key ? col.ok : col.bad);
    }
    return cv;
  }
  return { scan, overlay, readAnswers, _internals: { toGray, binarize, components, homography, proj, findSheet } };
})();
