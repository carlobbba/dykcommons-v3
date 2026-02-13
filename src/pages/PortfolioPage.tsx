import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, TrendingDown, Trophy, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type Position = Tables<'positions'>;
type Market = Tables<'markets'>;

interface PositionWithMarket extends Position {
  market?: Market;
}

export function PortfolioPage() {
  const { user, isAdmin } = useAuth();
  const { currentLeague, leagueBalance } = useLeague();
  const [positions, setPositions] = useState<PositionWithMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !currentLeague) return;

    const fetchPositions = async () => {
      setIsLoading(true);

      // Get markets for this league
      const { data: leagueMarkets } = await supabase
        .from('markets')
        .select('id')
        .eq('league_id', currentLeague.id);

      if (!leagueMarkets || leagueMarkets.length === 0) {
        setPositions([]);
        setIsLoading(false);
        return;
      }

      const marketIds = leagueMarkets.map(m => m.id);

      const { data: posData, error: posError } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .in('market_id', marketIds);

      if (posError || !posData || posData.length === 0) {
        setPositions([]);
        setIsLoading(false);
        return;
      }

      const { data: marketsData } = await supabase
        .from('markets')
        .select('*')
        .in('id', marketIds);

      const marketMap = new Map<string, Market>();
      (marketsData || []).forEach(m => marketMap.set(m.id, m));

      const combined: PositionWithMarket[] = posData
        .filter(p => p.yes_shares > 0 || p.no_shares > 0)
        .map(p => ({ ...p, market: marketMap.get(p.market_id) }));

      setPositions(combined);
      setIsLoading(false);
    };

    fetchPositions();
  }, [user, currentLeague]);

  const openPositions = positions.filter(
    p => p.market && (p.market.status === 'OPEN' || p.market.status === 'VOTING')
  );

  const resolvedPositions = positions.filter(
    p => p.market && (p.market.status === 'RESOLVED' || p.market.status === 'CANCELLED')
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" />
              <span className="text-3xl font-bold">{isAdmin ? '∞' : leagueBalance.toLocaleString()}</span>
              <span className="text-muted-foreground">tokens</span>
            </div>
          </CardContent>
        </Card>

        <h2 className="text-lg font-semibold mb-3">Open Positions</h2>
        {isLoading ? (
          <p className="text-muted-foreground mb-6">Loading...</p>
        ) : openPositions.length === 0 ? (
          <p className="text-muted-foreground mb-6">No open positions.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {openPositions.map(p => (
              <Link key={p.id} to={`/market/${p.market_id}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.market?.question ?? 'Unknown market'}</p>
                        <Badge variant="outline" className="gap-1 mt-1">
                          <span className="text-xs text-muted-foreground">Status:</span>
                          {p.market?.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm ml-4">
                        {p.yes_shares > 0 && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{p.yes_shares} YES</span>
                          </div>
                        )}
                        {p.no_shares > 0 && (
                          <div className="flex items-center gap-1">
                            <TrendingDown className="h-4 w-4 text-red-500" />
                            <span className="font-medium">{p.no_shares} NO</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <h2 className="text-lg font-semibold mb-3">Resolved Markets</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : resolvedPositions.length === 0 ? (
          <p className="text-muted-foreground">No resolved positions yet.</p>
        ) : (
          <div className="space-y-3">
            {resolvedPositions.map(p => {
              const isCancelled = p.market?.status === 'CANCELLED';
              const outcome = p.market?.resolved_outcome;
              const winningShares = outcome === 'YES' ? p.yes_shares : outcome === 'NO' ? p.no_shares : 0;
              const payout = winningShares * 100;
              const won = winningShares > 0;

              return (
                <Card key={p.id} className="opacity-80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.market?.question ?? 'Unknown market'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {isCancelled ? (
                            <Badge variant="secondary">Cancelled</Badge>
                          ) : (
                            <Badge variant={won ? 'default' : 'destructive'}>Resolved: {outcome}</Badge>
                          )}
                          {p.yes_shares > 0 && <span className="text-xs text-muted-foreground">{p.yes_shares} YES</span>}
                          {p.no_shares > 0 && <span className="text-xs text-muted-foreground">{p.no_shares} NO</span>}
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        {isCancelled ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm">Refunded</span>
                          </div>
                        ) : won ? (
                          <div className="flex items-center gap-1 text-green-500">
                            <Trophy className="h-4 w-4" />
                            <span className="font-semibold">+{payout}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No payout</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
