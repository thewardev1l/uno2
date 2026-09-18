
const socket = io();

let state = null;
let myIndex = -1;
let selectedPlayers = 2;

const colorNames = {
    red: "VERMELHO",
    yellow: "AMARELO",
    green: "VERDE",
    blue: "AZUL"
};

socket.on("connect", () => {
    setLobbyStatus("Conectado ao servidor.");
});

socket.on("disconnect", () => {
    setLobbyStatus("Conexão perdida. Tentando reconectar...");
});

socket.on("roomCreated", code => {
    showRoom(code);
    setLobbyStatus("Sala criada! Envie o código para os outros jogadores.");
});

socket.on("roomJoined", code => {
    showRoom(code);
    setLobbyStatus("Você entrou na sala.");
});

socket.on("gameStarted", () => {
    document.getElementById("menu").style.display = "none";
    document.getElementById("game").style.display = "block";
});

socket.on("state", newState => {
    const previousState = state;
    state = newState;
    myIndex = newState.meIndex;

    if (!newState.started && !newState.winner) {
        document.getElementById("game").style.display = "none";
        document.getElementById("menu").style.display = "flex";
        updateLobby();
        return;
    }

    if (newState.started) {
        document.getElementById("menu").style.display = "none";
        document.getElementById("game").style.display = "block";
        updateColorModal();
        render();

        const turnChanged =
            !previousState ||
            !previousState.started ||
            previousState.currentPlayer !== newState.currentPlayer ||
            previousState.direction !== newState.direction;

        if (turnChanged) {
            showTurnBanner();
        }
    }

    if (newState.winner) {
        showWinner(newState.winner);
    }

    updateLobby();
});

socket.on("chooseColor", () => {
    document.getElementById("colorModal").style.display = "flex";
});

socket.on("cardPlayed", data => {
    animatePlayedCard(data.card, data.playerId);
});

socket.on("cardsDrawn", data => {
    animateDrawCards(data.playerId, data.amount);
});

socket.on("unoCalled", data => {
    // A declaração é apenas uma preparação. A grande animação global
    // acontece somente quando a carta é realmente jogada e o jogador
    // fica com exatamente 1 carta.
    if (data.playerId === socket.id) {
        showMessage("UNO declarado! Agora jogue sua carta.");
    } else {
        showMessage(data.playerName + " declarou UNO!");
    }
});

socket.on("unoCelebration", data => {
    showUNOAnimation(data.playerName);
});

socket.on("unoPenalty", data => {
    showMessage(data.playerName + " esqueceu de falar UNO e comprou 2 cartas!");
});

socket.on("penaltyResolved", data => {
    showMessage(data.playerId === socket.id
        ? `Você comprou ${data.amount} cartas.`
        : `Penalidade de +${data.amount} resolvida.`);
});

socket.on("gameEnded", message => {
    showMessage(message);
    leaveGame();
});

socket.on("gameError", message => {
    showMessage(message);
});

function setLobbyStatus(message) {
    const status = document.getElementById("lobbyStatus");
    if (status) status.textContent = message || "";
}

function selectPlayers(count) {
    selectedPlayers = Number(count) || 2;

    const selection = document.getElementById("playerCountSelection");
    const lobby = document.getElementById("onlineLobby");
    const subtitle = document.getElementById("menuSubtitle");
    const selectedText = document.getElementById("selectedPlayersText");

    if (selection) selection.style.display = "none";
    if (lobby) lobby.style.display = "block";
    if (subtitle) subtitle.textContent = "Crie uma sala ou entre em uma sala existente";
    if (selectedText) selectedText.textContent = `${selectedPlayers} Jogadores`;
}

function backToPlayerCount() {
    document.getElementById("onlineLobby").style.display = "none";
    document.getElementById("playerCountSelection").style.display = "flex";
    document.getElementById("menuSubtitle").textContent = "Escolha a quantidade de jogadores";
    document.getElementById("roomPanel").style.display = "none";
    setLobbyStatus("");
}

function getName() {
    return document.getElementById("playerNameInput").value.trim();
}

function createRoom() {
    const name = getName();
    if (!name) return showMessage("Digite seu nome.");
    socket.emit("createRoom", { name, maxPlayers: selectedPlayers });
}

