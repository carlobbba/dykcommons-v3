import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelMarketRequest {
  market_id: string;
  admin_user_id: string;
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

    const { market_id, admin_user_id }: CancelMarketRequest = await req.json();

    if (!market_id || !admin_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: adminRole } = await supabase
      .from('user_roles').select('*')
      .eq('user_id', admin_user_id).eq('role', 'admin').single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Not authorized - admin only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from('markets').select('*').eq('id', market_id).single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (market.status === 'RESOLVED' || market.status === 'CANCELLED') {
      return new Response(
        JSON.stringify({ error: 'Market is already resolved or cancelled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leagueId = market.league_id;

    // Refund all open orders
    const { data: openOrders } = await supabase
      .from('orders').select('*').eq('market_id', market_id).gt('remaining_quantity', 0);

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

    await supabase.from('markets').update({ status: 'CANCELLED' }).eq('id', market_id);

    return new Response(
      JSON.stringify({ success: true, refunded_orders: openOrders?.length || 0 }),
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
