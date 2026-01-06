const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 1. MARKET CONFIGURATION
let market = {
    'TSLA': { price: 200.00, history: [], volatility: 1.2 },
    'AAPL': { price: 150.00, history: [], volatility: 0.8 },
    'BTC':  { price: 45000.00, history: [], volatility: 50.0 }, // High volatility
    'ETH':  { price: 3000.00, history: [], volatility: 15.0 },
    'GOOGL':{ price: 2800.00, history: [], volatility: 2.5 }
};

// 2. MARKET MAKER ENGINE
setInterval(() => {
    const timestamp = new Date().toLocaleTimeString();

    for (const [symbol, data] of Object.entries(market)) {
        const change = (Math.random() - 0.5) * data.volatility;
        data.price = Math.max(0.01, data.price + change);

        data.history.push({ time: timestamp, price: data.price });
        if (data.history.length > 20) data.history.shift();
    }

    io.emit('market_update', market);
}, 2000); 

io.on('connection', (socket) => {
    console.log('Trader connected:', socket.id);
    socket.emit('market_update', market);

    socket.on('place_order', (order) => {
        const stock = market[order.symbol];
        if (stock) {
            const total = stock.price * order.quantity;
            socket.emit('trade_confirmation', {
                ...order,
                price: stock.price.toFixed(2),
                total: total.toFixed(2),
                status: 'FILLED'
            });
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Exchange running on http://localhost:${PORT}`));