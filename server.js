
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/health", (req, res) => {
    res.json({ ok: true, service: "uno-online" });
});

const rooms = new Map();
const COLORS = ["red", "yellow", "green", "blue"];

function makeRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (rooms.has(code));
    return code;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function createDeck() {
    const deck = [];

    for (const color of COLORS) {
        deck.push({ color, value: "0", type: "number", chosenColor: null });

        for (let n = 1; n <= 9; n++) {
            deck.push({ color, value: String(n), type: "number", chosenColor: null });
            deck.push({ color, value: String(n), type: "number", chosenColor: null });
        }

        deck.push({ color, value: "PULAR", type: "skip", chosenColor: null });
        deck.push({ color, value: "PULAR", type: "skip", chosenColor: null });

        deck.push({ color, value: "REVERSO", type: "reverse", chosenColor: null });
        deck.push({ color, value: "REVERSO", type: "reverse", chosenColor: null });

        deck.push({ color, value: "+2", type: "draw2", chosenColor: null });
        deck.push({ color, value: "+2", type: "draw2", chosenColor: null });
    }

    for (let i = 0; i < 4; i++) {
        deck.push({ color: null, value: "CORINGA", type: "wild", chosenColor: null });
        deck.push({ color: null, value: "+4", type: "wild4", chosenColor: null });
    }

    return deck;
}

function topCard(room) {
    return room.discardPile[room.discardPile.length - 1] || null;
}

function nextPlayer(room, index) {
    return (index + room.direction + room.players.length) % room.players.length;
}

function isPenaltyCard(card) {
    return card && (card.type === "draw2" || card.type === "wild4");
}

function canPlay(room, card) {
    const top = topCard(room);
    if (!top) return true;

    // While +2/+4 is active, only +2 or +4 may be stacked.
    if (room.pendingDraw > 0) {
        return isPenaltyCard(card);
    }

    if (card.type === "wild" || card.type === "wild4") {
        return true;
    }

    if (card.color === room.currentColor) {
        return true;
    }

    if (card.value === top.value) {
        return true;
    }

    return card.type === top.type &&
        ["skip", "reverse", "draw2"].includes(card.type);
}

function drawFromDeck(room) {
    if (room.deck.length === 0) refillDeck(room);
    return room.deck.pop() || null;
}

function refillDeck(room) {
    if (room.discardPile.length <= 1) return;

    const top = room.discardPile[room.discardPile.length - 1];
    room.deck = room.discardPile
        .slice(0, -1)
        .map(card => ({
            ...card,
            chosenColor: null
        }));

    room.discardPile = [top];
    shuffle(room.deck);
}

function drawOne(room, player) {
    const card = drawFromDeck(room);
    if (card) player.hand.push(card);
    return card;
}

function sanitize(room, socketId) {
    const meIndex = room.players.findIndex(p => p.id === socketId);
    const me = room.players[meIndex];

    return {
        roomCode: room.code,
        hostId: room.hostId,
        started: room.started,
        winner: room.winner,
        meIndex,
        currentPlayer: room.currentPlayer,
        direction: room.direction,
        currentColor: room.currentColor,
        pendingDraw: room.pendingDraw,
        maxPlayers: room.maxPlayers,
        waitingColor: room.waitingColor && room.pendingColorPlayerId === socketId,
        unoTargetPlayer: room.unoTargetPlayer,
        players: room.players.map((p, i) => ({
            id: p.id,
            name: p.name,
            handCount: p.hand.length,
            isHost: p.id === room.hostId,
            unoDeclared: p.unoDeclared,
            index: i
        })),
        hand: me ? me.hand : [],
        discardTop: topCard(room),
        deckCount: room.deck.length
    };
}

function sendState(room) {
    for (const player of room.players) {
        io.to(player.id).emit("state", sanitize(room, player.id));
    }
}

function sendError(socket, message) {
    socket.emit("gameError", message);
}

function startGame(room) {
    room.deck = createDeck();
    shuffle(room.deck);
    room.discardPile = [];
    room.currentPlayer = 0;
    room.direction = 1;
    room.currentColor = null;
    room.pendingDraw = 0;
    room.waitingColor = false;
    room.pendingColorPlayerId = null;
    room.unoTargetPlayer = null;
    room.winner = null;

    for (const player of room.players) {
        player.hand = [];
        player.unoDeclared = false;
    }

    for (let i = 0; i < 7; i++) {
        for (const player of room.players) {
            drawOne(room, player);
        }
    }

    let firstCard;
    do {
        firstCard = drawFromDeck(room);
    } while (firstCard && (firstCard.type === "wild" || firstCard.type === "wild4"));

    room.discardPile.push(firstCard);
    room.currentColor = firstCard.color;

    if (firstCard.type === "draw2") {
        room.pendingDraw = 2;
    } else if (firstCard.type === "skip") {
        room.currentPlayer = nextPlayer(room, room.currentPlayer);
    } else if (firstCard.type === "reverse") {
        if (room.players.length === 2) {
            room.currentPlayer = nextPlayer(room, room.currentPlayer);
        } else {
            room.direction *= -1;
        }
    }

    room.started = true;
}

