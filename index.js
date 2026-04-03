const express = require('express');
const Y = require('yjs');
const { WebrtcProvider } = require('y-webrtc');
const wrtc = require('wrtc');
const axios = require('axios');

// ============================================================================
// ★ 核心魔法：讓 Node.js 擁有瀏覽器的 WebRTC 能力
// ============================================================================
global.RTCPeerConnection = wrtc.RTCPeerConnection;
global.RTCSessionDescription = wrtc.RTCSessionDescription;
global.RTCIceCandidate = wrtc.RTCIceCandidate;

const app = express();
app.use(express.json());

// ============================================================================
// 環境變數接收 (來自 Render 的輸入框)
// ============================================================================
const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME;
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || '';
const SIGNAL_SERVER_URL = process.env.SIGNAL_SERVER_URL || 'https://my-eco-signal.onrender.com';
// Render 會自動提供這個變數，讓我們知道自己的公網網址
const MY_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 

if (!ROOM_NAME) {
    console.error("❌ 嚴重錯誤：未設定 ROOM_NAME 環境變數！機器人無法啟動。");
    process.exit(1);
}

// 組合出跟 App 端一模一樣的加密房間金鑰
const SECURE_ROOM_NAME = `ecolog-v6-${ROOM_NAME}${ROOM_PASSWORD ? '-' + ROOM_PASSWORD : ''}`;
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
    
    // 建立新的空白記憶體
    doc = new Y.Doc();
    
    // 建立 WebRTC P2P 連線 (假裝自己是隊友)
    provider = new WebrtcProvider(SECURE_ROOM_NAME, doc, {
        signaling: [SIGNAL_SERVER_WS],
        password: null,
        peerOpts: { wrtc: wrtc } // 強制注入 Node 版本的 WebRTC
    });

    provider.on('synced', synced => {
        console.log(`[EcoBot] P2P 網路同步狀態: ${synced}`);
    });

    provider.awareness.on('change', () => {
         const onlineCount = Array.from(provider.awareness.getStates().keys()).length;
         console.log(`[EcoBot] 雷達更新！目前 P2P 通道連線數: ${onlineCount}`);
    });
}

// 啟動機器人
initYjs();

// ============================================================================
// HTTP API 控制介面
// ============================================================================

// 1. 喚醒與存活點名 API (給母艦戳的)
app.get('/ping', (req, res) => {
    res.status(200).send('EcoBot is awake and guarding the data.');
});

// 2. 結束調查：清空資料 API (給隊長 App 戳的)
app.post('/clear', (req, res) => {
    console.log('[EcoBot] 🚨 收到清空指令！正在銷毀調查資料...');
    // 重新實例化 doc 和 provider，原本在 RAM 裡的資料會被徹底 GC (Garbage Collection)
    initYjs(); 
    res.status(200).json({ success: true, message: 'Data wiped successfully' });
});

// ============================================================================
// 啟動伺服器並向母艦報到
// ============================================================================
app.listen(PORT, async () => {
    console.log(`[EcoBot] 伺服器運行於 Port ${PORT}`);
    console.log(`[EcoBot] 外部網址: ${MY_URL}`);

    // 如果是在 Render 上運行，主動向你的母艦註冊
    if (process.env.RENDER_EXTERNAL_URL) {
        try {
            await axios.post(`${SIGNAL_SERVER_URL}/register-bot`, {
                roomName: ROOM_NAME,
                botUrl: MY_URL
            });
            console.log('[EcoBot] ✅ 成功向母艦報到！保活機制已啟動。');
        } catch (err) {
            console.error('[EcoBot] ⚠️ 向母艦報到失敗 (請確認母艦是否已更新 API):', err.message);
        }
    }
});
