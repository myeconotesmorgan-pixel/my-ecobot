const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { setupWSConnection, docs } = require('y-websocket/bin/utils');

const app = express();
app.use(express.json({ limit: '50mb' })); 

// ============================================================================
// ★ 終極修復：加入 CORS 海關放行機制，讓手機的指令能順利抵達！
// ============================================================================
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
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

const closedRooms = new Set();

// 模組 A：WebSocket 即時連線
wss.on('connection', (conn, req) => {
    const roomName = req.url.slice(1).split('?')[0];
    
    if (closedRooms.has(roomName)) {
        console.log(`[EcoBot] ⛔ 拒絕連線：房間 ${roomName} 已結束調查`);
        conn.close(4003, 'Survey Closed'); 
        return;
    }

    setupWSConnection(conn, req, { gc: true });
    
    const docObj = docs.get(roomName);
    if (docObj && !docObj.botInitialized) {
        docObj.botInitialized = true;
        console.log(`[EcoBot] 🚀 成功啟動房間：${roomName}`);
        
        docObj.awareness.setLocalState({
            id: 'ecobot-cloud-server', name: '🤖 雲端留守兵', color: '#10b981', ts: Date.now()
        });

        docObj.awareness.on('change', () => {
            const count = Array.from(docObj.awareness.getStates().keys()).length;
            console.log(`[EcoBot 雷達] 目前房間內連線裝置數: ${count}`);
        });
    }
});

// 模組 B：時空膠囊盲投遞
app.post('/bg-sync', (req, res) => {
    try {
        const { roomName, updateBase64 } = req.body;
        if (!roomName || !updateBase64) return res.status(400).json({ error: 'Missing data' });

        if (closedRooms.has(roomName)) {
            console.log(`[EcoBot] ⛔ 拒絕膠囊：房間 ${roomName} 已結束調查`);
            return res.status(403).json({ error: 'Survey Closed' }); 
        }

        const docObj = docs.get(roomName);
        const updateBuffer = Buffer.from(updateBase64, 'base64');
        Y.applyUpdate(docObj.doc, updateBuffer);

        console.log(`[EcoBot] 📦 收到野外盲投遞膠囊！已成功縫合至房間：${roomName}`);
        res.status(200).json({ success: true });
    } catch(e) {
        console.error('[EcoBot] ❌ 解析背景膠囊失敗:', e);
        res.status(500).json({ error: 'Internal error' });
    }
});

// 模組 C：精準關閉與開門機制
app.post('/open-room', (req, res) => {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ error: 'Missing roomName' });

    if (closedRooms.has(roomName)) {
        closedRooms.delete(roomName);
        console.log(`[EcoBot] 🔓 收到開門指令！已解除房間封鎖：${roomName}`);
    } else {
        console.log(`[EcoBot] 🟢 收到喚醒指令！房間準備就緒：${roomName}`);
    }
    res.status(200).json({ success: true });
});

// ============================================================================
// ★ 模組 C：精準關閉與「重新開門」機制
// ============================================================================
app.post('/close-room', (req, res) => {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ error: 'Missing roomName' });

    console.log(`[EcoBot] 🚨 收到關閉指令！拉下鐵門，永久封鎖房間：${roomName}`);
    closedRooms.add(roomName); 

    const docObj = docs.get(roomName);
    if (docObj) {
        // 1. 踢人下線 (加上 try-catch 防護)
        docObj.conns.forEach((_, ws) => {
            try { ws.close(4003, 'Survey Closed'); } catch (e) {}
        });
        
        // 2. ★ 修正：docObj 本人就是文件，直接銷毀它！
        docObj.destroy();
        
        // 3. 從名單中剔除
        docs.delete(roomName);
        console.log(`[EcoBot] 🧹 房間 ${roomName} 的記憶體資料已徹底清空！`);
    }

    res.status(200).json({ success: true });
});

app.get('/ping', (req, res) => res.status(200).send('EcoBot is awake.'));

server.listen(PORT, async () => {
    console.log(`[EcoBot] 伺服器運行於 Port ${PORT}`);
    if (process.env.RENDER_EXTERNAL_URL) {
        try {
            await fetch(`${SIGNAL_SERVER_URL}/register-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: ROOM_NAME, botUrl: MY_URL })
            });
            console.log('[EcoBot] ✅ 成功向母艦報到！');
        } catch (err) {}
    }
});
