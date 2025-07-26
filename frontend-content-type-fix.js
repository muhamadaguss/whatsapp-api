// ✅ SOLUSI FRONTEND - Content-Type Fix

// 1. Axios Configuration
const toggleUserStatus = async (userId) => {
  try {
    const response = await axios.patch(
      `/user/updateActive/${userId}`,
      {}, // Empty body tapi tetap kirim
      {
        headers: {
          "Content-Type": "application/json", // ✅ WAJIB untuk PATCH
          Authorization: `Bearer ${token}`,
        },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw error;
  }
};

// 2. Fetch Configuration
const toggleUserStatus = async (userId) => {
  try {
    const response = await fetch(`/user/updateActive/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json", // ✅ WAJIB untuk PATCH
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}), // ✅ Kirim empty object
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

// 3. Axios Instance Configuration
const api = axios.create({
  baseURL: "http://localhost:3000",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json", // ✅ Default Content-Type
  },
});

// Usage
const toggleUserStatus = async (userId) => {
  const response = await api.patch(`/user/updateActive/${userId}`, {});
  return response.data;
};

// 4. Global Axios Defaults
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.withCredentials = true;
