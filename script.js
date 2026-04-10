const totalStars = 10;
const winTargetStars = totalStars * 2;
const attractionRadius = 155;
const collectDistance = 34;
const starMargin = 62;

const game = document.querySelector("#game");
const magnet = document.querySelector("#magnet");
const starsLayer = document.querySelector("#stars");
const score = document.querySelector("#score");
const winOverlay = document.querySelector("#winOverlay");
const winTime = document.querySelector("#winTime");
const replayButton = document.querySelector("#replayButton");

let stars = [];
let collectedCount = 0;
let magnetPosition = { x: 0, y: 0 };
let animationId = null;
let gameBounds = null;
let startTime = 0;
let lastMagnetMoveAt = 0;
let isWon = false;

function getGameBounds() {
  return game.getBoundingClientRect();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function getStarBounds() {
  const topSafeSpace = Math.min(140, gameBounds.height * 0.26);
  const minY = Math.min(gameBounds.height - starMargin, starMargin + topSafeSpace);

  return {
    minX: starMargin,
    maxX: Math.max(starMargin, gameBounds.width - starMargin),
    minY,
    maxY: Math.max(minY, gameBounds.height - starMargin)
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
  score.textContent = `Stjärnor: ${collectedCount} / ${winTargetStars}`;
}

function formatWinTime(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const unit = seconds === 1 ? "sekund" : "sekunder";

  return `Tid: ${seconds} ${unit}`;
}

function setMagnetPosition(x, y) {
  const margin = 42;

  magnetPosition.x = clamp(x, margin, gameBounds.width - margin);
  magnetPosition.y = clamp(y, margin, gameBounds.height - margin);

  magnet.style.transform = `translate3d(${magnetPosition.x}px, ${magnetPosition.y}px, 0) translate3d(-50%, -50%, 0)`;
}

function markMagnetMoving() {
  lastMagnetMoveAt = Date.now();
}

function placeStar(star) {
  star.element.style.transform = `translate3d(${star.x}px, ${star.y}px, 0) translate3d(-50%, -50%, 0)`;
}

function createStar(index) {
  const element = document.createElement("div");
  element.className = "star";

  const bounds = getStarBounds();
  let x = 0;
  let y = 0;
  let attempts = 0;

  do {
    x = randomBetween(bounds.minX, bounds.maxX);
    y = randomBetween(bounds.minY, bounds.maxY);
    attempts += 1;
  } while (attempts < 60 && Math.hypot(x - magnetPosition.x, y - magnetPosition.y) < attractionRadius + 40);

  const star = {
    element,
    x,
    y,
    target: pickStarTarget(),
    collected: false,
    driftSpeed: randomBetween(1.2, 1.8),
    pullOffset: index * 0.004
  };

  starsLayer.appendChild(element);
  placeStar(star);
  return star;
}

function collectStar(star) {
  star.collected = true;
  star.element.classList.add("collected");
  collectedCount += 1;
  updateScore();

  window.setTimeout(() => {
    star.element.remove();
  }, 180);

  if (collectedCount % 2 === 0 && collectedCount < winTargetStars) {
    stars.push(createStar(stars.length));
  }

  if (collectedCount < winTargetStars && stars.every((currentStar) => currentStar.collected)) {
    stars.push(createStar(stars.length));
  }

  if (collectedCount === winTargetStars) {
    showWin();
  }
}

function showWin() {
  isWon = true;
  winTime.textContent = formatWinTime(Date.now() - startTime);
  winOverlay.classList.remove("hidden");
}

function moveStars() {
  const magnetIsMoving = Date.now() - lastMagnetMoveAt < 160;
  const bounds = getStarBounds();

  for (const star of stars) {
    if (star.collected) {
      continue;
    }

    const dx = magnetPosition.x - star.x;
    const dy = magnetPosition.y - star.y;
    const distance = Math.hypot(dx, dy);

    if (magnetIsMoving && distance < collectDistance) {
      collectStar(star);
      continue;
    }

    if (magnetIsMoving && distance < attractionRadius) {
      const closeness = 1 - distance / attractionRadius;
      const pull = 0.025 + closeness * 0.09 + star.pullOffset;
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
  moveStars();
  animationId = window.requestAnimationFrame(animate);
}

function moveMagnetToEvent(event) {
  if (!gameBounds || isWon) {
    return;
  }

  setMagnetPosition(event.clientX - gameBounds.left, event.clientY - gameBounds.top);
}

function handlePointerDown(event) {
  moveMagnetToEvent(event);
}

function handlePointerMove(event) {
  moveMagnetToEvent(event);
  markMagnetMoving();
}

function resetGame() {
  if (animationId) {
    window.cancelAnimationFrame(animationId);
  }

  gameBounds = getGameBounds();
  starsLayer.replaceChildren();
  stars = [];
  collectedCount = 0;
  startTime = Date.now();
  lastMagnetMoveAt = 0;
  isWon = false;
  winOverlay.classList.add("hidden");
  winTime.textContent = "";
  updateScore();
  setMagnetPosition(gameBounds.width / 2, gameBounds.height * 0.72);

  for (let index = 0; index < totalStars; index += 1) {
    stars.push(createStar(index));
  }

  animationId = window.requestAnimationFrame(animate);
}

function resizeGame() {
  gameBounds = getGameBounds();
  setMagnetPosition(magnetPosition.x, magnetPosition.y);

  const bounds = getStarBounds();

  for (const star of stars) {
    star.x = clamp(star.x, bounds.minX, bounds.maxX);
    star.y = clamp(star.y, bounds.minY, bounds.maxY);
    star.target.x = clamp(star.target.x, bounds.minX, bounds.maxX);
    star.target.y = clamp(star.target.y, bounds.minY, bounds.maxY);
    placeStar(star);
  }
}

game.addEventListener("pointerdown", handlePointerDown);
game.addEventListener("pointermove", handlePointerMove);
replayButton.addEventListener("click", resetGame);
window.addEventListener("resize", resizeGame);

resetGame();
