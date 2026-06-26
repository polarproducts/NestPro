import jsPDF from 'jspdf';
import { arrayBufferToBase64 } from '@/lib/fontStorage';
import { parseTTF, getStringOutline } from '@/lib/ttfGlyphParser';

/**
 * Production PDF generator — pure vector output.
 *
 * ROOT CAUSE OF SCALE BUG (fixed):
 *   jsPDF COMPAT mode (default) writes content-stream operators in PDF
 *   POINTS, not mm.  doc.text() converts mm→pt internally via scaleFactor,
 *   but doc.internal.write() writes raw values as-is.  Our code generated
 *   mm values, so every coordinate was interpreted as points — outlines
 *   were 25.4/72 ≈ 0.353× too small (a constant scale factor).
 *
 * FIX:
 *   The cm operator now includes scaleFactor (sf = 72/25.4 for mm) in both
 *   its scale terms and translation terms, converting local mm coordinates
 *   to PDF points.  Local path coordinates stay in mm; the cm handles the
 *   unit conversion.
 *
 *   Scaling is now bbox-based: the actual bounding box of the glyph outline
 *   paths is measured and used to compute sx/sy, guaranteeing the final
 *   vector outline width/height exactly equals the requested dimensions.
 */

const PT_TO_MM = 25.4 / 72; // 1 pt = 0.352778 mm

const SYSTEM_FONT_MAP = {
  'Arial':           'helvetica',
  'Helvetica':       'helvetica',
  'Verdana':         'helvetica',
  'Tahoma':          'helvetica',
  'Trebuchet MS':    'helvetica',
  'Impact':          'helvetica',
  'Comic Sans MS':   'helvetica',
  'Times New Roman': 'times',
  'Georgia':         'times',
  'Palatino':        'times',
  'Garamond':        'times',
  'Bookman':         'times',
  'Courier New':     'courier',
  'Lucida Console':  'courier',
};

/* ---------- colour helpers ---------- */

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function rgbToCmyk(r, g, b) {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const k = 1 - Math.max(rN, gN, bN);
  if (k >= 1) return [0, 0, 0, 100];
  return [
    Math.round(((1 - rN - k) / (1 - k)) * 100),
    Math.round(((1 - gN - k) / (1 - k)) * 100),
    Math.round(((1 - bN - k) / (1 - k)) * 100),
    Math.round(k * 100),
  ];
}

function getFontBuffer(fontBuffers, family) {
  if (!fontBuffers) return null;
  if (fontBuffers instanceof Map) return fontBuffers.get(family) || null;
  return fontBuffers[family] || null;
}

/* ---------- outline bounding box ---------- */

/**
 * Compute the bounding box of a flat array of Bezier path commands.
 * Coordinates are in font units (Y-up, TTF convention).
 */
function computeOutlineBBox(outline) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline) {
    if (p.type === 'M' || p.type === 'L') {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    } else if (p.type === 'C') {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.cx1 < minX) minX = p.cx1; if (p.cx1 > maxX) maxX = p.cx1;
      if (p.cy1 < minY) minY = p.cy1; if (p.cy1 > maxY) maxY = p.cy1;
      if (p.cx2 < minX) minX = p.cx2; if (p.cx2 > maxX) maxX = p.cx2;
      if (p.cy2 < minY) minY = p.cy2; if (p.cy2 > maxY) maxY = p.cy2;
    }
  }
  return { minX, maxX, minY, maxY };
}

/* ---------- transformation matrix builder ----------
 *
 * Local coordinates are in mm, Y-up (matching TTF font convention).
 * PDF content stream (COMPAT mode) is in POINTS, Y-up.
 *
 * The cm operator maps local mm → PDF pt, so scaleFactor (sf) is folded
 * into the scale terms AND the translation terms.  Local path coordinates
 * stay in mm — the cm handles the unit conversion.
 *
 * The outline bbox is mapped to exactly (item.x, item.y, item.width,
 * item.height) in the PDF, guaranteeing the vector outline dimensions
 * match the requested dimensions.
 */

function buildOutlineCM(item, settings, sheetH, sf, sx, sy, bbox, unitScale) {
  const minLx = bbox.minX * unitScale; // mm
  const minLy = bbox.minY * unitScale; // mm (Y-up)

  if (item.rotated) {
    // After 90° CCW rotation: original height → width, original width → height.
    // syRot is negative because rotation inverts Y.
    const sxRot = item.width  / ((bbox.maxY - bbox.minY) * unitScale);
    const syRot = -item.height / ((bbox.maxX - bbox.minX) * unitScale);
    const e = sf * (item.x - sxRot * minLy);
    const f = sf * (sheetH - item.y - syRot * minLx);
    return `0 ${(sf * syRot).toFixed(6)} ${(sf * sxRot).toFixed(6)} 0 ${e.toFixed(3)} ${f.toFixed(3)} cm`;
  }

  if (settings.mirror_text) {
    const e = sf * (item.x + item.width + sx * minLx);
    const f = sf * (sheetH - item.y - item.height - sy * minLy);
    return `${(-sf * sx).toFixed(6)} 0 0 ${(sf * sy).toFixed(6)} ${e.toFixed(3)} ${f.toFixed(3)} cm`;
  }

  // Normal: scale + translate, Y stays up (font Y-up → PDF Y-up).
  const e = sf * (item.x - sx * minLx);
  const f = sf * (sheetH - item.y - item.height - sy * minLy);
  return `${(sf * sx).toFixed(6)} 0 0 ${(sf * sy).toFixed(6)} ${e.toFixed(3)} ${f.toFixed(3)} cm`;
}

