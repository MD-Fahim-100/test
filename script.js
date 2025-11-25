// ================= Socket.IO =================
const socket = io();

// ================= DOM Elements =================
const roomsContainer = document.querySelector('#roomsContainer');
const roomItems = document.querySelectorAll('.room-item');
const roomTitle = document.querySelector('#roomTitle');
const messagesDiv = document.querySelector('#messageFeed');
const inputMsg = document.querySelector('#messageInput');
const sendBtn = document.querySelector('#sendBtn');
const emojiBtn = document.querySelector('#emojiBtn');
const emojiPicker = document.querySelector('#emojiPicker');
const emojiGrid = document.querySelector('#emojiGrid');
const mobileMenuBtn = document.querySelector('#mobileMenuBtn');
const sidebar = document.querySelector('#sidebar');

let currentRoom = 'general';
const pendingLocalIds = new Map(); // localId -> DOM element

// ================= Utility =================
const formatTime = (ts = Date.now()) => {
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const scrollToBottom = () => messagesDiv.scrollTop = messagesDiv.scrollHeight;

// ================= Message DOM Helpers =================
const createMessageElement = ({ text, senderName = 'User', when = Date.now(), isMine = false, system = false, localId = null, _id = null }) => {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  if (system) msgDiv.classList.add('system');
  else msgDiv.classList.add(isMine ? 'mine' : 'other');

  if (localId) msgDiv.dataset.localid = localId;
  if (_id) msgDiv.dataset.id = _id;

  const avatarDiv = document.createElement('div');
  avatarDiv.classList.add('message-avatar');
  avatarDiv.textContent = system ? 'S' : (isMine ? 'Me' : (senderName ? senderName[0].toUpperCase() : 'U'));

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');

  if (!system) {
    const senderDiv = document.createElement('div');
    senderDiv.classList.add('message-sender');
    senderDiv.textContent = isMine ? 'Me' : senderName;
    contentDiv.appendChild(senderDiv);
  }

  const bubbleDiv = document.createElement('div');
  bubbleDiv.classList.add('message-bubble');

  const textDiv = document.createElement('div');
  textDiv.classList.add('message-text');
  textDiv.textContent = text;

  const timeDiv = document.createElement('div');
  timeDiv.classList.add('message-time');
  timeDiv.textContent = formatTime(when);

  bubbleDiv.append(textDiv, timeDiv);
  contentDiv.appendChild(bubbleDiv);
  msgDiv.append(avatarDiv, contentDiv);

  return msgDiv;
};

const scheduleMessageDeletion = (msgEl, createdAt = Date.now()) => {
  const TTL = 3 * 60 * 1000; // 3 minutes
  const delay = Math.max(0, TTL - (Date.now() - new Date(createdAt).getTime()));
  setTimeout(() => msgEl?.remove(), delay);
};

const addMessageToDOM = (payload, opts = {}) => {
  const isMine = opts.forceMine === true;
  const system = payload.system === true;

  const el = createMessageElement({
    text: payload.text || payload.msg || '',
    senderName: payload.senderName || 'User',
    when: payload.createdAt ? new Date(payload.createdAt) : Date.now(),
    isMine,
    system,
    localId: payload.localId || null,
    _id: payload._id || null
  });

  messagesDiv.appendChild(el);
  scrollToBottom();
  if (!system) scheduleMessageDeletion(el, payload.createdAt);
  return el;
};

const updateLocalMessage = (localId, saved) => {
  if (!localId) return false;
  const el = messagesDiv.querySelector(`[data-localid="${localId}"]`);
  if (!el) return false;

  const textDiv = el.querySelector('.message-text');
  const senderDiv = el.querySelector('.message-sender');
  const timeDiv = el.querySelector('.message-time');

  if (textDiv && saved.text) textDiv.textContent = saved.text;
  if (senderDiv && saved.senderName) senderDiv.textContent = saved.senderName === 'Me' ? 'Me' : saved.senderName;
  if (timeDiv && saved.createdAt) timeDiv.textContent = formatTime(new Date(saved.createdAt));

  el.removeAttribute('data-localid');
  pendingLocalIds.delete(localId);
  return true;
};

// ================= Room Handling =================
socket.on('connect', () => {
  currentRoom = 'general';
  socket.emit('joinRoom', currentRoom);
});

roomItems.forEach(item => item.addEventListener('click', () => {
  const newRoom = item.dataset.room;
  if (newRoom === currentRoom) return;
  socket.emit('leaveRoom', currentRoom);
  currentRoom = newRoom;
  socket.emit('joinRoom', currentRoom);
  roomTitle.textContent = item.querySelector('.room-name').textContent;
  messagesDiv.innerHTML = '';
  roomItems.forEach(i => i.classList.remove('active'));
  item.classList.add('active');
}));

// ================= Sending Messages =================
const makeLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

sendBtn.addEventListener('click', () => {
  const msg = inputMsg.value.trim();
  if (!msg) return;
  const localId = makeLocalId();
  addMessageToDOM({ text: msg, senderName: 'Me', createdAt: Date.now(), localId }, { forceMine: true });
  pendingLocalIds.set(localId, true);
  socket.emit('message', { room: currentRoom, msg, localId });
  inputMsg.value = '';
  sendBtn.disabled = true;
  inputMsg.focus();
});

inputMsg.addEventListener('input', () => {
  sendBtn.disabled = !inputMsg.value.trim();
  sendTyping();
});

// ================= Typing Indicator =================
let typingTimeout = null;
const sendTyping = () => {
  socket.emit('typing', { room: currentRoom });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('stopTyping', { room: currentRoom }), 1000);
};

