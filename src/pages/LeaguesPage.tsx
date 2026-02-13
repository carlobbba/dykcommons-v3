import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, LogIn, Coins, LogOut, Copy, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface LeagueWithBalance {
  id: string;
  name: string;
  join_code: string;
  created_by: string | null;
  created_at: string;
  token_balance: number;
}

export function LeaguesPage() {
  const { user, isAdmin, logout } = useAuth();
  const { setCurrentLeague } = useLeague();
  const [leagues, setLeagues] = useState<LeagueWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLeagues = async () => {
    if (!user) return;

    if (isAdmin) {
      // Admin sees all leagues
      const { data: allLeagues } = await supabase
        .from('leagues')
        .select('*')
        .order('created_at', { ascending: false });

      if (allLeagues) {
        // Get admin's balances where they're a member
        const { data: memberships } = await supabase
          .from('league_members')
          .select('league_id, token_balance')
          .eq('user_id', user.id);

        const balanceMap = new Map(memberships?.map(m => [m.league_id, m.token_balance]) || []);

        setLeagues(allLeagues.map(l => ({
          ...l,
          token_balance: balanceMap.get(l.id) ?? 0,
        })));
      }
    } else {
      // Regular users see only their leagues
      const { data: memberships } = await supabase
        .from('league_members')
        .select('league_id, token_balance')
        .eq('user_id', user.id);

      if (memberships && memberships.length > 0) {
        const leagueIds = memberships.map(m => m.league_id);
        const { data: leagueData } = await supabase
          .from('leagues')
          .select('*')
          .in('id', leagueIds)
          .order('created_at', { ascending: false });

        if (leagueData) {
          const balanceMap = new Map(memberships.map(m => [m.league_id, m.token_balance]));
          setLeagues(leagueData.map(l => ({
            ...l,
            token_balance: balanceMap.get(l.id) ?? 1000,
          })));
        }
      } else {
        setLeagues([]);
      }
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchLeagues();
  }, [user, isAdmin]);

  const generateJoinCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newLeagueName.trim()) return;

    setIsSubmitting(true);

    const code = generateJoinCode();

    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        name: newLeagueName.trim(),
        join_code: code,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !league) {
      toast.error('Failed to create league');
      setIsSubmitting(false);
      return;
    }

    // Auto-join the creator
    await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        token_balance: 1000,
      });

    toast.success(`League "${league.name}" created! Join code: ${code}`);
    setNewLeagueName('');
    setIsCreateOpen(false);
    setIsSubmitting(false);
    fetchLeagues();
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;

    setIsSubmitting(true);

    const { data: league } = await supabase
      .from('leagues')
      .select('*')
      .ilike('join_code', joinCode.trim())
      .single();

    if (!league) {
      toast.error('Invalid join code');
      setIsSubmitting(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('league_members')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      toast.error('You are already a member of this league');
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        token_balance: 1000,
      });

    if (error) {
      toast.error('Failed to join league');
      setIsSubmitting(false);
      return;
    }

    toast.success(`Joined "${league.name}"!`);
    setJoinCode('');
    setIsJoinOpen(false);
    setIsSubmitting(false);
    fetchLeagues();
  };

  const handleSelectLeague = (league: LeagueWithBalance) => {
    setCurrentLeague(
      { id: league.id, name: league.name, join_code: league.join_code, created_by: league.created_by, created_at: league.created_at },
      league.token_balance
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Join code copied!');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-lg">Prediction Market</span>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="gap-1">
                  <LayoutDashboard className="h-4 w-4" />
                  Admin Dashboard
                </Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground">{user?.username}</span>
            {isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Your Leagues</h1>
          <div className="flex gap-2">
            <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <LogIn className="h-4 w-4 mr-2" />
                  Join League
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join a League</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleJoinLeague} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Join Code</Label>
                    <Input
                      placeholder="Enter 6-character code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      disabled={isSubmitting}
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting || joinCode.length < 6}>
                    {isSubmitting ? 'Joining...' : 'Join League'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create League
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a League</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateLeague} className="space-y-4">
                  <div className="space-y-2">
                    <Label>League Name</Label>
                    <Input
                      placeholder="e.g., Office Predictions"
                      value={newLeagueName}
                      onChange={(e) => setNewLeagueName(e.target.value)}
                      disabled={isSubmitting}
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting || !newLeagueName.trim()}>
                    {isSubmitting ? 'Creating...' : 'Create League'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Loading leagues...</p>
        ) : leagues.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">You're not in any leagues yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Create one or join with a code!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {leagues.map((league) => (
              <Card
                key={league.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => handleSelectLeague(league)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{league.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Coins className="h-3.5 w-3.5" />
                          <span>{isAdmin ? '∞' : league.token_balance.toLocaleString()} tokens</span>
                        </div>
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); copyCode(league.join_code); }}
                        >
                          <Copy className="h-3 w-3" />
                          {league.join_code}
                        </button>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Enter →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
