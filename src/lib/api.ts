/**
 * Service layer — simulates Supabase client with full localStorage persistence
 * and broadcast events between tabs to mimic real-time subscriptions.
 *
 * In production, this layer is replaced by direct calls to:
 *   supabase.from('table').select() / .insert() / .update() / .delete()
 *   supabase.channel('x').on('postgres_changes', ...).subscribe()
 *
 * The API surface is intentionally identical so a future swap is trivial.
 */

import type {
  Profile, DailyReport, Emergency, ExtensionRequest,
  AgentLocation, VisitorFlowPath, TimeWindow,
} from '../data/types';
import {
  MOCK_USERS, MOCK_TODAY_REPORTS, MOCK_HISTORICAL_REPORTS,
  MOCK_EMERGENCIES, MOCK_EXTENSIONS, MOCK_AGENT_LOCATIONS,
  MOCK_FLOW_PATHS, MOCK_TIME_WINDOWS,
} from '../data/mockData';
import { INITIAL_BORDER_CROSSINGS, type BorderCrossing } from '../data/borderCrossings';

const STORAGE_KEY = 'ops:db:v1';
const SESSION_KEY = 'ops:session:v1';
const CHANNEL = 'ops:db:channel';

interface Credentials {
  [email: string]: { password: string; userId: string };
}

interface Database {
  users: Profile[];
  todayReports: DailyReport[];
  historicalReports: DailyReport[];
  emergencies: Emergency[];
  extensions: ExtensionRequest[];
  agentLocations: AgentLocation[];
  flowPaths: VisitorFlowPath[];
  borderCrossings: BorderCrossing[];
  timeWindows: TimeWindow[];
  credentials: Credentials;
  serverTimeOffset: number; // ms offset from client time
}

function buildInitialDb(): Database {
  const creds: Credentials = {};
  MOCK_USERS.forEach(u => {
    const email = `${u.role}.${u.id.split('-')[1] || 'user'}@ops.iq`;
    creds[email] = { password: '123456', userId: u.id };
    creds[u.id] = { password: '123456', userId: u.id };
  });
  return {
    users: MOCK_USERS,
    todayReports: MOCK_TODAY_REPORTS,
    historicalReports: MOCK_HISTORICAL_REPORTS,
    emergencies: MOCK_EMERGENCIES,
    extensions: MOCK_EXTENSIONS,
    agentLocations: MOCK_AGENT_LOCATIONS,
    flowPaths: MOCK_FLOW_PATHS,
    borderCrossings: INITIAL_BORDER_CROSSINGS,
    timeWindows: MOCK_TIME_WINDOWS,
    credentials: creds,
    serverTimeOffset: 0,
  };
}

function loadDb(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const init = buildInitialDb();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw);
  } catch {
    return buildInitialDb();
  }
}

function saveDb(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    // Broadcast change for other tabs / subscribers
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHANNEL);
      bc.postMessage({ type: 'db:changed', at: Date.now() });
      bc.close();
    }
  } catch (e) {
    console.error('Failed to persist DB', e);
  }
}

// Singleton db accessor
let _db: Database | null = null;
function db(): Database {
  if (!_db) _db = loadDb();
  return _db;
}

function commit() {
  if (_db) saveDb(_db);
}

// ─── Subscriptions (mimic Supabase realtime) ─────────────────────────
type Listener = (event: { type: string; table: string; payload: any }) => void;
const listeners = new Set<Listener>();

if (typeof BroadcastChannel !== 'undefined') {
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (msg) => {
    if (msg.data?.type === 'db:changed') {
      // Reload DB then notify
      _db = loadDb();
      listeners.forEach(l => l({ type: 'db:changed', table: '*', payload: null }));
    }
  };
}

