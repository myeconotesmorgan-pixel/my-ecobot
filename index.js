const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { setupWSConnection, docs } = require('y-websocket/bin/utils');

const app = express();
// ★ 允許接收較大的 JSON 封包 (因為時空膠囊可能有點大)
app.use(express.json({ limit: '50mb' })); 

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

// ============================================================================
// 模組 A：處理前台 App 的 WebSocket 即時連線
// ============================================================================
wss.on('connection', (conn, req) => {
    setupWSConnection(conn, req, { gc: true });
    
    const roomName = req.url.slice(1).split('?')[0];
    const docObj = docs.get(roomName);
    
    if (docObj && !docObj.botInitialized) {
        docObj.botInitialized = true;
        console.log(`[EcoBot] 🚀 成功啟動房間：${roomName}`);
        
        docObj.awareness.setLocalState({
            id: 'ecobot-cloud-server',
            name: '🤖 雲端留守兵',
            color: '#10b981',
            ts: Date.now()
        });

        docObj.awareness.on('change', () => {
            const count = Array.from(docObj.awareness.getStates().keys()).length;
            console.log(`[EcoBot 雷達] 目前房間內連線裝置數: ${count}`);
        });
    }
});

// ============================================================================
// 模組 B：處理背景 Java 的時空膠囊 (盲投遞)
// ============================================================================
app.post('/bg-sync', (req, res) => {
    try {
        const { roomName, updateBase64 } = req.body;
        if (!roomName || !updateBase64) return res.status(400).json({ error: 'Missing data' });

        // 取得房間的 Yjs 文件 (如果不存在，y-websocket 會自動創建)
        const docObj = docs.get(roomName);

        // 將 Base64 解碼成 Uint8Array
        const updateBuffer = Buffer.from(updateBase64, 'base64');
        
        // ★ Yjs 魔法：將膠囊縫合進雲端記憶體
        Y.applyUpdate(docObj.doc, updateBuffer);

        console.log(`[EcoBot] 📦 收到野外盲投遞膠囊！已成功縫合至房間：${roomName}`);
        res.status(200).json({ success: true });
    } catch(e) {
        console.error('[EcoBot] ❌ 解析背景膠囊失敗:', e);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ============================================================================
// 系統基礎 API
// ============================================================================
app.get('/ping', (req, res) => res.status(200).send('EcoBot is awake.'));

app.post('/clear', (req, res) => {
    docs.forEach(docObj => docObj.doc.destroy());
    docs.clear();
    console.log('[EcoBot] 🚨 收到清空指令！已銷毀記憶體資料...');
    res.status(200).json({ success: true });
});

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
