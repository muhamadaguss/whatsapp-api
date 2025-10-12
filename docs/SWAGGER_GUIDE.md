# 📚 API Documentation with Swagger

## 🚀 Quick Start

### Access Swagger UI

Once the server is running, open your browser and navigate to:

```
http://localhost:3000/api-docs
```

You'll see an interactive API documentation interface where you can:
- 📖 Browse all available endpoints
- 🧪 Test APIs directly in the browser
- 📝 View request/response schemas
- 🔐 Authenticate with JWT tokens

### Get JSON Specification

To get the raw OpenAPI 3.0 specification:

```
http://localhost:3000/api-docs.json
```

---

## 🔐 Authentication

Most endpoints require authentication. Here's how to test protected endpoints:

### Step 1: Login

1. Go to **Authentication** section in Swagger UI
2. Find **POST /auth/login**
3. Click **"Try it out"**
4. Enter credentials:
   ```json
   {
     "email": "admin@example.com",
     "password": "password123"
   }
   ```
5. Click **Execute**
6. Copy the `token` from the response

### Step 2: Authorize

1. Click the **"Authorize" 🔒** button at the top of the page
2. Enter your token in the format: `Bearer <your_token_here>`
3. Click **"Authorize"**
4. Click **"Close"**

Now all subsequent requests will include your authentication token!

---

## 📋 API Categories

### 1. **Authentication** 🔑
- `POST /auth/login` - Login and get JWT token
- `POST /auth/register` - Register new user + organization
- `GET /auth/verify` - Verify JWT token
- `POST /auth/logout` - Logout (blacklist token)

### 2. **Organizations** 🏢
- `GET /api/organizations/current` - Get current organization
- `GET /api/organizations/{id}` - Get organization by ID
- `POST /api/organizations` - Create new organization
- `PUT /api/organizations/{id}` - Update organization
- `DELETE /api/organizations/{id}` - Delete organization
- `GET /api/organizations/{id}/stats` - Get organization statistics

### 3. **Subscriptions** 💳
- `GET /api/organizations/{orgId}/subscription` - Get current subscription
- `PUT /api/organizations/{orgId}/subscription` - Upgrade/downgrade plan
- `POST /api/organizations/{orgId}/subscription/cancel` - Cancel subscription
- `GET /api/organizations/{orgId}/subscription/plans` - List all plans
- `POST /api/organizations/{orgId}/subscription/renew` - Renew subscription

### 4. **Users & Teams** 👥
- `GET /api/organizations/{orgId}/users` - List team members
- `POST /api/organizations/{orgId}/users/invite` - Invite user
- `DELETE /api/organizations/{orgId}/users/{userId}` - Remove user
- `PUT /api/organizations/{orgId}/users/{userId}/role` - Change user role
- `POST /api/organizations/{orgId}/leave` - Leave organization

### 5. **Usage & Quotas** 📊
- `GET /api/organizations/{orgId}/usage` - Get usage metrics
- `GET /api/organizations/{orgId}/usage/quota` - Get quota limits
- `POST /api/organizations/{orgId}/usage/track` - Track usage event

### 6. **Templates** 📝
- `GET /templates` - List all templates
- `POST /templates` - Create new template
- `GET /templates/{id}` - Get template details
- `PUT /templates/{id}` - Update template
- `DELETE /templates/{id}` - Delete template

### 7. **Campaigns** 📤
- `GET /campaign` - List campaigns
- `POST /campaign` - Create campaign
- `GET /campaign/{id}` - Get campaign details
- `POST /campaign/start` - Start blast campaign

### 8. **WhatsApp** 📱
- `GET /whatsapp/sessions` - List WhatsApp sessions
- `POST /whatsapp/send-message` - Send single message
- `POST /whatsapp/upload` - Upload media file

### 9. **Analytics** 📈
- `GET /api/blast/analytics` - Get blast analytics
- `GET /api/whatsapp/account-health` - Get account health

---

## 🧪 Testing Examples

### Example 1: Create Organization

```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company",
    "email": "test@company.com",
    "phone": "+62812345678"
  }'
```

### Example 2: Upgrade Subscription

```bash
curl -X PUT http://localhost:3000/api/organizations/{orgId}/subscription \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": 3,
    "action": "upgrade"
  }'
```

### Example 3: Get Usage Metrics

