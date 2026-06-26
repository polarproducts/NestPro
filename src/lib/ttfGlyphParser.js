/**
 * Minimal TrueType (TTF) glyph path parser — zero dependencies.
 *
 * Extracts Bezier contour data from TTF / TrueType-based OTF fonts (glyf
 * table) so the PDF generator can draw every character as vector outlines
 * (m / l / c / h / f) instead of relying on jsPDF text objects.
 *
 * Supports:
 *   • Simple glyphs  (numberOfContours >= 0)
 *   • Compound glyphs (numberOfContours < 0, recursive)
 *   • cmap format 4 (Unicode BMP) and format 12 (full Unicode)
 *   • Advance widths from hmtx / hhea
 *
 * Returns null for CFF-based OpenType (CFF table, no glyf) — caller
 * falls back to embedded-font text objects in that case.
 */

/* ---------- table directory ---------- */

function readTableDirectory(view) {
  const numTables = view.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(off), view.getUint8(off + 1),
      view.getUint8(off + 2), view.getUint8(off + 3),
    );
    tables[tag] = { offset: view.getUint32(off + 8), length: view.getUint32(off + 12) };
  }
  return tables;
}

/* ---------- head / hhea / hmtx / loca ---------- */

function parseHead(view, t) {
  return {
    unitsPerEm: view.getUint16(t.offset + 18),
    indexToLocFormat: view.getInt16(t.offset + 50),
  };
}

function parseHhea(view, t) {
  return { numberOfHMetrics: view.getUint16(t.offset + 34) };
}

function parseHmtx(view, t, numMetrics) {
  const advances = [];
  for (let i = 0; i < numMetrics; i++) {
    advances.push(view.getUint16(t.offset + i * 4));
  }
  return advances;
}

function parseLoca(view, t, format) {
  const offsets = [];
  if (format === 0) {
    const n = t.length / 2;
    for (let i = 0; i < n; i++) offsets.push(view.getUint16(t.offset + i * 2) * 2);
  } else {
    const n = t.length / 4;
    for (let i = 0; i < n; i++) offsets.push(view.getUint32(t.offset + i * 4));
  }
  return offsets;
}

/* ---------- cmap ---------- */

function parseCmap(view, t) {
  const numEnc = view.getUint16(t.offset + 2);
  let bestOff = 0, bestFmt = 0;

  for (let i = 0; i < numEnc; i++) {
    const rec = t.offset + 4 + i * 8;
    const subStart = t.offset + view.getUint32(rec + 4);
    const fmt = view.getUint16(subStart);
    if (fmt === 12) { bestOff = subStart; bestFmt = 12; break; }
    if (fmt === 4 && bestFmt !== 12) { bestOff = subStart; bestFmt = 4; }
  }

  const map = {};
  if (bestFmt === 4) parseCmap4(view, bestOff, map);
  else if (bestFmt === 12) parseCmap12(view, bestOff, map);
  return map;
}

function parseCmap4(view, off, map) {
  const segCount = view.getUint16(off + 6) / 2;
  const endBase   = off + 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeBase = deltaBase + segCount * 2;

  for (let i = 0; i < segCount; i++) {
    const start = view.getUint16(startBase + i * 2);
    const end   = view.getUint16(endBase + i * 2);
    if (start === 0xFFFF && end === 0xFFFF) continue;

    const delta = view.getInt16(deltaBase + i * 2);
    const range = view.getUint16(rangeBase + i * 2);

    for (let c = start; c <= end; c++) {
      let gid;
      if (range === 0) {
        gid = (c + delta) & 0xFFFF;
      } else {
        const addr = rangeBase + i * 2 + range + 2 * (c - start);
        gid = view.getUint16(addr);
        if (gid !== 0) gid = (gid + delta) & 0xFFFF;
      }
      map[c] = gid;
    }
  }
}

function parseCmap12(view, off, map) {
  const numGroups = view.getUint32(off + 12);
  let cur = off + 16;
  for (let i = 0; i < numGroups; i++) {
    const startChar = view.getUint32(cur);
    const endChar   = view.getUint32(cur + 4);
    const startGid  = view.getUint32(cur + 8);
    cur += 12;
    for (let c = startChar; c <= endChar; c++) map[c] = startGid + (c - startChar);
  }
}

