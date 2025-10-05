# 🧪 TESTING GUIDE - Anti-Ban Enhancement System

**Project**: WhatsApp Blast Anti-Ban Enhancement  
**Version**: 1.0.0  
**Last Updated**: $(date)

---

## 📋 PRE-TESTING CHECKLIST

### Backend Setup:
- [ ] Node.js installed (v16+ recommended)
- [ ] **PostgreSQL** running (PRIMARY DATABASE - REQUIRED for ALL backend APIs)
- [ ] MongoDB running (optional - for advanced analytics only)
- [ ] Environment variables configured
- [ ] Dependencies installed: `cd whatsapp && npm install`

### Frontend Setup:
- [ ] Node.js installed
- [ ] Dependencies installed: `cd wa-flow-manager && npm install`
- [ ] API base URL configured in `.env`

---

## 🔧 BACKEND TESTING

### 1. Syntax Verification

Run syntax checks for all new files:

```bash
cd whatsapp

# Check Risk Assessment Service
node --check services/riskAssessmentService.js

# Check Account Health Service  
node --check services/accountHealthService.js

# Check Analytics Service
node --check services/analyticsService.js

# Check Controllers
node --check controllers/riskAssessmentController.js
node --check controllers/accountHealthController.js
node --check controllers/analyticsController.js

# Check Routes
node --check routes/riskAssessment.js
node --check routes/accountHealth.js
node --check routes/analytics.js

# Check main app
node --check index.js
```

**Expected Result**: No errors, silent success

---

### 2. Start Backend Server

```bash
cd whatsapp
npm start
# or
node index.js
```

**Expected Output:**
```
🚀 Server running on port 3000
🔌 Socket.IO initialized
✅ PostgreSQL connected (Sequelize) - PRIMARY DATABASE
✅ MongoDB connected (Optional - Advanced Analytics)
📡 Risk Assessment API registered (PostgreSQL)
📡 Account Health API registered (PostgreSQL)
📡 Analytics API registered (PostgreSQL + MongoDB)
```

---

### 3. API Testing with cURL

#### **Risk Assessment API:**

```bash
# Get risk assessment (replace SESSION_ID and TOKEN)
curl -X GET http://localhost:3000/api/blast/SESSION_ID/risk-assessment \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get risk history
curl -X GET http://localhost:3000/api/blast/SESSION_ID/risk-history?limit=50 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Execute auto-action
curl -X POST http://localhost:3000/api/blast/SESSION_ID/auto-action \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "pause", "reason": "Manual test"}'

# Get risk factors
curl -X GET http://localhost:3000/api/blast/SESSION_ID/risk-factors \
  -H "Authorization: Bearer YOUR_TOKEN"

# Refresh assessment
curl -X POST http://localhost:3000/api/blast/SESSION_ID/risk-assessment/refresh \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get recommendations
curl -X GET http://localhost:3000/api/blast/SESSION_ID/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### **Account Health API:**

```bash
# Get health status
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get health history
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health/history?days=7 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Execute health action
curl -X POST http://localhost:3000/api/whatsapp/SESSION_ID/health/action \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "rest", "duration": 24}'

# Get health components
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health/components \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get warnings
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health/warnings \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get recommendations
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"

# Refresh health
curl -X POST http://localhost:3000/api/whatsapp/SESSION_ID/health/refresh \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountAge": 30}'

# Get trends
curl -X GET http://localhost:3000/api/whatsapp/SESSION_ID/health/trends?days=7 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### **Analytics API:**

```bash
# Get dashboard analytics
curl -X GET http://localhost:3000/api/blast/analytics/dashboard?days=30 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get campaign analytics
curl -X GET http://localhost:3000/api/blast/analytics/SESSION_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Compare campaigns
curl -X POST http://localhost:3000/api/blast/analytics/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionIds": ["SESSION_ID_1", "SESSION_ID_2"]}'

# Best time analysis
curl -X GET http://localhost:3000/api/blast/analytics/best-time/ACCOUNT_ID?days=30 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Export report
curl -X POST http://localhost:3000/api/blast/analytics/SESSION_ID/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "csv"}' \
  --output campaign-report.csv
```

---

### 4. Database Verification

#### **PostgreSQL (Primary Database):**

```bash
# Connect to PostgreSQL
psql -U your_username -d whatsapp_db

# List all tables
\dt

# Check BlastSessions table
SELECT * FROM "BlastSessions" LIMIT 5;

# Check BlastMessages table
SELECT * FROM "BlastMessages" LIMIT 5;

# Count records
SELECT COUNT(*) FROM "BlastSessions";
SELECT COUNT(*) FROM "BlastMessages";

# Check account metadata
SELECT * FROM "AccountMetadata" LIMIT 5;

# Exit
\q
```

#### **MongoDB (Analytics Data - Optional):**

