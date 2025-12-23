const express = require('express');
const { create } = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// WhatsApp Client
let whatsappClient = null;
let qrCode = null;

// Create WhatsApp client
function initializeWhatsApp() {
    whatsappClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    // Generate QR Code
    whatsappClient.on('qr', (qr) => {
        qrCode = qr;
        console.log('QR Code received');
        
        // Emit to all connected clients
        io.emit('qr', qr);
    });

    // When ready
    whatsappClient.on('ready', () => {
        console.log('WhatsApp client is ready!');
        io.emit('status', 'connected');
    });

    // When disconnected
    whatsappClient.on('disconnected', (reason) => {
        console.log('WhatsApp client disconnected:', reason);
        io.emit('status', 'disconnected');
        
        // Reinitialize after 5 seconds
        setTimeout(() => {
            initializeWhatsApp();
        }, 5000);
    });

    // Listen for messages
    whatsappClient.on('message', async (message) => {
        console.log('New message:', message.body);
        
        // Emit to clients
        io.emit('new_message', {
            from: message.from,
            body: message.body,
            timestamp: message.timestamp
        });
    });

    // Initialize
    whatsappClient.initialize();
}

// API Routes
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Send reaction
app.post('/api/react', async (req, res) => {
    try {
        const { chatId, emoji, messageId } = req.body;
        
        if (!whatsappClient) {
            return res.status(400).json({ error: 'WhatsApp not connected' });
        }
        
        // Find the message
        const chat = await whatsappClient.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        const targetMessage = messages.find(msg => msg.id.id === messageId);
        
        if (targetMessage) {
            // React to message
            await targetMessage.react(emoji);
            res.json({ success: true, message: 'Reaction sent' });
        } else {
            res.status(404).json({ error: 'Message not found' });
        }
        
    } catch (error) {
        console.error('Reaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get chats
app.get('/api/chats', async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(400).json({ error: 'WhatsApp not connected' });
        }
        
        const chats = await whatsappClient.getChats();
        const chatList = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount
        }));
        
        res.json(chatList);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Auto-react endpoint
app.post('/api/auto-react', async (req, res) => {
    const { chatId, emojis, delay, maxReactions } = req.body;
    
    // Start auto-reacting in background
    startAutoReact(chatId, emojis, delay, maxReactions);
    
    res.json({ success: true, message: 'Auto-react started' });
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send current status
    if (whatsappClient && whatsappClient.info) {
        socket.emit('status', 'connected');
    } else if (qrCode) {
        socket.emit('qr', qrCode);
    } else {
        socket.emit('status', 'disconnected');
    }
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Auto-react function
async function startAutoReact(chatId, emojis, delay, maxReactions) {
    try {
        const chat = await whatsappClient.getChatById(chatId);
        let reactionCount = 0;
        
        // Listen for new messages
        whatsappClient.on('message_create', async (message) => {
            if (message.from === chatId && reactionCount < maxReactions) {
                // Random delay
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
                
                // Select random emoji
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                
                // React
                await message.react(emoji);
                reactionCount++;
                
                console.log(`Reacted ${emoji} to message (${reactionCount}/${maxReactions})`);
                
                // Emit to clients
                io.emit('reaction_sent', {
                    chatId,
                    emoji,
                    count: reactionCount,
                    total: maxReactions
                });
            }
        });
        
    } catch (error) {
        console.error('Auto-react error:', error);
    }
}

// Initialize server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Initialize WhatsApp
    initializeWhatsApp();
});
