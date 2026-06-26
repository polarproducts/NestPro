/**
 * Nesting engine — vector-accurate text measurement + MaxRects 2D bin packing.
 *
 * Text is measured via canvas at a reference font-size of 100px, capturing the
 * true vector bounding box (actualBoundingBox*).  Scale factors are computed
 * so the rendered artwork exactly matches the user's target dimensions in mm.
 *
 * Packing uses the MaxRects algorithm with Best Short Side Fit (BSSF) heuristic
 * to maximise sheet utilisation.
 */

const PT_TO_MM = 25.4 / 72; // 1 pt = 0.352778 mm

/**
 * Measure a name's true vector bounding box and compute scale factors.
 * @param {string} name
 * @param {object} settings  font_*, size_mode, target_*_mm, letter_spacing, word_spacing
 * @param {HTMLCanvasElement} canvas  reusable canvas for measurement
 * @returns {{name,naturalWidth,naturalHeight,ascent,left,width,height,scaleX,scaleY}}
 */
export function measureName(name, settings, canvas) {
  const ctx = canvas.getContext('2d');
  const parts = [];
  if (settings.font_italic) parts.push('italic');
  if (settings.font_bold) parts.push('bold');
  parts.push('100px');
  parts.push(settings.font_family || 'Arial');
  ctx.font = parts.join(' ');

  // letterSpacing is a relatively new canvas property; guard for older browsers
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${settings.letter_spacing || 0}px`;
  }

  const m = ctx.measureText(name);

  // Word spacing is not universally supported by measureText, so add manually
  const wordCount = name.split(/\s+/).length;
  const wordSpacingPx = (settings.word_spacing || 0) * Math.max(0, wordCount - 1);

  const widthPx  = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0) + wordSpacingPx;
  const heightPx = (m.actualBoundingBoxAscent || 80) + (m.actualBoundingBoxDescent || 20);
  const ascentPx = m.actualBoundingBoxAscent || 80;
  const leftPx  = m.actualBoundingBoxLeft || 0;

  // Guard against zero-width / zero-height (spaces, empty names)
  if (widthPx <= 0 || heightPx <= 0) {
    return {
      name, naturalWidth: 1, naturalHeight: 1, ascent: 0.8, left: 0,
      width: settings.target_width_mm || 1,
      height: settings.target_height_mm || 1,
      scaleX: 1, scaleY: 1,
    };
  }

  // Natural dimensions at 100pt font (in mm) — used by the PDF renderer
  const natW = widthPx * PT_TO_MM;
  const natH = heightPx * PT_TO_MM;

  const mode = settings.size_mode || 'height';
  let scaleX, scaleY;

  if (mode === 'width') {
    // Uniform scale until vector width == target
    scaleX = settings.target_width_mm / natW;
    scaleY = scaleX;
  } else if (mode === 'height') {
    // Uniform scale until vector height == target
    scaleY = settings.target_height_mm / natH;
    scaleX = scaleY;
  } else {
    // Both — independent X / Y stretch so artwork exactly fills W × H
    scaleX = settings.target_width_mm  / natW;
    scaleY = settings.target_height_mm / natH;
  }

  return {
    name,
    naturalWidth: widthPx,
    naturalHeight: heightPx,
    ascent: ascentPx,
    left: leftPx,
    width:  scaleX * natW, // final mm
    height: scaleY * natH,
    scaleX,
    scaleY,
  };
}

/* ------------------------------------------------------------------ *
 *  MaxRects bin packer  (Best Short Side Fit)                        *
 * ------------------------------------------------------------------ */
class MaxRectsBin {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.freeRects = [{ x: 0, y: 0, width, height }];
  }

  /**
   * Try to insert a rectangle of (w × h).
   * If allowRotation is true, the 90°-rotated variant is also considered.
   * Returns the placed node or null if it doesn't fit.
   */
  insert(w, h, allowRotation) {
    const node = this._findBestPosition(w, h, allowRotation);
    if (!node) return null;
    this._placeRect(node);
    return node;
  }

  _findBestPosition(w, h, allowRotation) {
    let best = null;
    let bestShort = Infinity;
    let bestLong  = Infinity;

    for (const f of this.freeRects) {
      // Upright
      if (f.width >= w && f.height >= h) {
        const lh = f.width  - w;
        const lv = f.height - h;
        const short = Math.min(lh, lv);
        const long  = Math.max(lh, lv);
        if (short < bestShort || (short === bestShort && long < bestLong)) {
          best = { x: f.x, y: f.y, width: w, height: h, rotated: false };
          bestShort = short;
          bestLong  = long;
        }
      }
      // Rotated 90°
      if (allowRotation && f.width >= h && f.height >= w) {
        const lh = f.width  - h;
        const lv = f.height - w;
        const short = Math.min(lh, lv);
        const long  = Math.max(lh, lv);
        if (short < bestShort || (short === bestShort && long < bestLong)) {
          best = { x: f.x, y: f.y, width: h, height: w, rotated: true };
          bestShort = short;
          bestLong  = long;
        }
      }
    }
    return best;
  }

  _placeRect(node) {
    const next = [];
    for (const f of this.freeRects) {
      if (this._splitFreeNode(f, node, next)) {
        // f was split — fragments pushed into `next`
      } else {
        next.push(f);
      }
    }
    this.freeRects = next;
    this._pruneFreeList();
  }

  _splitFreeNode(free, used, out) {
    // No intersection → keep free rect as-is
    if (used.x >= free.x + free.width  || used.x + used.width  <= free.x ||
        used.y >= free.y + free.height || used.y + used.height <= free.y) {
      return false;
    }

    if (used.x < free.x + free.width && used.x + used.width > free.x) {
      // New node above the used rect
      if (used.y > free.y && used.y < free.y + free.height) {
        out.push({ x: free.x, y: free.y, width: free.width, height: used.y - free.y });
      }
      // New node below the used rect
      if (used.y + used.height < free.y + free.height) {
        out.push({
          x: free.x,
          y: used.y + used.height,
          width: free.width,
          height: free.y + free.height - (used.y + used.height),
        });
      }
    }

    if (used.y < free.y + free.height && used.y + used.height > free.y) {
      // New node to the left of the used rect
      if (used.x > free.x && used.x < free.x + free.width) {
        out.push({ x: free.x, y: free.y, width: used.x - free.x, height: free.height });
      }
      // New node to the right of the used rect
      if (used.x + used.width < free.x + free.width) {
        out.push({
          x: used.x + used.width,
          y: free.y,
          width: free.x + free.width - (used.x + used.width),
          height: free.height,
        });
      }
    }
    return true;
  }

  _pruneFreeList() {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this._isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1); i--; break;
        }
        if (this._isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1); j--;
        }
      }
    }
  }

  _isContainedIn(a, b) {
    return a.x >= b.x && a.y >= b.y &&
           a.x + a.width  <= b.x + b.width &&
           a.y + a.height <= b.y + b.height;
  }
}

/**
 * Pack measured items onto sheets using MaxRects-BSSF.
 * Each item's packing footprint = (width + gap) × (height + gap) so there is
 * at least `gap` mm clearance between every pair of adjacent names.
 *
 * @returns {Array<{items:Array}>}  one entry per sheet
 */
export function nestItems(items, sheetW, sheetH, gap, margin, allowRotation, sortBySize) {
  const usableW = sheetW - 2 * margin;
  const usableH = sheetH - 2 * margin;

  let sorted = items.map((item, idx) => ({ ...item, originalIndex: idx }));

  // Sort largest-first (by area, then tallest-first) for better packing
  if (sortBySize) {
    sorted.sort((a, b) => {
      const d = b.width * b.height - a.width * a.height;
      return d !== 0 ? d : b.height - a.height;
    });
  }

  const sheets = [];
  let bin = new MaxRectsBin(usableW, usableH);
  let currentItems = [];

  for (const item of sorted) {
    const packW = item.width  + gap;
    const packH = item.height + gap;

    let node = bin.insert(packW, packH, allowRotation);

    if (!node) {
      // Current sheet is full — start a new one
      if (currentItems.length > 0) sheets.push({ items: currentItems });
      bin = new MaxRectsBin(usableW, usableH);
      currentItems = [];
      node = bin.insert(packW, packH, allowRotation);
    }

    if (!node) {
      // Item too big for an empty sheet — place with a warning
      currentItems.push({
        ...item,
        x: margin, y: margin,
        width: item.width, height: item.height,
        rotated: false, warning: 'exceeds_sheet',
      });
      continue;
    }

    const rotated = node.rotated;
    const finalW = rotated ? item.height : item.width;
    const finalH = rotated ? item.width  : item.height;

    currentItems.push({
      ...item,                    // preserve naturalWidth, naturalHeight, ascent, left, scaleX, scaleY
      x: node.x + margin,
      y: node.y + margin,
      width:  finalW,
      height: finalH,
      originalWidth:  item.width,
      originalHeight: item.height,
      rotated,
    });
  }

  if (currentItems.length > 0) sheets.push({ items: currentItems });
  return sheets;
}

/**
 * Per-sheet utilisation metrics.
 */
export function calculateMetrics(sheets, sheetW, sheetH) {
  const sheetArea = sheetW * sheetH;
  return sheets.map((sheet, index) => {
    const usedArea = sheet.items.reduce((s, it) => s + it.width * it.height, 0);
    const utilization = (usedArea / sheetArea) * 100;
    return {
      sheetIndex: index,
      nameCount: sheet.items.length,
      usedArea: Math.round(usedArea),
      totalArea: sheetArea,
      unusedArea: Math.round(sheetArea - usedArea),
      utilization: Math.round(utilization * 10) / 10,
    };
  });
}