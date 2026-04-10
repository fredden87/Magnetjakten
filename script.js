const levels = [
  {
    name: "Magnetängen",
    className: "scene-meadow",
    hint: "Dra magneten och samla ängens stjärnor.",
    starColor: "#ffdc4a",
    driftBoost: 0
  },
  {
    name: "Regnbågsskogen",
    className: "scene-forest",
    hint: "Följ stjärnorna genom regnbågsskogen.",
    starColor: "#ff8bb2",
    driftBoost: 0.2
  },
  {
    name: "Glittergrottan",
    className: "scene-cave",
    hint: "Hitta det mjuka glittret i grottan.",
    starColor: "#fff27a",
    driftBoost: 0.35
  }
];

const difficulties = {
  easy: {
    label: "Lätt",
    initialStars: 5,
    targetStars: 6,
    attractionRadius: 190,
    collectDistance: 38,
    starMargin: 58,
    pullBase: 0.04,
    pullClose: 0.13,
    driftMin: 1.35,
    driftMax: 2,
    magnetEase: 0.36,
    magnetMovingWindow: 170,
    unmagneticTime: 500
  },
  challenge: {
    label: "Utmaning",
    initialStars: 7,
    targetStars: 9,
    attractionRadius: 150,
    collectDistance: 28,
    starMargin: 62,
    pullBase: 0.026,
    pullClose: 0.085,
    driftMin: 2.05,
    driftMax: 2.75,
    magnetEase: 0.22,
    magnetMovingWindow: 120,
    unmagneticTime: 500
  }
};

const game = document.querySelector("#game");
const magnet = document.querySelector("#magnet");
const starsLayer = document.querySelector("#stars");
const sparklesLayer = document.querySelector("#sparkles");
const score = document.querySelector("#score");
const levelName = document.querySelector("#levelName");
const hint = document.querySelector("#hint");
const unicorn = document.querySelector("#unicorn");
const startScreen = document.querySelector("#startScreen");
const playButton = document.querySelector("#playButton");
const soundButton = document.querySelector("#soundButton");
const gameSoundButton = document.querySelector("#gameSoundButton");
const difficultyButtons = document.querySelectorAll(".difficulty-button");
const levelToast = document.querySelector("#levelToast");
const winOverlay = document.querySelector("#winOverlay");
const winMessage = document.querySelector("#winMessage");
const winTime = document.querySelector("#winTime");
const replayButton = document.querySelector("#replayButton");
const menuButton = document.querySelector("#menuButton");

const AudioContextClass = window.AudioContext || window.webkitAudioContext;

let stars = [];
let collectedCount = 0;
let currentLevelIndex = 0;
let currentDifficultyKey = "easy";
let appState = "menu";
let magnetPosition = { x: 0, y: 0 };
let magnetTarget = { x: 0, y: 0 };
let animationId = null;
let gameBounds = null;
let startTime = 0;
let lastMagnetMoveAt = 0;
let lastCollectAt = 0;
let audioContext = null;
let audioReady = false;
let soundEnabled = true;

function getDifficulty() {
  return difficulties[currentDifficultyKey];
}

function getLevel() {
  return levels[currentLevelIndex];
}

function getGameBounds() {
  return game.getBoundingClientRect();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function updateSoundButtons() {
  const text = soundEnabled ? "Ljud på" : "Ljud av";

  soundButton.textContent = text;
  gameSoundButton.textContent = text;
  soundButton.setAttribute("aria-pressed", String(!soundEnabled));
  gameSoundButton.setAttribute("aria-pressed", String(!soundEnabled));
}

async function ensureAudioContext() {
  if (!soundEnabled || !AudioContextClass) {
    return null;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    audioReady = audioContext.state === "running";
    return audioContext;
  } catch {
    audioReady = false;
    return null;
  }
}

function playTone(frequency, startAt, duration, volume, type = "sine") {
  if (!soundEnabled || !audioReady || !audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const stopAt = startAt + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, startAt + duration * 0.38);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt);
}

