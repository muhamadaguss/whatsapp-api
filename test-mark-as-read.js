const axios = require("axios");

async function testMarkAsRead() {
  const baseURL = "http://localhost:3000"; // Adjust port if needed
  const sessionId = "testing";
  const contactName = "6285888086764@s.whatsapp.net";
  const encodedContactName = encodeURIComponent(contactName);

  try {
    console.log("Testing mark as read endpoint...");
    console.log(`Original contact: ${contactName}`);
    console.log(`Encoded contact: ${encodedContactName}`);
    console.log(
      `URL: ${baseURL}/chats/${sessionId}/${encodedContactName}/read`
    );

    const response = await axios.put(
      `${baseURL}/chats/${sessionId}/${encodedContactName}/read`,
      {}, // Empty body
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Success!");
    console.log("Response:", response.data);
  } catch (error) {
    console.log("❌ Error:");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
      console.log("Headers:", error.response.headers);
    } else {
      console.log("Error message:", error.message);
    }
  }
}

testMarkAsRead();
