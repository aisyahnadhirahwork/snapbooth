const PHOTO_LIMIT = 4;
const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 366;
const STRIP_FILTERS = {
  none: "none",
  warm: "sepia(0.28) saturate(1.25) contrast(1.03)",
  classic: "contrast(1.08) saturate(0.78) sepia(0.12) brightness(1.03)",
  portrait: "saturate(0.88) contrast(0.96) brightness(1.06) sepia(0.07)",
  golden: "sepia(0.24) saturate(1.32) hue-rotate(-8deg) brightness(1.04)",
  mono: "grayscale(1) contrast(1.08)",
};
const FRAME_STYLES = {
  classic: { background: "#f7f2e9", caption: "#564239", slot: "#ebe2d6", mat: 0 },
  polaroid: { background: "#fbf8f2", caption: "#5c493e", slot: "#efe9e1", mat: 5 },
  midnight: { background: "#302529", caption: "#d3ba7a", slot: "#463338", mat: 0 },
};

const screens = {
  welcome: document.querySelector("#welcome-screen"),
  camera: document.querySelector("#camera-screen"),
  finish: document.querySelector("#finish-screen"),
};
const beginSessionButton = document.querySelector("#begin-session-button");
const camera = document.querySelector("#camera");
const placeholder = document.querySelector("#placeholder");
const cameraButton = document.querySelector("#camera-button");
const flipCameraButton = document.querySelector("#flip-camera-button");
const captureButton = document.querySelector("#capture-button");
const downloadButton = document.querySelector("#download-button");
const retakeButton = document.querySelector("#retake-button");
const statusMessage = document.querySelector("#status");
const cameraState = document.querySelector("#camera-state");
const cameraHeading = document.querySelector("#camera-heading");
const journeyProgress = document.querySelector("#journey-progress");
const journeySteps = [...document.querySelectorAll(".journey-step")];
const countdown = document.querySelector("#countdown");
const flash = document.querySelector("#flash");
const photoCount = document.querySelector("#photo-count");
const stripHint = document.querySelector("#strip-hint");
const photoSlots = [...document.querySelectorAll(".photo-slot")];
const photoStrip = document.querySelector("#photo-strip");
const filterButtons = [...document.querySelectorAll(".filter-button")];
const frameButtons = [...document.querySelectorAll(".frame-button")];

let stream = null;
let isFrontCamera = true;
let selectedFilter = "none";
let selectedFrame = "classic";
let photos = [];
let countdownTimer = null;
let isCapturing = false;
let isSwitchingCamera = false;

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, screen]) => {
    screen.hidden = screenName !== name;
  });
  screens[name].querySelector("h1, h2")?.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function setJourney(stage) {
  const completed = stage === journeySteps.length;
  const currentStage = Math.min(stage, journeySteps.length - 1);
  const progress = completed ? 100 : (currentStage / (journeySteps.length - 1)) * 100;
  journeyProgress.style.setProperty("--journey-progress", `${progress * 0.75}%`);
  journeyProgress.setAttribute("aria-valuenow", String(completed ? journeySteps.length : stage + 1));
  journeyProgress.setAttribute(
    "aria-valuetext",
    completed ? "Session complete" : `Step ${stage + 1} of ${journeySteps.length}: ${journeySteps[stage].lastElementChild.textContent}`,
  );

  journeySteps.forEach((step, index) => {
    const isComplete = index < stage || completed;
    const isCurrent = index === currentStage && !completed;
    step.classList.toggle("is-complete", isComplete);
    step.classList.toggle("is-current", isCurrent);
    if (isCurrent) {
      step.setAttribute("aria-current", "step");
    } else {
      step.removeAttribute("aria-current");
    }
    step.querySelector(".journey-number").textContent = isComplete ? "✓" : String(index + 1).padStart(2, "0");
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera access isn’t supported here. Try a current browser over HTTPS.", true);
    return;
  }

  cameraButton.disabled = true;
  setStatus("Waiting for camera permission…");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user" },
    });
    isFrontCamera = true;
    camera.srcObject = stream;
    camera.style.transform = "scaleX(-1)";
    placeholder.hidden = true;
    flipCameraButton.hidden = false;
    flipCameraButton.disabled = false;
    cameraButton.hidden = true;
    captureButton.disabled = false;
    document.body.classList.add("camera-on");
    cameraState.textContent = "LIVE";
    cameraHeading.textContent = "Take your portraits";
    setJourney(2);
    setStatus("Camera ready. Take your first portrait when you’re ready.");
  } catch (error) {
    cameraButton.disabled = false;
    setJourney(1);
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      setStatus("Camera permission was denied. Allow camera access in your browser to continue.", true);
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      setStatus("No camera found. Connect a camera and try again.", true);
    } else {
      setStatus("Couldn’t start the camera. Check that it’s connected and try again.", true);
    }
  }
}

