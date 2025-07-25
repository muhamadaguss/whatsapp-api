#!/bin/bash

echo "🧪 Testing User Management with curl..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Login to get token
echo "1️⃣ Getting login token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"username":"admin","password":"password"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo -e "   ${GREEN}✅ Login successful${NC}"
  echo "   🎫 Token: ${TOKEN:0:30}..."
else
  echo -e "   ${RED}❌ Login failed${NC}"
  echo "   📝 Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""

# 2. Test CORS preflight
echo "2️⃣ Testing CORS preflight..."
PREFLIGHT_RESPONSE=$(curl -s -i -X OPTIONS http://localhost:3000/user/updateActive/1 \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization")

if echo "$PREFLIGHT_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
  echo -e "   ${GREEN}✅ CORS preflight successful${NC}"
  echo "$PREFLIGHT_RESPONSE" | grep "Access-Control-Allow-" | sed 's/^/   📋 /'
else
  echo -e "   ${RED}❌ CORS preflight failed${NC}"
  echo "$PREFLIGHT_RESPONSE" | head -10 | sed 's/^/   📝 /'
fi

echo ""

# 3. Test user management request
echo "3️⃣ Testing user management request..."
USER_RESPONSE=$(curl -s -i -X PATCH http://localhost:3000/user/updateActive/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://localhost:8080")

HTTP_STATUS=$(echo "$USER_RESPONSE" | head -1 | cut -d' ' -f2)

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "   ${GREEN}✅ User management request successful${NC}"
  echo "   📊 HTTP Status: $HTTP_STATUS"
  echo "$USER_RESPONSE" | tail -1 | jq '.' 2>/dev/null | sed 's/^/   📝 /' || echo "$USER_RESPONSE" | tail -1 | sed 's/^/   📝 /'
else
  echo -e "   ${RED}❌ User management request failed${NC}"
  echo "   📊 HTTP Status: $HTTP_STATUS"
  echo "$USER_RESPONSE" | sed 's/^/   📝 /'
fi

echo ""

# 4. Test without Origin header (should work)
echo "4️⃣ Testing without Origin header..."
NO_ORIGIN_RESPONSE=$(curl -s -i -X PATCH http://localhost:3000/user/updateActive/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

NO_ORIGIN_STATUS=$(echo "$NO_ORIGIN_RESPONSE" | head -1 | cut -d' ' -f2)

if [ "$NO_ORIGIN_STATUS" = "200" ]; then
  echo -e "   ${GREEN}✅ Request without Origin successful${NC}"
  echo "   📊 HTTP Status: $NO_ORIGIN_STATUS"
else
  echo -e "   ${RED}❌ Request without Origin failed${NC}"
  echo "   📊 HTTP Status: $NO_ORIGIN_STATUS"
  echo "$NO_ORIGIN_RESPONSE" | head -5 | sed 's/^/   📝 /'
fi

echo ""

# 5. Test with unauthorized origin
echo "5️⃣ Testing with unauthorized origin..."
UNAUTH_RESPONSE=$(curl -s -i -X PATCH http://localhost:3000/user/updateActive/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://unauthorized.com")

UNAUTH_STATUS=$(echo "$UNAUTH_RESPONSE" | head -1 | cut -d' ' -f2)

if [ "$UNAUTH_STATUS" = "403" ]; then
  echo -e "   ${GREEN}✅ Unauthorized origin correctly blocked${NC}"
  echo "   📊 HTTP Status: $UNAUTH_STATUS"
else
  echo -e "   ${YELLOW}⚠️ Unexpected response for unauthorized origin${NC}"
  echo "   📊 HTTP Status: $UNAUTH_STATUS"
  echo "$UNAUTH_RESPONSE" | head -5 | sed 's/^/   📝 /'
fi

echo ""
echo "🎉 curl testing completed!"
echo ""
echo "💡 If curl tests pass but browser fails:"
echo "   1. Check browser Network tab for exact Origin header"
echo "   2. Clear browser cache and cookies"
echo "   3. Ensure frontend sends credentials: true"
echo "   4. Check for browser extensions blocking requests"