// ============================================================================
// ★ 終極偽裝術：必須放在最上面，確保套件載入前就準備好！
// ============================================================================
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.navigator = { userAgent: 'node' };
global.location = { protocol: 'https:' };

const express = require('express');
const Y = require('yjs');
const wrtc = require('@roamhq/wrtc');
const WebSocket = require('ws');
// ★ 移除了會崩潰的 axios，待會直接用 Node 內建的 fetch！

global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;
global.WebSocket = WebSocket;

const { WebrtcProvider } = require('y-webrtc');

const app = express();
app.use(express.json());

// ============================================================================
// 環境變數接收 (加上防閃退預設值)
// ============================================================================
const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'DefaultSquad'; // 避免 Render 漏抓變數導致閃退
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || '';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

// ★ 包含網址安全編碼
const SECURE_ROOM_NAME = encodeURIComponent(`ecolog-v6-${ROOM_NAME}${ROOM_PASSWORD ? '-' + ROOM_PASSWORD : ''}`);
const SIGNAL_SERVER_WS = SIGNAL_SERVER_URL.replace('http', 'ws');

let doc;
let provider;

// ============================================================================
// 引擎啟動與銷毀機制
// ============================================================================
function initYjs() {
    if (provider) provider.destroy();
    if (doc) doc.destroy();

    console.log(`[EcoBot] 啟動 Yjs 引擎，防護房間：${SECURE_ROOM_NAME}`);
    
    doc = new Y.Doc();
    
    provider = new WebrtcProvider(SECURE_ROOM_NAME, doc, {
        signaling: [SIGNAL_SERVER_WS],
        password: null,
        peerOpts: { 
            wrtc: wrtc,
            // ★ 賦予 EcoBot 穿透防火牆的能力
            config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' } ] }
        } 
    });

    // ★ 賦予 EcoBot 身分證，讓 App 能看見它
    provider.awareness.setLocalState({
        id: 'ecobot-cloud-server',
        name: '🤖 雲端留守兵',
        color: '#10b981',
        ts: Date.now()
    });

    provider.on('synced', synced => {
        console.log(`[EcoBot] P2P 網路同步狀態: ${synced}`);
    });

    provider.awareness.on('change', () => {
         const onlineCount = Array.from(provider.awareness.getStates().keys()).length;
         console.log(`[EcoBot] 雷達更新！目前 P2P 通道連線數: ${onlineCount}`);
    });
}

initYjs();

// ============================================================================
// HTTP API 控制介面
// ============================================================================

app.get('/ping', (req, res) => {
    res.status(200).send('EcoBot is awake.');
});

app.post('/clear', (req, res) => {
    console.log('[EcoBot] 🚨 收到清空指令！正在銷毀調查資料...');
    initYjs(); 
    res.status(200).json({ success: true, message: 'Data wiped successfully' });
});

// ============================================================================
// 啟動伺服器並向母艦報到
// ============================================================================
app.listen(PORT, async () => {
    console.log(`[EcoBot] 伺服器運行於 Port ${PORT}`);
    console.log(`[EcoBot] 外部網址: ${MY_URL}`);

    if (process.env.RENDER_EXTERNAL_URL) {
        try {
            // ★ 改用原生 fetch，完全避開 axios 的當機地雷
            await fetch(`${SIGNAL_SERVER_URL}/register-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: ROOM_NAME, botUrl: MY_URL })
            });
            console.log('[EcoBot] ✅ 成功向母艦報到！保活機制已啟動。');
        } catch (err) {
            console.error('[EcoBot] ⚠️ 向母艦報到失敗:', err.message);
        }
    }
});
