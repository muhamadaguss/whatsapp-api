// Test controller logic without server
const ChatMessage = require("./models/chatModel");
const { markMessagesAsRead } = require("./controllers/chatController");

// Mock request and response objects
const mockReq = {
  params: {
    sessionId: "testing",
    contactName: "6285888086764@s.whatsapp.net",
  },
};

const mockRes = {
  status: function (code) {
    this.statusCode = code;
    return this;
  },
  json: function (data) {
    this.data = data;
    return this;
  },
};

async function testControllerLogic() {
  try {
    console.log("Testing controller logic...");
    console.log("Request params:", mockReq.params);

    // Test the controller function
    await markMessagesAsRead(mockReq, mockRes);

    console.log("✅ Controller executed successfully!");
    console.log("Response status:", mockRes.statusCode);
    console.log("Response data:", mockRes.data);
  } catch (error) {
    console.log("❌ Controller error:");
    console.log("Error:", error.message);
    console.log("Stack:", error.stack);
  }
}

testControllerLogic();
