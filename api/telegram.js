const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const USERS_FILE = path.join('/tmp', 'users.json');

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf-8');
  }
}

function readUsers() {
  ensureUsersFile();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (error) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function addUser(user) {
  const users = readUsers();
  const exists = users.find((u) => u.id === user.id);

  if (!exists) {
    users.push(user);
    saveUsers(users);
  }
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  const data = await response.json();
  console.log('sendMessage:', data);
  return data;
}

async function sendChatAction(chatId, action = 'typing') {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    }
  );

  const data = await response.json();
  console.log('sendChatAction:', data);
  return data;
}

async function askGroq(userText) {
  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              "Sen Komilov's AI botsan. O‘zbek tilida qisqa va tushunarli javob ber.",
          },
          {
            role: 'user',
            content: userText,
          },
        ],
      }),
    }
  );

  const data = await response.json();
  console.log('groq:', data);

  return (
    data?.choices?.[0]?.message?.content || 'Javob olishda xatolik bo‘ldi.'
  );
}

module.exports = async (req, res) => {
  console.log('METHOD:', req.method);

  if (!BOT_TOKEN || !GROQ_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'BOT_TOKEN yoki GROQ_API_KEY topilmadi',
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: "Komilov's AI webhook ishlayapti 🚀",
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const update = req.body;
    console.log('UPDATE:', JSON.stringify(update));

    const msg = update?.message;
    if (!msg || !msg.chat) {
      return res.status(200).json({ ok: true });
    }

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) {
      return res.status(200).json({ ok: true });
    }

    if (text === '/start') {
      const userData = {
        id: msg.from?.id,
        name: msg.from?.first_name || 'No name',
        username: msg.from?.username || null,
      };

      addUser(userData);

      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum 👋\nMen Komilov's AI 🤖\nSavolingizni yozing."
      );

      return res.status(200).json({ ok: true });
    }

    await sendChatAction(chatId, 'typing');

    const reply = await askGroq(text);
    await sendTelegramMessage(chatId, reply);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('ERROR:', error);

    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        await sendTelegramMessage(chatId, 'Xatolik yuz berdi.');
      }
    } catch (_) {}

    return res.status(200).json({ ok: true });
  }
};
