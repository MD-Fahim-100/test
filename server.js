require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB, Room, Message } = require('./mongo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Express setup
app.set('view engine', 'ejs');
app.use(express.static('./public'));

(async () => {
  await connectDB();

  // ROUTES
  app.get('/', (req, res) => res.render('main'));

  // SOCKET.IO
  io.on('connection', (socket) => {

    // User joins a room
    socket.on('joinRoom', async (room) => {
      socket.join(room);

      // Send last 100 messages
      const history = await Message.find({ room }).sort({ createdAt: 1 }).limit(100).lean();
      socket.emit('history', history);

      // System message (not saved in DB)
      socket.to(room).emit('message', {
        room,
        text: `A user joined the room => User-${socket.id.slice(0,6)}`,
        senderId: null,
        senderName: 'System',
        createdAt: new Date(),
        system: true
      });
    });

    // User leaves a room
    socket.on('leaveRoom', (room) => {
      socket.leave(room);

      socket.to(room).emit('message', {
        room,
        text: `A user left the room => User-${socket.id.slice(0,6)}`,
        senderId: null,
        senderName: 'System',
        createdAt: new Date(),
        system: true
      });
    });

    // Regular user messages
    socket.on('message', async ({ room, msg, localId }) => {
      if (!room || !msg) return;

      const expireAt = new Date(Date.now() + 3 * 60 * 1000); // 3 min TTL

      const saved = await Message.create({
        room,
        text: msg,
        senderId: socket.id,
        senderName: `User-${socket.id.slice(0,6)}`,
        createdAt: new Date(),
        expireAt,
        localId
      });

      io.to(room).emit('message', saved.toObject());
    });

    // Typing indicator
    socket.on('typing', ({ room }) => {
      if (room) socket.to(room).emit('typing', { room, senderId: socket.id });
    });

    socket.on('stopTyping', ({ room }) => {
      if (room) socket.to(room).emit('stopTyping', { room, senderId: socket.id });
    });

    // User disconnects
    socket.on('disconnect', () => {
      for (const room of socket.rooms) {
        if (room === socket.id) continue;

        socket.to(room).emit('message', {
          room,
          text: `A user disconnected => User-${socket.id.slice(0,6)}`,
          senderId: null,
          senderName: 'System',
          createdAt: new Date(),
          system: true
        });
      }
    });
  });

  // ================= Message Destroy Checker =================
  setInterval(async () => {
    const now = new Date();
    const expiredMessages = await Message.find({ expireAt: { $lte: now } }).lean();

    if (expiredMessages.length) {
      for (const msg of expiredMessages) {
        io.to(msg.room).emit('destroyMessage', { _id: msg._id, localId: msg.localId });
      }
      await Message.deleteMany({ _id: { $in: expiredMessages.map(m => m._id) } });
    }
  }, 10000);

  // ================= START SERVER =================
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://192.168.31.40:${PORT}`);
  });

})();
