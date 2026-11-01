// Database types for the papertrail schema, in the Supabase generator's format.
// The MCP generator only emits `public`, so this is kept in step by hand: after every
// migration, compare it with information_schema.columns (last checked 1 Nov 2026 after the extractions migration, exact match).
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
          extraction_started_at: string | null
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
          extraction_started_at?: string | null
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
          extraction_started_at?: string | null
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
      extraction_fields: {
        Row: {
          confidence: number
          corrected_at: string | null
          corrected_value: Json | null
          extraction_id: string
          field_name: string
          id: number
          position: number
          source_quote: string | null
          value: Json | null
        }
        Insert: {
          confidence: number
          corrected_at?: string | null
          corrected_value?: Json | null
          extraction_id: string
          field_name: string
          id?: never
          position: number
          source_quote?: string | null
          value?: Json | null
        }
        Update: {
          confidence?: number
          corrected_at?: string | null
          corrected_value?: Json | null
          extraction_id?: string
          field_name?: string
          id?: never
          position?: number
          source_quote?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_fields_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          invoice: Json
          mode: string
          model: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          invoice: Json
          mode: string
          model: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          invoice?: Json
          mode?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      model_calls: {
        Row: {
          attempt: number
          cached_input_tokens: number
          cost_usd: number
          created_at: string
          document_id: string | null
          error: string | null
          file_name: string
          id: number
          input_tokens: number
          latency_ms: number
          mode: string
          model: string
          outcome: string
          output_tokens: number
          reasoning_tokens: number
        }
        Insert: {
          attempt: number
          cached_input_tokens: number
          cost_usd: number
          created_at?: string
          document_id?: string | null
          error?: string | null
          file_name: string
          id?: never
          input_tokens: number
          latency_ms: number
          mode: string
          model: string
          outcome: string
          output_tokens: number
          reasoning_tokens: number
        }
        Update: {
          attempt?: number
          cached_input_tokens?: number
          cost_usd?: number
          created_at?: string
          document_id?: string | null
          error?: string | null
          file_name?: string
          id?: never
          input_tokens?: number
          latency_ms?: number
          mode?: string
          model?: string
          outcome?: string
          output_tokens?: number
          reasoning_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_calls_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
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
