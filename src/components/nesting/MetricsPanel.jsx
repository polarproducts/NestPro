import React from 'react';
import { Layers, BarChart3, Box, Scissors } from 'lucide-react';

export default function MetricsPanel({ metrics, sheets, activeSheet, onActiveSheetChange }) {
  const totalNames = metrics.reduce((sum, m) => sum + m.nameCount, 0);
  const avgUtilization = metrics.length > 0
    ? (metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Production</h3>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <Layers className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-2xl font-bold text-white font-mono">{sheets.length}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Sheets</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <Scissors className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-2xl font-bold text-white font-mono">{totalNames}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Names</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <BarChart3 className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-2xl font-bold text-white font-mono">{avgUtilization}%</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Utilization</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <Box className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-2xl font-bold text-white font-mono">
            {metrics[activeSheet]?.nameCount || 0}
          </div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">This Sheet</div>
        </div>
      </div>

      {sheets.length > 1 && (
        <div className="space-y-1.5">
          <h4 className="text-xs text-white/40 uppercase tracking-wider">Sheets</h4>
          {metrics.map((m, i) => (
            <button
              key={i}
              onClick={() => onActiveSheetChange(i)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all text-xs ${
                i === activeSheet
                  ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
                  : 'bg-white/5 border border-transparent text-white/60 hover:bg-white/8'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">Sheet {i + 1}</span>
                <span className="font-mono">{m.nameCount} names</span>
              </div>
              <div className="mt-1 w-full bg-white/10 rounded-full h-1.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${m.utilization}%`,
                    background: m.utilization > 75 ? '#00C7D9' : m.utilization > 50 ? '#F59E0B' : '#EF4444',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-white/30 font-mono">
                <span>{m.utilization}% used</span>
                <span>{(m.unusedArea / 100).toFixed(0)} cm² unused</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}