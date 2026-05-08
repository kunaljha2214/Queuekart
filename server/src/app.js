const http = require('http');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');
require('./config/env');
const { connectDB } = require('./config/db');
const { loadEnv } = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const { registerSocketHandlers } = require('./socket');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const queueRoutes = require('./routes/queueRoutes');
const orderItemRoutes = require('./routes/orderItemRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adRoutes = require('./routes/adRoutes');

const env = loadEnv();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.clientOrigin === '*' ? true : env.clientOrigin,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);
registerSocketHandlers(io);

app.use(
  cors({
    origin: env.clientOrigin === '*' ? true : env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/shops/:shopId/items', orderItemRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ads', adRoutes);

app.use(errorHandler);

async function start() {
  if (!env.jwtSecret) {
    console.error('JWT_SECRET is required');
    process.exit(1);
  }
  await connectDB();
  server.listen(env.port, () => {
    console.log(`QueueKart API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
