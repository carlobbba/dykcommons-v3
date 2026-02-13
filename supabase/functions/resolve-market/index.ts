import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResolveMarketRequest {
  market_id: string;
  outcome: 'YES' | 'NO';
  admin_user_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { market_id, outcome, admin_user_id }: ResolveMarketRequest = await req.json();

    if (!market_id || !outcome) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leagueId = market.league_id;

    const { data: settings } = await supabase
      .from('voting_settings').select('*').limit(1).single();

    const yesBlocWeight = settings?.yes_bloc_weight ?? 49.5;
    const noBlocWeight = settings?.no_bloc_weight ?? 49.5;
    const adminWeight = settings?.admin_weight ?? 1.0;

    if (admin_user_id) {
      const { data: adminRole } = await supabase
        .from('user_roles').select('*')
        .eq('user_id', admin_user_id).eq('role', 'admin').single();

      if (!adminRole) {
        return new Response(
          JSON.stringify({ error: 'Not authorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (market.status !== 'VOTING') {
        return new Response(
          JSON.stringify({ error: 'Market is not in voting status' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: positions } = await supabase
        .from('positions').select('*').eq('market_id', market_id);

      const stakeholders = (positions || []).filter(p => p.yes_shares > 0 || p.no_shares > 0);

      const { data: votes } = await supabase
        .from('votes').select('*').eq('market_id', market_id);

      if (!votes || votes.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No votes yet' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const votedUserIds = new Set(votes.map(v => v.user_id));
      const allVoted = stakeholders.every(s => votedUserIds.has(s.user_id));

      if (!allVoted) {
        return new Response(
          JSON.stringify({ error: 'Not all stakeholders have voted yet' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const yesVoters = votes.filter(v => v.vote === 'YES');
      const noVoters = votes.filter(v => v.vote === 'NO');

      const { data: adminUsers } = await supabase
        .from('user_roles').select('user_id').eq('role', 'admin');

      const adminUserIds = new Set((adminUsers || []).map(a => a.user_id));

      let yesWeightedTotal = 0;
      let noWeightedTotal = 0;

      const nonAdminYesVoters = yesVoters.filter(v => !adminUserIds.has(v.user_id));
      const nonAdminNoVoters = noVoters.filter(v => !adminUserIds.has(v.user_id));
      const totalNonAdminVoters = nonAdminYesVoters.length + nonAdminNoVoters.length;

      if (totalNonAdminVoters > 0) {
        yesWeightedTotal += yesBlocWeight * (nonAdminYesVoters.length / totalNonAdminVoters);
        noWeightedTotal += noBlocWeight * (nonAdminNoVoters.length / totalNonAdminVoters);
      }

      for (const vote of votes) {
        if (adminUserIds.has(vote.user_id)) {
          if (vote.vote === 'YES') yesWeightedTotal += adminWeight;
          else noWeightedTotal += adminWeight;
        }
      }

      const totalWeightedVotes = yesWeightedTotal + noWeightedTotal;
      const yesPercentage = totalWeightedVotes > 0 ? yesWeightedTotal / totalWeightedVotes * 100 : 0;

      if (yesPercentage <= 50) {
        // NO consensus — return stakes and reopen
        for (const vote of votes) {
          if (vote.vote === 'NO' && vote.stake_amount > 0 && leagueId) {
            const { data: m } = await supabase.from('league_members')
              .select('token_balance').eq('league_id', leagueId).eq('user_id', vote.user_id).single();
            if (m) {
              await supabase.from('league_members')
                .update({ token_balance: m.token_balance + vote.stake_amount })
                .eq('league_id', leagueId).eq('user_id', vote.user_id);
            }
          }
        }

        await supabase.from('markets').update({ 
          status: 'OPEN', reported_at: null, reported_by: null, evidence_url: null,
        } as any).eq('id', market_id);

        await supabase.from('votes').delete().eq('market_id', market_id);

        return new Response(
          JSON.stringify({ success: true, result: 'REJECTED', message: 'Vote rejected - market returned to OPEN' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // YES consensus — return stakes to YES voters
      for (const vote of votes) {
        if (vote.vote === 'YES' && vote.stake_amount > 0 && leagueId) {
          const { data: m } = await supabase.from('league_members')
            .select('token_balance').eq('league_id', leagueId).eq('user_id', vote.user_id).single();
          if (m) {
            await supabase.from('league_members')
              .update({ token_balance: m.token_balance + vote.stake_amount })
              .eq('league_id', leagueId).eq('user_id', vote.user_id);
          }
        }
      }
    }

    // ===== RESOLVE MARKET =====
    const resolveOutcome = admin_user_id ? outcome : 'YES';

    await supabase.from('markets')
      .update({ status: 'RESOLVED', resolved_outcome: resolveOutcome })
      .eq('id', market_id);

    // Settle positions via league_members
    const { data: allPositions } = await supabase
      .from('positions').select('*').eq('market_id', market_id);

    let totalPayouts = 0;

    for (const position of allPositions || []) {
      const winningShares = resolveOutcome === 'YES' ? position.yes_shares : position.no_shares;
      
      if (winningShares > 0 && leagueId) {
        const payout = winningShares * 100;
        
        const { data: m } = await supabase.from('league_members')
          .select('token_balance').eq('league_id', leagueId).eq('user_id', position.user_id).single();

        if (m) {
          await supabase.from('league_members')
            .update({ token_balance: m.token_balance + payout })
            .eq('league_id', leagueId).eq('user_id', position.user_id);
          totalPayouts += payout;
        }
      }
    }

    // Refund unfilled orders
    const { data: openOrders } = await supabase
      .from('orders').select('*').eq('market_id', market_id).gt('remaining_quantity', 0);

    let totalRefunds = 0;

    for (const order of openOrders || []) {
      const costPerShare = order.side === 'YES' ? order.price : (100 - order.price);
      const refund = costPerShare * order.remaining_quantity;

      if (leagueId) {
        const { data: m } = await supabase.from('league_members')
          .select('token_balance').eq('league_id', leagueId).eq('user_id', order.user_id).single();

        if (m) {
          await supabase.from('league_members')
            .update({ token_balance: m.token_balance + refund })
            .eq('league_id', leagueId).eq('user_id', order.user_id);
          totalRefunds += refund;
        }
      }

      await supabase.from('orders').delete().eq('id', order.id);
    }

    return new Response(
      JSON.stringify({ success: true, outcome: resolveOutcome, payouts: totalPayouts, refunds: totalRefunds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
