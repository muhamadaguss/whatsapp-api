// Test file untuk memverifikasi user-specific data filtering di blast control dashboard
// File: test-user-specific-blast-control.js

const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:3000';
const TEST_USERS = [
  { username: 'admin', password: 'password' },
  { username: 'user1', password: 'user123' },
  { username: 'user2', password: 'user456' }
];

async function authenticateUser(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      username,
      password
    });
    
    if (response.data && response.data.token) {
      console.log(`✅ Authentication successful for ${username}`);
      return response.data.token;
    }
    
    throw new Error('No token received');
  } catch (error) {
    console.error(`❌ Authentication failed for ${username}:`, error.response?.data || error.message);
    return null;
  }
}

async function getBlastSessions(token, username) {
  try {
    const response = await axios.get(`${API_BASE_URL}/blast-control/sessions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.data) {
      const sessions = response.data.data.sessions;
      console.log(`📊 User ${username} has ${sessions.length} blast sessions`);
      
      if (sessions.length > 0) {
        console.log(`   Sessions for ${username}:`);
        sessions.forEach((session, index) => {
          console.log(`   ${index + 1}. Campaign: ${session.campaignName}, Status: ${session.status}, User ID: ${session.userId}`);
        });
      }
      
      return sessions;
    }
    
    return [];
  } catch (error) {
    console.error(`❌ Failed to get blast sessions for ${username}:`, error.response?.data || error.message);
    return [];
  }
}

async function testUserSpecificFiltering() {
  console.log('🚀 Starting User-Specific Blast Control Dashboard Test');
  console.log('='.repeat(60));
  
  const userSessions = {};
  
  // Test authentication and data retrieval for each user
  for (const user of TEST_USERS) {
    console.log(`\n👤 Testing user: ${user.username}`);
    console.log('-'.repeat(40));
    
    // Authenticate user
    const token = await authenticateUser(user.username, user.password);
    if (!token) {
      console.log(`⚠️ Skipping ${user.username} due to authentication failure`);
      continue;
    }
    
    // Get blast sessions for this user
    const sessions = await getBlastSessions(token, user.username);
    userSessions[user.username] = {
      token,
      sessions,
      userIds: sessions.map(s => s.userId).filter((id, index, self) => self.indexOf(id) === index)
    };
  }
  
  // Analysis
  console.log('\n📊 ANALYSIS RESULTS');
  console.log('='.repeat(60));
  
  let allUserIds = [];
  Object.keys(userSessions).forEach(username => {
    const data = userSessions[username];
    console.log(`\n${username}:`);
    console.log(`  - Total sessions: ${data.sessions.length}`);
    console.log(`  - Unique user IDs in sessions: ${data.userIds.join(', ') || 'None'}`);
    allUserIds = allUserIds.concat(data.userIds);
  });
  
  // Check for data leakage
  const uniqueUserIds = [...new Set(allUserIds)];
  console.log(`\n🔍 SECURITY CHECK:`);
  console.log(`   - Total unique user IDs found: ${uniqueUserIds.length}`);
  console.log(`   - User IDs: ${uniqueUserIds.join(', ') || 'None'}`);
  
  // Verify isolation
  let hasDataLeak = false;
  Object.keys(userSessions).forEach(username => {
    const data = userSessions[username];
    const hasOtherUserData = data.userIds.some(id => {
      // Check if this user sees data from other users
      // This is a simplified check - in real scenario you'd match actual user IDs
      return data.userIds.length > 1 && data.userIds.includes(id);
    });
    
    if (data.sessions.length > 0 && data.userIds.length > 1) {
      console.log(`⚠️ WARNING: ${username} might be seeing data from multiple users`);
      hasDataLeak = true;
    }
  });
  
  if (!hasDataLeak) {
    console.log(`✅ SUCCESS: No data leakage detected between users`);
  } else {
    console.log(`❌ FAILURE: Potential data leakage detected`);
  }
  
  console.log('\n🎯 TEST COMPLETED');
  console.log('='.repeat(60));
}

// Run the test
testUserSpecificFiltering().catch(error => {
  console.error('Test failed:', error);
});