async function flipCamera() {
  if (!stream || isCapturing || isSwitchingCamera) return;

  const nextFacingMode = isFrontCamera ? "environment" : "user";
  isSwitchingCamera = true;
  flipCameraButton.disabled = true;
  captureButton.disabled = true;
  setStatus("Switching camera…");

  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: nextFacingMode } },
    });
    const previousStream = stream;
    stream = nextStream;
    isFrontCamera = nextFacingMode === "user";
    camera.srcObject = nextStream;
    camera.style.transform = isFrontCamera ? "scaleX(-1)" : "none";
    previousStream.getTracks().forEach((track) => track.stop());
    setStatus(`Using the ${isFrontCamera ? "front" : "rear"} camera. Your photos stay on this device.`);
  } catch (error) {
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError" || error.name === "DevicesNotFoundError") {
      setStatus("Couldn’t switch cameras. This device may not have another camera.", true);
    } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      setStatus("Camera access was denied. Allow camera access in your browser to switch cameras.", true);
    } else {
      setStatus("Couldn’t switch cameras. Your current camera is still available.", true);
    }
  } finally {
    isSwitchingCamera = false;
    flipCameraButton.disabled = false;
    captureButton.disabled = photos.length >= PHOTO_LIMIT;
  }
}

function setFilter(filter) {
  if (!Object.hasOwn(STRIP_FILTERS, filter)) return;
  selectedFilter = filter;
  photoSlots.forEach((slot) => {
    const photo = slot.querySelector("canvas");
    if (photo) photo.style.filter = STRIP_FILTERS[filter];
  });
  filterButtons.forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setFrame(frame) {
  if (!Object.hasOwn(FRAME_STYLES, frame)) return;
  selectedFrame = frame;
  photoStrip.dataset.frame = frame;
  frameButtons.forEach((button) => {
    const active = button.dataset.frame === frame;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function triggerFlash() {
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");
}

function capturePhoto() {
  if (!stream || isCapturing || photos.length >= PHOTO_LIMIT) return;
  isCapturing = true;
  captureButton.disabled = true;
  flipCameraButton.disabled = true;

  let secondsLeft = 3;
  countdown.hidden = false;
  countdown.textContent = secondsLeft;
  setStatus("Get ready…");

  countdownTimer = window.setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      countdown.textContent = secondsLeft;
      return;
    }

    window.clearInterval(countdownTimer);
    countdownTimer = null;
    countdown.hidden = true;
    savePhoto();
  }, 1000);
}

function savePhoto() {
  const sourceWidth = camera.videoWidth;
  const sourceHeight = camera.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    isCapturing = false;
    captureButton.disabled = false;
    flipCameraButton.disabled = false;
    setStatus("Camera is still starting. Try again in a moment.", true);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;
  const context = canvas.getContext("2d");
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = PHOTO_WIDTH / PHOTO_HEIGHT;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  if (isFrontCamera) {
    context.translate(PHOTO_WIDTH, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    camera,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    PHOTO_WIDTH,
    PHOTO_HEIGHT,
  );

  triggerFlash();
  photos.push(canvas);
  renderPhotos();
  photoSlots[photos.length - 1].classList.add("pop");
  isCapturing = false;
  captureButton.disabled = photos.length >= PHOTO_LIMIT;
  flipCameraButton.disabled = false;

  if (photos.length === PHOTO_LIMIT) {
    downloadButton.disabled = false;
    retakeButton.hidden = false;
    stripHint.textContent = "Your little keepsake is ready.";
    photoStrip.classList.add("complete");
    setJourney(3);
    setStatus("That’s your strip! Download it or start a new one.");
    showScreen("finish");
  } else {
    setStatus(`${PHOTO_LIMIT - photos.length} more ${PHOTO_LIMIT - photos.length === 1 ? "photo" : "photos"} to go!`);
  }
}

function renderPhotos() {
  photoSlots.forEach((slot, index) => {
    slot.classList.remove("pop");
    slot.replaceChildren();
    if (photos[index]) {
      photos[index].style.filter = STRIP_FILTERS[selectedFilter];
      slot.append(photos[index]);
    } else {
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const star = document.createElement("span");
      star.className = "slot-star";
      star.setAttribute("aria-hidden", "true");
      star.textContent = "✳";
      slot.append(number, star);
    }
  });
  photoCount.textContent = `${photos.length} / ${PHOTO_LIMIT}`;
}

function downloadStrip() {
  if (photos.length !== PHOTO_LIMIT) return;

  const canvas = document.createElement("canvas");
  const frame = FRAME_STYLES[selectedFrame];
  const scale = PHOTO_WIDTH / 158;
  const frameBorder = 3 * scale;
  const padding = 14 * scale;
  const gap = 9 * scale;
  const slotBorder = 2 * scale;
  const mat = frame.mat * scale;
  const slotWidth = PHOTO_WIDTH + (slotBorder + mat) * 2;
  const slotHeight = slotWidth / 1.75;
  const photoHeight = slotHeight - (slotBorder + mat) * 2;
  const captionHeight = 12 * scale;
  const bottomPadding = 12 * scale;
  const shadowOffsetX = 5 * scale;
  const shadowOffsetY = 6 * scale;
  const frameWidth = slotWidth + (padding + frameBorder) * 2;
  const frameHeight =
    slotHeight * PHOTO_LIMIT +
    gap * (PHOTO_LIMIT - 1) +
    padding +
    frameBorder * 2 +
    captionHeight +
    bottomPadding;
  canvas.width = Math.ceil(frameWidth + shadowOffsetX);
  canvas.height = Math.ceil(frameHeight + shadowOffsetY);
  const context = canvas.getContext("2d");

  context.fillStyle = "#392a24";
  context.fillRect(shadowOffsetX, shadowOffsetY, frameWidth, frameHeight);
  context.fillStyle = "#392a24";
  context.fillRect(0, 0, frameWidth, frameHeight);
  context.fillStyle = frame.background;
  context.fillRect(frameBorder, frameBorder, frameWidth - frameBorder * 2, frameHeight - frameBorder * 2);

  photos.forEach((photo, index) => {
    const left = frameBorder + padding;
    const top = frameBorder + padding + index * (slotHeight + gap);
    context.fillStyle = frame.slot;
    context.fillRect(left, top, slotWidth, slotHeight);
    context.strokeStyle = "#392a24";
    context.lineWidth = slotBorder;
    context.strokeRect(left + slotBorder / 2, top + slotBorder / 2, slotWidth - slotBorder, slotHeight - slotBorder);
    context.filter = STRIP_FILTERS[selectedFilter];
    context.drawImage(
      photo,
      left + slotBorder + mat,
      top + slotBorder + mat,
      PHOTO_WIDTH,
      photoHeight,
    );
    context.filter = "none";
  });
  context.fillStyle = frame.caption;
  context.font = `700 ${9 * scale}px "Space Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    "SNAPBOOTH",
    frameWidth / 2,
    frameHeight - bottomPadding - captionHeight / 2,
  );

  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus("Couldn’t create your download. Please try again.", true);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fotokita-photo-strip.png";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setJourney(journeySteps.length);
    setStatus("Your photo strip has been downloaded!");
  }, "image/png");
}

function resetStrip() {
  photos = [];
  renderPhotos();
  downloadButton.disabled = true;
  retakeButton.hidden = true;
  captureButton.disabled = !stream;
  setJourney(2);
  stripHint.textContent = "Your four photos will show up here.";
  photoStrip.classList.remove("complete");
  cameraHeading.textContent = "Take your portraits";
  showScreen("camera");
  setStatus("Your photos stay on this device.");
}

function stopCamera() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
  }
  stream?.getTracks().forEach((track) => track.stop());
}

beginSessionButton.addEventListener("click", () => {
  setJourney(1);
  showScreen("camera");
});
cameraButton.addEventListener("click", startCamera);
flipCameraButton.addEventListener("click", flipCamera);
captureButton.addEventListener("click", capturePhoto);
downloadButton.addEventListener("click", downloadStrip);
retakeButton.addEventListener("click", resetStrip);
filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});
frameButtons.forEach((button) => {
  button.addEventListener("click", () => setFrame(button.dataset.frame));
});
window.addEventListener("beforeunload", stopCamera);