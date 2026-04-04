const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
// ★ 這次我們只用最標準的 docs 和 setupWSConnection
const { setupWSConnection, docs } = require('y-websocket/bin/utils');

const app = express();
app.use(express.json({ limit: '50mb' })); 

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

const closedRooms = new Set();

// 模組 A：WebSocket 即時連線 (維持最成功的標準寫法)
wss.on('connection', (conn, req) => {
    const roomName = req.url.slice(1).split('?')[0];
    if (closedRooms.has(roomName)) {
        conn.close(4003, 'Survey Closed'); 
        return;
    }

    // 這是成功的關鍵：讓官方工具接手建立房間與資料鎖
    setupWSConnection(conn, req, { gc: true });
    
    const docObj = docs.get(roomName);
    if (docObj && !docObj.botInitialized) {
        docObj.botInitialized = true;
        console.log(`[EcoBot 雷達] 房間 ${roomName} 啟動，連線數: ${Array.from(docObj.awareness.getStates().keys()).length}`);
        
        docObj.awareness.setLocalState({ id: 'ecobot-cloud-server', name: '🤖 雲端留守兵', color: '#10b981', ts: Date.now() });

        docObj.awareness.on('change', () => {
            const count = Array.from(docObj.awareness.getStates().keys()).length;
            console.log(`[EcoBot 雷達] 房間 ${roomName} 目前連線裝置數: ${count}`);
        });
    }
});

// 模組 B：接收時空膠囊 (盲投遞)
app.post('/bg-sync', (req, res) => {
    try {
        const { roomName, updateBase64 } = req.body;
        if (!roomName || !updateBase64) return res.status(400).json({ error: 'Missing data' });
        if (closedRooms.has(roomName)) return res.status(403).json({ error: 'Survey Closed' }); 

        const docObj = docs.get(roomName);
        if (!docObj) {
            console.log(`[EcoBot] ⚠️ 房間 ${roomName} 尚未由 App 啟動，拒絕膠囊`);
            return res.status(404).json({ error: 'Room not ready' });
        }

        const updateBuffer = Buffer.from(updateBase64, 'base64');
        // ★ 回歸之前的寫法：docObj.doc
        Y.applyUpdate(docObj.doc, updateBuffer); 
        
        console.log(`[EcoBot] 📦 成功縫合膠囊至房間：${roomName}`);
        res.status(200).json({ success: true });
    } catch(e) {
        console.error('[EcoBot] bg-sync Error:', e);
        res.status(500).json({ error: 'Internal error' });
    }
});

// 模組 C：接收 Java 加密座標
app.post('/bg-location', (req, res) => {
    try {
        const { roomName, userId, payload } = req.body;
        const docObj = docs.get(roomName);
        if (!docObj) return res.status(404).json({ error: 'Not ready' });

        const locMap = docObj.doc.getMap('bg-locations');
        locMap.set(userId, payload); 

        res.status(200).json({ success: true });
    } catch(e) {
        res.status(500).json({ error: 'Error' });
    }
});

// 模組 D：萬用開門機制 (這就是喚醒房間的關鍵)
app.post('/open-room', async (req, res) => {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ error: 'Missing' });

    if (closedRooms.has(roomName)) closedRooms.delete(roomName);
    
    console.log(`[EcoBot] 🟢 收到開門訊號：${roomName}`);
    
    // 向母艦報到
    try {
        await fetch(`${SIGNAL_SERVER_URL}/register-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: roomName, botUrl: MY_URL })
        });
    } catch(e) {}

    res.status(200).json({ success: true });
});

app.post('/close-room', (req, res) => {
    const { roomName } = req.body;
    const docObj = docs.get(roomName);
    
    console.log(`[EcoBot] 🚨 永久封鎖並清空房間：${roomName}`);
    closedRooms.add(roomName); 

    if (docObj) {
        docObj.conns.forEach((_, ws) => { try { ws.close(4003, 'Closed'); } catch (e) {} });
        docObj.doc.destroy(); // 回歸正確的 .doc.destroy()
        docs.delete(roomName);
        console.log(`[EcoBot] 🧹 記憶體已抹除`);
    }
    res.status(200).json({ success: true });
});

app.get('/ping', (req, res) => res.status(200).send('EcoBot awake.'));

server.listen(PORT, () => console.log(`[EcoBot] 伺服器運行中... Port ${PORT}`));
