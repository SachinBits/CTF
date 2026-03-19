const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const secretRoomUi = document.getElementById('secret-room-ui');
const restartBtn = document.getElementById('restart-btn');

// Configuration
const TILE_SIZE = 40;
const COLS = 60; // Larger map
const ROWS = 45;

// Variables
let map = [];
let gameStarted = false;
let secretUnlocked = false;
let inSecretRoom = false;
let secretDoorRow = 0;
let secretDoorCol = 0;
let inputSeq = [];
const targetSeq = ['w','w','s','s','w','s','s','w','s','w','w','s'];

const keys = { w: false, a: false, s: false, d: false };

// Assets
const imgKaneki = new Image(); imgKaneki.src = 'assets/kaneki.png';
const imgWall = new Image(); imgWall.src = 'assets/wall.png';
const imgFloor = new Image(); imgFloor.src = 'assets/floor.png';

// Audio Context
let audioCtx;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.5;
    
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noiseSource.start();

    setInterval(() => {
        if (!gameStarted) return;
        if (Math.random() > 0.3) return;
        
        const osc = audioCtx.createOscillator();
        const dGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        
        dGain.gain.setValueAtTime(0, audioCtx.currentTime);
        dGain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
        dGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        
        osc.connect(dGain);
        dGain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }, 2000);
}

// Player Object
const player = {
    x: 1.5 * TILE_SIZE,
    y: 1.5 * TILE_SIZE,
    radius: TILE_SIZE * 0.35,
    speed: 3.5,
    vx: 0,
    vy: 0,
    dir: 'down'
};

// Map Generation
function generateMap() {
    map = [];
    for (let r=0; r<ROWS; r++) {
        map[r] = new Array(COLS).fill(0);
    }
    // build borders
    for(let c=0; c<COLS; c++) { map[0][c] = 1; map[ROWS-1][c] = 1; }
    for(let r=0; r<ROWS; r++) { map[r][0] = 1; map[r][COLS-1] = 1; }

    // random ruined pillars
    for (let i = 0; i < 200; i++) {
        const rr = 2 + Math.floor(Math.random() * (ROWS - 4));
        const cc = 2 + Math.floor(Math.random() * (COLS - 4));
        if (rr < 5 && cc < 5) continue; // Keep spawn area clean!
        
        map[rr][cc] = 1;
        if(Math.random()>0.5) map[rr+1][cc] = 1;
        if(Math.random()>0.5) map[rr][cc+1] = 1;
    }
}

// Particles (Rain/Spores)
const particles = [];
function initParticles() {
    particles.length = 0;
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vy: 3 + Math.random() * 4,
            length: 4 + Math.random() * 6
        });
    }
}

// Restart Game
function restartGame() {
    player.x = 1.5 * TILE_SIZE;
    player.y = 1.5 * TILE_SIZE;
    secretUnlocked = false;
    inSecretRoom = false;
    inputSeq = [];
    secretRoomUi.classList.add('hidden');
    document.getElementById('glitchOverlay').style.background = 'transparent';
    generateMap(); // Regen map constraints
}

// Setup Event Listeners
window.addEventListener('keydown', (e) => {
    if (!gameStarted) return;
    let key = e.key.toLowerCase();
    if(key === 'arrowup') key = 'w';
    if(key === 'arrowdown') key = 's';
    if(key === 'arrowleft') key = 'a';
    if(key === 'arrowright') key = 'd';

    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }

    if (['w','a','s','d'].includes(key)) {
        inputSeq.push(key);
        if (inputSeq.length > targetSeq.length) {
            inputSeq.shift();
        }
        checkSecret();
    }
});

window.addEventListener('keyup', (e) => {
    let key = e.key.toLowerCase();
    if(key === 'arrowup') key = 'w';
    if(key === 'arrowdown') key = 's';
    if(key === 'arrowleft') key = 'a';
    if(key === 'arrowright') key = 'd';
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
    }
});

restartBtn.addEventListener('click', () => {
    restartGame();
    // Blur to remove focus so keyboard events continue working for the game
    restartBtn.blur();
});

