import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminActionRequest {
  admin_user_id: string;
  action: string;
  payload: Record<string, any>;
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

    const { admin_user_id, action, payload }: AdminActionRequest = await req.json();

    if (!admin_user_id || !action) {
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

    let result: any = {};

    switch (action) {
      case 'set_balance': {
        const { user_id, amount, league_id } = payload;
        if (!user_id || amount === undefined || !league_id) {
          return new Response(
            JSON.stringify({ error: 'Missing user_id, amount, or league_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { error } = await supabase
          .from('league_members')
          .update({ token_balance: amount })
          .eq('league_id', league_id)
          .eq('user_id', user_id);
        if (error) throw error;
        result = { message: `Balance set to ${amount}` };
        break;
      }

      case 'give_tokens': {
        const { user_id, amount, league_id } = payload;
        if (!user_id || !amount || !league_id) {
          return new Response(
            JSON.stringify({ error: 'Missing user_id, amount, or league_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data: memberData } = await supabase
          .from('league_members')
          .select('token_balance')
          .eq('league_id', league_id)
          .eq('user_id', user_id)
          .single();
        if (!memberData) throw new Error('User not found in this league');
        const { error } = await supabase
          .from('league_members')
          .update({ token_balance: memberData.token_balance + amount })
          .eq('league_id', league_id)
          .eq('user_id', user_id);
        if (error) throw error;
        result = { message: `Gave ${amount} tokens. New balance: ${memberData.token_balance + amount}` };
        break;
      }

      case 'reset_market': {
        const { market_id } = payload;
        if (!market_id) {
          return new Response(
            JSON.stringify({ error: 'Missing market_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await supabase.from('votes').delete().eq('market_id', market_id);
        await supabase.from('orders').delete().eq('market_id', market_id);
        await supabase.from('trades').delete().eq('market_id', market_id);
        await supabase.from('positions').delete().eq('market_id', market_id);
        await supabase.from('markets').update({ 
          status: 'OPEN', resolved_outcome: null, reported_at: null, 
          reported_by: null, evidence_url: null 
        }).eq('id', market_id);
        result = { message: 'Market reset to OPEN with all data cleared' };
        break;
      }

      case 'delete_market': {
        const { market_id } = payload;
        if (!market_id) {
          return new Response(
            JSON.stringify({ error: 'Missing market_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await supabase.from('votes').delete().eq('market_id', market_id);
        await supabase.from('orders').delete().eq('market_id', market_id);
        await supabase.from('trades').delete().eq('market_id', market_id);
        await supabase.from('positions').delete().eq('market_id', market_id);
        await supabase.from('markets').delete().eq('id', market_id);
        result = { message: 'Market and all related data deleted' };
        break;
      }

      case 'seed_market': {
        const { market_id, num_orders, league_id } = payload;
        if (!market_id) {
          return new Response(
            JSON.stringify({ error: 'Missing market_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get league members
        const effectiveLeagueId = league_id;
        let members: any[] = [];
        if (effectiveLeagueId) {
          const { data } = await supabase.from('league_members')
            .select('user_id, token_balance').eq('league_id', effectiveLeagueId);
          members = data || [];
        }

        if (members.length < 2) {
          return new Response(
            JSON.stringify({ error: 'Need at least 2 members in this league to seed data' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const count = num_orders || 6;
        const seededOrders = [];
        
        for (let i = 0; i < count; i++) {
          const member = members[Math.floor(Math.random() * members.length)];
          const side = Math.random() > 0.5 ? 'YES' : 'NO';
          const price = Math.floor(Math.random() * 60) + 20;
          const quantity = Math.floor(Math.random() * 10) + 1;
          const cost = side === 'YES' ? price * quantity : (100 - price) * quantity;
          
          if (member.token_balance >= cost) {
            await supabase.from('league_members')
              .update({ token_balance: member.token_balance - cost })
              .eq('league_id', effectiveLeagueId)
              .eq('user_id', member.user_id);
            member.token_balance -= cost;

            const { data: order } = await supabase.from('orders')
              .insert({ market_id, user_id: member.user_id, side, price, quantity, remaining_quantity: quantity })
              .select().single();

            if (order) seededOrders.push(order);
          }
        }

        result = { message: `Seeded ${seededOrders.length} orders`, orders: seededOrders.length };
        break;
      }

      case 'delete_league': {
        const { league_id } = payload;
        if (!league_id) {
          return new Response(
            JSON.stringify({ error: 'Missing league_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data: leagueMarkets } = await supabase
          .from('markets')
          .select('id')
          .eq('league_id', league_id);
        const marketIds = (leagueMarkets || []).map((m) => m.id);
        for (const mid of marketIds) {
          await supabase.from('votes').delete().eq('market_id', mid);
          await supabase.from('orders').delete().eq('market_id', mid);
          await supabase.from('trades').delete().eq('market_id', mid);
          await supabase.from('positions').delete().eq('market_id', mid);
        }
        await supabase.from('markets').delete().eq('league_id', league_id);
        await supabase.from('league_members').delete().eq('league_id', league_id);
        await supabase.from('leagues').delete().eq('id', league_id);
        result = { message: 'League and all related data deleted' };
        break;
      }

      case 'delete_user': {
        const { user_id } = payload;
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: 'Missing user_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (user_id === admin_user_id) {
          return new Response(
            JSON.stringify({ error: 'Cannot delete your own account' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await supabase.from('votes').delete().eq('user_id', user_id);
        await supabase.from('orders').delete().eq('user_id', user_id);
        await supabase.from('trades').delete().or(`yes_user_id.eq.${user_id},no_user_id.eq.${user_id}`);
        await supabase.from('positions').delete().eq('user_id', user_id);
        await supabase.from('league_members').delete().eq('user_id', user_id);
        await supabase.from('user_roles').delete().eq('user_id', user_id);
        await supabase.from('markets').update({ created_by: null }).eq('created_by', user_id);
        await supabase.from('leagues').update({ created_by: null }).eq('created_by', user_id);
        await supabase.from('users').delete().eq('id', user_id);
        result = { message: 'User account deleted' };
        break;
      }

      case 'impersonate': {
        const { user_id } = payload;
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: 'Missing user_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data: targetUser } = await supabase
          .from('users').select('id, username, token_balance, created_at')
          .eq('id', user_id).single();
        if (!targetUser) {
          return new Response(
            JSON.stringify({ error: 'User not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = { message: `Impersonating ${targetUser.username}`, user: targetUser };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
