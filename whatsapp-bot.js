const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

class WhatsAppAutoReact {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: false, // Set true for server
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });
        
        this.reactionRules = [];
        this.isReacting = false;
        this.reactionCount = 0;
        
        this.initialize();
    }
    
    initialize() {
        // QR Code
        this.client.on('qr', (qr) => {
            console.log('QR RECEIVED');
            fs.writeFileSync('qr.txt', qr);
            
            // Generate QR image
            require('qrcode-terminal').generate(qr, {small: true});
        });
        
        // Ready
        this.client.on('ready', () => {
            console.log('✅ WhatsApp AutoReact Bot Ready!');
            this.loadRules();
        });
        
        // Message handler
        this.client.on('message_create', async (message) => {
            await this.handleMessage(message);
        });
        
        // Initialize
        this.client.initialize();
    }
    
    async handleMessage(message) {
        if (!this.isReacting || !message.fromMe) return;
        
        // Check rules
        for (const rule of this.reactionRules) {
            if (await this.shouldReact(message, rule)) {
                await this.sendReaction(message, rule);
                break;
            }
        }
    }
    
    async shouldReact(message, rule) {
        // Check chat
        if (rule.chatId && message.from !== rule.chatId) {
            return false;
        }
        
        // Check sender
        if (rule.sender && message.author !== rule.sender) {
            return false;
        }
        
        // Check keywords
        if (rule.keywords && rule.keywords.length > 0) {
            const hasKeyword = rule.keywords.some(keyword => 
                message.body.toLowerCase().includes(keyword.toLowerCase())
            );
            if (!hasKeyword) return false;
        }
        
        // Check probability
        if (rule.probability && Math.random() > rule.probability) {
            return false;
        }
        
        // Check cooldown
        if (rule.cooldown) {
            const lastReact = this.lastReactionTime.get(message.from);
            if (lastReact && Date.now() - lastReact < rule.cooldown * 1000) {
                return false;
            }
        }
        
        return true;
    }
    
    async sendReaction(message, rule) {
        try {
            // Select emoji
            let emoji;
            if (Array.isArray(rule.emojis)) {
                emoji = rule.emojis[Math.floor(Math.random() * rule.emojis.length)];
            } else {
                emoji = rule.emojis;
            }
            
            // Send reaction
            await message.react(emoji);
            this.reactionCount++;
            
            console.log(`🔹 Reacted ${emoji} to message from ${message.from}`);
            
            // Update last reaction time
            this.lastReactionTime.set(message.from, Date.now());
            
            // Save log
            this.logReaction(message, emoji);
            
        } catch (error) {
            console.error('Reaction error:', error);
        }
    }
    
    logReaction(message, emoji) {
        const log = {
            timestamp: new Date().toISOString(),
            chat: message.from,
            messageId: message.id.id,
            emoji: emoji,
            reactionCount: this.reactionCount
        };
        
        // Append to log file
        fs.appendFileSync('reactions.log', JSON.stringify(log) + '\n');
    }
    
    loadRules() {
        try {
            if (fs.existsSync('rules.json')) {
                this.reactionRules = JSON.parse(fs.readFileSync('rules.json', 'utf8'));
                console.log(`📋 Loaded ${this.reactionRules.length} reaction rules`);
            }
        } catch (error) {
            console.error('Error loading rules:', error);
        }
    }
    
    saveRules() {
        fs.writeFileSync('rules.json', JSON.stringify(this.reactionRules, null, 2));
    }
    
    addRule(rule) {
        this.reactionRules.push(rule);
        this.saveRules();
        console.log('✅ Rule added:', rule.name);
    }
    
    startReacting() {
        this.isReacting = true;
        this.lastReactionTime = new Map();
        console.log('🚀 Auto-reacting started!');
    }
    
    stopReacting() {
        this.isReacting = false;
        console.log('⏹️ Auto-reacting stopped');
    }
    
    getStats() {
        return {
            isReacting: this.isReacting,
            reactionCount: this.reactionCount,
            ruleCount: this.reactionRules.length
        };
    }
}

// Example rules
const exampleRules = [
    {
        name: "Love Reactions",
        chatId: "1234567890@c.us", // Specific chat
        emojis: ["❤️", "😍", "🥰"],
        keywords: ["love", "miss", "like"],
        probability: 0.8, // 80% chance
        cooldown: 10 // 10 seconds between reactions
    },
    {
        name: "Group Hype",
        emojis: ["🔥", "🚀", "💯", "👏"],
        keywords: ["amazing", "great", "wow", "nice"],
        probability: 1.0
    },
    {
        name: "Laugh Reactions",
        emojis: ["😂", "🤣", "😆"],
        keywords: ["haha", "lol", "funny", "joke"],
        probability: 0.9
    }
];

// Export
module.exports = WhatsAppAutoReact;

// Run if executed directly
if (require.main === module) {
    const bot = new WhatsAppAutoReact();
    
    // Add example rules
    setTimeout(() => {
        exampleRules.forEach(rule => bot.addRule(rule));
        bot.startReacting();
    }, 10000);
    
    // CLI Interface
    process.stdin.on('data', (data) => {
        const input = data.toString().trim();
        
        if (input === 'start') {
            bot.startReacting();
        } else if (input === 'stop') {
            bot.stopReacting();
        } else if (input === 'stats') {
            console.log(bot.getStats());
        } else if (input === 'exit') {
            process.exit(0);
        }
    });
          }
