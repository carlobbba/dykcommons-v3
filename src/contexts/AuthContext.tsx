import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  username: string;
  token_balance: number;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'prediction_market_user_id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (userId: string) => {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, token_balance, created_at')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      localStorage.removeItem(STORAGE_KEY);
      setUser(null);
      setIsAdmin(false);
      return null;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();

    setUser(userData);
    setIsAdmin(!!roleData);
    return userData;
  }, []);

  const refreshUser = useCallback(async () => {
    const storedUserId = localStorage.getItem(STORAGE_KEY);
    if (storedUserId) {
      await fetchUser(storedUserId);
    }
  }, [fetchUser]);

  useEffect(() => {
    const initAuth = async () => {
      const storedUserId = localStorage.getItem(STORAGE_KEY);
      if (storedUserId) {
        await fetchUser(storedUserId);
      }
      setIsLoading(false);
    };
    initAuth();
  }, [fetchUser]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('auth', {
        body: { action: 'login', username, password },
      });

      if (error) {
        return { success: false, error: 'Authentication failed' };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      if (data?.user) {
        setUser(data.user);
        setIsAdmin(data.isAdmin || false);
        localStorage.setItem(STORAGE_KEY, data.user.id);
        return { success: true };
      }

      return { success: false, error: 'Unexpected response' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('auth', {
        body: { action: 'register', username, password },
      });

      if (data?.error) {
        return { success: false, error: data.error };
      }

      if (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg || 'Registration failed' };
      }

      if (data?.user) {
        setUser(data.user);
        setIsAdmin(data.isAdmin || false);
        localStorage.setItem(STORAGE_KEY, data.user.id);
        return { success: true };
      }

      return { success: false, error: 'Unexpected response' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('prediction_market_league_id');
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
