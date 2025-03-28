const { Server } = require("socket.io")
  , { createAdapter } = require("@socket.io/redis-adapter")
  , { IOREDIS, NODE_REDIS } = require("../utils/constants")
  , pubClient = require("../connections/redisConnections")
  , authSocket = require('../admin-backend/routes/middlewares/authSocket');

exports.init = (server) => {
  const io = new Server(server, {
    cors: {
      // origin: ["http://localhost:4200", "https://adev.allow24.in"],
      methods: ["GET", "POST"]
    },
    transports: ['websocket'],
    // rejectUnauthorized: false,
    // path: '/socketchannel',
    // reconnectionDelay: 1000,
    // reconnection: true,
    // reconnectionAttempts: 10,
    // agent: false,
  });

  const subClient = pubClient.duplicate();
  if (process.env.REDIS_CONNECTION == NODE_REDIS)
    Promise.all([subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
    });
  if (process.env.REDIS_CONNECTION == IOREDIS)
    io.adapter(createAdapter(pubClient, subClient));
  io.use(authSocket);
  return io;
}