import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - CJS default export
import bcrypt from "npm:bcryptjs@2.4.3";

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

    const { action, username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedUsername = username.trim().toLowerCase();

    if (trimmedUsername.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Username must be at least 2 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 4) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 4 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'register') {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', trimmedUsername)
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Username already taken' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const hash = bcrypt.hashSync(password, 10);

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ username: trimmedUsername, password_hash: hash })
        .select('id, username, token_balance, created_at')
        .single();

      if (createError || !newUser) {
        const msg = createError?.message || 'Failed to create user';
        console.error('User create error:', createError);
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If username is "admin", assign admin role
      if (trimmedUsername === 'admin') {
        await supabase
          .from('user_roles')
          .insert({ user_id: newUser.id, role: 'admin' });
      }

      // Check admin status
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', newUser.id)
        .eq('role', 'admin')
        .single();

      return new Response(
        JSON.stringify({ user: newUser, isAdmin: !!roleData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'login') {
      // Find user
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', trimmedUsername)
        .single();

      if (fetchError || !existingUser) {
        // Special case: auto-create admin account on first login attempt
        if (trimmedUsername === 'admin') {
          const hash = bcrypt.hashSync('lilblund4ever', 10);
          const { data: adminUser, error: adminError } = await supabase
            .from('users')
            .insert({ username: 'admin', password_hash: hash })
            .select('id, username, token_balance, created_at')
            .single();

          if (adminError || !adminUser) {
            return new Response(
              JSON.stringify({ error: 'Failed to create admin account' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          await supabase
            .from('user_roles')
            .insert({ user_id: adminUser.id, role: 'admin' });

          // Verify password
          if (password !== 'lilblund4ever') {
            return new Response(
              JSON.stringify({ error: 'Invalid password' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ user: adminUser, isAdmin: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'User not found. Please create an account first.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If user has no password_hash (legacy user), set it now
      if (!existingUser.password_hash) {
        // For legacy admin, set default password
        if (trimmedUsername === 'admin') {
          const hash = bcrypt.hashSync('lilblund4ever', 10);
          await supabase
            .from('users')
            .update({ password_hash: hash })
            .eq('id', existingUser.id);

          if (password !== 'lilblund4ever') {
            return new Response(
              JSON.stringify({ error: 'Invalid password' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          // Legacy non-admin user: set the provided password as their new password
          const hash = bcrypt.hashSync(password, 10);
          await supabase
            .from('users')
            .update({ password_hash: hash })
            .eq('id', existingUser.id);
        }
      } else {
        // Verify password
        const valid = bcrypt.compareSync(password, existingUser.password_hash);
        if (!valid) {
          return new Response(
            JSON.stringify({ error: 'Invalid password' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Check admin status
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .eq('role', 'admin')
        .single();

      // Return user data without password_hash
      const { password_hash, ...userData } = existingUser;

      return new Response(
        JSON.stringify({ user: userData, isAdmin: !!roleData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "login" or "register".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