function finishTurn(room) {
    room.currentPlayer = nextPlayer(room, room.currentPlayer);

    for (const player of room.players) {
        player.unoDeclared = false;
    }

    resolvePenalty(room);
}

function resolvePenalty(room) {
    if (room.pendingDraw <= 0) return;

    const player = room.players[room.currentPlayer];
    const hasPenalty = player.hand.some(isPenaltyCard);

    // The player can still stack a +2/+4.
    if (hasPenalty) return;

    const amount = room.pendingDraw;
    for (let i = 0; i < amount; i++) {
        drawOne(room, player);
    }

    room.pendingDraw = 0;
    finishTurn(room);
}

function playCard(room, player, index) {
    if (room.waitingColor) {
        return { ok: false, error: "Escolha a cor da carta primeiro." };
    }

    if (room.players[room.currentPlayer].id !== player.id) {
        return { ok: false, error: "Não é sua vez." };
    }

    const card = player.hand[index];
    if (!card) return { ok: false, error: "Carta inválida." };

    if (!canPlay(room, card)) {
        return { ok: false, error: "Essa carta não pode ser jogada agora." };
    }

    const failedUno = player.hand.length === 2 && !player.unoDeclared;

    player.hand.splice(index, 1);
    room.discardPile.push(card);
    player.unoDeclared = false;

    if (failedUno) {
        drawOne(room, player);
        drawOne(room, player);
    }

    if (card.type === "draw2") {
        room.pendingDraw += 2;
        room.currentColor = card.color;
    }

    if (card.type === "wild4") {
        room.pendingDraw += 4;
        room.waitingColor = true;
        room.pendingColorPlayerId = player.id;
    } else if (card.type === "wild") {
        room.waitingColor = true;
        room.pendingColorPlayerId = player.id;
    } else {
        room.currentColor = card.color;
    }

    if (player.hand.length === 0) {
        room.winner = player.name;
        room.started = false;
        return { ok: true, card };
    }

    if (card.type === "wild" || card.type === "wild4") {
        // Turn changes only after the player chooses a color.
        return { ok: true, card, needsColor: true };
    }

    if (player.hand.length === 1) {
        if (!player.unoDeclared) room.unoTargetPlayer = room.currentPlayer;
    }

    if (card.type === "skip") {
        room.currentPlayer = nextPlayer(room, room.currentPlayer);
    }

    if (card.type === "reverse") {
        if (room.players.length === 2) {
            return { ok: true, card, sameTurn: true };
        }
        room.direction *= -1;
    }

    finishTurn(room);
    return { ok: true, card };
}

