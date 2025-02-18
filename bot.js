const { Telegraf } = require('telegraf');
const axios = require('axios');

// DIRECTLY ADDING BOT TOKEN (⚠️ NOT RECOMMENDED)
const TELEGRAM_BOT_TOKEN = "7909374116:AAFShC2Kc7pqxJaBoNTJLWDCbCoRAldh8Nc";  

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Use Tor for Telegram API requests
const axiosInstance = axios.create({
    proxy: {
        host: '127.0.0.1',
        port: 9050, // Tor SOCKS5 port
        protocol: 'socks5h'
    }
});

// Handle /start command
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const message = "Welcome! This bot is running via Tor.";
    
    try {
        await axiosInstance.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message
        });
        console.log("Sent /start response");
    } catch (error) {
        console.error("Error sending message:", error);
    }
});

// Start bot
bot.launch();
console.log("Bot is running via Tor...");
