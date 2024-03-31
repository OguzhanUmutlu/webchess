// todo: timer
// todo: sounds
// todo: force move toggle
// todo: hover backgrounds when clicking/hovering pieces
// todo: moving pieces via clicking squares
// todo: showing the available squares when clicked on pieces
// todo: on timeout, if a team cannot possibly win(has only king), then it's draw
// todo: draw: agreement, resigning, timeout

function __straightPathAll(vec, piece, board, mv) {
    for (const [vx, vy] of vec) {
        let x = piece.x;
        let y = piece.y;
        while (true) {
            x += vx;
            y += vy;
            if (x < 0 || x > 7 || y < 0 || y > 7) break;
            const s = board.get(x, y);
            if (!s) {
                mv(x, y);
                continue;
            }
            if (s) {
                if (s.type[0] !== piece.type[0]) mv(x, y);
                break;
            }
        }
    }
}

const GetAllMoveList = {
    p(piece, board, mv) {
        const k = piece.type[0] === "b" ? 1 : -1;
        if (!board.get(piece.x, piece.y + k)) mv(piece.x, piece.y + k);
        if (!piece.hasMoved && !board.get(piece.x, piece.y + 2 * k)) mv(piece.x, piece.y + k * 2);
        const diaLeft = board.get(piece.x - 1, piece.y + k);
        const diaRight = board.get(piece.x + 1, piece.y + k);
        if (diaLeft) mv(piece.x - 1, piece.y + k);
        if (diaRight) mv(piece.x + 1, piece.y + k);
        const h = board.history.at(-1);
        if (h) {
            const left = board.get(piece.x - 1, piece.y);
            const right = board.get(piece.x + 1, piece.y);
            if (left && h.xD === left.x && h.yD === left.y) mv(piece.x - 1, piece.y + k);
            if (right && h.xD === right.x && h.yD === right.y) mv(piece.x + 1, piece.y + k);
        }
    },
    r(piece, board, mv) {
        __straightPathAll([
            [0, 1],
            [1, 0],
            [0, -1],
            [-1, 0]
        ], piece, board, mv);
    },
    n(piece, board, mv) {
        for (const [vx, vy] of [
            [1, 2],
            [-1, 2],
            [2, 1],
            [2, -1],
            [1, -2],
            [-1, -2],
            [-2, -1],
            [-2, 1]
        ]) mv(piece.x + vx, piece.y + vy);
    },
    b(piece, board, mv) {
        __straightPathAll([
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1]
        ], piece, board, mv);
    },
    q(piece, board, mv) {
        __straightPathAll([
            [0, 1],
            [1, 0],
            [0, -1],
            [-1, 0]
        ], piece, board, mv);
    },
    k(piece, board, mv) {
        for (const [vx, vy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [-1, 1],
            [1, 1],
            [-1, -1],
            [1, -1]
        ]) mv(piece.x + vx, piece.y + vy);

        if (!piece.hasMoved) {
            const right = board.get(7, piece.y);
            const left = board.get(0, piece.y);
            if (right && !right.hasMoved && right.type === piece.type[0] + "r") mv(piece.x + 2, piece.y);
            if (left && !left.hasMoved && left.type === piece.type[0] + "r") mv(piece.x - 2, piece.y);
        }
    }
};

class Board {
    /*** @type {Set<{x: number, y: number, type: string, hasMoved: boolean, div: HTMLDivElement | null}>} */
    pieces = new Set;
    pieceMap = new Array(8).fill(0).map(() => new Array(8).fill(null));
    flipped = false;
    history = [];
    wholeHistory = [];
    turn = true; // true = white, false = black
    FORCE = false;
    PIECE_TEXTURE_ID = 1;
    CAPTURE_SOUND = new Audio("./assets/sounds/capture.webm");
    CASTLE_SOUND = new Audio("./assets/sounds/castle.webm");
    GAME_END_SOUND = new Audio("./assets/sounds/game-end.webm");
    GAME_START_SOUND = new Audio("./assets/sounds/game-start.webm");
    ILLEGAL_SOUND = new Audio("./assets/sounds/illegal.webm");
    MOVE_CHECK_SOUND = new Audio("./assets/sounds/move-check.webm");
    MOVE_OPPONENT_SOUND = new Audio("./assets/sounds/move-opponent.webm");
    MOVE_SELF_SOUND = new Audio("./assets/sounds/move-self.webm");
    PREMOVE_SOUND = new Audio("./assets/sounds/premove.webm");
    PROMOTE_SOUND = new Audio("./assets/sounds/promote.webm");
    TEN_SECONDS_SOUND = new Audio("./assets/sounds/ten-seconds.webm");

