import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Polyline, Circle, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { OFFICES } from '../data/offices';
import { IRAQ_GOVERNORATES, KURDISTAN_CODES } from '../data/iraqGeo';
import { useOps } from '../store/opsStore';
import { officeById } from '../data/offices';
import type { Office } from '../data/offices';

// Fix Leaflet default icon path issues with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MAP_CONFIG = {
  center: [32.5, 44.0] as [number, number],
  zoom: 6,
  minZoom: 5,
  maxZoom: 12,
  // Iraq bounds only - tighter bounds
  maxBounds: [[29.0, 38.5], [37.5, 49.0]] as [[number, number], [number, number]],
  maxBoundsViscosity: 1.0, // Strict bounds
};

const governorateColor: Record<string, string> = {
  NIN: '#3B82F6', SLD: '#10B981', ANB: '#F97316', BGD: '#F59E0B',
  DLY: '#EF4444', KRK: '#8B5CF6', ERB: '#8B5CF6', SUL: '#8B5CF6', DOH: '#8B5CF6',
  WST: '#06B6D4', KRB: '#EC4899', NJF: '#84CC16', BBL: '#F472B6',
  QDS: '#FBBF24', MTH: '#A78BFA', DHQ: '#FB923C', MYS: '#34D399', BAS: '#F87171',
};

