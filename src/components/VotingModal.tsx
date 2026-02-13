import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeague } from '@/contexts/LeagueContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';

interface MarketRow {
  id: string;
  question: string;
  status: string;
  description?: string | null;
  evidence_url?: string | null;
  league_id?: string | null;
}

interface PositionRow {
  user_id: string;
  yes_shares: number;
  no_shares: number;
}

interface VotingSettingsRow {
  stake_percentage: number;
}

export function VotingModal() {
  const { user, refreshUser } = useAuth();
  const { currentLeague, refreshLeagueBalance } = useLeague();
  const [pendingMarket, setPendingMarket] = useState<MarketRow | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [stakeAmount, setStakeAmount] = useState(0);
  const [userPosition, setUserPosition] = useState<PositionRow | null>(null);

  const checkForPendingVotes = useCallback(async () => {
    if (!user || !currentLeague) {
      setIsChecking(false);
      return;
    }

    // Find markets in VOTING status for this league
    const { data: votingMarkets } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'VOTING')
      .eq('league_id', currentLeague.id);

    if (!votingMarkets || votingMarkets.length === 0) {
      setPendingMarket(null);
      setIsChecking(false);
      return;
    }

    const { data: userVotes } = await supabase
      .from('votes')
      .select('market_id')
      .eq('user_id', user.id);

    const votedMarketIds = new Set(userVotes?.map(v => v.market_id) || []);

    for (const market of votingMarkets) {
      if (votedMarketIds.has(market.id)) continue;

      const { data: positionData } = await supabase
        .from('positions')
        .select('*')
        .eq('market_id', market.id)
        .eq('user_id', user.id)
        .single();

      if (positionData && (positionData.yes_shares > 0 || positionData.no_shares > 0)) {
        setPendingMarket(market as unknown as MarketRow);
        setUserPosition(positionData);

        const { data: settings } = await supabase
          .from('voting_settings')
          .select('*')
          .limit(1)
          .single();

        const stakePercentage = (settings as unknown as VotingSettingsRow)?.stake_percentage ?? 5;
        const positionValue = (positionData.yes_shares + positionData.no_shares) * 100;
        const stake = Math.floor(positionValue * stakePercentage / 100);
        setStakeAmount(stake);
        setIsChecking(false);
        return;
      }
    }

    setPendingMarket(null);
    setIsChecking(false);
  }, [user, currentLeague]);

  useEffect(() => {
    checkForPendingVotes();
    const interval = setInterval(checkForPendingVotes, 3000);
    return () => clearInterval(interval);
  }, [checkForPendingVotes]);

  const handleVote = async (vote: 'YES' | 'NO') => {
    if (!pendingMarket || !user || !currentLeague) return;

    setIsVoting(true);

    // Deduct stake from league balance
    if (stakeAmount > 0) {
      const { data: memberData } = await supabase
        .from('league_members')
        .select('token_balance')
        .eq('league_id', currentLeague.id)
        .eq('user_id', user.id)
        .single();

      if (!memberData || memberData.token_balance < stakeAmount) {
        toast.error('Insufficient balance for voting stake');
        setIsVoting(false);
        return;
      }

      const { error: balanceError } = await supabase
        .from('league_members')
        .update({ token_balance: memberData.token_balance - stakeAmount })
        .eq('league_id', currentLeague.id)
        .eq('user_id', user.id);

      if (balanceError) {
        toast.error('Failed to deduct stake');
        setIsVoting(false);
        return;
      }
    }

    const { error: voteError } = await supabase
      .from('votes')
      .insert({
        market_id: pendingMarket.id,
        user_id: user.id,
        vote,
        stake_amount: stakeAmount,
      } as any);

    if (voteError) {
      // Refund stake on error
      if (stakeAmount > 0) {
        const { data: memberData } = await supabase
          .from('league_members')
          .select('token_balance')
          .eq('league_id', currentLeague.id)
          .eq('user_id', user.id)
          .single();
        if (memberData) {
          await supabase
            .from('league_members')
            .update({ token_balance: memberData.token_balance + stakeAmount })
            .eq('league_id', currentLeague.id)
            .eq('user_id', user.id);
        }
      }
      toast.error('Failed to submit vote');
      setIsVoting(false);
      return;
    }

    toast.success(`Voted ${vote} on "${pendingMarket.question}"`);
    refreshLeagueBalance(user.id);

    // Check if all stakeholders have voted
    const { data: allPositions } = await supabase
      .from('positions')
      .select('user_id, yes_shares, no_shares')
      .eq('market_id', pendingMarket.id);

    const stakeholders = (allPositions || []).filter(p => p.yes_shares > 0 || p.no_shares > 0);

    const { data: allVotes } = await supabase
      .from('votes')
      .select('user_id')
      .eq('market_id', pendingMarket.id);

    const votedUserIds = new Set((allVotes || []).map(v => v.user_id));
    const allVoted = stakeholders.every(s => votedUserIds.has(s.user_id));

    if (allVoted && stakeholders.length > 0) {
      await supabase.functions.invoke('resolve-market', {
        body: { market_id: pendingMarket.id, outcome: 'YES' },
      });
    }

    setIsVoting(false);
    checkForPendingVotes();
  };

  if (isChecking || !pendingMarket) return null;

  const evidenceUrl = (pendingMarket as any).evidence_url;
  const description = (pendingMarket as any).description;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold mb-2">🗳️ Vote Required</h2>
          <p className="text-muted-foreground text-sm">
            A market needs your vote to resolve. You must vote before you can continue trading.
          </p>
        </div>
        
        <div className="p-4 bg-muted rounded-lg mb-4">
          <p className="font-medium text-foreground text-center">{pendingMarket.question}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-2 text-center">{description}</p>
          )}
        </div>

        {evidenceUrl && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">Evidence:</p>
            {evidenceUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img src={evidenceUrl} alt="Evidence" className="w-full rounded-lg border max-h-48 object-contain" />
            ) : (
              <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink className="h-4 w-4" />
                View evidence file
              </a>
            )}
          </div>
        )}

        {stakeAmount > 0 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
            <p className="text-sm text-center">
              <span className="font-medium">Stake required:</span>{' '}
              <span className="text-yellow-600 font-bold">{stakeAmount} tokens</span>
            </p>
            <p className="text-xs text-muted-foreground text-center mt-1">
              You'll get this back if you vote with the consensus.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4 text-center">
          What is the real-world outcome of this prediction?
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-lg border-green-500/50 hover:bg-green-500/10 hover:text-green-600"
            onClick={() => handleVote('YES')}
            disabled={isVoting}
          >
            {isVoting ? 'Voting...' : 'YES'}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-lg border-red-500/50 hover:bg-red-500/10 hover:text-red-600"
            onClick={() => handleVote('NO')}
            disabled={isVoting}
          >
            {isVoting ? 'Voting...' : 'NO'}
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Market resolves when all stakeholders have voted
        </p>
      </div>
    </div>
  );
}
