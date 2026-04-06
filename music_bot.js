// =====================
// IMPORTS
// =====================
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// =====================
// CONFIGURATION
// =====================
const TOKEN = 'Enter your token here';
const ADMIN_PASSWORD = 'Enter your password here';

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const LOG_FILE = path.join(__dirname, 'downloads.log');

const authorizedUsers = new Set();
const activeDownloads = new Map();      // chatId -> yt process
const cancelledDownloads = new Set();   // chatId -> flag

// =====================
// INITIAL SETUP
// =====================
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// GLOBAL SAFETY (Node v24)
// =====================
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.message);
});
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err?.message);
});

// =====================
// AUTHORIZATION
// =====================
bot.onText(/\/auth (.+)/, (msg, match) => {
  if (match[1] === ADMIN_PASSWORD) {
    authorizedUsers.add(msg.from.id);
    bot.sendMessage(msg.chat.id, '✅ Authorization successful.');
  } else {
    bot.sendMessage(msg.chat.id, '❌ Wrong password.');
  }
});

// =====================
// /PLAY (NO SONG)
// =====================
bot.onText(/^\/play$/, (msg) => {
  const replies = [
    "🎵 Abe chutiya hai kya, Gana ka naam bhi likhde 😄\nTry: /play jaatta ka chora",
    "🤔Gana ka naam tera baap likhega kya?\nTry: /play jaatta ka chora",
    "🎧 Abe anpadh gana ka naam likh chl\nTry: /play jaatta ka chora",
  ];
  bot.sendMessage(msg.chat.id, replies[Math.floor(Math.random() * replies.length)]);
});

// =====================
// /PLAY SONG (WITH PROGRESS + CANCEL)
// =====================
bot.onText(/\/play (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const song = match[1];

  if (activeDownloads.has(chatId)) {
    return bot.sendMessage(chatId, '⏳ One download at a time.');
  }

  const username = msg.from.username || msg.from.first_name || 'unknown_user';
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

  fs.appendFileSync(LOG_FILE, `${time} | ${username} | ${song}\n`);

  const progressMsg = await bot.sendMessage(
    chatId,
    `🎵 Downloading: ${song}\n⬇️ Starting...`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⛔ Cancel Download', callback_data: `cancel_${chatId}` }]
        ]
      }
    }
  );

  const yt = spawn('yt-dlp', [
    '-x',
    '--audio-format', 'mp3',
    '--no-playlist',
    `ytsearch1:${song}`,
    '-o', `${DOWNLOAD_DIR}/%(title)s.%(ext)s`
  ]);

  activeDownloads.set(chatId, yt);
  cancelledDownloads.delete(chatId);

  const handleProgress = (data) => {
    const text = data.toString();
    const match = text.match(/\[download\]\s+(\d{1,3}\.\d+)%/);

    if (match && !cancelledDownloads.has(chatId)) {
      bot.editMessageText(
        `🎵 Downloading: ${song}\n⬇️ ${match[1]}%`,
        { chat_id: chatId, message_id: progressMsg.message_id }
      ).catch(() => {});
    }
  };

  yt.stdout.on('data', handleProgress);
  yt.stderr.on('data', handleProgress);

  yt.on('close', async (code) => {
    activeDownloads.delete(chatId);

    if (cancelledDownloads.has(chatId)) {
      cancelledDownloads.delete(chatId);
      return;
    }

    if (code !== 0) {
      return bot.editMessageText('❌ Download failed.', {
        chat_id: chatId,
        message_id: progressMsg.message_id
      });
    }

    try {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.mp3'));
      if (!files.length) return;

      const filePath = path.join(DOWNLOAD_DIR, files[0]);
      await bot.sendAudio(chatId, filePath);
      fs.unlinkSync(filePath);

      bot.editMessageText('✅ Download complete!', {
        chat_id: chatId,
        message_id: progressMsg.message_id
      });
    } catch (err) {
      console.error('Play error:', err.message);
    }
  });
});