/* ---------- F2Dot14 helper ---------- */

function readF2Dot14(view, off) {
  return view.getInt16(off) / 16384.0;
}

/* ---------- public: parse entire font ---------- */

export function parseTTF(buffer) {
  const view = new DataView(buffer);
  const tables = readTableDirectory(view);

  if (!tables.glyf || !tables.loca || !tables.cmap || !tables.head) return null;

  const head = parseHead(view, tables.head);
  const hhea = tables.hhea ? parseHhea(view, tables.hhea) : { numberOfHMetrics: 0 };
  const adv  = tables.hmtx ? parseHmtx(view, tables.hmtx, hhea.numberOfHMetrics) : [];
  const cmap = parseCmap(view, tables.cmap);
  const loca = parseLoca(view, tables.loca, head.indexToLocFormat);

  return { view, tables, head, advanceWidths: adv, cmap, loca };
}

/* ---------- glyph contour extraction ---------- */

function getGlyphContours(font, glyphId) {
  if (glyphId == null || glyphId === 0) return null;

  const start = font.loca[glyphId];
  const end   = font.loca[glyphId + 1];
  if (start === end) return [];

  const base = font.tables.glyf.offset + start;
  const len  = end - start;
  if (len < 10) return [];

  const view = font.view;
  const numContours = view.getInt16(base);
  const dataOff = base + 10;

  if (numContours >= 0) return parseSimpleGlyph(view, dataOff, numContours);
  return parseCompoundGlyph(font, dataOff);
}

function parseSimpleGlyph(view, off, numContours) {
  const endPts = [];
  for (let i = 0; i < numContours; i++) endPts.push(view.getUint16(off + i * 2));
  let cur = off + numContours * 2;

  const instrLen = view.getUint16(cur);
  cur += 2 + instrLen;

  const numPoints = endPts[numContours - 1] + 1;

  const flags = [];
  let i = 0;
  while (i < numPoints) {
    const f = view.getUint8(cur++);
    flags.push(f);
    i++;
    if (f & 0x08) {
      const rep = view.getUint8(cur++);
      for (let j = 0; j < rep && i < numPoints; j++) { flags.push(f); i++; }
    }
  }

  const xs = [];
  let x = 0;
  for (i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & 0x02) {
      const dx = view.getUint8(cur++);
      x += (f & 0x10) ? dx : -dx;
    } else if (!(f & 0x10)) {
      x += view.getInt16(cur); cur += 2;
    }
    xs.push(x);
  }

  const ys = [];
  let y = 0;
  for (i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & 0x04) {
      const dy = view.getUint8(cur++);
      y += (f & 0x20) ? dy : -dy;
    } else if (!(f & 0x20)) {
      y += view.getInt16(cur); cur += 2;
    }
    ys.push(y);
  }

  const contours = [];
  let ptIdx = 0;
  for (let c = 0; c < numContours; c++) {
    const end = endPts[c];
    const contour = [];
    for (; ptIdx <= end; ptIdx++) {
      contour.push({ x: xs[ptIdx], y: ys[ptIdx], onCurve: (flags[ptIdx] & 0x01) !== 0 });
    }
    ptIdx = end + 1;
    contours.push(contour);
  }
  return contours;
}

function parseCompoundGlyph(font, off) {
  const view = font.view;
  let cur = off;
  const all = [];

  while (true) {
    const flags     = view.getUint16(cur); cur += 2;
    const glyphIndex = view.getUint16(cur); cur += 2;

    let a1, a2;
    if (flags & 0x0001) { a1 = view.getInt16(cur); cur += 2; a2 = view.getInt16(cur); cur += 2; }
    else                 { a1 = view.getInt8(cur);  cur += 1; a2 = view.getInt8(cur);  cur += 1; }

    let a = 1, b = 0, c = 0, d = 1;
    if (flags & 0x0008) { a = d = readF2Dot14(view, cur); cur += 2; }
    else if (flags & 0x0040) { a = readF2Dot14(view, cur); cur += 2; d = readF2Dot14(view, cur); cur += 2; }
    else if (flags & 0x0080) {
      a = readF2Dot14(view, cur); cur += 2;
      b = readF2Dot14(view, cur); cur += 2;
      c = readF2Dot14(view, cur); cur += 2;
      d = readF2Dot14(view, cur); cur += 2;
    }

    const dx = (flags & 0x0002) ? a1 : 0;
    const dy = (flags & 0x0002) ? a2 : 0;

    const comp = getGlyphContours(font, glyphIndex);
    if (comp) {
      for (const contour of comp) {
        all.push(contour.map(p => ({
          x: a * p.x + c * p.y + dx,
          y: b * p.x + d * p.y + dy,
          onCurve: p.onCurve,
        })));
      }
    }

    if (!(flags & 0x0020)) break;
  }
  return all;
}

