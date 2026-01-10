// Handles Websim Multiplayer Synchronization
export const room = new WebsimSocket();

export const STATE = {
    isModMode: false,
    currentUser: null,
};

export async function initMultiplayer(onStateChange, onPresenceChange) {
    await room.initialize();
    
    // Subscribe to state changes
    room.subscribeRoomState((state) => {
        onStateChange(state);
    });

    room.subscribePresence((presence) => {
        onPresenceChange(presence);
    });

    // Handle incoming custom events
    room.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'nuke_effect') {
            // Visual effect could go here
            console.log("Comment nuked:", data.commentId);
        }
    };

    STATE.currentUser = room.peers[room.clientId];
    return room;
}

// Helper to check if a comment is "nuked" (moderated)
export function isCommentNuked(commentId) {
    const nukedList = room.roomState.nukedComments || {};
    return !!nukedList[commentId];
}

// Action: Nuke a comment (Moderator Tool)
export function nukeComment(commentId) {
    // We use a map for O(1) lookups
    room.updateRoomState({
        nukedComments: {
            [commentId]: true
        }
    });
    
    room.send({
        type: 'nuke_effect',
        commentId: commentId
    });
}

// Action: Create Poll
export function publishPoll(question, options) {
    room.updateRoomState({
        activePoll: {
            id: Date.now(),
            question,
            options, // Array of strings
            createdAt: Date.now()
        }
    });
    
    // Clear previous votes from my presence when a new poll starts? 
    // Ideally we reset presence votes, but we can't force others.
    // Instead, we just track the pollId in the vote to ensure validity.
}

// Action: Vote
export function votePoll(pollId, optionIndex) {
    room.updatePresence({
        vote: {
            pollId,
            optionIndex
        }
    });
}