// Hexagonal amber SVG marker for offices
function createOfficeIcon(submitted: boolean, selected: boolean, kurdistan: boolean): L.DivIcon {
  const color = kurdistan ? '#6B7280' : submitted ? '#F59E0B' : '#475569';
  const ringColor = submitted ? '#3B82F6' : 'transparent';
  return L.divIcon({
    className: 'office-marker',
    html: `
      <div style="position:relative; width:36px; height:36px; transform:translate(-50%,-50%);">
        ${submitted ? `<div style="position:absolute; inset:0; border-radius:50%; border:2px solid ${ringColor}; animation:ripple 1.8s ease-out infinite;"></div>` : ''}
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 28 28" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
            <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="${color}" stroke="${selected ? '#FCD34D' : '#0B0F19'}" stroke-width="${selected ? 2.5 : 1.5}" opacity="${kurdistan ? 0.5 : 1}"/>
            <text x="14" y="17" text-anchor="middle" fill="${submitted && !kurdistan ? '#000' : '#fff'}" font-size="10" font-weight="900" font-family="Cairo, sans-serif">م</text>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createBorderIcon(): L.DivIcon {
  return L.divIcon({
    className: 'border-marker',
    html: `
      <div style="width:24px; height:24px; transform:translate(-50%,-50%); position:relative;">
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 22 22">
            <polygon points="11,1 21,11 11,21 1,11" fill="#10B981" stroke="#0B0F19" stroke-width="1.5" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"/>
            <polygon points="11,4 18,11 11,18 4,11" fill="#0B0F19" opacity="0.3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createAgentIcon(): L.DivIcon {
  return L.divIcon({
    className: 'agent-marker',
    html: `
      <div style="position:relative; width:28px; height:28px; transform:translate(-50%,-50%);">
        <div style="position:absolute; inset:0; border-radius:50%; background:rgba(59,130,246,0.3); animation:ripple 1.5s ease-out infinite;"></div>
        <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:10px; height:10px; border-radius:50%; background:#3B82F6; border:2px solid #fff; box-shadow:0 0 6px rgba(59,130,246,0.8);"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createEventIcon(): L.DivIcon {
  return L.divIcon({
    className: 'event-marker',
    html: `<div style="width:14px; height:14px; transform:translate(-50%,-50%); border-radius:50%; background:#3B82F6; border:2px solid #fff; box-shadow:0 0 8px rgba(59,130,246,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function createProcessionIcon(): L.DivIcon {
  return L.divIcon({
    className: 'proc-marker',
    html: `<div style="width:14px; height:14px; transform:translate(-50%,-50%); background:#F59E0B; border:2px solid #0B0F19; box-shadow:0 0 6px rgba(245,158,11,0.5); clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

interface IraqMapProps {
  onSelectOffice?: (office: Office | null) => void;
  selectedOfficeId?: string | null;
  height?: string;
  showLayerControl?: boolean;
  filterOfficeIds?: string[]; // restrict visible offices
  className?: string;
}

function MapController({ selectedOfficeId, onSelect }: { selectedOfficeId: string | null; onSelect?: (o: Office | null) => void }) {
  const map = useMap();
  useEffect(() => {
    if (selectedOfficeId) {
      const office = officeById(selectedOfficeId);
      if (office) {
        map.flyTo([office.lat, office.lng], 9, { duration: 0.8 });
        onSelect?.(office);
      }
    } else {
      map.flyTo(MAP_CONFIG.center, MAP_CONFIG.zoom, { duration: 0.8 });
    }
  }, [selectedOfficeId]);
  return null;
}

export default function IraqMap({ onSelectOffice, selectedOfficeId, height = '100%', filterOfficeIds, className = '' }: IraqMapProps) {
  const { state } = useOps();
  const officeIconCache = useRef<Map<string, L.DivIcon>>(new Map());
  const [hoveredGov, setHoveredGov] = useState<string | null>(null);

  const visibleOffices = useMemo(() => {
    if (!filterOfficeIds || filterOfficeIds.length === 0) return OFFICES;
    return OFFICES.filter(o => filterOfficeIds.includes(o.id));
  }, [filterOfficeIds]);

  const submittedOfficeIds = useMemo(() =>
    new Set(state.todayReports.map(r => r.officeId)),
    [state.todayReports]
  );

  const getOfficeIcon = (office: Office) => {
    const key = `${office.id}-${submittedOfficeIds.has(office.id) ? 1 : 0}-${selectedOfficeId === office.id ? 1 : 0}`;
    if (!officeIconCache.current.has(key)) {
      officeIconCache.current.set(key, createOfficeIcon(
        submittedOfficeIds.has(office.id),
        selectedOfficeId === office.id,
        KURDISTAN_CODES.includes(office.id)
      ));
    }
    return officeIconCache.current.get(key)!;
  };

  const borderIcon = useMemo(() => createBorderIcon(), []);
  const agentIcon = useMemo(() => createAgentIcon(), []);
  const eventIcon = useMemo(() => createEventIcon(), []);
  const procIcon = useMemo(() => createProcessionIcon(), []);

  const layers = state.activeMapLayers;

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <MapContainer
        center={MAP_CONFIG.center}
        zoom={MAP_CONFIG.zoom}
        minZoom={MAP_CONFIG.minZoom}
        maxZoom={MAP_CONFIG.maxZoom}
        maxBounds={MAP_CONFIG.maxBounds}
        maxBoundsViscosity={0.8}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
        attributionControl={true}
        className="z-0"
      >
        <ZoomControl position="topleft" />
        <MapController selectedOfficeId={selectedOfficeId ?? null} onSelect={onSelectOffice} />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {/* Iraq governorate polygons */}
        {IRAQ_GOVERNORATES.map(gov => {
          const isKurdistan = KURDISTAN_CODES.includes(gov.code);
          const isHover = hoveredGov === gov.code;
          const officeHere = OFFICES.find(o => o.id === gov.code);
          const isSelected = officeHere && selectedOfficeId === officeHere.id;

          return (
            <Polygon
              key={gov.code}
              positions={gov.polygon}
              eventHandlers={{
                mouseover: () => setHoveredGov(gov.code),
                mouseout: () => setHoveredGov(null),
                click: () => {
                  if (officeHere && !isKurdistan) {
                    onSelectOffice?.(officeHere);
                  }
                },
              }}
              pathOptions={{
                color: isKurdistan ? '#374151' : isSelected ? '#FCD34D' : isHover ? 'rgba(245, 158, 11, 0.6)' : 'rgba(100, 130, 160, 0.5)',
                weight: isSelected ? 2.5 : isHover ? 2 : 1,
                fillColor: isKurdistan ? '#000000' : governorateColor[gov.code] || '#1E293B',
                fillOpacity: isKurdistan ? 0.55 : isSelected ? 0.35 : isHover ? 0.25 : 0.12,
                dashArray: isKurdistan ? '6, 4' : undefined,
              }}
            />
          );
        })}

        {/* Kurdistan label */}
        <Marker position={[36.5, 45.2]} icon={L.divIcon({
          className: 'kurdistan-label',
          html: '<div style="color:#9CA3AF; font-family:Cairo; font-size:11px; font-weight:700; text-shadow:0 1px 2px #000; white-space:nowrap;">إقليم كوردستان</div>',
          iconSize: [120, 16],
          iconAnchor: [60, 8],
        })} interactive={false} />

        {/* Office markers */}
        {layers.has('offices') && visibleOffices.map(office => {
          const submitted = submittedOfficeIds.has(office.id);
          const report = state.todayReports.find(r => r.officeId === office.id);
          return (
            <Marker
              key={office.id}
              position={[office.lat, office.lng]}
              icon={getOfficeIcon(office)}
              eventHandlers={{
                click: () => onSelectOffice?.(office),
              }}
            >
              <Popup>
                <div className="text-right font-tajawal" dir="rtl" style={{ minWidth: 180 }}>
                  <div className="font-bold text-amber-400 mb-1">{office.nameAr}</div>
                  <div className="text-xs text-slate-400 mb-2">{office.governorateAr}</div>
                  {report ? (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span>الداخلون:</span><span className="font-bold text-emerald-400">{report.visitorsIn.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>العجلات:</span><span className="font-bold">{report.vehiclesCount.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>المواكب:</span><span className="font-bold">{report.processionsCount}</span></div>
                      <div className="text-[10px] text-slate-500 mt-1">حالة: {submitted ? (report.isLateSubmission ? 'متأخر' : 'في الوقت') : 'لم يُرسل'}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">لم يُرسل تقرير اليوم</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Border crossings */}
        {layers.has('borderCrossings') && state.borderCrossings.map(bc => (
          <Marker key={bc.id} position={[bc.lat, bc.lng]} icon={borderIcon}>
            <Popup>
              <div className="text-right font-tajawal" dir="rtl" style={{ minWidth: 180 }}>
                <div className="font-bold text-emerald-400 mb-1">{bc.nameAr}</div>
                <div className="text-xs text-slate-400 mb-2">{bc.countryFlag} {bc.neighboringCountryAr}</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>داخلون:</span><span className="font-bold text-emerald-400">{bc.dailyIn.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>خارجون:</span><span className="font-bold text-amber-400">{bc.dailyOut.toLocaleString()}</span></div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Visitor flow paths */}
        {layers.has('flowPaths') && state.flowPaths.map(fp => {
          const color = fp.density === 'high' ? '#EF4444' : fp.density === 'medium' ? '#F97316' : '#10B981';
          const weight = fp.density === 'high' ? 5 : fp.density === 'medium' ? 3.5 : 2;
          return (
            <Polyline
              key={fp.id}
              positions={[[fp.fromLat, fp.fromLng], [fp.toLat, fp.toLng]]}
              pathOptions={{
                color,
                weight,
                opacity: 0.7,
                className: fp.density === 'high' ? 'animate-flow' : '',
              }}
            />
          );
        })}

        {/* Events */}
        {layers.has('events') && state.todayReports.flatMap(r => r.eventsCoordinates.map((c, i) => (
          <Marker key={`e-${r.id}-${i}`} position={[c.lat, c.lng]} icon={eventIcon} />
        )))}

        {/* Procession waypoints */}
        {layers.has('events') && state.todayReports.flatMap(r => r.processionWaypoints.map((c, i) => (
          <Marker key={`p-${r.id}-${i}`} position={[c.lat, c.lng]} icon={procIcon} />
        )))}

        {/* Agent GPS */}
        {layers.has('agentGPS') && state.agentLocations.map(agent => {
          const minutesAgo = (Date.now() - new Date(agent.updatedAt).getTime()) / 60000;
          const isOnline = minutesAgo < 10;
          return (
            <div key={agent.agentId}>
              <Circle
                center={[agent.lat, agent.lng]}
                radius={500}
                pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.05, weight: 1, opacity: isOnline ? 0.4 : 0.15 }}
              />
              <Marker position={[agent.lat, agent.lng]} icon={agentIcon} opacity={isOnline ? 1 : 0.4}>
                <Popup>
                  <div className="text-right font-tajawal" dir="rtl">
                    <div className="font-bold text-blue-400 text-sm">{agent.agentName}</div>
                    <div className="text-xs text-slate-400">{officeById(agent.officeId)?.nameAr}</div>
                    <div className="text-[10px] text-slate-500 mt-1">آخر تحديث: {Math.round(minutesAgo)} دقيقة مضت</div>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