io.on("connection", socket => {
    socket.on("createRoom", ({ name, maxPlayers }) => {
        const playerName = String(name || "").trim().slice(0, 18);
        if (!playerName) return sendError(socket, "Digite seu nome.");

        const capacity = Math.min(4, Math.max(2, Number(maxPlayers) || 4));
        const code = makeRoomCode();
        const room = {
            code,
            hostId: socket.id,
            players: [],
            maxPlayers: capacity,
            deck: [],
            discardPile: [],
            started: false,
            currentPlayer: 0,
            direction: 1,
            currentColor: null,
            pendingDraw: 0,
            waitingColor: false,
            pendingColorPlayerId: null,
            unoTargetPlayer: null,
            winner: null
        };

        room.players.push({
            id: socket.id,
            name: playerName,
            hand: [],
            unoDeclared: false
        });

        rooms.set(code, room);
        socket.join(code);
        socket.data.roomCode = code;

        socket.emit("roomCreated", code);
        sendState(room);
    });

    socket.on("joinRoom", ({ name, code }) => {
        const playerName = String(name || "").trim().slice(0, 18);
        const roomCode = String(code || "").trim().toUpperCase();

        if (!playerName) return sendError(socket, "Digite seu nome.");
        if (!roomCode) return sendError(socket, "Digite o código da sala.");

        const room = rooms.get(roomCode);
        if (!room) return sendError(socket, "Sala não encontrada.");
        if (room.started) return sendError(socket, "Essa partida já começou.");
        if (room.players.length >= room.maxPlayers) return sendError(socket, `A sala já está cheia (${room.maxPlayers} jogadores).`);

        room.players.push({
            id: socket.id,
            name: playerName,
            hand: [],
            unoDeclared: false
        });

        socket.join(roomCode);
        socket.data.roomCode = roomCode;

        socket.emit("roomJoined", roomCode);
        sendState(room);
    });

    socket.on("startGame", () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room) return sendError(socket, "Você não está em uma sala.");
        if (room.hostId !== socket.id) return sendError(socket, "Somente o criador da sala pode iniciar.");
        if (room.players.length !== room.maxPlayers) return sendError(socket, `É necessário ter exatamente ${room.maxPlayers} jogadores para iniciar.`);

        startGame(room);
        io.to(room.code).emit("gameStarted");
        sendState(room);
    });

    socket.on("sayUno", () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        if (room.players[room.currentPlayer].id !== socket.id) return;
        if (player.hand.length !== 1) return sendError(socket, "Você só pode declarar UNO com 1 carta.");

        player.unoDeclared = true;
        room.unoTargetPlayer = null;

        io.to(room.code).emit("unoCalled", {
            playerId: player.id,
            playerName: player.name
        });
        sendState(room);
    });

    socket.on("challengeUNO", () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;

        if (room.players[room.currentPlayer].id !== socket.id) {
            return sendError(socket, "Somente o jogador da vez pode pegar UNO.");
        }

        if (room.unoTargetPlayer === null) {
            return sendError(socket, "Ninguém esqueceu de declarar UNO.");
        }

        const target = room.players[room.unoTargetPlayer];

        if (!target || target.hand.length !== 1 || target.unoDeclared) {
            room.unoTargetPlayer = null;
            sendState(room);
            return;
        }

        drawOne(room, target);
        drawOne(room, target);

        io.to(room.code).emit("unoPenalty", {
            playerId: target.id,
            playerName: target.name
        });

        room.unoTargetPlayer = null;
        sendState(room);
    });

    socket.on("playCard", ({ index }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const result = playCard(room, player, Number(index));

        if (!result.ok) {
            return sendError(socket, result.error);
        }

        io.to(room.code).emit("cardPlayed", {
            playerId: player.id,
            card: result.card,
            pendingDraw: room.pendingDraw
        });

        if (result.needsColor) {
            io.to(player.id).emit("chooseColor");
        }

        sendState(room);
    });

    socket.on("chooseColor", color => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;

        if (!COLORS.includes(color)) return sendError(socket, "Cor inválida.");
        if (!room.waitingColor || room.pendingColorPlayerId !== socket.id) {
            return sendError(socket, "Você não pode escolher a cor agora.");
        }

        const player = room.players.find(p => p.id === socket.id);
        const card = topCard(room);

        room.currentColor = color;
        if (card && (card.type === "wild" || card.type === "wild4")) {
            card.chosenColor = color;
        }

        room.waitingColor = false;
        room.pendingColorPlayerId = null;

        if (player.hand.length === 0) {
            room.winner = player.name;
            room.started = false;
        } else {
            if (player.hand.length === 1) {
                if (!player.unoDeclared) room.unoTargetPlayer = room.currentPlayer;
            }
            finishTurn(room);
        }

        sendState(room);
    });

    socket.on("drawCard", () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (room.players[room.currentPlayer].id !== socket.id) {
            return sendError(socket, "Não é sua vez.");
        }

        if (room.waitingColor) {
            return sendError(socket, "Escolha a cor primeiro.");
        }

        if (room.pendingDraw > 0) {
            const hasPenalty = player.hand.some(isPenaltyCard);
            if (hasPenalty) {
                return sendError(socket, "Você possui +2 ou +4 e precisa jogar uma delas.");
            }

            const amount = room.pendingDraw;
            for (let i = 0; i < amount; i++) drawOne(room, player);

            room.pendingDraw = 0;
            finishTurn(room);

            io.to(room.code).emit("penaltyResolved", {
                playerId: player.id,
                amount
            });
            sendState(room);
            return;
        }

        const card = drawOne(room, player);
        if (!card) return sendError(socket, "Não há mais cartas para comprar.");

        io.to(player.id).emit("cardDrawn", card);

        // Keep the behavior of the offline version: if the card is not playable,
        // the turn passes automatically; otherwise the player can click it.
        if (!canPlay(room, card)) {
            finishTurn(room);
        }

        sendState(room);
    });

    socket.on("leaveRoom", () => {
        removePlayer(socket);
    });

    socket.on("disconnect", () => {
        removePlayer(socket);
    });
});

function removePlayer(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const index = room.players.findIndex(p => p.id === socket.id);
    if (index === -1) return;

    const wasCurrent = room.currentPlayer === index;
    room.players.splice(index, 1);

    if (room.players.length === 0) {
        rooms.delete(roomCode);
        return;
    }

    if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
    }

    if (room.started && room.players.length < 2) {
        room.started = false;
        room.winner = null;
        io.to(roomCode).emit("gameEnded", "A partida terminou porque restou apenas um jogador.");
    }

    if (room.currentPlayer >= room.players.length) {
        room.currentPlayer = 0;
    } else if (index < room.currentPlayer) {
        room.currentPlayer--;
    } else if (wasCurrent) {
        room.currentPlayer = room.currentPlayer % room.players.length;
    }

    sendState(room);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`UNO Online rodando na porta ${PORT}`);
});
