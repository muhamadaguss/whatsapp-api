# Fix: Mark As Read Endpoint - Content Type Error

## Problem

API endpoint `PUT /chats/:sessionId/:contactName/read` mengembalikan error 400 dengan message "Invalid content type".

## Root Cause

Middleware `validateContentType` di `whatsapp/middleware/securityMiddleware.js` memvalidasi Content-Type header untuk semua request PUT, POST, dan PATCH. Endpoint mark as read tidak mengirim body, tetapi middleware masih mengharapkan Content-Type header yang valid.

## Solution

### 1. Backend Fix - Update Security Middleware

**File**: `whatsapp/middleware/securityMiddleware.js`

**Perubahan**:

- Menambah `PUT` ke dalam list method yang di-skip jika tidak ada body (Content-Length: 0)
- Menambah detail error message untuk debugging

```javascript
// Skip validation for PATCH, PUT requests with no body (Content-Length: 0 or undefined)
if (
  ["PATCH", "POST", "PUT"].includes(req.method) &&
  (!contentLength || contentLength === "0")
) {
  return next();
}
```

### 2. Frontend Fix - Update Chat Service

**File**: `wa-flow-manager/src/services/chat.ts`

**Perubahan**:

- Menambah explicit Content-Type header dan empty body untuk PUT request
- Menambah URL encoding untuk handle karakter khusus seperti `@` di contact name

```typescript
markAsRead: async (sessionId: string, contactName: string): Promise<void> => {
  // Encode contact name to handle special characters like @
  const encodedContactName = encodeURIComponent(contactName);
  return api
    .put(
      `/chats/${sessionId}/${encodedContactName}/read`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    )
    .then((res) => {
      console.log("Messages marked as read:", res.data);
    })
    .catch((err) => {
      console.error("Error marking messages as read:", err);
      throw err;
    });
};
```

## Testing

### Manual Test Script

**File**: `whatsapp/test-mark-as-read.js`

Jalankan dengan:

```bash
cd whatsapp
node test-mark-as-read.js
```

### Expected Response

```json
{
  "status": "success",
  "message": "Messages marked as read"
}
```

## API Usage

```bash
# With URL encoding for @ character
curl -X PUT \
  "http://localhost:3000/chats/testing/6285888086764%40s.whatsapp.net/read" \
  -H "Content-Type: application/json" \
  -d "{}"
```

## Notes

- Endpoint ini tidak memerlukan body request
- Content-Type header tetap diperlukan untuk konsistensi dengan security middleware
- Empty object `{}` dikirim sebagai body untuk memenuhi requirement middleware
- Middleware sekarang lebih permissive untuk PUT request tanpa body