    getMovesOf(piece) {
        const p = [];
        GetAllMoveList[piece.type[1]](piece, this, (x, y) => {
            const get = this.get(x, y);
            if (!get || get.type[0] !== piece.type[0]) p.push([x, y]);
        });
        return p;
    };

    get(x, y) {
        if (x < 0 || x > 7 || y < 0 || y > 7) return null;
        return this.pieceMap[x][y];
    };

    flip() {
        this.flipped = !this.flipped;
        for (const piece of this.pieces) {
            this.updatePiece(piece);
        }
    };

    undo() {
        const move = this.history.at(-1);
        if (!move) return null;
        const piece = this.get(move.xD, move.yD);
        this.movePiece(piece, move.xS, move.yS, true);
        piece.hasMoved = move.hasMoved;
        if (move.capture) {
            this.pieces.add(move.capture);
            this.pieceMap[move.capture.x][move.capture.y] = move.capture;
            this.updatePiece(move.capture);
        }
        this.history.splice(-1, 1);
        this.wholeHistory.splice(-1, 1);
        this.turn = !this.turn;
        this.endDiv.style.opacity = "0";
        this.endDiv.style.pointerEvents = "none";
        this.promoteDiv.style.opacity = "0";
        this.promoteDiv.style.pointerEvents = "none";
        return move;
    };

    isChecked(type = "w") {
        const pieces = Array.from(this.pieces);
        const king = pieces.find(i => i.type === type + "k");
        if (!king) return false;
        return pieces.find(i => i.type[0] !== type && this.canMovePiece(i, king.x, king.y));
    };

    // Returns: 0(nothing), 1(checkmate), 2(stalemate), 3(insufficient material), 4(50 move rule), 5(repetition)
    getEndStatus(type = "w") {
        const pc = Array.from(this.pieces);
        if (
            pc.length === 2
            || new Set(pc.map(i => i.type[0])).size === 1
            || !pc.find(i => i.type === "bk")
            || !pc.find(i => i.type === "wk")
        ) return 3;
        if (pc.length === 3 && pc.some(i => i.type[1] === "n")) return 3; // 1 knight, 2 kings
        if (pc.length === 4) {
            const kn = pc.filter(i => i.type[1] === "n");
            if (kn.length === 2 && kn[1].type[0] === kn[0].type[0]) return 3; // 2 same knight, 2 kings
        }
        const lastPawnOrCapture = this.history.length - this.history.lastIndexOf(i => i.pieceType[1] === "p" || i.capture);
        if (lastPawnOrCapture >= 50) return 4;
        const lastWhole = this.history.at(-1);
        if (this.history.filter(i => i === lastWhole).length >= 3) return 5;

        let t = this.turn;
        this.turn = type === "w";
        for (const piece of this.pieces) {
            if (piece.type[0] !== type) continue;
            for (const move of this.getMovesOf(piece)) {
                if (this.movePiece(piece, move[0], move[1], false, false, false)) {
                    this.undo();
                    return 0;
                }
            }
        }
        this.turn = t;
        return this.isChecked(type) ? 1 : 2;
    };

    /*** @param {HTMLDivElement} div */
    setDiv(div) {
        this.div = div;
        this.canvas = document.createElement("canvas");
        div.appendChild(this.canvas);
        for (const piece of this.pieces) this.updatePiece(piece);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("coordinates");

        svg.setAttribute("viewBox", "0 0 100 100");
        svg.innerHTML = [
            [0, 0.75, 3.5, "8"],
            [1, 0.75, 15.75, "7"],
            [0, 0.75, 28.25, "6"],
            [1, 0.75, 40.75, "5"],
            [0, 0.75, 53.25, "4"],
            [1, 0.75, 65.75, "3"],
            [0, 0.75, 78.25, "2"],
            [1, 0.75, 90.75, "1"],
            [1, 10, 99, "a"],
            [0, 22.5, 99, "b"],
            [1, 35, 99, "c"],
            [0, 47.5, 99, "d"],
            [1, 60, 99, "e"],
            [0, 72.5, 99, "f"],
            [1, 85, 99, "g"],
            [0, 97.5, 99, "h"]
        ].map(i => `<text x="${i[1]}" y="${i[2]}" font-size="2.8" class="coordinate-${i[0] ? "dark" : "light"}">${i[3]}</text>`).join("");

        const promoteMenu = this.promoteDiv = document.createElement("div");
        promoteMenu.classList.add("promote-menu");
        promoteMenu.innerHTML = `
        <div class="container">
            <div>Pick a piece to promote your pawn to:</div>
            <div class="prom-options">
                <div data-prom="q"></div>
                <div data-prom="r"></div>
                <div data-prom="b"></div>
                <div data-prom="n"></div>
            </div>
        </div>`;

        const endScreen = this.endDiv = document.createElement("div");
        endScreen.classList.add("end-screen");
        endScreen.innerHTML = `<div class="container"></div>`;

        this.div.appendChild(endScreen);
        this.div.appendChild(promoteMenu);
        this.div.appendChild(svg);
    };

