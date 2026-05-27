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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      messages: {
        Row: {
          ai_provider: Database["public"]["Enums"]["ai_provider"] | null
          content: string
          created_at: string
          id: string
          is_error: boolean
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id: string
          workspace_id: string
        }
        Insert: {
          ai_provider?: Database["public"]["Enums"]["ai_provider"] | null
          content: string
          created_at?: string
          id?: string
          is_error?: boolean
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id: string
          workspace_id: string
        }
        Update: {
          ai_provider?: Database["public"]["Enums"]["ai_provider"] | null
          content?: string
          created_at?: string
          id?: string
          is_error?: boolean
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sender_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_provider: Database["public"]["Enums"]["ai_provider"] | null
          anthropic_key: string | null
          avatar_color: string
          created_at: string
          display_name: string
          github_token: string | null
          github_username: string | null
          id: string
          last_seen_at: string
          onboarded: boolean
          openai_key: string | null
        }
        Insert: {
          ai_provider?: Database["public"]["Enums"]["ai_provider"] | null
          anthropic_key?: string | null
          avatar_color?: string
          created_at?: string
          display_name?: string
          github_token?: string | null
          github_username?: string | null
          id: string
          last_seen_at?: string
          onboarded?: boolean
          openai_key?: string | null
        }
        Update: {
          ai_provider?: Database["public"]["Enums"]["ai_provider"] | null
          anthropic_key?: string | null
          avatar_color?: string
          created_at?: string
          display_name?: string
          github_token?: string | null
          github_username?: string | null
          id?: string
          last_seen_at?: string
          onboarded?: boolean
          openai_key?: string | null
        }
        Relationships: []
      }
      prompts: {
        Row: {
          content: string
          created_at: string
          created_by: string
          github_issue_number: number | null
          github_issue_url: string | null
          id: string
          status: Database["public"]["Enums"]["prompt_status"]
          title: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          status?: Database["public"]["Enums"]["prompt_status"]
          title: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          status?: Database["public"]["Enums"]["prompt_status"]
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted: boolean
          created_at: string
          email: string
          id: string
          invited_by: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          email: string
          id?: string
          invited_by: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          dns_checklist: Json
          dns_notes: string | null
          github_branch: string
          github_repo: string
          godaddy_domain: string | null
          id: string
          name: string
          supabase_project_url: string | null
          vercel_project_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          dns_checklist?: Json
          dns_notes?: string | null
          github_branch?: string
          github_repo: string
          godaddy_domain?: string | null
          id?: string
          name: string
          supabase_project_url?: string | null
          vercel_project_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          dns_checklist?: Json
          dns_notes?: string | null
          github_branch?: string
          github_repo?: string
          godaddy_domain?: string | null
          id?: string
          name?: string
          supabase_project_url?: string | null
          vercel_project_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_owner: { Args: { _workspace_id: string }; Returns: boolean }
      shares_workspace_with: {
        Args: { _other_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_provider: "claude" | "gpt"
      member_role: "owner" | "cofounder"
      prompt_status: "draft" | "sent"
      sender_type: "human" | "ai"
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
      ai_provider: ["claude", "gpt"],
      member_role: ["owner", "cofounder"],
      prompt_status: ["draft", "sent"],
      sender_type: ["human", "ai"],
    },
  },
} as const
