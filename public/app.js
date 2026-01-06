document.addEventListener('DOMContentLoaded', () => {
    // 1. SETUP
    const socket = io();
    const ctx = document.getElementById('stockChart').getContext('2d');

    // DOM Elements
    const statusEl = document.getElementById('status');
    const balanceEl = document.getElementById('balance');
    const activeSymbolEl = document.getElementById('active-symbol');
    const activePriceEl = document.getElementById('active-price');
    const stockListEl = document.getElementById('stock-list');
    const portfolioBody = document.getElementById('portfolio-body');
    const themeBtn = document.getElementById('theme-btn');

    // State
    let currentSymbol = 'TSLA'; 
    let marketData = {};        
    let userBalance = 10000;
    let portfolio = {};         

    // 2. CHART INIT
    const stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Price',
                data: [],
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, 
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { grid: { color: '#30363d' } } }
        }
    });

    // 3. THEME MANAGER
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') enableLightMode();

    themeBtn.addEventListener('click', () => {
        if (document.body.classList.contains('light-mode')) {
            disableLightMode();
        } else {
            enableLightMode();
        }
    });

    function enableLightMode() {
        document.body.classList.add('light-mode');
        themeBtn.textContent = '🌙 Dark Mode';
        localStorage.setItem('theme', 'light');
        stockChart.options.scales.y.grid.color = '#e5e7eb';
        stockChart.update();
    }

    function disableLightMode() {
        document.body.classList.remove('light-mode');
        themeBtn.textContent = '☀️ Light Mode';
        localStorage.setItem('theme', 'dark');
        stockChart.options.scales.y.grid.color = '#30363d';
        stockChart.update();
    }

    // 4. CONNECTION HANDLERS
    socket.on('connect', () => {
        statusEl.textContent = '● System Online';
        statusEl.classList.add('active');
    });

    socket.on('disconnect', () => {
        statusEl.textContent = '○ Disconnected';
        statusEl.classList.remove('active');
    });

    // 5. MARKET DATA ENGINE
    socket.on('market_update', (data) => {
        marketData = data;
        renderSidebar();
        
        // Only update main view if current symbol exists
        if (data[currentSymbol]) {
            renderMainView(data[currentSymbol]);
        }
        
        renderPortfolio();
    });

    // 6. TRADE EXECUTION & PORTFOLIO LOGIC
    socket.on('trade_confirmation', (trade) => {
        if (trade.type === 'BUY') userBalance -= parseFloat(trade.total);
        else userBalance += parseFloat(trade.total);
        
        balanceEl.innerText = `$${userBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

        if (!portfolio[trade.symbol]) portfolio[trade.symbol] = { qty: 0, avgPrice: 0 };
        
        let position = portfolio[trade.symbol];
        const tradeQty = parseFloat(trade.quantity);
        const tradePrice = parseFloat(trade.price);

        if (trade.type === 'BUY') {
            const totalCost = (position.qty * position.avgPrice) + (tradeQty * tradePrice);
            position.qty += tradeQty;
            position.avgPrice = totalCost / position.qty;
        } else {
            position.qty -= tradeQty;
            if (position.qty <= 0.000001) delete portfolio[trade.symbol];
        }

        renderPortfolio();
    });

    // 7. RENDER FUNCTIONS
    function renderSidebar() {
        stockListEl.innerHTML = ''; 
        Object.keys(marketData).forEach(symbol => {
            const stock = marketData[symbol];
            const item = document.createElement('div');
            item.className = `stock-item ${symbol === currentSymbol ? 'active' : ''}`;
            
            item.addEventListener('click', () => {
                currentSymbol = symbol;
                activeSymbolEl.innerText = symbol;
                if(marketData[symbol]) renderMainView(marketData[symbol]);
                renderSidebar(); 
            });
            
            item.innerHTML = `<span>${symbol}</span><span>$${stock.price.toFixed(2)}</span>`;
            stockListEl.appendChild(item);
        });
    }

    function renderMainView(stock) {
        // FIX: Force the title to update to the current symbol
        activeSymbolEl.innerText = currentSymbol; 
        
        activePriceEl.innerText = `$${stock.price.toFixed(2)}`;
        stockChart.data.labels = stock.history.map(h => h.time);
        stockChart.data.datasets[0].data = stock.history.map(h => h.price);
        stockChart.update();
    }

    function renderPortfolio() {
        portfolioBody.innerHTML = '';

        Object.keys(portfolio).forEach(symbol => {
            const pos = portfolio[symbol];
            const currentPrice = marketData[symbol] ? marketData[symbol].price : pos.avgPrice;
            
            const marketValue = pos.qty * currentPrice;
            const costBasis = pos.qty * pos.avgPrice;
            const pl = marketValue - costBasis;
            const plClass = pl >= 0 ? 'pl-positive' : 'pl-negative';

            // Show up to 4 decimals for fractional shares
            const displayQty = pos.qty % 1 === 0 ? pos.qty : pos.qty.toFixed(4);

            const row = `
                <tr>
                    <td>${symbol}</td>
                    <td>${displayQty}</td>
                    <td>$${pos.avgPrice.toFixed(2)}</td>
                    <td style="font-weight: bold;">$${marketValue.toFixed(2)}</td>
                    <td class="${plClass}">$${pl.toFixed(2)}</td>
                </tr>
            `;
            portfolioBody.innerHTML += row;
        });
    }

    // 8. GLOBAL TRADE ACTION
    window.executeTrade = (type) => {
        const qtyInput = document.getElementById('qty');
        const qty = parseFloat(qtyInput.value);
        
        if(isNaN(qty) || qty <= 0) {
            alert("Please enter a valid positive number");
            return;
        }
        if(!marketData[currentSymbol]) return;

        const price = marketData[currentSymbol].price;
        const total = qty * price;

        if (type === 'BUY' && total > userBalance) {
            alert(`Insufficient Funds. Cost: $${total.toFixed(2)}`);
            return;
        }
        if (type === 'SELL') {
            if (!portfolio[currentSymbol] || portfolio[currentSymbol].qty < qty) {
                alert("You don't own enough to sell.");
                return;
            }
        }
        socket.emit('place_order', { symbol: currentSymbol, type, quantity: qty });
    };
});