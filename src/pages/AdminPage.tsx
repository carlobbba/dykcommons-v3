import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { AdminTools } from '@/components/AdminTools';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Market = Tables<'markets'>;
type User = Tables<'users'>;
type Vote = Tables<'votes'>;

interface MarketWithVotes extends Market {
  votes: Vote[];
}

interface LeagueMemberUser extends User {
  token_balance: number;
}

interface VotingSettings {
  id: string;
  yes_bloc_weight: number;
  no_bloc_weight: number;
  admin_weight: number;
  stake_percentage: number;
  no_resolve_timeout_minutes: number;
  min_votes_for_resolution: number;
}

export function AdminPage() {
  const { user, isAdmin } = useAuth();
  const { currentLeague } = useLeague();
  const [markets, setMarkets] = useState<MarketWithVotes[]>([]);
  const [users, setUsers] = useState<LeagueMemberUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [votingSettings, setVotingSettings] = useState<VotingSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentLeague) return;

    const { data: marketsData } = await supabase
      .from('markets')
      .select('*')
      .eq('league_id', currentLeague.id)
      .order('created_at', { ascending: false });

    const { data: votesData } = await supabase
      .from('votes')
      .select('*');

    const marketsWithVotes: MarketWithVotes[] = (marketsData || []).map(market => ({
      ...market,
      votes: (votesData || []).filter(v => v.market_id === market.id),
    }));

    setMarkets(marketsWithVotes);

    const { data: membersData } = await supabase
      .from('league_members')
      .select('user_id, token_balance')
      .eq('league_id', currentLeague.id);

    if (membersData && membersData.length > 0) {
      const userIds = membersData.map(m => m.user_id);
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds);

      const balanceMap = new Map(membersData.map(m => [m.user_id, m.token_balance]));
      const leagueUsers: LeagueMemberUser[] = (usersData || []).map(u => ({
        ...u,
        token_balance: balanceMap.get(u.id) ?? 0,
      }));
      leagueUsers.sort((a, b) => b.token_balance - a.token_balance);
      setUsers(leagueUsers);
    } else {
      setUsers([]);
    }

    const { data: settingsData } = await supabase
      .from('voting_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsData) {
      setVotingSettings(settingsData as unknown as VotingSettings);
    }

    setIsLoading(false);
  }, [currentLeague]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSaveSettings = async () => {
    if (!votingSettings) return;
    setIsSavingSettings(true);

    const { error } = await supabase
      .from('voting_settings')
      .update({
        yes_bloc_weight: votingSettings.yes_bloc_weight,
        no_bloc_weight: votingSettings.no_bloc_weight,
        admin_weight: votingSettings.admin_weight,
        stake_percentage: votingSettings.stake_percentage,
        no_resolve_timeout_minutes: votingSettings.no_resolve_timeout_minutes,
        min_votes_for_resolution: votingSettings.min_votes_for_resolution,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', votingSettings.id);

    if (error) {
      toast.error('Failed to save voting settings');
    } else {
      toast.success('Voting settings saved');
    }
    setIsSavingSettings(false);
  };

  const handleForceResolve = async (marketId: string, outcome: 'YES' | 'NO') => {
    if (!user) return;

    const { error } = await supabase.functions.invoke('resolve-market', {
      body: { market_id: marketId, outcome, admin_user_id: user.id },
    });

    if (error) {
      toast.error('Failed to resolve market');
    } else {
      toast.success(`Market resolved as ${outcome}`);
      fetchData();
    }
  };

  const handleCancelMarket = async (marketId: string) => {
    if (!user) return;

    const { error } = await supabase.functions.invoke('cancel-market', {
      body: { market_id: marketId, admin_user_id: user.id },
    });

    if (error) {
      toast.error('Failed to cancel market');
    } else {
      toast.success('Market cancelled and refunded');
      fetchData();
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Access denied. Admin only.</p>
        </main>
      </div>
    );
  }

  const totalWeight = votingSettings
    ? votingSettings.yes_bloc_weight + votingSettings.no_bloc_weight + votingSettings.admin_weight
    : 100;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Voting Settings */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Voting Settings</CardTitle>
              </CardHeader>
              <CardContent>
                {votingSettings ? (
                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>YES Bloc Weight: {votingSettings.yes_bloc_weight}%</Label>
                        <Slider
                          value={[votingSettings.yes_bloc_weight]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, yes_bloc_weight: v })}
                          min={0} max={50} step={0.5}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>NO Bloc Weight: {votingSettings.no_bloc_weight}%</Label>
                        <Slider
                          value={[votingSettings.no_bloc_weight]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, no_bloc_weight: v })}
                          min={0} max={50} step={0.5}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Admin Weight: {votingSettings.admin_weight}%</Label>
                        <Slider
                          value={[votingSettings.admin_weight]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, admin_weight: v })}
                          min={0} max={10} step={0.1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stake Percentage: {votingSettings.stake_percentage}%</Label>
                        <Slider
                          value={[votingSettings.stake_percentage]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, stake_percentage: v })}
                          min={0} max={100} step={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>NO Resolve Timeout: {votingSettings.no_resolve_timeout_minutes} min</Label>
                        <Slider
                          value={[votingSettings.no_resolve_timeout_minutes]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, no_resolve_timeout_minutes: v })}
                          min={1} max={1440} step={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Min Votes for Resolution: {votingSettings.min_votes_for_resolution}</Label>
                        <Slider
                          value={[votingSettings.min_votes_for_resolution]}
                          onValueChange={([v]) => setVotingSettings({ ...votingSettings, min_votes_for_resolution: v })}
                          min={1} max={100} step={1}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className={`text-sm ${Math.abs(totalWeight - 100) > 0.1 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                        Total Weight: {totalWeight.toFixed(1)}% {Math.abs(totalWeight - 100) > 0.1 && '(should be 100%)'}
                      </p>
                      <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                        {isSavingSettings ? 'Saving...' : 'Save Settings'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Loading settings...</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Markets Section - League-scoped */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Markets in this League</h2>
            
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-4">
                {markets.map((market) => {
                  const yesVotes = market.votes.filter(v => v.vote === 'YES').length;
                  const noVotes = market.votes.filter(v => v.vote === 'NO').length;
                  const totalVotes = market.votes.length;

                  return (
                    <Card key={market.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-medium">
                            {market.question}
                          </CardTitle>
                          <Badge variant={
                            market.status === 'OPEN' ? 'default' : 
                            market.status === 'VOTING' ? 'secondary' : 'outline'
                          }>
                            {market.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {market.status === 'VOTING' && (
                          <>
                            <div className="text-sm">
                              <span className="text-muted-foreground">Votes: </span>
                              <span className="text-green-600">{yesVotes} YES</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-red-600">{noVotes} NO</span>
                              <span className="text-muted-foreground"> ({totalVotes} total)</span>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600"
                                onClick={() => handleForceResolve(market.id, 'YES')}
                              >
                                Force YES
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleForceResolve(market.id, 'NO')}
                              >
                                Force NO
                              </Button>
                            </div>
                          </>
                        )}
                        {(market.status === 'OPEN' || market.status === 'VOTING') && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                Cancel & Refund
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel Market?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will cancel the market and refund all open orders. Positions will not be paid out.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep Open</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleCancelMarket(market.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Cancel & Refund
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {market.status === 'CANCELLED' && (
                          <p className="text-sm text-muted-foreground">Market was cancelled</p>
                        )}
                        {market.status === 'RESOLVED' && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Resolved: </span>
                            <span className="font-medium">{market.resolved_outcome}</span>
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Users Section - League members only */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Players in this League</h2>
            
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {users.map((u) => (
                    <div 
                      key={u.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <span className="font-medium">{u.username}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {u.token_balance.toLocaleString()} tokens
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Admin Testing Tools */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Testing Tools</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <AdminTools users={users} markets={markets} onRefresh={fetchData} />
          </div>
        </div>
      </main>
    </div>
  );
}
