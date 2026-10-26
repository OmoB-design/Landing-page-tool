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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_messages: {
        Row: {
          build_id: string
          content: Json
          created_at: string
          created_by: string | null
          id: string
          role: string
        }
        Insert: {
          build_id: string
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          role: string
        }
        Update: {
          build_id?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          bucket: string
          bytes: number
          created_at: string
          height: number | null
          id: string
          mime: string
          org_id: string
          path: string
          sha256: string
          source_url: string | null
          width: number | null
        }
        Insert: {
          bucket?: string
          bytes: number
          created_at?: string
          height?: number | null
          id?: string
          mime: string
          org_id: string
          path: string
          sha256: string
          source_url?: string | null
          width?: number | null
        }
        Update: {
          bucket?: string
          bytes?: number
          created_at?: string
          height?: number | null
          id?: string
          mime?: string
          org_id?: string
          path?: string
          sha256?: string
          source_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          audience: string | null
          brand_context: string | null
          brand_md: string | null
          created_at: string
          created_by: string | null
          cta_text: string | null
          deleted_at: string | null
          emoji: string | null
          favicon_asset_id: string | null
          fonts: Json
          id: string
          language: string
          logo_asset_id: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          next_build_number: number
          org_id: string
          palette: Json
          positioning: string | null
          prefix: string
          promo_text: string | null
          sale_percent: number | null
          support_email: string | null
          tagline: string | null
          updated_at: string
          url: string | null
          usp_icons: Json
          voice: string | null
          voice_examples: string[]
        }
        Insert: {
          audience?: string | null
          brand_context?: string | null
          brand_md?: string | null
          created_at?: string
          created_by?: string | null
          cta_text?: string | null
          deleted_at?: string | null
          emoji?: string | null
          favicon_asset_id?: string | null
          fonts?: Json
          id?: string
          language?: string
          logo_asset_id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          next_build_number?: number
          org_id: string
          palette?: Json
          positioning?: string | null
          prefix: string
          promo_text?: string | null
          sale_percent?: number | null
          support_email?: string | null
          tagline?: string | null
          updated_at?: string
          url?: string | null
          usp_icons?: Json
          voice?: string | null
          voice_examples?: string[]
        }
        Update: {
          audience?: string | null
          brand_context?: string | null
          brand_md?: string | null
          created_at?: string
          created_by?: string | null
          cta_text?: string | null
          deleted_at?: string | null
          emoji?: string | null
          favicon_asset_id?: string | null
          fonts?: Json
          id?: string
          language?: string
          logo_asset_id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          next_build_number?: number
          org_id?: string
          palette?: Json
          positioning?: string | null
          prefix?: string
          promo_text?: string | null
          sale_percent?: number | null
          support_email?: string | null
          tagline?: string | null
          updated_at?: string
          url?: string | null
          usp_icons?: Json
          voice?: string | null
          voice_examples?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "brands_favicon_asset_id_fkey"
            columns: ["favicon_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      build_snapshots: {
        Row: {
          build_id: string
          created_at: string
          created_by: string | null
          html_path: string
          id: string
          reason: string
          seq: number
        }
        Insert: {
          build_id: string
          created_at?: string
          created_by?: string | null
          html_path: string
          id?: string
          reason: string
          seq: number
        }
        Update: {
          build_id?: string
          created_at?: string
          created_by?: string | null
          html_path?: string
          id?: string
          reason?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "build_snapshots_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      builds: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          cost_usd: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          export_html_path: string | null
          id: string
          key: string
          mock_images: boolean
          org_id: string
          origin: Database["public"]["Enums"]["template_origin"]
          page_version: number
          parent_build_id: string | null
          product_id: string
          report: Json
          status: Database["public"]["Enums"]["build_status"]
          targeting: Json
          template_id: string
          template_version: number
          title: string
          updated_at: string
          wizard: Json
          working_html_path: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          export_html_path?: string | null
          id?: string
          key: string
          mock_images?: boolean
          org_id: string
          origin: Database["public"]["Enums"]["template_origin"]
          page_version?: number
          parent_build_id?: string | null
          product_id: string
          report?: Json
          status?: Database["public"]["Enums"]["build_status"]
          targeting?: Json
          template_id: string
          template_version: number
          title: string
          updated_at?: string
          wizard: Json
          working_html_path?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          export_html_path?: string | null
          id?: string
          key?: string
          mock_images?: boolean
          org_id?: string
          origin?: Database["public"]["Enums"]["template_origin"]
          page_version?: number
          parent_build_id?: string | null
          product_id?: string
          report?: Json
          status?: Database["public"]["Enums"]["build_status"]
          targeting?: Json
          template_id?: string
          template_version?: number
          title?: string
          updated_at?: string
          wizard?: Json
          working_html_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builds_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_parent_build_id_fkey"
            columns: ["parent_build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      image_versions: {
        Row: {
          asset_id: string | null
          build_id: string
          created_at: string
          id: string
          is_current: boolean
          prompt: string | null
          seq: number
          slot: number
          source: Database["public"]["Enums"]["image_source"]
        }
        Insert: {
          asset_id?: string | null
          build_id: string
          created_at?: string
          id?: string
          is_current?: boolean
          prompt?: string | null
          seq: number
          slot: number
          source: Database["public"]["Enums"]["image_source"]
        }
        Update: {
          asset_id?: string | null
          build_id?: string
          created_at?: string
          id?: string
          is_current?: boolean
          prompt?: string | null
          seq?: number
          slot?: number
          source?: Database["public"]["Enums"]["image_source"]
        }
        Relationships: [
          {
            foreignKeyName: "image_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_versions_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["integration_kind"]
          meta: Json
          org_id: string
          token_last4: string | null
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["integration_kind"]
          meta?: Json
          org_id: string
          token_last4?: string | null
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["integration_kind"]
          meta?: Json
          org_id?: string
          token_last4?: string | null
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          data: Json | null
          id: number
          job_id: string
          level: Database["public"]["Enums"]["event_level"]
          message: string
          node: string | null
          org_id: string
          ts: string
        }
        Insert: {
          data?: Json | null
          id?: number
          job_id: string
          level?: Database["public"]["Enums"]["event_level"]
          message: string
          node?: string | null
          org_id: string
          ts?: string
        }
        Update: {
          data?: Json | null
          id?: number
          job_id?: string
          level?: Database["public"]["Enums"]["event_level"]
          message?: string
          node?: string | null
          org_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          build_id: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          error: Json | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          org_id: string
          payload: Json
          queue: string
          result: Json | null
          run_after: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempts?: number
          build_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          error?: Json | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          org_id: string
          payload?: Json
          queue?: string
          result?: Json | null
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempts?: number
          build_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          error?: Json | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          org_id?: string
          payload?: Json
          queue?: string
          result?: Json | null
          run_after?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          build_id: string | null
          cost_usd: number | null
          created_at: string
          id: number
          input_tokens: number | null
          job_id: string | null
          kind: Database["public"]["Enums"]["ledger_kind"]
          model: string
          node: string | null
          org_id: string
          output_tokens: number | null
          provider: string
          units: number | null
        }
        Insert: {
          build_id?: string | null
          cost_usd?: number | null
          created_at?: string
          id?: number
          input_tokens?: number | null
          job_id?: string | null
          kind: Database["public"]["Enums"]["ledger_kind"]
          model: string
          node?: string | null
          org_id: string
          output_tokens?: number | null
          provider: string
          units?: number | null
        }
        Update: {
          build_id?: string | null
          cost_usd?: number | null
          created_at?: string
          id?: number
          input_tokens?: number | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["ledger_kind"]
          model?: string
          node?: string | null
          org_id?: string
          output_tokens?: number | null
          provider?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          build_id: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: string
          org_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          build_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: string
          org_id: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          build_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          org_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          brand_id: string
          expires_at: string
          org_id: string
          shop_domain: string
          state: string
          user_id: string
        }
        Insert: {
          brand_id: string
          expires_at?: string
          org_id: string
          shop_domain: string
          state: string
          user_id: string
        }
        Update: {
          brand_id?: string
          expires_at?: string
          org_id?: string
          shop_domain?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          allow_placeholder_publish: boolean
          clone_terms_accepted_at: string | null
          clone_terms_accepted_by: string | null
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          allow_placeholder_publish?: boolean
          clone_terms_accepted_at?: string | null
          clone_terms_accepted_by?: string | null
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          allow_placeholder_publish?: boolean
          clone_terms_accepted_at?: string | null
          clone_terms_accepted_by?: string | null
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_strategy: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: Database["public"]["Enums"]["strategy_kind"]
          model: string | null
          org_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          kind: Database["public"]["Enums"]["strategy_kind"]
          model?: string | null
          org_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: Database["public"]["Enums"]["strategy_kind"]
          model?: string | null
          org_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_strategy_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_strategy_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string
          created_at: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          handle: string
          id: string
          images: Json
          name: string
          org_id: string
          price: number | null
          pricing_lines: Json
          pull_source: string | null
          pulled_at: string | null
          sale_price: number | null
          selling_context: string | null
          specs: Json
          updated_at: string
          url: string | null
          usps: Json
          variants: Json
        }
        Insert: {
          brand_id: string
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          handle: string
          id?: string
          images?: Json
          name: string
          org_id: string
          price?: number | null
          pricing_lines?: Json
          pull_source?: string | null
          pulled_at?: string | null
          sale_price?: number | null
          selling_context?: string | null
          specs?: Json
          updated_at?: string
          url?: string | null
          usps?: Json
          variants?: Json
        }
        Update: {
          brand_id?: string
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          handle?: string
          id?: string
          images?: Json
          name?: string
          org_id?: string
          price?: number | null
          pricing_lines?: Json
          pull_source?: string | null
          pulled_at?: string | null
          sale_price?: number | null
          selling_context?: string | null
          specs?: Json
          updated_at?: string
          url?: string | null
          usps?: Json
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_org_id: string | null
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_org_id?: string | null
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_org_id?: string | null
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_org_id_fkey"
            columns: ["default_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_locks: {
        Row: {
          created_at: string
          org_id: string
          provider: string
          reason: string
          until: string
        }
        Insert: {
          created_at?: string
          org_id: string
          provider: string
          reason: string
          until: string
        }
        Update: {
          created_at?: string
          org_id?: string
          provider?: string
          reason?: string
          until?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          admin_url: string | null
          build_id: string
          created_at: string
          created_by: string | null
          destination: Database["public"]["Enums"]["publish_dest"]
          details: Json | null
          editor_url: string | null
          gate_overridden: boolean
          id: string
          job_id: string | null
          org_id: string
          override_reasons: Json | null
          status: Database["public"]["Enums"]["publish_status"]
          structure_mode: string | null
          url: string | null
          version: number | null
        }
        Insert: {
          admin_url?: string | null
          build_id: string
          created_at?: string
          created_by?: string | null
          destination: Database["public"]["Enums"]["publish_dest"]
          details?: Json | null
          editor_url?: string | null
          gate_overridden?: boolean
          id?: string
          job_id?: string | null
          org_id: string
          override_reasons?: Json | null
          status?: Database["public"]["Enums"]["publish_status"]
          structure_mode?: string | null
          url?: string | null
          version?: number | null
        }
        Update: {
          admin_url?: string | null
          build_id?: string
          created_at?: string
          created_by?: string | null
          destination?: Database["public"]["Enums"]["publish_dest"]
          details?: Json | null
          editor_url?: string | null
          gate_overridden?: boolean
          id?: string
          job_id?: string | null
          org_id?: string
          override_reasons?: Json | null
          status?: Database["public"]["Enums"]["publish_status"]
          structure_mode?: string | null
          url?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publications_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      store_connections: {
        Row: {
          brand_id: string
          client_id: string
          connected_at: string | null
          created_at: string
          id: string
          org_id: string
          scopes: string | null
          shop_domain: string
          status: string
          token_last4: string | null
          updated_at: string
          vault_secret_id: string
        }
        Insert: {
          brand_id: string
          client_id: string
          connected_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          scopes?: string | null
          shop_domain: string
          status?: string
          token_last4?: string | null
          updated_at?: string
          vault_secret_id: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          connected_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          scopes?: string | null
          shop_domain?: string
          status?: string
          token_last4?: string | null
          updated_at?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          duplicable: boolean
          id: string
          key: string
          label: string
          position: number
          removable: boolean
          role: Database["public"]["Enums"]["section_role"]
          template_id: string
        }
        Insert: {
          duplicable?: boolean
          id?: string
          key: string
          label: string
          position: number
          removable?: boolean
          role?: Database["public"]["Enums"]["section_role"]
          template_id: string
        }
        Update: {
          duplicable?: boolean
          id?: string
          key?: string
          label?: string
          position?: number
          removable?: boolean
          role?: Database["public"]["Enums"]["section_role"]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          html_path: string
          id: string
          reason: string | null
          sections: Json
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          html_path: string
          id?: string
          reason?: string | null
          sections: Json
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          html_path?: string
          id?: string
          reason?: string | null
          sections?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          blueprint: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          editor_map: Json | null
          html_path: string
          id: string
          instructions: Json
          name: string
          org_id: string | null
          origin: Database["public"]["Enums"]["template_origin"]
          parent_template_id: string | null
          platform: string | null
          slug: string
          source_host: string | null
          source_html_path: string | null
          source_name: string | null
          source_palette: Json | null
          source_url: string | null
          status: Database["public"]["Enums"]["template_status"]
          thumb_path: string | null
          type: string
          updated_at: string
          verdict: string | null
          version: number
        }
        Insert: {
          blueprint?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          editor_map?: Json | null
          html_path: string
          id?: string
          instructions?: Json
          name: string
          org_id?: string | null
          origin: Database["public"]["Enums"]["template_origin"]
          parent_template_id?: string | null
          platform?: string | null
          slug: string
          source_host?: string | null
          source_html_path?: string | null
          source_name?: string | null
          source_palette?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          thumb_path?: string | null
          type: string
          updated_at?: string
          verdict?: string | null
          version?: number
        }
        Update: {
          blueprint?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          editor_map?: Json | null
          html_path?: string
          id?: string
          instructions?: Json
          name?: string
          org_id?: string | null
          origin?: Database["public"]["Enums"]["template_origin"]
          parent_template_id?: string | null
          platform?: string | null
          slug?: string
          source_host?: string | null
          source_html_path?: string | null
          source_name?: string | null
          source_palette?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          thumb_path?: string | null
          type?: string
          updated_at?: string
          verdict?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_build_key: { Args: { target_brand: string }; Returns: string }
      is_org_admin: { Args: { target_org: string }; Returns: boolean }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      is_org_member_path: { Args: { object_name: string }; Returns: boolean }
    }
    Enums: {
      build_status:
        | "queued"
        | "building"
        | "needs_review"
        | "approved"
        | "published"
        | "failed"
      event_level: "info" | "warn" | "error"
      image_source:
        | "original"
        | "product"
        | "generated"
        | "edited"
        | "uploaded"
        | "reused"
      integration_kind: "vercel"
      job_status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
      ledger_kind:
        | "copy"
        | "vision"
        | "analysis"
        | "image"
        | "edit"
        | "agent"
        | "other"
      member_role: "owner" | "admin" | "member"
      publish_dest: "export" | "vercel" | "shopify_page" | "shopify_editable"
      publish_status: "pending" | "succeeded" | "failed" | "unpublished"
      section_role:
        | "hero"
        | "problem"
        | "mechanism"
        | "benefits"
        | "ingredients"
        | "social_proof"
        | "testimonials"
        | "comparison"
        | "offer"
        | "guarantee"
        | "faq"
        | "cta"
        | "footer_cta"
        | "other"
      strategy_kind: "briefing" | "angles" | "comparison"
      template_origin: "owned" | "cloned"
      template_status: "active" | "retired" | "analyzing" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      build_status: [
        "queued",
        "building",
        "needs_review",
        "approved",
        "published",
        "failed",
      ],
      event_level: ["info", "warn", "error"],
      image_source: [
        "original",
        "product",
        "generated",
        "edited",
        "uploaded",
        "reused",
      ],
      integration_kind: ["vercel"],
      job_status: ["queued", "running", "succeeded", "failed", "cancelled"],
      ledger_kind: [
        "copy",
        "vision",
        "analysis",
        "image",
        "edit",
        "agent",
        "other",
      ],
      member_role: ["owner", "admin", "member"],
      publish_dest: ["export", "vercel", "shopify_page", "shopify_editable"],
      publish_status: ["pending", "succeeded", "failed", "unpublished"],
      section_role: [
        "hero",
        "problem",
        "mechanism",
        "benefits",
        "ingredients",
        "social_proof",
        "testimonials",
        "comparison",
        "offer",
        "guarantee",
        "faq",
        "cta",
        "footer_cta",
        "other",
      ],
      strategy_kind: ["briefing", "angles", "comparison"],
      template_origin: ["owned", "cloned"],
      template_status: ["active", "retired", "analyzing", "failed"],
    },
  },
} as const
