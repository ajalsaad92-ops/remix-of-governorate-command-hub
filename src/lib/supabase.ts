import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          password: string
          role: 'admin' | 'user'
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          username: string
          password: string
          role?: 'admin' | 'user'
          full_name?: string | null
        }
        Update: {
          username?: string
          password?: string
          role?: 'admin' | 'user'
          full_name?: string | null
        }
      }
      records: {
        Row: {
          id: string
          full_name: string
          national_id: string
          phone: string | null
          category_id: string | null
          status: 'pending' | 'approved' | 'rejected'
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          full_name: string
          national_id: string
          phone?: string | null
          category_id?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          full_name?: string
          national_id?: string
          phone?: string | null
          category_id?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          notes?: string | null
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          name: string
          description?: string | null
        }
        Update: {
          name?: string
          description?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          table_name: string
          record_id: string | null
          old_data: Record<string, any> | null
          new_data: Record<string, any> | null
          created_at: string
        }
      }
    }
  }
}
