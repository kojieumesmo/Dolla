import { useEffect, useMemo, useState, useRef } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Users, DollarSign, ArrowLeft, LogOut, Sparkles, Trash2, MessageSquare, MoreHorizontal, Smartphone, X } from 'lucide-react'
import { setThemeColors, getAvatarClasses } from '@/lib/utils'
// DatabaseTest will be imported dynamically

type User = { id: string; phone: string; name: string; email: string; venmo?: string; passwordHash?: string }
type Group = { id: string; name: string; themeColor?: string; theme?: 'shadcn' | 'tweakcn' }
type Member = { id: string; name: string; phone: string }
type NonMember = { phone: string; name?: string; invitedAt: number; lastNotifiedAt?: number }
type Expense = { id: string; groupId: string; description: string; amountCents: number; payerPhone: string; participants: string[]; createdAt: number }
type SMSToast = { id: string; phone: string; name: string; message: string; timestamp: number }

const STORAGE_KEY = 'dolla.v2'
const SESSION_KEY = 'dolla.session'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { 
      users: [] as User[], 
      groups: [] as Group[], 
      membersByGroupId: {} as Record<string, Member[]>, 
      nonMembersByGroupId: {} as Record<string, NonMember[]>,
      expensesByGroupId: {} as Record<string, Expense[]> 
    }
    const parsed = JSON.parse(raw)
    return {
      users: parsed.users || [],
      groups: parsed.groups || [],
      membersByGroupId: parsed.membersByGroupId || {},
      nonMembersByGroupId: parsed.nonMembersByGroupId || {},
      expensesByGroupId: parsed.expensesByGroupId || {},
    }
  } catch {
    return { users: [], groups: [], membersByGroupId: {}, nonMembersByGroupId: {}, expensesByGroupId: {} }
  }
}

function saveState(state: ReturnType<typeof loadState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function loadSession(): User | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as User : null } catch { return null }
}
function saveSession(user: User | null) { if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user)); else localStorage.removeItem(SESSION_KEY) }

// Simple password hashing (for MVP - in production use proper bcrypt)
function hashPassword(password: string): string {
  // Simple hash for MVP - in production use crypto.subtle or bcrypt
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

function generateId(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}` }
function normalizePhone(input: string) { const d = String(input||'').trim().replace(/[^\d+]/g,''); if (d.startsWith('+')) return d; if (d.length===10) return '+1'+d; return d }
function isValidPhone(input: string) { return /^\+?\d{7,15}$/.test(normalizePhone(input)) }
function isValidEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) }

// Generate Venmo payment link with auto-fill parameters
function generateVenmoLink(venmoUsername: string, amount: number, note?: string): string {
  const baseUrl = 'https://venmo.com'
  const params = new URLSearchParams({
    txn: 'charge', // Request money from the user
    amount: amount.toString(),
    note: note || 'Payment from Dolla'
  })
  return `${baseUrl}/${venmoUsername}?${params.toString()}`
}

// SMS functionality - automatic notifications for non-members
async function sendSMS(type: 'group-invitation' | 'group-details' | 'new-expense' | 'settlement-update', phone: string, groupId: string, expenseId?: string) {
  try {
    const response = await fetch('http://localhost:3001/api/sms/send-' + type.replace('_', '-'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, groupId, expenseId })
    })
    const result = await response.json()
    if (result.success) {
      console.log(`📱 SMS sent to ${phone} (${type})`)
    } else {
      console.error(`Failed to send SMS: ${result.error}`)
    }
  } catch (error) {
    console.error(`Error sending SMS: ${error}`)
  }
}

// SMS Debugger functions
function generateSMSMessage(type: 'group-invitation' | 'new-expense' | 'settlement-update', groupName: string, details?: any): string {
  switch (type) {
    case 'group-invitation':
      return `📱 You've been invited to join "${groupName}" expense group! Download Dolla app to participate.`
    case 'new-expense':
      return `💰 New expense "${details?.description}" ($${(details?.amount/100).toFixed(2)}) added to "${groupName}" group.`
    case 'settlement-update':
      return `⚖️ Settlement updated in "${groupName}" group. Check your balance!`
    default:
      return `📱 Notification from "${groupName}" group.`
  }
}

function addSMSToast(phone: string, name: string, message: string, setSmsToasts: React.Dispatch<React.SetStateAction<SMSToast[]>>) {
  const toast: SMSToast = {
    id: generateId('sms'),
    phone,
    name,
    message,
    timestamp: Date.now()
  }
  
  setSmsToasts(prev => [...prev, toast])
  
  // Auto-remove toast after 5 seconds
  setTimeout(() => {
    setSmsToasts(prev => prev.filter(t => t.id !== toast.id))
  }, 5000)
}

