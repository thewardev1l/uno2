
const socket = io();

let state = null;
let myIndex = -1;
let selectedPlayers = 2;
let selectedMode = "classic";
let selectedAvatar = null;

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
    document.getElementById("socialPanel").style.display = "block";
});

socket.on("turnCountdownStart", data => {
    startTurnCountdown(data.playerId, data.playerName, data.seconds || 11);
});

socket.on("turnCountdownTick", data => {
    updateTurnCountdown(data.seconds);
});

socket.on("turnAutoPassed", data => {
    stopTurnCountdown();
    showMessage(`⏱️ ${data.playerName} não jogou a tempo e comprou 1 carta.`);
});

socket.on("rematchUpdate", data => {
    updateRematchUI(data.count, data.total);
});

socket.on("rematchStarted", () => {
    document.getElementById("winScreen").style.display = "none";
    showMessage("🔄 Nova partida iniciada!");
});

socket.on("zeroSevenZero", data => {
    showSpecialModeBanner("0", "TODOS PASSAM AS MÃOS", data.direction);
});

socket.on("zeroSevenSeven", data => {
    showSpecialModeBanner("7", `${data.playerName} TROCOU A MÃO COM ${data.targetName}`, null);
});

socket.on("chatMessage", data => addChatMessage(data));

socket.on("emote", data => showFloatingEmote(data.playerId, data.emote, data.playerName));

