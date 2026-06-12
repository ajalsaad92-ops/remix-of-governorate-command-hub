import { Users, Truck, Flag, AlertOctagon, Package, Skull, Calendar, Shield, Eye } from 'lucide-react';

export type KpiId =
  | 'visitors' | 'vehicles' | 'processions' | 'emergencies'
  | 'deaths' | 'violations' | 'events' | 'incidents'
  | 'resources' | 'deployment';

export interface KpiDef {
  id: KpiId;
  label: string;
  icon: any;
  tone: 'amber' | 'blue' | 'emerald' | 'red' | 'orange' | 'purple' | 'slate';
  /** key on the aggregates object (or 'emergencies' = activeEmergencies) */
  source: string;
}

export const KPI_CATALOG: KpiDef[] = [
  { id: 'visitors',    label: 'إجمالي الزوار',    icon: Users,        tone: 'amber',   source: 'visitors' },
  { id: 'vehicles',    label: 'حركة العجلات',     icon: Truck,        tone: 'blue',    source: 'vehicles' },
  { id: 'processions', label: 'المواكب',          icon: Flag,         tone: 'emerald', source: 'processions' },
  { id: 'emergencies', label: 'التنبيهات الطارئة', icon: AlertOctagon, tone: 'red',     source: 'emergencies' },
  { id: 'deaths',      label: 'الوفيات',          icon: Skull,        tone: 'red',     source: 'deaths' },
  { id: 'violations',  label: 'الخروقات الأمنية', icon: Shield,       tone: 'orange',  source: 'violations' },
  { id: 'events',      label: 'الفعاليات',        icon: Calendar,     tone: 'purple',  source: 'events' },
  { id: 'incidents',   label: 'الحوادث',          icon: AlertOctagon, tone: 'orange',  source: 'incidents' },
  { id: 'resources',   label: 'الخدمات الموزعة',  icon: Package,      tone: 'emerald', source: 'resources' },
  { id: 'deployment',  label: 'القوات المنتشرة',  icon: Eye,          tone: 'slate',   source: 'deployment' },
];

export const kpiById = (id: string) => KPI_CATALOG.find(k => k.id === id);