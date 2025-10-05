#!/usr/bin/env node

/**
 * Demo script showing SMS functionality for Dolla
 * This demonstrates how people without accounts can receive group updates
 */

const { execSync } = require('child_process');

console.log('🎉 Dolla SMS Demo - Sending notifications to non-account holders\n');

// Demo 1: Send group details
console.log('1️⃣ Sending group details to a friend who wants to see the trip expenses...');
try {
  execSync('node sms-mock.js send-group-details +15551234570 grp_1', { stdio: 'inherit' });
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n2️⃣ Sending notification about a new expense...');
try {
  execSync('node sms-mock.js send-new-expense +15551234570 grp_1 exp_2', { stdio: 'inherit' });
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n3️⃣ Sending settlement update to someone who needs to pay...');
try {
  execSync('node sms-mock.js send-settlement-update +15551234571 grp_1', { stdio: 'inherit' });
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n4️⃣ Checking SMS history...');
try {
  execSync('node sms-mock.js list-sms', { stdio: 'inherit' });
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n✅ Demo complete! All SMS messages have been sent and logged.');
console.log('\n💡 In the React app, you can also:');
console.log('   • Click "Send Group Details" button in group view');
console.log('   • Click SMS icon next to expenses');
console.log('   • Click "Send Update" in settlements section');
console.log('   • Get prompted to send SMS when adding new expenses');
console.log('\n🚀 Ready to replace with real Twilio SMS when needed!');
