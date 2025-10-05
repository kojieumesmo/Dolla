const express = require('express');
const cors = require('cors');
const path = require('path');

// Import our SMS mock functions
const smsMock = require('./sms-mock');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Configure CORS to only allow requests from the frontend app
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Load app data from localStorage simulation
function loadAppData() {
  // In a real implementation, this would read from a database
  // For now, we'll use mock data that matches the React app structure
  return {
    users: [
      { id: 'usr_1', phone: '+15551234567', name: 'Alice' },
      { id: 'usr_2', phone: '+15551234568', name: 'Bob' },
      { id: 'usr_3', phone: '+15551234569', name: 'Charlie' }
    ],
    groups: [
      { id: 'grp_1', name: 'Trip to SF', themeColor: '#38bdf8' },
      { id: 'grp_2', name: 'Dinner Club', themeColor: '#34d399' }
    ],
    membersByGroupId: {
      'grp_1': [
        { id: 'mem_1', name: 'Alice', phone: '+15551234567' },
        { id: 'mem_2', name: 'Bob', phone: '+15551234568' },
        { id: 'mem_3', name: 'Charlie', phone: '+15551234569' }
      ],
      'grp_2': [
        { id: 'mem_4', name: 'Alice', phone: '+15551234567' },
        { id: 'mem_5', name: 'Bob', phone: '+15551234568' }
      ]
    },
    expensesByGroupId: {
      'grp_1': [
        { 
          id: 'exp_1', 
          groupId: 'grp_1', 
          description: 'Hotel room', 
          amountCents: 30000, 
          payerPhone: '+15551234567', 
          participants: ['+15551234567', '+15551234568', '+15551234569'],
          createdAt: Date.now() - 86400000
        },
        { 
          id: 'exp_2', 
          groupId: 'grp_1', 
          description: 'Dinner at restaurant', 
          amountCents: 12000, 
          payerPhone: '+15551234568', 
          participants: ['+15551234567', '+15551234568', '+15551234569'],
          createdAt: Date.now() - 3600000
        }
      ],
      'grp_2': [
        { 
          id: 'exp_3', 
          groupId: 'grp_2', 
          description: 'Pizza night', 
          amountCents: 4500, 
          payerPhone: '+15551234567', 
          participants: ['+15551234567', '+15551234568'],
          createdAt: Date.now() - 7200000
        }
      ]
    }
  };
}

// Calculate settlements (same logic as in the React app)
function calculateSettlements(members, expenses) {
  const balances = {};
  for (const m of members) balances[m.phone] = 0;
  
  for (const e of expenses) {
    balances[e.payerPhone] = (balances[e.payerPhone] ?? 0) + e.amountCents;
    const share = Math.floor(e.amountCents / e.participants.length);
    let remainder = e.amountCents - share * e.participants.length;
    e.participants.forEach((p, idx) => {
      const thisShare = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      balances[p] = (balances[p] ?? 0) - thisShare;
    });
  }
  
  const debtors = [];
  const creditors = [];
  for (const [phone, amt] of Object.entries(balances)) {
    if (Math.abs(amt) < 1) continue;
    if (amt < 0) debtors.push({ phone, amount: -amt });
    else creditors.push({ phone, amount: amt });
  }
  
  debtors.sort((a,b) => b.amount - a.amount);
  creditors.sort((a,b) => b.amount - a.amount);
  
  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const pay = Math.min(d.amount, c.amount);
    settlements.push({ from: d.phone, to: c.phone, amount: pay });
    d.amount -= pay;
    c.amount -= pay;
    if (d.amount <= 1) i++;
    if (c.amount <= 1) j++;
  }
  
  return settlements;
}

// API Routes

// Send group details SMS
app.post('/api/sms/send-group-details', (req, res) => {
  try {
    const { phone, groupId } = req.body;
    
    if (!phone || !groupId) {
      return res.status(400).json({ error: 'Phone and groupId are required' });
    }
    
    const appData = loadAppData();
    const group = appData.groups.find(g => g.id === groupId);
    const members = appData.membersByGroupId[groupId] || [];
    const expenses = appData.expensesByGroupId[groupId] || [];
    const settlements = calculateSettlements(members, expenses);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const message = smsMock.generateGroupDetailsSMS(group, members, expenses, settlements);
    const sms = smsMock.sendSMS(phone, message);
    
    res.json({ success: true, sms });
  } catch (error) {
    console.error('Error sending group details SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Send new expense notification SMS
app.post('/api/sms/send-new-expense', (req, res) => {
  try {
    const { phone, groupId, expenseId } = req.body;
    
    if (!phone || !groupId || !expenseId) {
      return res.status(400).json({ error: 'Phone, groupId, and expenseId are required' });
    }
    
    const appData = loadAppData();
    const group = appData.groups.find(g => g.id === groupId);
    const members = appData.membersByGroupId[groupId] || [];
    const expenses = appData.expensesByGroupId[groupId] || [];
    const expense = expenses.find(e => e.id === expenseId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    const message = smsMock.generateNewExpenseSMS(group, expense, members);
    const sms = smsMock.sendSMS(phone, message);
    
    res.json({ success: true, sms });
  } catch (error) {
    console.error('Error sending new expense SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Send settlement update SMS
app.post('/api/sms/send-settlement-update', (req, res) => {
  try {
    const { phone, groupId } = req.body;
    
    if (!phone || !groupId) {
      return res.status(400).json({ error: 'Phone and groupId are required' });
    }
    
    const appData = loadAppData();
    const group = appData.groups.find(g => g.id === groupId);
    const members = appData.membersByGroupId[groupId] || [];
    const expenses = appData.expensesByGroupId[groupId] || [];
    const settlements = calculateSettlements(members, expenses);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const message = smsMock.generateSettlementUpdateSMS(group, settlements, members);
    const sms = smsMock.sendSMS(phone, message);
    
    res.json({ success: true, sms });
  } catch (error) {
    console.error('Error sending settlement update SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Get SMS history
app.get('/api/sms/history', (req, res) => {
  try {
    const log = smsMock.loadSMSLog();
    res.json({ success: true, sms: log });
  } catch (error) {
    console.error('Error loading SMS history:', error);
    res.status(500).json({ error: 'Failed to load SMS history' });
  }
});

// Clear SMS history
app.delete('/api/sms/history', (req, res) => {
  try {
    smsMock.saveSMSLog([]);
    res.json({ success: true, message: 'SMS history cleared' });
  } catch (error) {
    console.error('Error clearing SMS history:', error);
    res.status(500).json({ error: 'Failed to clear SMS history' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`📱 SMS Mock Server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   SMS history: http://localhost:${PORT}/api/sms/history`);
});

module.exports = app;