function joinRoom() {
    const name = getName();
    const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();

    if (!name) return showMessage("Digite seu nome.");
    if (!code) return showMessage("Digite o código da sala.");

    socket.emit("joinRoom", { name, code });
}

function showRoom(code) {
    document.getElementById("roomPanel").style.display = "block";
    document.getElementById("roomCodeLabel").textContent = code;
    updateLobby();
}

function updateLobby() {
    if (!state || state.started) return;

    const panel = document.getElementById("roomPanel");
    if (!panel) return;

    panel.style.display = state.roomCode ? "block" : "none";

    if (state.roomCode) {
        document.getElementById("roomCodeLabel").textContent = state.roomCode;

        const capacity = document.getElementById("roomCapacityText");
        if (capacity) capacity.textContent = `Jogadores: ${state.players.length}/${state.maxPlayers || 4}`;

        const host = state.players.find(p => p.isHost);
        document.getElementById("hostText").textContent =
            host ? `Criador: ${host.name}` : "";

        const list = document.getElementById("lobbyPlayers");
        list.innerHTML = "";

        state.players.forEach((p, i) => {
            const div = document.createElement("div");
            div.className = "lobbyPlayer";
            div.textContent =
                `${i + 1}. ${p.name}${p.isHost ? " 👑" : ""}`;
            list.appendChild(div);
        });

        const start = document.getElementById("startOnlineButton");
        const waiting = document.getElementById("waitingText");
        const isHost = state.hostId === socket.id;
        const full = state.players.length === (state.maxPlayers || 4);

        // O botão fica sempre visível para o criador, mas só pode ser usado
        // quando a sala atingir a quantidade de jogadores escolhida.
        if (start) {
            start.style.display = isHost ? "block" : "none";
            start.disabled = !full;
            start.textContent = full ? "▶ INICIAR JOGO" : `🔒 AGUARDANDO ${state.maxPlayers - state.players.length} JOGADOR(ES)`;
            start.title = full
                ? "Iniciar partida"
                : `Faltam ${state.maxPlayers - state.players.length} jogador(es).`;
        }

        if (waiting) {
            waiting.style.display = isHost ? "none" : "block";
            if (!isHost) {
                waiting.textContent = full
                    ? "Sala completa. Aguardando o criador iniciar a partida..."
                    : `Aguardando ${state.maxPlayers - state.players.length} jogador(es) para completar a sala...`;
            }
        }
    }
}

async function copyRoomCode() {
    const code = document.getElementById("roomCodeLabel")?.textContent?.trim();
    if (!code || code === "------") return;

    try {
        await navigator.clipboard.writeText(code);
        setLobbyStatus("Código da sala copiado! 📋");
    } catch {
        setLobbyStatus("Código da sala: " + code);
    }
}

function startOnlineGame() {
    const start = document.getElementById("startOnlineButton");
    if (start && start.disabled) return;
    socket.emit("startGame");
}

function leaveRoom() {
    socket.emit("leaveRoom");
    state = null;
    document.getElementById("roomPanel").style.display = "none";
    document.getElementById("game").style.display = "none";
    document.getElementById("menu").style.display = "flex";
}

function leaveGame() {
    socket.emit("leaveRoom");
    state = null;
    document.getElementById("game").style.display = "none";
    document.getElementById("menu").style.display = "flex";
    document.getElementById("colorModal").style.display = "none";
    document.getElementById("winScreen").style.display = "none";
}

function render() {
    if (!state) return;

    renderPlayers();
    renderHand();
    renderDiscard();
    renderInfo();
    renderPenaltyEffect();
    updateColorModal();
}

function relativeSeat(serverIndex) {
    const total = state.players.length;
    const relative = (serverIndex - myIndex + total) % total;

    // Local player is always at the bottom.
    if (relative === 0) return 3;

    if (total === 2) return 0;
    if (total === 3) return relative === 1 ? 2 : 0;

    // Four players: next = right, opposite = top, previous = left.
    if (relative === 1) return 2;
    if (relative === 2) return 0;
    return 1;
}

