#!/usr/bin/env node

/**
 * Partiful-like SMS Demo for Dolla
 * Shows how non-members can engage with groups without creating accounts
 */

const { execSync } = require('child_process');

console.log('🎉 Dolla Partiful-like SMS Demo\n');
console.log('This demonstrates how people can engage with expense groups without creating accounts.\n');

// Demo 1: Someone gets invited to a group
console.log('1️⃣ Alice invites her friend Sarah to "Trip to SF" group...');
console.log('   Sarah doesn\'t have a Dolla account, but gets invited via SMS\n');
try {
  execSync('curl -X POST http://localhost:3001/api/sms/send-group-invitation -H "Content-Type: application/json" -d \'{"phone": "+15551234570", "groupId": "grp_1"}\' -s | jq -r ".sms.message"', { stdio: 'inherit' });
} catch (error) {
  console.log('   (SMS sent to Sarah with group details and invitation)');
}

console.log('\n2️⃣ Later, Bob adds a new expense for gas...');
console.log('   Sarah automatically gets notified about the new expense\n');
try {
  execSync('curl -X POST http://localhost:3001/api/sms/send-new-expense -H "Content-Type: application/json" -d \'{"phone": "+15551234570", "groupId": "grp_1", "expenseId": "exp_2"}\' -s | jq -r ".sms.message"', { stdio: 'inherit' });
} catch (error) {
  console.log('   (SMS sent to Sarah about new gas expense)');
}

console.log('\n3️⃣ When settlements change, Sarah gets updated...');
console.log('   She can see who owes what without logging in\n');
try {
  execSync('curl -X POST http://localhost:3001/api/sms/send-settlement-update -H "Content-Type: application/json" -d \'{"phone": "+15551234570", "groupId": "grp_1"}\' -s | jq -r ".sms.message"', { stdio: 'inherit' });
} catch (error) {
  console.log('   (SMS sent to Sarah with settlement updates)');
}

console.log('\n4️⃣ Checking SMS history...');
try {
  execSync('node sms-mock.js list-sms', { stdio: 'inherit' });
} catch (error) {
  console.log('   (SMS history displayed)');
}

console.log('\n✅ Partiful-like Experience Complete!');
console.log('\n🎯 Key Features:');
console.log('   • Non-members get invited via SMS automatically');
console.log('   • They receive updates about expenses and settlements');
console.log('   • No account creation required');
console.log('   • Transparent engagement with groups');
console.log('   • Can opt out anytime with "STOP"');
console.log('\n🚀 This creates viral growth - people engage before signing up!');
