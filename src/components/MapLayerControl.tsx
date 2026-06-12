import { useState } from 'react';
import { useOps } from '../store/opsStore';
import { Building2, Diamond, MapPin, Waves, Users, Layers, ChevronDown, Check } from 'lucide-react';

const LAYERS = [
  { id: 'offices', label: 'مواقع المكاتب', icon: Building2, color: 'text-amber-400' },
  { id: 'borderCrossings', label: 'المنافذ الحدودية', icon: Diamond, color: 'text-emerald-400' },
  { id: 'events', label: 'الانتشار والفعاليات', icon: MapPin, color: 'text-blue-400' },
  { id: 'flowPaths', label: 'مسارات الزوار', icon: Waves, color: 'text-orange-400' },
  { id: 'agentGPS', label: 'مواقع المناديب (مباشر)', icon: Users, color: 'text-blue-300' },
];

interface Props {
  position?: 'right' | 'left';
  variant?: 'vertical' | 'horizontal';
  className?: string;
}

export default function MapLayerControl({ position = 'right', variant = 'vertical', className = '' }: Props) {
  const { state, dispatch } = useOps();
  const active = state.activeMapLayers;
  const [open, setOpen] = useState(false);
  const activeCount = LAYERS.filter(l => active.has(l.id)).length;

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-1 flex-wrap ${className}`}>
        {LAYERS.map(l => {
          const Icon = l.icon;
          const on = active.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.id })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold border transition-all ${
                on
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-[#0B0F19]/80 text-slate-400 border-[#1E293B] hover:border-slate-500'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${on ? l.color : ''}`} />
              {l.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Vertical side dropdown panel
  return (
    <div
      className={`absolute ${position === 'right' ? 'right-3' : 'left-3'} top-3 z-[400] ${className}`}
    >
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-lg text-xs font-bold text-slate-700 hover:border-amber-500 transition-colors min-w-[180px]"
      >
        <Layers className="w-4 h-4 text-amber-500" />
        <span className="flex-1 text-right">طبقات الخريطة</span>
        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold tabular-nums">
          {activeCount}/{LAYERS.length}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="mt-2 w-[240px] bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              تحديد الطبقات الظاهرة
            </div>
          </div>
          <div className="p-1">
            {LAYERS.map(l => {
              const Icon = l.icon;
              const on = active.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.id })}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors text-right ${
                    on ? 'bg-amber-50 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      on ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <Icon className={`w-4 h-4 shrink-0 ${on ? l.color.replace('text-', 'text-').replace('-400', '-500').replace('-300', '-500') : 'text-slate-400'}`} />
                  <span className="flex-1 font-semibold">{l.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex border-t border-slate-200">
            <button
              onClick={() => LAYERS.forEach(l => !active.has(l.id) && dispatch({ type: 'TOGGLE_LAYER', layer: l.id }))}
              className="flex-1 px-3 py-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              تفعيل الكل
            </button>
            <div className="w-px bg-slate-200" />
            <button
              onClick={() => LAYERS.forEach(l => active.has(l.id) && dispatch({ type: 'TOGGLE_LAYER', layer: l.id }))}
              className="flex-1 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              إخفاء الكل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