```bash
curl -X GET http://localhost:3000/api/organizations/{orgId}/usage \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 4: Invite Team Member

```bash
curl -X POST http://localhost:3000/api/organizations/{orgId}/users/invite \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@example.com",
    "role": "member",
    "name": "John Doe"
  }'
```

---

## 🔍 Testing Multi-Tenancy

To test multi-tenant isolation:

1. **Create two users in different organizations**
   ```bash
   # User 1
   POST /auth/register
   {
     "name": "User One",
     "email": "user1@org1.com",
     "password": "pass123",
     "organizationName": "Organization 1"
   }
   
   # User 2
   POST /auth/register
   {
     "name": "User Two",
     "email": "user2@org2.com",
     "password": "pass123",
     "organizationName": "Organization 2"
   }
   ```

2. **Login as User 1** and create some templates

3. **Login as User 2** and list templates

4. **Verify** that User 2 cannot see User 1's templates ✅

---

## 📊 Testing Quota Limits

### Test Scenario: Free Plan Limits

1. **Register new user** (gets Free plan by default)
2. **Check quota**: `GET /api/organizations/{orgId}/usage/quota`
3. **Create templates** up to the limit (3 for Free plan)
4. **Try to create one more** → Should get 403 Quota Exceeded error

### Test Scenario: Upgrade Flow

1. **Check current usage**: `GET /api/organizations/{orgId}/usage`
2. **Upgrade to Pro plan**: `PUT /api/organizations/{orgId}/subscription`
3. **Verify new quotas**: Should now have higher limits
4. **Create more templates**: Should now be allowed

---

## 🔐 Security Testing

### Test Token Expiration

1. Login and get token
2. Wait for token expiration (check JWT_EXPIRES_IN in .env)
3. Try to make request with expired token
4. Should get 401 Unauthorized

### Test Token Blacklisting

1. Login and get token
2. Use token to access protected endpoint ✅
3. Logout: `POST /auth/logout`
4. Try to use same token again
5. Should get 401 "Token has been blacklisted"

### Test Role-Based Access Control

1. **As Member**: Try to invite users → Should fail (403)
2. **As Admin**: Try to invite users → Should succeed ✅
3. **As Admin**: Try to delete organization → Should fail (403)
4. **As Owner**: Try to delete organization → Should succeed ✅

---

## 📦 Response Schemas

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "details": { ... }
}
```

### Quota Exceeded Error
```json
{
  "error": "Quota Exceeded",
  "message": "You have reached your monthly message limit",
  "usage": 20000,
  "limit": 20000,
  "upgradeUrl": "/subscription/upgrade"
}
```

---

## 🎯 Common Status Codes

| Code | Meaning | When to Expect |
|------|---------|----------------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions or quota exceeded |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Internal server error |

---

## 🛠️ Development

### Adding New Endpoints

To document a new endpoint, add JSDoc comments above the route:

```javascript
/**
 * @swagger
 * /api/my-endpoint:
 *   get:
 *     tags: [My Category]
 *     summary: Short description
 *     description: Longer description
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/my-endpoint', myController.myMethod);
```

### Updating Swagger Config

Edit `config/swagger.js` to:
- Update API info (title, description, version)
- Add new servers
- Define new schemas
- Add new security schemes

---

## 📝 Notes

- **Authorization Required**: Most endpoints require Bearer token authentication
- **Multi-Tenancy**: All data is automatically filtered by organizationId
- **Quota Enforcement**: Some endpoints check quota before execution
- **Rate Limiting**: API has rate limiting (check response headers)
- **CORS**: Configured CORS allows requests from frontend origins

---

## 🔗 Related Documentation

- [SAAS_TRANSFORMATION_ROADMAP.md](../SAAS_TRANSFORMATION_ROADMAP.md) - Project roadmap
- [PHASE_6_SUMMARY.md](../PHASE_6_SUMMARY.md) - Testing summary
- [SECURITY_AUDIT_REPORT.md](../SECURITY_AUDIT_REPORT.md) - Security audit

---

## 💡 Tips

1. **Use "Try it out"** - Swagger UI lets you test APIs without writing code
2. **Check examples** - Each endpoint has example requests/responses
3. **Authorize once** - Use the Authorize button at the top for all requests
4. **Test edge cases** - Try invalid data to see error responses
5. **Monitor quota** - Check usage before hitting limits

---

**Happy Testing! 🚀**

For issues or questions, check the main README or contact the development team.
