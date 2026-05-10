// Auto-generated from Supabase MCP `generate_typescript_types`.
// Regenerate after schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      answer: {
        Row: {
          chosen_option_id: string;
          created_at: string;
          id: string;
          is_correct: boolean;
          quiz_id: string;
          reason_text: string | null;
          solver_user_id: string;
        };
        Insert: {
          chosen_option_id: string;
          created_at?: string;
          id?: string;
          is_correct: boolean;
          quiz_id: string;
          reason_text?: string | null;
          solver_user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["answer"]["Insert"]>;
        Relationships: [];
      };
      app_user: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          email: string;
          id: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_user"]["Insert"]>;
        Relationships: [];
      };
      character_comment_cache: {
        Row: {
          created_at: string;
          day_label: string;
          family_id: string;
          id: string;
          text: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          day_label: string;
          family_id: string;
          id?: string;
          text: string;
          user_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["character_comment_cache"]["Insert"]
        >;
        Relationships: [];
      };
      comment: {
        Row: {
          author_user_id: string | null;
          category: Database["public"]["Enums"]["comment_category_enum"] | null;
          category_source:
            | Database["public"]["Enums"]["comment_category_source_enum"]
            | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["comment_kind_enum"];
          quiz_id: string;
          text: string;
        };
        Insert: {
          author_user_id?: string | null;
          category?:
            | Database["public"]["Enums"]["comment_category_enum"]
            | null;
          category_source?:
            | Database["public"]["Enums"]["comment_category_source_enum"]
            | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["comment_kind_enum"];
          quiz_id: string;
          text: string;
        };
        Update: Partial<Database["public"]["Tables"]["comment"]["Insert"]>;
        Relationships: [];
      };
      family: {
        Row: {
          code: string;
          created_at: string;
          created_by_user_id: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["family"]["Insert"]>;
        Relationships: [];
      };
      family_chemistry: {
        Row: {
          author_user_id: string;
          family_id: string;
          id: string;
          solver_user_id: string;
          total_correct: number;
          total_solved: number;
          updated_at: string;
        };
        Insert: {
          author_user_id: string;
          family_id: string;
          id?: string;
          solver_user_id: string;
          total_correct?: number;
          total_solved?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["family_chemistry"]["Insert"]
        >;
        Relationships: [];
      };
      family_member: {
        Row: {
          family_id: string;
          id: string;
          joined_at: string;
          nickname: string | null;
          role: Database["public"]["Enums"]["family_role_enum"];
          user_id: string;
        };
        Insert: {
          family_id: string;
          id?: string;
          joined_at?: string;
          nickname?: string | null;
          role?: Database["public"]["Enums"]["family_role_enum"];
          user_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["family_member"]["Insert"]
        >;
        Relationships: [];
      };
      public_comment: {
        Row: {
          author_user_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          post_id: string;
          text: string;
        };
        Insert: {
          author_user_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          post_id: string;
          text: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["public_comment"]["Insert"]
        >;
        Relationships: [];
      };
      public_post: {
        Row: {
          author_family_hash: string;
          category: Database["public"]["Enums"]["public_category_enum"];
          comment_count: number;
          false_option_index: number;
          family_id: string;
          id: string;
          options: Json;
          published_at: string;
          removed_at: string | null;
          solve_attempt_count: number;
          solve_correct_count: number;
          source_quiz_id: string;
          status: Database["public"]["Enums"]["public_post_status_enum"];
          upvote_count: number;
        };
        Insert: Database["public"]["Tables"]["public_post"]["Row"];
        Update: Partial<Database["public"]["Tables"]["public_post"]["Insert"]>;
        Relationships: [];
      };
      public_solve_attempt: {
        Row: {
          chosen_index: number;
          created_at: string;
          id: string;
          is_correct: boolean;
          post_id: string;
          solver_user_id: string;
        };
        Insert: Database["public"]["Tables"]["public_solve_attempt"]["Row"];
        Update: Partial<
          Database["public"]["Tables"]["public_solve_attempt"]["Insert"]
        >;
        Relationships: [];
      };
      public_upvote: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          voter_user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          voter_user_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["public_upvote"]["Insert"]
        >;
        Relationships: [];
      };
      quiz: {
        Row: {
          author_user_id: string;
          created_at: string;
          day_label: string;
          difficulty: number;
          family_id: string;
          id: string;
          is_backlog: boolean;
          publish_at: string;
          reveal_at: string;
          revealed_at: string | null;
          status: Database["public"]["Enums"]["quiz_status_enum"];
        };
        Insert: {
          author_user_id: string;
          created_at?: string;
          day_label: string;
          difficulty: number;
          family_id: string;
          id?: string;
          is_backlog?: boolean;
          publish_at?: string;
          reveal_at: string;
          revealed_at?: string | null;
          status?: Database["public"]["Enums"]["quiz_status_enum"];
        };
        Update: Partial<Database["public"]["Tables"]["quiz"]["Insert"]>;
        Relationships: [];
      };
      quiz_option: {
        Row: {
          created_at: string;
          edited: boolean;
          id: string;
          kind: Database["public"]["Enums"]["option_kind_enum"];
          position: number;
          quiz_id: string;
          source_llm: string | null;
          text: string;
        };
        Insert: {
          created_at?: string;
          edited?: boolean;
          id?: string;
          kind: Database["public"]["Enums"]["option_kind_enum"];
          position: number;
          quiz_id: string;
          source_llm?: string | null;
          text: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_option"]["Insert"]>;
        Relationships: [];
      };
      weekly_score: {
        Row: {
          category: Database["public"]["Enums"]["score_category_enum"];
          count: number;
          denominator: number;
          family_id: string;
          id: string;
          numerator: number;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["score_category_enum"];
          count?: number;
          denominator?: number;
          family_id: string;
          id?: string;
          numerator?: number;
          updated_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: Partial<Database["public"]["Tables"]["weekly_score"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      family_member_profile_v: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          family_id: string | null;
          joined_at: string | null;
          member_id: string | null;
          nickname: string | null;
          role: Database["public"]["Enums"]["family_role_enum"] | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      public_post_safe_v: {
        Row: {
          author_family_hash: string | null;
          category: Database["public"]["Enums"]["public_category_enum"] | null;
          comment_count: number | null;
          id: string | null;
          options: Json | null;
          published_at: string | null;
          removed_at: string | null;
          solve_accuracy: number | null;
          solve_attempt_count: number | null;
          status:
            | Database["public"]["Enums"]["public_post_status_enum"]
            | null;
          upvote_count: number | null;
        };
        Relationships: [];
      };
      quiz_option_revealed_v: {
        Row: {
          created_at: string | null;
          edited: boolean | null;
          id: string | null;
          kind: Database["public"]["Enums"]["option_kind_enum"] | null;
          position: number | null;
          quiz_id: string | null;
          source_llm: string | null;
          text: string | null;
        };
        Relationships: [];
      };
      quiz_option_safe_v: {
        Row: {
          created_at: string | null;
          id: string | null;
          position: number | null;
          quiz_id: string | null;
          text: string | null;
        };
        Relationships: [];
      };
      quiz_with_stats: {
        Row: {
          author_user_id: string | null;
          correct_count: number | null;
          created_at: string | null;
          day_label: string | null;
          difficulty: number | null;
          family_id: string | null;
          fool_rate: number | null;
          id: string | null;
          is_backlog: boolean | null;
          publish_at: string | null;
          reveal_at: string | null;
          revealed_at: string | null;
          solver_count: number | null;
          status: Database["public"]["Enums"]["quiz_status_enum"] | null;
        };
        Relationships: [];
      };
      weekly_ranking_v: {
        Row: {
          category: Database["public"]["Enums"]["score_category_enum"] | null;
          family_id: string | null;
          score: number | null;
          user_id: string | null;
          week_start: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auto_reveal_expired: { Args: Record<string, never>; Returns: number };
      create_family: {
        Args: { p_name: string };
        Returns: Database["public"]["Tables"]["family"]["Row"];
      };
      create_quiz: {
        Args: {
          p_difficulty: number;
          p_false: string;
          p_false_edited: boolean;
          p_false_source_llm: string | null;
          p_is_backlog: boolean;
          p_true_1: string;
          p_true_2: string;
        };
        Returns: Database["public"]["Tables"]["quiz"]["Row"];
      };
      current_app_user_id: { Args: Record<string, never>; Returns: string };
      gen_family_code: { Args: Record<string, never>; Returns: string };
      is_family_member: {
        Args: { p_family_id: string };
        Returns: boolean;
      };
      join_family: {
        Args: { p_code: string };
        Returns: Database["public"]["Tables"]["family"]["Row"];
      };
      kst_today: { Args: Record<string, never>; Returns: string };
      kst_week_start: { Args: { d: string }; Returns: string };
      kst_yesterday: { Args: Record<string, never>; Returns: string };
      mark_quiz_revealed_if_needed: {
        Args: { p_quiz_id: string };
        Returns: undefined;
      };
      reveal_quiz_now: {
        Args: { p_quiz_id: string };
        Returns: Database["public"]["Tables"]["quiz"]["Row"];
      };
      solve_public_post: {
        Args: { p_chosen_index: number; p_post_id: string };
        Returns: { false_option_index: number; is_correct: boolean }[];
      };
      submit_answer: {
        Args: {
          p_chosen_option_id: string;
          p_quiz_id: string;
          p_reason_text: string | null;
        };
        Returns: Database["public"]["Tables"]["answer"]["Row"];
      };
    };
    Enums: {
      comment_category_enum: "reaction" | "question" | "other";
      comment_category_source_enum: "heuristic" | "llm";
      comment_kind_enum: "user" | "ai";
      family_role_enum: "owner" | "member";
      llm_usage_kind_enum:
        | "generate"
        | "reroll"
        | "comment"
        | "anonymize"
        | "character_comment";
      option_kind_enum: "true" | "false";
      public_category_enum:
        | "legend"
        | "plausible"
        | "familylike"
        | "funny_wrong"
        | "warm";
      public_post_status_enum: "open" | "removed";
      quiz_status_enum: "open" | "revealed";
      report_reason_enum: "inappropriate" | "identifying" | "spam" | "other";
      score_category_enum:
        | "detective"
        | "lie_designer"
        | "pure_hearted"
        | "reaction_star"
        | "question_master";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
