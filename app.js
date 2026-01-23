import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDoc, where, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPggbx3_-BR-Lf8aBkihufcXFF9stijAc",
  authDomain: "schooldiscord67.firebaseapp.com",
  projectId: "schooldiscord67",
  storageBucket: "schooldiscord67.firebasestorage.app",
  messagingSenderId: "870727141580",
  appId: "1:870727141580:web:26b441254827d647409a69",
  measurementId: "G-2D3E72HNF3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const provider = new GoogleAuthProvider();

let currentChatId = null;
let isGroupChat = false;
let messagesListener = null;
let membersListener = null;

onAuthStateChanged(auth, user => {
    if (user) {
        showApp(user);
    } else {
        showAuth();
    }
});

function showApp(user) {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    document.getElementById('user-display-name').innerText = user.email.split('@')[0];
    
    setDoc(doc(db, "users", user.email), { 
        email: user.email, 
        uid: user.uid 
    }, { merge: true });
    
    loadFriends();
    loadGroups();
}

function showAuth() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
}

document.getElementById('login-btn').onclick = () => {
    signInWithPopup(auth, provider).catch(err => console.error(err));
};

document.getElementById('logout-btn').onclick = () => {
    signOut(auth);
};

document.getElementById('add-friend-btn').onclick = async () => {
    const email = document.getElementById('friend-search').value.toLowerCase().trim();
    if (!email || email === auth.currentUser.email) return;
    
    const userDoc = await getDoc(doc(db, "users", email));
    if (userDoc.exists()) {
        await setDoc(doc(db, `users/${auth.currentUser.email}/friends`, email), { email });
        document.getElementById('friend-search').value = "";
        alert(`Added ${email}!`);
    } else {
        alert("User not found. They need to sign in first.");
    }
};

function loadFriends() {
    onSnapshot(collection(db, `users/${auth.currentUser.email}/friends`), snapshot => {
        const list = document.getElementById('friends-list');
        list.innerHTML = "";
        
        snapshot.forEach(doc => {
            const email = doc.data().email;
            const item = document.createElement('div');
            item.className = "friend-item";
            item.textContent = `👤 ${email.split('@')[0]}`;
            item.onclick = () => openDirectMessage(email);
            list.appendChild(item);
        });
    });
}

function openDirectMessage(email) {
    isGroupChat = false;
    currentChatId = [auth.currentUser.email, email].sort().join("_");
    
    document.getElementById('chat-title').textContent = `@ ${email.split('@')[0]}`;
    document.getElementById('add-member-section').style.display = 'none';
    document.getElementById('members-sidebar').style.display = 'none';
    document.getElementById('message-input').disabled = false;
    document.getElementById('image-btn').disabled = false;
    
    loadMessages();
}

document.getElementById('create-group-btn').onclick = async () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) return;
    
    await addDoc(collection(db, "groups"), {
        name,
        members: [auth.currentUser.email],
        createdAt: serverTimestamp()
    });
    
    document.getElementById('group-name-input').value = "";
};

function loadGroups() {
    const q = query(
        collection(db, "groups"), 
        where("members", "array-contains", auth.currentUser.email)
    );
    
    onSnapshot(q, snapshot => {
        const list = document.getElementById('groups-list');
        list.innerHTML = "";
        
        snapshot.forEach(doc => {
            const group = doc.data();
            const item = document.createElement('div');
            item.className = "group-item";
            item.textContent = `# ${group.name}`;
            item.onclick = () => openGroup(doc.id, group.name);
            list.appendChild(item);
        });
    });
}

function openGroup(groupId, groupName) {
    isGroupChat = true;
    currentChatId = groupId;
    
    document.getElementById('chat-title').textContent = `# ${groupName}`;
    document.getElementById('add-member-section').style.display = 'flex';
    document.getElementById('members-sidebar').style.display = 'flex';
    document.getElementById('message-input').disabled = false;
    document.getElementById('image-btn').disabled = false;
    
    loadMessages();
    loadMembers();
}

document.getElementById('image-btn').onclick = () => {
    document.getElementById('image-upload').click();
};

document.getElementById('add-member-btn').onclick = async () => {
    const email = document.getElementById('member-email-input').value.toLowerCase().trim();
    if (!email) return;
    
    const userDoc = await getDoc(doc(db, "users", email));
    if (userDoc.exists()) {
        await updateDoc(doc(db, "groups", currentChatId), {
            members: arrayUnion(email)
        });
        document.getElementById('member-email-input').value = "";
        alert(`Added ${email} to group!`);
    } else {
        alert("User not found.");
    }
};

function loadMembers() {
    if (membersListener) membersListener();
    
    membersListener = onSnapshot(doc(db, "groups", currentChatId), snapshot => {
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = "";
        
        if (!snapshot.exists()) return;
        
        const members = snapshot.data().members || [];
        members.forEach(email => {
            const item = document.createElement('div');
            item.className = "member-item";
            item.textContent = email;
            membersList.appendChild(item);
        });
    });
}

document.getElementById('message-input').onkeypress = async (e) => {
    if (e.key !== 'Enter') return;
    
    const text = e.target.value.trim();
    if (!text) return;
    
    const path = isGroupChat 
        ? `groups/${currentChatId}/messages`
        : `chats/${currentChatId}/messages`;
    
    await addDoc(collection(db, path), {
        text,
        sender: auth.currentUser.email,
        timestamp: serverTimestamp()
    });
    
    e.target.value = "";
};

document.getElementById('image-upload').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file!');
        return;
    }
    
    if (file.size > 1024 * 1024) {
        alert('Image must be under 1MB!');
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const path = isGroupChat 
                ? `groups/${currentChatId}/messages`
                : `chats/${currentChatId}/messages`;
            
            await addDoc(collection(db, path), {
                imageData: event.target.result,
                sender: auth.currentUser.email,
                timestamp: serverTimestamp()
            });
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image.');
    }
};

function loadMessages() {
    if (messagesListener) messagesListener();
    
    const path = isGroupChat 
        ? `groups/${currentChatId}/messages`
        : `chats/${currentChatId}/messages`;
    
    const q = query(collection(db, path), orderBy("timestamp", "asc"));
    
    messagesListener = onSnapshot(q, snapshot => {
        const area = document.getElementById('messages-area');
        area.innerHTML = "";
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isOwn = msg.sender === auth.currentUser.email;
            
            const msgDiv = document.createElement('div');
            msgDiv.className = isOwn ? 'message own' : 'message';
            
            const sender = document.createElement('div');
            sender.className = 'message-sender';
            sender.textContent = msg.sender.split('@')[0];
            
            msgDiv.appendChild(sender);
            
            if (msg.text) {
                const text = document.createElement('div');
                text.className = 'message-text';
                text.textContent = msg.text;
                msgDiv.appendChild(text);
            }
            
            if (msg.imageData) {
                const img = document.createElement('img');
                img.className = 'message-image';
                img.src = msg.imageData;
                img.onclick = () => window.open(msg.imageData, '_blank');
                msgDiv.appendChild(img);
            }
            
            area.appendChild(msgDiv);
        });
        
        area.scrollTop = area.scrollHeight;
    });
}
