import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const SYSTEM_FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia',
  'Verdana', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Palatino',
  'Garamond', 'Bookman', 'Tahoma', 'Lucida Console'
];

export default function TextSettings({ settings, onSettingsChange, customFonts = [] }) {
  const update = (key, value) => onSettingsChange(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Typography</h3>

      <div>
        <Label className="text-xs text-white/50 mb-1 block">Font Family</Label>
        <Select value={settings.font_family} onValueChange={(v) => update('font_family', v)}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1C] border-white/10">
            <SelectGroup>
              <SelectLabel className="text-white/40 text-xs">System</SelectLabel>
              {SYSTEM_FONTS.map(f => (
                <SelectItem key={f} value={f} className="text-white/80 text-sm focus:bg-white/10 focus:text-white">
                  <span style={{ fontFamily: f }}>{f}</span>
                </SelectItem>
              ))}
            </SelectGroup>
            {customFonts.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-white/40 text-xs">Custom</SelectLabel>
                  {customFonts.map(f => (
                    <SelectItem key={f.family} value={f.family} className="text-white/80 text-sm focus:bg-white/10 focus:text-white">
                      <span style={{ fontFamily: f.family }}>{f.name}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-white/50 mb-1 block">Font Colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={settings.font_color}
            onChange={(e) => update('font_color', e.target.value)}
            className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
          />
          <Input
            value={settings.font_color}
            onChange={(e) => update('font_color', e.target.value)}
            className="bg-white/5 border-white/10 text-white text-sm h-8 font-mono flex-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={settings.font_bold} onCheckedChange={(v) => update('font_bold', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Bold</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={settings.font_italic} onCheckedChange={(v) => update('font_italic', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Italic</Label>
        </div>
      </div>

      <div>
        <Label className="text-xs text-white/50 mb-1 block">Letter Spacing: {settings.letter_spacing}px</Label>
        <Slider
          value={[settings.letter_spacing]}
          onValueChange={([v]) => update('letter_spacing', v)}
          min={-5}
          max={20}
          step={0.5}
          className="[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-0 [&_.range]:bg-cyan-500"
        />
      </div>

      <div>
        <Label className="text-xs text-white/50 mb-1 block">Word Spacing: {settings.word_spacing}px</Label>
        <Slider
          value={[settings.word_spacing]}
          onValueChange={([v]) => update('word_spacing', v)}
          min={0}
          max={30}
          step={1}
          className="[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-0 [&_.range]:bg-cyan-500"
        />
      </div>

      <div className="space-y-2 pt-1 border-t border-white/5">
        <div className="flex items-center gap-2">
          <Switch checked={settings.outline_text} onCheckedChange={(v) => update('outline_text', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Outline Text</Label>
        </div>
        {settings.outline_text && (
          <div>
            <Label className="text-xs text-white/50 mb-1 block">Outline Thickness: {settings.outline_thickness}</Label>
            <Slider
              value={[settings.outline_thickness]}
              onValueChange={([v]) => update('outline_thickness', v)}
              min={0.5}
              max={5}
              step={0.5}
              className="[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-0 [&_.range]:bg-cyan-500"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch checked={settings.mirror_text} onCheckedChange={(v) => update('mirror_text', v)} className="data-[state=checked]:bg-cyan-500" />
          <Label className="text-xs text-white/50">Mirror Text</Label>
        </div>
      </div>
    </div>
  );
}