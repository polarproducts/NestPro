import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function SheetSettings({ settings, onSettingsChange }) {
  const update = (key, value) => onSettingsChange(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Sheet</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Width (mm)</Label>
          <Input
            type="number"
            value={settings.sheet_width_mm}
            onChange={(e) => update('sheet_width_mm', Number(e.target.value))}
            min={100}
            max={10000}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Height (mm)</Label>
          <Input
            type="number"
            value={settings.sheet_height_mm}
            onChange={(e) => update('sheet_height_mm', Number(e.target.value))}
            min={100}
            max={10000}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Gap (mm)</Label>
          <Input
            type="number"
            value={settings.gap_mm}
            onChange={(e) => update('gap_mm', Number(e.target.value))}
            min={0}
            max={50}
            step={0.5}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Margin (mm)</Label>
          <Input
            type="number"
            value={settings.sheet_margin_mm}
            onChange={(e) => update('sheet_margin_mm', Number(e.target.value))}
            min={0}
            max={50}
            step={0.5}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
      </div>

      <div className="space-y-2 pt-1 border-t border-white/5">
        <div className="flex items-center gap-2">
          <Switch checked={settings.allow_rotation} onCheckedChange={(v) => update('allow_rotation', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Allow 90° rotation</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={settings.auto_sort_by_size} onCheckedChange={(v) => update('auto_sort_by_size', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Sort by size before nesting</Label>
        </div>
      </div>
    </div>
  );
}