    setBoardTexture(textureId) {
        if (!this.div) return;
        this.div.style.backgroundImage = `url("assets/boards/${textureId}.png")`;
    };

    setPieceTexture(textureId) {
        this.PIECE_TEXTURE_ID = textureId;
        for (const piece of this.pieces) this.updatePiece(piece);
    };

    createPiece(x, y, type) {
        const piece = {x, y, type, hasMoved: false, div: null};
        this.pieces.add(piece);
        this.removePiece(this.get(x, y));
        this.pieceMap[x][y] = piece;
        this.updatePiece(piece);
    };

    removePiece(piece) {
        if (!piece) return;
        if (piece.div) piece.div.remove();
        if (this.get(piece.x, piece.y) === piece) delete this.pieceMap[piece.x][piece.y];
        this.pieces.delete(piece);
    };

    canMovePiece(piece, x, y) {
        if (x < 0 || y < 0 || x > 7 || y > 7) return false;
        if (piece.x === x && piece.y === y) return false;
        const target = this.get(x, y);
        if (target && target.type[0] === piece.type[0]) return false;
        return this.getMovesOf(piece).map(i => `${i[0]},${i[1]}`).includes(x + "," + y);
    };

    movePiece(piece, x, y, force = false, checkEnd = true, ui = true) {
        if (!force && (
            this.turn !== (piece.type[0] === "w") ||
            !this.canMovePiece(piece, x, y)
        )) {
            if (ui && (piece.x !== x || piece.y !== y)) this.ILLEGAL_SOUND.play().then(r => r);
            return false;
        }
        const ox = piece.x;
        const oy = piece.y;
        const target = this.get(x, y);
        let capture = target;
        if (!force && piece.type[1] === "p" && !capture && ox !== x) {
            const mv = piece.type[0] === "b" ? 1 : -1;
            capture = this.get(x, y - mv);
        }
        piece.x = x;
        piece.y = y;
        delete this.pieceMap[ox][oy];
        this.pieceMap[x][y] = piece;
        this.pieces.delete(capture);
        const aftChecked = this.isChecked(piece.type[0]);
        if (!force) {
            if (aftChecked) {
                piece.x = ox;
                piece.y = oy;
                this.pieceMap[x][y] = target;
                this.pieceMap[ox][oy] = piece;
                if (capture) this.pieces.add(capture);
                if (ui) this.ILLEGAL_SOUND.play().then(r => r);
                return false;
            }
            this.history.push({
                pieceType: piece.type,
                xD: x,
                yD: y,
                xS: ox,
                yS: oy,
                capture: capture ? {x: capture.x, y: capture.y, type: capture.type} : null,
                hasMoved: piece.hasMoved
            });
            let whole = "";
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    const p = this.get(x, y);
                    whole += p ? p.type : "  ";
                }
            }
            this.wholeHistory.push(whole);
            piece.hasMoved = true;
            if (Math.abs(ox - x) === 2 && piece.type[1] === "k") {
                const p = x > ox ? this.pieceMap[7][piece.y] : this.pieceMap[0][piece.y];
                this.movePiece(p, x + (x > ox ? -1 : 1), piece.y, true);
            }
            this.turn = !this.turn;
        }
        const promotes = piece.type[1] === "p" && y === (piece.type[0] === "w" ? 0 : 7);
        const checks = this.isChecked(piece.type[0] === "w" ? "b" : "w");
        if (promotes) {
            if (this.div) {
                const proms = this.promoteDiv.querySelectorAll("[data-prom]");
                const ex = this.ls || [];
                this.ls = [];
                for (const div of proms) {
                    const t = div.getAttribute("data-prom");
                    div.style.backgroundImage = `url("./assets/pieces/${this.PIECE_TEXTURE_ID}/${piece.type[0]}${t}.png")`;
                    ex.forEach(i => div.removeEventListener("click", i));

                    const onClick = () => {
                        this.ls.forEach(i => div.removeEventListener("click", i));
                        this.promoteDiv.style.opacity = "0";
                        this.promoteDiv.style.pointerEvents = "none";
                        this.removePiece(piece);
                        this.createPiece(piece.x, piece.y, `${piece.type[0]}${t}`);
                    };

                    this.ls.push(onClick);
                    div.addEventListener("click", onClick);
                }
                this.promoteDiv.style.opacity = "1";
                this.promoteDiv.style.pointerEvents = "auto";
            } else throw new Error("Promotion requires UI.");
        }
        this.removePiece(capture);
        this.updatePiece(piece);
        let status;
        if (checkEnd && !force) status = this.getEndStatus(piece.type[0] === "w" ? "b" : "w");
        console.log(status)
        if (status && this.div) {
            this.endDiv.style.opacity = "1";
            this.endDiv.style.pointerEvents = "auto";
            this.endDiv.querySelector(".container").innerHTML = status > 1
                ? `<h1>Draw</h1><br><div class="reason">${["", "by stalemate", "by insufficient material", "by 50 move rule", "by repetition"][status]}</div>`
                : `<h1>${piece.type[0] === "w" ? "White" : "Black"} won</h1><br><div class="reason">by checkmate</div>`;
        } else if (ui) {
            if (promotes) this.PROMOTE_SOUND.play().then(r => r);
            if (checks) this.MOVE_CHECK_SOUND.play().then(r => r);
            if (capture) this.CAPTURE_SOUND.play().then(r => r);
            if (!promotes && !checks && !capture) this.MOVE_SELF_SOUND.play().then(r => r);
        }
        return true;
    };

    updatePiece(piece) {
        if (!this.div) return;
        let div = piece.div;
        if (!div) {
            this.div.appendChild(piece.div = div = document.createElement("div"));
            div.classList.add("piece");
            div.addEventListener("mousedown", ev => {
                div.classList.add("dragging-piece");
                const target = {x: piece.x, y: piece.y};

                const onMove = ev => {
                    const rect = this.div.getBoundingClientRect();
                    const x = Math.min(rect.width, Math.max(0, ev.clientX - rect.x));
                    const y = Math.min(rect.height, Math.max(0, ev.clientY - rect.y));
                    div.style.left = x + "px";
                    div.style.top = y + "px";
                    target.x = Math.round(x / rect.width * 8 - 0.5);
                    target.y = Math.round(y / rect.height * 8 - 0.5);
                    if (this.flipped) target.y = 7 - target.y;
                }

                const onStop = () => {
                    removeEventListener("mousemove", onMove);
                    removeEventListener("mouseup", onStop);
                    div.classList.remove("dragging-piece");
                    if (!this.movePiece(piece, target.x, target.y, this.FORCE)) {
                        this.updatePiece(piece);
                    }
                };

                onMove(ev);
                addEventListener("mousemove", onMove);
                addEventListener("mouseup", onStop);
            });
        }
        if (div.parentElement !== this.div) this.div.appendChild(div);
        div.style.backgroundImage = `url("./assets/pieces/${this.PIECE_TEXTURE_ID}/${piece.type}.png")`;
        div.style.left = `${piece.x / 8 * 100}%`;
        div.style.top = `${(this.flipped ? 7 - piece.y : piece.y) / 8 * 100}%`;
    };

    resetPieces() {
        this.clearPieces();
        for (let i = 0; i < 8; i++) {
            this.createPiece(i, 1, "bp");
            this.createPiece(i, 6, "wp");
        }
        this.createPiece(0, 0, "br");
        this.createPiece(7, 0, "br");
        this.createPiece(0, 7, "wr");
        this.createPiece(7, 7, "wr");

        this.createPiece(1, 0, "bn");
        this.createPiece(6, 0, "bn");
        this.createPiece(1, 7, "wn");
        this.createPiece(6, 7, "wn");

        this.createPiece(2, 0, "bb");
        this.createPiece(5, 0, "bb");
        this.createPiece(2, 7, "wb");
        this.createPiece(5, 7, "wb");

        this.createPiece(3, 0, "bq");
        this.createPiece(4, 0, "bk");
        this.createPiece(3, 7, "wq");
        this.createPiece(4, 7, "wk");
    };

    clearPieces() {
        for (const piece of this.pieces) this.removePiece(piece);
        this.pieces.clear();
    };
}