// Automatically notify non-members about group activities
async function notifyNonMembers(groupId: string, type: 'expense-added' | 'settlement-changed', expenseId?: string, setSmsToasts?: React.Dispatch<React.SetStateAction<SMSToast[]>>, expenseDetails?: any) {
  const state = loadState()
  const nonMembers = state.nonMembersByGroupId[groupId] || []
  const group = state.groups.find(g => g.id === groupId)
  const groupName = group?.name || 'Unknown Group'
  
  for (const nonMember of nonMembers) {
    // Don't spam - only notify if it's been more than 5 minutes since last notification
    const now = Date.now()
    const lastNotified = nonMember.lastNotifiedAt || 0
    if (now - lastNotified < 5 * 60 * 1000) continue
    
    let message: string
    
    if (type === 'expense-added') {
      message = generateSMSMessage('new-expense', groupName, expenseDetails)
      await sendSMS('new-expense', nonMember.phone, groupId, expenseId)
    } else if (type === 'settlement-changed') {
      message = generateSMSMessage('settlement-update', groupName)
      await sendSMS('settlement-update', nonMember.phone, groupId)
    } else {
      continue
    }
    
    // Add SMS toast for debugging
    if (setSmsToasts) {
      addSMSToast(nonMember.phone, nonMember.name || 'Unknown', message, setSmsToasts)
    }
    
    // Update last notified timestamp
    const updatedNonMembers = nonMembers.map(nm => 
      nm.phone === nonMember.phone 
        ? { ...nm, lastNotifiedAt: now }
        : nm
    )
    
    const newState = {
      ...state,
      nonMembersByGroupId: {
        ...state.nonMembersByGroupId,
        [groupId]: updatedNonMembers
      }
    }
    saveState(newState)
  }
}

