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
            // ★ 新增 1：賦予 EcoBot 穿透防火牆的 STUN 伺服器
            config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' } ] }
        } 
    });

    // ★ 新增 2：賦予 EcoBot 身分證，讓手機 App 能看見它！
    provider.awareness.setLocalState({
        id: 'ecobot-cloud-server',
        name: '🤖 雲端留守兵',
        color: '#10b981', // 專屬的翡翠綠
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
