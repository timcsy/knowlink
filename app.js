// 初始化 GUN
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);

// 用戶管理
const user = gun.user();

// 狀態管理
let currentUser = null;
const state = {
    interests: [],
    connections: [],
    matchingTimeout: null
};

// DOM 元素
const loginBtn = document.getElementById('loginBtn');
const profileBtn = document.getElementById('profileBtn');
const loginModal = document.getElementById('loginModal');
const interestsContainer = document.getElementById('interests-container');
const connectionsContainer = document.getElementById('connections-container');

// 聊天相關元素
const chatModal = document.getElementById('chatModal');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessage = document.getElementById('sendMessage');
const closeChatModal = document.getElementById('closeChatModal');
const chatPartnerName = document.getElementById('chatPartnerName');

let currentChatPartner = null;

// 預設的知識領域和技能等級
const knowledgeAreas = [
    '程式設計', '數學', '語言學習', '音樂', '藝術',
    '科學', '歷史', '文學', '商業', '心理學'
];

// 登入表單生成
function createLoginForm() {
    loginModal.innerHTML = `
        <div class="modal-content">
            <h2>登入 / 註冊</h2>
            <input type="text" id="username" placeholder="使用者名稱" />
            <input type="password" id="password" placeholder="密碼" />
            <button id="submitLogin">確認</button>
            <button id="closeModal">取消</button>
        </div>
    `;
    loginModal.style.display = 'flex';

    document.getElementById('closeModal').onclick = () => {
        loginModal.style.display = 'none';
    };

    document.getElementById('submitLogin').onclick = async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        await login(username, password);
    };
}

// 登入功能
async function login(username, password) {
    user.auth(username, password, (ack) => {
        if (ack.err) {
            // 如果登入失敗，嘗試註冊
            user.create(username, password, (createAck) => {
                if (createAck.err) {
                    alert('註冊失敗: ' + createAck.err);
                    return;
                }
                // 註冊成功後登入
                user.auth(username, password);
            });
            return;
        }
        currentUser = username;
        loginSuccess();
    });
}

// 登入成功後的處理
function loginSuccess() {
    loginModal.style.display = 'none';
    loginBtn.style.display = 'none';
    profileBtn.style.display = 'block';
    loadUserProfile();
}

// 載入用戶資料
function loadUserProfile() {
    if (!currentUser) return;

    user.get('profile').once((profile) => {
        if (profile) {
            state.interests = profile.interests || [];
            updateInterestsDisplay();
        }
        findMatches();
    });
}

// 更新興趣顯示
function updateInterestsDisplay() {
    interestsContainer.innerHTML = '';
    knowledgeAreas.forEach(area => {
        const level = state.interests.find(i => i.area === area)?.level || 0;
        const div = document.createElement('div');
        div.className = 'interest-item';
        div.innerHTML = `
            <span>${area}</span>
            <input type="range" min="0" max="5" value="${level}"
                onchange="updateInterest('${area}', this.value)" />
            <span>Level: ${level}</span>
        `;
        interestsContainer.appendChild(div);
    });
}

// 更新興趣等級
function updateInterest(area, level) {
    level = parseInt(level);
    const index = state.interests.findIndex(i => i.area === area);
    if (index >= 0) {
        state.interests[index].level = level;
    } else {
        state.interests.push({ area, level });
    }
    
    updateUserProfile(state.interests);
}

// 更新用戶資料時重新計算所有配對
function updateUserProfile(interests) {
    if (!currentUser) return;
    
    user.get('profile').put({
        interests,
        lastUpdate: Date.now()
    });
    
    // 延遲執行配對更新，避免過於頻繁
    clearTimeout(state.matchingTimeout);
    state.matchingTimeout = setTimeout(findMatches, 1000);
}

