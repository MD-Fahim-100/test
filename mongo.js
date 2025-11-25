const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ephemeral_chat', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// ================= Schemas =================
const messageSchema = new mongoose.Schema({
  room: { type: String, required: true },
  text: { type: String, required: true },
  senderId: { type: String },
  senderName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expireAt: { type: Date, required: true },
  localId: { type: String }
});

const Message = mongoose.model('Message', messageSchema);

module.exports = { connectDB, Message };
