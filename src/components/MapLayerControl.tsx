import { useOps } from '../store/opsStore';
import { Building2, Diamond, MapPin, Waves, Users } from 'lucide-react';

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

  return (
    <div
      className={`absolute ${position === 'right' ? 'left-3' : 'right-3'} top-3 bg-[#0B0F19]/85 backdrop-blur-md border border-[#1E293B] rounded-xl p-1.5 z-[400] shadow-xl ${className}`}
    >
      <div className="text-[10px] text-slate-500 font-bold px-2 py-1 uppercase tracking-wider">الطبقات</div>
      <div className="space-y-0.5">
        {LAYERS.map(l => {
          const Icon = l.icon;
          const on = active.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.id })}
              title={l.label}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all ${
                on ? 'bg-amber-500/10 text-amber-300' : 'text-slate-400 hover:bg-[#1E293B]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${on ? l.color : ''}`} />
              <span className="truncate text-right">{l.label}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-amber-400' : 'bg-slate-700'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
