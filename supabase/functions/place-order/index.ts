import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlaceOrderRequest {
  market_id: string;
  user_id: string;
  side: 'YES' | 'NO';
  price: number;
  quantity: number;
  league_id: string;
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

    const { market_id, user_id, side, price, quantity, league_id }: PlaceOrderRequest = await req.json();

    // Check if user has pending votes
    const { data: votingMarkets } = await supabase
      .from('markets')
      .select('id')
      .eq('status', 'VOTING');

    if (votingMarkets && votingMarkets.length > 0) {
      const { data: userVotes } = await supabase
        .from('votes')
        .select('market_id')
        .eq('user_id', user_id);

      const votedMarketIds = new Set(userVotes?.map(v => v.market_id) || []);
      const hasUnvotedMarket = votingMarkets.some(m => !votedMarketIds.has(m.id));

      if (hasUnvotedMarket) {
        return new Response(
          JSON.stringify({ error: 'You must vote on all pending markets before trading' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if user is admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user_id)
      .eq('role', 'admin')
      .single();

    const isAdmin = !!adminRole;

    // Validate inputs
    if (!market_id || !user_id || !side || !price || !quantity) {
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

    if (quantity < 1) {
      return new Response(
        JSON.stringify({ error: 'Quantity must be at least 1' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check market is OPEN
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

    // Get user's league balance
    const { data: member, error: memberError } = await supabase
      .from('league_members')
      .select('token_balance')
      .eq('league_id', effectiveLeagueId)
      .eq('user_id', user_id)
      .single();

    // Calculate cost
    const costPerShare = side === 'YES' ? price : (100 - price);
    const totalCost = costPerShare * quantity;

    if (!isAdmin) {
      if (memberError || !member) {
        return new Response(
          JSON.stringify({ error: 'Not a member of this league' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (member.token_balance < totalCost) {
        return new Response(
          JSON.stringify({ error: 'Insufficient balance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct cost from league balance
      const { error: deductError } = await supabase
        .from('league_members')
        .update({ token_balance: member.token_balance - totalCost })
        .eq('league_id', effectiveLeagueId)
        .eq('user_id', user_id);

      if (deductError) {
        return new Response(
          JSON.stringify({ error: 'Failed to deduct balance' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ===== MATCHING =====
    const complementaryPrice = 100 - price;
    const oppositeSide = side === 'YES' ? 'NO' : 'YES';

    const { data: sellOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('market_id', market_id)
      .eq('side', side)
      .eq('price', price)
      .eq('is_sell_order', true)
      .gt('remaining_quantity', 0)
      .neq('user_id', user_id)
      .order('created_at', { ascending: true });

    const { data: mintOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('market_id', market_id)
      .eq('side', oppositeSide)
      .eq('price', complementaryPrice)
      .eq('is_sell_order', false)
      .gt('remaining_quantity', 0)
      .neq('user_id', user_id)
      .order('created_at', { ascending: true });

    interface MatchResult {
      orderId: string;
      orderUserId: string;
      fillQuantity: number;
      isContractTransfer: boolean;
      originalRemaining: number;
    }

    let remainingQuantity = quantity;
    const matches: MatchResult[] = [];

    for (const sellOrder of sellOrders || []) {
      if (remainingQuantity === 0) break;
      const fill = Math.min(remainingQuantity, sellOrder.remaining_quantity);
      matches.push({
        orderId: sellOrder.id,
        orderUserId: sellOrder.user_id,
        fillQuantity: fill,
        isContractTransfer: true,
        originalRemaining: sellOrder.remaining_quantity,
      });
      remainingQuantity -= fill;
    }

    for (const mintOrder of mintOrders || []) {
      if (remainingQuantity === 0) break;
      const fill = Math.min(remainingQuantity, mintOrder.remaining_quantity);
      matches.push({
        orderId: mintOrder.id,
        orderUserId: mintOrder.user_id,
        fillQuantity: fill,
        isContractTransfer: false,
        originalRemaining: mintOrder.remaining_quantity,
      });
      remainingQuantity -= fill;
    }

    // Execute matches
    for (const match of matches) {
      if (match.isContractTransfer) {
        const sellerId = match.orderUserId;
        const yesUserId = side === 'YES' ? user_id : sellerId;
        const noUserId = side === 'NO' ? user_id : sellerId;

        await supabase.from('trades').insert({
          market_id, yes_user_id: yesUserId, no_user_id: noUserId,
          price, quantity: match.fillQuantity,
        });

        // Pay seller via league_members
        const saleProceeds = side === 'YES'
          ? price * match.fillQuantity
          : (100 - price) * match.fillQuantity;

        const { data: sellerMember } = await supabase
          .from('league_members')
          .select('token_balance')
          .eq('league_id', effectiveLeagueId)
          .eq('user_id', sellerId)
          .single();

        if (sellerMember) {
          await supabase
            .from('league_members')
            .update({ token_balance: sellerMember.token_balance + saleProceeds })
            .eq('league_id', effectiveLeagueId)
            .eq('user_id', sellerId);
        }

        // Give buyer shares
        const { data: buyerPos } = await supabase
          .from('positions')
          .select('*')
          .eq('market_id', market_id)
          .eq('user_id', user_id)
          .single();

        if (buyerPos) {
          const posUpdate = side === 'YES'
            ? { yes_shares: buyerPos.yes_shares + match.fillQuantity }
            : { no_shares: buyerPos.no_shares + match.fillQuantity };
          await supabase.from('positions').update(posUpdate).eq('id', buyerPos.id);
        } else {
          await supabase.from('positions').insert({
            market_id, user_id,
            yes_shares: side === 'YES' ? match.fillQuantity : 0,
            no_shares: side === 'NO' ? match.fillQuantity : 0,
          });
        }

      } else {
        const yesUserId = side === 'YES' ? user_id : match.orderUserId;
        const noUserId = side === 'NO' ? user_id : match.orderUserId;
        const tradePrice = side === 'YES' ? price : complementaryPrice;

        await supabase.from('trades').insert({
          market_id, yes_user_id: yesUserId, no_user_id: noUserId,
          price: tradePrice, quantity: match.fillQuantity,
        });

        // Update YES user position
        const { data: yesPos } = await supabase
          .from('positions').select('*')
          .eq('market_id', market_id).eq('user_id', yesUserId).single();

        if (yesPos) {
          await supabase.from('positions')
            .update({ yes_shares: yesPos.yes_shares + match.fillQuantity })
            .eq('id', yesPos.id);
        } else {
          await supabase.from('positions').insert({
            market_id, user_id: yesUserId,
            yes_shares: match.fillQuantity, no_shares: 0,
          });
        }

        // Update NO user position
        const { data: noPos } = await supabase
          .from('positions').select('*')
          .eq('market_id', market_id).eq('user_id', noUserId).single();

        if (noPos) {
          await supabase.from('positions')
            .update({ no_shares: noPos.no_shares + match.fillQuantity })
            .eq('id', noPos.id);
        } else {
          await supabase.from('positions').insert({
            market_id, user_id: noUserId,
            yes_shares: 0, no_shares: match.fillQuantity,
          });
        }
      }

      // Update matched order
      const newRemaining = match.originalRemaining - match.fillQuantity;
      if (newRemaining === 0) {
        await supabase.from('orders').delete().eq('id', match.orderId);
      } else {
        await supabase.from('orders').update({ remaining_quantity: newRemaining }).eq('id', match.orderId);
      }
    }

    if (remainingQuantity > 0) {
      await supabase.from('orders').insert({
        market_id, user_id, side, price, quantity,
        remaining_quantity: remainingQuantity, is_sell_order: false,
      });
    }

    const matchedQuantity = quantity - remainingQuantity;

    return new Response(
      JSON.stringify({ success: true, matched: matchedQuantity, remaining: remainingQuantity, trades: matches.length }),
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
