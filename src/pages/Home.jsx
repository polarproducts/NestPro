import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Download, Settings2, ChevronLeft, ChevronRight, Search, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import NameUploader from '@/components/nesting/NameUploader';
import TextSettings from '@/components/nesting/TextSettings';
import SizeSettings from '@/components/nesting/SizeSettings';
import SheetSettings from '@/components/nesting/SheetSettings';
import SheetCanvas from '@/components/nesting/SheetCanvas';
import MetricsPanel from '@/components/nesting/MetricsPanel';
import { measureName, nestItems, calculateMetrics } from '@/lib/nestingEngine';
import { generateProductionPDF, downloadPDF } from '@/lib/pdfGenerator';
import { useFontManager } from '@/hooks/useFontManager';
import FontManager from '@/components/nesting/FontManager';

const DEFAULT_SETTINGS = {
  font_family: 'Arial',
  font_color: '#00C7D9',
  font_bold: false,
  font_italic: false,
  letter_spacing: 0,
  word_spacing: 0,
  size_mode: 'height',
  target_width_mm: 100,
  target_height_mm: 30,
  stretch_enabled: false,
  sheet_width_mm: 1000,
  sheet_height_mm: 560,
  gap_mm: 3,
  sheet_margin_mm: 5,
  allow_rotation: false,
  auto_sort_by_size: true,
  mirror_text: false,
  outline_text: false,
  outline_thickness: 1,
  remove_duplicates: true,
};

