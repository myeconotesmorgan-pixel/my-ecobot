// ============================================================================
// ★ 終極偽裝術：完美模擬瀏覽器環境 (WebRTC + Crypto 亂數產生器)
// ============================================================================
const crypto = require('crypto');
global.crypto = crypto.webcrypto; // ★ 破除魔王 Bug！補上瀏覽器級別的安全亂數產生器
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.navigator = { userAgent: 'node' };
global.location = { protocol: 'https:' };

const express = require('express');
const Y = require('yjs');
const wrtc = require('@roamhq/wrtc');
const WebSocket = require('ws');
const { WebrtcProvider } = require('y-webrtc');

global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.WebSocket = WebSocket;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad';
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || '';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

const SECURE_ROOM_NAME = encodeURIComponent(`ecolog-v6-${ROOM_NAME}${ROOM_PASSWORD ? '-' + ROOM_PASSWORD : ''}`);
const SIGNAL_SERVER_WS = SIGNAL_SERVER_URL.replace('http', 'ws');

let doc;
let provider;

function initYjs() {
    if (provider) provider.destroy();
    if (doc) doc.destroy();

    console.log(`[EcoBot] 🚀 啟動 Yjs WebRTC 引擎，防護房間：${SECURE_ROOM_NAME}`);
    
    doc = new Y.Doc();
    
    provider = new WebrtcProvider(SECURE_ROOM_NAME, doc, {
        signaling: [SIGNAL_SERVER_WS],
        password: null,
        peerOpts: { 
            wrtc: wrtc,
            config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' } ] }
        } 
    });

    provider.awareness.setLocalState({
        id: 'ecobot-cloud-server',
        name: '🤖 雲端留守兵',
        color: '#10b981',
        ts: Date.now()
    });

    // ============================================================================
    // ★ 超級 Debug 監聽器：讓你對房間內的一切瞭若指掌
    // ============================================================================
    provider.on('synced', synced => {
        console.log(`[EcoBot 狀態] 🔄 P2P 資料同步狀態: ${synced}`);
    });

    provider.on('peers', peersInfo => {
        console.log(`[EcoBot 網路] 📡 偵測到 P2P 連線交握訊號！`);
    });

    provider.awareness.on('change', ({ added, updated, removed }) => {
         const states = provider.awareness.getStates();
         console.log(`[EcoBot 雷達] ⚡ 狀態更新 | 新增:${added.length} 變更:${updated.length} 移除:${removed.length}`);
         console.log(`[EcoBot 名單] 目前房間內共有 ${states.size} 個裝置 (包含自己):`);
         states.forEach((state, clientId) => {
             console.log(`  - [ID: ${state.id || 'N/A'}] ${state.name || '未知裝置'}`);
         });
    });
}

initYjs();

// API endpoints
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
            console.log('[EcoBot] ✅ 成功向母艦報到！保活機制已啟動。');
        } catch (err) {}
    }
});
