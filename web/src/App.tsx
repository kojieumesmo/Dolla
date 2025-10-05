import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Users, DollarSign, ArrowLeft, LogOut, Sparkles, Trash2, MessageSquare, MoreHorizontal } from 'lucide-react'

type User = { id: string; phone: string; name: string }
type Group = { id: string; name: string; themeColor?: string; theme?: 'shadcn' | 'tweakcn' }
type Member = { id: string; name: string; phone: string }
type NonMember = { phone: string; name?: string; invitedAt: number; lastNotifiedAt?: number }
type Expense = { id: string; groupId: string; description: string; amountCents: number; payerPhone: string; participants: string[]; createdAt: number }

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

function generateId(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}` }
function normalizePhone(input: string) { const d = String(input||'').trim().replace(/[^\d+]/g,''); if (d.startsWith('+')) return d; if (d.length===10) return '+1'+d; return d }
function isValidPhone(input: string) { return /^\+?\d{7,15}$/.test(normalizePhone(input)) }

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

// Automatically notify non-members about group activities
async function notifyNonMembers(groupId: string, type: 'expense-added' | 'settlement-changed', expenseId?: string) {
  const state = loadState()
  const nonMembers = state.nonMembersByGroupId[groupId] || []
  
  for (const nonMember of nonMembers) {
    // Don't spam - only notify if it's been more than 5 minutes since last notification
    const now = Date.now()
    const lastNotified = nonMember.lastNotifiedAt || 0
    if (now - lastNotified < 5 * 60 * 1000) continue
    
    if (type === 'expense-added') {
      await sendSMS('new-expense', nonMember.phone, groupId, expenseId)
    } else if (type === 'settlement-changed') {
      await sendSMS('settlement-update', nonMember.phone, groupId)
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

  useEffect(() => { saveState(state) }, [state])
  useEffect(() => { saveSession(me) }, [me])

  // Visible groups are only those where current user is a member
  const myGroups = useMemo(() => {
    if (!me) return [] as Group[]
    return state.groups.filter(g => (state.membersByGroupId[g.id] || []).some(m => m.phone === me.phone))
  }, [state.groups, state.membersByGroupId, me])

  useEffect(() => {
    if (view === 'group') {
      if (currentGroupId && !myGroups.find(g=>g.id===currentGroupId)) {
        setCurrentGroupId(null); setView('home')
      }
    }
  }, [myGroups, currentGroupId, view])

  // Auth minimal (mock OTP)
  const [authName, setAuthName] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const onAuth = () => {
    const phone = normalizePhone(authPhone)
    if (!authName.trim() || !isValidPhone(phone)) return alert('Enter a name and valid phone')
    let user = state.users.find(u => u.phone === phone)
    if (!user) {
      user = { id: generateId('usr'), phone, name: authName.trim() }
      setState(prev => ({ ...prev, users: [...prev.users, user!] }))
    }
    setMe(user)
  }

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState<string>('#38bdf8')
  const [memberName, setMemberName] = useState('')
  const [memberPhone, setMemberPhone] = useState('')

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
    
    const members = state.membersByGroupId[currentGroupId] || []
    const nonMembers = state.nonMembersByGroupId[currentGroupId] || []
    
    // Check if already a member or non-member
    if (members.some(m => m.phone === phone)) return alert('Phone already added as member')
    if (nonMembers.some(nm => nm.phone === phone)) return alert('Phone already invited')
    
    // Check if this phone belongs to an existing user
    const existingUser = state.users.find(u => u.phone === phone)
    
    if (existingUser) {
      // Add as full member
      const mem: Member = { id: generateId('mem'), name: existingUser.name, phone }
      setState(prev => ({
        ...prev,
        membersByGroupId: { ...prev.membersByGroupId, [currentGroupId]: [...members, mem] },
      }))
    } else {
      // Add as non-member and send invitation SMS
      const nonMem: NonMember = { phone, name, invitedAt: Date.now() }
      setState(prev => ({
        ...prev,
        nonMembersByGroupId: { ...prev.nonMembersByGroupId, [currentGroupId]: [...nonMembers, nonMem] },
      }))
      
      // Send invitation SMS
      const group = state.groups.find(g => g.id === currentGroupId)
      if (group) {
        sendSMS('group-invitation', phone, currentGroupId)
      }
    }
    
    setMemberName(''); setMemberPhone('')
  }

  // Expenses screen
  const members = useMemo<Member[]>(() => currentGroupId ? (state.membersByGroupId[currentGroupId] || []) : [], [state.membersByGroupId, currentGroupId])
  const expenses = useMemo<Expense[]>(() => currentGroupId ? (state.expensesByGroupId[currentGroupId] || []) : [], [state.expensesByGroupId, currentGroupId])
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [payer, setPayer] = useState<string | undefined>(undefined)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [groupMessage, setGroupMessage] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  useEffect(() => { setPayer(members[0]?.phone) }, [members])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showDropdown) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const addExpense = () => {
    if (!currentGroupId) return
    const desc = expenseDesc.trim(); const amount = Math.round(parseFloat(expenseAmount || '0') * 100)
    if (!desc || !(amount > 0) || !payer) return alert('Enter description, amount, payer')
    const participants = members.map(m => m.phone)
    const exp: Expense = { id: generateId('exp'), groupId: currentGroupId, description: desc, amountCents: amount, payerPhone: payer, participants, createdAt: Date.now() }
    setState(prev => ({ ...prev, expensesByGroupId: { ...prev.expensesByGroupId, [currentGroupId]: [...expenses, exp] } }))
    setExpenseDesc(''); setExpenseAmount('')
    
    // Automatically notify non-members about the new expense
    notifyNonMembers(currentGroupId, 'expense-added', exp.id)
  }
  const removeExpense = (id: string) => {
    if (!currentGroupId) return
    setState(prev => ({ ...prev, expensesByGroupId: { ...prev.expensesByGroupId, [currentGroupId]: expenses.filter(e => e.id !== id) } }))
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

  const balances = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of members) map[m.phone] = 0
    for (const e of expenses) {
      map[e.payerPhone] = (map[e.payerPhone] ?? 0) + e.amountCents
      const share = Math.floor(e.amountCents / e.participants.length)
      let remainder = e.amountCents - share * e.participants.length
      e.participants.forEach((p, idx) => {
        const thisShare = share + (remainder > 0 ? 1 : 0)
        if (remainder > 0) remainder--
        map[p] = (map[p] ?? 0) - thisShare
      })
    }
    return map
  }, [members, expenses])

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

  // Theme accent helpers
  const resolveColor = (g?: Group | null) => {
    if (!g) return '#94a3b8'
    if (g.themeColor) return g.themeColor
    // migrate old theme to color
    if (g.theme === 'tweakcn') return '#34d399'
    return '#38bdf8'
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center w-full">
        <div className="w-full max-w-sm mx-auto px-3 sm:px-6">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Welcome to Dolla</h1>
            <p className="mobile-text-lg text-slate-600 dark:text-slate-400">Split expenses effortlessly with friends</p>
          </div>
          <Card className="mobile-card border-0 shadow-xl">
            <CardContent className="p-4 sm:p-8 space-y-4 sm:space-y-6">
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
              <Button 
                className="mobile-button w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700" 
                onClick={onAuth}
              >
                Get Started
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Current group
  const currentGroup = currentGroupId ? state.groups.find(g=>g.id===currentGroupId) || null : null
  const currentColor = resolveColor(currentGroup)

  const logout = () => { setMe(null); setView('home'); setCurrentGroupId(null) }
  const goHome = () => { setView('home'); setCurrentGroupId(null) }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 w-full">
      <header className="border-b border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="mobile-container mobile-padding">
          <div className="flex items-center justify-between">
            <button 
              className="flex items-center gap-2 sm:gap-3 touch-target text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity" 
              onClick={goHome}
            >
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg" style={{background: `linear-gradient(135deg, ${currentColor || '#3b82f6'}, ${currentColor || '#8b5cf6'})`}}>
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
              </div>
              <span className="hidden xs:inline">Dolla</span>
              {currentGroup && (
                <span className="text-xs px-2 py-1 sm:px-3 rounded-full border-2 font-medium hidden sm:inline" style={{borderColor: currentColor, color: currentColor}}>
                  {currentGroup.name}
                </span>
              )}
            </button>
            
            {/* Mobile: Collapsible user info */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mobile: Show only user name, hide phone */}
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">{me.name}</span>
                  <span className="mx-2">·</span>
                  <span>{me.phone}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={logout} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
              
              {/* Mobile: Compact user info */}
              <div className="sm:hidden flex items-center gap-2">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">{me.name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={logout} className="touch-target p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* Mobile: Show current group below header */}
          {currentGroup && (
            <div className="sm:hidden mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
              <div className="flex items-center justify-center">
                <span className="text-sm px-3 py-1 rounded-full border-2 font-medium" style={{borderColor: currentColor, color: currentColor}}>
                  {currentGroup.name}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {view === 'home' && (
        <main className="mobile-container mobile-padding">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Your Groups</h1>
            <p className="mobile-text-lg text-slate-600 dark:text-slate-400">Manage your expense groups and track shared costs</p>
          </div>
          
          <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
            {myGroups.length===0 ? (
              <Card className="mobile-card border-dashed border-2 border-slate-300 dark:border-slate-700">
                <CardContent className="p-6 sm:p-12 text-center">
                  <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="mobile-text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No groups yet</h3>
                  <p className="mobile-text-lg text-slate-600 dark:text-slate-400 mb-6">Create your first group to start splitting expenses with friends</p>
                  <Button onClick={startWizard} className="mobile-button w-full sm:w-auto bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
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
                        <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex-shrink-0" style={{backgroundColor: resolveColor(g) + '20'}}>
                          <span className="text-base sm:text-lg font-bold" style={{color: resolveColor(g)}}>
                            {g.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="mobile-text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {(state.membersByGroupId[g.id] || []).length} members
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
                        <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{m.name}</div>
                            <div className="text-xs text-slate-500 truncate">{m.phone}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {(state.nonMembersByGroupId[currentGroupId!]||[]).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invited (SMS notifications)</h4>
                        <div className="space-y-2">
                          {(state.nonMembersByGroupId[currentGroupId!]||[]).map((nm, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-900/20">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                📱
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{nm.name || 'Unknown'}</div>
                                <div className="text-xs text-slate-500 truncate">{nm.phone}</div>
                              </div>
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
          <div className="text-center mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="ghost" 
                onClick={() => { setView('home'); setCurrentGroupId(null) }}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 touch-target"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden xs:inline">Back to Groups</span>
                <span className="xs:hidden">Back</span>
              </Button>
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 p-2 touch-target"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
                {showDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                    <div className="py-1">
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
                    </div>
                  </div>
                )}
              </div>
            </div>
            <h1 className="mobile-text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{currentGroup?.name}</h1>
          </div>
          
          <div className="space-y-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
            <div className="lg:col-span-2 space-y-6">
              <Card className="mobile-card border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" style={{color: currentColor}} />
                    Add Expense
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        {members.map(m=> (
                          <SelectItem key={m.id} value={m.phone}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              {m.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={addExpense} 
                    disabled={members.length===0}
                    className="mobile-button w-full"
                    style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Expense
                  </Button>
                </CardContent>
              </Card>
              
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
                        <p className="mobile-text-lg text-slate-600 dark:text-slate-400">Add your first expense to get started</p>
                      </div>
                    ) : (
                      [...expenses].reverse().map(e=>{
                        const payerName = members.find(m=>m.phone===e.payerPhone)?.name ?? e.payerPhone
                        return (
                          <div key={e.id} className="flex items-center justify-between p-3 sm:p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors touch-target">
                            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm sm:text-base flex-shrink-0">
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
                              <Button variant="ghost" size="sm" onClick={()=>removeExpense(e.id)} className="text-slate-400 hover:text-red-500 touch-target p-1">
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
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" style={{color: currentColor}} />
                    Balances
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.map(m=>{
                    const amt = balances[m.phone] ?? 0
                    const pos = amt >= 0
                    return (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{m.name}</div>
                            <div className="text-xs text-slate-500 truncate">{m.phone}</div>
                          </div>
                        </div>
                        <div className={`font-semibold flex-shrink-0 ${pos? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {pos ? '+' : ''}${(amt/100).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
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
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">All settled up!</p>
                      </div>
                    ) : (
                      settlements.map((t,i)=>{
                        const from = members.find(m=>m.phone===t.from)?.name ?? t.from
                        const to = members.find(m=>m.phone===t.to)?.name ?? t.to
                        return (
                          <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                                  {from.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">{from}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600 dark:text-slate-400">pays</span>
                                <span className="font-bold text-slate-900 dark:text-slate-100">${(t.amount/100).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-600 dark:text-slate-400">to</span>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                                  {to.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">{to}</span>
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
        </main>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-full max-w-sm sm:max-w-md mx-3 sm:mx-4">
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
        <DialogContent className="w-full max-w-sm sm:max-w-md mx-3 sm:mx-4">
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
      </div>
  )
}