export const api = {
  // ─── Auth ───────────────────────────────────────────────────────
  async signIn(email: string, password: string): Promise<{ user: Profile | null; error: string | null }> {
    await delay(400);
    const d = db();
    const cred = d.credentials[email.toLowerCase().trim()] || d.credentials[email.trim()];
    if (!cred) return { user: null, error: 'البريد الإلكتروني غير مسجل في النظام' };
    if (cred.password !== password) return { user: null, error: 'كلمة المرور غير صحيحة' };
    const user = d.users.find(u => u.id === cred.userId);
    if (!user) return { user: null, error: 'حساب المستخدم غير موجود' };
    if (!user.isActive) return { user: null, error: 'هذا الحساب معطّل. تواصل مع المدير' };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, ts: Date.now() }));
    return { user, error: null };
  },

  async signUp(input: { fullNameAr: string; email: string; password: string; role: Profile['role']; officeId: string }): Promise<{ user: Profile | null; error: string | null }> {
    await delay(500);
    const d = db();
    if (d.credentials[input.email.toLowerCase()]) return { user: null, error: 'هذا البريد مسجل مسبقاً' };
    const newUser: Profile = {
      id: `u-${Date.now()}`,
      fullNameAr: input.fullNameAr.trim(),
      role: input.role,
      officeId: input.officeId,
      permittedOfficeIds: input.role === 'director' ? d.users.filter(u => u.role !== 'director').map(u => u.officeId).filter((v, i, a) => a.indexOf(v) === i) : [input.officeId],
      specialPermissions: {
        canExport: input.role === 'director',
        canAddCrossings: input.role === 'director',
        canViewAllOffices: input.role === 'director',
        canOpenWindow: input.role === 'director' || input.role === 'supervisor',
        canEditReports: input.role === 'director',
      },
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    d.users.push(newUser);
    d.credentials[input.email.toLowerCase()] = { password: input.password, userId: newUser.id };
    commit();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: newUser.id, ts: Date.now() }));
    return { user: newUser, error: null };
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
  },

  async getSession(): Promise<Profile | null> {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const { userId } = JSON.parse(raw);
      return db().users.find(u => u.id === userId) || null;
    } catch { return null; }
  },

  // ─── Server time ────────────────────────────────────────────────
  async getServerTime(): Promise<Date> {
    await delay(50);
    return new Date(Date.now() + db().serverTimeOffset);
  },

  // ─── Daily reports ──────────────────────────────────────────────
  async getTodayReports(): Promise<DailyReport[]> { await delay(100); return [...db().todayReports]; },
  async getHistoricalReports(): Promise<DailyReport[]> { await delay(100); return [...db().historicalReports]; },
  async insertReport(report: DailyReport): Promise<DailyReport> {
    await delay(300);
    const d = db();
    d.todayReports = d.todayReports.filter(r => r.officeId !== report.officeId);
    d.todayReports.push(report);
    commit();
    notify({ type: 'INSERT', table: 'daily_reports', payload: { new: report } });
    return report;
  },

  // ─── Emergencies ────────────────────────────────────────────────
  async getEmergencies(): Promise<Emergency[]> { await delay(80); return [...db().emergencies]; },
  async insertEmergency(em: Emergency): Promise<Emergency> {
    await delay(200);
    db().emergencies.unshift(em);
    commit();
    notify({ type: 'INSERT', table: 'emergencies', payload: { new: em } });
    return em;
  },
  async updateEmergency(id: string, patch: Partial<Emergency>): Promise<void> {
    await delay(150);
    const d = db();
    d.emergencies = d.emergencies.map(e => e.id === id ? { ...e, ...patch } : e);
    commit();
    notify({ type: 'UPDATE', table: 'emergencies', payload: { new: d.emergencies.find(e => e.id === id) } });
  },

  // ─── Extension requests ─────────────────────────────────────────
  async getExtensions(): Promise<ExtensionRequest[]> { await delay(80); return [...db().extensions]; },
  async insertExtension(ex: ExtensionRequest): Promise<ExtensionRequest> {
    await delay(200);
    db().extensions.unshift(ex);
    commit();
    notify({ type: 'INSERT', table: 'extension_requests', payload: { new: ex } });
    return ex;
  },
  async updateExtension(id: string, patch: Partial<ExtensionRequest>): Promise<void> {
    await delay(150);
    const d = db();
    d.extensions = d.extensions.map(e => e.id === id ? { ...e, ...patch } : e);
    commit();
    notify({ type: 'UPDATE', table: 'extension_requests', payload: { new: d.extensions.find(e => e.id === id) } });
  },

  // ─── Time window ────────────────────────────────────────────────
  async getTimeWindow(): Promise<TimeWindow> {
    await delay(50);
    return { ...db().timeWindows[0] };
  },
  async updateTimeWindow(patch: Partial<TimeWindow>): Promise<TimeWindow> {
    await delay(150);
    const d = db();
    d.timeWindows[0] = { ...d.timeWindows[0], ...patch };
    commit();
    notify({ type: 'UPDATE', table: 'time_windows', payload: { new: d.timeWindows[0] } });
    return d.timeWindows[0];
  },

  // ─── Agent locations ────────────────────────────────────────────
  async getAgentLocations(): Promise<AgentLocation[]> { await delay(80); return [...db().agentLocations]; },
  async upsertAgentLocation(loc: AgentLocation): Promise<void> {
    const d = db();
    const exists = d.agentLocations.find(a => a.agentId === loc.agentId);
    if (exists) {
      d.agentLocations = d.agentLocations.map(a => a.agentId === loc.agentId ? loc : a);
    } else {
      d.agentLocations.push(loc);
    }
    commit();
    notify({ type: 'UPDATE', table: 'agent_locations', payload: { new: loc } });
  },

  // ─── Flow paths ─────────────────────────────────────────────────
  async getFlowPaths(): Promise<VisitorFlowPath[]> { return [...db().flowPaths]; },

  // ─── Border crossings ───────────────────────────────────────────
  async getBorderCrossings(): Promise<BorderCrossing[]> { return [...db().borderCrossings]; },
  async insertBorderCrossing(bc: BorderCrossing): Promise<BorderCrossing> {
    await delay(200);
    db().borderCrossings.push(bc);
    commit();
    notify({ type: 'INSERT', table: 'border_crossings', payload: { new: bc } });
    return bc;
  },

  // ─── Users (admin) ──────────────────────────────────────────────
  async getUsers(): Promise<Profile[]> { return [...db().users]; },
  async updateUser(id: string, patch: Partial<Profile>): Promise<Profile | null> {
    await delay(150);
    const d = db();
    let updated: Profile | null = null;
    d.users = d.users.map(u => {
      if (u.id === id) { updated = { ...u, ...patch }; return updated; }
      return u;
    });
    commit();
    if (updated) notify({ type: 'UPDATE', table: 'profiles', payload: { new: updated } });
    return updated;
  },

  // ─── Seed (for director "load demo data" button) ────────────────
  async seedDemoData(): Promise<{ added: number }> {
    await delay(800);
    const d = db();
    const rng = seededRandom(Date.now() % 99999);
    let added = 0;
    // Add 30 more days of historical data
    for (let dOff = 30; dOff > 14; dOff--) {
      for (const office of d.users.filter(u => u.role !== 'director').map(u => u.officeId).filter((v, i, a) => a.indexOf(v) === i)) {
        if (rng() < 0.15) continue;
        const dt = new Date(); dt.setDate(dt.getDate() - dOff);
        const dateStr = dt.toISOString().slice(0, 10);
        if (d.historicalReports.find(r => r.officeId === office && r.reportDate === dateStr)) continue;
        d.historicalReports.push({
          id: `seed-${office}-${dOff}`,
          officeId: office,
          submittedBy: 'u-agent',
          reportDate: dateStr,
          submittedAt: new Date(dt.getTime() + 8.5 * 3600 * 1000).toISOString(),
          isLateSubmission: rng() < 0.2,
          deploymentCount: Math.floor(rng() * 1000),
          deploymentLocations: 'مواقع ميدانية',
          deploymentFormations: 'تشكيلات دعم',
          coordinationSectors: 'تنسيق قطاعات',
          coordinationJointOps: 'عمليات مشتركة',
          incidentsCount: Math.floor(rng() * 8),
          incidentsDetails: 'تفاصيل الحوادث',
          violationsCount: Math.floor(rng() * 5),
          violationsArea: 'منطقة',
          violationsTimeDetail: '14:30',
          violationsDetails: 'تفاصيل',
          deathsCount: Math.floor(rng() * 2),
          deathsLocationMgrs: '38SMB1234567890',
          deathsActionTaken: 'إجراء طبي',
          resourcesDistributed: Math.floor(rng() * 5000),
          resourcesDetails: 'موارد متنوعة',
          eventsCount: Math.floor(rng() * 30),
          eventsDetails: 'فعاليات',
          eventsCoordinates: [],
          visitsCount: Math.floor(rng() * 15),
          visitsSummary: 'زيارات',
          visitorsIn: Math.floor(rng() * 250000),
          visitorsOut: Math.floor(rng() * 200000),
          visitorsRoutes: 'محاور',
          vehiclesCount: Math.floor(rng() * 8000),
          vehiclesDetails: 'عجلات',
          processionsCount: Math.floor(rng() * 200),
          processionsDetails: 'مواكب',
          processionWaypoints: [],
          otherNotes: 'ملاحظات',
        });
        added++;
      }
    }
    commit();
    return { added };
  },

  // ─── Subscriptions ──────────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  // ─── Reset (for testing) ────────────────────────────────────────
  async resetDb() {
    _db = buildInitialDb();
    commit();
  },
};

function notify(event: { type: string; table: string; payload: any }) {
  listeners.forEach(l => l(event));
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