// 尋找配對
function findMatches() {
    if (!currentUser || !state.interests.length) return;
    
    gun.get('users').map().once((profile, id) => {
        if (id === user.is.pub) return; // 跳過自己
        
        if (profile && profile.interests) {
            const matchScore = calculateMatchScore(state.interests, profile.interests);
            if (matchScore > 0.5) { // 配對分數閾值
                addConnection(id, profile, matchScore);
            }
        }
    });
}

// 增強的配對算法
function calculateMatchScore(userInterests, otherInterests) {
    let score = 0;
    let count = 0;
    let sharedInterests = 0;
    
    userInterests.forEach(ui => {
        const otherInterest = otherInterests.find(oi => oi.area === ui.area);
        if (otherInterest) {
            sharedInterests++;
            // 根據程度差異計算分數
            const levelDiff = Math.abs(ui.level - otherInterest.level);
            if (levelDiff <= 1) {
                // 相近程度給予更高分數
                score += 1 - (levelDiff / 5);
            } else {
                // 程度差距較大但仍有共同興趣
                score += 0.3;
            }
            count++;
        }
    });
    
    // 考慮共同興趣數量的權重
    const interestWeight = sharedInterests / Math.max(userInterests.length, otherInterests.length);
    
    return count > 0 ? (score / count) * interestWeight : 0;
}

// 添加配對連接
function addConnection(id, profile, score) {
    const connection = {
        id,
        name: profile.name || id.slice(0, 8),
        score,
        interests: profile.interests
    };
    
    const index = state.connections.findIndex(c => c.id === id);
    if (index >= 0) {
        state.connections[index] = connection;
    } else {
        state.connections.push(connection);
    }
    
    updateConnectionsDisplay();
}

// 更新配對項目顯示，添加聊天功能
function updateConnectionsDisplay() {
    connectionsContainer.innerHTML = '';
    state.connections
        .sort((a, b) => b.score - a.score)
        .forEach(connection => {
            const div = document.createElement('div');
            div.className = 'connection-item';
            div.innerHTML = `
                <h3>${connection.name}</h3>
                <p>配對分數: ${Math.round(connection.score * 100)}%</p>
                <div class="shared-interests">
                    ${connection.interests
                        .map(i => `<span>${i.area} (Level ${i.level})</span>`)
                        .join('')}
                </div>
                <button class="chat-btn">開始交流</button>
            `;
            
            div.querySelector('.chat-btn').onclick = () => startChat(connection);
            connectionsContainer.appendChild(div);
        });
}

// 開始聊天
function startChat(partner) {
    currentChatPartner = partner;
    chatPartnerName.textContent = partner.name;
    chatModal.style.display = 'flex';
    chatMessages.innerHTML = '';
    loadMessages(partner.id);
}

// 載入聊天記錄
function loadMessages(partnerId) {
    if (!currentUser) return;
    
    const chatId = [user.is.pub, partnerId].sort().join('_');
    gun.get('chats').get(chatId).map().on(message => {
        if (!message) return;
        displayMessage(message);
    });
}

// 顯示訊息
function displayMessage(message) {
    const div = document.createElement('div');
    div.className = `message ${message.sender === user.is.pub ? 'sent' : 'received'}`;
    div.textContent = message.text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 發送訊息
async function sendChatMessage() {
    if (!currentUser || !currentChatPartner || !messageInput.value.trim()) return;
    
    const chatId = [user.is.pub, currentChatPartner.id].sort().join('_');
    const message = {
        text: messageInput.value.trim(),
        sender: user.is.pub,
        timestamp: Date.now()
    };
    
    gun.get('chats').get(chatId).set(message);
    messageInput.value = '';
}

// 事件監聽
sendMessage.onclick = sendChatMessage;
messageInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
};
closeChatModal.onclick = () => {
    chatModal.style.display = 'none';
    currentChatPartner = null;
};

// 事件監聽
loginBtn.onclick = createLoginForm;
profileBtn.onclick = () => {
    // 切換顯示個人資料區域
    document.querySelector('.features').style.display = 
        document.querySelector('.features').style.display === 'none' ? 'block' : 'none';
};

// 初始化
loadUserProfile();