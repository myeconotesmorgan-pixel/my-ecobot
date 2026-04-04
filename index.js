const express = require('express');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad';
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || '';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

// ★ 解碼後的房間名稱 (跟手機端一樣)
const SECURE_ROOM_NAME = encodeURIComponent(`ecolog-v6-${ROOM_NAME}${ROOM_PASSWORD ? '-' + ROOM_PASSWORD : ''}`);
const SIGNAL_SERVER_WS = SIGNAL_SERVER_URL.replace('http', 'ws');

let doc;
let provider;

function initYjs() {
    if (provider) provider.destroy();
    if (doc) doc.destroy();

    console.log(`[EcoBot] 啟動 Yjs WebSocket 引擎，防護房間：${SECURE_ROOM_NAME}`);
    
    doc = new Y.Doc();
    
    // ★ 改用 WebsocketProvider，又穩又快，而且 100% 相容 Yjs
    provider = new WebsocketProvider(
        SIGNAL_SERVER_WS, 
        SECURE_ROOM_NAME, 
        doc,
        { WebSocketPolyfill: WebSocket } // 告訴它在 Node 裡要用 ws 套件
    );

    // ★ 賦予身分證，讓 App 能看見！
    provider.awareness.setLocalState({
        id: 'ecobot-cloud-server',
        name: '🤖 雲端留守兵 (WS)',
        color: '#10b981',
        ts: Date.now()
    });

    provider.on('synced', synced => {
        console.log(`[EcoBot] 網路同步狀態: ${synced}`);
    });

    provider.awareness.on('change', () => {
         const onlineCount = Array.from(provider.awareness.getStates().keys()).length;
         console.log(`[EcoBot] 雷達更新！目前連線數: ${onlineCount}`);
    });
}

initYjs();

// ============================================================================
// API
// ============================================================================
app.get('/ping', (req, res) => {
    res.status(200).send('EcoBot is awake.');
});

app.post('/clear', (req, res) => {
    console.log('[EcoBot] 🚨 收到清空指令！正在銷毀調查資料...');
    initYjs(); 
    res.status(200).json({ success: true, message: 'Data wiped successfully' });
});

app.listen(PORT, async () => {
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
