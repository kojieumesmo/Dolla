import { supabase } from './supabase'
import type { User, Group, GroupMember, GroupInvitation, Expense, ExpenseParticipant } from './supabase'

// User operations
export async function createUser(phone: string, name: string, venmo?: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert({ phone, name, venmo })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Group operations
export async function createGroup(name: string, themeColor: string): Promise<Group> {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, theme_color: themeColor })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getGroupsForUser(userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      groups (
        id,
        name,
        theme_color,
        created_at
      )
    `)
    .eq('user_id', userId)
  
  if (error) throw error
  return data.map((item: any) => item.groups).filter(Boolean) as Group[]
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId)
  
  if (error) throw error
}

// Group member operations
export async function addGroupMember(groupId: string, userId: string, name: string, phone: string): Promise<GroupMember> {
  const { data, error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, name, phone })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('joined_at')
  
  if (error) throw error
  return data
}

export async function removeGroupMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('id', memberId)
  
  if (error) throw error
}

// Group invitation operations
export async function addGroupInvitation(groupId: string, phone: string, name?: string): Promise<GroupInvitation> {
  const { data, error } = await supabase
    .from('group_invitations')
    .insert({ group_id: groupId, phone, name })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
  const { data, error } = await supabase
    .from('group_invitations')
    .select('*')
    .eq('group_id', groupId)
    .order('invited_at')
  
  if (error) throw error
  return data
}

export async function updateInvitationLastNotified(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('group_invitations')
    .update({ last_notified_at: new Date().toISOString() })
    .eq('id', invitationId)
  
  if (error) throw error
}

// Expense operations
export async function createExpense(
  groupId: string,
  description: string,
  amountCents: number,
  payerId: string,
  payerPhone: string,
  participantPhones: string[]
): Promise<Expense> {
  // Create the expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      group_id: groupId,
      description,
      amount_cents: amountCents,
      payer_id: payerId,
      payer_phone: payerPhone
    })
    .select()
    .single()
  
  if (expenseError) throw expenseError
  
  // Add participants
  const participants = participantPhones.map(phone => ({
    expense_id: expense.id,
    phone
  }))
  
  const { error: participantsError } = await supabase
    .from('expense_participants')
    .insert(participants)
  
  if (participantsError) throw participantsError
  
  return expense
}

export async function getGroupExpenses(groupId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

export async function getExpenseParticipants(expenseId: string): Promise<ExpenseParticipant[]> {
  const { data, error } = await supabase
    .from('expense_participants')
    .select('*')
    .eq('expense_id', expenseId)
  
  if (error) throw error
  return data
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
  
  if (error) throw error
}
