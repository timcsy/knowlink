// Service Worker 註冊
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker 註冊成功:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker 註冊失敗:', error);
            });
    });
}

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

// 學習圈相關 DOM 元素
const createCircleBtn = document.getElementById('createCircleBtn');
const createCircleModal = document.getElementById('createCircleModal');
const circleDetailModal = document.getElementById('circleDetailModal');
const learningCirclesContainer = document.getElementById('learning-circles-container');
const circleCategory = document.getElementById('circleCategory');
const submitCircle = document.getElementById('submitCircle');
const closeCircleModal = document.getElementById('closeCircleModal');
const closeCircleDetail = document.getElementById('closeCircleDetail');
const sendCircleMessage = document.getElementById('sendCircleMessage');
const circleMessageInput = document.getElementById('circleMessageInput');

// 知識分享相關 DOM 元素
const createResourceBtn = document.getElementById('createResourceBtn');
const createNoteBtn = document.getElementById('createNoteBtn');
const resourceModal = document.getElementById('resourceModal');
const noteModal = document.getElementById('noteModal');
const knowledgeResourcesContainer = document.getElementById('knowledge-resources-container');

// 標籤輸入相關
const tagInput = document.getElementById('tagInput');
const noteTagInput = document.getElementById('noteTagInput');
const selectedTags = document.getElementById('selectedTags');
const noteSelectedTags = document.getElementById('noteSelectedTags');

let currentResourceTags = new Set();
let currentNoteTags = new Set();

// 當前選中的學習圈
let currentCircle = null;

// 預設的知識領域和技能等級
const knowledgeAreas = [
    '程式設計', '數學', '語言學習', '音樂', '藝術',
    '科學', '歷史', '文學', '商業', '心理學'
];

// 學習圈分類
const circleCategories = [
    '程式設計', '數學', '語言學習', '音樂', '藝術',
    '科學', '歷史', '文學', '商業', '心理學'
];

// 初始化學習圈分類選項
function initializeCircleCategories() {
    circleCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        circleCategory.appendChild(option);
    });
}

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
    loadKnowledgeResources();
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

// 創建學習圈
async function createLearningCircle(name, description, category) {
    if (!currentUser) return;
    
    const circleId = `circle_${Date.now()}`;
    const circle = {
        id: circleId,
        name,
        description,
        category,
        creator: user.is.pub,
        members: [user.is.pub],
        createdAt: Date.now()
    };
    
    gun.get('circles').get(circleId).put(circle);
    loadLearningCircles();
    createCircleModal.style.display = 'none';
}

// 載入學習圈列表
function loadLearningCircles() {
    learningCirclesContainer.innerHTML = '';
    
    gun.get('circles').map().once((circle, id) => {
        if (!circle) return;
        
        const div = document.createElement('div');
        div.className = 'circle-item';
        div.innerHTML = `
            <h3>${circle.name}</h3>
            <p>${circle.description || ''}</p>
            <p class="members-count">成員數: ${circle.members?.length || 1}</p>
        `;
        
        div.onclick = () => openCircleDetail(circle);
        learningCirclesContainer.appendChild(div);
    });
}

// 打開學習圈詳情
function openCircleDetail(circle) {
    currentCircle = circle;
    document.getElementById('circleDetailName').textContent = circle.name;
    document.getElementById('circleDetailDescription').textContent = circle.description || '';
    
    loadCircleMembers(circle);
    loadCircleMessages(circle);
    
    circleDetailModal.style.display = 'flex';
}

// 載入學習圈成員
function loadCircleMembers(circle) {
    const membersList = document.getElementById('circleMembersList');
    membersList.innerHTML = '';
    
    circle.members?.forEach(memberId => {
        gun.get('users').get(memberId).once(profile => {
            const div = document.createElement('div');
            div.className = 'member-item';
            div.textContent = profile?.name || memberId.slice(0, 8);
            membersList.appendChild(div);
        });
    });
}

