import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SizeSettings({ settings, onSettingsChange }) {
  const update = (key, value) => onSettingsChange(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Dimensions</h3>

      <div>
        <Label className="text-xs text-white/50 mb-1 block">Size Mode</Label>
        <Select value={settings.size_mode} onValueChange={(v) => update('size_mode', v)}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1C] border-white/10">
            <SelectItem value="width" className="text-white/80 text-sm focus:bg-white/10 focus:text-white">Fixed Width</SelectItem>
            <SelectItem value="height" className="text-white/80 text-sm focus:bg-white/10 focus:text-white">Fixed Height</SelectItem>
            <SelectItem value="both" className="text-white/80 text-sm focus:bg-white/10 focus:text-white">Width & Height</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(settings.size_mode === 'width' || settings.size_mode === 'both') && (
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Width (mm)</Label>
          <Input
            type="number"
            value={settings.target_width_mm}
            onChange={(e) => update('target_width_mm', Number(e.target.value))}
            min={5}
            max={2000}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
      )}

      {(settings.size_mode === 'height' || settings.size_mode === 'both') && (
        <div>
          <Label className="text-xs text-white/50 mb-1 block">Height (mm)</Label>
          <Input
            type="number"
            value={settings.target_height_mm}
            onChange={(e) => update('target_height_mm', Number(e.target.value))}
            min={5}
            max={2000}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono"
          />
        </div>
      )}

      {settings.size_mode === 'both' && (
        <div className="flex items-center gap-2">
          <Switch checked={settings.stretch_enabled} onCheckedChange={(v) => update('stretch_enabled', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Stretch to fill</Label>
        </div>
      )}
    </div>
  );
}