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
      admin_role_assignments: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          org_id: string
          subrole: Database["public"]["Enums"]["admin_subrole"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id: string
          subrole: Database["public"]["Enums"]["admin_subrole"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          subrole?: Database["public"]["Enums"]["admin_subrole"]
          user_id?: string
        }
        Relationships: []
      }
      ahc_bookings: {
        Row: {
          beneficiary_name: string
          corporate_id: string | null
          created_at: string
          employee_id: string | null
          fulfilled_date: string | null
          id: string
          invoice_amount: number
          notes: string | null
          org_id: string
          package_id: string | null
          report_delivered_at: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          beneficiary_name: string
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          fulfilled_date?: string | null
          id?: string
          invoice_amount?: number
          notes?: string | null
          org_id: string
          package_id?: string | null
          report_delivered_at?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          beneficiary_name?: string
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          fulfilled_date?: string | null
          id?: string
          invoice_amount?: number
          notes?: string | null
          org_id?: string
          package_id?: string | null
          report_delivered_at?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ahc_bookings_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahc_bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "opd_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahc_bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "ahc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      ahc_packages: {
        Row: {
          age_band: string | null
          code: string
          created_at: string
          gender: string | null
          id: string
          inclusions: Json
          is_active: boolean
          name: string
          org_id: string
          price: number
          updated_at: string
        }
        Insert: {
          age_band?: string | null
          code: string
          created_at?: string
          gender?: string | null
          id?: string
          inclusions?: Json
          is_active?: boolean
          name: string
          org_id: string
          price?: number
          updated_at?: string
        }
        Update: {
          age_band?: string | null
          code?: string
          created_at?: string
          gender?: string | null
          id?: string
          inclusions?: Json
          is_active?: boolean
          name?: string
          org_id?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_generations: {
        Row: {
          attachments_count: number
          claim_id: string | null
          completion_tokens: number | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_summary: string | null
          model: string
          ocr_text: string | null
          org_id: string
          output: string | null
          prompt_tokens: number | null
          provider: string
          status: string
          tool: string
        }
        Insert: {
          attachments_count?: number
          claim_id?: string | null
          completion_tokens?: number | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_summary?: string | null
          model: string
          ocr_text?: string | null
          org_id: string
          output?: string | null
          prompt_tokens?: number | null
          provider: string
          status?: string
          tool: string
        }
        Update: {
          attachments_count?: number
          claim_id?: string | null
          completion_tokens?: number | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_summary?: string | null
          model?: string
          ocr_text?: string | null
          org_id?: string
          output?: string | null
          prompt_tokens?: number | null
          provider?: string
          status?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_generations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key: string
          created_at: string
          default_model: string | null
          display_name: string
          id: string
          is_active: boolean
          is_default: boolean
          last_used_at: string | null
          notes: string | null
          org_id: string
          provider: string
          total_calls: number
          total_tokens: number
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          default_model?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          notes?: string | null
          org_id: string
          provider: string
          total_calls?: number
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          default_model?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          notes?: string | null
          org_id?: string
          provider?: string
          total_calls?: number
          total_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_token_usage: {
        Row: {
          app_id: string
          calls: number
          cost_inr: number
          created_at: string
          day: string
          id: string
          org_id: string
          token_id: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          app_id: string
          calls?: number
          cost_inr?: number
          created_at?: string
          day: string
          id?: string
          org_id: string
          token_id: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          app_id?: string
          calls?: number
          cost_inr?: number
          created_at?: string
          day?: string
          id?: string
          org_id?: string
          token_id?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_token_usage_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "platform_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_token_usage_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "api_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      api_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          org_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          org_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          org_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          department: string | null
          designation: string | null
          email: string
          id: string
          last_login_at: string | null
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          role: string
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_reply_to: string | null
          smtp_use_tls: boolean
          smtp_username: string | null
          smtp_verified_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          role?: string
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_reply_to?: string | null
          smtp_use_tls?: boolean
          smtp_username?: string | null
          smtp_verified_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          role?: string
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_reply_to?: string | null
          smtp_use_tls?: boolean
          smtp_username?: string | null
          smtp_verified_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_collections_placements: {
        Row: {
          agency_contact: string | null
          agency_name: string
          claim_id: string
          closed_at: string | null
          created_at: string
          handoff_packet: Json
          id: string
          notes: string | null
          org_id: string
          placed_at: string
          placed_by: string | null
          recovered_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          agency_contact?: string | null
          agency_name: string
          claim_id: string
          closed_at?: string | null
          created_at?: string
          handoff_packet?: Json
          id?: string
          notes?: string | null
          org_id: string
          placed_at?: string
          placed_by?: string | null
          recovered_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          agency_contact?: string | null
          agency_name?: string
          claim_id?: string
          closed_at?: string | null
          created_at?: string
          handoff_packet?: Json
          id?: string
          notes?: string | null
          org_id?: string
          placed_at?: string
          placed_by?: string | null
          recovered_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ar_writeoff_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          claim_id: string
          created_at: string
          id: string
          justification: string | null
          org_id: string
          posted_at: string | null
          reason: string
          rejected_reason: string | null
          requested_by: string | null
          required_approver_role: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          claim_id: string
          created_at?: string
          id?: string
          justification?: string | null
          org_id: string
          posted_at?: string | null
          reason: string
          rejected_reason?: string | null
          requested_by?: string | null
          required_approver_role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          claim_id?: string
          created_at?: string
          id?: string
          justification?: string | null
          org_id?: string
          posted_at?: string | null
          reason?: string
          rejected_reason?: string | null
          requested_by?: string | null
          required_approver_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_reconciliation_matches: {
        Row: {
          claim_id: string | null
          confidence: number
          created_at: string
          decided_by: string | null
          decision: string
          entry_id: string
          id: string
          method: string
          notes: string | null
          org_id: string
        }
        Insert: {
          claim_id?: string | null
          confidence?: number
          created_at?: string
          decided_by?: string | null
          decision: string
          entry_id: string
          id?: string
          method: string
          notes?: string | null
          org_id: string
        }
        Update: {
          claim_id?: string | null
          confidence?: number
          created_at?: string
          decided_by?: string | null
          decision?: string
          entry_id?: string
          id?: string
          method?: string
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_matches_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_matches_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_entries: {
        Row: {
          amount: number
          balance: number | null
          channel: string | null
          created_at: string
          id: string
          import_id: string
          match_confidence: number
          match_method: string | null
          match_status: string
          matched_claim_id: string | null
          narration: string | null
          org_id: string
          payer_hint: string | null
          raw: Json | null
          txn_date: string | null
          txn_type: string | null
          updated_at: string
          utr_ref: string | null
          value_date: string | null
        }
        Insert: {
          amount?: number
          balance?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          import_id: string
          match_confidence?: number
          match_method?: string | null
          match_status?: string
          matched_claim_id?: string | null
          narration?: string | null
          org_id: string
          payer_hint?: string | null
          raw?: Json | null
          txn_date?: string | null
          txn_type?: string | null
          updated_at?: string
          utr_ref?: string | null
          value_date?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          import_id?: string
          match_confidence?: number
          match_method?: string | null
          match_status?: string
          matched_claim_id?: string | null
          narration?: string | null
          org_id?: string
          payer_hint?: string | null
          raw?: Json | null
          txn_date?: string | null
          txn_type?: string | null
          updated_at?: string
          utr_ref?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_entries_matched_claim_id_fkey"
            columns: ["matched_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_entries_matched_claim_id_fkey"
            columns: ["matched_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_entries_matched_claim_id_fkey"
            columns: ["matched_claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          account_last4: string | null
          bank_name: string | null
          branch_id: string | null
          created_at: string
          file_name: string
          file_url: string | null
          id: string
          matched_rows: number
          notes: string | null
          org_id: string
          period_from: string | null
          period_to: string | null
          total_rows: number
          unmatched_rows: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          account_last4?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          file_name: string
          file_url?: string | null
          id?: string
          matched_rows?: number
          notes?: string | null
          org_id: string
          period_from?: string | null
          period_to?: string | null
          total_rows?: number
          unmatched_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          account_last4?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          file_name?: string
          file_url?: string | null
          id?: string
          matched_rows?: number
          notes?: string | null
          org_id?: string
          period_from?: string | null
          period_to?: string | null
          total_rows?: number
          unmatched_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "hospital_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_mappings: {
        Row: {
          bank_name: string | null
          column_map: Json
          created_at: string
          created_by: string | null
          header_row: number
          id: string
          is_default: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          column_map?: Json
          created_at?: string
          created_by?: string | null
          header_row?: number
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          column_map?: Json
          created_at?: string
          created_by?: string | null
          header_row?: number
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      claim_appeals: {
        Row: {
          approved_by: string | null
          band: string | null
          body: string
          claim_id: string
          created_at: string
          created_by: string | null
          gap_amount: number
          gap_pct: number
          generated_by: string
          id: string
          org_id: string
          recipient_email: string | null
          recipient_name: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          band?: string | null
          body: string
          claim_id: string
          created_at?: string
          created_by?: string | null
          gap_amount?: number
          gap_pct?: number
          generated_by?: string
          id?: string
          org_id: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          band?: string | null
          body?: string
          claim_id?: string
          created_at?: string
          created_by?: string | null
          gap_amount?: number
          gap_pct?: number
          generated_by?: string
          id?: string
          org_id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_appeals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_appeals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_appeals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_appeals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_appeals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_appeals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_appeals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_documents: {
        Row: {
          claim_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string | null
          org_id: string
          uploaded_by: string | null
          uploader_name: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          mime_type?: string | null
          org_id: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string | null
          org_id?: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Relationships: []
      }
      claim_status_meta: {
        Row: {
          bucket: Database["public"]["Enums"]["claim_status_bucket"]
          code: Database["public"]["Enums"]["claim_status_code"]
          description: string | null
          is_terminal: boolean
          label: string
          sort_order: number
        }
        Insert: {
          bucket: Database["public"]["Enums"]["claim_status_bucket"]
          code: Database["public"]["Enums"]["claim_status_code"]
          description?: string | null
          is_terminal?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          bucket?: Database["public"]["Enums"]["claim_status_bucket"]
          code?: Database["public"]["Enums"]["claim_status_code"]
          description?: string | null
          is_terminal?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      claim_submission_documents: {
        Row: {
          claim_id: string
          created_at: string
          doc_key: string
          doc_path: string | null
          doc_url: string | null
          id: string
          label: string
          notes: string | null
          org_id: string
          required_for_courier: boolean
          required_for_portal: boolean
          sort_order: number
          status: string
          submission_id: string
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          doc_key: string
          doc_path?: string | null
          doc_url?: string | null
          id?: string
          label: string
          notes?: string | null
          org_id: string
          required_for_courier?: boolean
          required_for_portal?: boolean
          sort_order?: number
          status?: string
          submission_id: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          doc_key?: string
          doc_path?: string | null
          doc_url?: string | null
          id?: string
          label?: string
          notes?: string | null
          org_id?: string
          required_for_courier?: boolean
          required_for_portal?: boolean
          sort_order?: number
          status?: string
          submission_id?: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_submission_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_submission_documents_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "claim_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_submission_events: {
        Row: {
          actor_id: string | null
          claim_id: string
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
          submission_id: string | null
        }
        Insert: {
          actor_id?: string | null
          claim_id: string
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
          submission_id?: string | null
        }
        Update: {
          actor_id?: string | null
          claim_id?: string
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_submission_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submission_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_submission_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "claim_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_submissions: {
        Row: {
          ack_doc_path: string | null
          ack_doc_url: string | null
          ack_received_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          branch_id: string | null
          claim_id: string
          courier_awb: string | null
          courier_partner: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          org_id: string
          portal_ref: string | null
          status: string
          submission_mode: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          ack_doc_path?: string | null
          ack_doc_url?: string | null
          ack_received_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          branch_id?: string | null
          claim_id: string
          courier_awb?: string | null
          courier_partner?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          portal_ref?: string | null
          status?: string
          submission_mode?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          ack_doc_path?: string | null
          ack_doc_url?: string | null
          ack_received_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          branch_id?: string | null
          claim_id?: string
          courier_awb?: string | null
          courier_partner?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          portal_ref?: string | null
          status?: string
          submission_mode?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_submissions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "hospital_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_submissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      claims: {
        Row: {
          action_plan: string | null
          approved_amount: number
          cheque_neft_utr_date: string | null
          cheque_neft_utr_no: string | null
          claim_creation_date: string
          claim_number: string
          claim_status: string
          claim_status_bucket:
            | Database["public"]["Enums"]["claim_status_bucket"]
            | null
          claim_status_code:
            | Database["public"]["Enums"]["claim_status_code"]
            | null
          claimed_amount: number
          coder_name: string | null
          copay: number
          created_at: string
          data_quality: Json
          date_of_admission: string | null
          date_of_discharge: string | null
          diagnosis: string | null
          doc_submission_date: string | null
          employee_code: string | null
          hospital_branch_id: string | null
          hospital_discount: number
          hospital_group_id: string | null
          hospital_name: string | null
          hospital_spoc: string | null
          id: string
          ihx_ref_id: string | null
          in_patient_number: string | null
          initial_claim_number: string | null
          insurance_company_name: string | null
          insurer_comments: string | null
          is_irdai_breach: boolean
          last_communication_at: string | null
          last_communication_note: string | null
          legacy_id: string | null
          member_customer_id: string | null
          org_id: string
          outstanding_amount: number
          patient_contact: string | null
          patient_name: string
          patient_paid_amount: number
          payment_update_date: string | null
          policy_holder_name: string | null
          policy_number: string | null
          policy_type: string | null
          receipt_no: string | null
          remarks: string | null
          settled_amount: number
          shortfall_amount: number
          tds_amount: number
          tpa_name: string
          tpa_spoc: string | null
          treating_doctor: string | null
          treatment: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          action_plan?: string | null
          approved_amount?: number
          cheque_neft_utr_date?: string | null
          cheque_neft_utr_no?: string | null
          claim_creation_date: string
          claim_number: string
          claim_status: string
          claim_status_bucket?:
            | Database["public"]["Enums"]["claim_status_bucket"]
            | null
          claim_status_code?:
            | Database["public"]["Enums"]["claim_status_code"]
            | null
          claimed_amount?: number
          coder_name?: string | null
          copay?: number
          created_at?: string
          data_quality?: Json
          date_of_admission?: string | null
          date_of_discharge?: string | null
          diagnosis?: string | null
          doc_submission_date?: string | null
          employee_code?: string | null
          hospital_branch_id?: string | null
          hospital_discount?: number
          hospital_group_id?: string | null
          hospital_name?: string | null
          hospital_spoc?: string | null
          id?: string
          ihx_ref_id?: string | null
          in_patient_number?: string | null
          initial_claim_number?: string | null
          insurance_company_name?: string | null
          insurer_comments?: string | null
          is_irdai_breach?: boolean
          last_communication_at?: string | null
          last_communication_note?: string | null
          legacy_id?: string | null
          member_customer_id?: string | null
          org_id: string
          outstanding_amount?: number
          patient_contact?: string | null
          patient_name: string
          patient_paid_amount?: number
          payment_update_date?: string | null
          policy_holder_name?: string | null
          policy_number?: string | null
          policy_type?: string | null
          receipt_no?: string | null
          remarks?: string | null
          settled_amount?: number
          shortfall_amount?: number
          tds_amount?: number
          tpa_name: string
          tpa_spoc?: string | null
          treating_doctor?: string | null
          treatment?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          action_plan?: string | null
          approved_amount?: number
          cheque_neft_utr_date?: string | null
          cheque_neft_utr_no?: string | null
          claim_creation_date?: string
          claim_number?: string
          claim_status?: string
          claim_status_bucket?:
            | Database["public"]["Enums"]["claim_status_bucket"]
            | null
          claim_status_code?:
            | Database["public"]["Enums"]["claim_status_code"]
            | null
          claimed_amount?: number
          coder_name?: string | null
          copay?: number
          created_at?: string
          data_quality?: Json
          date_of_admission?: string | null
          date_of_discharge?: string | null
          diagnosis?: string | null
          doc_submission_date?: string | null
          employee_code?: string | null
          hospital_branch_id?: string | null
          hospital_discount?: number
          hospital_group_id?: string | null
          hospital_name?: string | null
          hospital_spoc?: string | null
          id?: string
          ihx_ref_id?: string | null
          in_patient_number?: string | null
          initial_claim_number?: string | null
          insurance_company_name?: string | null
          insurer_comments?: string | null
          is_irdai_breach?: boolean
          last_communication_at?: string | null
          last_communication_note?: string | null
          legacy_id?: string | null
          member_customer_id?: string | null
          org_id?: string
          outstanding_amount?: number
          patient_contact?: string | null
          patient_name?: string
          patient_paid_amount?: number
          payment_update_date?: string | null
          policy_holder_name?: string | null
          policy_number?: string | null
          policy_type?: string | null
          receipt_no?: string | null
          remarks?: string | null
          settled_amount?: number
          shortfall_amount?: number
          tds_amount?: number
          tpa_name?: string
          tpa_spoc?: string | null
          treating_doctor?: string | null
          treatment?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_hospital_branch_id_fkey"
            columns: ["hospital_branch_id"]
            isOneToOne: false
            referencedRelation: "hospital_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_hospital_group_id_fkey"
            columns: ["hospital_group_id"]
            isOneToOne: false
            referencedRelation: "hospital_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_leads: {
        Row: {
          contact_name: string
          created_at: string
          email: string
          hospital_name: string
          id: string
          notes: string | null
          phone: string | null
          role: string | null
          source: string
          status: string
          user_agent: string | null
        }
        Insert: {
          contact_name: string
          created_at?: string
          email: string
          hospital_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          contact_name?: string
          created_at?: string
          email?: string
          hospital_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      discrepancy_action_log: {
        Row: {
          action_type: string
          ai_generation_id: string | null
          attachments: Json
          body_preview: string | null
          bulk_batch_id: string | null
          cc_emails: string[]
          channel: string | null
          claim_id: string
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          notes: string | null
          org_id: string
          performed_at: string
          performed_by: string | null
          provider_message_id: string | null
          recipient: string | null
          scheduled_for: string | null
          status: string
          subject: string | null
          tone: string | null
        }
        Insert: {
          action_type: string
          ai_generation_id?: string | null
          attachments?: Json
          body_preview?: string | null
          bulk_batch_id?: string | null
          cc_emails?: string[]
          channel?: string | null
          claim_id: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          notes?: string | null
          org_id: string
          performed_at?: string
          performed_by?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          scheduled_for?: string | null
          status?: string
          subject?: string | null
          tone?: string | null
        }
        Update: {
          action_type?: string
          ai_generation_id?: string | null
          attachments?: Json
          body_preview?: string | null
          bulk_batch_id?: string | null
          cc_emails?: string[]
          channel?: string | null
          claim_id?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          performed_at?: string
          performed_by?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          scheduled_for?: string | null
          status?: string
          subject?: string | null
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discrepancy_action_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancy_action_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancy_action_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "discrepancy_action_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discrepancy_actions: {
        Row: {
          claim_id: string
          created_at: string
          email_sent_count: number
          flag_severity: string
          flagged_amount: number
          flagged_pct: number
          id: string
          last_action_at: string | null
          last_action_by: string | null
          last_action_type: string | null
          org_id: string
          pushed_to_appeal_at: string | null
          remarks: string | null
          resolved_at: string | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          email_sent_count?: number
          flag_severity?: string
          flagged_amount?: number
          flagged_pct?: number
          id?: string
          last_action_at?: string | null
          last_action_by?: string | null
          last_action_type?: string | null
          org_id: string
          pushed_to_appeal_at?: string | null
          remarks?: string | null
          resolved_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          email_sent_count?: number
          flag_severity?: string
          flagged_amount?: number
          flagged_pct?: number
          id?: string
          last_action_at?: string | null
          last_action_by?: string | null
          last_action_type?: string | null
          org_id?: string
          pushed_to_appeal_at?: string | null
          remarks?: string | null
          resolved_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discrepancy_actions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancy_actions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancy_actions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "discrepancy_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dq_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dq_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          logged_at: string
          logged_by: string | null
          next_action_date: string
          notes: string | null
          org_id: string
          outcome: string
          promised_date: string | null
          ref_number: string | null
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          logged_at?: string
          logged_by?: string | null
          next_action_date: string
          notes?: string | null
          org_id: string
          outcome: string
          promised_date?: string | null
          ref_number?: string | null
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          logged_at?: string
          logged_by?: string | null
          next_action_date?: string
          notes?: string | null
          org_id?: string
          outcome?: string
          promised_date?: string | null
          ref_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claims_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_discrepancy_rows"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "follow_ups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_claim_deductions: {
        Row: {
          amount: number
          claim_id: string
          created_at: string
          head: string
          id: string
          org_id: string
          reason_code: string | null
          reason_text: string | null
          recoverable: boolean
        }
        Insert: {
          amount?: number
          claim_id: string
          created_at?: string
          head: string
          id?: string
          org_id: string
          reason_code?: string | null
          reason_text?: string | null
          recoverable?: boolean
        }
        Update: {
          amount?: number
          claim_id?: string
          created_at?: string
          head?: string
          id?: string
          org_id?: string
          reason_code?: string | null
          reason_text?: string | null
          recoverable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gov_claim_deductions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "gov_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_claim_documents: {
        Row: {
          claim_id: string
          doc_type: string
          file_name: string
          file_path: string
          id: string
          metadata: Json
          mime_type: string | null
          org_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          claim_id: string
          doc_type: string
          file_name: string
          file_path: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          org_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          claim_id?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          org_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_claim_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "gov_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_claims: {
        Row: {
          approved_amount: number
          beneficiary_contact: string | null
          beneficiary_id: string | null
          beneficiary_name: string
          claim_no: string | null
          claim_status: string
          claim_submitted_at: string | null
          claimed_amount: number
          created_at: string
          date_of_admission: string | null
          date_of_discharge: string | null
          deduction_amount: number
          doc_completeness_pct: number
          hospital_branch_id: string | null
          hospital_group_id: string | null
          id: string
          notes: string | null
          org_id: string
          outstanding_amount: number
          package_code: string | null
          package_name: string | null
          paid_amount: number
          pre_auth_approved_at: string | null
          pre_auth_no: string | null
          pre_auth_requested_at: string | null
          pre_auth_tat_deadline: string | null
          query_count: number
          scheme_id: string
          updated_at: string
        }
        Insert: {
          approved_amount?: number
          beneficiary_contact?: string | null
          beneficiary_id?: string | null
          beneficiary_name: string
          claim_no?: string | null
          claim_status?: string
          claim_submitted_at?: string | null
          claimed_amount?: number
          created_at?: string
          date_of_admission?: string | null
          date_of_discharge?: string | null
          deduction_amount?: number
          doc_completeness_pct?: number
          hospital_branch_id?: string | null
          hospital_group_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          outstanding_amount?: number
          package_code?: string | null
          package_name?: string | null
          paid_amount?: number
          pre_auth_approved_at?: string | null
          pre_auth_no?: string | null
          pre_auth_requested_at?: string | null
          pre_auth_tat_deadline?: string | null
          query_count?: number
          scheme_id: string
          updated_at?: string
        }
        Update: {
          approved_amount?: number
          beneficiary_contact?: string | null
          beneficiary_id?: string | null
          beneficiary_name?: string
          claim_no?: string | null
          claim_status?: string
          claim_submitted_at?: string | null
          claimed_amount?: number
          created_at?: string
          date_of_admission?: string | null
          date_of_discharge?: string | null
          deduction_amount?: number
          doc_completeness_pct?: number
          hospital_branch_id?: string | null
          hospital_group_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          outstanding_amount?: number
          package_code?: string | null
          package_name?: string | null
          paid_amount?: number
          pre_auth_approved_at?: string | null
          pre_auth_no?: string | null
          pre_auth_requested_at?: string | null
          pre_auth_tat_deadline?: string | null
          query_count?: number
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_claims_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "gov_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_empanelment: {
        Row: {
          created_at: string
          hospital_branch_id: string | null
          hospital_id_on_portal: string | null
          id: string
          mou_end: string | null
          mou_start: string | null
          notes: string | null
          org_id: string
          portal_credentials_ref: string | null
          renewal_status: string
          scheme_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hospital_branch_id?: string | null
          hospital_id_on_portal?: string | null
          id?: string
          mou_end?: string | null
          mou_start?: string | null
          notes?: string | null
          org_id: string
          portal_credentials_ref?: string | null
          renewal_status?: string
          scheme_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hospital_branch_id?: string | null
          hospital_id_on_portal?: string | null
          id?: string
          mou_end?: string | null
          mou_start?: string | null
          notes?: string | null
          org_id?: string
          portal_credentials_ref?: string | null
          renewal_status?: string
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_empanelment_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "gov_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_packages: {
        Row: {
          created_at: string
          id: string
          implant_allowed: boolean
          is_active: boolean
          org_id: string
          package_code: string
          package_name: string
          rate: number
          required_documents: Json
          scheme_id: string
          specialty: string | null
          stratification: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          implant_allowed?: boolean
          is_active?: boolean
          org_id: string
          package_code: string
          package_name: string
          rate?: number
          required_documents?: Json
          scheme_id: string
          specialty?: string | null
          stratification?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          implant_allowed?: boolean
          is_active?: boolean
          org_id?: string
          package_code?: string
          package_name?: string
          rate?: number
          required_documents?: Json
          scheme_id?: string
          specialty?: string | null
          stratification?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_packages_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "gov_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_schemes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          payer_authority: string | null
          portal_url: string | null
          scheme_type: string
          state_code: string | null
          tat_claim_days: number
          tat_payment_days: number
          tat_preauth_hrs: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          payer_authority?: string | null
          portal_url?: string | null
          scheme_type?: string
          state_code?: string | null
          tat_claim_days?: number
          tat_payment_days?: number
          tat_preauth_hrs?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          payer_authority?: string | null
          portal_url?: string | null
          scheme_type?: string
          state_code?: string | null
          tat_claim_days?: number
          tat_payment_days?: number
          tat_preauth_hrs?: number
          updated_at?: string
        }
        Relationships: []
      }
      hospital_branches: {
        Row: {
          city: string | null
          created_at: string
          group_id: string
          id: string
          name: string
          notes: string | null
          org_id: string
          raw_name: string | null
          submission_officer_id: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          group_id: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          raw_name?: string | null
          submission_officer_id?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          raw_name?: string | null
          submission_officer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_branches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "hospital_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_branches_submission_officer_id_fkey"
            columns: ["submission_officer_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_branches_submission_officer_id_fkey"
            columns: ["submission_officer_id"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_kpis: {
        Row: {
          app_id: string
          id: string
          meta: Json
          metric: string
          org_id: string
          period: string
          recorded_at: string
          value: number
        }
        Insert: {
          app_id: string
          id?: string
          meta?: Json
          metric: string
          org_id: string
          period: string
          recorded_at?: string
          value?: number
        }
        Update: {
          app_id?: string
          id?: string
          meta?: Json
          metric?: string
          org_id?: string
          period?: string
          recorded_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "hospital_kpis_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "platform_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          created_at: string
          error_summary: string | null
          failed_rows: number
          file_name: string
          id: string
          inserted_rows: number
          org_id: string
          reverted_at: string | null
          snapshot: Json | null
          status: string
          success_rows: number
          total_rows: number
          updated_rows: number
        }
        Insert: {
          created_at?: string
          error_summary?: string | null
          failed_rows?: number
          file_name: string
          id?: string
          inserted_rows?: number
          org_id: string
          reverted_at?: string | null
          snapshot?: Json | null
          status?: string
          success_rows?: number
          total_rows?: number
          updated_rows?: number
        }
        Update: {
          created_at?: string
          error_summary?: string | null
          failed_rows?: number
          file_name?: string
          id?: string
          inserted_rows?: number
          org_id?: string
          reverted_at?: string | null
          snapshot?: Json | null
          status?: string
          success_rows?: number
          total_rows?: number
          updated_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insurer_contacts: {
        Row: {
          cc_emails: string | null
          contact_name: string
          contract_expiry_date: string | null
          created_at: string
          designation: string | null
          email: string
          id: string
          is_primary: boolean
          notes: string | null
          org_id: string
          phone: string | null
          provider: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cc_emails?: string | null
          contact_name: string
          contract_expiry_date?: string | null
          created_at?: string
          designation?: string | null
          email: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id: string
          phone?: string | null
          provider: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cc_emails?: string | null
          contact_name?: string
          contract_expiry_date?: string | null
          created_at?: string
          designation?: string | null
          email?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          org_id?: string
          phone?: string | null
          provider?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurer_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_checklist: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          note: string | null
          org_id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          note?: string | null
          org_id: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          note?: string | null
          org_id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      opd_appointments: {
        Row: {
          beneficiary_name: string
          beneficiary_phone: string | null
          corporate_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          notes: string | null
          org_id: string
          provider: string | null
          provider_confirmed_at: string | null
          reminder_24h_sent_at: string | null
          reminder_same_day_sent_at: string | null
          scheduled_at: string
          specialty: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          beneficiary_name: string
          beneficiary_phone?: string | null
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          provider?: string | null
          provider_confirmed_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_same_day_sent_at?: string | null
          scheduled_at: string
          specialty?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          beneficiary_name?: string
          beneficiary_phone?: string | null
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          provider?: string | null
          provider_confirmed_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_same_day_sent_at?: string | null
          scheduled_at?: string
          specialty?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opd_appointments_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "opd_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_batches: {
        Row: {
          ack_no: string | null
          aggregator: string | null
          batch_no: string
          claim_count: number
          corporate_id: string | null
          created_at: string
          id: string
          org_id: string
          status: string
          submission_date: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          ack_no?: string | null
          aggregator?: string | null
          batch_no: string
          claim_count?: number
          corporate_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          status?: string
          submission_date?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          ack_no?: string | null
          aggregator?: string | null
          batch_no?: string
          claim_count?: number
          corporate_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          status?: string
          submission_date?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opd_batches_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_corporates: {
        Row: {
          aggregator: string | null
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          default_package_id: string | null
          dependents_allowed: boolean
          employee_limit: number | null
          hospital_branch_id: string | null
          hr_contact_email: string | null
          hr_contact_name: string | null
          hr_contact_phone: string | null
          id: string
          invoice_cycle: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          rate_sheet: Json
          spoc_email: string | null
          spoc_name: string | null
          spoc_phone: string | null
          updated_at: string
        }
        Insert: {
          aggregator?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          default_package_id?: string | null
          dependents_allowed?: boolean
          employee_limit?: number | null
          hospital_branch_id?: string | null
          hr_contact_email?: string | null
          hr_contact_name?: string | null
          hr_contact_phone?: string | null
          id?: string
          invoice_cycle?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          rate_sheet?: Json
          spoc_email?: string | null
          spoc_name?: string | null
          spoc_phone?: string | null
          updated_at?: string
        }
        Update: {
          aggregator?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          default_package_id?: string | null
          dependents_allowed?: boolean
          employee_limit?: number | null
          hospital_branch_id?: string | null
          hr_contact_email?: string | null
          hr_contact_name?: string | null
          hr_contact_phone?: string | null
          id?: string
          invoice_cycle?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          rate_sheet?: Json
          spoc_email?: string | null
          spoc_name?: string | null
          spoc_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opd_dependents: {
        Row: {
          created_at: string
          dob: string | null
          employee_id: string
          gender: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          relation: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          employee_id: string
          gender?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          relation: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          employee_id?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          relation?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opd_dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "opd_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_eligibility_sync_log: {
        Row: {
          aggregator: string | null
          completed_at: string | null
          corporate_id: string | null
          created_at: string
          details: Json
          employees_activated: number
          employees_synced: number
          error_message: string | null
          id: string
          org_id: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          aggregator?: string | null
          completed_at?: string | null
          corporate_id?: string | null
          created_at?: string
          details?: Json
          employees_activated?: number
          employees_synced?: number
          error_message?: string | null
          id?: string
          org_id: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          aggregator?: string | null
          completed_at?: string | null
          corporate_id?: string | null
          created_at?: string
          details?: Json
          employees_activated?: number
          employees_synced?: number
          error_message?: string | null
          id?: string
          org_id?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opd_eligibility_sync_log_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_employees: {
        Row: {
          corporate_id: string
          created_at: string
          department: string | null
          eligibility_synced_at: string | null
          email: string | null
          employee_code: string
          employee_name: string
          family_members: Json
          id: string
          org_id: string
          phone: string | null
          status: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          wallet_balance: number
          wallet_total: number
        }
        Insert: {
          corporate_id: string
          created_at?: string
          department?: string | null
          eligibility_synced_at?: string | null
          email?: string | null
          employee_code: string
          employee_name: string
          family_members?: Json
          id?: string
          org_id: string
          phone?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          wallet_balance?: number
          wallet_total?: number
        }
        Update: {
          corporate_id?: string
          created_at?: string
          department?: string | null
          eligibility_synced_at?: string | null
          email?: string | null
          employee_code?: string
          employee_name?: string
          family_members?: Json
          id?: string
          org_id?: string
          phone?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          wallet_balance?: number
          wallet_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "opd_employees_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_followup_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          org_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          org_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      opd_invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          org_id: string
          visit_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          org_id: string
          visit_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          org_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opd_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "opd_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_invoices: {
        Row: {
          corporate_id: string
          created_at: string
          due_date: string | null
          generated_at: string
          gross_amount: number
          id: string
          invoice_no: string
          notes: string | null
          org_id: string
          paid_amount: number
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          submitted_at: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          corporate_id: string
          created_at?: string
          due_date?: string | null
          generated_at?: string
          gross_amount?: number
          id?: string
          invoice_no: string
          notes?: string | null
          org_id: string
          paid_amount?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          submitted_at?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          corporate_id?: string
          created_at?: string
          due_date?: string | null
          generated_at?: string
          gross_amount?: number
          id?: string
          invoice_no?: string
          notes?: string | null
          org_id?: string
          paid_amount?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          submitted_at?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "opd_invoices_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_reports: {
        Row: {
          appointment_id: string | null
          awaiting_since: string
          beneficiary_name: string
          closed_at: string | null
          corporate_id: string | null
          created_at: string
          employee_id: string | null
          file_name: string | null
          file_path: string | null
          id: string
          notes: string | null
          org_id: string
          qc_at: string | null
          received_at: string | null
          sent_corporate_at: string | null
          sent_employee_at: string | null
          sla_target_at: string | null
          stage: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          awaiting_since?: string
          beneficiary_name: string
          closed_at?: string | null
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          org_id: string
          qc_at?: string | null
          received_at?: string | null
          sent_corporate_at?: string | null
          sent_employee_at?: string | null
          sla_target_at?: string | null
          stage?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          awaiting_since?: string
          beneficiary_name?: string
          closed_at?: string | null
          corporate_id?: string | null
          created_at?: string
          employee_id?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          qc_at?: string | null
          received_at?: string | null
          sent_corporate_at?: string | null
          sent_employee_at?: string | null
          sla_target_at?: string | null
          stage?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opd_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "opd_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_reports_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "opd_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_visits: {
        Row: {
          aggregator_claim_id: string | null
          batch_id: string | null
          copay: number
          corporate_id: string | null
          created_at: string
          department: string | null
          doctor_name: string | null
          employee_id: string | null
          hospital_branch_id: string | null
          id: string
          notes: string | null
          org_id: string
          patient_name: string
          patient_paid: number
          patient_relation: string | null
          payable_amount: number
          rejection_reason: string | null
          services: Json
          settled_at: string | null
          status: string
          submitted_at: string | null
          total_amount: number
          updated_at: string
          visit_date: string
        }
        Insert: {
          aggregator_claim_id?: string | null
          batch_id?: string | null
          copay?: number
          corporate_id?: string | null
          created_at?: string
          department?: string | null
          doctor_name?: string | null
          employee_id?: string | null
          hospital_branch_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          patient_name: string
          patient_paid?: number
          patient_relation?: string | null
          payable_amount?: number
          rejection_reason?: string | null
          services?: Json
          settled_at?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          updated_at?: string
          visit_date: string
        }
        Update: {
          aggregator_claim_id?: string | null
          batch_id?: string | null
          copay?: number
          corporate_id?: string | null
          created_at?: string
          department?: string | null
          doctor_name?: string | null
          employee_id?: string | null
          hospital_branch_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          patient_name?: string
          patient_paid?: number
          patient_relation?: string | null
          payable_amount?: number
          rejection_reason?: string | null
          services?: Json
          settled_at?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "opd_visits_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "opd_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      org_app_access: {
        Row: {
          app_id: string
          contract_end: string | null
          contract_start: string | null
          created_at: string
          id: string
          mrr_inr: number
          org_id: string
          plan: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          app_id: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          id?: string
          mrr_inr?: number
          org_id: string
          plan?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          id?: string
          mrr_inr?: number
          org_id?: string
          plan?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_app_access_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "platform_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      org_designations: {
        Row: {
          created_at: string
          id: string
          label: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          branch_scope: string[] | null
          branch_scope_mode: string
          created_at: string
          id: string
          last_seen_at: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          branch_scope?: string[] | null
          branch_scope_mode?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          branch_scope?: string[] | null
          branch_scope_mode?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          first_run_completed: boolean
          gstin: string | null
          id: string
          mrr_inr: number
          name: string
          plan: string
          settings: Json
          slug: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          first_run_completed?: boolean
          gstin?: string | null
          id?: string
          mrr_inr?: number
          name: string
          plan?: string
          settings?: Json
          slug: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          first_run_completed?: boolean
          gstin?: string | null
          id?: string
          mrr_inr?: number
          name?: string
          plan?: string
          settings?: Json
          slug?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outstanding_notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          message: string | null
          org_id: string
          read: boolean
          ref_claim_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message?: string | null
          org_id: string
          read?: boolean
          ref_claim_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message?: string | null
          org_id?: string
          read?: boolean
          ref_claim_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      outstanding_reminders: {
        Row: {
          cc_emails: string[] | null
          claim_count: number
          created_at: string
          error_message: string | null
          id: string
          insurer_id: number
          insurer_name: string
          oldest_claim_days: number | null
          org_id: string
          payload: Json | null
          recipient_email: string
          scheduled_at: string
          sent_at: string | null
          status: string
          total_outstanding: number
          updated_at: string
        }
        Insert: {
          cc_emails?: string[] | null
          claim_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          insurer_id: number
          insurer_name: string
          oldest_claim_days?: number | null
          org_id: string
          payload?: Json | null
          recipient_email: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          total_outstanding?: number
          updated_at?: string
        }
        Update: {
          cc_emails?: string[] | null
          claim_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          insurer_id?: number
          insurer_name?: string
          oldest_claim_days?: number | null
          org_id?: string
          payload?: Json | null
          recipient_email?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          total_outstanding?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outstanding_reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          bootstrap: boolean
          created_at: string
          id: string
          org_id: string | null
          target_email: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          bootstrap?: boolean
          created_at?: string
          id?: string
          org_id?: string | null
          target_email: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          bootstrap?: boolean
          created_at?: string
          id?: string
          org_id?: string | null
          target_email?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      platform_apps: {
        Row: {
          base_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      private_cron_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      reminder_runs: {
        Row: {
          cc_emails: string[] | null
          claim_count: number
          created_at: string
          discrepancy_count: number
          error_message: string | null
          id: string
          irdai_breach_count: number
          oldest_claim_days: number | null
          org_id: string
          recipient_email: string | null
          schedule_id: string | null
          schedule_name: string | null
          sent_at: string | null
          status: string
          total_outstanding: number
          tpa_name: string | null
          trigger_kind: string
        }
        Insert: {
          cc_emails?: string[] | null
          claim_count?: number
          created_at?: string
          discrepancy_count?: number
          error_message?: string | null
          id?: string
          irdai_breach_count?: number
          oldest_claim_days?: number | null
          org_id: string
          recipient_email?: string | null
          schedule_id?: string | null
          schedule_name?: string | null
          sent_at?: string | null
          status?: string
          total_outstanding?: number
          tpa_name?: string | null
          trigger_kind?: string
        }
        Update: {
          cc_emails?: string[] | null
          claim_count?: number
          created_at?: string
          discrepancy_count?: number
          error_message?: string | null
          id?: string
          irdai_breach_count?: number
          oldest_claim_days?: number | null
          org_id?: string
          recipient_email?: string | null
          schedule_id?: string | null
          schedule_name?: string | null
          sent_at?: string | null
          status?: string
          total_outstanding?: number
          tpa_name?: string | null
          trigger_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "reminder_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_schedules: {
        Row: {
          aging_bucket: string | null
          attach_excel: boolean
          body_template: string | null
          cadence: string
          cc_emails_override: string | null
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          every_n_days: number | null
          id: string
          include_aging_summary: boolean
          include_denied: boolean
          include_discrepancies: boolean
          include_irdai_breaches: boolean
          include_pending: boolean
          is_active: boolean
          last_run_at: string | null
          min_outstanding: number
          name: string
          next_run_at: string | null
          notes: string | null
          org_id: string
          recipient_email_override: string | null
          scope: string
          send_hour: number
          send_minute: number
          subject_template: string | null
          tpa_name: string | null
          updated_at: string
        }
        Insert: {
          aging_bucket?: string | null
          attach_excel?: boolean
          body_template?: string | null
          cadence?: string
          cc_emails_override?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          every_n_days?: number | null
          id?: string
          include_aging_summary?: boolean
          include_denied?: boolean
          include_discrepancies?: boolean
          include_irdai_breaches?: boolean
          include_pending?: boolean
          is_active?: boolean
          last_run_at?: string | null
          min_outstanding?: number
          name: string
          next_run_at?: string | null
          notes?: string | null
          org_id: string
          recipient_email_override?: string | null
          scope?: string
          send_hour?: number
          send_minute?: number
          subject_template?: string | null
          tpa_name?: string | null
          updated_at?: string
        }
        Update: {
          aging_bucket?: string | null
          attach_excel?: boolean
          body_template?: string | null
          cadence?: string
          cc_emails_override?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          every_n_days?: number | null
          id?: string
          include_aging_summary?: boolean
          include_denied?: boolean
          include_discrepancies?: boolean
          include_irdai_breaches?: boolean
          include_pending?: boolean
          is_active?: boolean
          last_run_at?: string | null
          min_outstanding?: number
          name?: string
          next_run_at?: string | null
          notes?: string | null
          org_id?: string
          recipient_email_override?: string | null
          scope?: string
          send_hour?: number
          send_minute?: number
          subject_template?: string | null
          tpa_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_send: boolean
          can_view: boolean
          created_at: string
          id: string
          org_id: string
          resource: string
          role: string
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_send?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          org_id: string
          resource: string
          role: string
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_send?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          org_id?: string
          resource?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_scorecard_overrides: {
        Row: {
          app_user_id: string
          created_at: string
          id: string
          month: string
          notes: string | null
          org_id: string
          query_resolved: number
          rating_override: string | null
          updated_at: string
        }
        Insert: {
          app_user_id: string
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          org_id: string
          query_resolved?: number
          rating_override?: string | null
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          org_id?: string
          query_resolved?: number
          rating_override?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_digest_runs: {
        Row: {
          cadence: string
          created_at: string
          error_message: string | null
          failed_count: number
          id: string
          org_id: string
          recipients_count: number
          sent_count: number
          trigger_kind: string
        }
        Insert: {
          cadence: string
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          org_id: string
          recipients_count?: number
          sent_count?: number
          trigger_kind?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          org_id?: string
          recipients_count?: number
          sent_count?: number
          trigger_kind?: string
        }
        Relationships: []
      }
      team_digest_subscriptions: {
        Row: {
          app_user_id: string
          created_at: string
          daily: boolean
          id: string
          monthly: boolean
          org_id: string
          updated_at: string
          weekly: boolean
        }
        Insert: {
          app_user_id: string
          created_at?: string
          daily?: boolean
          id?: string
          monthly?: boolean
          org_id: string
          updated_at?: string
          weekly?: boolean
        }
        Update: {
          app_user_id?: string
          created_at?: string
          daily?: boolean
          id?: string
          monthly?: boolean
          org_id?: string
          updated_at?: string
          weekly?: boolean
        }
        Relationships: []
      }
      user_notification_prefs: {
        Row: {
          channel: string
          enabled: boolean
          id: string
          pref_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          enabled?: boolean
          id?: string
          pref_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          id?: string
          pref_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tpa_allocations: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          org_id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tpa_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_case_invoices: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          org_id: string
          period_month: string
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          org_id: string
          period_month: string
          request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          org_id?: string
          period_month?: string
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_case_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "opd_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wellness_case_invoices_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "wellness_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_events: {
        Row: {
          actual_count: number
          corporate_id: string | null
          created_at: string
          event_date: string
          event_type: string
          expenses: number
          hospital_branch_id: string | null
          id: string
          location: string | null
          notes: string | null
          org_id: string
          planned_count: number
          revenue: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_count?: number
          corporate_id?: string | null
          created_at?: string
          event_date: string
          event_type: string
          expenses?: number
          hospital_branch_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          org_id: string
          planned_count?: number
          revenue?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_count?: number
          corporate_id?: string | null
          created_at?: string
          event_date?: string
          event_type?: string
          expenses?: number
          hospital_branch_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          org_id?: string
          planned_count?: number
          revenue?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_events_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_gmail_sync: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_polled_at: string | null
          org_id: string
          query_filter: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          org_id: string
          query_filter?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          org_id?: string
          query_filter?: string
          updated_at?: string
        }
        Relationships: []
      }
      wellness_invoice_runs: {
        Row: {
          emails_sent: number
          errors: Json | null
          id: string
          invoices_created: number
          org_id: string | null
          period_end: string
          period_start: string
          providers_total: number
          ran_at: string
        }
        Insert: {
          emails_sent?: number
          errors?: Json | null
          id?: string
          invoices_created?: number
          org_id?: string | null
          period_end: string
          period_start: string
          providers_total?: number
          ran_at?: string
        }
        Update: {
          emails_sent?: number
          errors?: Json | null
          id?: string
          invoices_created?: number
          org_id?: string | null
          period_end?: string
          period_start?: string
          providers_total?: number
          ran_at?: string
        }
        Relationships: []
      }
      wellness_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          kind: string
          org_id: string
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wellness_packages: {
        Row: {
          corporate_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          price: number
          service_type: string
          updated_at: string
        }
        Insert: {
          corporate_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          price?: number
          service_type?: string
          updated_at?: string
        }
        Update: {
          corporate_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          price?: number
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_packages_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_request_events: {
        Row: {
          action: string
          channel: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          id: string
          last_error: string | null
          message: string | null
          meta: Json | null
          opened_at: string | null
          org_id: string
          recipient: string | null
          request_id: string
          resent_from_event_id: string | null
          retry_count: number
          status: string
        }
        Insert: {
          action: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message?: string | null
          meta?: Json | null
          opened_at?: string | null
          org_id: string
          recipient?: string | null
          request_id: string
          resent_from_event_id?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          action?: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          message?: string | null
          meta?: Json | null
          opened_at?: string | null
          org_id?: string
          recipient?: string | null
          request_id?: string
          resent_from_event_id?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "wellness_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wellness_request_events_resent_from_event_id_fkey"
            columns: ["resent_from_event_id"]
            isOneToOne: false
            referencedRelation: "wellness_request_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_requests: {
        Row: {
          client_email: string | null
          client_name: string
          client_phone: string | null
          confirmation_sent_at: string | null
          corporate_id: string | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          package_id: string | null
          report_sent_at: string | null
          report_url: string | null
          requested_at: string
          scheduled_at: string | null
          service_type: string | null
          source: string
          source_message_id: string | null
          source_snippet: string | null
          source_subject: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          confirmation_sent_at?: string | null
          corporate_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          package_id?: string | null
          report_sent_at?: string | null
          report_url?: string | null
          requested_at?: string
          scheduled_at?: string | null
          service_type?: string | null
          source?: string
          source_message_id?: string | null
          source_snippet?: string | null
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          confirmation_sent_at?: string | null
          corporate_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          package_id?: string | null
          report_sent_at?: string | null
          report_url?: string | null
          requested_at?: string
          scheduled_at?: string | null
          service_type?: string | null
          source?: string
          source_message_id?: string | null
          source_snippet?: string | null
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_requests_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "opd_corporates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wellness_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "wellness_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          org_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          audience_role: string
          body: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          org_id: string
          sort_order: number
          subject_hint: string | null
          updated_at: string
        }
        Insert: {
          audience_role?: string
          body: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          org_id: string
          sort_order?: number
          subject_hint?: string | null
          updated_at?: string
        }
        Update: {
          audience_role?: string
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          subject_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      app_users_public: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          org_id: string | null
          role: string | null
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_verified_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          role?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_verified_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          org_id?: string | null
          role?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_verified_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claims_priority: {
        Row: {
          action_plan: string | null
          age_days: number | null
          age_pts: number | null
          amt_pts: number | null
          approved_amount: number | null
          breach_pts: number | null
          cheque_neft_utr_date: string | null
          cheque_neft_utr_no: string | null
          claim_creation_date: string | null
          claim_number: string | null
          claim_status: string | null
          claimed_amount: number | null
          copay: number | null
          created_at: string | null
          data_quality: Json | null
          date_of_admission: string | null
          date_of_discharge: string | null
          diagnosis: string | null
          doc_submission_date: string | null
          employee_code: string | null
          hospital_branch_id: string | null
          hospital_discount: number | null
          hospital_group_id: string | null
          hospital_name: string | null
          hospital_spoc: string | null
          id: string | null
          ihx_ref_id: string | null
          in_patient_number: string | null
          initial_claim_number: string | null
          insurance_company_name: string | null
          insurer_comments: string | null
          is_irdai_breach: boolean | null
          last_communication_at: string | null
          last_communication_note: string | null
          legacy_id: string | null
          member_customer_id: string | null
          org_id: string | null
          outstanding_amount: number | null
          patient_contact: string | null
          patient_name: string | null
          patient_paid_amount: number | null
          payment_update_date: string | null
          policy_holder_name: string | null
          policy_number: string | null
          policy_type: string | null
          priority_band: string | null
          priority_score: number | null
          receipt_no: string | null
          remarks: string | null
          settled_amount: number | null
          shortfall_amount: number | null
          status_lc: string | null
          status_pts: number | null
          tds_amount: number | null
          tpa_name: string | null
          tpa_spoc: string | null
          treatment: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_hospital_branch_id_fkey"
            columns: ["hospital_branch_id"]
            isOneToOne: false
            referencedRelation: "hospital_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_hospital_group_id_fkey"
            columns: ["hospital_group_id"]
            isOneToOne: false
            referencedRelation: "hospital_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_discrepancy_rows: {
        Row: {
          action_status: string | null
          approved_amount: number | null
          band: string | null
          claim_creation_date: string | null
          claim_id: string | null
          claim_number: string | null
          claim_status: string | null
          disc_amount: number | null
          disc_pct: number | null
          email_sent_count: number | null
          hospital_name: string | null
          insurance_company_name: string | null
          is_irdai_breach: boolean | null
          last_action_at: string | null
          last_action_type: string | null
          org_id: string | null
          outstanding_amount: number | null
          patient_name: string | null
          pushed_to_appeal_at: string | null
          settled_amount: number | null
          stage: string | null
          tds_amount: number | null
          tpa_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_followup_tpa_groups: {
        Row: {
          breach_count: number | null
          claim_count: number | null
          oldest_days: number | null
          org_id: string | null
          priority: string | null
          total_outstanding: number | null
          tpa: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_create_submission_tasks: { Args: never; Returns: number }
      can_access_branch: {
        Args: { _branch_id: string; _org_id: string }
        Returns: boolean
      }
      claim_status_bucket_for: {
        Args: { _code: Database["public"]["Enums"]["claim_status_code"] }
        Returns: Database["public"]["Enums"]["claim_status_bucket"]
      }
      get_own_smtp_settings: {
        Args: never
        Returns: {
          smtp_from_email: string
          smtp_from_name: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_reply_to: string
          smtp_use_tls: boolean
          smtp_username: string
          smtp_verified_at: string
        }[]
      }
      has_admin_subrole: {
        Args: {
          _org_id: string
          _subrole: Database["public"]["Enums"]["admin_subrole"]
          _user_id: string
        }
        Returns: boolean
      }
      has_app_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      my_app_roles: {
        Args: { _org_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      normalize_claim_status: {
        Args: { _raw: string }
        Returns: Database["public"]["Enums"]["claim_status_code"]
      }
      private_cron_get: { Args: { _key: string }; Returns: string }
      private_cron_set: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      promote_to_super_admin: {
        Args: { _make_owner?: boolean; _org_id?: string; _target_email: string }
        Returns: Json
      }
      refresh_hospital_kpis: { Args: never; Returns: number }
      seed_launch_checklist: { Args: { _org_id: string }; Returns: undefined }
      seed_submission_checklist: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      user_org_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      admin_subrole:
        | "super_admin"
        | "org_owner"
        | "org_admin"
        | "billing_admin"
        | "compliance_admin"
        | "tech_admin"
      app_role:
        | "Super Admin"
        | "Hospital Admin"
        | "RCM Manager"
        | "Billing Executive"
        | "TPA Coordinator"
        | "Front Office"
        | "Finance"
        | "Auditor"
        | "Viewer"
      claim_status_bucket:
        | "pre_auth"
        | "in_progress"
        | "query"
        | "approved"
        | "denied"
        | "settled"
        | "closed"
      claim_status_code:
        | "pre_auth_submitted"
        | "pre_auth_query"
        | "pre_auth_query_replied"
        | "pre_auth_approved"
        | "pre_auth_denied"
        | "discharge_initiated"
        | "discharge_query"
        | "discharge_query_replied"
        | "discharge_approved"
        | "discharge_denied"
        | "enhancement_submitted"
        | "enhancement_query"
        | "enhancement_query_replied"
        | "enhancement_approved"
        | "enhancement_denied"
        | "claim_submitted"
        | "claim_query"
        | "claim_query_replied"
        | "claim_approved"
        | "claim_denied"
        | "reconsideration_submitted"
        | "settlement_initiated"
        | "settlement_reminder"
        | "settled"
        | "rejected"
        | "closed"
      org_role: "owner" | "admin" | "manager" | "member" | "viewer"
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
      admin_subrole: [
        "super_admin",
        "org_owner",
        "org_admin",
        "billing_admin",
        "compliance_admin",
        "tech_admin",
      ],
      app_role: [
        "Super Admin",
        "Hospital Admin",
        "RCM Manager",
        "Billing Executive",
        "TPA Coordinator",
        "Front Office",
        "Finance",
        "Auditor",
        "Viewer",
      ],
      claim_status_bucket: [
        "pre_auth",
        "in_progress",
        "query",
        "approved",
        "denied",
        "settled",
        "closed",
      ],
      claim_status_code: [
        "pre_auth_submitted",
        "pre_auth_query",
        "pre_auth_query_replied",
        "pre_auth_approved",
        "pre_auth_denied",
        "discharge_initiated",
        "discharge_query",
        "discharge_query_replied",
        "discharge_approved",
        "discharge_denied",
        "enhancement_submitted",
        "enhancement_query",
        "enhancement_query_replied",
        "enhancement_approved",
        "enhancement_denied",
        "claim_submitted",
        "claim_query",
        "claim_query_replied",
        "claim_approved",
        "claim_denied",
        "reconsideration_submitted",
        "settlement_initiated",
        "settlement_reminder",
        "settled",
        "rejected",
        "closed",
      ],
      org_role: ["owner", "admin", "manager", "member", "viewer"],
    },
  },
} as const
