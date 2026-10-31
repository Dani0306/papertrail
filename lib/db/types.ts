// Database types for the papertrail schema, in the Supabase generator's format.
// The MCP generator only emits `public`, so this is kept in step by hand: after every
// migration, compare it with information_schema.columns (last checked 1 Nov 2026, exact match).
// `supabase gen types --schema papertrail` produces the same file if the CLI is ever installed.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  papertrail: {
    Tables: {
      documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          original_filename: string
          page_count: number | null
          size_bytes: number
          status: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type: string
          original_filename: string
          page_count?: number | null
          size_bytes: number
          status?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          original_filename?: string
          page_count?: number | null
          size_bytes?: number
          status?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
