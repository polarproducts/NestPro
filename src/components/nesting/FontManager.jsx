import React, { useRef, useState } from 'react';
import { Upload, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function FontManager({ fonts, onUpload, onDelete, loading }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ttf' && ext !== 'otf') {
      toast({ title: 'Unsupported format', description: 'Only TTF and OTF files are supported.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
      toast({ title: 'Font added', description: `${file.name} is now available.` });
    } catch (e) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Fonts</h3>
        <span className="text-xs text-cyan-400 font-mono">{fonts.length} custom</span>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
          dragOver ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-white/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-5 h-5 mx-auto mb-1.5 text-white/40" />
        <p className="text-xs text-white/50">
          {uploading ? 'Loading…' : 'Drop TTF or OTF'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf"
          className="hidden"
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {fonts.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {fonts.map(font => (
            <div
              key={font.id}
              className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-2 group"
            >
              <span
                className="text-sm text-white/80 truncate flex-1 mr-2"
                style={{ fontFamily: font.family }}
              >
                {font.name}
              </span>
              <button
                onClick={() => onDelete(font.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {fonts.length === 0 && !loading && (
        <div className="flex items-center gap-2 text-xs text-white/30 px-1">
          <Type className="w-3.5 h-3.5" />
          <span>No custom fonts yet</span>
        </div>
      )}
    </div>
  );
}