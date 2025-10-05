# Dolla SMS System - Partiful-like Experience

This SMS system creates a **Partiful-like experience** where people can engage with expense groups without creating accounts. Non-members receive automatic SMS notifications about group activities, creating viral growth and seamless onboarding.

## 🎯 Core Concept

**Like Partiful**: People get invited to groups via SMS and can see all activity without signing up. They receive automatic updates about expenses, settlements, and group changes.

**Transparent Engagement**: Non-members can fully understand group dynamics before deciding to create an account.

**Viral Growth**: Each invitation creates potential new users who experience the product value first.

## ✨ Features

### Automatic SMS Notifications
- **Group Invitations**: New non-members get comprehensive group details via SMS
- **Expense Updates**: Automatic notifications when expenses are added
- **Settlement Changes**: Updates when payment requirements change
- **Smart Throttling**: Prevents spam with 5-minute cooldown between notifications

### Seamless Onboarding
- **No Account Required**: People can engage immediately via SMS
- **Rich Context**: Each SMS includes group members, recent expenses, and settlements
- **Opt-out Easy**: Reply "STOP" to unsubscribe from updates
- **Progressive Engagement**: Non-members can become full members anytime

## 🚀 How It Works

### 1. Inviting Non-Members
When adding someone to a group who doesn't have an account:
- They're added as a "non-member" 
- Automatically receive invitation SMS with full group context
- Start receiving updates about group activities

### 2. Automatic Updates
Non-members automatically receive SMS when:
- New expenses are added to the group
- Settlement requirements change
- Group membership changes

### 3. Transparent Experience
Each SMS includes:
- Group name and current members
- Recent expenses with amounts and who paid
- Current settlement requirements
- Total group expenses

## 📱 SMS Message Examples

### Group Invitation
```
🎉 You're invited to Trip to SF!

👥 Group members (3):
• Alice
• Bob  
• Charlie

💰 Recent expenses:
• Dinner at restaurant - $120.00 (Bob)
• Hotel room - $300.00 (Alice)

💵 Total: $420.00

⚖️ Payments needed:
• Charlie → Alice: $140.00
• Bob → Alice: $20.00

📱 You'll get updates via SMS. Reply STOP to opt out.
```

### New Expense Notification
```
💰 New Expense in Trip to SF

📝 Gas for rental car
💵 Amount: $45.00
👤 Paid by: Bob
📊 Your share: $15.00

📱 Reply DETAILS to see full group info
```

### Settlement Update
```
⚖️ Settlement Update for Trip to SF

📋 Payments needed:
• Charlie → Alice: $140.00
• Bob → Alice: $20.00

📱 Reply DETAILS to see full group info
```

## 🛠 Technical Implementation

### Data Structure
```typescript
type NonMember = { 
  phone: string; 
  name?: string; 
  invitedAt: number; 
  lastNotifiedAt?: number 
}
```

### Automatic Notifications
- Triggered when expenses are added
- Smart throttling prevents spam
- Updates non-member timestamps
- Seamless integration with existing app

### SMS Server
- RESTful API for React app integration
- Handles invitation, expense, and settlement SMS
- Terminal mock for development/testing
- Ready for Twilio integration

## 🎮 Usage

### For App Users
1. **Add Members**: Use the group wizard to add people by phone
2. **Automatic Invitations**: Non-members automatically get SMS invitations
3. **Transparent Updates**: All group activity is shared via SMS
4. **No Manual Work**: Everything happens automatically

### For Non-Members
1. **Receive Invitation**: Get SMS with full group context
2. **Stay Updated**: Automatic notifications about group activities
3. **Engage Anytime**: Can create account to become full member
4. **Opt Out**: Reply "STOP" to unsubscribe

## 🚀 Growth Strategy

This creates **viral growth** because:
- **Low Friction**: No account required to engage
- **High Value**: People see real expense tracking in action
- **Social Proof**: See friends actively using the app
- **Natural Conversion**: Non-members become members organically

## 🔧 Setup & Testing

1. **Start Services**:
   ```bash
   npm start              # SMS server (port 3001)
   cd web && npm run dev  # React app (port 5173)
   ```

2. **Test Partiful Experience**:
   ```bash
   node demo-partiful.js  # Full demo
   ```

3. **Manual Testing**:
   ```bash
   node sms-mock.js send-group-invitation +15551234567 grp_1
   ```

## 📈 Future Enhancements

- **Twilio Integration**: Replace terminal mock with real SMS
- **Rich Media**: Add group photos and receipts via MMS
- **Interactive SMS**: Reply commands for group actions
- **Analytics**: Track engagement and conversion rates
- **Personalization**: Customized messages based on user behavior

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start SMS Server**:
   ```bash
   npm start
   ```
   This starts the Express server on port 3001.

3. **Start React App**:
   ```bash
   cd web
   npm run dev
   ```
   This starts the React app on port 5173.

## Usage

### Terminal Commands

```bash
# Send group details to a phone number
node sms-mock.js send-group-details +15551234567 grp_1

# Send new expense notification
node sms-mock.js send-new-expense +15551234567 grp_1 exp_2

# Send settlement update
node sms-mock.js send-settlement-update +15551234567 grp_1

# List all sent SMS messages
node sms-mock.js list-sms

# Clear SMS history
node sms-mock.js clear-sms
```

### React App Integration

1. **Send Group Details**: Click the "Send Group Details" button in the group header
2. **Send Expense Notifications**: Click the SMS icon next to any expense
3. **Send Settlement Updates**: Click "Send Update" in the Settle Up section
4. **Auto-notify on New Expenses**: The app will ask if you want to send SMS when adding new expenses

### API Endpoints

- `POST /api/sms/send-group-details` - Send group details SMS
- `POST /api/sms/send-new-expense` - Send new expense notification
- `POST /api/sms/send-settlement-update` - Send settlement update
- `GET /api/sms/history` - Get SMS history
- `DELETE /api/sms/history` - Clear SMS history

## SMS Message Examples

### Group Details SMS
```
🏠 Trip to SF - Group Details

👥 Members (3):
• Alice ((555) 123-4567)
• Bob ((555) 123-4568)
• Charlie ((555) 123-4569)

💰 Recent Expenses:
• Dinner at restaurant - $120.00 (paid by Bob)
• Hotel room - $300.00 (paid by Alice)

💵 Total Expenses: $420.00

⚖️ Settlements Needed:
• Charlie owes Alice $140.00
• Bob owes Alice $20.00

📱 Reply HELP for more options
```

### New Expense Notification
```
💰 New Expense in Trip to SF

📝 Dinner at restaurant
💵 Amount: $120.00
👤 Paid by: Bob
📊 Your share: $40.00

📱 Reply DETAILS to see full group info
```

### Settlement Update
```
⚖️ Settlement Update for Trip to SF

📋 Payments needed:
• Charlie → Alice: $140.00
• Bob → Alice: $20.00

📱 Reply DETAILS to see full group info
```

## Future Integration

To replace the mock system with real Twilio SMS:

1. Install Twilio SDK: `npm install twilio`
2. Replace the `sendSMS` function in `sms-mock.js` with Twilio API calls
3. Add environment variables for Twilio credentials
4. Update the Express server to use real SMS sending

## Files

- `sms-mock.js` - Terminal-based SMS mock system
- `sms-server.js` - Express server for React app integration
- `package.json` - Dependencies and scripts
- `sms-log.json` - Generated file storing SMS history
- `web/src/App.tsx` - React app with SMS integration
