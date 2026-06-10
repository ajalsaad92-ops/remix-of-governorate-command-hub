import { useState, useEffect, useRef } from 'react';
import { useOps } from '../store/opsStore';
import { officeById } from '../data/offices';
import { MapPin, ChevronDown, Send, MapPinned, X, AlertTriangle, Lock, Timer, Check, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import TimeLockBar from '../components/TimeLockBar';
import IraqMap from '../components/IraqMap';

const FIELDS = [
  { id: 1, title: 'الانتشار', fields: [
    { key: 'deploymentCount', label: 'عدد عناصر الانتشار', type: 'number' },
    { key: 'deploymentLocations', label: 'مواقع الانتشار', type: 'textarea', max: 200 },
    { key: 'deploymentFormations', label: 'التشكيلات والمهام', type: 'textarea', max: 200 },
  ]},
  { id: 2, title: 'التنسيق والتعاون', fields: [
    { key: 'coordinationSectors', label: 'القطاعات والعمليات المشتركة', type: 'textarea' },
    { key: 'coordinationJointOps', label: 'تفاصيل التنسيق مع الجهات', type: 'textarea' },
  ]},
  { id: 3, title: 'الإبلاغ عن الحالات المشبوهة والحوادث', fields: [
    { key: 'incidentsCount', label: 'عدد البلاغات', type: 'number' },
    { key: 'incidentsDetails', label: 'التفاصيل والجهد الاستخباري', type: 'textarea' },
  ]},
  { id: 4, title: 'الخروقات الأمنية والثقافية', fields: [
    { key: 'violationsCount', label: 'عدد الخروقات', type: 'number' },
    { key: 'violationsArea', label: 'المنطقة', type: 'text' },
    { key: 'violationsTimeDetail', label: 'التوقيت (مثال 14:30)', type: 'text' },
    { key: 'violationsDetails', label: 'التفاصيل', type: 'textarea' },
  ]},
  { id: 5, title: 'الوفيات ضمن حدودكم', fields: [
    { key: 'deathsCount', label: 'عدد الوفيات', type: 'number' },
    { key: 'deathsLocationMgrs', label: 'الموقع (MGRS)', type: 'text', placeholder: '38SMB1234567890' },
    { key: 'deathsActionTaken', label: 'الإجراء المتخذ', type: 'textarea' },
  ]},
  { id: 6, title: 'توزيع الموارد', fields: [
    { key: 'resourcesDistributed', label: 'كمية الموارد الموزعة', type: 'number' },
    { key: 'resourcesDetails', label: 'نوع وتفاصيل الموارد', type: 'textarea' },
  ]},
  { id: 7, title: 'الفعاليات', fields: [
    { key: 'eventsCount', label: 'عدد الفعاليات', type: 'number' },
    { key: 'eventsDetails', label: 'التفاصيل والمستهدفون', type: 'textarea' },
    { key: 'eventsLocation', label: 'موقع الفعالية (تثبيت على الخريطة)', type: 'location' },
  ]},
  { id: 8, title: 'الزيارات', fields: [
    { key: 'visitsCount', label: 'عدد الزيارات', type: 'number' },
    { key: 'visitsSummary', label: 'ملخص مختصر (بدون ذكر المسميات)', type: 'textarea', max: 150, helper: 'بدون ذكر المسميات الشخصية' },
  ]},
  { id: 9, title: 'حركة الزائرين والقطوعات', fields: [
    { key: 'visitorsIn', label: 'الوافدون (داخلون)', type: 'number' },
    { key: 'visitorsOut', label: 'المغادرون (خارجون)', type: 'number' },
    { key: 'visitorsRoutes', label: 'محاور السير والقطوعات', type: 'textarea' },
  ]},
  { id: 10, title: 'حركة العجلات', fields: [
    { key: 'vehiclesCount', label: 'عدد الآليات الإجمالي', type: 'number' },
    { key: 'vehiclesDetails', label: 'التفاصيل والنوع والمهمة', type: 'textarea' },
  ]},
  { id: 11, title: 'حركات المواكب', fields: [
    { key: 'processionsCount', label: 'عدد المواكب', type: 'number' },
    { key: 'processionsDetails', label: 'المسارات والخدمات', type: 'textarea' },
    { key: 'processionRoute', label: 'نقاط تثبيت المواكب (متعدد)', type: 'multi-location' },
  ]},
  { id: 12, title: 'ملاحظات أخرى', fields: [
    { key: 'otherNotes', label: 'أي تحديثات خدمية أو لوجستية إضافية', type: 'textarea', max: 500 },
  ]},
];

export default function ReportPage() {
  const { state, actions } = useOps();
  const user = state.currentUser;
  if (!user) return <div className="h-full flex items-center justify-center text-slate-500">جاري التحميل...</div>;
  const office = officeById(user.officeId);
  if (!office) return <div className="h-full flex items-center justify-center text-red-400">المكتب غير موجود</div>;
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set([1]));
  const [form, setForm] = useState<Record<string, any>>({});
  const [showExtension, setShowExtension] = useState(false);
  const [extensionReason, setExtensionReason] = useState('');
  const [mapPickerOpen, setMapPickerOpen] = useState<null | 'event' | 'procession'>(null);
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickedWaypoints, setPickedWaypoints] = useState<{ lat: number; lng: number }[]>([]);
  const [mgrs, setMgrs] = useState('');
  const [reporterLat, setReporterLat] = useState<number | null>(null);
  const [reporterLng, setReporterLng] = useState<number | null>(null);

  const reportExists = state.todayReports.find(r => r.officeId === user.officeId);
  const extensionActive = state.extensions.find(e => e.officeId === user.officeId && e.status === 'approved');
  const status = state.timeWindowStatus;

  const canSubmit = status === 'open' || status === 'pre_warning' || (extensionActive !== undefined);

  // GPS tracking for agents
  const watchIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (user.role === 'agent' && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setReporterLat(pos.coords.latitude);
          setReporterLng(pos.coords.longitude);
          actions.updateAgentLocation({
            agentId: user.id,
            agentName: user.fullNameAr,
            officeId: user.officeId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        },
        null,
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
      );
    }
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [user.id, user.role]);

  const updateField = (key: string, value: any) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const completedFields = new Set(Object.keys(form).filter(k => form[k] && form[k] !== ''));

  const handleSubmit = async () => {
    if (!canSubmit && !extensionActive) {
      setShowExtension(true);
      return;
    }
    if (!office) return;
    if (!mgrs && (reporterLat == null || reporterLng == null)) {
      toast.error('الرجاء تحديد موقعك قبل إرسال التقرير');
      return;
    }
    // Validation
    const numericKeys = ['deploymentCount','incidentsCount','violationsCount','deathsCount','resourcesDistributed','eventsCount','visitsCount','visitorsIn','visitorsOut','vehiclesCount','processionsCount'];
    for (const k of numericKeys) {
      const v = form[k];
      if (v !== undefined && v !== '' && (isNaN(Number(v)) || Number(v) < 0)) {
        toast.error(`قيمة غير صالحة في حقل: ${k}`);
        return;
      }
    }
    const t = toast.loading('جاري إرسال التقرير...');
    try {
      await actions.submitReport({
        id: `r-new-${Date.now()}`,
        officeId: office.id,
        submittedBy: user.id,
        reportDate: new Date().toISOString().slice(0, 10),
        submittedAt: new Date().toISOString(),
        isLateSubmission: status === 'pre_warning' || status === 'locked',
        deploymentCount: Number(form.deploymentCount || 0),
        deploymentLocations: form.deploymentLocations || '',
        deploymentFormations: form.deploymentFormations || '',
        coordinationSectors: form.coordinationSectors || '',
        coordinationJointOps: form.coordinationJointOps || '',
        incidentsCount: Number(form.incidentsCount || 0),
        incidentsDetails: form.incidentsDetails || '',
        violationsCount: Number(form.violationsCount || 0),
        violationsArea: form.violationsArea || '',
        violationsTimeDetail: form.violationsTimeDetail || '',
        violationsDetails: form.violationsDetails || '',
        deathsCount: Number(form.deathsCount || 0),
        deathsLocationMgrs: form.deathsLocationMgrs || '',
        deathsActionTaken: form.deathsActionTaken || '',
        resourcesDistributed: Number(form.resourcesDistributed || 0),
        resourcesDetails: form.resourcesDetails || '',
        eventsCount: Number(form.eventsCount || 0),
        eventsDetails: form.eventsDetails || '',
        eventsCoordinates: pickedLocation ? [pickedLocation] : [],
        visitsCount: Number(form.visitsCount || 0),
        visitsSummary: form.visitsSummary || '',
        visitorsIn: Number(form.visitorsIn || 0),
        visitorsOut: Number(form.visitorsOut || 0),
        visitorsRoutes: form.visitorsRoutes || '',
        vehiclesCount: Number(form.vehiclesCount || 0),
        vehiclesDetails: form.vehiclesDetails || '',
        processionsCount: Number(form.processionsCount || 0),
        processionsDetails: form.processionsDetails || '',
        processionWaypoints: pickedWaypoints,
        otherNotes: form.otherNotes || '',
        reporterLat: reporterLat ?? undefined,
        reporterLng: reporterLng ?? undefined,
        mgrsReference: mgrs,
      });
      toast.success('✅ تم إرسال التقرير بنجاح', { id: t, description: 'تم إخطار المشرف والمدير' });
      setForm({});
      setPickedLocation(null);
      setPickedWaypoints([]);
    } catch (e) {
      toast.error('فشل إرسال التقرير', { id: t });
    }
  };

  const submitExtension = async () => {
    if (!office) return;
    if (!extensionReason.trim()) {
      toast.error('الرجاء كتابة سبب طلب التمديد');
      return;
    }
    const t = toast.loading('جاري رفع الطلب...');
    try {
      await actions.submitExtension({
        id: `ex-${Date.now()}`,
        requestedById: user.id,
        requestedByName: user.fullNameAr,
        officeId: office.id,
        requestTime: new Date().toISOString(),
        reason: extensionReason,
        status: 'pending' as const,
      });
      toast.success('تم رفع طلب التمديد إلى مدير المكتب', { id: t, description: 'ستصلك إشعار عند الموافقة' });
      setShowExtension(false);
      setExtensionReason('');
    } catch (e) {
      toast.error('فشل رفع الطلب', { id: t });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0B0F19]">
      {/* Mobile header */}
      <div className="lg:hidden p-3 bg-[#111827] border-b border-[#1E293B]">
        <TimeLockBar />
      </div>

      <div className="max-w-3xl mx-auto p-3 md:p-4">
        {/* Header */}
        <div className="bg-gradient-to-l from-[#111827] to-[#0B0F19] border border-[#1E293B] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Send className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-display font-black text-amber-400 truncate">التقرير اليومي الميداني</div>
              <div className="text-xs text-slate-400 truncate">{office?.nameAr} — {office?.governorateAr} • {new Date().toLocaleDateString('ar-IQ')}</div>
            </div>
            <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
              status === 'open' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
              status === 'pre_warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse-alert' :
              'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {status === 'open' ? 'مفتوحة' : status === 'pre_warning' ? 'تحذير' : 'مغلقة'}
            </div>
          </div>

          {reportExists && (
            <div className="mt-3 p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" /> تم إرسال تقرير اليوم — {new Date(reportExists.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          {FIELDS.map(group => {
            const expanded = expandedCards.has(group.id);
            const groupCompleted = group.fields.every(f => completedFields.has(f.key));
            return (
              <div key={group.id} className="bg-[#111827] border border-[#1E293B] rounded-xl overflow-hidden">
                <button
                  onClick={() => {
                    const next = new Set(expandedCards);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    setExpandedCards(next);
                  }}
                  className="w-full p-4 flex items-center gap-3 hover:bg-[#1E293B]/40 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display font-black text-sm shrink-0">
                    {String(group.id).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])}
                  </div>
                  <div className="flex-1 text-right">
                    <div className="font-bold text-sm">{group.title}</div>
                    <div className="text-[10px] text-slate-500">{group.fields.length} حقول</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${groupCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50'}`}>
                    {groupCompleted ? <Check className="w-3 h-3" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="p-4 pt-0 space-y-3 animate-fade-in-up">
                    {group.fields.map(field => (
                      <FieldRenderer
                        key={field.key}
                        field={field}
                        value={form[field.key]}
                        onChange={(v: any) => updateField(field.key, v)}
                        pickedLocation={pickedLocation}
                        pickedWaypoints={pickedWaypoints}
                        onOpenMapPicker={(type: 'event' | 'procession') => setMapPickerOpen(type)}
                        onRemoveWaypoint={(idx: number) => setPickedWaypoints(p => p.filter((_, i) => i !== idx))}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Submit area */}
        <div className="mt-4 bg-[#111827] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <div className="text-xs text-slate-400 font-bold mb-1">بيانات الموقع</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (p) => { setReporterLat(p.coords.latitude); setReporterLng(p.coords.longitude); toast.success('تم تحديد موقعك'); },
                    () => toast.error('فشل تحديد الموقع')
                  );
                }
              }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-sm font-bold hover:bg-blue-500/25 transition-colors"
            >
              <Crosshair className="w-4 h-4" /> تحديد الموقع تلقائياً
            </button>
            <input
              placeholder="MGRS (اختياري)"
              value={mgrs}
              onChange={e => setMgrs(e.target.value)}
              className="bg-[#1E293B] border border-[#263244] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/40 focus:outline-none"
            />
          </div>
          {(reporterLat != null && reporterLng != null) && (
            <div className="text-[10px] text-slate-500 bg-[#0B0F19] border border-[#1E293B] rounded p-2">
              📍 {reporterLat.toFixed(5)}, {reporterLng.toFixed(5)}
            </div>
          )}

          <div className="text-[10px] text-slate-500">
            التوقيت العسكري: <span className="text-slate-300 font-mono">{state.serverTime.toLocaleTimeString('en-GB', { hour12: false })} بتوقيت السيرفر</span>
          </div>

          {extensionActive && (
            <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 flex items-center gap-2">
              <Timer className="w-3.5 h-3.5" /> تمديد نشط — يمكنك الإرسال الآن
            </div>
          )}

          {status === 'pre_warning' && canSubmit && (
            <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2 animate-pulse-alert">
              <AlertTriangle className="w-3.5 h-3.5" /> تحذير — متبقي وقت محدود على إغلاق نافذة التقرير
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={status === 'locked' && !extensionActive}
            className={`w-full py-3.5 rounded-lg font-display font-black text-base transition-all ${
              status === 'locked' && !extensionActive
                ? 'bg-red-600/80 hover:bg-red-500 text-white'
                : extensionActive
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
            }`}
          >
            {status === 'locked' && !extensionActive ? (
              <span className="flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> انتهى وقت الإرسال — طلب تمديد</span>
            ) : extensionActive ? (
              <span className="flex items-center justify-center gap-2"><Timer className="w-4 h-4" /> إرسال التقرير (تمديد نشط)</span>
            ) : (
              <span className="flex items-center justify-center gap-2"><Send className="w-4 h-4" /> إرسال التقرير اليومي</span>
            )}
          </button>
        </div>
      </div>

      {/* Map picker modal */}
      {mapPickerOpen && (
        <MapPickerModal
          type={mapPickerOpen}
          onClose={() => setMapPickerOpen(null)}
        onPickSingle={(loc: any) => { setPickedLocation(loc); setMapPickerOpen(null); toast.success('تم تحديد الموقع على الخريطة'); }}
        onPickMulti={(pts: any) => { setPickedWaypoints(pts); setMapPickerOpen(null); toast.success(`تم تثبيت ${pts.length} نقاط`); }}
          initialSingle={pickedLocation}
          initialMulti={pickedWaypoints}
        />
      )}

      {/* Extension bottom sheet */}
      {showExtension && (
        <div className="fixed inset-0 z-[600] bg-black/60 flex items-end justify-center animate-fade-in-up" onClick={() => setShowExtension(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-[#0B0F19] border-t-2 border-red-500/50 rounded-t-2xl p-5 shadow-2xl animate-slide-up">
            <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-5 h-5 text-red-400" />
              <div className="text-lg font-display font-black text-red-300">انتهى وقت إرسال التقرير</div>
            </div>
            <div className="text-sm text-slate-400 mb-4">الوقت المحدد لإرسال التقرير قد انتهى. يمكنك رفع طلب تمديد لمدير مكتبك للموافقة عليه.</div>
            <textarea
              value={extensionReason}
              onChange={e => setExtensionReason(e.target.value)}
              placeholder="سبب طلب التمديد (اختياري)..."
              className="w-full bg-[#1E293B] border border-[#263244] rounded-lg p-3 text-sm text-white placeholder-slate-500 mb-3 min-h-20"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowExtension(false)} className="flex-1 py-2.5 rounded-lg bg-[#1E293B] hover:bg-[#263244] text-slate-300 text-sm font-bold">إلغاء</button>
              <button onClick={submitExtension} className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-display font-black">رفع طلب التمديد ←</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRenderer({ field, value, onChange, pickedLocation, pickedWaypoints, onOpenMapPicker, onRemoveWaypoint }: any) {
  if (field.type === 'number') {
    return (
      <div>
        <label className="text-xs text-slate-300 mb-1.5 block font-semibold">{field.label}</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value ?? ''}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          className="w-full bg-[#1E293B] border border-[#263244] rounded-lg px-3 py-2.5 text-sm text-white focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
        />
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div>
        <label className="text-xs text-slate-300 mb-1.5 block font-semibold flex items-center justify-between">
          <span>{field.label}</span>
          {field.max && <span className="text-[10px] text-slate-500">{(value?.length || 0)}/{field.max}</span>}
        </label>
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value.slice(0, field.max || 10000))}
          maxLength={field.max}
          className="w-full bg-[#1E293B] border border-[#263244] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20 min-h-20 resize-none"
        />
        {field.helper && <div className="text-[10px] text-slate-500 mt-1">{field.helper}</div>}
      </div>
    );
  }
  if (field.type === 'text') {
    return (
      <div>
        <label className="text-xs text-slate-300 mb-1.5 block font-semibold">{field.label}</label>
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full bg-[#1E293B] border border-[#263244] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
        />
      </div>
    );
  }
  if (field.type === 'location') {
    return (
      <div>
        <label className="text-xs text-slate-300 mb-1.5 block font-semibold">{field.label}</label>
        {pickedLocation ? (
          <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span className="flex-1 text-emerald-200">{pickedLocation.lat.toFixed(5)}, {pickedLocation.lng.toFixed(5)}</span>
            <button onClick={onOpenMapPicker} className="text-emerald-400 hover:text-emerald-300">تعديل</button>
          </div>
        ) : (
          <button onClick={() => onOpenMapPicker('event')} className="w-full flex items-center justify-center gap-2 p-2.5 bg-[#1E293B] border border-dashed border-[#263244] rounded-lg text-slate-400 hover:border-amber-500/30 hover:text-amber-400 text-xs">
            <MapPinned className="w-4 h-4" /> اضغط لفتح الخريطة وتحديد الموقع
          </button>
        )}
      </div>
    );
  }
  if (field.type === 'multi-location') {
    return (
      <div>
        <label className="text-xs text-slate-300 mb-1.5 block font-semibold">{field.label}</label>
        <div className="space-y-1.5">
          {pickedWaypoints.map((wp: any, i: number) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-[#1E293B] border border-[#263244] rounded-lg text-xs">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</div>
              <span className="flex-1 text-slate-300">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</span>
              <button onClick={() => onRemoveWaypoint(i)} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => onOpenMapPicker('procession')} className="w-full flex items-center justify-center gap-2 p-2 bg-[#1E293B] border border-dashed border-[#263244] rounded-lg text-slate-400 hover:border-amber-500/30 hover:text-amber-400 text-xs">
            <MapPinned className="w-4 h-4" /> {pickedWaypoints.length > 0 ? 'إضافة نقطة أخرى' : 'فتح الخريطة وإضافة نقاط'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

function MapPickerModal({ type, onClose, onPickSingle, onPickMulti, initialSingle, initialMulti }: any) {
  const [single, setSingle] = useState<{ lat: number; lng: number } | null>(initialSingle);
  const [multi, setMulti] = useState<{ lat: number; lng: number }[]>(initialMulti || []);

  return (
    <div className="fixed inset-0 z-[700] bg-black/70 flex items-center justify-center p-3 animate-fade-in-up">
      <div className="w-full max-w-3xl bg-[#0B0F19] border border-amber-500/30 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="font-display font-black text-amber-400">{type === 'event' ? 'تثبيت موقع الفعالية' : 'تثبيت نقاط مسار المواكب'}</div>
            <div className="text-xs text-slate-400">{type === 'event' ? 'انقر على الخريطة لتحديد موقع واحد' : 'انقر لإضافة عدة نقاط على المسار'}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1E293B] hover:bg-[#263244] flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="h-96 relative cursor-crosshair" onClick={(e) => {
          const target = e.currentTarget.getBoundingClientRect();
          // Approximate from screen coords — use the Leaflet map instead in production
          // Here we simulate: just add points near click relative to map bounds
          const x = e.clientX - target.left;
          const y = e.clientY - target.top;
          // Convert to lat/lng (rough)
          const lat = 37 - (y / target.height) * 9;
          const lng = 38 + (x / target.width) * 12;
          if (type === 'event') {
            setSingle({ lat, lng });
          } else {
            setMulti([...multi, { lat, lng }]);
          }
        }}>
          <IraqMap
            height="100%"
            filterOfficeIds={[]}
          />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="text-amber-400 text-sm bg-[#0B0F19]/80 px-3 py-1.5 rounded-md">
              {type === 'event' ? 'انقر على الخريطة لتحديد الموقع' : `انقر لإضافة نقاط (${multi.length} نقطة)`}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-[#1E293B] flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {type === 'event' && single && `${single.lat.toFixed(5)}, ${single.lng.toFixed(5)}`}
            {type === 'procession' && `${multi.length} نقاط`}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#263244] text-slate-300 text-sm font-bold">إلغاء</button>
            {type === 'event' ? (
              <button onClick={() => single && onPickSingle(single)} disabled={!single} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-display font-black">تأكيد</button>
            ) : (
              <button onClick={() => onPickMulti(multi)} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-display font-black">تأكيد ({multi.length})</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