function renderPlayers() {
    for (let i = 0; i < 4; i++) {
        const element = document.getElementById("player" + i);
        element.innerHTML = "";
        element.style.display = "none";
        element.classList.remove("myTurn");
    }

    state.players.forEach((player, serverIndex) => {
        const seat = relativeSeat(serverIndex);
        const element = document.getElementById("player" + seat);

        element.style.display = "flex";

        // Reset position in case this is a 2/3 player match.
        if (seat === 0) {
            element.style.left = "50%";
            element.style.top = "15px";
            element.style.right = "auto";
            element.style.bottom = "auto";
            element.style.transform = "translateX(-50%)";
        } else if (seat === 1) {
            element.style.left = "25px";
            element.style.top = "50%";
            element.style.right = "auto";
            element.style.bottom = "auto";
            element.style.transform = "translateY(-50%)";
        } else if (seat === 2) {
            element.style.right = "25px";
            element.style.top = "50%";
            element.style.left = "auto";
            element.style.bottom = "auto";
            element.style.transform = "translateY(-50%)";
        } else {
            element.style.left = "50%";
            element.style.bottom = "15px";
            element.style.top = "auto";
            element.style.right = "auto";
            element.style.transform = "translateX(-50%)";
        }

        const name = document.createElement("div");
        name.className = "playerName";
        name.textContent =
            player.name +
            (serverIndex === state.currentPlayer ? " ← TURNO" : "");

        const count = document.createElement("div");
        count.className = "cardCount";
        count.textContent =
            `${player.handCount} ${player.handCount === 1 ? "carta" : "cartas"}`;

        element.appendChild(name);
        element.appendChild(count);

        if (serverIndex === state.currentPlayer) {
            element.classList.add("myTurn");
        }

        if (serverIndex !== myIndex) {
            const backs = document.createElement("div");
            backs.className = "opponentCards";

            const visible = Math.min(player.handCount, 7);

            for (let c = 0; c < visible; c++) {
                const back = document.createElement("div");
                back.className = "backCard";
                back.textContent = "UNO";
                backs.appendChild(back);
            }

            element.appendChild(backs);
        }
    });
}

function renderHand() {
    const hand = document.getElementById("myHand");
    hand.innerHTML = "";

    if (!state) return;

    state.hand.forEach((card, index) => {
        const element = createCardElement(card);
        element.classList.add("handCard");

        element.onclick = () => {
            if (state.currentPlayer !== myIndex) {
                return showMessage("Não é sua vez.");
            }
            socket.emit("playCard", { index });
        };

        hand.appendChild(element);
    });
}

function createCardElement(card) {
    const element = document.createElement("div");

    let visualColor = card.color || null;

    if ((card.type === "wild" || card.type === "wild4") && card.chosenColor) {
        visualColor = card.chosenColor;
    }

    element.className =
        "card " + (visualColor ? visualColor : "wild");

    if (card.type === "wild4") {
        element.classList.add("wild");
        if (visualColor) element.classList.add(visualColor);
    }

    const corner = document.createElement("div");
    corner.className = "cardCorner";
    corner.textContent = card.value;

    const center = document.createElement("div");
    center.className = "cardCenter";

    if (card.type === "reverse") center.textContent = "↔";
    else if (card.type === "skip") center.textContent = "⊘";
    else center.textContent = card.value;

    const bottom = document.createElement("div");
    bottom.className = "cardCorner bottom";
    bottom.textContent = card.value;

    element.appendChild(corner);
    element.appendChild(center);
    element.appendChild(bottom);

    if ((card.type === "wild" || card.type === "wild4") && card.chosenColor) {
        element.title = "Cor escolhida: " + colorNames[card.chosenColor];
    }

    return element;
}

function renderDiscard() {
    const container = document.getElementById("discardPile");
    container.innerHTML = "";

    if (!state.discardTop) return;

    const element = createCardElement(state.discardTop);
    element.style.position = "absolute";
    element.style.left = "0";
    element.style.top = "0";
    element.style.zIndex = "20";

    container.appendChild(element);
}

