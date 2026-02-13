import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface League {
  id: string;
  name: string;
  join_code: string;
  created_by: string | null;
  created_at: string;
}

interface LeagueContextType {
  currentLeague: League | null;
  leagueBalance: number;
  setCurrentLeague: (league: League, balance: number) => void;
  leaveLeague: () => void;
  refreshLeagueBalance: (userId: string) => Promise<void>;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const LEAGUE_STORAGE_KEY = 'prediction_market_league_id';

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [currentLeague, setCurrentLeagueState] = useState<League | null>(null);
  const [leagueBalance, setLeagueBalance] = useState(0);

  const setCurrentLeague = useCallback((league: League, balance: number) => {
    setCurrentLeagueState(league);
    setLeagueBalance(balance);
    localStorage.setItem(LEAGUE_STORAGE_KEY, league.id);
  }, []);

  const leaveLeague = useCallback(() => {
    setCurrentLeagueState(null);
    setLeagueBalance(0);
    localStorage.removeItem(LEAGUE_STORAGE_KEY);
  }, []);

  const refreshLeagueBalance = useCallback(async (userId: string) => {
    if (!currentLeague) return;
    const { data } = await supabase
      .from('league_members')
      .select('token_balance')
      .eq('league_id', currentLeague.id)
      .eq('user_id', userId)
      .single();
    if (data) {
      setLeagueBalance(data.token_balance);
    }
  }, [currentLeague]);

  return (
    <LeagueContext.Provider value={{ currentLeague, leagueBalance, setCurrentLeague, leaveLeague, refreshLeagueBalance }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  const context = useContext(LeagueContext);
  if (context === undefined) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
}

export { LEAGUE_STORAGE_KEY };
