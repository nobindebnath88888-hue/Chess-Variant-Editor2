 const firebaseConfig = {
    apiKey: "AIzaSyDPzZDDPsueij9eJ81TQavPWa5LJw3VWAY",
    authDomain: "chess-variant-editor2.firebaseapp.com",
    projectId: "chess-variant-editor2",
    storageBucket: "chess-variant-editor2.firebasestorage.app",
    messagingSenderId: "629988046702",
    appId: "1:629988046702:web:88d2e3cc9158051499737f",
    measurementId: "G-3JV7XF9DX8"
  };



firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==================== CONSTANTS ====================
const PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙'
};

// ==================== GLOBAL STATE ====================
let state = {
    size: 14,
    selectedPiece: 'P',
    selectedColor: 'white',
    boardData: {},
    teamMode: false,
    userId: '',
    inGame: false,
    roomId: null,
    playerColor: null,
    gameBoardData: {},
    currentTurn: 'white',
    selectedSquare: null,
};

// ==================== INITIALIZATION ====================
function init() {
    let uid = localStorage.getItem('chessVariantUserId');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('chessVariantUserId', uid);
    }
    state.userId = uid;

    const container = document.getElementById('piece-tools');
    container.innerHTML = ''; // Clear
    Object.keys(PIECES).forEach(key => {
        const div = document.createElement('div');
        div.className = `piece-tool ${key === 'P' ? 'active' : ''}`;
        div.id = `tool-${key}`;
        div.textContent = PIECES[key];
        div.onclick = () => selectTool(key);
        container.appendChild(div);
    });

    loadVariantList();
    renderBoard();
}

// ==================== EDITOR FUNCTIONS ====================
function renderBoard() {
    const board = document.getElementById('chess-board');
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${state.size}, 45px)`;

    for (let y = state.size - 1; y >= 0; y--) {
        for (let x = 0; x < state.size; x++) {
            const sq = document.createElement('div');
            const dead = isDeadZone(x, y);
            sq.className = `square ${(x + y) % 2 === 0 ? 'sq-dark' : 'sq-light'} ${dead ? 'sq-dead' : ''}`;
            
            if (!dead) {
                const data = state.boardData[`${x},${y}`];
                if (data) {
                    const symbol = PIECES[data.type];
                    sq.innerHTML = `<span style="color: ${getColor(data.color)}">${symbol}</span>`;
                }
                sq.onclick = () => paintPiece(x, y);
            }
            board.appendChild(sq);
        }
    }
}

function isDeadZone(x, y) {
    const d = 3; 
    const s = state.size;
    return (x < d && y < d) || (x < d && y >= s-d) || (x >= s-d && y < d) || (x >= s-d && y >= s-d);
}

function paintPiece(x, y) {
    if (state.selectedPiece === 'eraser') {
        delete state.boardData[`${x},${y}`];
    } else {
        state.boardData[`${x},${y}`] = { type: state.selectedPiece, color: state.selectedColor };
    }
    renderBoard();
}

function selectTool(type) {
    state.selectedPiece = type;
    document.querySelectorAll('.piece-tool').forEach(t => t.classList.remove('active'));
    document.getElementById('btn-eraser').classList.remove('btn-eraser-active');

    if (type === 'eraser') {
        document.getElementById('btn-eraser').classList.add('btn-eraser-active');
    } else {
        const tool = document.getElementById(`tool-${type}`);
        if (tool) tool.classList.add('active');
    }
}

function selectColor(color) {
    state.selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${color}`).classList.add('active');
}

function getColor(c) {
    const map = { white: '#ffffff', silver: '#bdc3c7', black: '#2c3e50', gold: '#f1c40f' };
    return map[c] || '#ffffff';
}

function changeSize(val) {
    state.size = parseInt(val);
    document.getElementById('dim-label').innerText = `${val} x ${val}`;
    state.boardData = {};
    renderBoard();
}

function toggleTeamMode() {
    state.teamMode = document.getElementById('team-mode').checked;
}

function clearBoard() {
    if(confirm("Clear everything?")) {
        state.boardData = {};
        renderBoard();
    }
}

// ==================== VARIANT MANAGEMENT ====================
function saveVariant() {
    const name = document.getElementById('variant-name').value.trim() || 'Unnamed';
    const variantData = {
        name: name,
        size: state.size,
        boardData: state.boardData,
        teamMode: state.teamMode,
        userId: state.userId,
        timestamp: Date.now()
    };

    db.ref('variants').push(variantData).then(() => {
        alert('Variant saved!');
        loadVariantList();
    });
}

function loadVariantList() {
    const listDiv = document.getElementById('variant-list');
    listDiv.innerHTML = 'Loading...';

    db.ref('variants').orderByChild('userId').equalTo(state.userId).once('value', snapshot => {
        listDiv.innerHTML = '';
        snapshot.forEach(child => {
            const v = child.val();
            const item = document.createElement('div');
            item.className = 'variant-item';
            item.innerHTML = `
                <span>${v.name}</span>
                <div>
                    <button onclick="loadVariant('${child.key}')">📂</button>
                    <button onclick="deleteVariant('${child.key}')">🗑️</button>
                </div>
            `;
            listDiv.appendChild(item);
        });
    });
}