function renderInfo() {
    const current = state.players[state.currentPlayer];
    if (!current) return;

    document.getElementById("turnInfo").textContent =
        "Turno: " + current.name;

    document.getElementById("direction").textContent =
        state.direction === 1 ? "↻ Horário" : "↺ Anti-horário";

    const color = document.getElementById("currentColor");
    color.textContent = colorNames[state.currentColor] || "-";
    color.className = "";
    if (state.currentColor) color.classList.add(state.currentColor);

    const pending = document.getElementById("pending");
    pending.textContent =
        state.pendingDraw > 0 ? "Penalidade: +" + state.pendingDraw : "";

    const challenge = document.getElementById("challengeButton");
    challenge.style.display =
        state.currentPlayer === myIndex && state.unoTargetPlayer !== null
        ? "block"
        : "none";
}

function renderPenaltyEffect() {
    const effect = document.getElementById("penaltyEffect");
    const amount = document.getElementById("penaltyAmount");
    const target = document.getElementById("penaltyTarget");

    if (!state.pendingDraw || state.pendingDraw <= 0) {
        effect.classList.remove("active");
        return;
    }

    amount.textContent = "+" + state.pendingDraw;

    const next = state.players[state.currentPlayer];
    target.textContent = next
        ? `${next.name} recebe +${state.pendingDraw}`
        : "";

    effect.classList.remove("active");
    void effect.offsetWidth;
    effect.classList.add("active");
}

function updateColorModal() {
    const modal = document.getElementById("colorModal");

    if (state && state.waitingColor && state.meIndex === state.currentPlayer) {
        modal.style.display = "flex";
    } else if (!state || !state.waitingColor) {
        modal.style.display = "none";
    }
}

function callUNO() {
    if (!state) return;
    if (state.currentPlayer !== myIndex) {
        return showMessage("Não é sua vez.");
    }
    if (state.hand.length !== 2 && state.hand.length !== 1) {
        return showMessage("Você pode dar UNO quando estiver com 2 cartas.");
    }
    socket.emit("sayUno");
}

function challengeUNO() {
    socket.emit("challengeUNO");
}

function drawCard() {
    socket.emit("drawCard");
}

function chooseColor(color) {
    document.getElementById("colorModal").style.display = "none";
    socket.emit("chooseColor", color);
}

function showWinner(name) {
    document.getElementById("winnerText").textContent = name + " VENCEU!";
    document.getElementById("winScreen").style.display = "flex";
}

function getPlayerAnchor(playerId) {
    if (playerId === socket.id) {
        return document.getElementById("myHand");
    }

    if (!state) return null;

    const playerIndex = state.players.findIndex(p => p.id === playerId);
    if (playerIndex < 0) return null;

    const seat = relativeSeat(playerIndex);
    return document.getElementById("player" + seat);
}