/* ================================================================== *
 *  Public API
 * ================================================================== */

export function generateProductionPDF(sheets, settings, fontBuffers = {}) {
  const {
    sheet_width_mm, sheet_height_mm,
    font_family, font_color, font_bold, font_italic,
    outline_text, outline_thickness,
  } = settings;

  const totalObjects = sheets.reduce((sum, s) => sum + (s.items?.length || 0), 0);
  if (totalObjects === 0) {
    throw new Error('No text objects found in the layout.');
  }

  const orientation = sheet_width_mm >= sheet_height_mm ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [sheet_width_mm, sheet_height_mm],
    compress: true,
  });

  // scaleFactor converts mm → PDF points (72/25.4 ≈ 2.8346 for unit:"mm")
  const sf = doc.internal.scaleFactor;

  /* ── CMYK colour ── */
  const [r, g, b]        = hexToRgb(font_color);
  const [cC, cM, cY, cK] = rgbToCmyk(r, g, b);
  const cmykStr           = `${(cC / 100).toFixed(3)} ${(cM / 100).toFixed(3)} ${(cY / 100).toFixed(3)} ${(cK / 100).toFixed(3)}`;
  const fillOp            = `${cmykStr} k`;
  const strokeOp          = `${cmykStr} K`;

  /* ── Font setup ── */
  const fontStyle = font_bold && font_italic ? 'bolditalic'
                  : font_bold ? 'bold'
                  : font_italic ? 'italic'
                  : 'normal';
  let pdfFont = SYSTEM_FONT_MAP[font_family] || 'helvetica';

  const fontBuffer = getFontBuffer(fontBuffers, font_family);

  let fontData = null;
  if (fontBuffer) {
    fontData = parseTTF(fontBuffer);
    if (!fontData) {
      // CFF-based OTF — embed font for text fallback
      const base64  = arrayBufferToBase64(fontBuffer);
      const vfsName = `${font_family}.ttf`;
      doc.addFileToVFS(vfsName, base64);
      ['normal', 'bold', 'italic', 'bolditalic'].forEach(s =>
        doc.addFont(vfsName, font_family, s),
      );
      pdfFont = font_family;
    }
  }

  doc.setFontSize(100);
  try { doc.setFont(pdfFont, fontStyle); } catch { doc.setFont('helvetica', fontStyle); }
  doc.setTextColor(cC, cM, cY, cK);
  doc.setDrawColor(cC, cM, cY, cK);

  const lsMm = (settings.letter_spacing || 0) * PT_TO_MM;

  /* ── Render every sheet ── */
  sheets.forEach((sheet, sheetIdx) => {
    if (sheetIdx > 0) doc.addPage([sheet_width_mm, sheet_height_mm], orientation);

    sheet.items.forEach(item => {
      if (fontData) {
        drawGlyphOutlines(doc, item, fontData, settings, sheet_height_mm, sf, fillOp, strokeOp);
      } else {
        drawTextFallback(doc, item, settings, sheet_height_mm, sf, lsMm, outline_text, outline_thickness);
      }
    });
  });

  return doc;
}

/* ================================================================== *
 *  Vector glyph outlines (raw PDF path operators)
 * ================================================================== */

