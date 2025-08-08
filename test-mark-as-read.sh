#!/bin/bash

echo "Testing mark as read endpoint..."
echo "Original URL: http://localhost:3000/chats/testing/6285888086764@s.whatsapp.net/read"
echo "Encoded URL: http://localhost:3000/chats/testing/6285888086764%40s.whatsapp.net/read"
echo ""

curl -X PUT \
  "http://localhost:3000/chats/testing/6285888086764%40s.whatsapp.net/read" \
  -H "Content-Type: application/json" \
  -d "{}" \
  -v

echo ""
echo "Test completed."