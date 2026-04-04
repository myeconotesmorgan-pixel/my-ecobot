const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection, docs } = require('y-websocket/bin/utils');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

// ★ 攔截手機傳來的 WebSocket 連線
wss.on('connection', (conn, req) => {
    console.log(`[EcoBot] 📡 收到 App 連線請求：${req.url}`);
    setupWSConnection(conn, req, { gc: true });
    
    // 從網址擷取房間名稱
    const roomName = req.url.slice(1).split('?')[0];
    const docObj = docs.get(roomName);
    
    if (docObj && !docObj.botInitialized) {
        docObj.botInitialized = true;
        console.log(`[EcoBot] 🚀 成功啟動防護房間：${roomName}`);
        
        // ★ 注入雲端留守兵的專屬身分證
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

app.get('/ping', (req, res) => res.status(200).send('EcoBot is awake.'));

app.post('/clear', (req, res) => {
    docs.forEach(docObj => docObj.doc.destroy());
    docs.clear();
    console.log('[EcoBot] 🚨 收到清空指令！已銷毀所有記憶體內的調查資料...');
    res.status(200).json({ success: true, message: 'Data wiped successfully' });
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
