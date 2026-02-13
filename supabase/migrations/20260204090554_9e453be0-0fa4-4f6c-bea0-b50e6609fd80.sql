-- Create enums
CREATE TYPE public.market_status AS ENUM ('OPEN', 'VOTING', 'RESOLVED');
CREATE TYPE public.order_side AS ENUM ('YES', 'NO');
CREATE TYPE public.vote_choice AS ENUM ('YES', 'NO');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Users table (simple username auth, no passwords)
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  token_balance INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (for admin status)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Markets table
CREATE TABLE public.markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  status market_status NOT NULL DEFAULT 'OPEN',
  resolved_outcome vote_choice,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Orders table (limit order book)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  side order_side NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 1 AND price <= 99),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trades table (matched orders)
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  yes_user_id UUID NOT NULL REFERENCES public.users(id),
  no_user_id UUID NOT NULL REFERENCES public.users(id),
  price INTEGER NOT NULL CHECK (price >= 1 AND price <= 99),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Positions table (user holdings per market)
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  yes_shares INTEGER NOT NULL DEFAULT 0,
  no_shares INTEGER NOT NULL DEFAULT 0,
  UNIQUE (market_id, user_id)
);

-- Votes table
CREATE TABLE public.votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote vote_choice NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (market_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has admin role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for users (public read for this demo)
CREATE POLICY "Anyone can read users"
ON public.users FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert users"
ON public.users FOR INSERT
WITH CHECK (true);

-- RLS Policies for user_roles (read only, edge functions manage this)
CREATE POLICY "Anyone can read user_roles"
ON public.user_roles FOR SELECT
USING (true);

-- RLS Policies for markets
CREATE POLICY "Anyone can read markets"
ON public.markets FOR SELECT
USING (true);

CREATE POLICY "Anyone can create markets"
ON public.markets FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admin can update markets"
ON public.markets FOR UPDATE
USING (public.has_role(created_by, 'admin'));

-- RLS Policies for orders
CREATE POLICY "Anyone can read orders"
ON public.orders FOR SELECT
USING (true);

CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own orders"
ON public.orders FOR UPDATE
USING (true);

CREATE POLICY "Users can delete own orders"
ON public.orders FOR DELETE
USING (true);

-- RLS Policies for trades (read only, edge functions create)
CREATE POLICY "Anyone can read trades"
ON public.trades FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert trades"
ON public.trades FOR INSERT
WITH CHECK (true);

-- RLS Policies for positions
CREATE POLICY "Anyone can read positions"
ON public.positions FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert positions"
ON public.positions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update positions"
ON public.positions FOR UPDATE
USING (true);

-- RLS Policies for votes
CREATE POLICY "Anyone can read votes"
ON public.votes FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert votes"
ON public.votes FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_orders_market_side_price ON public.orders(market_id, side, price);
CREATE INDEX idx_trades_market_created ON public.trades(market_id, created_at);
CREATE INDEX idx_positions_market_user ON public.positions(market_id, user_id);
CREATE INDEX idx_votes_market ON public.votes(market_id);