export default function Home() {
  const { toast } = useToast();
  const { fonts: customFonts, fontBuffers, uploadFont, removeFont, loading: fontsLoading } = useFontManager();
  const [names, setNames] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedName, setSelectedName] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [generating, setGenerating] = useState(false);

  const measuredItems = useMemo(() => {
    if (names.length === 0) return [];
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 200;
    return names.map(name => measureName(name, settings, canvas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, settings, customFonts]);

  const sheets = useMemo(() => {
    if (measuredItems.length === 0) return [];
    return nestItems(
      measuredItems,
      settings.sheet_width_mm,
      settings.sheet_height_mm,
      settings.gap_mm,
      settings.sheet_margin_mm,
      settings.allow_rotation,
      settings.auto_sort_by_size,
    );
  }, [measuredItems, settings.sheet_width_mm, settings.sheet_height_mm, settings.gap_mm, settings.sheet_margin_mm, settings.allow_rotation, settings.auto_sort_by_size]);

  const metrics = useMemo(() => {
    return calculateMetrics(sheets, settings.sheet_width_mm, settings.sheet_height_mm);
  }, [sheets, settings.sheet_width_mm, settings.sheet_height_mm]);

  useEffect(() => {
    if (activeSheet >= sheets.length && sheets.length > 0) {
      setActiveSheet(sheets.length - 1);
    }
  }, [sheets.length, activeSheet]);

  const filteredNames = searchQuery
    ? names.filter(n => n.toLowerCase().includes(searchQuery.toLowerCase()))
    : names;

  const handleGenerate = useCallback(async () => {
    if (sheets.length === 0) {
      toast({ title: 'No names to layout', description: 'Add some names first.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      // Wait until every font (system + custom) is fully loaded
      await document.fonts.ready;

      // If a custom font is selected, verify it actually loaded in the browser
      if (fontBuffers[settings.font_family]) {
        const faces = [...document.fonts].filter(f => f.family === settings.font_family);
        for (const face of faces) {
          if (face.status !== 'loaded') {
            await face.load().catch(() => {
              throw new Error(`Font "${settings.font_family}" failed to load.`);
            });
          }
        }
      }

      // generateProductionPDF throws if zero objects exist (prevents blank PDF)
      const doc = generateProductionPDF(sheets, settings, fontBuffers);
      downloadPDF(doc, `production-layout-${Date.now()}.pdf`);
      toast({ title: 'PDF Generated', description: `${sheets.length} sheet(s) exported successfully.` });
    } catch (err) {
      toast({
        title: 'PDF Export Failed',
        description: err.message || 'An unexpected error occurred during export.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, settings, toast, fontBuffers]);

  const handleSvgExport = useCallback(() => {
    if (sheets.length === 0) return;
    const sheet = sheets[activeSheet];
    const { sheet_width_mm, sheet_height_mm } = settings;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet_width_mm}mm" height="${sheet_height_mm}mm" viewBox="0 0 ${sheet_width_mm} ${sheet_height_mm}">`;
    sheet.items.forEach(item => {
      const natW = item.naturalWidth || item.width;
      const natH = item.naturalHeight || item.height;
      const ascent = item.ascent != null ? item.ascent : natH * 0.8;
      const left = item.left != null ? item.left : 0;
      const sx = item.width / natW;
      const sy = item.height / natH;
      let transform;
      if (item.rotated) {
        transform = `translate(${item.x},${item.y}) scale(${(item.width / natH).toFixed(5)},${(item.height / natW).toFixed(5)}) translate(0,${natW}) rotate(-90)`;
      } else if (settings.mirror_text) {
        transform = `translate(${item.x + item.width},${item.y}) scale(${(-sx).toFixed(5)},${sy.toFixed(5)})`;
      } else {
        transform = `translate(${item.x},${item.y}) scale(${sx.toFixed(5)},${sy.toFixed(5)})`;
      }
      const fill = settings.outline_text ? 'none' : (settings.font_color || '#000');
      const stroke = settings.outline_text ? (settings.font_color || '#000') : 'none';
      const strokeWidth = settings.outline_text ? (settings.outline_thickness || 1) * 0.3 : 0;
      svg += `<text x="${left}" y="${ascent}" font-size="100" font-family="${settings.font_family || 'Arial'}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" font-weight="${settings.font_bold ? 'bold' : 'normal'}" font-style="${settings.font_italic ? 'italic' : 'normal'}" letter-spacing="${settings.letter_spacing || 0}" transform="${transform}">${escapeXml(item.name)}</text>`;
    });
    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheet-${activeSheet + 1}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sheets, activeSheet, settings]);

  const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0B] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-[#0E0E10] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button className="lg:hidden text-white/50 hover:text-white" onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">N</span>
            </div>
            <h1 className="text-sm font-semibold tracking-tight hidden sm:block">NestPro</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSvgExport}
            disabled={sheets.length === 0}
            className="text-white/50 hover:text-white hover:bg-white/5 text-xs h-8"
          >
            SVG
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={sheets.length === 0 || generating}
            className="bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-600 hover:to-cyan-500 text-white text-xs h-8 px-4 font-semibold"
          >
            {generating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Generate PDF
              </>
            )}
          </Button>
          <button className="lg:hidden text-white/50 hover:text-white" onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}>
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel */}
        <div className={`
          ${leftOpen ? 'w-72' : 'w-0'}
          transition-all duration-300 border-r border-white/5 bg-[#0E0E10] overflow-hidden shrink-0
          hidden lg:block
        `}>
          {leftOpen && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <NameUploader
                  names={names}
                  onNamesChange={setNames}
                  removeDuplicates={settings.remove_duplicates}
                  onRemoveDuplicatesChange={(v) => setSettings(prev => ({ ...prev, remove_duplicates: v }))}
                />
                <div className="border-t border-white/5" />
                <FontManager
                  fonts={customFonts}
                  onUpload={uploadFont}
                  onDelete={removeFont}
                  loading={fontsLoading}
                />
                <div className="border-t border-white/5" />
                <TextSettings settings={settings} onSettingsChange={setSettings} customFonts={customFonts} />
                <div className="border-t border-white/5" />
                <SizeSettings settings={settings} onSettingsChange={setSettings} />
                <div className="border-t border-white/5" />
                <SheetSettings settings={settings} onSettingsChange={setSettings} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Left toggle button */}
        <button
          onClick={() => setLeftOpen(!leftOpen)}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-[#1A1A1C] border border-white/10 rounded-r-lg p-1 hover:bg-white/10 transition-colors"
          style={{ left: leftOpen ? '18rem' : 0 }}
        >
          {leftOpen ? <ChevronLeft className="w-3 h-3 text-white/50" /> : <ChevronRight className="w-3 h-3 text-white/50" />}
        </button>

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sheet tabs */}
          {sheets.length > 1 && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.02] border-b border-white/5 overflow-x-auto">
              {sheets.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSheet(i)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    i === activeSheet
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  Sheet {i + 1}
                </button>
              ))}
            </div>
          )}

          {sheets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                  <div className="w-12 h-8 border-2 border-dashed border-white/10 rounded" />
                </div>
                <h2 className="text-lg font-semibold text-white/60 mb-2">Empty Workspace</h2>
                <p className="text-sm text-white/30">Upload names or add them manually to start nesting onto production sheets.</p>
              </div>
            </div>
          ) : (
            <SheetCanvas
              sheets={sheets}
              settings={settings}
              activeSheet={activeSheet}
              selectedName={selectedName}
              onSelectName={setSelectedName}
            />
          )}
        </div>

        {/* Right Panel */}
        <div className={`
          ${rightOpen ? 'w-64' : 'w-0'}
          transition-all duration-300 border-l border-white/5 bg-[#0E0E10] overflow-hidden shrink-0
          hidden lg:block
        `}>
          {rightOpen && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                <MetricsPanel
                  metrics={metrics}
                  sheets={sheets}
                  activeSheet={activeSheet}
                  onActiveSheetChange={setActiveSheet}
                />

                {names.length > 0 && (
                  <>
                    <div className="border-t border-white/5" />
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Name List</h3>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search names..."
                          className="bg-white/5 border-white/10 text-white text-xs h-7 pl-8 placeholder:text-white/20"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-0.5">
                        {filteredNames.map((name, i) => {
                          const origIdx = names.indexOf(name);
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedName(origIdx)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-all ${
                                selectedName === origIdx
                                  ? 'bg-cyan-500/15 text-cyan-300'
                                  : 'text-white/50 hover:bg-white/5 hover:text-white/70'
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {selectedName !== null && measuredItems[selectedName] && (
                  <>
                    <div className="border-t border-white/5" />
                    <div className="space-y-2">
                      <h4 className="text-xs text-white/40 uppercase tracking-wider">Selected</h4>
                      <div className="bg-white/5 rounded-lg p-3 space-y-1">
                        <p className="text-sm text-white font-medium truncate">{measuredItems[selectedName].name}</p>
                        <p className="text-xs text-white/40 font-mono">
                          {measuredItems[selectedName].width.toFixed(1)} × {measuredItems[selectedName].height.toFixed(1)} mm
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right toggle */}
        <button
          onClick={() => setRightOpen(!rightOpen)}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-[#1A1A1C] border border-white/10 rounded-l-lg p-1 hover:bg-white/10 transition-colors"
          style={{ right: rightOpen ? '16rem' : 0 }}
        >
          {rightOpen ? <ChevronRight className="w-3 h-3 text-white/50" /> : <ChevronLeft className="w-3 h-3 text-white/50" />}
        </button>

        {/* Mobile Left Panel */}
        {mobilePanel === 'left' && (
          <div className="absolute inset-0 z-20 lg:hidden flex">
            <div className="w-80 max-w-[85vw] bg-[#0E0E10] border-r border-white/10 shadow-2xl">
              <div className="flex items-center justify-between p-3 border-b border-white/5">
                <span className="text-sm font-semibold text-white/80">Settings</span>
                <button onClick={() => setMobilePanel(null)}><X className="w-4 h-4 text-white/40" /></button>
              </div>
              <ScrollArea className="h-[calc(100%-48px)]">
                <div className="p-4 space-y-6">
                  <NameUploader
                    names={names}
                    onNamesChange={setNames}
                    removeDuplicates={settings.remove_duplicates}
                    onRemoveDuplicatesChange={(v) => setSettings(prev => ({ ...prev, remove_duplicates: v }))}
                  />
                  <div className="border-t border-white/5" />
                  <FontManager
                    fonts={customFonts}
                    onUpload={uploadFont}
                    onDelete={removeFont}
                    loading={fontsLoading}
                  />
                  <div className="border-t border-white/5" />
                  <TextSettings settings={settings} onSettingsChange={setSettings} customFonts={customFonts} />
                  <div className="border-t border-white/5" />
                  <SizeSettings settings={settings} onSettingsChange={setSettings} />
                  <div className="border-t border-white/5" />
                  <SheetSettings settings={settings} onSettingsChange={setSettings} />
                </div>
              </ScrollArea>
            </div>
            <div className="flex-1 bg-black/60" onClick={() => setMobilePanel(null)} />
          </div>
        )}

        {/* Mobile Right Panel */}
        {mobilePanel === 'right' && (
          <div className="absolute inset-0 z-20 lg:hidden flex flex-row-reverse">
            <div className="w-72 max-w-[80vw] bg-[#0E0E10] border-l border-white/10 shadow-2xl">
              <div className="flex items-center justify-between p-3 border-b border-white/5">
                <span className="text-sm font-semibold text-white/80">Production Info</span>
                <button onClick={() => setMobilePanel(null)}><X className="w-4 h-4 text-white/40" /></button>
              </div>
              <ScrollArea className="h-[calc(100%-48px)]">
                <div className="p-4 space-y-4">
                  <MetricsPanel
                    metrics={metrics}
                    sheets={sheets}
                    activeSheet={activeSheet}
                    onActiveSheetChange={setActiveSheet}
                  />
                </div>
              </ScrollArea>
            </div>
            <div className="flex-1 bg-black/60" onClick={() => setMobilePanel(null)} />
          </div>
        )}
      </div>
    </div>
  );
}