socket.on("state", newState => {
    const previousState = state;
    state = newState;
    myIndex = newState.meIndex;

    if (!newState.started && !newState.winner) {
        stopTurnCountdown();
        closeDrawChoice();
        document.getElementById("game").style.display = "none";
        document.getElementById("socialPanel").style.display = "none";
        document.getElementById("menu").style.display = "flex";
        updateLobby();
        return;
    }

    if (newState.started) {
        document.getElementById("menu").style.display = "none";
        document.getElementById("game").style.display = "block";
        document.getElementById("socialPanel").style.display = "block";
        updateColorModal();
        updateSwapModal();
        render();

        const turnChanged =
            !previousState ||
            !previousState.started ||
            previousState.currentPlayer !== newState.currentPlayer ||
            previousState.direction !== newState.direction;

        if (turnChanged) {
            stopTurnCountdown();
            closeDrawChoice();
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
    if (data.needsSwap && data.playerId === socket.id) {
        setTimeout(updateSwapModal, 180);
    }
});

socket.on("cardsDrawn", data => {
    animateDrawCards(data.playerId, data.amount);
    if (data.reason === "normal" && data.playable && data.playerId === socket.id) {
        setTimeout(() => showDrawChoice(), 450);
    }
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

function selectMode(mode) {
    selectedMode = mode === "zeroSeven" ? "zeroSeven" : "classic";
    const modeSelection = document.getElementById("modeSelection");
    const selection = document.getElementById("playerCountSelection");
    const subtitle = document.getElementById("menuSubtitle");
    const selectedModeText = document.getElementById("selectedModeText");
    if (modeSelection) modeSelection.style.display = "none";
    if (selection) selection.style.display = "flex";
    if (subtitle) subtitle.textContent = "Escolha a quantidade de jogadores";
    if (selectedModeText) selectedModeText.textContent = selectedMode === "zeroSeven" ? "Modo 0-7" : "Modo Clássico";
}

function selectPlayers(count) {
    selectedPlayers = Number(count) || 2;

    const selection = document.getElementById("playerCountSelection");
    const lobby = document.getElementById("onlineLobby");
    const subtitle = document.getElementById("menuSubtitle");
    const selectedText = document.getElementById("selectedPlayersText");
    const selectedModeText = document.getElementById("selectedModeText");

    if (selection) selection.style.display = "none";
    if (lobby) lobby.style.display = "block";
    if (subtitle) subtitle.textContent = "Crie uma sala ou entre em uma sala existente";
    if (selectedText) selectedText.textContent = `${selectedPlayers} Jogadores`;
    if (selectedModeText) selectedModeText.textContent = selectedMode === "zeroSeven" ? "Modo 0-7" : "Modo Clássico";
}

function backToPlayerCount() {
    document.getElementById("onlineLobby").style.display = "none";
    document.getElementById("playerCountSelection").style.display = "none";
    document.getElementById("modeSelection").style.display = "flex";
    document.getElementById("menuSubtitle").textContent = "Escolha o modo de jogo";
    document.getElementById("roomPanel").style.display = "none";
    setLobbyStatus("");
}


function getName() {
    return document.getElementById("playerNameInput").value.trim();
}

function prepareAvatar() {
    const input = document.getElementById("avatarInput");
    if (!input || !input.files || !input.files[0]) return Promise.resolve(null);

    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const size = 160;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                const scale = Math.max(size / img.width, size / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                resolve(canvas.toDataURL("image/jpeg", .78));
            };
            img.onerror = () => resolve(null);
            img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(input.files[0]);
    });
}

function previewAvatar() {
    const input = document.getElementById("avatarInput");
    const preview = document.getElementById("avatarPreview");
    if (!input || !preview || !input.files[0]) {
        if (preview) preview.innerHTML = "👤";
        selectedAvatar = null;
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" alt="Prévia">`;
        selectedAvatar = reader.result;
    };
    reader.readAsDataURL(input.files[0]);
}

async function createRoom() {
    const name = getName();
    if (!name) return showMessage("Digite seu nome.");
    const avatar = await prepareAvatar();
    socket.emit("createRoom", { name, maxPlayers: selectedPlayers, avatar, mode: selectedMode });
}

async function joinRoom() {
    const name = getName();
    const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();

    if (!name) return showMessage("Digite seu nome.");
    if (!code) return showMessage("Digite o código da sala.");
    const avatar = await prepareAvatar();
    socket.emit("joinRoom", { name, code, avatar, mode: selectedMode });
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
        const roomMode = document.getElementById("roomModeText");
        const lobbyMode = document.getElementById("selectedModeTextLobby");
        const modeLabel = state.mode === "zeroSeven" ? "🟣 MODO 0-7" : "🔴 MODO CLÁSSICO";
        if (roomMode) roomMode.textContent = modeLabel;
        if (lobbyMode) lobbyMode.textContent = modeLabel;

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
    stopTurnCountdown();
    closeDrawChoice();
    document.getElementById("game").style.display = "none";
    document.getElementById("socialPanel").style.display = "none";
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
    renderTurnControls();
    renderPenaltyEffect();
    updateColorModal();
    updateSwapModal();
    const modeBadge = document.getElementById("modeBadge");
    if (modeBadge) modeBadge.textContent = state.mode === "zeroSeven" ? "0-7" : "CLÁSSICO";
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

        const avatar = document.createElement("div");
        avatar.className = "playerAvatar";
        if (player.avatar) {
            const img = document.createElement("img");
            img.src = player.avatar;
            img.alt = "Foto de " + player.name;
            avatar.appendChild(img);
        } else {
            avatar.textContent = "👤";
        }
        element.appendChild(avatar);

        const name = document.createElement("div");
        name.className = "playerName";
        if (serverIndex === state.currentPlayer) {
            name.textContent = player.name +
                (serverIndex === myIndex ? " • SUA VEZ" : " • VEZ DE JOGAR");
        } else {
            name.textContent = player.name;
        }

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

    element.className = "card " + (visualColor ? visualColor : "wild");

    if (card.type === "wild4") {
        element.classList.add("wild");
        if (visualColor) element.classList.add(visualColor);
    }

    const center = document.createElement("div");
    center.className = "cardCenter";

    // Sem palavras nas cartas: números e símbolos.
    if (card.type === "reverse") center.textContent = "↔";
    else if (card.type === "skip") center.textContent = "⊘";
    else if (card.type === "wild") {
        const icon = document.createElement("div");
        icon.className = "wildIcon";
        center.appendChild(icon);
    } else {
        center.textContent = card.value;
    }

    if (card.type === "number" || card.type === "draw2" || card.type === "wild4") {
        const corner = document.createElement("div");
        corner.className = "cardCorner";
        corner.textContent = card.value;
        element.appendChild(corner);

        const bottom = document.createElement("div");
        bottom.className = "cardCorner bottom";
        bottom.textContent = card.value;
        element.appendChild(bottom);
    }

    element.appendChild(center);

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

function renderTurnControls() {
    const challenge = document.getElementById("challengeButton");
    if (challenge) {
        challenge.style.display =
            state.currentPlayer === myIndex && state.unoTargetPlayer !== null
            ? "block"
            : "none";
    }
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

function updateSwapModal() {
    const modal = document.getElementById("swapModal");
    const list = document.getElementById("swapTargets");
    if (!modal || !list) return;

    if (!state || !state.started || !state.waitingSwap) {
        modal.style.display = "none";
        return;
    }

    list.innerHTML = "";
    (state.swapTargets || []).forEach(target => {
        const button = document.createElement("button");
        button.className = "swapTargetButton";
        const avatar = target.avatar ? `<img src="${target.avatar}" alt="">` : "<span>👤</span>";
        button.innerHTML = `${avatar}<strong>${target.name}</strong><small>${target.handCount} ${target.handCount === 1 ? "carta" : "cartas"}</small>`;
        button.onclick = () => chooseSwapTarget(target.id);
        list.appendChild(button);
    });

    modal.style.display = state.meIndex === state.currentPlayer ? "flex" : "none";
}

function chooseSwapTarget(targetId) {
    if (!state || !state.waitingSwap) return;
    socket.emit("chooseSwapTarget", targetId);
}

function showSpecialModeBanner(symbol, text, direction) {
    let box = document.getElementById("specialModeBanner");
    if (!box) {
        box = document.createElement("div");
        box.id = "specialModeBanner";
        document.body.appendChild(box);
    }
    box.innerHTML = `<strong>${symbol}</strong><span>${text}</span>${direction ? `<small>${direction === 1 ? "HORÁRIO" : "ANTI-HORÁRIO"}</small>` : ""}`;
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    clearTimeout(window._specialModeTimer);
    window._specialModeTimer = setTimeout(() => box.classList.remove("show"), 2200);
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
    if (!state || state.currentPlayer !== myIndex) return showMessage("Não é sua vez.");
    socket.emit("drawCard");
}

function showDrawChoice() {
    const modal = document.getElementById("drawChoiceModal");
    if (!modal) return;
    const title = modal.querySelector("h2");
    if (title) title.textContent = (state && state.hand.length === 2)
        ? "🃏 Você tinha 1 carta e comprou uma jogável!"
        : "🃏 Você comprou uma carta jogável!";
    const unoButton = document.getElementById("unoDrawnButton");
    if (unoButton) {
        const canUnoAfterDraw = !!(state && state.currentPlayer === myIndex &&
            state.hand.length === 2 &&
            state.drawnCardIndex !== null && state.drawnCardIndex !== undefined);
        unoButton.style.display = canUnoAfterDraw ? "block" : "none";
        unoButton.textContent = canUnoAfterDraw ? "🔴 UNO + JOGAR (1 CARTA)" : "🔴 UNO";
    }
    modal.style.display = "flex";
}

function closeDrawChoice() {
    const modal = document.getElementById("drawChoiceModal");
    if (modal) modal.style.display = "none";
}

function playDrawnCard() {
    if (!state || state.drawnCardIndex === null || state.drawnCardIndex === undefined) return;
    const index = state.drawnCardIndex;
    closeDrawChoice();
    socket.emit("playCard", { index });
}

function declareUnoAndPlayDrawn() {
    if (!state || state.currentPlayer !== myIndex) return showMessage("Não é sua vez.");
    if (state.drawnCardIndex === null || state.drawnCardIndex === undefined) return showMessage("Nenhuma carta comprada para jogar.");
    if (state.hand.length !== 2) return showMessage("UNO + JOGAR só está disponível quando você tinha 1 carta antes da compra.");
    const index = state.drawnCardIndex;
    closeDrawChoice();
    socket.emit("playDrawnCardWithUno", { index });
}

function keepDrawnAndPass() {
    closeDrawChoice();
    socket.emit("passAfterDraw");
}

function chooseColor(color) {
    document.getElementById("colorModal").style.display = "none";
    socket.emit("chooseColor", color);
}

function showWinner(name) {
    document.getElementById("winnerText").textContent = name + " VENCEU!";
    document.getElementById("winScreen").style.display = "flex";
    updateRematchUI(state?.rematchCount || 0, state?.rematchTotal || state?.players?.length || 0);
}

function requestRematch() {
    socket.emit("requestRematch");
}

function updateRematchUI(count, total) {
    const countEl = document.getElementById("rematchCount");
    const button = document.getElementById("rematchButton");
    if (countEl) countEl.textContent = `${count}/${total} jogadores aceitaram continuar`;
    if (button) {
        const voted = !!state?.rematchVoted;
        button.disabled = voted;
        button.textContent = voted ? "✓ VOCÊ ACEITOU" : "🔄 CONTINUAR JOGANDO";
    }
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

function startTurnCountdown(playerId, playerName, seconds) {
    const box = document.getElementById("turnTimer");
    const name = document.getElementById("turnTimerName");
    const number = document.getElementById("turnTimerNumber");
    if (!box || !number || !name) return;
    box.style.display = "flex";
    box.classList.remove("urgent");
    name.textContent = playerId === socket.id ? "SEU TEMPO ESTÁ ACABANDO" : `${playerName} está demorando`;
    number.textContent = seconds;
    if (seconds <= 5) box.classList.add("urgent");
}

function updateTurnCountdown(seconds) {
    const box = document.getElementById("turnTimer");
    const number = document.getElementById("turnTimerNumber");
    if (!box || !number) return;
    box.style.display = "flex";
    number.textContent = seconds;
    box.classList.toggle("urgent", seconds <= 5);
}

function stopTurnCountdown() {
    const box = document.getElementById("turnTimer");
    if (box) box.style.display = "none";
}

function addChatMessage(data) {
    const list = document.getElementById("chatMessages");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "chatRow";
    row.innerHTML = `<b></b><span></span>`;
    row.querySelector("b").textContent = data.playerName + ":";
    row.querySelector("span").textContent = " " + data.text;
    list.appendChild(row);
    while (list.children.length > 40) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
}

function sendChat() {
    const input = document.getElementById("chatInput");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chatMessage", text);
    input.value = "";
    input.focus();
}

function sendEmote(emote) {
    socket.emit("sendEmote", emote);
}

function showFloatingEmote(playerId, emote, playerName) {
    const layer = document.getElementById("animationLayer");
    const anchor = getPlayerAnchor(playerId);
    if (!layer || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "floatingEmote";
    el.textContent = emote;
    el.style.left = (rect.left + rect.width / 2) + "px";
    el.style.top = (rect.top + rect.height / 2) + "px";
    layer.appendChild(el);
    el.animate([
        { transform:"translate(-50%,-20%) scale(.4) rotate(-12deg)", opacity:0 },
        { transform:"translate(-50%,-80%) scale(1.2) rotate(8deg)", opacity:1, offset:.35 },
        { transform:"translate(-50%,-150%) scale(1) rotate(-3deg)", opacity:0 }
    ], {duration:1500, easing:"ease-out"}).finished.then(()=>el.remove()).catch(()=>el.remove());
}

function initSocialPanelDrag() {
    const panel = document.getElementById("socialPanel");
    const handle = document.getElementById("socialHeader");
    if (!panel || !handle || panel.dataset.dragReady === "1") return;
    panel.dataset.dragReady = "1";

    const key = "unoSocialPanelPosition";
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const clamp = () => {
        const rect = panel.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        const left = Math.min(Math.max(rect.left, margin), maxLeft);
        const top = Math.min(Math.max(rect.top, margin), maxTop);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        localStorage.setItem(key, JSON.stringify({left, top}));
    };

    try {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            panel.style.left = saved.left + "px";
            panel.style.top = saved.top + "px";
            panel.style.right = "auto";
            panel.style.bottom = "auto";
        }
    } catch (_) {}

    handle.addEventListener("pointerdown", event => {
        if (event.button !== undefined && event.button !== 0) return;
        dragging = true;
        pointerId = event.pointerId;
        const rect = panel.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        handle.setPointerCapture?.(pointerId);
        event.preventDefault();
    });

    handle.addEventListener("pointermove", event => {
        if (!dragging || event.pointerId !== pointerId) return;
        const rect = panel.getBoundingClientRect();
        const margin = 8;
        const left = Math.min(Math.max(event.clientX - offsetX, margin), Math.max(margin, window.innerWidth - rect.width - margin));
        const top = Math.min(Math.max(event.clientY - offsetY, margin), Math.max(margin, window.innerHeight - rect.height - margin));
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        event.preventDefault();
    });

    const stop = event => {
        if (!dragging) return;
        if (event.pointerId !== undefined && event.pointerId !== pointerId) return;
        dragging = false;
        try { handle.releasePointerCapture?.(pointerId); } catch (_) {}
        pointerId = null;
        clamp();
    };

    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    window.addEventListener("resize", clamp);
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


// O painel começa no lado esquerdo e pode ser arrastado; a posição fica salva.
initSocialPanelDrag();