// 載入學習圈討論
function loadCircleMessages(circle) {
    const messagesContainer = document.getElementById('circleMessages');
    messagesContainer.innerHTML = '';
    
    gun.get('circles')
        .get(circle.id)
        .get('messages')
        .map()
        .on((message, key) => {
            if (!message) return;
            
            const div = document.createElement('div');
            div.className = 'circle-message';
            div.innerHTML = `
                <div class="author">${message.authorName || '匿名'}</div>
                <div class="content">${message.text}</div>
            `;
            
            // 只添加新訊息
            if (!document.getElementById(`msg-${key}`)) {
                div.id = `msg-${key}`;
                messagesContainer.appendChild(div);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
}

// 發送學習圈訊息
function sendCircleMessage() {
    if (!currentUser || !currentCircle || !circleMessageInput.value.trim()) return;
    
    const message = {
        text: circleMessageInput.value.trim(),
        author: user.is.pub,
        authorName: currentUser,
        timestamp: Date.now()
    };
    
    gun.get('circles')
        .get(currentCircle.id)
        .get('messages')
        .set(message);
    
    circleMessageInput.value = '';
}

// 加入學習圈
function joinCircle(circle) {
    if (!currentUser || !circle || circle.members?.includes(user.is.pub)) return;
    
    const updatedMembers = [...(circle.members || []), user.is.pub];
    gun.get('circles').get(circle.id).get('members').put(updatedMembers);
}

// 分享學習資源
async function shareResource(title, url, description, tags) {
    if (!currentUser) return;
    
    const resourceId = `resource_${Date.now()}`;
    const resource = {
        id: resourceId,
        title,
        url,
        description,
        tags: Array.from(tags),
        author: user.is.pub,
        authorName: currentUser,
        createdAt: Date.now(),
        type: 'resource'
    };
    
    gun.get('resources').get(resourceId).put(resource);
    loadKnowledgeResources();
    resourceModal.style.display = 'none';
    clearResourceForm();
}

// 分享學習筆記
async function shareNote(title, content, tags) {
    if (!currentUser) return;
    
    const noteId = `note_${Date.now()}`;
    const note = {
        id: noteId,
        title,
        content,
        tags: Array.from(tags),
        author: user.is.pub,
        authorName: currentUser,
        createdAt: Date.now(),
        type: 'note'
    };
    
    gun.get('resources').get(noteId).put(note);
    loadKnowledgeResources();
    noteModal.style.display = 'none';
    clearNoteForm();
}

// 載入知識資源列表
function loadKnowledgeResources() {
    knowledgeResourcesContainer.innerHTML = '';
    
    gun.get('resources').map().once((resource, id) => {
        if (!resource) return;
        
        const div = document.createElement('div');
        div.className = resource.type === 'resource' ? 'resource-item' : 'note-item';
        
        if (resource.type === 'resource') {
            div.innerHTML = `
                <h3>${resource.title}</h3>
                <div class="meta">
                    由 ${resource.authorName} 分享於 ${new Date(resource.createdAt).toLocaleDateString()}
                </div>
                <p class="description">${resource.description}</p>
                <a href="${resource.url}" target="_blank" class="primary-btn">查看資源</a>
                <div class="tags">
                    ${resource.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            `;
        } else {
            div.innerHTML = `
                <h3>${resource.title}</h3>
                <div class="meta">
                    由 ${resource.authorName} 分享於 ${new Date(resource.createdAt).toLocaleDateString()}
                </div>
                <div class="note-content">${resource.content}</div>
                <div class="tags">
                    ${resource.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            `;
        }
        
        knowledgeResourcesContainer.appendChild(div);
    });
}

// 處理標籤添加
function handleTagInput(e, tagSet, container) {
    if (e.key === 'Enter' && e.target.value.trim()) {
        const tag = e.target.value.trim();
        if (tagSet.size < 5) { // 限制最多5個標籤
            tagSet.add(tag);
            updateTagsDisplay(tagSet, container);
            e.target.value = '';
        }
    }
}

// 更新標籤顯示
function updateTagsDisplay(tagSet, container) {
    container.innerHTML = '';
    tagSet.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = `
            ${tag}
            <span class="remove" onclick="removeTag('${tag}', ${container.id === 'selectedTags' ? 'currentResourceTags' : 'currentNoteTags'}, '${container.id}')">&times;</span>
        `;
        container.appendChild(span);
    });
}

// 移除標籤
function removeTag(tag, tagSet, containerId) {
    tagSet.delete(tag);
    updateTagsDisplay(tagSet, document.getElementById(containerId));
}

// 清除資源表單
function clearResourceForm() {
    document.getElementById('resourceTitle').value = '';
    document.getElementById('resourceUrl').value = '';
    document.getElementById('resourceDescription').value = '';
    currentResourceTags.clear();
    updateTagsDisplay(currentResourceTags, selectedTags);
}

// 清除筆記表單
function clearNoteForm() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    currentNoteTags.clear();
    updateTagsDisplay(currentNoteTags, noteSelectedTags);
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

createCircleBtn.onclick = () => {
    createCircleModal.style.display = 'flex';
};

submitCircle.onclick = () => {
    const name = document.getElementById('circleName').value.trim();
    const description = document.getElementById('circleDescription').value.trim();
    const category = circleCategory.value;
    
    if (name && category) {
        createLearningCircle(name, description, category);
    }
};

closeCircleModal.onclick = () => {
    createCircleModal.style.display = 'none';
};

closeCircleDetail.onclick = () => {
    circleDetailModal.style.display = 'none';
    currentCircle = null;
};

sendCircleMessage.onclick = sendCircleMessage;
circleMessageInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
        sendCircleMessage();
    }
};

createResourceBtn.onclick = () => {
    resourceModal.style.display = 'flex';
};

createNoteBtn.onclick = () => {
    noteModal.style.display = 'flex';
};

document.getElementById('submitResource').onclick = () => {
    const title = document.getElementById('resourceTitle').value.trim();
    const url = document.getElementById('resourceUrl').value.trim();
    const description = document.getElementById('resourceDescription').value.trim();
    
    if (title && url) {
        shareResource(title, url, description, currentResourceTags);
    }
};

document.getElementById('submitNote').onclick = () => {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    
    if (title && content) {
        shareNote(title, content, currentNoteTags);
    }
};

document.getElementById('closeResourceModal').onclick = () => {
    resourceModal.style.display = 'none';
    clearResourceForm();
};

document.getElementById('closeNoteModal').onclick = () => {
    noteModal.style.display = 'none';
    clearNoteForm();
};

tagInput.onkeypress = (e) => handleTagInput(e, currentResourceTags, selectedTags);
noteTagInput.onkeypress = (e) => handleTagInput(e, currentNoteTags, noteSelectedTags);

loginBtn.onclick = createLoginForm;
profileBtn.onclick = () => {
    // 切換顯示個人資料區域
    document.querySelector('.features').style.display = 
        document.querySelector('.features').style.display === 'none' ? 'block' : 'none';
};

// 初始化
initializeCircleCategories();
loadLearningCircles();
loadUserProfile();