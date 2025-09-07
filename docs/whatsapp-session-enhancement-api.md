# WhatsApp Session Enhancement API Documentation

## Overview
This document describes the enhanced API response format for blast sessions that now includes WhatsApp account information.

## Enhanced Endpoints

### GET `/api/blast-control/sessions`
Get user blast sessions with WhatsApp account information.

#### Request Parameters
- `status` (optional): Filter by session status
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

#### Enhanced Response Format

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": 1,
        "sessionId": "blast_20250907_001",
        "userId": 1,
        "whatsappSessionId": "wa_business_main",
        "status": "RUNNING",
        "campaignName": "Promo Akhir Tahun",
        "messageTemplate": "Hello {{name}}, special offer for you!",
        "totalMessages": 1500,
        "currentIndex": 1275,
        "sentCount": 1275,
        "failedCount": 45,
        "skippedCount": 0,
        "progressPercentage": "85.00",
        "estimatedCompletion": "2025-09-07T16:30:00Z",
        "startedAt": "2025-09-07T10:30:00Z",
        "pausedAt": null,
        "resumedAt": null,
        "completedAt": null,
        "stoppedAt": null,
        "errorMessage": null,
        "config": {
          "messageDelay": { "min": 1000, "max": 3000 },
          "contactDelay": { "min": 2000, "max": 5000 },
          "businessHours": {
            "enabled": true,
            "startHour": 9,
            "endHour": 17
          }
        },
        "createdAt": "2025-09-07T10:30:00Z",
        "updatedAt": "2025-09-07T15:45:00Z",
        
        // ✨ NEW: WhatsApp Account Information
        "whatsappAccount": {
          "sessionId": "wa_business_main",
          "phoneNumber": "+628123456789",
          "displayName": "PT. Digital Solutions - Main",
          "status": "connected",
          "profilePicture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABA...",
          "lastSeen": "2025-09-07T15:45:30Z",
          "connectionQuality": "excellent",
          "operatorInfo": {
            "provider": "Telkomsel",
            "type": "Postpaid"
          }
        }
      },
      {
        "id": 2,
        "sessionId": "blast_20250907_002",
        "userId": 1,
        "whatsappSessionId": "wa_customer_service",
        "status": "PAUSED",
        "campaignName": "Follow Up Customer",
        "messageTemplate": "Hi {{name}}, thank you for your interest!",
        "totalMessages": 850,
        "currentIndex": 320,
        "sentCount": 320,
        "failedCount": 12,
        "skippedCount": 0,
        "progressPercentage": "37.60",
        "estimatedCompletion": null,
        "startedAt": "2025-09-07T09:15:00Z",
        "pausedAt": "2025-09-07T14:20:00Z",
        "resumedAt": null,
        "completedAt": null,
        "stoppedAt": null,
        "errorMessage": null,
        "config": {
          "messageDelay": { "min": 2000, "max": 4000 },
          "contactDelay": { "min": 3000, "max": 6000 },
          "businessHours": {
            "enabled": true,
            "startHour": 8,
            "endHour": 18
          }
        },
        "createdAt": "2025-09-07T09:15:00Z",
        "updatedAt": "2025-09-07T14:20:15Z",
        
        // ✨ WhatsApp Account with disconnected status
        "whatsappAccount": {
          "sessionId": "wa_customer_service",
          "phoneNumber": "+628234567890",
          "displayName": "Customer Service Team",
          "status": "disconnected",
          "profilePicture": null,
          "lastSeen": "2025-09-07T14:20:15Z",
          "connectionQuality": "poor",
          "operatorInfo": {
            "provider": "Indosat",
            "type": "Prepaid"
          }
        }
      },
      {
        "id": 3,
        "sessionId": "blast_20250907_003",
        "userId": 1,
        "whatsappSessionId": "wa_missing_session",
        "status": "IDLE",
        "campaignName": "Newsletter Campaign",
        "messageTemplate": "Monthly newsletter for {{name}}",
        "totalMessages": 2000,
        "currentIndex": 0,
        "sentCount": 0,
        "failedCount": 0,
        "skippedCount": 0,
        "progressPercentage": "0.00",
        "estimatedCompletion": null,
        "startedAt": null,
        "pausedAt": null,
        "resumedAt": null,
        "completedAt": null,
        "stoppedAt": null,
        "errorMessage": null,
        "config": {
          "messageDelay": { "min": 1500, "max": 3500 },
          "contactDelay": { "min": 2500, "max": 5500 },
          "businessHours": {
            "enabled": false
          }
        },
        "createdAt": "2025-09-07T08:45:00Z",
        "updatedAt": "2025-09-07T08:45:00Z",
        
        // ✨ Fallback for missing WhatsApp session data
        "whatsappAccount": {
          "sessionId": "wa_missing_session",
          "phoneNumber": null,
          "displayName": "Account Information Unavailable",
          "status": "unknown",
          "profilePicture": null,
          "lastSeen": null,
          "connectionQuality": "unknown",
          "operatorInfo": null
        }
      }
    ],
    "pagination": {
      "total": 3,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

## WhatsApp Account Object Schema

### whatsappAccount Properties

| Property | Type | Description | Possible Values |
|----------|------|-------------|-----------------|
| `sessionId` | string | WhatsApp session identifier | e.g., "wa_business_main" |
| `phoneNumber` | string\|null | Phone number with country code | e.g., "+628123456789" |
| `displayName` | string | Display name for the account | Any string or "Account Information Unavailable" |
| `status` | string | Connection status | "connected", "disconnected", "connecting", "unknown" |
| `profilePicture` | string\|null | Base64 encoded profile picture | Base64 string or null |
| `lastSeen` | string\|null | Last activity timestamp | ISO 8601 format or null |
| `connectionQuality` | string | Connection quality indicator | "excellent", "good", "poor", "unknown" |
| `operatorInfo` | object\|null | Mobile operator information | See operatorInfo schema below |

### operatorInfo Properties

| Property | Type | Description | Possible Values |
|----------|------|-------------|-----------------|
| `provider` | string | Mobile operator name | "Telkomsel", "Indosat", "XL", "Smartfren", "Three", "Axis", "Unknown" |
| `type` | string | Account type | "Prepaid", "Postpaid", "Unknown" |

## Status Indicators

### Connection Status
- **connected**: WhatsApp session is active and connected
- **disconnected**: WhatsApp session is disconnected
- **connecting**: WhatsApp session is in the process of connecting
- **unknown**: Status cannot be determined

### Connection Quality
- **excellent**: Strong, stable connection (WebSocket OPEN state)
- **good**: Connection is establishing (WebSocket CONNECTING state)
- **poor**: Connection issues (WebSocket CLOSING/CLOSED state)
- **unknown**: Quality cannot be determined

## Error Handling

### Missing WhatsApp Session
When a blast session references a WhatsApp session that no longer exists or cannot be found, the API will return a fallback `whatsappAccount` object with:
- `phoneNumber`: null
- `displayName`: "Account Information Unavailable"
- `status`: "unknown"
- `connectionQuality`: "unknown"
- All other fields set to null

### Database Errors
If there's an error retrieving WhatsApp session information, the API will still return the blast session data but with limited account information.

## Migration Notes

### Database Changes
The enhancement adds the following fields to the `sessions` table:
- `display_name` (VARCHAR): Display name for the WhatsApp account
- `profile_picture` (TEXT): Base64 encoded profile picture
- `last_seen` (TIMESTAMP): Last activity timestamp
- `connection_quality` (ENUM): Connection quality indicator
- `metadata` (JSONB): Additional metadata including operator information

### Backward Compatibility
- Existing API clients will continue to work without modification
- The new `whatsappAccount` field is additive and doesn't break existing functionality
- If a client doesn't need WhatsApp account information, it can simply ignore the new field

## Usage Examples

### Frontend Integration
```typescript
interface WhatsAppAccount {
  sessionId: string;
  phoneNumber: string | null;
  displayName: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'unknown';
  profilePicture: string | null;
  lastSeen: string | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  operatorInfo: {
    provider: string;
    type: string;
  } | null;
}

interface BlastSession {
  // ... existing fields
  whatsappAccount: WhatsAppAccount;
}
```

### React Component Usage
```tsx
const BlastSessionCard = ({ session }: { session: BlastSession }) => {
  const { whatsappAccount } = session;
  
  return (
    <div className="session-card">
      <h3>{session.campaignName}</h3>
      <div className="whatsapp-info">
        <span className={`status-${whatsappAccount.status}`}>
          {whatsappAccount.status}
        </span>
        <span>{whatsappAccount.phoneNumber || 'Unknown'}</span>
        <span>{whatsappAccount.displayName}</span>
      </div>
    </div>
  );
};
```

## Performance Considerations

### Database Queries
- The enhancement uses LEFT JOIN to include WhatsApp session data
- Indexes are added for optimal query performance
- Connection pooling is utilized for database connections

### Caching Strategy
- Consider implementing Redis caching for frequently accessed session data
- WhatsApp account information can be cached for short periods (5-10 minutes)
- Real-time updates should bypass cache for accuracy

### Rate Limiting
- WhatsApp API calls for profile information should be rate-limited
- Batch operations are preferred for updating multiple sessions

---

**Last Updated**: September 7, 2025  
**API Version**: Enhanced v1.1  
**Backward Compatible**: Yes