function spawnSecretDoor() {
    const pC = Math.floor(player.x / TILE_SIZE);
    const pR = Math.floor(player.y / TILE_SIZE);
    
    let dR = 0; let dC = 0;
    if (player.dir === 'up') dR = -1;
    if (player.dir === 'down') dR = 1;
    if (player.dir === 'left') dC = -1;
    if (player.dir === 'right') dC = 1;

    // Default to down if no direction
    if (dR === 0 && dC === 0) dR = 1;

    let targetR = pR + (dR * 5);
    let targetC = pC + (dC * 5);

    let placed = false;
    // Search outwards from target coordinate
    for (let radius = 0; radius < 15; radius++) {
        for (let r = targetR - radius; r <= targetR + radius; r++) {
            for (let c = targetC - radius; c <= targetC + radius; c++) {
                if (r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1) {
                    if (map[r][c] === 0) {
                        map[r][c] = 2; // Door tile
                        secretDoorRow = r;
                        secretDoorCol = c;
                        placed = true;
                        break;
                    }
                }
            }
            if (placed) break;
        }
        if (placed) break;
    }
}

function checkSecret() {
    if (secretUnlocked) return;
    if (inputSeq.length === targetSeq.length) {
        if (inputSeq.join(',') === targetSeq.join(',')) {
            secretUnlocked = true;
            spawnSecretDoor();

            // Play glitch aesthetic
            const glitch = document.getElementById('glitchOverlay');
            glitch.style.background = 'rgba(255,0,0,0.4)';
            setTimeout(() => {
                glitch.style.background = 'transparent';
                setTimeout(() => glitch.style.background = 'rgba(255,0,0,0.2)', 50);
                setTimeout(() => glitch.style.background = 'transparent', 150);
            }, 100);
        }
    }
}

function update() {
    if (!gameStarted) return;

    player.vx = 0;
    player.vy = 0;
    if (keys.w) { player.vy = -player.speed; player.dir = 'up'; }
    if (keys.s) { player.vy = player.speed; player.dir = 'down'; }
    if (keys.a) { player.vx = -player.speed; player.dir = 'left'; }
    if (keys.d) { player.vx = player.speed; player.dir = 'right'; }

    if (player.vx !== 0 && player.vy !== 0) {
        player.vx *= 0.7071;
        player.vy *= 0.7071;
    }

    let nextX = player.x + player.vx;
    let nextY = player.y + player.vy;

    const cr = player.radius;
    function isWall(px, py) {
        const c = Math.floor(px / TILE_SIZE);
        const r = Math.floor(py / TILE_SIZE);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
        return map[r][c] === 1; // 2 is door, can walk onto it
    }

    // X collision
    if (!isWall(nextX - cr, player.y - cr) && !isWall(nextX + cr, player.y - cr) &&
        !isWall(nextX - cr, player.y + cr) && !isWall(nextX + cr, player.y + cr)) {
        player.x = nextX;
    }

    // Y collision
    if (!isWall(player.x - cr, nextY - cr) && !isWall(player.x + cr, nextY - cr) &&
        !isWall(player.x - cr, nextY + cr) && !isWall(player.x + cr, nextY + cr)) {
        player.y = nextY;
    }

    // Secret Room Check (stepping on the door tile '2')
    const pC = Math.floor(player.x / TILE_SIZE);
    const pR = Math.floor(player.y / TILE_SIZE);
    if (secretUnlocked && map[pR][pC] === 2 && !inSecretRoom) {
        inSecretRoom = true;
        secretRoomUi.classList.remove('hidden');
    } else if (inSecretRoom && map[pR][pC] !== 2) {
        inSecretRoom = false;
        secretRoomUi.classList.add('hidden');
    }

    // Particles fall (Screen space)
    particles.forEach(p => {
        p.y += p.vy;
        if (p.y > canvas.height) {
            p.y = -p.length;
            p.x = Math.random() * canvas.width;
        }
    });
}

