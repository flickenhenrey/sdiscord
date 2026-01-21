import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, setDoc, getDoc, where, updateDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
const rtdb = getDatabase();
const storage = getStorage();
const provider = new GoogleAuthProvider();

let activeChatId = null;
let isGroupChat = false;
let messageUnsubscribe = null;
let membersUnsubscribe = null;
let onlineStatuses = {};
let selectedAvatarFile = null;

// Auth State
onAuthStateChanged(auth, user => {
    if (user) {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];
        
        // Load user profile
        loadUserProfile(user.email);
        
        setDoc(doc(db, "users", user.email), { email: user.email, uid: user.uid }, { merge: true });
        
        // Set up presence system
        const userStatusRef = ref(rtdb, `status/${user.email.replace(/\./g, '_')}`);
        set(userStatusRef, { online: true, lastSeen: Date.now() });
        onDisconnect(userStatusRef).set({ online: false, lastSeen: Date.now() });
        
        loadFriends();
        loadGroups();
    } else {
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);

// --- PROFILE SYSTEM ---

async function loadUserProfile(email) {
    const userDoc = await getDoc(doc(db, "users", email));
    if (userDoc.exists() && userDoc.data().avatarUrl) {
        document.getElementById('user-avatar').src = userDoc.data().avatarUrl;
        document.getElementById('preview-avatar').src = userDoc.data().avatarUrl;
    }
}

document.getElementById('user-info-btn').onclick = () => {
    document.getElementById('profile-modal').style.display = 'flex';
};

document.getElementById('close-modal-btn').onclick = () => {
    document.getElementById('profile-modal').style.display = 'none';
};

document.getElementById('upload-btn').onclick = () => {
    document.getElementById('avatar-upload').click();
};

document.getElementById('avatar-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (20MB = 20 * 1024 * 1024 bytes)
    if (file.size > 20 * 1024 * 1024) {
        alert('File size must be under 20MB!');
        return;
    }
    
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file!');
        return;
    }
    
    selectedAvatarFile = file;
    
    // Preview the image
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-avatar').src = e.target.result;
    };
    reader.readAsDataURL(file);
};

document.getElementById('save-profile-btn').onclick = async () => {
    if (!selectedAvatarFile) {
        alert('Please select an image first!');
        return;
    }
    
    try {
        const userEmail = auth.currentUser.email;
        const fileRef = storageRef(storage, `avatars/${userEmail}_${Date.now()}`);
        
        // Upload the file
        await uploadBytes(fileRef, selectedAvatarFile);
        
        // Get the download URL
        const downloadURL = await getDownloadURL(fileRef);
        
        // Save to Firestore
        await updateDoc(doc(db, "users", userEmail), {
            avatarUrl: downloadURL
        });
        
        // Update UI
        document.getElementById('user-avatar').src = downloadURL;
        document.getElementById('profile-modal').style.display = 'none';
        
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Error uploading avatar:', error);
        alert('Failed to upload avatar. Please try again.');
    }
};

// Close modal when clicking outside
document.getElementById('profile-modal').onclick = (e) => {
    if (e.target.id === 'profile-modal') {
        document.getElementById('profile-modal').style.display = 'none';
    }
};

// --- FRIENDS SYSTEM ---

document.getElementById('add-friend-btn').onclick = async () => {
    const email = document.getElementById('friend-search').value.toLowerCase().trim();
    if (!email || email === auth.currentUser.email) return;

    const userSnap = await getDoc(doc(db, "users", email));
    if (userSnap.exists()) {
        await setDoc(doc(db, `users/${auth.currentUser.email}/friends`, email), { email: email });
        document.getElementById('friend-search').value = "";
    } else {
        alert("User not found! They must log in to the app first.");
    }
};

function loadFriends() {
    onSnapshot(collection(db, `users/${auth.currentUser.email}/friends`), (snapshot) => {
        const list = document.getElementById('friends-list');
        list.innerHTML = "";
        snapshot.forEach(doc => {
            const email = doc.data().email;
            const div = document.createElement('div');
            div.className = "friend-item";
            div.innerText = `👤 ${email.split('@')[0]}`;
            div.onclick = () => startChat(email, false);
            list.appendChild(div);
        });
    });
}

