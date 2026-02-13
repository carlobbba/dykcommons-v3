import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const specificMarketId = body.market_id;

    const { data: settings } = await supabase
      .from('voting_settings').select('*').limit(1).single();

    const timeoutMinutes = settings?.no_resolve_timeout_minutes ?? 60;
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    let query = supabase.from('markets').select('*')
      .eq('status', 'OPEN').lt('closes_at', cutoffTime);

    if (specificMarketId) {
      query = query.eq('id', specificMarketId);
    }

    const { data: expiredMarkets } = await query;

    if (!expiredMarkets || expiredMarkets.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expired markets found', resolved: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resolvedCount = 0;

    for (const market of expiredMarkets) {
      const leagueId = market.league_id;

      await supabase.from('markets')
        .update({ status: 'RESOLVED', resolved_outcome: 'NO' })
        .eq('id', market.id);

      // Settle positions — NO shareholders get 100 tokens per share
      const { data: positions } = await supabase
        .from('positions').select('*').eq('market_id', market.id);

      for (const position of positions || []) {
        if (position.no_shares > 0 && leagueId) {
          const payout = position.no_shares * 100;
          const { data: m } = await supabase.from('league_members')
            .select('token_balance').eq('league_id', leagueId).eq('user_id', position.user_id).single();

          if (m) {
            await supabase.from('league_members')
              .update({ token_balance: m.token_balance + payout })
              .eq('league_id', leagueId).eq('user_id', position.user_id);
          }
        }
      }

      // Refund unfilled orders
      const { data: openOrders } = await supabase
        .from('orders').select('*').eq('market_id', market.id).gt('remaining_quantity', 0);

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
          }
        }

        await supabase.from('orders').delete().eq('id', order.id);
      }

      resolvedCount++;
    }

    return new Response(
      JSON.stringify({ success: true, resolved: resolvedCount }),
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
