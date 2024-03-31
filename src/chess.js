// todo: timer
// todo: sounds
// todo: force move toggle
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
            [-1, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1]
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
        this.renderCanvas();
    };

    undo(undoUI = true) {
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
        if (undoUI) {
            this.endDiv.style.opacity = "0";
            this.endDiv.style.pointerEvents = "none";
            this.promoteDiv.style.opacity = "0";
            this.promoteDiv.style.pointerEvents = "none";
        }
        return move;
    };

    canBeEaten(piece) {
        return Array.from(this.pieces).find(i => i.type[0] !== piece[0] && this.canMovePiece(i, piece.x, piece.y));
    };

    isChecked(type = "w") {
        const pieces = Array.from(this.pieces);
        const king = pieces.find(i => i.type === type + "k");
        return king && this.canBeEaten(king);
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
                    this.undo(false);
                    return 0;
                }
            }
        }
        this.turn = t;
        return this.isChecked(type) ? 1 : 2;
    };

    resizeCanvas() {
        const rect = this.div.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.fCanvas.width = rect.width;
        this.fCanvas.height = rect.height;
        if (innerWidth > innerHeight) {
            this.div.style.width = "auto";
            this.div.style.height = "90%";
        } else {
            this.div.style.width = "90%";
            this.div.style.height = "auto";
        }
    };

    /*** @param {HTMLDivElement} div */
    setDiv(div) {
        this.div = div;
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.fCanvas = document.createElement("canvas");
        this.fCtx = this.fCanvas.getContext("2d");
        this.fCanvas.style.zIndex = "3";

        removeEventListener("resize", this.cnList);

        addEventListener("resize", this.cnList = () => this.resizeCanvas());
        this.resizeCanvas();
        this.renderCanvas();

        div.appendChild(this.canvas);
        div.appendChild(this.fCanvas);
        for (const piece of this.pieces) this.updatePiece(piece);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

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

        div.appendChild(endScreen);
        div.appendChild(promoteMenu);
        div.appendChild(svg);

        const eventHand = fnName => {
            return ev => {
                const el = ev.composedPath()[0];
                if (!el) return;
                const rect = div.getBoundingClientRect();
                if ("touches" in ev) ev = ev.touches[0];
                if (!ev) return;
                const X = ev.clientX - rect.x, Y = ev.clientY - rect.y;
                const pos = this.__getClientPos(X, Y);
                if (fnName) this[fnName](pos[0], pos[1], X, Y);
            };
        };

        this.div.addEventListener("mousedown", eventHand("onMouseDown"));
        addEventListener("mousemove", eventHand("onMouseMove"));
        addEventListener("mouseup", eventHand("onMouseUp"));
        this.div.addEventListener("touchstart", eventHand("onMouseDown"));
        addEventListener("touchmove", eventHand("onMouseMove"));
        addEventListener("touchend", eventHand("onMouseUp"));
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
        if (promotes && ui) {
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
                console.log(1)
            } else throw new Error("Promotion requires UI.");
        }
        this.removePiece(capture);
        this.updatePiece(piece);
        this.renderCanvas();
        let status;
        if (checkEnd && !force) status = this.getEndStatus(piece.type[0] === "w" ? "b" : "w");
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

    __drawSquare(x, y, ctx = this.ctx) {
        if (this.flipped) y = 7 - y;
        const s = ctx.canvas.width / 8;
        ctx.fillRect(s * x, s * y, s, s);
    };

    __drawSquareStroke(x, y, ctx = this.ctx) {
        if (this.flipped) y = 7 - y;
        const s = ctx.canvas.width / 8;
        ctx.strokeRect(s * x + 2, s * y + 2, s - 4, s - 4);
    };

    __drawCircle(x, y, ctx = this.ctx) {
        if (this.flipped) y = 7 - y;
        const s = ctx.canvas.width / 8;
        ctx.beginPath();
        ctx.lineWidth = s / 20;
        ctx.arc(s * (x + 0.5), s * (y + 0.5), s / 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.closePath();
    };

    renderCanvas() {
        if (!this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.fCtx.clearRect(0, 0, this.fCanvas.width, this.fCanvas.height);
        const pieces = Array.from(this.pieces);
        const whiteCheck = this.isChecked("w");
        const blackCheck = this.isChecked("b");
        const whiteKing = pieces.find(i => i.type === "wk");
        const blackKing = pieces.find(i => i.type === "bk");
        this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        if (whiteCheck) this.__drawSquare(whiteKing.x, whiteKing.y);
        if (blackCheck) this.__drawSquare(blackKing.x, blackKing.y);
        const touch = this.lastTouchedPiece;
        if (touch) {
            this.ctx.fillStyle = "rgba(255, 255, 0, 0.5)";
            this.__drawSquare(touch.x, touch.y);
            this.ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
            if (this.dragging) this.__drawSquareStroke(this.mouseX, this.mouseY);
            if (this.turn === (touch.type[0] === "w")) {
                const moves = this.getMovesOf(touch);
                for (const move of moves) {
                    let ct = this.ctx;
                    this.ctx.strokeStyle = "rgba(0, 0, 255, 0.5)";
                    if (this.get(move[0], move[1])) {
                        this.fCtx.strokeStyle = "rgba(255, 0, 0, 0.5)";
                        ct = this.fCtx;
                    }
                    this.__drawCircle(move[0], move[1], ct);
                }
            }
        }
    };

    __getClientPos(offsetX, offsetY) {
        const rect = this.div.getBoundingClientRect();
        const y = Math.round(offsetY / rect.width * 8 - 0.5);
        return [
            Math.round(offsetX / rect.width * 8 - 0.5),
            this.flipped ? 7 - y : y
        ];
    };

    onMouseDown(x, y) {
        this.mouseDown = true;
        this.mouseMoved = false;

        const piece = this.get(x, y);
        this.mouseLastDownPiece = piece;
        if (piece && !this.FORCE && this.turn === (piece.type[0] === "w")) {
            this.lastTouchedPiece = piece;
            this.dragging = false;
            this.renderCanvas();
        }
    };

    onMouseUp(x, y) {
        this.mouseDown = false;

        const piece = this.get(x, y);
        const holdPiece = this.lastTouchedPiece;
        if (!holdPiece) return;

        if (!this.mouseMoved) {
            // click to move
            this.lastTouchedPiece = null;
            this.dragging = false;
            if (!this.movePiece(holdPiece, x, y, this.FORCE)) {
                this.updatePiece(holdPiece);
                this.lastTouchedPiece = piece;
                this.renderCanvas();
            }
            return;
        }

        if (this.dragging) {
            this.dragging = false;
            this.lastTouchedPiece = null;
            holdPiece.div.classList.remove("dragging-piece");
            if (!this.movePiece(holdPiece, x, y, this.FORCE)) {
                this.updatePiece(holdPiece);
                this.lastTouchedPiece = holdPiece;
                this.renderCanvas();
            }
        }
    };

    onMouseMove(x, y, mx, my) {
        if (!this.mouseDown) return;
        this.mouseMoved = true;
        const holdPiece = this.lastTouchedPiece;
        if (!holdPiece) return;
        if (!this.dragging) {
            if (this.mouseLastDownPiece !== holdPiece) return;
            if (holdPiece.div) holdPiece.div.classList.add("dragging-piece");
            this.dragging = true;
        }
        holdPiece.div.style.left = mx + "px";
        holdPiece.div.style.top = my + "px";
        this.mouseX = x;
        this.mouseY = y;
        this.renderCanvas();
    };

    updatePiece(piece) {
        if (!this.div) return;
        let div = piece.div;
        if (!div) {
            this.div.appendChild(piece.div = div = document.createElement("div"));
            div.classList.add("piece");
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

        ["r", "n", "b"].forEach((p, i) => {
            this.createPiece(i, 0, "b" + p);
            this.createPiece(7 - i, 0, "b" + p);
            this.createPiece(i, 7, "w" + p);
            this.createPiece(7 - i, 7, "w" + p);
        });

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