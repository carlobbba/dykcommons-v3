export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      league_members: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          token_balance: number
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          token_balance?: number
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          token_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          join_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          join_code: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          evidence_url: string | null
          id: string
          league_id: string | null
          question: string
          reported_at: string | null
          reported_by: string | null
          resolved_outcome: Database["public"]["Enums"]["vote_choice"] | null
          status: Database["public"]["Enums"]["market_status"]
          title: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          league_id?: string | null
          question: string
          reported_at?: string | null
          reported_by?: string | null
          resolved_outcome?: Database["public"]["Enums"]["vote_choice"] | null
          status?: Database["public"]["Enums"]["market_status"]
          title: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          league_id?: string | null
          question?: string
          reported_at?: string | null
          reported_by?: string | null
          resolved_outcome?: Database["public"]["Enums"]["vote_choice"] | null
          status?: Database["public"]["Enums"]["market_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          is_sell_order: boolean
          market_id: string
          price: number
          quantity: number
          remaining_quantity: number
          side: Database["public"]["Enums"]["order_side"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_sell_order?: boolean
          market_id: string
          price: number
          quantity: number
          remaining_quantity: number
          side: Database["public"]["Enums"]["order_side"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_sell_order?: boolean
          market_id?: string
          price?: number
          quantity?: number
          remaining_quantity?: number
          side?: Database["public"]["Enums"]["order_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          id: string
          market_id: string
          no_shares: number
          user_id: string
          yes_shares: number
        }
        Insert: {
          id?: string
          market_id: string
          no_shares?: number
          user_id: string
          yes_shares?: number
        }
        Update: {
          id?: string
          market_id?: string
          no_shares?: number
          user_id?: string
          yes_shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          id: string
          market_id: string
          no_user_id: string
          price: number
          quantity: number
          yes_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          no_user_id: string
          price: number
          quantity: number
          yes_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          no_user_id?: string
          price?: number
          quantity?: number
          yes_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_no_user_id_fkey"
            columns: ["no_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_yes_user_id_fkey"
            columns: ["yes_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          token_balance: number
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          token_balance?: number
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          token_balance?: number
          username?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          market_id: string
          stake_amount: number
          stake_returned: boolean
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          stake_amount?: number
          stake_returned?: boolean
          user_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          stake_amount?: number
          stake_returned?: boolean
          user_id?: string
          vote?: Database["public"]["Enums"]["vote_choice"]
        }
        Relationships: [
          {
            foreignKeyName: "votes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_settings: {
        Row: {
          admin_weight: number
          id: string
          min_votes_for_resolution: number
          no_bloc_weight: number
          no_resolve_timeout_minutes: number
          stake_percentage: number
          updated_at: string
          yes_bloc_weight: number
        }
        Insert: {
          admin_weight?: number
          id?: string
          min_votes_for_resolution?: number
          no_bloc_weight?: number
          no_resolve_timeout_minutes?: number
          stake_percentage?: number
          updated_at?: string
          yes_bloc_weight?: number
        }
        Update: {
          admin_weight?: number
          id?: string
          min_votes_for_resolution?: number
          no_bloc_weight?: number
          no_resolve_timeout_minutes?: number
          stake_percentage?: number
          updated_at?: string
          yes_bloc_weight?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      market_status: "OPEN" | "VOTING" | "RESOLVED" | "CANCELLED"
      order_side: "YES" | "NO"
      vote_choice: "YES" | "NO"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      market_status: ["OPEN", "VOTING", "RESOLVED", "CANCELLED"],
      order_side: ["YES", "NO"],
      vote_choice: ["YES", "NO"],
    },
  },
} as const