export default function App() {
  const [state, setState] = useState(loadState())
  const [me, setMe] = useState<User | null>(loadSession())
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null)
  const [view, setView] = useState<'home'|'wizard'|'group'>('home')
  const lastCheckedGroupId = useRef<string | null>(null)

  // Auth minimal (mock OTP)
  const [authName, setAuthName] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showSignupForm, setShowSignupForm] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState<string>('#38bdf8')
  const [memberName, setMemberName] = useState('')
  const [memberPhone, setMemberPhone] = useState('')

  // Expenses screen
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [payer, setPayer] = useState<string | undefined>(undefined)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [groupMessage, setGroupMessage] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showMemberDeleteDialog, setShowMemberDeleteDialog] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)
  const [showAddMemberForm, setShowAddMemberForm] = useState(false)
  const [showExpenseDeleteDialog, setShowExpenseDeleteDialog] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [venmoUsername, setVenmoUsername] = useState('')
  
  // SMS Debugger state
  const [smsToasts, setSmsToasts] = useState<SMSToast[]>([])

  useEffect(() => { saveState(state) }, [state])
  useEffect(() => { saveSession(me) }, [me])

  // Visible groups are only those where current user is a member (full member OR invited member)
  const myGroups = useMemo(() => {
    if (!me) return [] as Group[]
    return state.groups.filter(g => {
      const members = state.membersByGroupId[g.id] || []
      const nonMembers = state.nonMembersByGroupId[g.id] || []
      return members.some(m => m.phone === me.phone) || nonMembers.some(nm => nm.phone === me.phone)
    })
  }, [state.groups, state.membersByGroupId, state.nonMembersByGroupId, me])

  useEffect(() => {
    if (view === 'group' && currentGroupId && currentGroupId !== lastCheckedGroupId.current) {
      lastCheckedGroupId.current = currentGroupId
      if (!myGroups.find(g=>g.id===currentGroupId)) {
        setCurrentGroupId(null)
        setView('home')
      }
    }
  }, [myGroups, currentGroupId, view])

  const onLogin = () => {
    const phone = normalizePhone(authPhone)
    if (!isValidPhone(phone)) return alert('Enter a valid phone number')
    if (!authPassword.trim()) return alert('Please enter your password')
    
    const user = state.users.find(u => u.phone === phone)
    if (!user) return alert('User not found. Please sign up first.')
    if (!user.passwordHash) return alert('This user has no password set. Please sign up again.')
    if (!verifyPassword(authPassword, user.passwordHash)) return alert('Incorrect password')
    
    setMe(user)
    // Clear auth form
    setAuthPhone('')
    setAuthPassword('')
  }

  const onForgotPassword = () => {
    if (!isValidEmail(resetEmail)) return alert('Enter a valid email address')
    
    const user = state.users.find(u => u.email === resetEmail.trim())
    if (!user) {
      alert('No account found with this email address.')
      return
    }
    
    // Generate a simple reset token (in production, this would be more secure)
    const resetToken = Math.random().toString(36).slice(2, 15)
    
    // Add SMS toast to simulate email
    addSMSToast(
      user.phone,
      user.name,
      `Password reset link sent to ${resetEmail}. Click here to reset: http://localhost:5175/reset?token=${resetToken}`,
      setSmsToasts
    )
    
    alert('Password reset instructions have been sent to your email.')
    setResetEmail('')
    setShowForgotPassword(false)
  }

  const onSignup = () => {
    const phone = normalizePhone(authPhone)
    if (!authName.trim() || !isValidPhone(phone)) return alert('Enter a name and valid phone')
    if (!isValidEmail(authEmail)) return alert('Enter a valid email address')
    if (!authPassword.trim()) return alert('Please enter a password')
    
    let user = state.users.find(u => u.phone === phone)
    if (user) return alert('User already exists. Please login instead.')
    
    // Check if email is already used
    const existingEmailUser = state.users.find(u => u.email === authEmail.trim())
    if (existingEmailUser) return alert('Email already registered. Please use a different email.')
    
    const passwordHash = hashPassword(authPassword)
    user = { id: generateId('usr'), phone, name: authName.trim(), email: authEmail.trim(), passwordHash }
    setState(prev => ({ ...prev, users: [...prev.users, user!] }))
    setMe(user)
    
    // Clear auth form and close signup
    setAuthName('')
    setAuthPhone('')
    setAuthEmail('')
    setAuthPassword('')
    setShowSignupForm(false)
  }

  const startWizard = () => { setView('wizard'); setStep(1); setGroupName(''); setGroupColor('#38bdf8'); setMemberName(''); setMemberPhone('') }
  const createGroup = () => {
    if (!me) return
    const name = groupName.trim(); if (!name) return alert('Enter a group name')
    const gid = generateId('grp')
    const group: Group = { id: gid, name, themeColor: groupColor }
    const myMember: Member = { id: generateId('mem'), name: me.name, phone: me.phone }
    setState(prev => ({
      ...prev,
      groups: [...prev.groups, group],
      membersByGroupId: { ...prev.membersByGroupId, [gid]: [myMember] },
      expensesByGroupId: { ...prev.expensesByGroupId, [gid]: [] },
    }))
    setCurrentGroupId(gid)
    setStep(2)
  }
  const addWizardMember = () => {
    if (!currentGroupId) return
    const name = memberName.trim(); const phone = normalizePhone(memberPhone)
    if (!name || !isValidPhone(phone)) return alert('Enter name and valid phone')
    
    setState(prev => {
      const members = prev.membersByGroupId[currentGroupId] || []
      const nonMembers = prev.nonMembersByGroupId[currentGroupId] || []
      
      // Check if already a member or non-member
      if (members.some(m => m.phone === phone)) {
        alert('Phone already added as member')
        return prev
      }
      if (nonMembers.some(nm => nm.phone === phone)) {
        alert('Phone already invited')
        return prev
      }
      
      // Check if this phone belongs to an existing user
      const existingUser = prev.users.find(u => u.phone === phone)
      
      if (existingUser) {
        // Add as full member
        const mem: Member = { id: generateId('mem'), name: existingUser.name, phone }
        return {
          ...prev,
          membersByGroupId: { ...prev.membersByGroupId, [currentGroupId]: [...members, mem] },
        }
      } else {
        // Add as non-member and send invitation SMS
        const nonMem: NonMember = { phone, name, invitedAt: Date.now() }
        const newState = {
          ...prev,
          nonMembersByGroupId: { ...prev.nonMembersByGroupId, [currentGroupId]: [...nonMembers, nonMem] },
        }
        
        // Send invitation SMS
        const group = prev.groups.find(g => g.id === currentGroupId)
        if (group) {
          sendSMS('group-invitation', phone, currentGroupId)
          // Add SMS toast for debugging
          const message = generateSMSMessage('group-invitation', group.name)
          addSMSToast(phone, name, message, setSmsToasts)
        }
        
        return newState
      }
    })
    
    setMemberName(''); setMemberPhone('')
  }

  const members = useMemo<Member[]>(() => currentGroupId ? (state.membersByGroupId[currentGroupId] || []) : [], [state.membersByGroupId, currentGroupId])
  const nonMembers = useMemo<NonMember[]>(() => currentGroupId ? (state.nonMembersByGroupId[currentGroupId] || []) : [], [state.nonMembersByGroupId, currentGroupId])
  const expenses = useMemo<Expense[]>(() => currentGroupId ? (state.expensesByGroupId[currentGroupId] || []) : [], [state.expensesByGroupId, currentGroupId])
  
  // Create combined list of all participants (members + non-members) for payer selection
  const allParticipants = useMemo(() => {
    const memberParticipants = members.map(m => ({ phone: m.phone, name: m.name, isMember: true }))
    const nonMemberParticipants = nonMembers.map(nm => ({ phone: nm.phone, name: nm.name || 'Unknown', isMember: false }))
    return [...memberParticipants, ...nonMemberParticipants]
  }, [members, nonMembers])
  
  useEffect(() => { setPayer(allParticipants[0]?.phone) }, [allParticipants])
  
  // Load venmo username when settings dialog opens
  useEffect(() => {
    if (showSettingsDialog && me) {
      setVenmoUsername(me.venmo || '')
    }
  }, [showSettingsDialog, me])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdown) {
        const target = event.target as Element
        if (!target.closest('[data-dropdown-menu]')) {
          setShowDropdown(false)
        }
      }
    }
    if (showDropdown) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showDropdown])

  const addExpense = () => {
    if (!currentGroupId) return
    const desc = expenseDesc.trim(); const amount = Math.round(parseFloat(expenseAmount || '0') * 100)
    if (!desc || !(amount > 0) || !payer) return alert('Enter description, amount, payer')
    
    // Include both full members and invited members in expense participants
    const memberPhones = members.map(m => m.phone)
    const nonMemberPhones = nonMembers.map(nm => nm.phone)
    const participants = [...memberPhones, ...nonMemberPhones]
    
    const exp: Expense = { id: generateId('exp'), groupId: currentGroupId, description: desc, amountCents: amount, payerPhone: payer, participants, createdAt: Date.now() }
    setState(prev => ({ ...prev, expensesByGroupId: { ...prev.expensesByGroupId, [currentGroupId]: [...expenses, exp] } }))
    setExpenseDesc(''); setExpenseAmount('')
    
    // Automatically notify non-members about the new expense
    notifyNonMembers(currentGroupId, 'expense-added', exp.id, setSmsToasts, { description: desc, amount: amount })
  }
  const removeExpense = (expense: Expense) => {
    setExpenseToDelete(expense)
    setShowExpenseDeleteDialog(true)
  }

  const confirmRemoveExpense = () => {
    if (!currentGroupId || !expenseToDelete) return
    setState(prev => ({ ...prev, expensesByGroupId: { ...prev.expensesByGroupId, [currentGroupId]: expenses.filter(e => e.id !== expenseToDelete.id) } }))
    setShowExpenseDeleteDialog(false)
    setExpenseToDelete(null)
  }

  const deleteGroup = () => {
    if (!currentGroupId) return
    setState(prev => {
      const newState = { ...prev }
      // Remove the group
      newState.groups = newState.groups.filter(g => g.id !== currentGroupId)
      // Remove members for this group
      delete newState.membersByGroupId[currentGroupId]
      // Remove expenses for this group
      delete newState.expensesByGroupId[currentGroupId]
      return newState
    })
    setCurrentGroupId(null)
    setView('home')
    setShowDeleteDialog(false)
  }

  const sendGroupMessage = () => {
    if (!currentGroupId || !groupMessage.trim()) return
    // For now, just show an alert. In a real app, this would send the message to all group members
    alert(`Message sent to all members of "${currentGroup?.name}":\n\n"${groupMessage.trim()}"`)
    setGroupMessage('')
    setShowMessageDialog(false)
  }

  const addMemberToGroup = () => {
    if (!currentGroupId) return
    const name = memberName.trim(); const phone = normalizePhone(memberPhone)
    if (!name || !isValidPhone(phone)) return alert('Enter name and valid phone')
    
    setState(prev => {
      const members = prev.membersByGroupId[currentGroupId] || []
      const nonMembers = prev.nonMembersByGroupId[currentGroupId] || []
      
      // Check if already a member or non-member
      if (members.some(m => m.phone === phone)) {
        alert('Phone already added as member')
        return prev
      }
      if (nonMembers.some(nm => nm.phone === phone)) {
        alert('Phone already invited')
        return prev
      }
      
      // Check if this phone belongs to an existing user
      const existingUser = prev.users.find(u => u.phone === phone)
      
      if (existingUser) {
        // Add as full member
        const mem: Member = { id: generateId('mem'), name: existingUser.name, phone }
        return {
          ...prev,
          membersByGroupId: { ...prev.membersByGroupId, [currentGroupId]: [...members, mem] },
        }
      } else {
        // Add as non-member and send invitation SMS
        const nonMem: NonMember = { phone, name, invitedAt: Date.now() }
        const newState = {
          ...prev,
          nonMembersByGroupId: { ...prev.nonMembersByGroupId, [currentGroupId]: [...nonMembers, nonMem] },
        }
        
        // Send invitation SMS
        const group = prev.groups.find(g => g.id === currentGroupId)
        if (group) {
          sendSMS('group-invitation', phone, currentGroupId)
          // Add SMS toast for debugging
          const message = generateSMSMessage('group-invitation', group.name)
          addSMSToast(phone, name, message, setSmsToasts)
        }
        
        return newState
      }
    })
    
    setMemberName(''); setMemberPhone(''); setShowAddMemberForm(false)
  }

  const removeMemberFromGroup = (member: Member) => {
    if (!currentGroupId) return
    setMemberToDelete(member)
    setShowMemberDeleteDialog(true)
  }

  const confirmRemoveMember = () => {
    if (!currentGroupId || !memberToDelete) return
    
    setState(prev => ({
      ...prev,
      membersByGroupId: {
        ...prev.membersByGroupId,
        [currentGroupId]: (prev.membersByGroupId[currentGroupId] || []).filter(m => m.id !== memberToDelete.id)
      }
    }))
    
    setShowMemberDeleteDialog(false)
    setMemberToDelete(null)
  }

  const removeNonMemberFromGroup = (nonMember: NonMember) => {
    if (!currentGroupId) return
    
    setState(prev => ({
      ...prev,
      nonMembersByGroupId: {
        ...prev.nonMembersByGroupId,
        [currentGroupId]: (prev.nonMembersByGroupId[currentGroupId] || []).filter(nm => nm.phone !== nonMember.phone)
      }
    }))
  }

  const saveSettings = () => {
    if (!me) return
    
    const updatedUser = { ...me, venmo: venmoUsername.trim() }
    setState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === me.id ? updatedUser : u)
    }))
    setMe(updatedUser)
    setShowSettingsDialog(false)
  }

  const balances = useMemo(() => {
    const map: Record<string, number> = {}
    
    // Initialize balances for all members (full + invited)
    for (const m of members) map[m.phone] = 0
    for (const nm of nonMembers) map[nm.phone] = 0
    
    // Calculate balances from expenses
    for (const e of expenses) {
      map[e.payerPhone] = (map[e.payerPhone] ?? 0) + e.amountCents
      const share = Math.floor(e.amountCents / e.participants.length)
      let remainder = e.amountCents - share * e.participants.length
      e.participants.forEach((p, _) => {
        const thisShare = share + (remainder > 0 ? 1 : 0)
        if (remainder > 0) remainder--
        map[p] = (map[p] ?? 0) - thisShare
      })
    }
    return map
  }, [members, nonMembers, expenses])

  const settlements = useMemo(() => {
    const debtors: { phone: string; amount: number }[] = []
    const creditors: { phone: string; amount: number }[] = []
    for (const [phone, amt] of Object.entries(balances)) {
      if (Math.abs(amt) < 1) continue
      if (amt < 0) debtors.push({ phone, amount: -amt }); else creditors.push({ phone, amount: amt })
    }
    debtors.sort((a,b)=>b.amount-a.amount); creditors.sort((a,b)=>b.amount-a.amount)
    const tx: { from: string; to: string; amount: number }[] = []
    let i=0,j=0
    while(i<debtors.length && j<creditors.length){
      const d=debtors[i], c=creditors[j]; const pay=Math.min(d.amount,c.amount)
      tx.push({ from:d.phone, to:c.phone, amount:pay })
      d.amount-=pay; c.amount-=pay; if(d.amount<=1) i++; if(c.amount<=1) j++
    }
    return tx
  }, [balances])

  // Check if there are expenses but no settlements needed
  const hasExpensesButNoSettlements = useMemo(() => {
    return expenses.length > 0 && settlements.length === 0
  }, [expenses.length, settlements.length])

  // Theme accent helpers
  const resolveColor = (g?: Group | null) => {
    if (!g) return '#94a3b8'
    if (g.themeColor) return g.themeColor
    // migrate old theme to color
    if (g.theme === 'tweakcn') return '#34d399'
    return '#38bdf8'
  }

  // Current group
  const currentGroup = currentGroupId ? state.groups.find(g=>g.id===currentGroupId) || null : null
  const currentColor = resolveColor(currentGroup)

  // Set theme colors when current group changes
  useEffect(() => {
    if (currentGroup) {
      setThemeColors(resolveColor(currentGroup))
    }
  }, [currentGroup])

  // Early return for unauthenticated users - must be after all hooks
  if (!me) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center w-full">
        <div className="w-full max-w-sm mx-auto px-3 sm:px-6">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {showForgotPassword ? 'Reset Password' : showSignupForm ? 'Join Dolla' : 'Welcome Back'}
            </h1>
            <p className="mobile-text-lg text-slate-600 dark:text-slate-400">
              {showForgotPassword ? 'Enter your email to receive reset instructions' : showSignupForm ? 'Create your account to get started' : 'Login to your account'}
            </p>
          </div>
          <Card className="mobile-card border-0 shadow-xl">
            <CardContent className="p-4 sm:p-8 space-y-4 sm:space-y-6">
              {showForgotPassword ? (
                // Forgot Password Form
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email address</Label>
                    <Input 
                      id="reset-email" 
                      type="email"
                      placeholder="Enter your email address" 
                      value={resetEmail} 
                      onChange={e=>setResetEmail(e.target.value)}
                      className="mobile-input"
                    />
                  </div>
                  <div className="space-y-3">
                    <Button 
                      onClick={onForgotPassword} 
                      className="mobile-button w-full"
                    >
                      Send Reset Instructions
                    </Button>
                    <div className="text-center">
                      <button 
                        onClick={() => setShowForgotPassword(false)}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        Back to Login
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                // Login/Signup Form
                <>
                  {showSignupForm && (
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Your name</Label>
                      <Input 
                        id="name" 
                        placeholder="Enter your name" 
                        value={authName} 
                        onChange={e=>setAuthName(e.target.value)}
                        className="mobile-input"
                      />
                    </div>
                  )}
                  {showSignupForm && (
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email address</Label>
                      <Input 
                        id="email" 
                        type="email"
                        placeholder="Enter your email" 
                        value={authEmail} 
                        onChange={e=>setAuthEmail(e.target.value)}
                        className="mobile-input"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone number</Label>
                    <Input 
                      id="phone" 
                      placeholder="+1 (555) 123-4567" 
                      value={authPhone} 
                      onChange={e=>setAuthPhone(e.target.value)}
                      className="mobile-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
                    <Input 
                      id="password" 
                      type="password"
                      placeholder="Enter your password" 
                      value={authPassword} 
                      onChange={e=>setAuthPassword(e.target.value)}
                      className="mobile-input"
                    />
                  </div>
                  <div className="space-y-3">
                    <Button 
                      onClick={showSignupForm ? onSignup : onLogin} 
                      className="mobile-button w-full"
                    >
                      {showSignupForm ? 'Create Account' : 'Login'}
                    </Button>
                    <div className="text-center space-y-2">
                      <button 
                        onClick={() => setShowSignupForm(!showSignupForm)}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline block"
                      >
                        {showSignupForm ? 'Already have an account? Login' : "Don't have an account? Sign up"}
                      </button>
                      {!showSignupForm && (
                        <button 
                          onClick={() => setShowForgotPassword(true)}
                          className="text-sm text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 underline block"
                        >
                          Forgot your password?
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const logout = () => { setMe(null); setView('home'); setCurrentGroupId(null); setShowLogoutDialog(false) }
  const goHome = () => { setView('home'); setCurrentGroupId(null) }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 w-full">
      <header className="border-b border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="mobile-container mobile-padding">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <button 
                className="flex items-center gap-2 sm:gap-3 touch-target text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity" 
                onClick={goHome}
              >
                <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg" style={{background: `linear-gradient(135deg, ${currentColor || '#3b82f6'}, ${currentColor || '#8b5cf6'})`}}>
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </div>
                <span>Dolla</span>
              </button>
              
              {/* Show group name as left-aligned text when in a group */}
              {currentGroup && (
                <>
                  <span className="text-slate-400 dark:text-slate-500">|</span>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {currentGroup.name}
                    </h1>
                  </div>
                </>
              )}
            </div>
            
            {/* Database Test Button - Temporarily disabled */}
            {/* <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDatabaseTest(true)}
              className="mr-2 text-xs"
            >
              🧪 DB Test
            </Button> */}
            
            {/* Overflow menu with logout */}
            <div className="flex items-center">
              <div className="relative" data-dropdown-menu>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 p-2 touch-target text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
                {showDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                    <div className="py-1">
                      {/* Group-specific options when in a group */}
                      {currentGroup && (
                        <>
                          <button
                            onClick={() => {
                              setShowMessageDialog(true)
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 touch-target"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Send Group Message
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteDialog(true)
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 touch-target"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Group
                          </button>
                          <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setShowSettingsDialog(true)
                          setShowDropdown(false)
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 touch-target"
                      >
                        <Users className="w-4 h-4" />
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          setShowLogoutDialog(true)
                          setShowDropdown(false)
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 touch-target"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {view === 'home' && (
        <main className="mobile-container mobile-padding">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Your Groups</h1>
          </div>
          
          <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
            {myGroups.length===0 ? (
              <Card className="mobile-card border-dashed border-2 border-slate-300 dark:border-slate-700">
                <CardContent className="p-6 sm:p-12 text-center">
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="mobile-text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No groups yet</h3>
                  <p className="mobile-text-lg text-slate-600 dark:text-slate-400 mb-6">Create your first group to start splitting expenses with friends</p>
                  <Button onClick={startWizard} className="mobile-button w-full sm:w-auto theme-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Group
                  </Button>
                </CardContent>
              </Card>
            ) : (
              myGroups.map(g=> (
                <Card 
                  key={g.id} 
                  className="mobile-card group hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 cursor-pointer touch-target"
                  onClick={()=>{ setCurrentGroupId(g.id); setView('group'); setStep(3) }}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 flex items-center justify-center ${getAvatarClasses(resolveColor(g))}`}>
                          <span className="text-base sm:text-lg font-bold">
                            {g.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="mobile-text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {(state.membersByGroupId[g.id] || []).length + (state.nonMembersByGroupId[g.id] || []).length} members
                          </p>
                        </div>
                      </div>
                      <Button 
                        onClick={(e)=>{ 
                          e.stopPropagation(); // Prevent card click
                          setCurrentGroupId(g.id); 
                          setView('group'); 
                          setStep(3) 
                        }}
                        className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity touch-target"
                        style={{background: `linear-gradient(135deg, ${resolveColor(g)}, ${resolveColor(g)}dd)`}}
                      >
                        Enter Group
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          
          {myGroups.length > 0 && (
            <div className="text-center">
              <Button onClick={startWizard} variant="outline" size="lg" className="mobile-button w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Create New Group
              </Button>
            </div>
          )}
        </main>
      )}

      {view === 'wizard' && (
        <main className="mobile-container mobile-padding">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
              <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {step === 1 ? 'Create New Group' : 'Add Members'}
            </h1>
            <p className="mobile-text-lg text-slate-600 dark:text-slate-400">
              {step === 1 ? 'Set up your group with a name and theme color' : 'Invite friends to join your expense group'}
            </p>
          </div>
          
          <Card className="mobile-card border-0 shadow-xl">
            <CardContent className="p-4 sm:p-8">
              {step===1 && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="space-y-2 sm:space-y-3">
                    <Label htmlFor="gname" className="text-sm font-medium text-slate-700 dark:text-slate-300">Group name</Label>
                    <Input 
                      id="gname" 
                      placeholder="e.g., Trip to SF, Dinner Club, Apartment Expenses" 
                      value={groupName} 
                      onChange={e=>setGroupName(e.target.value)}
                      className="mobile-input"
                    />
                  </div>
                  <div className="space-y-2 sm:space-y-3">
                    <Label htmlFor="gcolor" className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme color</Label>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <input 
                        id="gcolor" 
                        type="color" 
                        value={groupColor} 
                        onChange={(e)=>setGroupColor(e.target.value)} 
                        className="h-12 w-16 sm:w-20 rounded-lg border-2 border-slate-300 dark:border-slate-700 cursor-pointer touch-target"
                      />
                      <div className="flex-1">
                        <div className="h-12 rounded-lg border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center" style={{backgroundColor: groupColor + '20'}}>
                          <span className="text-sm font-medium" style={{color: groupColor}}>Preview</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button variant="outline" onClick={()=>setView('home')} className="mobile-button flex-1 order-2 sm:order-1">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={createGroup} className="mobile-button flex-1 order-1 sm:order-2" style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}>
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {step===2 && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="text-center p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-400">Add members to your group (you're included by default)</p>
                  </div>
                  
                  <div className="space-y-3 sm:space-y-4 sm:grid sm:grid-cols-2 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="mname" className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</Label>
                      <Input 
                        id="mname" 
                        value={memberName} 
                        onChange={e=>setMemberName(e.target.value)} 
                        placeholder="Friend's name" 
                        className="mobile-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mphone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</Label>
                      <Input 
                        id="mphone" 
                        value={memberPhone} 
                        onChange={e=>setMemberPhone(e.target.value)} 
                        placeholder="+1 (555) 123-4567" 
                        className="mobile-input"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    onClick={addWizardMember} 
                    className="mobile-button w-full"
                    style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                  
                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Group Members</h3>
                    <div className="space-y-2">
                      {(state.membersByGroupId[currentGroupId!]||[]).map(m => (
                        <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${getAvatarClasses(groupColor)}`}>
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{m.name}</div>
                              <div className="text-xs text-slate-500 truncate">{m.phone}</div>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeMemberFromGroup(m)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    {(state.nonMembersByGroupId[currentGroupId!]||[]).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invited (SMS notifications)</h4>
                        <div className="space-y-2">
                          {(state.nonMembersByGroupId[currentGroupId!]||[]).map((nm, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/20">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                  📱
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{nm.name || 'Unknown'}</div>
                                  <div className="text-xs text-slate-500 truncate">{nm.phone}</div>
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => removeNonMemberFromGroup(nm)}
                                className="text-slate-400 hover:text-red-500 p-1"
                              >
                                ×
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button variant="outline" onClick={()=>setStep(1)} className="mobile-button flex-1 order-2 sm:order-1">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={()=>{ setView('group'); setStep(3) }} className="mobile-button flex-1 order-1 sm:order-2" style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}>
                      Start Splitting Expenses
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      )}

      {view === 'group' && currentGroupId && (
        <main className="mobile-container mobile-padding">
          
          <div className="space-y-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
            <div className="lg:col-span-2 space-y-6">
              <Card className="mobile-card border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Recent Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {expenses.length===0 ? (
                      <div className="text-center py-8 sm:py-12">
                        <DollarSign className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400 mx-auto mb-4" />
                        <h3 className="mobile-text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No expenses yet</h3>
                        <p className="mobile-text-lg text-slate-600 dark:text-slate-400 mb-6">Add your first expense to get started</p>
                        <Button 
                          onClick={() => setShowAddExpenseForm(true)}
                          className="mobile-button"
                          style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Your First Expense
                        </Button>
                      </div>
                    ) : (
                      [...expenses].reverse().map(e=>{
                        const payerName = members.find(m=>m.phone===e.payerPhone)?.name ?? e.payerPhone
                        return (
                          <div key={e.id} className="flex items-center justify-between p-3 sm:p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors touch-target">
                            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-sm sm:text-base flex-shrink-0 ${getAvatarClasses(currentColor)}`}>
                                {payerName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{e.description}</div>
                                <div className="text-sm text-slate-600 dark:text-slate-400 truncate">Paid by {payerName} • Split equally</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                              <span className="text-base sm:text-lg font-bold" style={{color: currentColor}}>
                                ${(e.amountCents/100).toFixed(2)}
                              </span>
                              <Button variant="ghost" size="sm" onClick={()=>removeExpense(e)} className="text-slate-400 hover:text-red-500 touch-target p-1">
                                ×
                              </Button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-4 sm:space-y-6">
              <Card className="mobile-card border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5" style={{color: currentColor}} />
                      Members
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowAddMemberForm(true)}
                      className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Full Members */}
                  {members.map(m=>{
                    const amt = balances[m.phone] ?? 0
                    const pos = amt >= 0
                    return (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${getAvatarClasses(currentColor)}`}>
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{m.name}</div>
                            <div className="text-xs text-slate-500 truncate">{m.phone}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`font-semibold flex-shrink-0 ${pos? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {pos ? '+' : ''}${(amt/100).toFixed(2)}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeMemberFromGroup(m)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* Invited Members */}
                  {nonMembers.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invited (SMS notifications)</h4>
                      {nonMembers.map((nm, idx) => {
                        const amt = balances[nm.phone] ?? 0
                        const pos = amt >= 0
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/20">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                📱
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{nm.name || 'Unknown'}</div>
                                <div className="text-xs text-slate-500 truncate">{nm.phone}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`font-semibold flex-shrink-0 ${pos? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {pos ? '+' : ''}${(amt/100).toFixed(2)}
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => removeNonMemberFromGroup(nm)}
                                className="text-slate-400 hover:text-red-500 p-1"
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className="mobile-card border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" style={{color: currentColor}} />
                      Settle Up
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {settlements.length===0 ? (
                      <div className="text-center py-6">
                        <Sparkles className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                          {hasExpensesButNoSettlements 
                            ? "No settlements needed - expenses are balanced within the group"
                            : "All settled up!"
                          }
                        </p>
                      </div>
                    ) : (
                      settlements.map((t,i)=>{
                        const from = members.find(m=>m.phone===t.from)?.name ?? t.from
                        const to = members.find(m=>m.phone===t.to)?.name ?? t.to
                        const toUser = state.users.find(u => u.phone === t.to)
                        const isCurrentUserOwing = t.from === me?.phone
                        const hasVenmoUsername = toUser?.venmo
                        
                        return (
                          <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${getAvatarClasses(currentColor)}`}>
                                  {from.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">{from}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600 dark:text-slate-400">pays</span>
                                <span className="font-bold text-slate-900 dark:text-slate-100">${(t.amount/100).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600 dark:text-slate-400">to</span>
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${getAvatarClasses(currentColor)}`}>
                                    {to.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">{to}</span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {isCurrentUserOwing && hasVenmoUsername && (
                                  <a
                                    href={generateVenmoLink(toUser!.venmo!, t.amount/100, `Payment to ${to} from ${from}`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                                  >
                                    Pay with Venmo
                                  </a>
                                )}
                                {!isCurrentUserOwing && me?.venmo && (
                                  <a
                                    href={generateVenmoLink(me.venmo, t.amount/100, `Payment from ${from} to ${to}`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                                  >
                                    Request via Venmo
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Floating Add Button */}
          <Button
            onClick={() => setShowAddExpenseForm(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-50"
            style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
          >
            <Plus className="w-6 h-6" />
          </Button>
        </main>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 mobile-text-lg">
              <Trash2 className="w-5 h-5" />
              Delete Group
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 mobile-text-lg">
              Are you sure you want to delete "{currentGroup?.name}"? This action cannot be undone and will permanently remove the group, all its members, and all expense records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={deleteGroup}
              className="mobile-button flex-1 order-1 sm:order-2"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Group Message Dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mobile-text-lg">
              <MessageSquare className="w-5 h-5" />
              Send Group Message
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 mobile-text-lg">
              Send a message to all members of "{currentGroup?.name}". This will notify everyone in the group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Message
              </Label>
              <Input
                id="message"
                placeholder="Type your message here..."
                value={groupMessage}
                onChange={(e) => setGroupMessage(e.target.value)}
                className="mobile-input"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowMessageDialog(false)
                setGroupMessage('')
              }}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={sendGroupMessage}
              disabled={!groupMessage.trim()}
              className="mobile-button flex-1 order-1 sm:order-2"
              style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Expense Modal */}
      <Dialog open={showAddExpenseForm} onOpenChange={setShowAddExpenseForm}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mobile-text-lg">
              <DollarSign className="w-5 h-5" style={{color: currentColor}} />
              Add Expense
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-4 sm:space-y-4 sm:grid sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</Label>
                <Input 
                  placeholder="e.g., Dinner at restaurant" 
                  value={expenseDesc} 
                  onChange={e=>setExpenseDesc(e.target.value)}
                  className="mobile-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount</Label>
                <Input 
                  placeholder="0.00" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={expenseAmount} 
                  onChange={e=>setExpenseAmount(e.target.value)}
                  className="mobile-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Paid by</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger className="mobile-input">
                  <SelectValue placeholder="Select who paid" />
                </SelectTrigger>
                <SelectContent>
                  {allParticipants.map(p=> (
                    <SelectItem key={p.phone} value={p.phone}>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold ${p.isMember ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gradient-to-r from-green-500 to-blue-600'}`}>
                          {p.isMember ? p.name.charAt(0).toUpperCase() : '📱'}
                        </div>
                        <div className="flex flex-col">
                          <span>{p.name}</span>
                          {!p.isMember && <span className="text-xs text-slate-500">(invited)</span>}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowAddExpenseForm(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                addExpense()
                setShowAddExpenseForm(false)
              }}
              disabled={members.length===0}
              className="mobile-button flex-1 order-1 sm:order-2"
              style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Modal */}
      <Dialog open={showAddMemberForm} onOpenChange={setShowAddMemberForm}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mobile-text-lg">
              <Users className="w-5 h-5" style={{color: currentColor}} />
              Add Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mname" className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</Label>
              <Input 
                id="mname" 
                value={memberName} 
                onChange={e=>setMemberName(e.target.value)} 
                placeholder="Friend's name" 
                className="mobile-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mphone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</Label>
              <Input 
                id="mphone" 
                value={memberPhone} 
                onChange={e=>setMemberPhone(e.target.value)} 
                placeholder="+1 (555) 123-4567" 
                className="mobile-input"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowAddMemberForm(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={addMemberToGroup}
              className="mobile-button flex-1 order-1 sm:order-2"
              style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Delete Confirmation Dialog */}
      <Dialog open={showMemberDeleteDialog} onOpenChange={setShowMemberDeleteDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 mobile-text-lg">
              <Trash2 className="w-5 h-5" />
              Remove Member
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 mobile-text-lg">
              Are you sure you want to remove "{memberToDelete?.name}" from this group? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowMemberDeleteDialog(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmRemoveMember}
              className="mobile-button flex-1 order-1 sm:order-2"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Delete Confirmation Dialog */}
      <Dialog open={showExpenseDeleteDialog} onOpenChange={setShowExpenseDeleteDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 mobile-text-lg">
              <Trash2 className="w-5 h-5" />
              Delete Expense
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 mobile-text-lg">
              Are you sure you want to delete "{expenseToDelete?.description}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowExpenseDeleteDialog(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmRemoveExpense}
              className="mobile-button flex-1 order-1 sm:order-2"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mobile-text-lg">
              <Users className="w-5 h-5" />
              Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Your Name</Label>
              <Input 
                value={me?.name || ''} 
                className="mobile-input"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone Number</Label>
              <Input 
                value={me?.phone || ''} 
                className="mobile-input"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Venmo Account</Label>
              <Input 
                placeholder="Enter your Venmo username" 
                value={venmoUsername}
                onChange={(e) => setVenmoUsername(e.target.value)}
                className="mobile-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</Label>
              <Input 
                type="password"
                placeholder="Enter new password" 
                className="mobile-input"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowSettingsDialog(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={saveSettings}
              className="mobile-button flex-1 order-1 sm:order-2"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:m-4 sm:rounded-lg sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mobile-text-lg">
              <LogOut className="w-5 h-5" />
              Logout
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 mobile-text-lg">
              Are you sure you want to logout? You'll need to sign in again to access your groups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setShowLogoutDialog(false)}
              className="mobile-button flex-1 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={logout}
              className="mobile-button flex-1 order-1 sm:order-2"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Debugger Toasts */}
      <div className="fixed top-20 right-4 z-[9999] space-y-2">
        {smsToasts.map(toast => (
          <div
            key={toast.id}
            className="bg-white dark:bg-slate-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-xl p-4 max-w-sm transform transition-all duration-300 ease-in-out"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                    {toast.name}
                  </div>
                  <button
                    onClick={() => setSmsToasts(prev => prev.filter(t => t.id !== toast.id))}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {toast.phone}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  {toast.message}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {new Date(toast.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
  )
}
