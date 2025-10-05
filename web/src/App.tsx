import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Users, DollarSign, ArrowLeft, LogOut, Sparkles, Trash2, MessageSquare } from 'lucide-react'

type User = { id: string; phone: string; name: string }
type Group = { id: string; name: string; themeColor?: string; theme?: 'shadcn' | 'tweakcn' }
type Member = { id: string; name: string; phone: string }
type Expense = { id: string; groupId: string; description: string; amountCents: number; payerPhone: string; participants: string[]; createdAt: number }

const STORAGE_KEY = 'dolla.v2'
const SESSION_KEY = 'dolla.session'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { users: [] as User[], groups: [] as Group[], membersByGroupId: {} as Record<string, Member[]>, expensesByGroupId: {} as Record<string, Expense[]> }
    const parsed = JSON.parse(raw)
    return {
      users: parsed.users || [],
      groups: parsed.groups || [],
      membersByGroupId: parsed.membersByGroupId || {},
      expensesByGroupId: parsed.expensesByGroupId || {},
    }
  } catch {
    return { users: [], groups: [], membersByGroupId: {}, expensesByGroupId: {} }
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

// SMS functionality
async function sendSMS(type: 'group-details' | 'new-expense' | 'settlement-update', phone: string, groupId: string, expenseId?: string) {
  try {
    const response = await fetch('http://localhost:3001/api/sms/send-' + type.replace('_', '-'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, groupId, expenseId })
    })
    const result = await response.json()
    if (result.success) {
      alert(`SMS sent to ${phone}! Check the terminal for details.`)
    } else {
      alert(`Failed to send SMS: ${result.error}`)
    }
  } catch (error) {
    alert(`Error sending SMS: ${error}`)
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
    if (members.some(m => m.phone === phone)) return alert('Phone already added')
    const mem: Member = { id: generateId('mem'), name, phone }
    setState(prev => ({
      ...prev,
      membersByGroupId: { ...prev.membersByGroupId, [currentGroupId]: [...members, mem] },
    }))
    setMemberName(''); setMemberPhone('')
  }

  // Expenses screen
  const members = useMemo<Member[]>(() => currentGroupId ? (state.membersByGroupId[currentGroupId] || []) : [], [state.membersByGroupId, currentGroupId])
  const expenses = useMemo<Expense[]>(() => currentGroupId ? (state.expensesByGroupId[currentGroupId] || []) : [], [state.expensesByGroupId, currentGroupId])
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [payer, setPayer] = useState<string | undefined>(undefined)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  useEffect(() => { setPayer(members[0]?.phone) }, [members])

  const addExpense = () => {
    if (!currentGroupId) return
    const desc = expenseDesc.trim(); const amount = Math.round(parseFloat(expenseAmount || '0') * 100)
    if (!desc || !(amount > 0) || !payer) return alert('Enter description, amount, payer')
    const participants = members.map(m => m.phone)
    const exp: Expense = { id: generateId('exp'), groupId: currentGroupId, description: desc, amountCents: amount, payerPhone: payer, participants, createdAt: Date.now() }
    setState(prev => ({ ...prev, expensesByGroupId: { ...prev.expensesByGroupId, [currentGroupId]: [...expenses, exp] } }))
    setExpenseDesc(''); setExpenseAmount('')
    
    // Ask if user wants to send SMS notifications
    const shouldSendSMS = confirm('Send SMS notifications about this new expense to non-members?')
    if (shouldSendSMS) {
      const phone = prompt('Enter phone number to notify (or leave blank to skip):')
      if (phone && isValidPhone(normalizePhone(phone))) {
        sendSMS('new-expense', normalizePhone(phone), currentGroupId, exp.id)
      }
    }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Welcome to Dolla</h1>
            <p className="text-slate-600 dark:text-slate-400">Split expenses effortlessly with friends</p>
          </div>
          <Card className="border-0 shadow-xl">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Your name</Label>
                <Input 
                  id="name" 
                  placeholder="Enter your name" 
                  value={authName} 
                  onChange={e=>setAuthName(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone number</Label>
                <Input 
                  id="phone" 
                  placeholder="+1 (555) 123-4567" 
                  value={authPhone} 
                  onChange={e=>setAuthPhone(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <Button 
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700" 
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="border-b border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            className="flex items-center gap-3 text-xl font-bold text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity" 
            onClick={goHome}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{background: `linear-gradient(135deg, ${currentColor || '#3b82f6'}, ${currentColor || '#8b5cf6'})`}}>
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            Dolla
            {currentGroup && (
              <span className="text-xs px-3 py-1 rounded-full border-2 font-medium" style={{borderColor: currentColor, color: currentColor}}>
                {currentGroup.name}
              </span>
            )}
          </button>
          <div className="flex items-center gap-4">
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
        </div>
      </header>

      {view === 'home' && (
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Your Groups</h1>
            <p className="text-slate-600 dark:text-slate-400">Manage your expense groups and track shared costs</p>
          </div>
          
          <div className="grid gap-4 mb-8">
            {myGroups.length===0 ? (
              <Card className="border-dashed border-2 border-slate-300 dark:border-slate-700">
                <CardContent className="p-12 text-center">
                  <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No groups yet</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-6">Create your first group to start splitting expenses with friends</p>
                  <Button onClick={startWizard} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Group
                  </Button>
                </CardContent>
              </Card>
            ) : (
              myGroups.map(g=> (
                <Card 
                  key={g.id} 
                  className="group hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 cursor-pointer"
                  onClick={()=>{ setCurrentGroupId(g.id); setView('group'); setStep(3) }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl" style={{backgroundColor: resolveColor(g) + '20'}}>
                          <span className="text-lg font-bold" style={{color: resolveColor(g)}}>
                            {g.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
      <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{g.name}</h3>
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
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
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
              <Button onClick={startWizard} variant="outline" size="lg">
                <Plus className="w-4 h-4 mr-2" />
                Create New Group
              </Button>
            </div>
          )}
        </main>
      )}

      {view === 'wizard' && (
        <main className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
              <Sparkles className="w-8 h-8 text-white" />
      </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {step === 1 ? 'Create New Group' : 'Add Members'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {step === 1 ? 'Set up your group with a name and theme color' : 'Invite friends to join your expense group'}
            </p>
          </div>
          
          <Card className="border-0 shadow-xl">
            <CardContent className="p-8">
              {step===1 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="gname" className="text-sm font-medium text-slate-700 dark:text-slate-300">Group name</Label>
                    <Input 
                      id="gname" 
                      placeholder="e.g., Trip to SF, Dinner Club, Apartment Expenses" 
                      value={groupName} 
                      onChange={e=>setGroupName(e.target.value)}
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="gcolor" className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme color</Label>
                    <div className="flex items-center gap-4">
                      <input 
                        id="gcolor" 
                        type="color" 
                        value={groupColor} 
                        onChange={(e)=>setGroupColor(e.target.value)} 
                        className="h-12 w-20 rounded-lg border-2 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="h-12 rounded-lg border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center" style={{backgroundColor: groupColor + '20'}}>
                          <span className="text-sm font-medium" style={{color: groupColor}}>Preview</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" onClick={()=>setView('home')} className="flex-1">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={createGroup} className="flex-1" style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}>
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {step===2 && (
                <div className="space-y-6">
                  <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-400">Add members to your group (you're included by default)</p>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mname" className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</Label>
                      <Input 
                        id="mname" 
                        value={memberName} 
                        onChange={e=>setMemberName(e.target.value)} 
                        placeholder="Friend's name" 
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mphone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</Label>
                      <Input 
                        id="mphone" 
                        value={memberPhone} 
                        onChange={e=>setMemberPhone(e.target.value)} 
                        placeholder="+1 (555) 123-4567" 
                        className="h-12"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    onClick={addWizardMember} 
                    className="w-full h-12"
                    style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                  
                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Group Members</h3>
                    <div className="grid gap-2">
                      {(state.membersByGroupId[currentGroupId!]||[]).map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{m.name}</div>
                            <div className="text-xs text-slate-500">{m.phone}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" onClick={()=>setStep(1)} className="flex-1">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={()=>{ setView('group'); setStep(3) }} className="flex-1" style={{background: `linear-gradient(135deg, ${groupColor}, ${groupColor}dd)`}}>
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
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="ghost" 
                onClick={() => { setView('home'); setCurrentGroupId(null) }}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Groups
              </Button>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const phone = prompt('Enter phone number to send group details:')
                    if (phone && isValidPhone(normalizePhone(phone))) {
                      sendSMS('group-details', normalizePhone(phone), currentGroupId!)
                    } else if (phone) {
                      alert('Please enter a valid phone number')
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Group Details
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Group
                </Button>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{currentGroup?.name}</h1>
          </div>
          
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" style={{color: currentColor}} />
                    Add Expense
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</Label>
                      <Input 
                        placeholder="e.g., Dinner at restaurant" 
                        value={expenseDesc} 
                        onChange={e=>setExpenseDesc(e.target.value)}
                        className="h-12"
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
                        className="h-12"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Paid by</Label>
                    <Select value={payer} onValueChange={setPayer}>
                      <SelectTrigger className="h-12">
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
                    className="w-full h-12"
                    style={{background: `linear-gradient(135deg, ${currentColor}, ${currentColor}dd)`}}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Expense
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg mt-6">
                <CardHeader>
                  <CardTitle>Recent Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {expenses.length===0 ? (
                      <div className="text-center py-12">
                        <DollarSign className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No expenses yet</h3>
                        <p className="text-slate-600 dark:text-slate-400">Add your first expense to get started</p>
                      </div>
                    ) : (
                      [...expenses].reverse().map(e=>{
                        const payerName = members.find(m=>m.phone===e.payerPhone)?.name ?? e.payerPhone
                        return (
                          <div key={e.id} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                {payerName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900 dark:text-slate-100">{e.description}</div>
                                <div className="text-sm text-slate-600 dark:text-slate-400">Paid by {payerName} • Split equally</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold" style={{color: currentColor}}>
                                ${(e.amountCents/100).toFixed(2)}
                              </span>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => {
                                  const phone = prompt('Enter phone number to send expense notification:')
                                  if (phone && isValidPhone(normalizePhone(phone))) {
                                    sendSMS('new-expense', normalizePhone(phone), currentGroupId!, e.id)
                                  } else if (phone) {
                                    alert('Please enter a valid phone number')
                                  }
                                }}
                                className="text-slate-400 hover:text-blue-500"
                                title="Send SMS notification"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={()=>removeExpense(e.id)} className="text-slate-400 hover:text-red-500">
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
            
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
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
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{m.name}</div>
                            <div className="text-xs text-slate-500">{m.phone}</div>
                          </div>
                        </div>
                        <div className={`font-semibold ${pos? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {pos ? '+' : ''}${(amt/100).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" style={{color: currentColor}} />
                      Settle Up
                    </div>
                    {settlements.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const phone = prompt('Enter phone number to send settlement update:')
                          if (phone && isValidPhone(normalizePhone(phone))) {
                            sendSMS('settlement-update', normalizePhone(phone), currentGroupId!)
                          } else if (phone) {
                            alert('Please enter a valid phone number')
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Send Update
                      </Button>
                    )}
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
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                                {from.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{from}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-600 dark:text-slate-400">pays</span>
                              <span className="font-bold text-slate-900 dark:text-slate-100">${(t.amount/100).toFixed(2)}</span>
                              <span className="text-sm text-slate-600 dark:text-slate-400">to</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                                {to.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{to}</span>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="w-5 h-5" />
              Delete Group
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              Are you sure you want to delete "{currentGroup?.name}"? This action cannot be undone and will permanently remove the group, all its members, and all expense records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={deleteGroup}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
  )
}