```bash
# Connect to MongoDB
mongosh

# Select database
use whatsapp_blast_db

# Check BlastSession collection
db.blastsessions.find().limit(5)

# Check BlastMessage collection
db.blastmessages.find().limit(5)

# Count documents
db.blastsessions.countDocuments()
db.blastmessages.countDocuments()
```

**Note:** The system uses a **hybrid database approach**:
- **PostgreSQL** (Sequelize) - **PRIMARY DATABASE** for ALL core operations:
  - Blast sessions & messages
  - Account metadata & health
  - Risk assessment history
  - Campaign analytics
- **MongoDB** (Mongoose) - **OPTIONAL** for advanced analytics only:
  - Historical pattern analysis
  - Best time recommendations
  - Can work without MongoDB (falls back to PostgreSQL)

---

### 5. WebSocket Testing

Open browser console and test WebSocket:

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket');
});

socket.on('account-health-update', (data) => {
  console.log('🏥 Health update:', data);
});

socket.on('risk-update', (data) => {
  console.log('⚠️ Risk update:', data);
});
```

---

## 🎨 FRONTEND TESTING

### 1. Build Verification

```bash
cd wa-flow-manager

# TypeScript check
npm run type-check
# or
npx tsc --noEmit

# Build production
npm run build

# Preview build
npm run preview
```

**Expected Result**: 
- No TypeScript errors
- Build completes successfully
- `dist/` folder created

---

### 2. Development Server

```bash
cd wa-flow-manager
npm run dev
```

**Expected Output:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

### 3. Page Navigation Testing

Open browser: `http://localhost:5173`

#### **Test Pages:**

1. **Analytics Dashboard** (`/analytics-dashboard`)
   - [ ] Page loads without errors
   - [ ] Dashboard cards display data
   - [ ] Campaign selector works
   - [ ] Charts render (Pie, Bar, Line)
   - [ ] Tab switching works (Overview, Trends, Performance, Errors)
   - [ ] Export CSV button works
   - [ ] Time range selector updates data

2. **Historical Risk Tracking** (`/risk-tracking`)
   - [ ] Page loads without errors
   - [ ] Campaign selector works
   - [ ] Risk timeline area chart renders
   - [ ] Trend cards show data (4 cards)
   - [ ] Warning events display
   - [ ] Risk levels legend visible
   - [ ] Time range selector works (1/3/7/30 days)

3. **Campaign Comparison** (`/campaign-comparison`)
   - [ ] Page loads without errors
   - [ ] Campaign list displays with checkboxes
   - [ ] Can select 2-4 campaigns
   - [ ] Compare button works
   - [ ] Best campaign highlighted with trophy
   - [ ] Comparison table shows all metrics
   - [ ] Bar chart renders correctly
   - [ ] Averages cards display
   - [ ] Best practices section shows

4. **Best Time Analyzer** (`/best-time-analyzer`)
   - [ ] Page loads without errors
   - [ ] Account selector works
   - [ ] Hourly heatmap renders (24 cells)
   - [ ] Color coding correct (5 levels)
   - [ ] Day of week grid displays
   - [ ] Top 5 best hours list shows
   - [ ] Recommendations panel displays
   - [ ] Time range selector works (7/30/90 days)

---

### 4. Browser Console Check

Open Developer Tools (F12) and check:

- [ ] No console errors
- [ ] API calls succeed (Network tab)
- [ ] No 404 errors for routes
- [ ] No TypeScript errors
- [ ] Charts library loaded (Recharts)

---

### 5. Responsive Design Testing

Test on different screen sizes:

- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

**Check:**
- [ ] Layout adapts correctly
- [ ] Charts remain readable
- [ ] Tables scroll horizontally on mobile
- [ ] Buttons accessible
- [ ] Text readable

---

### 6. Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## 🔗 INTEGRATION TESTING

### 1. End-to-End Flow

**Scenario 1: Risk Assessment Flow**
1. [ ] Start a blast campaign
2. [ ] Check risk assessment updates in real-time
3. [ ] Verify risk level changes
4. [ ] Execute auto-action (pause/stop)
5. [ ] Check risk history updates
6. [ ] Verify WebSocket events

**Scenario 2: Health Monitoring Flow**
1. [ ] Connect WhatsApp account
2. [ ] Send messages via blast
3. [ ] Check health score updates
4. [ ] Verify health components calculation
5. [ ] Check warning log
6. [ ] Execute health action (rest)
7. [ ] Verify trend analysis

**Scenario 3: Analytics Flow**
1. [ ] Complete multiple blast campaigns
2. [ ] View dashboard analytics
3. [ ] Select and view campaign details
4. [ ] Compare 2-3 campaigns
5. [ ] Check best time analysis
6. [ ] Export CSV report
7. [ ] Verify all data accurate

---

### 2. Authentication Testing

