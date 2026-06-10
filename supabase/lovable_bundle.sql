-- ============================================================
-- GOVERNORATE COMMAND HUB — Lovable SQL Editor bundle
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / OR REPLACE.
-- Paste entire block into Supabase SQL Editor → Run.
-- ============================================================

-- 0. Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS (create only if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('director', 'supervisor', 'manager', 'agent');
  END IF;
END $$;

-- 2. HELPER FUNCTIONS (recreate safely)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_director_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('director', 'supervisor')
  );
$$;

-- 3. TABLES
-- offices
CREATE TABLE IF NOT EXISTS public.offices (
  id            TEXT PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name_ar       TEXT NOT NULL,
  governorate_ar TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- profiles (id matches auth.users.id 1:1)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name_ar        TEXT NOT NULL,
  office_id           TEXT REFERENCES public.offices(id) ON DELETE SET NULL,
  permitted_office_ids TEXT[] NOT NULL DEFAULT '{}',
  special_permissions JSONB   NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_roles (app_role enum lives in public)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- daily_reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id                TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  submitted_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date              DATE NOT NULL,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_late_submission       BOOLEAN NOT NULL DEFAULT FALSE,
  deployment_count         INTEGER NOT NULL DEFAULT 0,
  deployment_locations     TEXT,
  deployment_formations    TEXT,
  coordination_sectors     TEXT,
  coordination_joint_ops   TEXT,
  incidents_count          INTEGER NOT NULL DEFAULT 0,
  incidents_details        TEXT,
  violations_count         INTEGER NOT NULL DEFAULT 0,
  violations_area          TEXT,
  violations_time_detail   TEXT,
  violations_details       TEXT,
  deaths_count             INTEGER NOT NULL DEFAULT 0,
  deaths_location_mgrs     TEXT,
  deaths_action_taken      TEXT,
  resources_distributed    INTEGER NOT NULL DEFAULT 0,
  resources_details        TEXT,
  events_count             INTEGER NOT NULL DEFAULT 0,
  events_details           TEXT,
  events_coordinates       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  visits_count             INTEGER NOT NULL DEFAULT 0,
  visits_summary           TEXT,
  visitors_in              INTEGER NOT NULL DEFAULT 0,
  visitors_out             INTEGER NOT NULL DEFAULT 0,
  visitors_routes          TEXT,
  vehicles_count           INTEGER NOT NULL DEFAULT 0,
  vehicles_details         TEXT,
  processions_count        INTEGER NOT NULL DEFAULT 0,
  processions_details      TEXT,
  procession_waypoints     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  other_notes              TEXT,
  reporter_lat             DOUBLE PRECISION,
  reporter_lng             DOUBLE PRECISION,
  mgrs_reference           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One report per office per day (upsert target for the app)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_reports_office_date
  ON public.daily_reports (office_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date
  ON public.daily_reports (report_date DESC);

-- emergencies  (denormalized names so the app can read without joins)
CREATE TABLE IF NOT EXISTS public.emergencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_by_name    TEXT NOT NULL DEFAULT '',
  office_id           TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  emergency_type      TEXT NOT NULL,
  description         TEXT NOT NULL,
  location_mgrs       TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_by_name TEXT,
  acknowledged_at     TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON public.emergencies (status);
CREATE INDEX IF NOT EXISTS idx_emergencies_office ON public.emergencies (office_id);

-- extension_requests
CREATE TABLE IF NOT EXISTS public.extension_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_name        TEXT NOT NULL DEFAULT '',
  office_id                TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  request_time             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason                   TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'forwarded_to_supervisor', 'approved', 'rejected')),
  manager_reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_reviewed_by_name TEXT,
  manager_reviewed_at      TIMESTAMPTZ,
  supervisor_approved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supervisor_approved_by_name TEXT,
  supervisor_approved_at   TIMESTAMPTZ,
  extension_window_end     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extension_status ON public.extension_requests (status);

