

# Password Authentication and Leagues System

Two major changes: adding password-based login, and introducing private league communities for markets.

---

## Part 1: Password-Based Authentication

### Database Changes
- Add `password_hash` (text, nullable initially) column to `users` table
- Create a database view `users_public` that excludes `password_hash` to prevent client-side exposure
- Add RLS policy on `users` to deny direct SELECT (force queries through the view or edge function)

### New Edge Function: `auth/index.ts`
Handles registration and login server-side so passwords never touch the client:
- **register**: Accepts username + password, hashes password with bcrypt (via Deno), creates user, returns user data (without hash)
- **login**: Accepts username + password, fetches user by username (with hash), verifies with bcrypt, returns user data (without hash)
- For the admin account: if username is "admin" and no account exists yet, it auto-creates with password "lilblund4ever" hashed. If admin already exists, normal login flow applies.

### Frontend Changes
- **LoginScreen.tsx**: Add password field. Add a "Create Account" / "Sign In" toggle. Registration requires username + password. Login requires username + password.
- **AuthContext.tsx**: Replace direct Supabase queries with calls to the `auth` edge function for login/register. The rest (localStorage session, user state) stays the same.

---

## Part 2: Leagues System

### Database Changes

**New `leagues` table:**
- `id` (uuid, PK)
- `name` (text, NOT NULL)
- `join_code` (text, NOT NULL, UNIQUE) - 6-character alphanumeric code
- `created_by` (uuid, FK to users)
- `created_at` (timestamptz)

**New `league_members` table:**
- `id` (uuid, PK)
- `league_id` (uuid, FK to leagues)
- `user_id` (uuid, FK to users)
- `token_balance` (integer, default 1000)
- `joined_at` (timestamptz)
- UNIQUE constraint on (league_id, user_id)

**Markets table update:**
- Add `league_id` (uuid, FK to leagues, NOT NULL for new markets)

**RLS Policies:**
- `leagues`: Users can only SELECT leagues they are a member of. Admin can see all.
- `league_members`: Users can only see members of leagues they belong to. Admin can see all.
- Markets, orders, positions, trades, votes: existing policies stay (they're already permissive), but frontend queries will filter by league.

### Token Balance Migration
- The per-user `users.token_balance` is no longer the primary balance
- All balance reads/writes in edge functions and frontend now use `league_members.token_balance` for the current league
- The `users.token_balance` column stays but becomes unused (keeps backward compat, can be removed later)

### New Frontend: League Selection

**New `LeaguesPage.tsx`** - Shown after login, before markets:
- Lists all leagues the user belongs to (with their token balance in each)
- "Create League" button: enter a name, generates a join code, auto-joins the creator
- "Join League" button: enter a join code, adds user to that league with 1000 tokens
- Clicking a league navigates to the markets view filtered to that league

**New `LeagueContext.tsx`** - Stores the currently selected league:
- `currentLeague` state (league_id, name, join_code)
- `leagueBalance` (token_balance from league_members)
- `setCurrentLeague()` / `leaveLeague()` (go back to league selector)
- Provides league-scoped balance to Header, TradingPanel, etc.

### App Flow Changes

**App.tsx routing update:**
- After login, if no league is selected, show LeaguesPage
- Once a league is selected, show the existing Markets/Detail/Portfolio routes
- Add a "Back to Leagues" button in the Header

**Header.tsx changes:**
- Show league name
- Show league-specific token balance (from league_members) instead of users.token_balance
- "Back to Leagues" navigation link
- Show join code somewhere accessible (e.g., clicking league name shows it)

### Edge Function Updates

All edge functions that read/write `users.token_balance` must switch to `league_members.token_balance`:

1. **place-order**: Accept `league_id` param, read/write balance from `league_members` where league_id + user_id match
2. **sell-position**: Same league_id scoping for balance
3. **resolve-market**: Look up the market's `league_id`, settle balances in `league_members`
4. **check-market-expiry**: Same - settle via league_members
5. **cancel-market**: Refund to league_members balances
6. **admin-actions**: Update to work with league_members balances (set_balance, give_tokens target league_members)
7. **VotingModal**: Stake deduction/refund uses league_members balance

### Admin Access
- Admin user sees ALL leagues in the league selector (not just ones they're a member of)
- Admin can enter any league and has full admin controls there
- No other accounts get admin access regardless of username
- Admin doesn't need to join a league to access it

### Market Creation
- When creating a market inside a league, `league_id` is automatically set to the current league
- Markets page only shows markets for the current league

### Portfolio Page
- Scoped to current league (positions in that league's markets only)
- Shows league-specific balance

---

## Technical Details

### Files to Create
1. `supabase/functions/auth/index.ts` - Password auth edge function
2. `src/pages/LeaguesPage.tsx` - League selection/creation/joining UI
3. `src/contexts/LeagueContext.tsx` - Current league state management

### Files to Modify
1. **Database migration** - Add password_hash to users, create leagues + league_members tables, add league_id to markets
2. `src/components/LoginScreen.tsx` - Add password field and register/login toggle
3. `src/contexts/AuthContext.tsx` - Use auth edge function instead of direct DB queries
4. `src/App.tsx` - Add LeagueContext provider, conditional league selection routing
5. `src/components/Header.tsx` - League name, league balance, back-to-leagues link, show join code
6. `src/pages/MarketsPage.tsx` - Filter by current league, pass league_id on market creation
7. `src/pages/MarketDetailPage.tsx` - Use league balance for display
8. `src/pages/PortfolioPage.tsx` - Scope to current league
9. `src/pages/AdminPage.tsx` - Admin sees all leagues, admin tools work per-league
10. `src/components/TradingPanel.tsx` - Use league balance, pass league_id to edge functions
11. `src/components/VotingModal.tsx` - Use league balance for stakes
12. `src/components/AdminTools.tsx` - Update balance operations to target league_members
13. `supabase/functions/place-order/index.ts` - Use league_members balance
14. `supabase/functions/sell-position/index.ts` - Use league_members balance
15. `supabase/functions/resolve-market/index.ts` - Use league_members balance
16. `supabase/functions/check-market-expiry/index.ts` - Use league_members balance
17. `supabase/functions/cancel-market/index.ts` - Use league_members balance
18. `supabase/functions/admin-actions/index.ts` - Update balance actions for league_members
19. `supabase/config.toml` - Add auth function config

### Implementation Order
1. Database migration (password_hash, leagues, league_members, league_id on markets)
2. Auth edge function (register + login with bcrypt)
3. LoginScreen + AuthContext overhaul (password-based auth)
4. LeagueContext + LeaguesPage (create, join, select leagues)
5. App.tsx routing (league gate before markets)
6. Header updates (league info, balance source)
7. All edge functions updated to use league_members balance
8. MarketsPage, MarketDetailPage, PortfolioPage scoped to league
9. TradingPanel + VotingModal use league balance
10. AdminPage + AdminTools league-aware
11. Deploy all edge functions

### Key Edge Cases
- Existing markets without a league_id: migration sets league_id as nullable, old markets remain accessible only to admin
- Admin auto-joins leagues on entry (or we skip the membership check for admin in queries)
- If a user has 0 tokens in a league, they cannot trade but can still view
- Join codes are case-insensitive 6-char alphanumeric, generated server-side on league creation
- A user cannot join a league twice (unique constraint)

