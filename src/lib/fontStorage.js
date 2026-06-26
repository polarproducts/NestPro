/**
 * Font storage — IndexedDB persistence for uploaded TTF/OTF files,
 * plus TTF/OTF name-table parsing and base64 conversion for jsPDF.
 */

const DB_NAME = 'nestpro-fonts';
const STORE = 'fonts';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFont(font) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(font);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFonts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFont(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Parse the Full Name (nameID 4) from a TTF/OTF file's name table.
 * Falls back to null if parsing fails.
 */
export function parseFontName(buffer) {
  try {
    const view = new DataView(buffer);
    const numTables = view.getUint16(4);
    let nameOffset = 0;
    for (let i = 0; i < numTables; i++) {
      const off = 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(off), view.getUint8(off + 1),
        view.getUint8(off + 2), view.getUint8(off + 3)
      );
      if (tag === 'name') {
        nameOffset = view.getUint32(off + 8);
        break;
      }
    }
    if (!nameOffset) return null;

    const count = view.getUint16(nameOffset + 2);
    const stringOffset = nameOffset + view.getUint16(nameOffset + 4);

    let fullName = null;
    let fontFamily = null;

    for (let i = 0; i < count; i++) {
      const rec = nameOffset + 6 + i * 12;
      const platformID = view.getUint16(rec);
      const nameID = view.getUint16(rec + 6);
      const length = view.getUint16(rec + 8);
      const offset = view.getUint16(rec + 10);

      const strStart = stringOffset + offset;
      let str = '';
      if (platformID === 0 || platformID === 3) {
        for (let j = 0; j < length; j += 2) {
          str += String.fromCharCode(view.getUint16(strStart + j));
        }
      } else {
        for (let j = 0; j < length; j++) {
          str += String.fromCharCode(view.getUint8(strStart + j));
        }
      }

      if (nameID === 4 && !fullName) fullName = str;
      if (nameID === 1 && !fontFamily) fontFamily = str;
    }

    return fullName || fontFamily || null;
  } catch {
    return null;
  }
}

export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}