-- agent_locations  (1 row per agent)
CREATE TABLE IF NOT EXISTS public.agent_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name       TEXT NOT NULL DEFAULT '',
  office_id        TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  accuracy_meters  DOUBLE PRECISION,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- visitor_flow_paths
CREATE TABLE IF NOT EXISTS public.visitor_flow_paths (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id     TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  from_lat      DOUBLE PRECISION NOT NULL,
  from_lng      DOUBLE PRECISION NOT NULL,
  to_lat        DOUBLE PRECISION NOT NULL,
  to_lng        DOUBLE PRECISION NOT NULL,
  visitor_count INTEGER NOT NULL DEFAULT 0,
  density       TEXT NOT NULL DEFAULT 'normal'
    CHECK (density IN ('high', 'medium', 'normal')),
  path_name_ar  TEXT,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_id     UUID REFERENCES public.daily_reports(id) ON DELETE SET NULL
);

-- border_crossings
CREATE TABLE IF NOT EXISTS public.border_crossings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar                TEXT NOT NULL,
  lat                    DOUBLE PRECISION NOT NULL,
  lng                    DOUBLE PRECISION NOT NULL,
  neighboring_country_ar TEXT,
  nearest_office_id      TEXT REFERENCES public.offices(id) ON DELETE SET NULL,
  daily_in               INTEGER NOT NULL DEFAULT 0,
  daily_out              INTEGER NOT NULL DEFAULT 0,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- time_windows  (singleton row with id = '00000000-0000-0000-0000-000000000001')
