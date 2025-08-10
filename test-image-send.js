const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

// Test script to send image message
async function testImageSend() {
  try {
    // Create a simple test image (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x5c, 0xc2, 0x8a, 0x8b, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const testImagePath = path.join(__dirname, "test-image.png");
    fs.writeFileSync(testImagePath, testImageBuffer);

    const formData = new FormData();
    formData.append("phone", "6281234567890"); // Replace with test phone number
    formData.append("sessionId", "test-session"); // Replace with actual session ID
    formData.append("messageType", "image");
    formData.append("message", "Test image caption");
    formData.append("image", fs.createReadStream(testImagePath));

    console.log("🔄 Testing image send...");

    const response = await axios.post(
      "http://localhost:3000/whatsapp/send-message",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: "Bearer YOUR_TOKEN_HERE", // Replace with actual token
        },
      }
    );

    console.log("✅ Image send test result:", response.data);

    // Cleanup
    fs.unlinkSync(testImagePath);
  } catch (error) {
    console.error(
      "❌ Image send test failed:",
      error.response?.data || error.message
    );
  }
}

// Only run if called directly
if (require.main === module) {
  testImageSend();
}

module.exports = { testImageSend };
