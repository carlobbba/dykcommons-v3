import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SellPositionRequest {
  market_id: string;
  user_id: string;
  side_to_sell: 'YES' | 'NO';
  price: number;
  quantity: number;
  league_id?: string;
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

    const { market_id, user_id, side_to_sell, price, quantity, league_id }: SellPositionRequest = await req.json();

    if (!market_id || !user_id || !side_to_sell || !price || !quantity) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (price < 1 || price > 99) {
      return new Response(
        JSON.stringify({ error: 'Price must be between 1 and 99' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('status, league_id')
      .eq('id', market_id)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (market.status !== 'OPEN') {
      return new Response(
        JSON.stringify({ error: 'Market is not open for trading' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveLeagueId = league_id || market.league_id;

    const { data: position, error: positionError } = await supabase
      .from('positions')
      .select('*')
      .eq('market_id', market_id)
      .eq('user_id', user_id)
      .single();

    if (positionError || !position) {
      return new Response(
        JSON.stringify({ error: 'No position found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const availableShares = side_to_sell === 'YES' ? position.yes_shares : position.no_shares;

    if (quantity > availableShares) {
      return new Response(
        JSON.stringify({ error: 'Not enough shares to sell' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Escrow
    const updateFields = side_to_sell === 'YES'
      ? { yes_shares: position.yes_shares - quantity }
      : { no_shares: position.no_shares - quantity };

    await supabase.from('positions').update(updateFields).eq('id', position.id);

    // Match against BUY orders
    const { data: matchingBuyOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('market_id', market_id)
      .eq('side', side_to_sell)
      .eq('price', price)
      .eq('is_sell_order', false)
      .gt('remaining_quantity', 0)
      .neq('user_id', user_id)
      .order('created_at', { ascending: true });

    let remainingQuantity = quantity;
    const matchedTrades: Array<{ buyer_user_id: string; quantity: number }> = [];
    const orderUpdates: Array<{ id: string; remaining_quantity: number }> = [];

    for (const buyOrder of matchingBuyOrders || []) {
      if (remainingQuantity === 0) break;
      const fillQuantity = Math.min(remainingQuantity, buyOrder.remaining_quantity);
      matchedTrades.push({ buyer_user_id: buyOrder.user_id, quantity: fillQuantity });
      orderUpdates.push({ id: buyOrder.id, remaining_quantity: buyOrder.remaining_quantity - fillQuantity });
      remainingQuantity -= fillQuantity;
    }

    for (const trade of matchedTrades) {
      const yesUserId = side_to_sell === 'YES' ? trade.buyer_user_id : user_id;
      const noUserId = side_to_sell === 'NO' ? trade.buyer_user_id : user_id;

      await supabase.from('trades').insert({
        market_id, yes_user_id: yesUserId, no_user_id: noUserId,
        price, quantity: trade.quantity,
      });

      // Pay seller via league_members
      const saleProceeds = side_to_sell === 'YES'
        ? price * trade.quantity
        : (100 - price) * trade.quantity;

      if (effectiveLeagueId) {
        const { data: sellerMember } = await supabase
          .from('league_members')
          .select('token_balance')
          .eq('league_id', effectiveLeagueId)
          .eq('user_id', user_id)
          .single();

        if (sellerMember) {
          await supabase
            .from('league_members')
            .update({ token_balance: sellerMember.token_balance + saleProceeds })
            .eq('league_id', effectiveLeagueId)
            .eq('user_id', user_id);
        }
      }

      // Give buyer shares
      const { data: buyerPos } = await supabase
        .from('positions').select('*')
        .eq('market_id', market_id).eq('user_id', trade.buyer_user_id).single();

      if (buyerPos) {
        const posUpdate = side_to_sell === 'YES'
          ? { yes_shares: buyerPos.yes_shares + trade.quantity }
          : { no_shares: buyerPos.no_shares + trade.quantity };
        await supabase.from('positions').update(posUpdate).eq('id', buyerPos.id);
      } else {
        await supabase.from('positions').insert({
          market_id, user_id: trade.buyer_user_id,
          yes_shares: side_to_sell === 'YES' ? trade.quantity : 0,
          no_shares: side_to_sell === 'NO' ? trade.quantity : 0,
        });
      }
    }

    for (const update of orderUpdates) {
      if (update.remaining_quantity === 0) {
        await supabase.from('orders').delete().eq('id', update.id);
      } else {
        await supabase.from('orders').update({ remaining_quantity: update.remaining_quantity }).eq('id', update.id);
      }
    }

    if (remainingQuantity > 0) {
      await supabase.from('orders').insert({
        market_id, user_id, side: side_to_sell, price, quantity,
        remaining_quantity: remainingQuantity, is_sell_order: true,
      });
    }

    return new Response(
      JSON.stringify({ success: true, matched: quantity - remainingQuantity, remaining: remainingQuantity, trades: matchedTrades.length }),
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