function playCatchSound() {
  if (!soundEnabled || !audioReady || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  playTone(240, now, 0.16, 0.1, "triangle");
  playTone(420, now + 0.035, 0.14, 0.07, "sine");
}

async function playCatchSoundSafely() {
  await ensureAudioContext();
  playCatchSound();
}

async function playWinSound() {
  await ensureAudioContext();

  if (!soundEnabled || !audioReady || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];

  for (let index = 0; index < notes.length; index += 1) {
    playTone(notes[index], now + index * 0.11, 0.34, 0.13, "sine");
  }
}

function getStarBounds() {
  const difficulty = getDifficulty();
  const topSafeSpace = Math.min(155, gameBounds.height * 0.28);
  const minY = Math.min(gameBounds.height - difficulty.starMargin, difficulty.starMargin + topSafeSpace);

  return {
    minX: difficulty.starMargin,
    maxX: Math.max(difficulty.starMargin, gameBounds.width - difficulty.starMargin),
    minY,
    maxY: Math.max(minY, gameBounds.height - difficulty.starMargin)
  };
}

function pickStarTarget() {
  const bounds = getStarBounds();

  return {
    x: randomBetween(bounds.minX, bounds.maxX),
    y: randomBetween(bounds.minY, bounds.maxY)
  };
}

function updateScore() {
  const difficulty = getDifficulty();

  score.textContent = `Stjärnor: ${collectedCount} / ${difficulty.targetStars}`;
}

function formatWinTime(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const unit = seconds === 1 ? "sekund" : "sekunder";

  return `Tid: ${seconds} ${unit}`;
}

function placeMagnet() {
  magnet.style.transform = `translate3d(${magnetPosition.x}px, ${magnetPosition.y}px, 0) translate3d(-50%, -50%, 0)`;
}

function setMagnetPosition(x, y) {
  const margin = 42;

  magnetTarget.x = clamp(x, margin, gameBounds.width - margin);
  magnetTarget.y = clamp(y, margin, gameBounds.height - margin);
}

function jumpMagnetToTarget() {
  magnetPosition.x = magnetTarget.x;
  magnetPosition.y = magnetTarget.y;
  placeMagnet();
}

function updateMagnetPosition() {
  const difficulty = getDifficulty();

  magnetPosition.x += (magnetTarget.x - magnetPosition.x) * difficulty.magnetEase;
  magnetPosition.y += (magnetTarget.y - magnetPosition.y) * difficulty.magnetEase;
  placeMagnet();
}

function markMagnetMoving() {
  lastMagnetMoveAt = Date.now();
}

function placeStar(star) {
  star.element.style.setProperty("--star-x", `${star.x}px`);
  star.element.style.setProperty("--star-y", `${star.y}px`);
  star.element.style.transform = `translate3d(${star.x}px, ${star.y}px, 0) translate3d(-50%, -50%, 0)`;
}

function createStar(index) {
  const difficulty = getDifficulty();
  const level = getLevel();
  const element = document.createElement("div");
  element.className = "star";
  element.style.setProperty("--star-color", level.starColor);

  const bounds = getStarBounds();
  let x = 0;
  let y = 0;
  let attempts = 0;

  do {
    x = randomBetween(bounds.minX, bounds.maxX);
    y = randomBetween(bounds.minY, bounds.maxY);
    attempts += 1;
  } while (attempts < 60 && Math.hypot(x - magnetPosition.x, y - magnetPosition.y) < difficulty.attractionRadius + 40);

  const star = {
    element,
    x,
    y,
    target: pickStarTarget(),
    collected: false,
    driftSpeed: randomBetween(difficulty.driftMin, difficulty.driftMax) + level.driftBoost,
    pullOffset: index * 0.0035
  };

  starsLayer.appendChild(element);
  placeStar(star);
  return star;
}

function createSparkles(x, y) {
  for (let index = 0; index < 8; index += 1) {
    const sparkle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 8;
    const distance = randomBetween(18, 46);

    sparkle.className = "sparkle";
    sparkle.style.setProperty("--sparkle-x", `${x}px`);
    sparkle.style.setProperty("--sparkle-y", `${y}px`);
    sparkle.style.setProperty("--sparkle-dx", `${Math.cos(angle) * distance}px`);
    sparkle.style.setProperty("--sparkle-dy", `${Math.sin(angle) * distance}px`);
    sparklesLayer.appendChild(sparkle);

    window.setTimeout(() => {
      sparkle.remove();
    }, 540);
  }
}

function celebrateUnicorn() {
  unicorn.classList.remove("is-happy");
  window.requestAnimationFrame(() => {
    unicorn.classList.add("is-happy");
  });

  window.setTimeout(() => {
    unicorn.classList.remove("is-happy");
  }, 560);
}

function showLevelToast(text) {
  levelToast.textContent = text;
  levelToast.classList.remove("hidden");

  window.setTimeout(() => {
    levelToast.classList.add("hidden");
  }, 1200);
}

function collectStar(star) {
  const difficulty = getDifficulty();

  star.collected = true;
  star.element.classList.add("collected");
  collectedCount += 1;
  lastCollectAt = Date.now();
  updateScore();
  createSparkles(star.x, star.y);
  celebrateUnicorn();
  void playCatchSoundSafely();

  window.setTimeout(() => {
    star.element.remove();
  }, 180);

  if (collectedCount === difficulty.targetStars) {
    completeLevel();
    return;
  }

  if (collectedCount % 2 === 0 && stars.filter((currentStar) => !currentStar.collected).length < difficulty.initialStars) {
    stars.push(createStar(stars.length));
  }
}

function completeLevel() {
  if (currentLevelIndex === levels.length - 1) {
    showWin();
    return;
  }

  appState = "between-levels";
  showLevelToast("Bra jobbat!");

  window.setTimeout(() => {
    currentLevelIndex += 1;
    startLevel();
  }, 900);
}

function showWin() {
  appState = "won";
  unicorn.classList.add("is-winning");
  winMessage.textContent = "Alla stjärnor glittrar.";
  winTime.textContent = formatWinTime(Date.now() - startTime);
  winOverlay.classList.remove("hidden");
  void playWinSound();
}

function moveStars() {
  const difficulty = getDifficulty();
  const now = Date.now();
  const magnetIsMoving = now - lastMagnetMoveAt < difficulty.magnetMovingWindow;
  const magnetIsUnmagnetic = now - lastCollectAt < difficulty.unmagneticTime;
  const bounds = getStarBounds();
  let collectedStarThisFrame = false;

  magnet.classList.toggle("is-cooldown", magnetIsUnmagnetic);

  for (const star of stars) {
    if (star.collected) {
      continue;
    }

    const dx = magnetPosition.x - star.x;
    const dy = magnetPosition.y - star.y;
    const distance = Math.hypot(dx, dy);

    if (!magnetIsUnmagnetic && !collectedStarThisFrame && magnetIsMoving && distance < difficulty.collectDistance) {
      collectedStarThisFrame = true;
      collectStar(star);
      continue;
    }

    if (!magnetIsUnmagnetic && magnetIsMoving && distance < difficulty.attractionRadius) {
      const closeness = 1 - distance / difficulty.attractionRadius;
      const pull = difficulty.pullBase + closeness * difficulty.pullClose + star.pullOffset;

      star.x += dx * pull;
      star.y += dy * pull;
    } else {
      const targetDx = star.target.x - star.x;
      const targetDy = star.target.y - star.y;
      const targetDistance = Math.hypot(targetDx, targetDy);

      if (targetDistance < 16) {
        star.target = pickStarTarget();
      } else {
        star.x += (targetDx / targetDistance) * star.driftSpeed;
        star.y += (targetDy / targetDistance) * star.driftSpeed;
      }
    }

    star.x = clamp(star.x, bounds.minX, bounds.maxX);
    star.y = clamp(star.y, bounds.minY, bounds.maxY);
    placeStar(star);
  }
}

function animate() {
  if (appState === "playing") {
    updateMagnetPosition();
    moveStars();
  }

  animationId = window.requestAnimationFrame(animate);
}

function moveMagnetToEvent(event) {
  if (!gameBounds || appState !== "playing") {
    return;
  }

  setMagnetPosition(event.clientX - gameBounds.left, event.clientY - gameBounds.top);
}

function handlePointerDown(event) {
  if (appState !== "playing") {
    return;
  }

  void ensureAudioContext();
  moveMagnetToEvent(event);
  markMagnetMoving();

  if (game.setPointerCapture) {
    try {
      game.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; the game still works without it.
    }
  }
}

function handlePointerMove(event) {
  if (appState !== "playing") {
    return;
  }

  moveMagnetToEvent(event);
  markMagnetMoving();
}

function applyScene() {
  for (const level of levels) {
    game.classList.remove(level.className);
  }

  game.classList.add(getLevel().className);
}

function startLevel() {
  const difficulty = getDifficulty();
  const level = getLevel();

  appState = "playing";
  gameBounds = getGameBounds();
  applyScene();
  starsLayer.replaceChildren();
  sparklesLayer.replaceChildren();
  stars = [];
  collectedCount = 0;
  lastMagnetMoveAt = 0;
  lastCollectAt = 0;
  levelName.textContent = level.name;
  hint.textContent = level.hint;
  winOverlay.classList.add("hidden");
  levelToast.classList.add("hidden");
  unicorn.classList.remove("is-winning");
  updateScore();

  setMagnetPosition(gameBounds.width / 2, gameBounds.height * 0.72);
  jumpMagnetToTarget();

  for (let index = 0; index < difficulty.initialStars; index += 1) {
    stars.push(createStar(index));
  }

  showLevelToast(level.name);
}

function startGame() {
  startTime = Date.now();
  currentLevelIndex = 0;
  game.classList.remove("is-menu");
  startScreen.classList.add("hidden");
  winOverlay.classList.add("hidden");
  void ensureAudioContext();
  startLevel();

  if (!animationId) {
    animationId = window.requestAnimationFrame(animate);
  }
}

function showStartScreen() {
  appState = "menu";
  starsLayer.replaceChildren();
  sparklesLayer.replaceChildren();
  stars = [];
  collectedCount = 0;
  currentLevelIndex = 0;
  game.classList.add("is-menu");
  applyScene();
  unicorn.classList.remove("is-winning", "is-happy");
  winOverlay.classList.add("hidden");
  startScreen.classList.remove("hidden");
  levelToast.classList.add("hidden");
}

function setDifficulty(difficultyKey) {
  currentDifficultyKey = difficultyKey;

  for (const button of difficultyButtons) {
    const isActive = button.dataset.difficulty === difficultyKey;

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundButtons();

  if (soundEnabled) {
    void ensureAudioContext();
  }
}

function resizeGame() {
  gameBounds = getGameBounds();

  if (appState !== "playing") {
    return;
  }

  setMagnetPosition(magnetTarget.x, magnetTarget.y);
  jumpMagnetToTarget();

  const bounds = getStarBounds();

  for (const star of stars) {
    star.x = clamp(star.x, bounds.minX, bounds.maxX);
    star.y = clamp(star.y, bounds.minY, bounds.maxY);
    star.target.x = clamp(star.target.x, bounds.minX, bounds.maxX);
    star.target.y = clamp(star.target.y, bounds.minY, bounds.maxY);
    placeStar(star);
  }
}

playButton.addEventListener("click", startGame);
replayButton.addEventListener("click", startGame);
menuButton.addEventListener("click", showStartScreen);
soundButton.addEventListener("click", toggleSound);
gameSoundButton.addEventListener("click", toggleSound);
game.addEventListener("pointerdown", handlePointerDown);
game.addEventListener("pointermove", handlePointerMove);
window.addEventListener("resize", resizeGame);

for (const button of difficultyButtons) {
  button.addEventListener("click", () => {
    setDifficulty(button.dataset.difficulty);
  });
}

updateSoundButtons();
setDifficulty(currentDifficultyKey);
showStartScreen();
