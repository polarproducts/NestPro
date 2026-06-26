import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Grid3x3, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SheetCanvas({ sheets, settings, activeSheet, onSelectName, selectedName }) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showGaps, setShowGaps] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);

  const { sheet_width_mm, sheet_height_mm } = settings;
  const currentSheet = sheets[activeSheet] || { items: [] };

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 60;
    const scaleX = (rect.width - padding) / sheet_width_mm;
    const scaleY = (rect.height - padding) / sheet_height_mm;
    const newZoom = Math.min(scaleX, scaleY);
    setZoom(newZoom);
    setPan({
      x: (rect.width - sheet_width_mm * newZoom) / 2,
      y: (rect.height - sheet_height_mm * newZoom) / 2,
    });
  }, [sheet_width_mm, sheet_height_mm]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen, sheets, activeSheet]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.05, Math.min(10, prev * delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 0 && e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="flex-1 flex flex-col bg-[#0A0A0B] relative overflow-hidden rounded-xl">
      <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(10, z * 1.2))} className="text-white/50 hover:text-white hover:bg-white/5 h-7 w-7 p-0">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.05, z * 0.8))} className="text-white/50 hover:text-white hover:bg-white/5 h-7 w-7 p-0">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={fitToScreen} className="text-white/50 hover:text-white hover:bg-white/5 h-7 w-7 p-0">
            <Maximize className="w-3.5 h-3.5" />
          </Button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGaps(!showGaps)}
            className={`h-7 w-7 p-0 ${showGaps ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDimensions(!showDimensions)}
            className={`h-7 w-7 p-0 ${showDimensions ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
          >
            <Ruler className="w-3.5 h-3.5" />
          </Button>
        </div>
        <span className="text-xs text-white/30 font-mono">{Math.round(zoom * 100)}%</span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            width={sheet_width_mm * zoom}
            height={sheet_height_mm * zoom}
            viewBox={`0 0 ${sheet_width_mm} ${sheet_height_mm}`}
            className="drop-shadow-2xl"
          >
            {/* Sheet background */}
            <rect
              x={0} y={0}
              width={sheet_width_mm}
              height={sheet_height_mm}
              fill="#141416"
              stroke="#00C7D9"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />

            {/* Margin guides */}
            {settings.sheet_margin_mm > 0 && (
              <rect
                x={settings.sheet_margin_mm}
                y={settings.sheet_margin_mm}
                width={sheet_width_mm - 2 * settings.sheet_margin_mm}
                height={sheet_height_mm - 2 * settings.sheet_margin_mm}
                fill="none"
                stroke="#00C7D9"
                strokeWidth={0.3 / zoom}
                strokeDasharray={`${2 / zoom} ${2 / zoom}`}
                opacity={0.3}
              />
            )}

            {/* Names */}
            {currentSheet.items.map((item, i) => {
              const isSelected = selectedName === item.originalIndex;
              return (
                <g
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onSelectName?.(item.originalIndex); }}
                  className="cursor-pointer"
                >
                  {/* Bounding box */}
                  <rect
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    fill={isSelected ? 'rgba(0, 199, 217, 0.08)' : 'transparent'}
                    stroke={isSelected ? '#00C7D9' : item.warning ? '#F59E0B' : '#ffffff20'}
                    strokeWidth={isSelected ? 1.5 / zoom : 0.5 / zoom}
                    rx={0.5}
                  />

                  {/* Gap guides */}
                  {showGaps && (
                    <rect
                      x={item.x - settings.gap_mm / 2}
                      y={item.y - settings.gap_mm / 2}
                      width={item.width + settings.gap_mm}
                      height={item.height + settings.gap_mm}
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth={0.3 / zoom}
                      strokeDasharray={`${1.5 / zoom} ${1.5 / zoom}`}
                      opacity={0.4}
                    />
                  )}

                  {/* Text — drawn at font-size 100, then transform-scaled to exact mm */}
                  {(() => {
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

                    return (
                      <text
                        x={left}
                        y={ascent}
                        textAnchor="start"
                        fill={settings.outline_text ? 'none' : (settings.font_color || '#ffffff')}
                        stroke={settings.outline_text ? (settings.font_color || '#ffffff') : 'none'}
                        strokeWidth={settings.outline_text ? (settings.outline_thickness || 1) * 0.3 : 0}
                        fontSize={100}
                        fontFamily={settings.font_family || 'Arial'}
                        fontWeight={settings.font_bold ? 'bold' : 'normal'}
                        fontStyle={settings.font_italic ? 'italic' : 'normal'}
                        letterSpacing={settings.letter_spacing || 0}
                        transform={transform}
                        style={{ pointerEvents: 'none', wordSpacing: settings.word_spacing || 0 }}
                      >
                        {item.name}
                      </text>
                    );
                  })()}

                  {/* Dimensions */}
                  {showDimensions && (
                    <text
                      x={item.x + item.width / 2}
                      y={item.y + item.height + 3}
                      textAnchor="middle"
                      fill="#00C7D9"
                      fontSize={Math.max(3, 8 / zoom)}
                      fontFamily="monospace"
                      opacity={0.7}
                    >
                      {item.width.toFixed(1)}×{item.height.toFixed(1)}mm
                    </text>
                  )}
                </g>
              );
            })}

            {/* Sheet dimensions label */}
            <text x={sheet_width_mm / 2} y={sheet_height_mm + 12 / zoom} textAnchor="middle" fill="#ffffff40" fontSize={Math.max(4, 10 / zoom)} fontFamily="monospace">
              {sheet_width_mm} × {sheet_height_mm} mm
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}