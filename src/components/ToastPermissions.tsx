import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MapPin, Bell, Camera, X } from 'lucide-react';
import { useOps } from '../store/opsStore';

interface PermissionToastProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  storageKey: string;
  onAccept?: () => void;
  onLater?: () => void;
}

function showPermissionToast({ icon, title, description, storageKey, onAccept, onLater }: PermissionToastProps) {
  if (localStorage.getItem(storageKey)) return;
  const id = `perm-${storageKey}-${Date.now()}`;

  toast(
    <div className="flex items-start gap-3 p-1">
      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm mb-1 text-slate-100">{title}</div>
        <div className="text-xs text-slate-400 mb-2">{description}</div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              localStorage.setItem(storageKey, 'allowed');
              onAccept?.();
              toast.dismiss(id);
            }}
            className="px-3 py-1 rounded-md bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            السماح
          </button>
          <button
            onClick={() => {
              localStorage.setItem(storageKey, 'dismissed');
              onLater?.();
              toast.dismiss(id);
            }}
            className="px-3 py-1 rounded-md bg-[#1E293B] text-slate-300 text-xs hover:bg-[#263244] transition-colors"
          >
            لاحقاً
          </button>
        </div>
      </div>
      <button onClick={() => { localStorage.setItem(storageKey, 'dismissed'); toast.dismiss(id); }} className="text-slate-500 hover:text-slate-300">
        <X className="w-4 h-4" />
      </button>
    </div>,
    {
      id,
      duration: 15_000,
      position: 'bottom-left',
    }
  );
}

export function ToastPermissions() {
  const [fired, setFired] = useState(false);
  const { state } = useOps();

  // Browser notifications for new emergencies targeting director/supervisor
  useEffect(() => {
    if (!state.currentUser) return;
    const user = state.currentUser;
    if (user.role !== 'director' && user.role !== 'supervisor') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const newEmergencies = state.emergencies.filter(e => {
      const ageMs = Date.now() - new Date(e.createdAt).getTime();
      return ageMs < 5000 && e.status === 'active'; // < 5s old
    });
    newEmergencies.forEach(e => {
      try {
        new Notification('🚨 حالة طارئة جديدة', {
          body: `${e.emergencyType} — ${e.reportedByName}`,
          icon: '/favicon.ico',
          tag: e.id,
        });
      } catch {}
    });
  }, [state.emergencies.length, state.currentUser]);

  useEffect(() => {
    if (fired) return;
    if (!state.currentUser) return; // wait until logged in
    setFired(true);
    const t1 = setTimeout(() => {
      showPermissionToast({
        icon: <MapPin className="w-5 h-5" />,
        title: 'السماح بالوصول للموقع',
        description: 'للحصول على تجربة أفضل، الرجاء السماح بالوصول إلى موقعك الجغرافي',
        storageKey: 'perm-gps',
        onAccept: () => {
          navigator.geolocation?.getCurrentPosition(() => {}, () => {});
        }
      });
    }, 4000);
    const t2 = setTimeout(() => {
      showPermissionToast({
        icon: <Bell className="w-5 h-5" />,
        title: 'تفعيل الإشعارات',
        description: 'تلقي تنبيهات التقارير والحالات الطارئة فور حدوثها',
        storageKey: 'perm-notif',
        onAccept: () => { Notification?.requestPermission?.(); }
      });
    }, 12_000);
    const t3 = setTimeout(() => {
      showPermissionToast({
        icon: <Camera className="w-5 h-5" />,
        title: 'السماح بالكاميرا',
        description: 'لإرفاق صور توثيقية في نموذج الطوارئ',
        storageKey: 'perm-camera',
        onAccept: () => {
          navigator.mediaDevices?.getUserMedia?.({ video: true }).catch(() => {});
        }
      });
    }, 22_000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [fired, state.currentUser]);

  return null;
}
