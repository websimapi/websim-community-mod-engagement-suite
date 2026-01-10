import { initMultiplayer, room, STATE, isCommentNuked, nukeComment, publishPoll, votePoll } from './state.js';
import { fetchComments, postComment, renderMarkdown } from './comments.js';

// DOM Elements
const els = {
    feed: document.getElementById('comments-list'),
    input: document.getElementById('comment-input'),
    form: document.getElementById('comment-form'),
    modBtn: document.getElementById('mod-toggle'),
    refreshBtn: document.getElementById('refresh-btn'),
    peerCount: document.getElementById('peer-count'),
    pollContainer: document.getElementById('poll-container'),
    createPollBtn: document.getElementById('create-poll-btn'),
    pollModal: document.getElementById('poll-modal'),
    publishPollBtn: document.getElementById('publish-poll'),
    cancelPollBtn: document.getElementById('cancel-poll'),
    myUsername: document.getElementById('my-username'),
    myAvatar: document.getElementById('my-avatar'),
};

// --- Initialization ---

async function init() {
    // 1. Setup Multiplayer
    await initMultiplayer(renderPoll, updatePresenceUI);
    
    // Update identity
    const me = room.peers[room.clientId];
    if (me) {
        els.myUsername.textContent = me.username;
        els.myAvatar.innerHTML = `<img src="${me.avatarUrl}" style="width:20px;height:20px;border-radius:50%">`;
    }

    // 2. Load Content
    await loadFeed();

    // 3. Event Listeners
    setupListeners();

    // 4. Initial Poll Render
    renderPoll(room.roomState);
    
    // Enable Poll creation for everyone in this demo (usually restricted to mods)
    els.createPollBtn.style.display = 'block'; 
}

// --- Comments & Feed ---

let allComments = [];

async function loadFeed() {
    els.feed.innerHTML = '<div class="loading-spinner">Syncing with subreddit...</div>';
    allComments = await fetchComments();
    renderFeed();
}

function renderFeed() {
    els.feed.innerHTML = '';
    
    if (allComments.length === 0) {
        els.feed.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;color:#818384">No discussions yet. Be the first!</div>';
        return;
    }

    allComments.forEach(commentObj => {
        const c = commentObj.comment;
        const isNuked = isCommentNuked(c.id);

        // If nuked and not in mod mode, show simplified "Removed" state or hide
        // We will show a placeholder like Reddit
        
        const div = document.createElement('div');
        div.className = `comment ${isNuked ? 'removed' : ''}`;
        
        // Mod controls
        const nukeBtn = STATE.isModMode && !isNuked 
            ? `<button class="btn-nuke" data-id="${c.id}">REMOVE</button>` 
            : '';
            
        const contentHtml = isNuked 
            ? '<em style="color:#818384">[removed by moderator]</em>' 
            : renderMarkdown(c.raw_content);

        // Check if author is online (basic flair simulation)
        const isOnline = Object.values(room.peers).some(p => p.username === c.author.username);
        const flairHtml = isOnline ? `<span class="flair">Online</span>` : '';

        div.innerHTML = `
            <div class="comment-meta">
                <img src="${c.author.avatar_url}" style="width:20px;height:20px;border-radius:50%">
                <span class="author">${c.author.username}</span>
                ${flairHtml}
                <span class="timestamp">• ${timeAgo(c.created_at)}</span>
                ${isNuked ? '<span class="mod-badge">MODERATED</span>' : ''}
                ${nukeBtn}
            </div>
            <div class="comment-body">
                ${contentHtml}
            </div>
        `;
        
        // Handle Nuke Click
        const btn = div.querySelector('.btn-nuke');
        if(btn) {
            btn.addEventListener('click', () => {
                if(confirm('Are you sure you want to nuke this comment chain?')) {
                    nukeComment(c.id);
                }
            });
        }

        els.feed.appendChild(div);
    });
}

// --- Polls & Engagement ---

