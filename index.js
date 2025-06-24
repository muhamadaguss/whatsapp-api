require('dotenv').config()
const cors = require('cors')
const express = require('express')
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser')
const whatsappRoutes = require('./routes/whatsappRoutes')
const authRoutes = require('./routes/authRoutes')
const downloadRoutes = require('./routes/downloadRoutes')
const campaignRoutes = require('./routes/campaignRoutes')
const userRoutes = require('./routes/userRoutes')
const menuRoutes = require('./routes/menuRoutes')
const templateRoutes = require('./routes/templateRoutes')
const sequelize = require('./models/db')
const { loadExistingSessions } = require('./auth/session')
const logger = require('./utils/logger'); // Mengimpor logger
const { initSocket } = require('./auth/socket');

const app = express()
const port = process.env.PORT || 3001

const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://whatsapp-web.jobmarket.my.id',
  'http://localhost:8081',
  'http://127.0.0.1:8081'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}))

app.use(bodyParser.json())
app.use('/whatsapp', whatsappRoutes)
app.use('/auth',authRoutes)
app.use('/download',downloadRoutes)
app.use('/campaign',campaignRoutes)
app.use('/user',userRoutes)
app.use('/menus',menuRoutes)
app.use('/templates',templateRoutes)

// Inisialisasi dan jalankan socket.io
const server = http.createServer(app); // Gunakan app di sini
const io = initSocket(server);

io.on('connection', (socket) => {
  logger.info(`✅ A user connected via socket.io. ID: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`❌ User disconnected: ${socket.id}`);
  });
});

sequelize.sync({ alter: true }) // alter: true untuk menyesuaikan tabel dengan model jika diperlukan
  .then(() => {
    logger.info('Database synced')
  })
  .catch((err) => {
    logger.error('Error syncing database:', err)
  })


  loadExistingSessions() // Load session yang sudah ada di folder sessions
  .then(() => {
    logger.info('Semua session yang ada sudah dimuat')
  })
  .catch((err) => {
    logger.error('Error loading existing sessions:', err)
  })

// Start koneksi WhatsApp dan server Express
// startWhatsApp().then(() => {
  server.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`)
  })
// })
