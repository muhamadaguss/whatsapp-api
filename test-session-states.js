// Test script to simulate different session states
const { checkSessionHealth } = require("./utils/connectionHealth");

console.log("🧪 Testing Session Health with Different States");
console.log("==============================================\n");

// Test 1: Null socket
console.log("1. Testing null socket:");
const health1 = checkSessionHealth(null, "test-session");
console.log(`   Result: ${health1.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health1.issues.join(", ")}`);

// Test 2: Socket without user
console.log("\n2. Testing socket without user:");
const mockSocket2 = {
  sendMessage: () => {},
  ws: { readyState: 1 },
};
const health2 = checkSessionHealth(mockSocket2, "test-session");
console.log(`   Result: ${health2.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health2.issues.join(", ")}`);

// Test 3: Socket with user but unknown WebSocket state
console.log("\n3. Testing socket with user but unknown WebSocket state:");
const mockSocket3 = {
  sendMessage: () => {},
  user: { id: "test@s.whatsapp.net" },
  ws: { readyState: 99 }, // Unknown state
};
const health3 = checkSessionHealth(mockSocket3, "test-session");
console.log(`   Result: ${health3.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health3.issues.join(", ")}`);

// Test 4: Same as test 3 but with permissive mode
console.log("\n4. Testing same as #3 but with permissive mode:");
const health4 = checkSessionHealth(mockSocket3, "test-session", true);
console.log(`   Result: ${health4.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health4.issues.join(", ")}`);
console.log(`   Note: ${health4.details.note || "None"}`);

// Test 5: Socket without WebSocket but with user and sendMessage
console.log("\n5. Testing socket without WebSocket but functional:");
const mockSocket5 = {
  sendMessage: () => {},
  user: { id: "test@s.whatsapp.net" },
  // No ws property
};
const health5 = checkSessionHealth(mockSocket5, "test-session", true);
console.log(`   Result: ${health5.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health5.issues.join(", ")}`);
console.log(`   Note: ${health5.details.note || "None"}`);

// Test 6: Perfect healthy socket
console.log("\n6. Testing perfect healthy socket:");
const mockSocket6 = {
  sendMessage: () => {},
  user: { id: "test@s.whatsapp.net" },
  ws: { readyState: 1 }, // OPEN
};
const health6 = checkSessionHealth(mockSocket6, "test-session");
console.log(`   Result: ${health6.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health6.issues.join(", ")}`);

// Test 7: Connecting state
console.log("\n7. Testing connecting state:");
const mockSocket7 = {
  sendMessage: () => {},
  user: { id: "test@s.whatsapp.net" },
  ws: { readyState: 0 }, // CONNECTING
};
const health7 = checkSessionHealth(mockSocket7, "test-session", true);
console.log(`   Result: ${health7.isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
console.log(`   Issues: ${health7.issues.join(", ")}`);

console.log("\n📋 Summary:");
console.log("- Strict mode requires all checks to pass");
console.log(
  "- Permissive mode allows unknown WebSocket states if basic functionality exists"
);
console.log("- Critical issues: closed, not authenticated, not available");
console.log(
  "- Non-critical issues: connecting, unknown states with functionality"
);

console.log("\n🎯 Recommendation:");
console.log(
  "Use permissive mode for better compatibility with different Baileys versions"
);
console.log("and WhatsApp connection states while maintaining safety checks.");