CREATE TABLE IF NOT EXISTS public.time_windows (
  id                  UUID PRIMARY KEY,
  window_date         DATE NOT NULL,
  open_time           TEXT NOT NULL DEFAULT '08:00',
  close_time          TEXT NOT NULL DEFAULT '09:00',
  is_manually_open    BOOLEAN NOT NULL DEFAULT FALSE,
  is_manually_closed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TRIGGERS (drop+create so re-runs don't duplicate)
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_time_windows_updated_at ON public.time_windows;
CREATE TRIGGER trg_time_windows_updated_at
  BEFORE UPDATE ON public.time_windows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. ROW LEVEL SECURITY
ALTER TABLE public.offices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergencies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_flow_paths  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.border_crossings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_windows        ENABLE ROW LEVEL SECURITY;

-- Drop policies first so re-run is safe
DO $$
DECLARE p TEXT;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p,
      (SELECT tablename FROM pg_policies WHERE policyname = p AND schemaname = 'public' LIMIT 1));
  END LOOP;
END $$;

-- Helper: anyone authenticated can read reference data
CREATE POLICY "offices read"        ON public.offices            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "border_crossings read" ON public.border_crossings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "time_windows read"   ON public.time_windows       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "user_roles read own" ON public.user_roles         FOR SELECT USING (auth.uid() = user_id);

-- profiles: everyone authenticated can read the directory; users can update their own row
CREATE POLICY "profiles read"   ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles manage by director"
  ON public.profiles FOR ALL
  USING (public.is_director_or_supervisor(auth.uid()))
  WITH CHECK (public.is_director_or_supervisor(auth.uid()));

-- user_roles: only directors can modify role assignments
CREATE POLICY "user_roles manage by director"
  ON public.user_roles FOR ALL
  USING (public.is_director_or_supervisor(auth.uid()))
  WITH CHECK (public.is_director_or_supervisor(auth.uid()));

-- daily_reports: anyone authenticated can read; agents insert; director/supervisor update
CREATE POLICY "daily_reports read"   ON public.daily_reports FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "daily_reports insert" ON public.daily_reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "daily_reports update" ON public.daily_reports FOR UPDATE
  USING (submitted_by = auth.uid() OR public.is_director_or_supervisor(auth.uid()));

-- emergencies
CREATE POLICY "emergencies read"   ON public.emergencies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "emergencies insert" ON public.emergencies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "emergencies update" ON public.emergencies FOR UPDATE
  USING (public.is_director_or_supervisor(auth.uid()) OR reported_by = auth.uid());

-- extension_requests
CREATE POLICY "extension_requests read"   ON public.extension_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "extension_requests insert" ON public.extension_requests FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "extension_requests update" ON public.extension_requests FOR UPDATE
  USING (public.is_director_or_supervisor(auth.uid()) OR requested_by = auth.uid());

-- agent_locations
CREATE POLICY "agent_locations read"   ON public.agent_locations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "agent_locations upsert" ON public.agent_locations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "agent_locations update" ON public.agent_locations FOR UPDATE
  USING (agent_id = auth.uid() OR public.is_director_or_supervisor(auth.uid()));

-- visitor_flow_paths
CREATE POLICY "flow_paths read"   ON public.visitor_flow_paths FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "flow_paths insert" ON public.visitor_flow_paths FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "flow_paths update" ON public.visitor_flow_paths FOR UPDATE
  USING (public.is_director_or_supervisor(auth.uid()));

-- time_windows: only director/supervisor can mutate
CREATE POLICY "time_windows update"
  ON public.time_windows FOR UPDATE
  USING (public.is_director_or_supervisor(auth.uid()));
CREATE POLICY "time_windows insert"
  ON public.time_windows FOR INSERT
  WITH CHECK (public.is_director_or_supervisor(auth.uid()));

-- border_crossings: only director can mutate
CREATE POLICY "border_crossings insert"
  ON public.border_crossings FOR INSERT
  WITH CHECK (public.is_director_or_supervisor(auth.uid()));
CREATE POLICY "border_crossings update"
  ON public.border_crossings FOR UPDATE
  USING (public.is_director_or_supervisor(auth.uid()));

-- 6. SEED — offices (idempotent)
INSERT INTO public.offices (id, code, name_ar, governorate_ar, lat, lng) VALUES
  ('HQ',  'HQ',  'مقر المديرية',         'بغداد',         33.3152, 44.3661),
  ('BGD', 'BGD', 'مكتب بغداد',           'بغداد',         33.3406, 44.4009),
  ('KRB', 'KRB', 'مكتب كربلاء المقدسة',  'كربلاء المقدسة', 32.6161, 44.0248),
  ('NJF', 'NJF', 'مكتب النجف الأشرف',    'النجف الأشرف',   32.0017, 44.3369),
  ('BBL', 'BBL', 'مكتب بابل',           'بابل',           32.4785, 44.4284),
  ('QDS', 'QDS', 'مكتب الديوانية',      'الديوانية',      31.9919, 44.9200),
  ('MTH', 'MTH', 'مكتب المثنى',         'المثنى',         31.3299, 45.2839),
  ('DHQ', 'DHQ', 'مكتب ذي قار',         'ذي قار',         31.0626, 46.2754),
  ('MYS', 'MYS', 'مكتب ميسان',          'ميسان',          31.8432, 47.1433),
  ('BAS', 'BAS', 'مكتب البصرة',         'البصرة',         30.5085, 47.7804),
  ('WST', 'WST', 'مكتب واسط',           'واسط',           32.5405, 45.8201),
  ('SLD', 'SLD', 'مكتب صلاح الدين',     'صلاح الدين',     34.5593, 43.6750),
  ('ANB', 'ANB', 'مكتب الأنبار',        'الأنبار',        33.4420, 43.3025),
  ('DLY', 'DLY', 'مكتب ديالى',          'ديالى',          33.7697, 44.6509),
  ('KRK', 'KRK', 'مكتب كركوك',          'كركوك',          35.4681, 44.3922)
ON CONFLICT (id) DO NOTHING;

-- 7. SEED — auth.users + profiles + user_roles
-- All demo passwords: 123456
-- We hard-code deterministic UUIDs so the app can refer to them by id.
DO $$
DECLARE
  pwd TEXT := crypt('123456', gen_salt('bf'));
  uid_director   UUID := '11111111-1111-1111-1111-111111111111';
  uid_supervisor UUID := '22222222-2222-2222-2222-222222222222';
  uid_manager    UUID := '33333333-3333-3333-3333-333333333331';
  uid_manager2   UUID := '33333333-3333-3333-3333-333333333332';
  uid_agent      UUID := '44444444-4444-4444-4444-444444444441';
  uid_agent2     UUID := '44444444-4444-4444-4444-444444444442';
  uid_agent3     UUID := '44444444-4444-4444-4444-444444444443';
  rec RECORD;
BEGIN
  -- helper: insert one user (auth.users + profile + role) if missing
  FOREACH rec IN ARRAY ARRAY[
    ROW(uid_director,   'u-director@ops.iq',    'أبو علي المهداوي',     'HQ',  ARRAY['KRB','NJF','BBL','BGD','HQ','QDS','MTH','DHQ','MYS','BAS','WST','SLD','ANB','DLY','KRK'], 'director'::public.app_role, TRUE),
    ROW(uid_supervisor, 'u-supervisor@ops.iq',  'الحاج كاظم العبيدي',   'HQ',  ARRAY['KRB','NJF','BBL','BGD','HQ'], 'supervisor'::public.app_role, TRUE),
    ROW(uid_manager,    'u-manager@ops.iq',     'أحمد محمد الجبوري',    'KRB', ARRAY['KRB'], 'manager'::public.app_role, TRUE),
    ROW(uid_manager2,   'u-manager2@ops.iq',    'سعد عبدالله الفتلاوي', 'NJF', ARRAY['NJF'], 'manager'::public.app_role, TRUE),
    ROW(uid_agent,      'u-agent@ops.iq',       'محمد علي الحسناوي',    'KRB', ARRAY['KRB'], 'agent'::public.app_role, TRUE),
    ROW(uid_agent2,     'u-agent2@ops.iq',      'علي حسين العامري',     'NJF', ARRAY['NJF'], 'agent'::public.app_role, TRUE),
    ROW(uid_agent3,     'u-agent3@ops.iq',      'حسن كاظم البياتي',     'KRB', ARRAY['KRB'], 'agent'::public.app_role, TRUE)
  ]
  LOOP
    -- auth.users
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
      rec.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      rec.email, pwd, NOW(), jsonb_build_object('full_name_ar', rec.full_name_ar),
      NOW(), NOW(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

    -- profile
    INSERT INTO public.profiles (id, full_name_ar, office_id, permitted_office_ids, special_permissions, is_active)
    VALUES (
      rec.id, rec.full_name_ar, rec.office_id, rec.permitted_office_ids,
      jsonb_build_object(
        'canExport', rec.role IN ('director','supervisor'),
        'canAddCrossings', rec.role = 'director',
        'canViewAllOffices', rec.role = 'director',
        'canOpenWindow', rec.role IN ('director','supervisor'),
        'canEditReports', rec.role = 'director'
      ),
      rec.is_active
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name_ar = EXCLUDED.full_name_ar,
      office_id    = EXCLUDED.office_id,
      permitted_office_ids = EXCLUDED.permitted_office_ids,
      special_permissions = EXCLUDED.special_permissions,
      is_active    = EXCLUDED.is_active;

    -- user_roles
    INSERT INTO public.user_roles (user_id, role) VALUES (rec.id, rec.role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

-- 8. SEED — time_windows singleton
INSERT INTO public.time_windows (id, window_date, open_time, close_time, is_manually_open, is_manually_closed)
VALUES ('00000000-0000-0000-0000-000000000001', CURRENT_DATE, '08:00', '09:00', FALSE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  window_date = EXCLUDED.window_date,
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time,
  is_manually_open = EXCLUDED.is_manually_open,
  is_manually_closed = EXCLUDED.is_manually_closed;

-- 9. SEED — border crossings
INSERT INTO public.border_crossings (id, name_ar, lat, lng, neighboring_country_ar, nearest_office_id, daily_in, daily_out) VALUES
  (gen_random_uuid(), 'منفذ شلمجة',         30.4356, 48.1203, 'إيران',  'BAS', 42500, 38200),
  (gen_random_uuid(), 'منفذ صفوان',         30.0558, 47.7105, 'الكويت', 'BAS', 12800,  9600),
  (gen_random_uuid(), 'منفذ طريبيل',        33.3889, 40.5153, 'الأردن', 'ANB',  8400,  6200),
  (gen_random_uuid(), 'منفذ المنذرية',      33.9167, 44.8667, 'إيران',  'DLY',  3200,  2800),
  (gen_random_uuid(), 'منفذ زرباطية',       32.7667, 46.0667, 'إيران',  'WST', 15600, 14200),
  (gen_random_uuid(), 'منفذ الشيب',         29.9667, 48.0167, 'الكويت', 'BAS',  4800,  3900),
  (gen_random_uuid(), 'منفذ القائم',        34.3731, 40.9803, 'سوريا',  'ANB',  2200,  1800),
  (gen_random_uuid(), 'منفذ ربيعة',         36.7792, 42.0586, 'سوريا',  'SLD',  1400,  1100),
  (gen_random_uuid(), 'منفذ إبراهيم الخليل',37.1056, 42.3525, 'تركيا',  'SLD',   800,   650),
  (gen_random_uuid(), 'منفذ جيلان',         34.1667, 46.0833, 'إيران',  'DLY',  2100,  1900),
  (gen_random_uuid(), 'منفذ الحسينية',      34.2667, 46.1833, 'إيران',  'DLY',  1800,  1600)
ON CONFLICT DO NOTHING;

-- 10. SEED — visitor flow paths (only if table empty)
INSERT INTO public.visitor_flow_paths (office_id, from_lat, from_lng, to_lat, to_lng, visitor_count, density, path_name_ar)
SELECT * FROM (VALUES
  ('KRB', 33.3152, 44.3661, 32.6161, 44.0248, 145000, 'high',   'بغداد ← كربلاء'),
  ('NJF', 33.3152, 44.3661, 32.0017, 44.3369, 128000, 'high',   'بغداد ← النجف'),
  ('BBL', 32.0017, 44.3369, 32.6161, 44.0248,  96000, 'high',   'النجف ← كربلاء'),
  ('BAS', 30.5085, 47.7804, 31.8432, 47.1433,  45000, 'medium', 'البصرة ← ميسان'),
  ('MYS', 31.8432, 47.1433, 32.0017, 44.3369,  38000, 'medium', 'ميسان ← النجف'),
  ('WST', 32.5405, 45.8201, 32.0017, 44.3369,  28000, 'normal', 'واسط ← النجف'),
  ('DHQ', 31.0626, 46.2754, 31.3299, 45.2839,  22000, 'normal', 'ذي قار ← المثنى'),
  ('BGD', 33.3406, 44.4009, 32.4785, 44.4284,  62000, 'high',   'بغداد ← بابل'),
  ('QDS', 31.9919, 44.9200, 32.0017, 44.3369,  34000, 'medium', 'الديوانية ← النجف'),
  ('MTH', 31.3299, 45.2839, 32.0017, 44.3369,  41000, 'medium', 'المثنى ← النجف')
) AS v(office_id, from_lat, from_lng, to_lat, to_lng, visitor_count, density, path_name_ar)
WHERE NOT EXISTS (SELECT 1 FROM public.visitor_flow_paths LIMIT 1);

-- 11. SEED — a few emergencies (so the dashboard isn't empty)
INSERT INTO public.emergencies (reported_by, reported_by_name, office_id, emergency_type, description, location_mgrs, lat, lng, status, acknowledged_by, acknowledged_at, resolved_at, created_at)
SELECT * FROM (VALUES
  ('44444444-4444-4444-4444-444444444441'::uuid, 'محمد علي الحسناوي', 'KRB', 'حاجة لدعم طبي عاجل',     'حالة طبية طارئة عند مدخل كربلاء تتطلب إرسال فريق طبي إضافي وسيارة إسعاف فوراً', '38SMB1234567890', 32.6200, 44.0300, 'active',      NULL::uuid, NULL::timestamptz, NULL::timestamptz, NOW() - INTERVAL '8 minutes'),
  ('44444444-4444-4444-4444-444444444442'::uuid, 'علي حسين العامري',  'NJF', 'نقص إمداد غذائي',         'نقص حاد في المياه والوجبات في أحد المواكب الكبيرة بسبب ارتفاع عدد الزائرين',     '38SMB9876543210', 32.0050, 44.3400, 'active',      NULL::uuid, NULL::timestamptz, NULL::timestamptz, NOW() - INTERVAL '15 minutes'),
  ('44444444-4444-4444-4444-444444444441'::uuid, 'محمد علي الحسناوي', 'BBL', 'حادث أمني',               'محاولة سرقة في أحد المخيمات تم التعامل معها من قبل القوات',                       NULL,                32.4800, 44.4300, 'acknowledged','11111111-1111-1111-1111-111111111111'::uuid, NOW() - INTERVAL '20 minutes', NULL::timestamptz, NOW() - INTERVAL '35 minutes'),
  ('44444444-4444-4444-4444-444444444442'::uuid, 'علي حسين العامري',  'WST', 'حاجة عجلات مياه إضافية',  'نفاد المياه في المنطقة الجنوبية يتطلب إرسال 5 عجلات مياه خلال ساعة',            NULL,                32.5400, 45.8200, 'resolved',    '22222222-2222-2222-2222-222222222222'::uuid, NOW() - INTERVAL '60 minutes', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '75 minutes')
) AS v(reported_by, reported_by_name, office_id, emergency_type, description, location_mgrs, lat, lng, status, acknowledged_by, acknowledged_at, resolved_at, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.emergencies LIMIT 1);

-- 12. SEED — a couple of extension requests
INSERT INTO public.extension_requests (requested_by, requested_by_name, office_id, reason, status, request_time, manager_reviewed_by, manager_reviewed_by_name, manager_reviewed_at)
SELECT * FROM (VALUES
  ('44444444-4444-4444-4444-444444444441'::uuid, 'محمد علي الحسناوي', 'KRB', 'ظرف ميداني طارئ - ازدحام شديد في مدخل كربلاء', 'pending',                    NOW() - INTERVAL '25 minutes', NULL::uuid, NULL::text,                NULL::timestamptz),
  ('44444444-4444-4444-4444-444444444443'::uuid, 'حسن كاظم البياتي',  'KRB', 'تأخر وصول البيانات من التشكيلات',                'forwarded_to_supervisor',    NOW() - INTERVAL '45 minutes', '33333333-3333-3333-3333-333333333331'::uuid, 'أحمد محمد الجبوري', NOW() - INTERVAL '40 minutes')
) AS v(requested_by, requested_by_name, office_id, reason, status, request_time, manager_reviewed_by, manager_reviewed_by_name, manager_reviewed_at)
WHERE NOT EXISTS (SELECT 1 FROM public.extension_requests LIMIT 1);

-- ============================================================
-- DONE. Demo accounts (password = 123456 for all):
--   u-director@ops.iq     (director)
--   u-supervisor@ops.iq   (supervisor)
--   u-manager@ops.iq      (manager — كربلاء)
--   u-manager2@ops.iq     (manager — النجف)
--   u-agent@ops.iq        (agent — كربلاء)
--   u-agent2@ops.iq       (agent — النجف)
--   u-agent3@ops.iq       (agent — كربلاء)
-- ============================================================