function draw() {
    // Clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Camera Calculation
    let camX = player.x - canvas.width / 2;
    let camY = player.y - canvas.height / 2;
    camX = Math.max(0, Math.min(camX, COLS * TILE_SIZE - canvas.width));
    camY = Math.max(0, Math.min(camY, ROWS * TILE_SIZE - canvas.height));

    ctx.save();
    ctx.translate(-camX, -camY);

    // Render Map within view bounds
    const sC = Math.max(0, Math.floor(camX / TILE_SIZE));
    const eC = Math.min(COLS, sC + Math.ceil(canvas.width / TILE_SIZE) + 1);
    const sR = Math.max(0, Math.floor(camY / TILE_SIZE));
    const eR = Math.min(ROWS, sR + Math.ceil(canvas.height / TILE_SIZE) + 1);

    for (let r = sR; r < eR; r++) {
        for (let c = sC; c < eC; c++) {
            const tile = map[r][c];
            const px = c * TILE_SIZE;
            const py = r * TILE_SIZE;

            if (tile === 1 || tile === 2) {
                if (imgWall.complete && imgWall.width > 0) {
                    const srcX = px % imgWall.width;
                    const srcY = py % imgWall.height;
                    ctx.drawImage(imgWall, srcX, srcY, TILE_SIZE, TILE_SIZE, px, py, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
                
                // Add a red glowing passage overlay for the standalone door
                if (tile === 2) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    ctx.fillStyle = '#fff';
                    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.5;
                    ctx.fillRect(px + TILE_SIZE/2 - 2, py + TILE_SIZE/2 - 2, 4, 4);
                    ctx.globalAlpha = 1.0;
                }
            } else if (tile === 0 || tile === 8) {
                if (imgFloor.complete && imgFloor.width > 0) {
                    const srcX = px % imgFloor.width;
                    const srcY = py % imgFloor.height;
                    ctx.drawImage(imgFloor, srcX, srcY, TILE_SIZE, TILE_SIZE, px, py, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = '#0a0a0a';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
                
                if (tile === 8) {
                    ctx.fillStyle = 'rgba(150, 0, 0, 0.15)';
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }

    // Player bobbing
    const bob = Math.sin(Date.now() / 150) * (player.vx || player.vy ? 2 : 0);
    
    // Render Player
    ctx.translate(player.x, player.y);
    if (imgKaneki.complete && imgKaneki.width > 0) {
        ctx.drawImage(imgKaneki, -TILE_SIZE/2, -TILE_SIZE/2 + bob, TILE_SIZE, TILE_SIZE);
    } else {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, bob, player.radius, 0, Math.PI*2);
        ctx.fill();
    }
    
    // Glowing Eye
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 10 + Math.sin(Date.now() / 100) * 5;
    ctx.beginPath();
    ctx.arc(4, -5 + bob, 2, 0, Math.PI*2);
    ctx.fill();
    
    ctx.restore(); // Undo camera translation to draw screen-space FX

    // Rain Particles (Screen Space)
    ctx.fillStyle = 'rgba(200, 200, 220, 0.2)';
    particles.forEach(p => {
        ctx.fillRect(p.x, p.y, 1, p.length);
    });

    // Screen Space Lighting Overlay Masks (Only if secret NOT unlocked)
    if (!secretUnlocked) {
        const screenPlayerX = player.x - camX;
        const screenPlayerY = player.y - camY;
        const lightRadius = 150 + Math.sin(Date.now() / 200) * 10;
        
        ctx.globalCompositeOperation = 'multiply';
        const grd = ctx.createRadialGradient(screenPlayerX, screenPlayerY, lightRadius * 0.1, screenPlayerX, screenPlayerY, lightRadius);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.5, '#555555');
        grd.addColorStop(1, '#000000');
        
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
    }

    requestAnimationFrame(loop);
}

function loop() {
    update();
    draw();
}

startScreen.addEventListener('click', () => {
    if (gameStarted) return;
    startScreen.style.opacity = 0;
    setTimeout(() => {
        startScreen.style.display = 'none';
        hud.style.opacity = 1;
        gameStarted = true;
        initAudio(); // must be initialized on user gesture
        loop();
    }, 500);
});

// Initialization
generateMap();
initParticles();
// Initial draw when image loads
imgFloor.onload = () => draw();
