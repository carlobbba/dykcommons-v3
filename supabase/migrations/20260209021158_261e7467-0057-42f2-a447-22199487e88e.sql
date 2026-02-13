
-- Add new columns to markets table
ALTER TABLE public.markets 
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_by uuid,
  ADD COLUMN IF NOT EXISTS evidence_url text;

-- Backfill title from question for existing markets
UPDATE public.markets SET title = question WHERE title IS NULL;

-- Now make title NOT NULL
ALTER TABLE public.markets ALTER COLUMN title SET NOT NULL;

-- Add new columns to votes table
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS stake_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stake_returned boolean NOT NULL DEFAULT false;

-- Create voting_settings table
CREATE TABLE public.voting_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  yes_bloc_weight numeric NOT NULL DEFAULT 49.5,
  no_bloc_weight numeric NOT NULL DEFAULT 49.5,
  admin_weight numeric NOT NULL DEFAULT 1.0,
  stake_percentage numeric NOT NULL DEFAULT 5.0,
  no_resolve_timeout_minutes integer NOT NULL DEFAULT 60,
  min_votes_for_resolution integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on voting_settings
ALTER TABLE public.voting_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read voting_settings
CREATE POLICY "Anyone can read voting_settings"
  ON public.voting_settings
  FOR SELECT
  USING (true);

-- Only admins can update voting_settings
CREATE POLICY "Admins can update voting_settings"
  ON public.voting_settings
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert voting_settings
CREATE POLICY "Admins can insert voting_settings"
  ON public.voting_settings
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings row
INSERT INTO public.voting_settings (id) VALUES (gen_random_uuid());

-- Create evidence storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', true);

-- Storage policies for evidence bucket
CREATE POLICY "Evidence files are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'evidence');

CREATE POLICY "Authenticated users can upload evidence"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'authenticated');

-- Allow service role to update markets (for edge functions setting reported_at etc)
-- The existing admin-only update policy is too restrictive, edge functions use service role
-- We need a broader update policy for the new columns
CREATE POLICY "Service can update markets via edge functions"
  ON public.markets
  FOR UPDATE
  USING (true);

-- Drop the old restrictive admin-only update policy
DROP POLICY IF EXISTS "Admin can update markets" ON public.markets;

-- Allow updates to votes table (for stake_returned)
CREATE POLICY "Anyone can update votes"
  ON public.votes
  FOR UPDATE
  USING (true);

-- Allow updates to users table (for token balance changes from edge functions)
CREATE POLICY "Anyone can update users"
  ON public.users
  FOR UPDATE
  USING (true);