function drawGlyphOutlines(doc, item, fontData, settings, sheetH, sf, fillOp, strokeOp) {
  const outline = getStringOutline(
    fontData,
    item.name,
    settings.letter_spacing || 0,
    settings.word_spacing   || 0,
  );
  if (!outline || outline.length === 0) return;

  const unitScale = (100 / fontData.head.unitsPerEm) * PT_TO_MM;

  // ── Measure the actual outline bounding box (font units, Y-up) ──
  const bbox = computeOutlineBBox(outline);
  const outlineW_mm = (bbox.maxX - bbox.minX) * unitScale;
  const outlineH_mm = (bbox.maxY - bbox.minY) * unitScale;

  if (outlineW_mm <= 0 || outlineH_mm <= 0) return;

  // ── Compute scale so the outline bbox EXACTLY matches the target ──
  const sx = item.width  / outlineW_mm;
  const sy = item.height / outlineH_mm;

  // ── Verification: measure final outline dimensions before writing ──
  const finalW = outlineW_mm * sx;
  const finalH = outlineH_mm * sy;
  const TOL = 0.1; // mm

  if (Math.abs(finalW - item.width) > TOL || Math.abs(finalH - item.height) > TOL) {
    console.warn(
      `[PDF Verify] ⚠ "${item.name}": outline ${finalW.toFixed(3)}×${finalH.toFixed(3)}mm ` +
      `vs target ${item.width.toFixed(3)}×${item.height.toFixed(3)}mm — OUT OF TOLERANCE (±${TOL}mm)`
    );
  } else {
    console.log(
      `[PDF Verify] ✓ "${item.name}": ${finalW.toFixed(2)}×${finalH.toFixed(2)}mm ` +
      `(target ${item.width.toFixed(2)}×${item.height.toFixed(2)}mm, ratio ${(finalW / item.width).toFixed(4)})`
    );
  }

  const cm = buildOutlineCM(item, settings, sheetH, sf, sx, sy, bbox, unitScale);

  // ── Build raw PDF content-stream operators ──
  // Local coordinates: font units × unitScale = mm, Y-up.
  // The cm (with sf) converts local mm → PDF pt.
  let ops = 'q\n';
  ops += cm + '\n';
  ops += fillOp + '\n';

  if (settings.outline_text) {
    ops += strokeOp + '\n';
    ops += `${((settings.outline_thickness || 1) * 0.3 * sf).toFixed(3)} w\n`; // line width in pt
    ops += '1 j 1 J\n';
  }

  for (const p of outline) {
    const lx = p.x * unitScale; // mm, Y-up
    const ly = p.y * unitScale; // mm, Y-up

    if (p.type === 'M') {
      ops += `${lx.toFixed(4)} ${ly.toFixed(4)} m\n`;
    } else if (p.type === 'L') {
      ops += `${lx.toFixed(4)} ${ly.toFixed(4)} l\n`;
    } else if (p.type === 'C') {
      const c1x = p.cx1 * unitScale;
      const c1y = p.cy1 * unitScale;
      const c2x = p.cx2 * unitScale;
      const c2y = p.cy2 * unitScale;
      ops += `${c1x.toFixed(4)} ${c1y.toFixed(4)} ${c2x.toFixed(4)} ${c2y.toFixed(4)} ${lx.toFixed(4)} ${ly.toFixed(4)} c\n`;
    } else if (p.type === 'Z') {
      ops += 'h\n';
    }
  }

  ops += settings.outline_text ? 'S\n' : 'f\n';
  ops += 'Q\n';

  doc.internal.write(ops);
}

/* ================================================================== *
 *  Fallback: embedded-font text objects (system fonts / CFF OTF)
 * ================================================================== */

function buildTextCM(item, settings, sheetH, sf) {
  const natW  = (item.naturalWidth  || 1) * PT_TO_MM;
  const natH  = (item.naturalHeight || 1) * PT_TO_MM;
  const sx    = item.width  / natW;
  const sy    = item.height / natH;
  const ascMm = (item.ascent || 0) * PT_TO_MM;
  const descMm = ((item.naturalHeight || 0) - (item.ascent || 0)) * PT_TO_MM;

  if (item.rotated) {
    const sxRot = item.width  / natH;
    const syRot = item.height / natW;
    const e = sf * (item.x + sxRot * ascMm);
    const f = sf * (sheetH - item.y - syRot * 0);
    return `0 ${(-sf * syRot).toFixed(6)} ${sf * sxRot} 0 ${e.toFixed(3)} ${f.toFixed(3)} cm`;
  }
  if (settings.mirror_text) {
    const e = sf * (item.x + item.width);
    const f = sf * (sheetH - item.y - item.height + sy * ascMm);
    return `${(-sf * sx).toFixed(6)} 0 0 ${sf * sy} ${e.toFixed(3)} ${f.toFixed(3)} cm`;
  }
  const e = sf * item.x;
  const f = sf * (sheetH - item.y - item.height + sy * ascMm);
  return `${sf * sx} 0 0 ${sf * sy} ${e.toFixed(3)} ${f.toFixed(3)} cm`;
}

function drawTextFallback(doc, item, settings, sheetH, sf, lsMm, outlineMode, outlineThickness) {
  const leftMm = (item.left || 0) * PT_TO_MM;
  const cm = buildTextCM(item, settings, sheetH, sf);

  doc.internal.write('q');
  doc.internal.write(cm);

  if (outlineMode) {
    doc.setLineWidth((outlineThickness || 1) * 0.3);
  }

  // Place text at y = sheetH_mm so getVerticalCoordinate converts to 0 pt
  // (bottom of page).  The cm then positions and scales it correctly.
  doc.text(item.name, leftMm, sheetH, {
    renderingMode: outlineMode ? 1 : 0,
    charSpace: lsMm,
  });

  doc.internal.write('Q');
}

/* ---------- download helper ---------- */

export function downloadPDF(doc, filename = 'production-layout.pdf') {
  doc.save(filename);
}