
-- Enums
CREATE TYPE public.photo_status AS ENUM ('pending', 'approved', 'deleted');
CREATE TYPE public.photo_day AS ENUM ('friday', 'saturday', 'sunday');
CREATE TYPE public.app_role AS ENUM ('admin');

-- user_roles (admin gating)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- photos
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploader_browser_id uuid NOT NULL,
  storage_path_original text NOT NULL,
  storage_path_thumb text NOT NULL,
  width int,
  height int,
  bytes int,
  day public.photo_day,
  location text,
  status public.photo_status NOT NULL DEFAULT 'pending',
  approved_at timestamptz,
  deleted_at timestamptz,
  like_count int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.photos TO anon, authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads approved photos" ON public.photos
  FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "admins read all photos" ON public.photos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX photos_feed_idx ON public.photos (created_at DESC) WHERE status = 'approved';
CREATE INDEX photos_best_idx ON public.photos (like_count DESC, created_at DESC) WHERE status = 'approved';
CREATE INDEX photos_pending_idx ON public.photos (created_at) WHERE status = 'pending';
CREATE INDEX photos_uploader_idx ON public.photos (uploader_browser_id);

-- likes
CREATE TABLE public.likes (
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  browser_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, browser_id)
);
GRANT ALL ON public.likes TO service_role;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
-- No client policies: all writes/reads go through server functions with service role.

CREATE OR REPLACE FUNCTION public.likes_after_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.photos SET like_count = like_count + 1 WHERE id = NEW.photo_id;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.likes_after_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.photos SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.photo_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER likes_ai AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.likes_after_insert();
CREATE TRIGGER likes_ad AFTER DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.likes_after_delete();

-- reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  reporter_browser_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  UNIQUE (photo_id, reporter_browser_id)
);
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX reports_open_idx ON public.reports (created_at) WHERE resolved_at IS NULL;

-- audit_log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);