// =====================
// /INSTA (WITH PROGRESS + CANCEL)
// =====================
bot.onText(/\/insta (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1];

  if (!url.includes('instagram.com')) {
    return bot.sendMessage(chatId, '❌ Please provide a valid Instagram link.');
  }

  if (activeDownloads.has(chatId)) {
    return bot.sendMessage(chatId, '⏳ One download at a time.');
  }

  const username = msg.from.username || msg.from.first_name || 'unknown_user';
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

  fs.appendFileSync(LOG_FILE, `${time} | ${username} | ${url}\n`);

  const progressMsg = await bot.sendMessage(
    chatId,
    '📥 Downloading Instagram video...\n⬇️ Starting...',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⛔ Cancel Download', callback_data: `cancel_${chatId}` }]
        ]
      }
    }
  );

  const yt = spawn('yt-dlp', [
    '-f', 'best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    url,
    '-o', `${DOWNLOAD_DIR}/%(title)s.%(ext)s`
  ]);

  activeDownloads.set(chatId, yt);
  cancelledDownloads.delete(chatId);

  const handleInstaProgress = (data) => {
    const text = data.toString();
    const match = text.match(/\[download\]\s+(\d{1,3}\.\d+)%/);

    if (match && !cancelledDownloads.has(chatId)) {
      bot.editMessageText(
        `📥 Downloading Instagram video...\n⬇️ ${match[1]}%`,
        { chat_id: chatId, message_id: progressMsg.message_id }
      ).catch(() => {});
    }
  };

  yt.stdout.on('data', handleInstaProgress);
  yt.stderr.on('data', handleInstaProgress);

  yt.on('close', async (code) => {
    activeDownloads.delete(chatId);

    if (cancelledDownloads.has(chatId)) {
      cancelledDownloads.delete(chatId);
      return;
    }

    try {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.mp4'));
      if (code !== 0 || !files.length) {
        return bot.editMessageText(
          '❌ Instagram download failed (private or unavailable).',
          { chat_id: chatId, message_id: progressMsg.message_id }
        );
      }

      const filePath = path.join(DOWNLOAD_DIR, files[0]);
      await bot.sendVideo(chatId, filePath);
      fs.unlinkSync(filePath);

      bot.editMessageText('✅ Instagram download complete!', {
        chat_id: chatId,
        message_id: progressMsg.message_id
      });
    } catch (err) {
      console.error('Insta error:', err.message);
    }
  });
});

// =====================
// CALLBACK HANDLER (CANCEL + HISTORY)
// =====================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  // ⛔ CANCEL
  if (query.data === `cancel_${chatId}`) {
    const yt = activeDownloads.get(chatId);
    if (yt) {
      cancelledDownloads.add(chatId);
      yt.kill('SIGKILL');
      activeDownloads.delete(chatId);

      fs.readdirSync(DOWNLOAD_DIR)
        .filter(f =>
          f.endsWith('.part') ||
          f.endsWith('.mp3') ||
          f.endsWith('.mp4')
        )
        .forEach(f => fs.unlinkSync(path.join(DOWNLOAD_DIR, f)));

      return bot.editMessageText('❌ Download cancelled.', {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }
  }

  // 📜 HISTORY
  if (!authorizedUsers.has(userId)) {
    return bot.sendMessage(chatId, '🚫 Admin only.');
  }

  if (!fs.existsSync(LOG_FILE)) {
    return bot.sendMessage(chatId, '📭 No history found.');
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').reverse();
  let message = '📜 Download History:\n\n';

  lines.forEach((l, i) => {
    const [time, user, value] = l.split(' | ');
    message += `${i + 1}. ${value}\n👤 ${user}\n⏰ ${time}\n\n`;
  });

  bot.sendMessage(chatId, message);
});

// =====================
// START
// =====================
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'Friend';
  bot.sendMessage(msg.chat.id,
`🎶 Welcome ${name}!
🤖 JAAT DJ Bot
🎵 Music + 📸 Instagram Reel Downloader
🛠️ Built by the JAAT community

▶️ Use:
/play <songname>
/about: About the developer
/auth <password>: Admin only
/insta <link> — download Instagram reels/videos
📜 /history — view download history (admin only)

🕘 Working Hours:
This bot is an *employee*, not a machine 😄  
Works **Monday to Friday, 9 AM – 5 PM**  
❌ Offline on **Central Government holidays**

⚠️ Personal & experimental bot.  
Listen to music at your own risk — it may sometimes play vulgar songs. 😂
`
  );
});


bot.onText(/\/about/, (msg) => {
  bot.sendMessage(msg.chat.id,
`👨‍💻 About the Developer
Name: Hidden due to privacy
Username: Hidden due to privacy
🛠️ Built for learning & experimentation`);
});


bot.onText(/\/history/, (msg) => {
  if (!authorizedUsers.has(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '🚫 Admin only.');
  }

  bot.sendMessage(msg.chat.id, '📜 Which history do you want?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🖐 Last 5 songs', callback_data: 'history_5' }],
        [{ text: '📚 Full history', callback_data: 'history_all' }]
      ]
    }
  });
});

console.log('🤖 Bot running safely on Node.js v24');
