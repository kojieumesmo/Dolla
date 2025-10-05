#!/usr/bin/env node

/**
 * SMS Mock System for Dolla
 * Simulates sending SMS messages to people without accounts
 * Later can be replaced with real Twilio integration
 */

const fs = require('fs');
const path = require('path');

// Mock SMS storage (in real app, this would be Twilio)
const SMS_LOG_FILE = path.join(__dirname, 'sms-log.json');

// Load existing SMS log
function loadSMSLog() {
  try {
    if (fs.existsSync(SMS_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(SMS_LOG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading SMS log:', error.message);
  }
  return [];
}

// Save SMS log
function saveSMSLog(log) {
  try {
    fs.writeFileSync(SMS_LOG_FILE, JSON.stringify(log, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving SMS log:', error.message);
    throw new Error(`Failed to save SMS log: ${error.message}`);
  }
}

// Format currency
function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Format phone number for display
function formatPhone(phone) {
  if (phone.startsWith('+1')) {
    const number = phone.slice(2);
    return `(${number.slice(0,3)}) ${number.slice(3,6)}-${number.slice(6)}`;
  }
  return phone;
}

// Send SMS mock
function sendSMS(phone, message) {
  const log = loadSMSLog();
  const sms = {
    id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    phone: phone,
    message: message,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
  
  log.push(sms);
  
  try {
    saveSMSLog(log);
    console.log(`📱 SMS sent to ${formatPhone(phone)}:`);
    console.log(`   ${message}`);
    console.log(`   [${sms.timestamp}]`);
    console.log('');
    return sms;
  } catch (error) {
    console.error('Failed to persist SMS:', error.message);
    throw error;
  }
}

// Generate group invitation SMS
function generateGroupInvitationSMS(group, members, expenses, settlements) {
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);
  const recentExpenses = expenses.slice(-3).reverse();
  
  let message = `🎉 You're invited to ${group.name}!\n\n`;
  
  // Members
  message += `👥 Group members (${members.length}):\n`;
  members.forEach(member => {
    message += `• ${member.name}\n`;
  });
  
  // Recent expenses
  if (recentExpenses.length > 0) {
    message += `\n💰 Recent expenses:\n`;
    recentExpenses.forEach(expense => {
      const payer = members.find(m => m.phone === expense.payerPhone);
      message += `• ${expense.description} - ${formatCurrency(expense.amountCents)} (${payer?.name || 'Unknown'})\n`;
    });
  }
  
  // Total
  message += `\n💵 Total: ${formatCurrency(totalExpenses)}`;
  
  // Settlements
  if (settlements.length > 0) {
    message += `\n\n⚖️ Payments needed:\n`;
    settlements.forEach(settlement => {
      const from = members.find(m => m.phone === settlement.from);
      const to = members.find(m => m.phone === settlement.to);
      message += `• ${from?.name || 'Unknown'} → ${to?.name || 'Unknown'}: ${formatCurrency(settlement.amount)}\n`;
    });
  } else {
    message += `\n\n✅ All settled up!`;
  }
  
  message += `\n\n📱 You'll get updates via SMS. Reply STOP to opt out.`;
  
  return message;
}

// Generate group details SMS (for existing non-members)
function generateGroupDetailsSMS(group, members, expenses, settlements) {
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);
  const recentExpenses = expenses.slice(-3).reverse();
  
  let message = `🏠 ${group.name} - Update\n\n`;
  
  // Members
  message += `👥 Members (${members.length}):\n`;
  members.forEach(member => {
    message += `• ${member.name}\n`;
  });
  
  // Recent expenses
  if (recentExpenses.length > 0) {
    message += `\n💰 Recent expenses:\n`;
    recentExpenses.forEach(expense => {
      const payer = members.find(m => m.phone === expense.payerPhone);
      message += `• ${expense.description} - ${formatCurrency(expense.amountCents)} (${payer?.name || 'Unknown'})\n`;
    });
  }
  
  // Total
  message += `\n💵 Total: ${formatCurrency(totalExpenses)}`;
  
  // Settlements
  if (settlements.length > 0) {
    message += `\n\n⚖️ Payments needed:\n`;
    settlements.forEach(settlement => {
      const from = members.find(m => m.phone === settlement.from);
      const to = members.find(m => m.phone === settlement.to);
      message += `• ${from?.name || 'Unknown'} → ${to?.name || 'Unknown'}: ${formatCurrency(settlement.amount)}\n`;
    });
  } else {
    message += `\n\n✅ All settled up!`;
  }
  
  message += `\n\n📱 Reply STOP to opt out of updates.`;
  
  return message;
}

// Generate new expense notification SMS
function generateNewExpenseSMS(group, expense, members) {
  const payer = members.find(m => m.phone === expense.payerPhone);
  const shareAmount = Math.floor(expense.amountCents / expense.participants.length);
  
  let message = `💰 New Expense in ${group.name}\n\n`;
  message += `📝 ${expense.description}\n`;
  message += `💵 Amount: ${formatCurrency(expense.amountCents)}\n`;
  message += `👤 Paid by: ${payer?.name || 'Unknown'}\n`;
  message += `📊 Your share: ${formatCurrency(shareAmount)}\n`;
  message += `\n📱 Reply DETAILS to see full group info`;
  
  return message;
}

// Generate settlement update SMS
function generateSettlementUpdateSMS(group, settlements, members) {
  let message = `⚖️ Settlement Update for ${group.name}\n\n`;
  
  if (settlements.length === 0) {
    message += `✅ All settled up! No payments needed.`;
  } else {
    message += `📋 Payments needed:\n`;
    settlements.forEach(settlement => {
      const from = members.find(m => m.phone === settlement.from);
      const to = members.find(m => m.phone === settlement.to);
      message += `• ${from?.name || 'Unknown'} → ${to?.name || 'Unknown'}: ${formatCurrency(settlement.amount)}\n`;
    });
  }
  
  message += `\n📱 Reply DETAILS to see full group info`;
  
  return message;
}

// CLI Commands
function showHelp() {
  console.log(`
📱 Dolla SMS Mock System

Commands:
  send-group-details <phone> <groupId>     - Send group details to phone
  send-new-expense <phone> <groupId> <expenseId> - Send new expense notification
  send-settlement-update <phone> <groupId> - Send settlement update
  list-sms                                - List all sent SMS
  clear-sms                               - Clear SMS log
  help                                    - Show this help

Examples:
  node sms-mock.js send-group-details +15551234567 grp_abc123
  node sms-mock.js send-new-expense +15551234567 grp_abc123 exp_def456
  node sms-mock.js list-sms
`);
}

// Load app data from localStorage (simulated)
function loadAppData() {
  // In a real implementation, this would read from the actual app's localStorage
  // For now, we'll use mock data
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

// Calculate settlements (same logic as in the app)
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

// Main CLI handler
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help') {
    showHelp();
    return;
  }
  
  const command = args[0];
  const appData = loadAppData();
  
  switch (command) {
    case 'send-group-details':
      if (args.length < 3) {
        console.error('Usage: send-group-details <phone> <groupId>');
        return;
      }
      const phone1 = args[1];
      const groupId1 = args[2];
      const group1 = appData.groups.find(g => g.id === groupId1);
      const members1 = appData.membersByGroupId[groupId1] || [];
      const expenses1 = appData.expensesByGroupId[groupId1] || [];
      const settlements1 = calculateSettlements(members1, expenses1);
      
      if (!group1) {
        console.error(`Group ${groupId1} not found`);
        return;
      }
      
      const groupDetailsMessage = generateGroupDetailsSMS(group1, members1, expenses1, settlements1);
      sendSMS(phone1, groupDetailsMessage);
      break;
      
    case 'send-new-expense':
      if (args.length < 4) {
        console.error('Usage: send-new-expense <phone> <groupId> <expenseId>');
        return;
      }
      const phone2 = args[1];
      const groupId2 = args[2];
      const expenseId = args[3];
      const group2 = appData.groups.find(g => g.id === groupId2);
      const members2 = appData.membersByGroupId[groupId2] || [];
      const expenses2 = appData.expensesByGroupId[groupId2] || [];
      const expense = expenses2.find(e => e.id === expenseId);
      
      if (!group2) {
        console.error(`Group ${groupId2} not found`);
        return;
      }
      if (!expense) {
        console.error(`Expense ${expenseId} not found`);
        return;
      }
      
      const newExpenseMessage = generateNewExpenseSMS(group2, expense, members2);
      sendSMS(phone2, newExpenseMessage);
      break;
      
    case 'send-settlement-update':
      if (args.length < 3) {
        console.error('Usage: send-settlement-update <phone> <groupId>');
        return;
      }
      const phone3 = args[1];
      const groupId3 = args[2];
      const group3 = appData.groups.find(g => g.id === groupId3);
      const members3 = appData.membersByGroupId[groupId3] || [];
      const expenses3 = appData.expensesByGroupId[groupId3] || [];
      const settlements3 = calculateSettlements(members3, expenses3);
      
      if (!group3) {
        console.error(`Group ${groupId3} not found`);
        return;
      }
      
      const settlementMessage = generateSettlementUpdateSMS(group3, settlements3, members3);
      sendSMS(phone3, settlementMessage);
      break;
      
    case 'list-sms':
      const log = loadSMSLog();
      if (log.length === 0) {
        console.log('No SMS messages sent yet.');
        return;
      }
      
      console.log('📱 SMS History:');
      console.log('================');
      log.forEach((sms, index) => {
        console.log(`${index + 1}. To: ${formatPhone(sms.phone)}`);
        console.log(`   Time: ${sms.timestamp}`);
        console.log(`   Message: ${sms.message.substring(0, 100)}${sms.message.length > 100 ? '...' : ''}`);
        console.log('');
      });
      break;
      
    case 'clear-sms':
      saveSMSLog([]);
      console.log('✅ SMS log cleared');
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  sendSMS,
  generateGroupInvitationSMS,
  generateGroupDetailsSMS,
  generateNewExpenseSMS,
  generateSettlementUpdateSMS,
  loadSMSLog,
  saveSMSLog
};
