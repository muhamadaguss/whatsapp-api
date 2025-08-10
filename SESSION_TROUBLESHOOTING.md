# Session Troubleshooting Guide

## Error: "Session 'testing' tidak dalam kondisi sehat: WebSocket state unknown"

### Root Cause

This error occurs when:

1. Session exists but WebSocket is in an unknown state
2. Session is not fully initialized
3. WhatsApp connection is unstable

### Immediate Solutions

#### 1. Check if Session Exists

```bash
# Debug specific session
node whatsapp/debug-testing-session.js

# Check all active sessions
node whatsapp/test-connection-health.js
```

#### 2. Start WhatsApp Session

If session doesn't exist, start it:

```bash
# Via API - Get QR Code
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/whatsapp/qr-image/testing

# Then scan the QR code with WhatsApp
```

#### 3. Check Session Health

```bash
# Via API
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/whatsapp/health/testing
```

### Enhanced Error Handling

The system now uses **permissive mode** for better compatibility:

#### Before (Strict Mode):

- ❌ Fails on any unknown WebSocket state
- ❌ Requires perfect connection state

#### After (Permissive Mode):

- ✅ Allows unknown WebSocket states if basic functionality exists
- ✅ Focuses on critical issues only
- ✅ Better compatibility with different Baileys versions

### Session States Explained

| WebSocket State | Value | Meaning                | Action                 |
| --------------- | ----- | ---------------------- | ---------------------- |
| CONNECTING      | 0     | Connecting to WhatsApp | ⏳ Wait                |
| OPEN            | 1     | Connected and ready    | ✅ Good to go          |
| CLOSING         | 2     | Connection closing     | ⚠️ Reconnect soon      |
| CLOSED          | 3     | Connection closed      | ❌ Must reconnect      |
| UNKNOWN         | Other | Unknown state          | 🔍 Check functionality |

### Critical vs Non-Critical Issues

#### Critical Issues (Block sending):

- ❌ User not authenticated (QR not scanned)
- ❌ WebSocket closed
- ❌ sendMessage function not available

#### Non-Critical Issues (Allow with warning):

- ⚠️ WebSocket connecting
- ⚠️ WebSocket state unknown (but functional)
- ⚠️ No WebSocket reference (but functional)

### Step-by-Step Fix

#### Step 1: Verify Session Exists

```bash
node whatsapp/debug-testing-session.js
```

If session not found:

```bash
# Start new session via API
curl -X GET -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/whatsapp/qr-image/testing
```

#### Step 2: Scan QR Code

1. Get QR code from API response
2. Open WhatsApp on phone
3. Go to Settings > Linked Devices
4. Scan the QR code

#### Step 3: Verify Connection

```bash
# Wait a few seconds, then check
node whatsapp/debug-testing-session.js
```

Should show:

- ✅ Session found
- ✅ Has user
- ✅ User authenticated

#### Step 4: Test Sending

Try sending a test message via API or frontend.

### Prevention

#### 1. Session Monitoring

```bash
# Regular health checks
*/5 * * * * node /path/to/whatsapp/test-connection-health.js
```

#### 2. Auto-Reconnect

The system includes auto-reconnect for certain disconnect reasons.

#### 3. Graceful Degradation

- Non-critical issues log warnings but allow operation
- Critical issues block operation with clear error messages

### API Endpoints

#### Health Check

```bash
GET /whatsapp/health/:sessionId
```

#### Get QR Code

```bash
GET /whatsapp/qr-image/:sessionId
```

#### Send Message

```bash
POST /whatsapp/send-message
{
  "sessionId": "testing",
  "phone": "1234567890",
  "message": "test"
}
```

### Debugging Commands

```bash
# Test session states
node whatsapp/test-session-states.js

# Debug specific session
node whatsapp/debug-testing-session.js

# Complete health check
node whatsapp/test-connection-health.js

# Test image feature
node whatsapp/test-image-complete.js
```

### Common Scenarios

#### Scenario 1: Fresh Installation

1. No sessions exist
2. Need to create and authenticate session
3. Scan QR code

#### Scenario 2: Session Expired

1. Session exists but not authenticated
2. Need to re-scan QR code
3. Session will auto-reconnect

#### Scenario 3: Network Issues

1. WebSocket connection unstable
2. System will retry automatically
3. May need manual reconnection

#### Scenario 4: Unknown WebSocket State

1. Baileys version compatibility issue
2. Permissive mode handles this
3. Focuses on functionality over state

### Success Indicators

After fixing:

- ✅ Session found in debug script
- ✅ User authenticated
- ✅ Health check passes (permissive mode)
- ✅ Can send messages successfully
- ✅ No critical errors in logs