let typingIndicatorEl = null;
const showTypingIndicator = () => {
  if (typingIndicatorEl) return;
  typingIndicatorEl = document.createElement('div');
  typingIndicatorEl.className = 'typing-indicator active';
  typingIndicatorEl.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  messagesDiv.appendChild(typingIndicatorEl);
  scrollToBottom();
};
const hideTypingIndicator = () => {
  typingIndicatorEl?.remove();
  typingIndicatorEl = null;
};

// ================= Receiving Messages =================
socket.on('history', (messages = []) => {
  messagesDiv.innerHTML = '';
  messages.forEach(m => {
    const isMine = (m.senderId && m.senderId === socket.id) || (m.senderName === 'Me');
    addMessageToDOM({ text: m.text, senderName: m.senderName, createdAt: m.createdAt, _id: m._id }, { forceMine: isMine });
  });
});

socket.on('message', data => {
  if (!data || (data.room && data.room !== currentRoom)) return;

  if (data.system) {
    addMessageToDOM({ text: data.text, system: true });
    return;
  }

  if (data.localId && updateLocalMessage(data.localId, { text: data.text, createdAt: data.createdAt, senderName: data.senderName })) return;
  if (data.senderId && data.senderId === socket.id) return;

  addMessageToDOM({ text: data.text, senderName: data.senderName, createdAt: data.createdAt, _id: data._id });
});

// ================= Destroy Messages from Server =================
socket.on('destroyMessage', ({ _id, localId }) => {
  const el = _id ? messagesDiv.querySelector(`[data-id="${_id}"]`) : messagesDiv.querySelector(`[data-localid="${localId}"]`);
  el?.remove();
});

// ================= Emoji Picker =================
const emojis = ['😂','🤣','😅','😊','😎','😉','😍','🥰','😘','🤗','🤩','😜','😛','🤪','😏','😋','🙃','😇','😌','🤭','🤫','😆','🤔','😬','😤','😱','🥳','🤤','🤐'];
emojis.forEach(e => {
  const div = document.createElement('div');
  div.classList.add('emoji-item');
  div.textContent = e;
  div.addEventListener('click', () => {
    inputMsg.value += e;
    sendBtn.disabled = !inputMsg.value.trim();
    emojiPicker.classList.remove('active');
    inputMsg.focus();
  });
  emojiGrid.appendChild(div);
});
emojiBtn.addEventListener('click', () => emojiPicker.classList.toggle('active'));

// ================= Mobile Menu =================
mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('mobile-hidden'));
