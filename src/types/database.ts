/**
 * Auto-generated types for Supabase.
 *
 * Once you have the Supabase CLI installed and logged in, regenerate with:
 *   npx supabase gen types typescript --project-id duqayqktljywufgxobbl --schema public > src/types/database.ts
 *
 * For now these are hand-crafted to match the migrations.
 * NOTE: Relationships is required by supabase-js v2 GenericTable constraint.
 *
 * Last updated: migration 042_trainer_relationships
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {

      product_events: {
        Row: {
          id: string
          occurred_at: string
          event_name: string
          anonymous_id: string
          user_id: string | null
          locale: 'es' | 'en' | null
          path: string | null
          properties: Json
        }
        Insert: {
          id?: string
          occurred_at?: string
          event_name: string
          anonymous_id: string
          user_id?: string | null
          locale?: 'es' | 'en' | null
          path?: string | null
          properties?: Json
        }
        Update: Record<string, never>
        Relationships: []
      }

      product_notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string
          url: string | null
          payload: Json
          dedupe_key: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body: string
          url?: string | null
          payload?: Json
          dedupe_key: string
          read_at?: string | null
          created_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          type: string
          title: string
          body: string
          url: string | null
          payload: Json
          dedupe_key: string
          read_at: string | null
          created_at: string
        }>
        Relationships: []
      }

      product_push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id: string
          enabled: boolean
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id: string
          enabled?: boolean
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id: string
          enabled: boolean
          last_seen_at: string
          created_at: string
          updated_at: string
        }>
        Relationships: []
      }

      product_notification_preferences: {
        Row: {
          user_id: string
          professional_enabled: boolean
          push_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          professional_enabled?: boolean
          push_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          user_id: string
          professional_enabled: boolean
          push_enabled: boolean
          created_at: string
          updated_at: string
        }>
        Relationships: []
      }

      professional_audit_logs: {
        Row: {
          id: string
          actor_user_id: string | null
          subject_user_id: string | null
          entity_type: string
          entity_id: string | null
          action: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id?: string | null
          subject_user_id?: string | null
          entity_type: string
          entity_id?: string | null
          action: string
          metadata?: Json
          created_at?: string
        }
        Update: Partial<{
          id: string
          actor_user_id: string | null
          subject_user_id: string | null
          entity_type: string
          entity_id: string | null
          action: string
          metadata: Json
          created_at: string
        }>
        Relationships: []
      }

      trainer_applications: {
        Row: {
          id: string
          user_id: string
          application_kind: 'initial' | 'profile_update'
          source_profile_id: string | null
          credential_source_application_id: string | null
          status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn'
          professional_name: string
          professional_photo_url: string | null
          bio: string
          specialties: string[]
          modalities: Array<'online' | 'in_person' | 'hybrid'>
          experience_summary: string
          general_location: string | null
          languages: string[]
          contact_email: string
          contact_phone: string | null
          preferred_contact: 'email' | 'phone' | 'whatsapp'
          timezone: string
          interview_availability: string
          submitted_at: string | null
          decided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          application_kind?: 'initial' | 'profile_update'
          source_profile_id?: string | null
          credential_source_application_id?: string | null
          status?: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn'
          professional_name?: string
          professional_photo_url?: string | null
          bio?: string
          specialties?: string[]
          modalities?: Array<'online' | 'in_person' | 'hybrid'>
          experience_summary?: string
          general_location?: string | null
          languages?: string[]
          contact_email?: string
          contact_phone?: string | null
          preferred_contact?: 'email' | 'phone' | 'whatsapp'
          timezone?: string
          interview_availability?: string
          submitted_at?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_applications']['Insert']>
        Relationships: []
      }

      trainer_application_credentials: {
        Row: {
          id: string
          application_id: string
          credential_type: 'document' | 'link'
          title: string
          issuer: string | null
          issued_on: string | null
          expires_on: string | null
          storage_path: string | null
          external_url: string | null
          mime_type: 'application/pdf' | 'image/jpeg' | 'image/png' | null
          size_bytes: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          credential_type: 'document' | 'link'
          title: string
          issuer?: string | null
          issued_on?: string | null
          expires_on?: string | null
          storage_path?: string | null
          external_url?: string | null
          mime_type?: 'application/pdf' | 'image/jpeg' | 'image/png' | null
          size_bytes?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_application_credentials']['Insert']>
        Relationships: []
      }

      trainer_credential_storage_cleanup: {
        Row: {
          id: string
          user_id: string
          application_id: string
          credential_id: string
          storage_path: string
          reason: 'upload_rollback' | 'user_removal'
          attempt_count: number
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          application_id: string
          credential_id: string
          storage_path: string
          reason: 'upload_rollback' | 'user_removal'
          attempt_count?: number
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_credential_storage_cleanup']['Insert']>
        Relationships: []
      }

      trainer_application_events: {
        Row: {
          id: string
          application_id: string
          from_status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn' | null
          to_status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn'
          public_note: string | null
          internal_note: string | null
          actor_user_id: string | null
          actor_role: 'applicant' | 'admin' | 'system'
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          from_status?: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn' | null
          to_status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn'
          public_note?: string | null
          internal_note?: string | null
          actor_user_id?: string | null
          actor_role: 'applicant' | 'admin' | 'system'
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }

      trainer_interviews: {
        Row: {
          id: string
          application_id: string
          proposed_at: string
          timezone: string
          medium: 'video_call' | 'phone' | 'in_person'
          external_url: string | null
          status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
          outcome: string | null
          public_note: string | null
          internal_note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          proposed_at: string
          timezone: string
          medium: 'video_call' | 'phone' | 'in_person'
          external_url?: string | null
          status?: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
          outcome?: string | null
          public_note?: string | null
          internal_note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_interviews']['Insert']>
        Relationships: []
      }

      trainer_profiles: {
        Row: {
          id: string
          user_id: string
          source_application_id: string
          slug: string
          status: 'active' | 'suspended' | 'inactive'
          professional_name: string
          professional_photo_url: string | null
          bio: string
          specialties: string[]
          modalities: Array<'online' | 'in_person' | 'hybrid'>
          experience_summary: string
          general_location: string | null
          languages: string[]
          verified_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source_application_id: string
          slug: string
          status?: 'active' | 'suspended' | 'inactive'
          professional_name: string
          professional_photo_url?: string | null
          bio: string
          specialties?: string[]
          modalities?: Array<'online' | 'in_person' | 'hybrid'>
          experience_summary: string
          general_location?: string | null
          languages?: string[]
          verified_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_profiles']['Insert']>
        Relationships: []
      }

      trainer_service_offerings: {
        Row: {
          id: string
          trainer_profile_id: string
          name: string
          description: string
          modality: 'online' | 'in_person' | 'hybrid'
          duration_minutes: number
          content: string
          capacity: number
          is_active: boolean
          billing_mode: 'free_preview'
          price_minor: number | null
          currency: string | null
          billing_interval: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trainer_profile_id: string
          name: string
          description?: string
          modality: 'online' | 'in_person' | 'hybrid'
          duration_minutes: number
          content?: string
          capacity?: number
          is_active?: boolean
          billing_mode?: 'free_preview'
          price_minor?: null
          currency?: null
          billing_interval?: null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trainer_service_offerings']['Insert']>
        Relationships: []
      }

      coaching_requests: {
        Row: {
          id: string
          service_id: string
          trainer_user_id: string
          client_user_id: string
          message: string
          training_profile_consent_version: string
          idempotency_key: string
          status: 'pending' | 'accepted' | 'declined' | 'cancelled'
          decided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          service_id: string
          trainer_user_id: string
          client_user_id: string
          message?: string
          training_profile_consent_version: string
          idempotency_key?: string
          status?: 'pending' | 'accepted' | 'declined' | 'cancelled'
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['coaching_requests']['Insert']>
        Relationships: []
      }

      coaching_relationships: {
        Row: {
          id: string
          source_request_id: string | null
          service_id: string
          trainer_user_id: string
          client_user_id: string
          status: 'active' | 'paused_by_platform' | 'ended'
          started_at: string
          paused_at: string | null
          ended_at: string | null
          ended_by: string | null
          end_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_request_id?: string | null
          service_id: string
          trainer_user_id: string
          client_user_id: string
          status?: 'active' | 'paused_by_platform' | 'ended'
          started_at?: string
          paused_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          end_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['coaching_relationships']['Insert']>
        Relationships: []
      }

      coaching_consents: {
        Row: {
          id: string
          relationship_id: string
          scope: 'training_profile' | 'body_measurements'
          text_version: string
          granted_at: string
          revoked_at: string | null
          granted_by: string
          revoked_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          relationship_id: string
          scope: 'training_profile' | 'body_measurements'
          text_version: string
          granted_at?: string
          revoked_at?: string | null
          granted_by: string
          revoked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['coaching_consents']['Insert']>
        Relationships: []
      }

      // ─── profiles ─────────────────────────────────────────────────────────

      profiles: {
        Row: {
          id: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          height_cm: number | null
          weight_kg: number | null
          date_of_birth: string | null
          gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
          fitness_level: 'beginner' | 'intermediate' | 'advanced' | null
          primary_goal: 'lose_weight' | 'build_muscle' | 'improve_endurance' | 'stay_active' | 'other' | 'gain_strength' | null
          days_per_week: number | null
          session_duration_minutes: number | null
          gym_type: 'home_no_equipment' | 'home_basic' | 'full_gym' | null
          available_equipment: string[]
          injuries: string | null
          cardio_preferences: ('walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope')[]
          activity_level: 'inactive' | 'insufficiently_active' | 'regularly_active'
          readiness_status: 'pending' | 'cleared' | 'modified' | 'professional_clearance_required'
          readiness_answers: Json
          movement_limitations: Json
          readiness_version: string | null
          readiness_completed_at: string | null
          preferred_workout_days: number[] | null   // migration 004 — 1=lunes…7=domingo
          onboarding_done: boolean
          timezone: string | null                    // migration 016 — IANA, null = zona de la app
          last_check_in_at: string | null            // migration 017 — último check-in de perfil
          is_private: boolean                        // migration 024 — cuenta privada
          post_count: number                          // migration 024 — contador de posts (trigger)
          subscription_tier: 'free' | 'pro'
          is_admin: boolean
          account_status: 'active' | 'suspended'
          suspension_reason: string | null
          suspended_at: string | null
          suspended_until: string | null
          suspended_by: string | null
          language: 'es' | 'en'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          date_of_birth?: string | null
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null
          primary_goal?: 'lose_weight' | 'build_muscle' | 'improve_endurance' | 'stay_active' | 'other' | 'gain_strength' | null
          days_per_week?: number | null
          session_duration_minutes?: number | null
          gym_type?: 'home_no_equipment' | 'home_basic' | 'full_gym' | null
          available_equipment?: string[]
          injuries?: string | null
          cardio_preferences?: ('walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope')[]
          activity_level?: 'inactive' | 'insufficiently_active' | 'regularly_active'
          readiness_status?: 'pending' | 'cleared' | 'modified' | 'professional_clearance_required'
          readiness_answers?: Json
          movement_limitations?: Json
          readiness_version?: string | null
          readiness_completed_at?: string | null
          preferred_workout_days?: number[] | null
          onboarding_done?: boolean
          timezone?: string | null
          last_check_in_at?: string | null
          is_private?: boolean
          post_count?: number
          subscription_tier?: 'free' | 'pro'
          is_admin?: boolean
          account_status?: 'active' | 'suspended'
          suspension_reason?: string | null
          suspended_at?: string | null
          suspended_until?: string | null
          suspended_by?: string | null
          language?: 'es' | 'en'
        }
        Update: {
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          date_of_birth?: string | null
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
          fitness_level?: 'beginner' | 'intermediate' | 'advanced' | null
          primary_goal?: 'lose_weight' | 'build_muscle' | 'improve_endurance' | 'stay_active' | 'other' | 'gain_strength' | null
          days_per_week?: number | null
          session_duration_minutes?: number | null
          gym_type?: 'home_no_equipment' | 'home_basic' | 'full_gym' | null
          available_equipment?: string[]
          injuries?: string | null
          cardio_preferences?: ('walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope')[]
          activity_level?: 'inactive' | 'insufficiently_active' | 'regularly_active'
          readiness_status?: 'pending' | 'cleared' | 'modified' | 'professional_clearance_required'
          readiness_answers?: Json
          movement_limitations?: Json
          readiness_version?: string | null
          readiness_completed_at?: string | null
          preferred_workout_days?: number[] | null
          onboarding_done?: boolean
          timezone?: string | null
          last_check_in_at?: string | null
          subscription_tier?: 'free' | 'pro'
          is_admin?: boolean
          account_status?: 'active' | 'suspended'
          suspension_reason?: string | null
          suspended_at?: string | null
          suspended_until?: string | null
          suspended_by?: string | null
          language?: 'es' | 'en'
        }
        Relationships: []
      }

      admin_audit_logs: {
        Row: {
          id: string
          admin_user_id: string | null
          target_user_id: string | null
          action: string
          reason: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          admin_user_id?: string | null
          target_user_id?: string | null
          action: string
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: never
        Relationships: []
      }

      // ─── exercises ────────────────────────────────────────────────────────

      dashboard_banners: {
        Row: {
          slot: 'dashboard-primary'
          kind: 'announcement' | 'event' | 'promotion' | 'info'
          title: string
          description: string | null
          image_url: string | null
          cta_label: string | null
          cta_href: string | null
          status: 'draft' | 'active' | 'paused'
          starts_on: string | null
          ends_on: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          slot?: 'dashboard-primary'
          kind?: 'announcement' | 'event' | 'promotion' | 'info'
          title: string
          description?: string | null
          image_url?: string | null
          cta_label?: string | null
          cta_href?: string | null
          status?: 'draft' | 'active' | 'paused'
          starts_on?: string | null
          ends_on?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['dashboard_banners']['Insert']>
        Relationships: []
      }

      exercises: {
        Row: {
          id: string
          wger_id: number | null
          name: string
          name_es: string | null
          description: string | null
          description_es: string | null
          muscle_groups: string[]
          equipment: string[]
          equipment_es: string[] | null
          muscle_groups_es: string[] | null
          difficulty: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound: boolean
          instructions: string | null
          instructions_es: string | null
          video_url: string | null
          image_url: string | null
          is_public: boolean
          source: string | null
          external_id: string | null
          movement_patterns: string[]
          cardio_modality: 'walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope' | null
          impact_level: 'low' | 'moderate' | 'high' | null
          joint_stress_tags: string[]
          created_at: string
        }
        Insert: {
          id?: string
          wger_id?: number | null
          name: string
          name_es?: string | null
          description?: string | null
          description_es?: string | null
          muscle_groups?: string[]
          equipment?: string[]
          equipment_es?: string[] | null
          muscle_groups_es?: string[] | null
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type?: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound?: boolean
          instructions?: string | null
          instructions_es?: string | null
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
          source?: string | null
          external_id?: string | null
          movement_patterns?: string[]
          cardio_modality?: 'walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope' | null
          impact_level?: 'low' | 'moderate' | 'high' | null
          joint_stress_tags?: string[]
        }
        Update: {
          wger_id?: number | null
          name?: string
          name_es?: string | null
          description?: string | null
          description_es?: string | null
          muscle_groups?: string[]
          equipment?: string[]
          equipment_es?: string[] | null
          muscle_groups_es?: string[] | null
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type?: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound?: boolean
          instructions?: string | null
          instructions_es?: string | null
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
          source?: string | null
          external_id?: string | null
          movement_patterns?: string[]
          cardio_modality?: 'walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope' | null
          impact_level?: 'low' | 'moderate' | 'high' | null
          joint_stress_tags?: string[]
        }
        Relationships: []
      }

      // ─── workout_plans ────────────────────────────────────────────────────

      workout_plans: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          goal: string | null
          duration_weeks: number | null
          days_per_week: number | null
          difficulty: 'beginner' | 'intermediate' | 'advanced' | null
          is_active: boolean
          generated_by_ai: boolean
          ai_prompt: string | null
          ai_notes: string | null              // migration 004 — mensaje del entrenador IA
          week_number: number                  // migration 008 — semana del ciclo de plan
          plan_context: 'first_plan' | 'weekly_regeneration' | 'manual_update'
          parent_plan_id: string | null
          manually_updated_at: string | null
          source_type: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post'
          generation_metadata: Json
          source_post_id: string | null
          source_user_id: string | null
          family_id: string
          superseded_at: string | null
          retired_at: string | null
          generation_request_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          goal?: string | null
          duration_weeks?: number | null
          days_per_week?: number | null
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          is_active?: boolean
          generated_by_ai?: boolean
          ai_prompt?: string | null
          ai_notes?: string | null
          week_number?: number
          plan_context?: 'first_plan' | 'weekly_regeneration' | 'manual_update'
          parent_plan_id?: string | null
          manually_updated_at?: string | null
          source_type?: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post'
          generation_metadata?: Json
          source_post_id?: string | null
          source_user_id?: string | null
          family_id?: string
          superseded_at?: string | null
          retired_at?: string | null
          generation_request_id?: string | null
        }
        Update: {
          name?: string
          description?: string | null
          goal?: string | null
          duration_weeks?: number | null
          days_per_week?: number | null
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          is_active?: boolean
          generated_by_ai?: boolean
          ai_prompt?: string | null
          ai_notes?: string | null
          week_number?: number
          plan_context?: 'first_plan' | 'weekly_regeneration' | 'manual_update'
          parent_plan_id?: string | null
          manually_updated_at?: string | null
          source_type?: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post'
          generation_metadata?: Json
          source_post_id?: string | null
          source_user_id?: string | null
          family_id?: string
          superseded_at?: string | null
          retired_at?: string | null
          generation_request_id?: string | null
        }
        Relationships: []
      }

      // ─── workouts ─────────────────────────────────────────────────────────

      workouts: {
        Row: {
          id: string
          plan_id: string | null
          user_id: string
          name: string
          day_of_week: number | null
          order_in_plan: number | null
          estimated_duration_minutes: number | null
          notes: string | null
          focus: string | null                 // migration 004 — grupos musculares del día
          created_at: string
        }
        Insert: {
          id?: string
          plan_id?: string | null
          user_id: string
          name: string
          day_of_week?: number | null
          order_in_plan?: number | null
          estimated_duration_minutes?: number | null
          notes?: string | null
          focus?: string | null
        }
        Update: {
          plan_id?: string | null
          name?: string
          day_of_week?: number | null
          order_in_plan?: number | null
          estimated_duration_minutes?: number | null
          notes?: string | null
          focus?: string | null
        }
        Relationships: []
      }

      // ─── workout_exercises ────────────────────────────────────────────────

      workout_exercises: {
        Row: {
          id: string
          workout_id: string
          exercise_id: string
          order_index: number
          sets: number | null
          reps: number | null
          duration_seconds: number | null
          rest_seconds: number | null
          weight_kg: number | null
          notes: string | null
          target_rpe: number | null            // migration 004 — RPE objetivo (1-10)
          weight_suggestion_basis: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null  // migration 004
        }
        Insert: {
          id?: string
          workout_id: string
          exercise_id: string
          order_index?: number
          sets?: number | null
          reps?: number | null
          duration_seconds?: number | null
          rest_seconds?: number | null
          weight_kg?: number | null
          notes?: string | null
          target_rpe?: number | null
          weight_suggestion_basis?: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null
        }
        Update: {
          order_index?: number
          sets?: number | null
          reps?: number | null
          duration_seconds?: number | null
          rest_seconds?: number | null
          weight_kg?: number | null
          notes?: string | null
          target_rpe?: number | null
          weight_suggestion_basis?: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null
        }
        Relationships: []
      }

      // ─── progress_logs ────────────────────────────────────────────────────

      session_authorizations: {
        Row: {
          client_session_id: string
          user_id: string
          workout_id: string
          plan_id: string
          session_context_snapshot: Json
          policy_timezone: string
          policy_date: string
          policy_day_start: string
          policy_day_end: string
          workout_window_start: string
          created_at: string
          expires_at: string
          consumed_at: string | null
          released_at: string | null
        }
        Insert: {
          client_session_id: string
          user_id: string
          workout_id: string
          plan_id: string
          session_context_snapshot: Json
          policy_timezone: string
          policy_date: string
          policy_day_start: string
          policy_day_end: string
          workout_window_start: string
          created_at: string
          expires_at: string
          consumed_at?: string | null
          released_at?: string | null
        }
        Update: {
          client_session_id?: string
          user_id?: string
          workout_id?: string
          plan_id?: string
          session_context_snapshot?: Json
          policy_timezone?: string
          policy_date?: string
          policy_day_start?: string
          policy_day_end?: string
          workout_window_start?: string
          created_at?: string
          expires_at?: string
          consumed_at?: string | null
          released_at?: string | null
        }
        Relationships: []
      }

      progress_logs: {
        Row: {
          id: string
          user_id: string
          client_session_id: string | null
          session_result_snapshot: Json | null
          session_context_snapshot: Json | null
          session_detail_backup: Json | null
          workout_id: string | null
          completed_at: string
          duration_minutes: number | null
          notes: string | null
          mood_rating: number | null
          energy_rating: number | null
        }
        Insert: {
          id?: string
          user_id: string
          client_session_id?: string | null
          session_result_snapshot?: Json | null
          session_context_snapshot?: Json | null
          session_detail_backup?: Json | null
          workout_id?: string | null
          completed_at?: string
          duration_minutes?: number | null
          notes?: string | null
          mood_rating?: number | null
          energy_rating?: number | null
        }
        Update: {
          client_session_id?: string | null
          session_result_snapshot?: Json | null
          session_context_snapshot?: Json | null
          session_detail_backup?: Json | null
          workout_id?: string | null
          duration_minutes?: number | null
          notes?: string | null
          mood_rating?: number | null
          energy_rating?: number | null
        }
        Relationships: []
      }

      // ─── exercise_logs ────────────────────────────────────────────────────

      exercise_logs: {
        Row: {
          id: string
          progress_log_id: string
          exercise_id: string
          sets_completed: number | null
          reps_completed: number[] | null
          weights_kg: number[] | null
          rpe_values: (number | null)[] | null
          duration_seconds: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          progress_log_id: string
          exercise_id: string
          sets_completed?: number | null
          reps_completed?: number[] | null
          weights_kg?: number[] | null
          rpe_values?: (number | null)[] | null
          duration_seconds?: number | null
          notes?: string | null
        }
        Update: {
          sets_completed?: number | null
          reps_completed?: number[] | null
          weights_kg?: number[] | null
          rpe_values?: (number | null)[] | null
          duration_seconds?: number | null
          notes?: string | null
        }
        Relationships: []
      }

      // ─── measurements ─────────────────────────────────────────────────────

      measurements: {
        Row: {
          id: string
          user_id: string
          recorded_at: string
          weight_kg: number | null
          body_fat_percentage: number | null
          muscle_mass_kg: number | null
          chest_cm: number | null
          waist_cm: number | null
          hips_cm: number | null
          arms_cm: number | null
          legs_cm: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          recorded_at?: string
          weight_kg?: number | null
          body_fat_percentage?: number | null
          muscle_mass_kg?: number | null
          chest_cm?: number | null
          waist_cm?: number | null
          hips_cm?: number | null
          arms_cm?: number | null
          legs_cm?: number | null
          notes?: string | null
        }
        Update: {
          recorded_at?: string
          weight_kg?: number | null
          body_fat_percentage?: number | null
          muscle_mass_kg?: number | null
          chest_cm?: number | null
          waist_cm?: number | null
          hips_cm?: number | null
          arms_cm?: number | null
          legs_cm?: number | null
          notes?: string | null
        }
        Relationships: []
      }

      // ─── ai_conversations ─────────────────────────────────────────────────

      ai_conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          context: 'general' | 'workout_plan' | 'nutrition' | 'progress' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          context?: 'general' | 'workout_plan' | 'nutrition' | 'progress' | null
        }
        Update: {
          title?: string
          context?: 'general' | 'workout_plan' | 'nutrition' | 'progress' | null
        }
        Relationships: []
      }

      // ─── ai_messages ──────────────────────────────────────────────────────

      ai_messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          generated_plan_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant'
          content: string
          generated_plan_id?: string | null
        }
        Update: {
          content?: string
          generated_plan_id?: string | null
        }
        Relationships: []
      }

      // ─── ai_usage_logs ────────────────────────────────────────────────────
      // migration 005 — una fila por intento de llamada a Claude (per-attempt)

      ai_usage_logs: {
        Row: {
          id:                    string
          user_id:               string | null          // nullable: ON DELETE SET NULL
          model:                 string
          operation:             'initial_plan_generation' | 'weekly_plan_regeneration' | 'plan_adjustment' | 'coach_chat' | 'other'
          attempt_number:        number                 // 1–5
          input_tokens:          number
          output_tokens:         number
          cache_creation_tokens: number
          cache_read_tokens:     number
          estimated_cost_usd:    number
          latency_ms:            number | null
          success:               boolean
          error_type:            string | null
          error_message:         string | null
          created_at:            string
        }
        Insert: {
          id?:                    string
          user_id?:               string | null
          model:                  string
          operation:              'initial_plan_generation' | 'weekly_plan_regeneration' | 'plan_adjustment' | 'coach_chat' | 'other'
          attempt_number:         number
          input_tokens?:          number
          output_tokens?:         number
          cache_creation_tokens?: number
          cache_read_tokens?:     number
          estimated_cost_usd?:    number
          latency_ms?:            number | null
          success?:               boolean
          error_type?:            string | null
          error_message?:         string | null
        }
        Update: Record<string, never>   // append-only — no se actualiza
        Relationships: []
      }

      // ─── social (migration 019/020) ────────────────────────────────────────

      posts: {
        Row: {
          id: string
          user_id: string
          body: string | null
          photo_urls: string[]
          session_snapshot: Json | null
          routine_snapshot: Json | null
          like_count: number
          comment_count: number
          removed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          body?: string | null
          photo_urls?: string[]
          session_snapshot?: Json | null
          routine_snapshot?: Json | null
          like_count?: number
          comment_count?: number
          removed_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['posts']['Insert']>
        Relationships: []
      }
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string }
        Insert: { post_id: string; user_id: string; created_at?: string }
        Update: Partial<{ post_id: string; user_id: string; created_at: string }>
        Relationships: []
      }
      post_comments: {
        Row: { id: string; post_id: string; user_id: string; body: string; removed_at: string | null; created_at: string }
        Insert: { id?: string; post_id: string; user_id: string; body: string; removed_at?: string | null; created_at?: string }
        Update: Partial<{ id: string; post_id: string; user_id: string; body: string; removed_at: string | null; created_at: string }>
        Relationships: []
      }
      post_reports: {
        Row: { id: string; post_id: string | null; comment_id: string | null; reporter_id: string; reason: string; created_at: string }
        Insert: { id?: string; post_id?: string | null; comment_id?: string | null; reporter_id: string; reason: string; created_at?: string }
        Update: Partial<{ id: string; post_id: string | null; comment_id: string | null; reporter_id: string; reason: string; created_at: string }>
        Relationships: []
      }
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string }
        Insert: { blocker_id: string; blocked_id: string; created_at?: string }
        Update: Partial<{ blocker_id: string; blocked_id: string; created_at: string }>
        Relationships: []
      }
      // Vista de solo lectura (se trata como tabla para tipado de queries):
      public_profiles: {
        Row: { id: string; username: string | null; full_name: string | null; avatar_url: string | null; is_private: boolean; post_count: number }
        Insert: never
        Update: never
        Relationships: []
      }
      follows: {
        Row: { follower_id: string; following_id: string; status: 'accepted' | 'pending'; created_at: string }
        Insert: { follower_id: string; following_id: string; status?: 'accepted' | 'pending'; created_at?: string }
        Update: Partial<{ follower_id: string; following_id: string; status: 'accepted' | 'pending'; created_at: string }>
        Relationships: []
      }
      social_push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id: string | null
          enabled: boolean
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id?: string | null
          enabled?: boolean
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          token: string
          platform: 'android' | 'ios'
          device_id: string | null
          enabled: boolean
          last_seen_at: string
          created_at: string
          updated_at: string
        }>
        Relationships: []
      }
      social_notification_preferences: {
        Row: {
          user_id: string
          likes_enabled: boolean
          comments_enabled: boolean
          follows_enabled: boolean
          follow_requests_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          likes_enabled?: boolean
          comments_enabled?: boolean
          follows_enabled?: boolean
          follow_requests_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          user_id: string
          likes_enabled: boolean
          comments_enabled: boolean
          follows_enabled: boolean
          follow_requests_enabled: boolean
          created_at: string
          updated_at: string
        }>
        Relationships: []
      }

    }

    Views: {
      active_trainer_directory: {
        Row: {
          user_id: string
          slug: string
          professional_name: string
          professional_photo_url: string | null
          bio: string
          specialties: string[]
          modalities: Array<'online' | 'in_person' | 'hybrid'>
          experience_summary: string
          general_location: string | null
          languages: string[]
          verified_at: string
          directory_search: string
          specialties_search: string
          languages_search: string
          active_services: Json
        }
        Relationships: []
      }
      trainer_application_events_public: {
        Row: {
          id: string
          application_id: string
          from_status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn' | null
          to_status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required' | 'approved' | 'rejected' | 'withdrawn'
          public_note: string | null
          actor_user_id: string | null
          actor_role: 'applicant' | 'admin' | 'system'
          created_at: string
        }
        Relationships: []
      }
      trainer_interviews_applicant_public: {
        Row: {
          id: string
          application_id: string
          proposed_at: string
          timezone: string
          medium: 'video_call' | 'phone' | 'in_person'
          external_url: string | null
          status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
          public_note: string | null
          created_at: string
          updated_at: string
        }
        Relationships: []
      }
      [name: string]: {
        Row: Record<string, unknown>
        Relationships: []
      }
    }
    Functions: {
      [name: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      has_active_coaching_scope: {
        Args: {
          p_trainer_id: string
          p_client_id: string
          p_scope: string
        }
        Returns: boolean
      }
      create_coaching_request: {
        Args: { service_id: string; message: string; consent_version: string; idempotency_key: string }
        Returns: { request_id: string; created: boolean }[]
      }
      cancel_coaching_request: {
        Args: { p_request_id: string }
        Returns: { request_id: string }[]
      }
      get_requestable_trainer_services: {
        Args: { trainer_slug: string }
        Returns: Array<{ service_id: string; name: string; description: string; modality: string; duration_minutes: number; content: string }>
      }
      create_engine_plan_v2: {
        Args: {
          p_plan: Json
          p_metadata: Json
          p_week_number: number
          p_plan_context: 'first_plan' | 'weekly_regeneration' | 'manual_update'
          p_expected_parent_plan_id: string | null
          p_generation_request_id: string
          p_profile_updates?: Json
        }
        Returns: string
      }
      create_product_notification: {
        Args: {
          p_user_id: string
          p_type: string
          p_title: string
          p_body: string
          p_url: string | null
          p_dedupe_key: string
          p_payload?: Json
        }
        Returns: {
          id: string
          user_id: string
          type: string
          title: string
          body: string
          url: string | null
          payload: Json
          dedupe_key: string
          read_at: string | null
          created_at: string
        }
      }
      submit_trainer_application: {
        Args: {
          p_application_id: string
        }
        Returns: Json
      }
      save_trainer_application_draft: {
        Args: {
          p_payload: Json
        }
        Returns: Json
      }
      save_trainer_profile_changes: {
        Args: {
          p_payload: Json
        }
        Returns: Json
      }
      create_trainer_application_credential: {
        Args: {
          p_credential_id: string
          p_application_id: string
          p_credential_type: 'document' | 'link'
          p_title: string
          p_issuer: string | null
          p_issued_on: string | null
          p_expires_on: string | null
          p_external_url: string | null
          p_mime_type: 'application/pdf' | 'image/jpeg' | 'image/png' | null
          p_size_bytes: number | null
        }
        Returns: Json
      }
      queue_trainer_credential_cleanup: {
        Args: {
          p_application_id: string
          p_credential_id: string
          p_storage_path: string
        }
        Returns: Json
      }
      prepare_trainer_credential_removal: {
        Args: {
          p_application_id: string
          p_credential_id: string
        }
        Returns: Json
      }
      list_trainer_credential_cleanup: {
        Args: Record<string, never>
        Returns: Array<{ id: string; storage_path: string }>
      }
      record_trainer_credential_cleanup_failure: {
        Args: { p_cleanup_id: string; p_error: string }
        Returns: boolean
      }
      finalize_trainer_credential_cleanup: {
        Args: { p_cleanup_id: string }
        Returns: boolean
      }
      withdraw_trainer_application: {
        Args: {
          p_application_id: string
        }
        Returns: Json
      }
      activate_plan_version: {
        Args: {
          p_plan_id: string
        }
        Returns: string
      }
      retire_plan_family: {
        Args: {
          p_plan_id: string
        }
        Returns: string | null
      }
      create_manual_plan_atomic: {
        Args: {
          p_plan: Json
          p_workouts: Json
          p_make_active?: boolean
        }
        Returns: string
      }
      clone_plan_from_post_atomic: {
        Args: {
          p_post_id: string
        }
        Returns: string
      }
      set_subscription_tier_atomic: {
        Args: {
          p_user_id: string
          p_subscription_tier: 'free' | 'pro'
        }
        Returns: string
      }
      save_session_log_atomic: {
        Args: {
          p_client_session_id: string
          p_workout_id: string
          p_completed_at: string
          p_duration_minutes: number
          p_mood_rating: number | null
          p_exercise_logs: Json
          p_result_snapshot: Json
        }
        Returns: Array<{
          progress_log_id: string
          inserted: boolean
          result_snapshot: Json
        }>
      }
      authorize_session_start: {
        Args: {
          p_client_session_id: string
          p_workout_id: string
        }
        Returns: Json
      }
      save_session_log_atomic_v2: {
        Args: {
          p_client_session_id: string
          p_workout_id: string
          p_completed_at: string
          p_duration_minutes: number
          p_mood_rating: number | null
          p_exercise_logs: Json
          p_result_snapshot: Json
        }
        Returns: Array<{
          progress_log_id: string
          inserted: boolean
          result_snapshot: Json
        }>
      }
      get_dashboard_payload: {
        Args: {
          p_week_start: string
          p_recent_start: string
        }
        Returns: {
          active_plan: {
            id: string
            name: string
            ai_notes: string | null
            created_at: string
            week_number: number
            plan_context: 'first_plan' | 'weekly_regeneration' | 'manual_update'
            days_per_week: number | null
            duration_weeks: number | null
            difficulty: 'beginner' | 'intermediate' | 'advanced' | null
            goal: string | null
          } | null
          workouts: {
            id: string
            name: string
            focus: string | null
            day_of_week: number | null
            order_in_plan: number | null
            estimated_duration_minutes: number | null
            exercise_count: number
          }[]
          recent_logs: {
            id: string
            workout_id: string | null
            completed_at: string
            duration_minutes: number | null
            session_context_snapshot: Json | null
            workout: {
              name: string
              focus: string | null
            } | null
          }[]
          week_logs: {
            id: string
            workout_id: string | null
            completed_at: string
            duration_minutes: number | null
            session_context_snapshot: Json | null
            workout: {
              name: string
              focus: string | null
            } | null
          }[]
          week_volume_kg: number | string
          has_completed_sessions: boolean
        }
      }
      get_history_payload: {
        Args: {
          p_limit?: number | null
        }
        Returns: {
          session_logs: {
            id: string
            workout_id: string | null
            completed_at: string
            duration_minutes: number | null
            mood_rating: number | null
            session_context_snapshot: Json | null
            workout: {
              name: string
              focus: string | null
            } | null
          }[]
          exercise_logs: {
            progress_log_id: string
            exercise_id: string | null
            weights_kg: number[] | null
            reps_completed: number[] | null
            exercise: {
              name: string
              muscle_groups: string[] | null
              is_compound: boolean | null
            } | null
          }[]
        }
      }
      get_calendar_payload: {
        Args: {
          p_time_zone?: string
          p_from?: string | null
        }
        Returns: {
          date: string
          sessions: number
          duration_min: number
          volume_kg: number | string
          log_ids: string[]
        }[]
      }
      get_exercise_detail_payload: {
        Args: {
          p_exercise_id: string
        }
        Returns: {
          exercise: {
            id: string
            name: string
            description: string | null
            muscle_groups: string[] | null
            equipment: string[] | null
            difficulty: string | null
            exercise_type: string | null
            is_compound: boolean | null
            instructions: string | null
            video_url: string | null
            image_url: string | null
          } | null
          logs: {
            id: string
            progress_log_id: string
            sets_completed: number | null
            reps_completed: number[] | null
            weights_kg: number[] | null
            rpe_values: (number | null)[] | null
            notes: string | null
            progress_log: {
              id: string
              workout_id: string | null
              completed_at: string
              duration_minutes: number | null
              mood_rating: number | null
              session_context_snapshot: Json | null
            } | null
          }[]
          workouts: {
            id: string
            name: string
            focus: string | null
          }[]
        }
      }
    }
    Enums: Record<string, string[]>
  }
}

// ─── Convenience row types ────────────────────────────────────────────────────

export type Profile         = Database['public']['Tables']['profiles']['Row']
export type Exercise        = Database['public']['Tables']['exercises']['Row']
export type WorkoutPlan     = Database['public']['Tables']['workout_plans']['Row']
export type Workout         = Database['public']['Tables']['workouts']['Row']
export type WorkoutExercise = Database['public']['Tables']['workout_exercises']['Row']
export type SessionAuthorization = Database['public']['Tables']['session_authorizations']['Row']
export type ProgressLog     = Database['public']['Tables']['progress_logs']['Row']
export type ExerciseLog     = Database['public']['Tables']['exercise_logs']['Row']
export type Measurement     = Database['public']['Tables']['measurements']['Row']
export type AiConversation  = Database['public']['Tables']['ai_conversations']['Row']
export type AiMessage       = Database['public']['Tables']['ai_messages']['Row']
export type AiUsageLog      = Database['public']['Tables']['ai_usage_logs']['Row']
export type TrainerApplication = Database['public']['Tables']['trainer_applications']['Row']
export type TrainerApplicationCredential = Database['public']['Tables']['trainer_application_credentials']['Row']
export type TrainerApplicationEvent = Database['public']['Tables']['trainer_application_events']['Row']
export type TrainerInterview = Database['public']['Tables']['trainer_interviews']['Row']
export type TrainerProfile = Database['public']['Tables']['trainer_profiles']['Row']
export type TrainerServiceOffering = Database['public']['Tables']['trainer_service_offerings']['Row']
export type CoachingRequest = Database['public']['Tables']['coaching_requests']['Row']
export type CoachingRelationship = Database['public']['Tables']['coaching_relationships']['Row']
export type CoachingConsent = Database['public']['Tables']['coaching_consents']['Row']

// ─── Enum convenience types (migrations 004–005) ──────────────────────────────

export type WeightSuggestionBasis =
  | 'user_baseline_pending'
  | 'estimated_from_profile'
  | 'based_on_previous_logs'

export type GymType      = NonNullable<Profile['gym_type']>
export type FitnessLevel = NonNullable<Profile['fitness_level']>
export type PrimaryGoal  = NonNullable<Profile['primary_goal']>
export type Difficulty   = NonNullable<WorkoutPlan['difficulty']>
