const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { setupWSConnection, docs, getYDoc } = require('y-websocket/bin/utils');

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

// 模組 A：WebSocket 即時連線
wss.on('connection', (conn, req) => {
    const roomName = req.url.slice(1).split('?')[0];
    if (closedRooms.has(roomName)) {
        conn.close(4003, 'Survey Closed'); 
        return;
    }

    // ★ 關鍵 1：設定 gc: false，告訴系統「絕對不要自動回收這個房間」！
    setupWSConnection(conn, req, { gc: false }); 
    
    const docObj = docs.get(roomName);
    if (docObj && !docObj.botInitialized) {
        docObj.botInitialized = true;
        console.log(`[EcoBot] 房間 ${roomName} 啟動！`);
        docObj.awareness.setLocalState({ id: 'ecobot-cloud-server', name: '🤖 雲端留守員', color: '#10b981', ts: Date.now() });
    }
});

// 模組 B：接收時空膠囊 (盲投遞)
app.post('/bg-sync', (req, res) => {
    try {
        const { roomName, updateBase64 } = req.body;
        if (!roomName || !updateBase64) return res.status(400).json({ error: 'Missing data' });
        if (closedRooms.has(roomName)) return res.status(403).json({ error: 'Survey Closed' }); 

        // ★ 關鍵 2：使用 getYDoc(..., false)，如果房間不在就建一個，且永不回收
        const docObj = getYDoc(roomName, false); 
        const updateBuffer = Buffer.from(updateBase64, 'base64');
        Y.applyUpdate(docObj, updateBuffer); // docObj 本身就是 Y.Doc
        
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
        if (!roomName || !userId || !payload) return res.status(400).json({ error: 'Missing data' });
        if (closedRooms.has(roomName)) return res.status(403).json({ error: 'Closed' });

        // 同樣確保房間存在且不被回收
        const docObj = getYDoc(roomName, false);
        const locMap = docObj.getMap('bg-locations');
        locMap.set(userId, payload); 

        res.status(200).json({ success: true });
    } catch(e) {
        console.error('[EcoBot] bg-location Error:', e);
        res.status(500).json({ error: 'Error' });
    }
});

// 模組 D：萬用開門機制
app.post('/open-room', async (req, res) => {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ error: 'Missing roomName' });

    if (closedRooms.has(roomName)) closedRooms.delete(roomName);
    console.log(`[EcoBot] 🟢 收到開門訊號：${roomName}`);
    
    try {
        await fetch(`${SIGNAL_SERVER_URL}/register-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: roomName, botUrl: MY_URL })
        });
    } catch(e) {}

    res.status(200).json({ success: true });
});

// 模組 E：精準關門與記憶體抹除
app.post('/close-room', (req, res) => {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ error: 'Missing' });

    console.log(`[EcoBot] 🚨 永久封鎖並清空房間：${roomName}`);
    closedRooms.add(roomName); 

    const docObj = docs.get(roomName);
    if (docObj) {
        docObj.conns.forEach((_, ws) => { try { ws.close(4003, 'Closed'); } catch (e) {} });
        docObj.destroy();
        docs.delete(roomName);
        console.log(`[EcoBot] 🧹 記憶體已徹底抹除`);
    }
    res.status(200).json({ success: true });
});

app.get('/ping', (req, res) => res.status(200).send('EcoBot awake.'));

server.listen(PORT, () => console.log(`[EcoBot] 萬用伺服器待命中... Port ${PORT}`));