function loadVariant(id) {
    db.ref('variants/' + id).once('value', snapshot => {
        const v = snapshot.val();
        if (!v) return;
        state.size = v.size;
        state.boardData = v.boardData || {};
        state.teamMode = v.teamMode || false;
        document.getElementById('team-mode').checked = state.teamMode;
        document.getElementById('dim-label').innerText = `${state.size} x ${state.size}`;
        document.getElementById('variant-name').value = v.name;
        renderBoard();
    });
}

function deleteVariant(id) {
    if (confirm('Delete?')) db.ref('variants/' + id).remove().then(() => loadVariantList());
}

// ==================== ROOM / GAMEPLAY ====================
function createRoom() {
    if (Object.keys(state.boardData).length === 0) return alert('Design a board first!');
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    db.ref('rooms/' + roomId).set({
        variant: { size: state.size, boardData: state.boardData, teamMode: state.teamMode },
        players: { white: state.userId, black: null },
        gameState: { board: state.boardData, turn: 'white' }
    }).then(() => {
        state.roomId = roomId;
        state.playerColor = 'white';
        enterGameMode(roomId);
        listenToRoom(roomId);
    });
}

function joinRoom() {
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (!code) return;
    db.ref('rooms/' + code).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Room not found");
        db.ref('rooms/' + code + '/players/black').set(state.userId).then(() => {
            state.roomId = code;
            state.playerColor = 'black';
            enterGameMode(code);
            listenToRoom(code);
        });
    });
}

function enterGameMode(roomId) {
    state.inGame = true;
    document.getElementById('chess-board').classList.add('hidden');
    document.getElementById('game-board').classList.remove('hidden');
    document.getElementById('game-board').classList.add('active-board');
    document.getElementById('room-info').innerHTML = `Room: <b>${roomId}</b> | Color: ${state.playerColor}`;
    renderGameBoard();
}

function exitGameMode() {
    if (state.roomId) db.ref('rooms/' + state.roomId).off();
    state.inGame = false;
    document.getElementById('chess-board').classList.remove('hidden');
    document.getElementById('game-board').classList.add('hidden');
    document.getElementById('game-board').classList.remove('active-board');
    document.getElementById('turn-indicator').textContent = "Editor Mode";
    document.getElementById('room-info').innerHTML = "";
}

function renderGameBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${state.size}, 45px)`;

    for (let y = state.size - 1; y >= 0; y--) {
        for (let x = 0; x < state.size; x++) {
            const sq = document.createElement('div');
            const dead = isDeadZone(x, y);
            sq.className = `square ${(x + y) % 2 === 0 ? 'sq-dark' : 'sq-light'} ${dead ? 'sq-dead' : ''}`;
            sq.dataset.x = x;
            sq.dataset.y = y;
            
            if (!dead) {
                const data = state.gameBoardData[`${x},${y}`];
                if (data) {
                    sq.innerHTML = `<span style="color: ${getColor(data.color)}">${PIECES[data.type]}</span>`;
                }
                sq.onclick = () => handleGameSquareClick(x, y);
            }
            board.appendChild(sq);
        }
    }

    const indicator = document.getElementById('turn-indicator');
    indicator.textContent = `TURN: ${state.currentTurn.toUpperCase()}`;
    indicator.style.color = (state.playerColor === state.currentTurn) ? "#2ecc71" : "#e74c3c";
}

function handleGameSquareClick(x, y) {
    if (!state.inGame || state.playerColor !== state.currentTurn) return;

    const squareKey = `${x},${y}`;
    if (!state.selectedSquare) {
        const piece = state.gameBoardData[squareKey];
        if (piece && piece.color === state.playerColor) {
            state.selectedSquare = squareKey;
            highlightSquare(x, y, true);
        }
    } else {
        const fromPiece = state.gameBoardData[state.selectedSquare];
        delete state.gameBoardData[state.selectedSquare];
        state.gameBoardData[squareKey] = fromPiece;
        
        state.currentTurn = (state.currentTurn === 'white') ? 'black' : 'white';
        state.selectedSquare = null;

        db.ref('rooms/' + state.roomId + '/gameState').set({
            board: state.gameBoardData,
            turn: state.currentTurn
        });
    }
}

function highlightSquare(x, y, on) {
    document.querySelectorAll('#game-board .square').forEach(sq => {
        sq.style.boxShadow = (on && sq.dataset.x == x && sq.dataset.y == y) ? 'inset 0 0 15px rgba(52, 152, 219, 0.8)' : 'none';
    });
}

function listenToRoom(roomId) {
    db.ref('rooms/' + roomId).on('value', snapshot => {
        const room = snapshot.val();
        if (!room) return exitGameMode();
        state.gameBoardData = room.gameState.board || {};
        state.currentTurn = room.gameState.turn || 'white';
        renderGameBoard();
    });
}

init();
