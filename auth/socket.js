// socket.js
const { Server } = require("socket.io");
const http = require("http");
let io;

function initSocket(server) {
  if (!io) {
    // Get allowed origins from environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [
          "http://localhost:8080",
          "http://127.0.0.1:8080",
          "https://whatsapp-web.jobmarket.my.id",
          "http://localhost:8081",
          "http://127.0.0.1:8081",
        ];

    io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true, // Allow Engine.IO v3 clients
      pingTimeout: 60000,
      pingInterval: 25000,
    });
  }
  return io;
}

function getSocket() {
  if (!io) {
    throw new Error("Socket.io has not been initialized.");
  }
  return io;
}

module.exports = { initSocket, getSocket };