/* ---------- contours → Bezier path commands ---------- */

function contoursToPaths(contours) {
  const paths = [];

  for (const contour of contours) {
    if (contour.length === 0) continue;

    let pts = [...contour];

    if (!pts[0].onCurve) {
      const last = pts[pts.length - 1];
      if (last.onCurve) {
        pts.unshift(pts.pop());
      } else {
        const mid = { x: (pts[0].x + last.x) / 2, y: (pts[0].y + last.y) / 2, onCurve: true };
        pts = [mid, ...pts, mid];
      }
    }

    const n = pts.length;
    if (n === 0) continue;

    paths.push({ type: 'M', x: pts[0].x, y: pts[0].y });

    let cur = pts[0];
    let i = 1;

    while (i < n) {
      const p = pts[i];

      if (p.onCurve) {
        paths.push({ type: 'L', x: p.x, y: p.y });
        cur = p;
        i++;
      } else {
        const ctrl = p;
        let endPt;

        if (i + 1 < n) {
          const next = pts[i + 1];
          if (next.onCurve) { endPt = next; i += 2; }
          else {
            endPt = { x: (ctrl.x + next.x) / 2, y: (ctrl.y + next.y) / 2 };
            i += 1;
          }
        } else {
          endPt = pts[0];
          i = n;
        }

        const cx1 = cur.x  + (2 / 3) * (ctrl.x - cur.x);
        const cy1 = cur.y  + (2 / 3) * (ctrl.y - cur.y);
        const cx2 = endPt.x + (2 / 3) * (ctrl.x - endPt.x);
        const cy2 = endPt.y + (2 / 3) * (ctrl.y - endPt.y);

        paths.push({ type: 'C', cx1, cy1, cx2, cy2, x: endPt.x, y: endPt.y });
        cur = endPt;
      }
    }

    paths.push({ type: 'Z' });
  }

  return paths;
}

export function getGlyphPaths(font, glyphId) {
  const contours = getGlyphContours(font, glyphId);
  if (!contours) return [];
  return contoursToPaths(contours);
}

/* ---------- advance width ---------- */

function getAdvanceWidth(font, glyphId) {
  const m = font.advanceWidths;
  if (!m || m.length === 0) return font.head.unitsPerEm / 2;
  if (glyphId < m.length) return m[glyphId];
  return m[m.length - 1];
}

/* ---------- public: get outline for an entire string ---------- */

function offsetPath(p, dx) {
  if (p.type === 'M' || p.type === 'L') return { ...p, x: p.x + dx };
  if (p.type === 'C') return { ...p, cx1: p.cx1 + dx, cx2: p.cx2 + dx, x: p.x + dx };
  return p;
}

/**
 * Returns a flat array of Bezier path commands for the given text.
 * Glyphs are positioned left-to-right using advance widths.
 *
 * @param font          — parsed font from parseTTF()
 * @param text          — the string to outline
 * @param letterSpacing — in CSS px at 100px font
 * @param wordSpacing    — in CSS px at 100px font
 */
export function getStringOutline(font, text, letterSpacing = 0, wordSpacing = 0) {
  const all = [];
  let xOffset = 0;
  const lsFU = letterSpacing * font.head.unitsPerEm / 100;
  const wsFU = wordSpacing   * font.head.unitsPerEm / 100;

  for (const char of text) {
    const code = char.charCodeAt(0);
    const gid = font.cmap[code];

    if (gid && gid !== 0) {
      const paths = getGlyphPaths(font, gid);
      for (const p of paths) all.push(offsetPath(p, xOffset));
    }

    xOffset += getAdvanceWidth(font, gid || 0) + lsFU;
    if (char === ' ') xOffset += wsFU;
  }

  return all;
}