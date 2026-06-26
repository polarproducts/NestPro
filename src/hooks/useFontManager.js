import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllFonts, saveFont, deleteFont, parseFontName } from '@/lib/fontStorage';

/**
 * Manages uploaded TTF/OTF fonts:
 * - Loads all persisted fonts from IndexedDB on mount
 * - Registers each in the browser via FontFace (for canvas/SVG measurement & preview)
 * - Provides uploadFont(file) and removeFont(id)
 * - Exposes fontBuffers map for PDF embedding
 */
export function useFontManager() {
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const faceMapRef = useRef(new Map());
  const bufferMapRef = useRef(new Map());

  const loadAll = useCallback(async () => {
    const stored = await getAllFonts();
    for (const f of stored) {
      try {
        const face = new FontFace(f.family, f.buffer);
        await face.load();
        document.fonts.add(face);
        faceMapRef.current.set(f.family, face);
        bufferMapRef.current.set(f.family, f.buffer);
      } catch (e) {
        console.error('Failed to load font:', f.name, e);
      }
    }
    setFonts(stored.map(f => ({ id: f.id, name: f.name, family: f.family })));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const uploadFont = useCallback(async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ttf' && ext !== 'otf') {
      throw new Error('Only TTF and OTF files are supported');
    }
    const buffer = await file.arrayBuffer();
    const name = parseFontName(buffer) || file.name.replace(/\.[^.]+$/, '');
    const id = `font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const family = `NestPro_${id}`;

    const face = new FontFace(family, buffer);
    await face.load();
    document.fonts.add(face);
    faceMapRef.current.set(family, face);
    bufferMapRef.current.set(family, buffer);

    await saveFont({ id, name, family, buffer });
    setFonts(prev => [...prev, { id, name, family }]);
    return { id, name, family };
  }, []);

  const removeFont = useCallback(async (id) => {
    const font = fonts.find(f => f.id === id);
    if (!font) return;

    const face = faceMapRef.current.get(font.family);
    if (face) {
      document.fonts.delete(face);
      faceMapRef.current.delete(font.family);
    }
    bufferMapRef.current.delete(font.family);
    await deleteFont(id);
    setFonts(prev => prev.filter(f => f.id !== id));
  }, [fonts]);

  return { fonts, loading, uploadFont, removeFont, fontBuffers: bufferMapRef.current };
}