function renderPoll(roomState) {
    const poll = roomState.activePoll;
    if (!poll) {
        els.pollContainer.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:#818384;font-style:italic">No active polls.</div>';
        return;
    }

    // Tally votes from presence
    const counts = new Array(poll.options.length).fill(0);
    let totalVotes = 0;
    let myVote = -1;

    Object.values(room.presence).forEach(p => {
        if (p.vote && p.vote.pollId === poll.id) {
            if (counts[p.vote.optionIndex] !== undefined) {
                counts[p.vote.optionIndex]++;
                totalVotes++;
            }
            if (p === room.presence[room.client.id]) { // checking if it's me roughly, better to check ID if available in presence object directly or via peers key
                // Actually presence is keyed by clientId
            }
        }
    });
    
    // Check my vote specifically
    const myPresence = room.presence[room.clientId];
    if (myPresence && myPresence.vote && myPresence.vote.pollId === poll.id) {
        myVote = myPresence.vote.optionIndex;
    }

    let optionsHtml = '';
    poll.options.forEach((opt, idx) => {
        const percent = totalVotes === 0 ? 0 : Math.round((counts[idx] / totalVotes) * 100);
        const isSelected = myVote === idx;
        
        optionsHtml += `
            <button class="poll-option-btn ${isSelected ? 'voted' : ''}" data-idx="${idx}">
                <div class="bar" style="width: ${percent}%"></div>
                <span>
                    <span class="opt-text">${opt}</span>
                    <span class="opt-percent">${percent}%</span>
                </span>
            </button>
        `;
    });

    els.pollContainer.innerHTML = `
        <div class="poll-card">
            <div class="poll-question">${poll.question}</div>
            <div class="poll-options-list">${optionsHtml}</div>
            <div style="font-size:0.7rem; color:#818384; margin-top:8px; text-align:right">${totalVotes} votes</div>
        </div>
    `;

    // Add click listeners to options
    els.pollContainer.querySelectorAll('.poll-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            votePoll(poll.id, idx);
        });
    });
}

function updatePresenceUI(presence) {
    // Update online count
    const count = Object.keys(presence).length;
    els.peerCount.textContent = count;
    
    // Also re-render poll because votes are in presence
    renderPoll(room.roomState);
}


// --- Interaction Logic ---

function setupListeners() {
    // Toggle Mod Mode
    els.modBtn.addEventListener('click', () => {
        STATE.isModMode = !STATE.isModMode;
        document.body.classList.toggle('mod-active', STATE.isModMode);
        renderFeed(); // Re-render to show/hide buttons
    });

    // Refresh Feed
    els.refreshBtn.addEventListener('click', loadFeed);

    // Listen for real-time comment events
    window.websim.addEventListener('comment:created', (data) => {
        // Prepend to list or reload. Reloading is safer for order.
        loadFeed();
    });

    // Post Comment
    els.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = els.input.value;
        if (!text) return;

        els.input.disabled = true;
        els.input.value = "Posting...";
        
        const success = await postComment(text);
        
        els.input.disabled = false;
        els.input.value = "";
        els.input.focus();
        
        if (success) {
            // Optimistic update or wait for event?
            // Event listener will catch it.
        } else {
            alert("Failed to post comment.");
        }
    });

    // Poll Creation
    els.createPollBtn.addEventListener('click', () => {
        els.pollModal.classList.remove('hidden');
    });

    els.cancelPollBtn.addEventListener('click', () => {
        els.pollModal.classList.add('hidden');
    });

    els.publishPollBtn.addEventListener('click', () => {
        const q = document.getElementById('poll-question').value;
        const opts = Array.from(document.querySelectorAll('.poll-option'))
            .map(i => i.value)
            .filter(v => v.trim());
        
        if (q && opts.length >= 2) {
            publishPoll(q, opts);
            els.pollModal.classList.add('hidden');
        } else {
            alert("Please enter a question and at least 2 options.");
        }
    });
}

// Utility
function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// Start
init();