function getCenter(rect) {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function animatePlayedCard(card, playerId) {
    const layer = document.getElementById("animationLayer");
    const pile = document.getElementById("discardPile");
    const source = getPlayerAnchor(playerId);
    if (!layer || !pile || !source) return;

    const sourcePoint = getCenter(source.getBoundingClientRect());
    const targetPoint = getCenter(pile.getBoundingClientRect());

    const flying = createCardElement(card);
    flying.classList.add("flyingCard");
    flying.style.left = sourcePoint.x + "px";
    flying.style.top = sourcePoint.y + "px";
    layer.appendChild(flying);

    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;

    flying.animate(
        [
            {
                transform: "translate(-50%,-50%) scale(.55) rotate(-12deg)",
                opacity: .15
            },
            {
                transform: `translate(calc(-50% + ${dx * .48}px), calc(-50% + ${dy * .48}px)) scale(1.08) rotate(8deg)`,
                opacity: 1,
                offset: .58
            },
            {
                transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(0deg)`,
                opacity: 1
            }
        ],
        { duration: 520, easing: "cubic-bezier(.18,.85,.3,1)", fill: "forwards" }
    ).finished.then(() => flying.remove()).catch(() => flying.remove());

    // Impacto visual na pilha depois que a carta chega.
    setTimeout(() => {
        pile.classList.remove("cardImpact");
        void pile.offsetWidth;
        pile.classList.add("cardImpact");
    }, 480);
}

function animateDrawCards(playerId, amount) {
    const layer = document.getElementById("animationLayer");
    const pile = document.getElementById("drawPile");
    const target = getPlayerAnchor(playerId);
    if (!layer || !pile || !target) return;

    const sourcePoint = getCenter(pile.getBoundingClientRect());
    const targetPoint = getCenter(target.getBoundingClientRect());

    const total = Math.max(1, Number(amount) || 1);
    // Não sobrecarrega a tela quando uma penalidade for grande.
    const visibleCards = Math.min(total, 8);

    for (let i = 0; i < visibleCards; i++) {
        const card = document.createElement("div");
        card.className = "drawAnimationCard";
        card.style.left = sourcePoint.x + (i - (visibleCards - 1) / 2) * 5 + "px";
        card.style.top = sourcePoint.y + (i - (visibleCards - 1) / 2) * 4 + "px";
        layer.appendChild(card);

        const sx = parseFloat(card.style.left);
        const sy = parseFloat(card.style.top);
        const dx = targetPoint.x - sx;
        const dy = targetPoint.y - sy;

        card.animate(
            [
                {
                    transform: "translate(-50%,-50%) scale(.65) rotate(-8deg)",
                    opacity: 0
                },
                {
                    transform: `translate(calc(-50% + ${dx * .45}px), calc(-50% + ${dy * .45}px)) scale(1) rotate(6deg)`,
                    opacity: 1,
                    offset: .45
                },
                {
                    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7) rotate(0deg)`,
                    opacity: 0
                }
            ],
            {
                duration: 650,
                delay: i * 75,
                easing: "cubic-bezier(.2,.8,.25,1)"
            }
        ).finished.then(() => card.remove()).catch(() => card.remove());
    }
}

function showTurnBanner() {
    if (!state || !state.started) return;

    const banner = document.getElementById("turnBanner");
    const text = document.getElementById("turnBannerText");
    const icon = document.getElementById("turnBannerIcon");
    if (!banner || !text || !icon) return;

    const player = state.players[state.currentPlayer];
    if (!player) return;

    const mine = state.currentPlayer === myIndex;
    banner.classList.remove("show", "myTurn");
    void banner.offsetWidth;
    banner.classList.add("show");
    if (mine) banner.classList.add("myTurn");

    icon.textContent = mine ? "👉" : "🎮";
    text.textContent = mine
        ? "SUA VEZ — JOGUE UMA CARTA"
        : "VEZ DE JOGAR: " + player.name;

    clearTimeout(window._turnBannerTimer);
    window._turnBannerTimer = setTimeout(() => {
        banner.classList.remove("show");
    }, 2400);
}

function showUNOAnimation(playerName) {
    const overlay = document.getElementById("unoCelebration");
    const name = document.getElementById("unoPlayerName");
    if (!overlay || !name) return;

    name.textContent = playerName + " está de UNO!";
    overlay.classList.remove("active");
    void overlay.offsetWidth;
    overlay.classList.add("active");

    clearTimeout(window._unoAnimationTimer);
    window._unoAnimationTimer = setTimeout(() => {
        overlay.classList.remove("active");
    }, 1800);
}

function showMessage(message) {
    // Use a small temporary message instead of blocking alert dialogs.
    let box = document.getElementById("onlineMessage");

    if (!box) {
        box = document.createElement("div");
        box.id = "onlineMessage";
        box.style.position = "fixed";
        box.style.left = "50%";
        box.style.top = "18%";
        box.style.transform = "translateX(-50%)";
        box.style.zIndex = "3000";
        box.style.background = "rgba(0,0,0,.9)";
        box.style.color = "white";
        box.style.padding = "12px 18px";
        box.style.borderRadius = "12px";
        box.style.fontWeight = "bold";
        box.style.maxWidth = "85vw";
        box.style.textAlign = "center";
        document.body.appendChild(box);
    }

    box.textContent = message;
    box.style.display = "block";

    clearTimeout(window._unoMessageTimer);
    window._unoMessageTimer = setTimeout(() => {
        box.style.display = "none";
    }, 2500);
}

// Compatibility stubs for the old offline button names.
function changeLocalPlayer() {}
function backToMenu() {
    leaveGame();
}