// --- GROUPS SYSTEM ---

document.getElementById('create-group-btn').onclick = async () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (name) {
        await addDoc(collection(db, "groups"), {
            name: name,
            members: [auth.currentUser.email],
            createdAt: serverTimestamp()
        });
        document.getElementById('group-name-input').value = "";
    }
};

function loadGroups() {
    const q = query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.email));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('groups-list');
        list.innerHTML = "";
        snapshot.forEach(doc => {
            const group = doc.data();
            const div = document.createElement('div');
            div.className = "friend-item";
            div.innerText = `# ${group.name}`;
            div.onclick = () => startChat(doc.id, true, group.name);
            list.appendChild(div);
        });
    });
}

document.getElementById('add-member-btn').onclick = async () => {
    const email = document.getElementById('add-member-email').value.toLowerCase().trim();
    if (!email) return;

    const userSnap = await getDoc(doc(db, "users", email));
    if (userSnap.exists()) {
        await updateDoc(doc(db, "groups", activeChatId), {
            members: arrayUnion(email)
        });
        document.getElementById('add-member-email').value = "";
        alert("Member added!");
    } else {
        alert("User not found.");
    }
};

// --- CHAT LOGIC ---

function startChat(id, isGroup, displayName = "") {
    isGroupChat = isGroup;
    
    // Show/hide members panel
    const membersPanel = document.getElementById('members-panel');
    membersPanel.style.display = isGroup ? 'flex' : 'none';
    
    document.getElementById('group-manage-area').style.display = isGroup ? 'block' : 'none';
    
    if (isGroupChat) {
        activeChatId = id;
        document.getElementById('chat-with-title').innerText = `# ${displayName}`;
        loadMembers();
    } else {
        activeChatId = [auth.currentUser.email, id].sort().join("_");
        document.getElementById('chat-with-title').innerText = `@ ${id}`;
        if (membersUnsubscribe) membersUnsubscribe();
    }
    
    document.getElementById('message-input').disabled = false;
    loadMessages();
}

function loadMembers() {
    if (membersUnsubscribe) membersUnsubscribe();
    
    membersUnsubscribe = onSnapshot(doc(db, "groups", activeChatId), (snapshot) => {
        const membersList = document.getElementById('members-list');
        membersList.innerHTML = "";
        
        if (snapshot.exists()) {
            const members = snapshot.data().members || [];
            members.forEach(email => {
                const div = document.createElement('div');
                div.className = "member-item";
                div.setAttribute('data-email', email);
                
                const indicator = document.createElement('span');
                indicator.className = 'status-indicator offline';
                
                const emailText = document.createElement('span');
                emailText.innerText = email;
                
                div.appendChild(indicator);
                div.appendChild(emailText);
                membersList.appendChild(div);
                
                // Listen to this user's online status
                const statusRef = ref(rtdb, `status/${email.replace(/\./g, '_')}`);
                onValue(statusRef, (statusSnapshot) => {
                    const status = statusSnapshot.val();
                    if (status && status.online) {
                        indicator.className = 'status-indicator online';
                    } else {
                        indicator.className = 'status-indicator offline';
                    }
                });
            });
        }
    });
}

document.getElementById('message-input').onkeypress = async (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        const path = isGroupChat ? `groups/${activeChatId}/messages` : `chats/${activeChatId}/messages`;
        await addDoc(collection(db, path), {
            text: e.target.value,
            sender: auth.currentUser.email,
            timestamp: serverTimestamp()
        });
        e.target.value = "";
    }
};

function loadMessages() {
    if (messageUnsubscribe) messageUnsubscribe();
    const path = isGroupChat ? `groups/${activeChatId}/messages` : `chats/${activeChatId}/messages`;
    const q = query(collection(db, path), orderBy("timestamp", "asc"));
    
    messageUnsubscribe = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('messages-container');
        container.innerHTML = "";
        snapshot.forEach(doc => {
            const m = doc.data();
            const isMe = m.sender === auth.currentUser.email;
            const div = document.createElement('div');
            div.className = `msg ${isMe ? 'msg-me' : ''}`;
            div.innerHTML = `<b>${m.sender.split('@')[0]}</b><div class="msg-text">${m.text}</div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}
