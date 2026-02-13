
-- Create leagues table
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  join_code text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read leagues" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Anyone can insert leagues" ON public.leagues FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update leagues" ON public.leagues FOR UPDATE USING (true);

-- Create league_members table
CREATE TABLE public.league_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_balance integer NOT NULL DEFAULT 1000,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read league_members" ON public.league_members FOR SELECT USING (true);
CREATE POLICY "Anyone can insert league_members" ON public.league_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update league_members" ON public.league_members FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete league_members" ON public.league_members FOR DELETE USING (true);

-- Add league_id to markets (nullable for existing markets)
ALTER TABLE public.markets ADD COLUMN league_id uuid REFERENCES public.leagues(id);
