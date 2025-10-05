# Dolla SMS Mock System

This SMS mock system allows people without accounts to receive group details, expense notifications, and settlement updates via SMS messages. The messages are displayed in the terminal for testing purposes and can later be replaced with real Twilio integration.

## Features

- **Group Details SMS**: Send complete group information including members, recent expenses, and settlements
- **New Expense Notifications**: Alert non-members about new expenses added to groups
- **Settlement Updates**: Notify about payment requirements and settlement changes
- **Terminal Mock**: All SMS messages are displayed in the terminal with timestamps
- **React Integration**: UI buttons in the web app to send SMS notifications

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
