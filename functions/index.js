const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const serverWallet = new ethers.Wallet('0xe1641dc5b9f36fb13ce6de8642cbd259f512f15c899a8bf2ab4a8b7614003343'); // Thay bằng private key ví server

let unrankQueue = [];
let rankQueue = [];
let activeMatches = new Map();

app.post('/join-unrank', async (req, res) => {
    const { player } = req.body;
    if (!player || !player.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).send('Invalid player address');
    }

    if (unrankQueue.length > 0) {
        const opponent = unrankQueue.shift();
        const matchId = `${player}-${opponent}-${Date.now()}`;
        activeMatches.set(matchId, {
            player1: player,
            player2: opponent,
            board: Array(1089).fill(''),
            currentPlayer: 'X',
            mode: 'unrank',
            lastMoveTime: Date.now()
        });
        res.json({ opponent });
    } else {
        unrankQueue.push(player);
        res.json({ opponent: null });
    }
});

app.post('/join-rank', async (req, res) => {
    const { player } = req.body;
    if (!player || !player.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).send('Invalid player address');
    }

    if (rankQueue.length > 0) {
        const opponent = rankQueue.shift();
        const matchId = `${player}-${opponent}-${Date.now()}`;
        activeMatches.set(matchId, {
            player1: player,
            player2: opponent,
            board: Array(1089).fill(''),
            currentPlayer: 'X',
            mode: 'rank',
            lastMoveTime: Date.now()
        });
        res.json({ opponent });
    } else {
        rankQueue.push(player);
        res.json({ opponent: null });
    }
});

app.post('/move', async (req, res) => {
    const { player, opponent, index, mode } = req.body;
    if (!player || !opponent || !player.match(/^0x[a-fA-F0-9]{40}$/) || !opponent.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).send('Invalid address');
    }

    const matchId = Array.from(activeMatches.keys()).find(key => key.includes(player) && key.includes(opponent));
    if (!matchId) {
        return res.status(400).send('Match not found');
    }

    const match = activeMatches.get(matchId);
    if (match.currentPlayer !== (match.player1 === player ? 'X' : 'O')) {
        return res.status(400).send('Not your turn');
    }
    if (index < 0 || index >= 1089 || match.board[index] !== '') {
        return res.status(400).send('Invalid move');
    }

    match.lastMoveTime = Date.now();
    match.board[index] = match.currentPlayer;

    if (checkWin(match.board, match.currentPlayer)) {
        const result = match.player1 === player ? 1 : 2;
        activeMatches.delete(matchId);
        if (mode === 'unrank') {
            const message = ethers.utils.solidityKeccak256(['address', 'address', 'uint8', 'bool'], [player, opponent, result, false]);
            const signature = await serverWallet.signMessage(ethers.utils.arrayify(message));
            res.json({ result, message: `${player === match.player1 ? 'Bạn' : 'Đối thủ'} thắng!`, signature });
        } else {
            res.json({ result, message: `${player === match.player1 ? 'Bạn' : 'Đối thủ'} thắng!` });
        }
    } else if (match.board.every(cell => cell !== '')) {
        activeMatches.delete(matchId);
        if (mode === 'unrank') {
            const message = ethers.utils.solidityKeccak256(['address', 'address', 'uint8', 'bool'], [player, opponent, 0, false]);
            const signature = await serverWallet.signMessage(ethers.utils.arrayify(message));
            res.json({ result: 0, message: 'Hòa!', signature });
        } else {
            res.json({ result: 0, message: 'Hòa!' });
        }
    } else {
        match.currentPlayer = match.currentPlayer === 'X' ? 'O' : 'X';
        res.json({ opponentMove: index });
    }
});

function checkWin(board, player) {
    const size = 33;
    const toIndex = (row, col) => row * size + col;
    for (let row = 0; row <= size - 5; row++) {
        for (let col = 0; col <= size - 5; col++) {
            if (board[toIndex(row, col)] !== player) continue;
            if (col <= size - 5 && Array.from({length: 5}, (_, i) => board[toIndex(row, col + i)]).every(cell => cell === player)) return true;
            if (row <= size - 5 && Array.from({length: 5}, (_, i) => board[toIndex(row + i, col)]).every(cell => cell === player)) return true;
            if (row <= size - 5 && col <= size - 5 && Array.from({length: 5}, (_, i) => board[toIndex(row + i, col + i)]).every(cell => cell === player)) return true;
            if (row >= 4 && col <= size - 5 && Array.from({length: 5}, (_, i) => board[toIndex(row - i, col + i)]).every(cell => cell === player)) return true;
        }
    }
    return false;
}

exports.api = functions.https.onRequest(app);