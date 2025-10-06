import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase project URL and anon key
const supabaseUrl = 'https://fjoyjwdudfsmvzomzrne.supabase.com'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqb3lqd2R1ZGZzbXZ6b216cm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MDM1NTYsImV4cCI6MjA3NTI3OTU1Nn0.aahFM3zlQG73J5T80EMIOFB4u1E7XMlrnj_WF6DIjAw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface User {
  id: string
  phone: string
  name: string
  venmo?: string
  created_at: string
}

export interface Group {
  id: string
  name: string
  theme_color: string
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id?: string
  name: string
  phone: string
  joined_at: string
}

export interface GroupInvitation {
  id: string
  group_id: string
  phone: string
  name?: string
  invited_at: string
  last_notified_at?: string
}

export interface Expense {
  id: string
  group_id: string
  description: string
  amount_cents: number
  payer_id?: string
  payer_phone: string
  created_at: string
}

export interface ExpenseParticipant {
  id: string
  expense_id: string
  user_id?: string
  phone: string
}
