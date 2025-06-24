// socket.js
const { Server } = require('socket.io');
const http = require('http');
let io;

function initSocket(server) {
  if (!io) {
    io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
      }
    });
  }
  return io;
}

function getSocket() {
  if (!io) {
    throw new Error('Socket.io has not been initialized.');
  }
  return io;
}

module.exports = { initSocket, getSocket };