- [ ] Login required for all pages
- [ ] Token stored in localStorage
- [ ] API calls include Authorization header
- [ ] 401 errors redirect to login
- [ ] Logout clears token

---

### 3. Error Handling

**Test scenarios:**
- [ ] API server down (connection error)
- [ ] Invalid session ID (404 error)
- [ ] Unauthorized access (401 error)
- [ ] Invalid data format (400 error)
- [ ] Server error (500 error)

**Expected behavior:**
- Toast notifications display errors
- User-friendly error messages
- No app crashes
- Graceful degradation

---

## 📊 PERFORMANCE TESTING

### Backend Performance:

```bash
# Install Apache Bench (if not installed)
# macOS: brew install httpd
# Ubuntu: sudo apt-get install apache2-utils

# Test Risk Assessment API
ab -n 100 -c 10 -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/blast/SESSION_ID/risk-assessment

# Test Health API
ab -n 100 -c 10 -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/whatsapp/SESSION_ID/health
```

**Expected Result:**
- Response time < 200ms for cached requests
- Response time < 1000ms for fresh calculations
- No failed requests
- Stable memory usage

---

### Frontend Performance:

**Lighthouse Audit:**
1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Run audit for each page
4. Check scores:
   - [ ] Performance > 80
   - [ ] Accessibility > 90
   - [ ] Best Practices > 90
   - [ ] SEO > 80

---

## 🐛 COMMON ISSUES & SOLUTIONS

### Backend Issues:

**Issue**: "Cannot find module"
```bash
# Solution:
cd whatsapp
npm install
```

**Issue**: "PostgreSQL connection failed"
```bash
# Solution:
# Check PostgreSQL is running
psql -U your_username -l
# Check connection string in .env
# DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```

**Issue**: "MongoDB connection failed" (Advanced Analytics)
```bash
# Solution:
# MongoDB is OPTIONAL - system works without it
# Check if MongoDB is running (only for advanced analytics)
mongosh
# Check MONGODB_URI in .env
# All features work with PostgreSQL only (MongoDB just adds advanced analytics)
```

**Issue**: "Port 3000 already in use"
```bash
# Solution:
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

---

### Frontend Issues:

**Issue**: "Module not found"
```bash
# Solution:
cd wa-flow-manager
rm -rf node_modules package-lock.json
npm install
```

**Issue**: "TypeScript errors"
```bash
# Solution:
npm run type-check
# Fix reported errors
```

**Issue**: "Vite build fails"
```bash
# Solution:
# Clear cache
rm -rf dist .vite
npm run build
```

---

## ✅ FINAL CHECKLIST

### Before Deployment:

- [ ] All backend syntax checks pass
- [ ] All API endpoints tested and working
- [ ] Frontend build completes without errors
- [ ] No TypeScript compilation errors
- [ ] All 4 new pages accessible
- [ ] Charts render correctly
- [ ] API integrations working
- [ ] Authentication working
- [ ] Error handling tested
- [ ] Responsive design verified
- [ ] Browser compatibility confirmed
- [ ] Performance acceptable
- [ ] WebSocket connections stable
- [ ] Database queries optimized
- [ ] Security checks passed

### Documentation:

- [ ] API documentation complete
- [ ] User guide created
- [ ] Deployment guide ready
- [ ] Environment variables documented
- [ ] Database schema documented

---

## 📝 TEST REPORT TEMPLATE

```markdown
# Test Report - Anti-Ban Enhancement System

**Date**: $(date)  
**Tester**: [Your Name]  
**Version**: 1.0.0

## Backend Testing
- [ ] Syntax Checks: PASS / FAIL
- [ ] API Endpoints: PASS / FAIL
- [ ] Database Operations: PASS / FAIL
- [ ] WebSocket: PASS / FAIL

## Frontend Testing
- [ ] Build: PASS / FAIL
- [ ] Page Navigation: PASS / FAIL
- [ ] Charts Rendering: PASS / FAIL
- [ ] API Integration: PASS / FAIL

## Integration Testing
- [ ] End-to-End Flows: PASS / FAIL
- [ ] Authentication: PASS / FAIL
- [ ] Error Handling: PASS / FAIL

## Performance
- [ ] Backend Response Time: [avg ms]
- [ ] Frontend Load Time: [avg ms]
- [ ] Lighthouse Score: [score]

## Issues Found:
1. [Description]
2. [Description]

## Recommendations:
1. [Recommendation]
2. [Recommendation]

**Overall Status**: PASS / FAIL
```

---

## 🚀 NEXT STEPS AFTER TESTING

1. ✅ Fix any issues found
2. ✅ Re-test failed scenarios
3. ✅ Deploy to staging environment
4. ✅ User acceptance testing (UAT)
5. ✅ Deploy to production
6. ✅ Monitor in production
7. ✅ Gather user feedback

---

**END OF TESTING GUIDE**

Last Updated: $(date)  
For questions: [Your Contact]
