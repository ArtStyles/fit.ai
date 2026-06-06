/**
 * Auto-generated types for Supabase.
 *
 * Once you have the Supabase CLI installed and logged in, regenerate with:
 *   npx supabase gen types typescript --project-id duqayqktljywufgxobbl --schema public > src/types/database.ts
 *
 * For now these are hand-crafted to match the migrations.
 * NOTE: Relationships is required by supabase-js v2 GenericTable constraint.
 *
 * Last updated: migration 011_history_and_exercise_payloads
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {

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
          preferred_workout_days: number[] | null   // migration 004 — 1=lunes…7=domingo
          onboarding_done: boolean
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
          preferred_workout_days?: number[] | null
          onboarding_done?: boolean
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
          preferred_workout_days?: number[] | null
          onboarding_done?: boolean
        }
        Relationships: []
      }

      // ─── exercises ────────────────────────────────────────────────────────

      exercises: {
        Row: {
          id: string
          wger_id: number | null
          name: string
          description: string | null
          muscle_groups: string[]
          equipment: string[]
          difficulty: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound: boolean
          instructions: string | null
          video_url: string | null
          image_url: string | null
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          wger_id?: number | null
          name: string
          description?: string | null
          muscle_groups?: string[]
          equipment?: string[]
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type?: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound?: boolean
          instructions?: string | null
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
        }
        Update: {
          wger_id?: number | null
          name?: string
          description?: string | null
          muscle_groups?: string[]
          equipment?: string[]
          difficulty?: 'beginner' | 'intermediate' | 'advanced' | null
          exercise_type?: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit' | null
          is_compound?: boolean
          instructions?: string | null
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
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

      progress_logs: {
        Row: {
          id: string
          user_id: string
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
          workout_id?: string | null
          completed_at?: string
          duration_minutes?: number | null
          notes?: string | null
          mood_rating?: number | null
          energy_rating?: number | null
        }
        Update: {
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
          operation:             'initial_plan_generation' | 'weekly_plan_regeneration' | 'plan_adjustment' | 'other'
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
          operation:              'initial_plan_generation' | 'weekly_plan_regeneration' | 'plan_adjustment' | 'other'
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

    }

    Views: {
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
          }[]
          week_logs: {
            id: string
            workout_id: string | null
            completed_at: string
            duration_minutes: number | null
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
export type ProgressLog     = Database['public']['Tables']['progress_logs']['Row']
export type ExerciseLog     = Database['public']['Tables']['exercise_logs']['Row']
export type Measurement     = Database['public']['Tables']['measurements']['Row']
export type AiConversation  = Database['public']['Tables']['ai_conversations']['Row']
export type AiMessage       = Database['public']['Tables']['ai_messages']['Row']
export type AiUsageLog      = Database['public']['Tables']['ai_usage_logs']['Row']

// ─── Enum convenience types (migrations 004–005) ──────────────────────────────

export type WeightSuggestionBasis =
  | 'user_baseline_pending'
  | 'estimated_from_profile'
  | 'based_on_previous_logs'

export type GymType      = NonNullable<Profile['gym_type']>
export type FitnessLevel = NonNullable<Profile['fitness_level']>
export type PrimaryGoal  = NonNullable<Profile['primary_goal']>
export type Difficulty   = NonNullable<WorkoutPlan['difficulty']>
