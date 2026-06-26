import React, { useRef, useState } from 'react';
import { Upload, FileText, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function NameUploader({ names, onNamesChange, removeDuplicates, onRemoveDuplicatesChange }) {
  const fileRef = useRef(null);
  const [newName, setNewName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const processText = (text) => {
    let lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (removeDuplicates) {
      lines = [...new Set(lines)];
    }
    onNamesChange(prev => {
      const combined = [...prev, ...lines];
      return removeDuplicates ? [...new Set(combined)] : combined;
    });
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      processText(text.replace(/,/g, '\n'));
    } else if (ext === 'xlsx' || ext === 'xls') {
      const text = await file.text();
      processText(text);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const addName = () => {
    if (newName.trim()) {
      onNamesChange(prev => [...prev, newName.trim()]);
      setNewName('');
    }
  };

  const removeName = (index) => {
    onNamesChange(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Names</h3>
        <span className="text-xs text-cyan-400 font-mono">{names.length} items</span>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
          dragOver ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-white/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-5 h-5 mx-auto mb-1.5 text-white/40" />
        <p className="text-xs text-white/50">Drop CSV, TXT, or Excel</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addName()}
          placeholder="Add name manually..."
          className="bg-white/5 border-white/10 text-white text-sm placeholder:text-white/30 h-8"
        />
        <Button size="sm" onClick={addName} className="bg-cyan-500 hover:bg-cyan-600 text-white h-8 px-2">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={removeDuplicates}
          onCheckedChange={onRemoveDuplicatesChange}
          className="data-[state=checked]:bg-cyan-500"
        />
        <Label className="text-xs text-white/50">Remove duplicates</Label>
      </div>

      {names.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin pr-1">
          {names.map((name, i) => (
            <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-1.5 group">
              <span className="text-xs text-white/80 truncate flex-1 mr-2">{name}</span>
              <button onClick={() => removeName(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3 text-white/40 hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}