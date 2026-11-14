/**
 * MURFX: SPHEREx Wise-Cube & Blink Explorer Client Application
 * Specification: docs/FRONTEND_SPEC.md and docs/SECURITY.md.
 * Strictly adheres to NO innerHTML.
 */

// State
let sequenceKey = null;
let frames = [];
let loadedImages = [];
let currentFrameIndex = 0;
let isPlaying = false;
let playIntervalId = null;
let playSpeedMs = 250;

// DOM Elements
const form = document.getElementById("sequence-form");
const raInput = document.getElementById("ra-input");
const decInput = document.getElementById("dec-input");
const fovInput = document.getElementById("fov-input");
const detectorSelect = document.getElementById("detector-select");
const modeSelect = document.getElementById("mode-select");
const submitBtn = document.getElementById("submit-btn");
const quickWiseBtn = document.getElementById("quick-wise-btn");

const progressSection = document.getElementById("progress-section");
const stageText = document.getElementById("stage-text");
const progressPct = document.getElementById("progress-pct");
const progressBarFill = document.getElementById("progress-bar-fill");

const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");

const canvas = document.getElementById("blink-canvas");
const ctx = canvas.getContext("2d");
const metaMjd = document.getElementById("meta-mjd");
const metaDate = document.getElementById("meta-date");
const metaWavelength = document.getElementById("meta-wavelength");

const playPauseBtn = document.getElementById("play-pause-btn");
const stepPrevBtn = document.getElementById("step-prev-btn");
const stepNextBtn = document.getElementById("step-next-btn");
const frameSlider = document.getElementById("frame-slider");
const frameCounter = document.getElementById("frame-counter");
const speedSelect = document.getElementById("speed-select");

// Event Listeners
form.addEventListener("submit", handleFormSubmit);
quickWiseBtn.addEventListener("click", () => {
  raInput.value = "133.795125";
  decInput.value = "-7.245147";
  fovInput.value = "8.0";
  detectorSelect.value = "5";
  modeSelect.value = "frames";
});

playPauseBtn.addEventListener("click", togglePlayPause);
stepPrevBtn.addEventListener("click", () => stepFrame(-1));
stepNextBtn.addEventListener("click", () => stepFrame(1));
frameSlider.addEventListener("input", (e) => {
  const idx = parseInt(e.target.value, 10);
  showFrame(idx);
});
speedSelect.addEventListener("change", (e) => {
  playSpeedMs = parseInt(e.target.value, 10);
  if (isPlaying) {
    stopPlayback();
    startPlayback();
  }
});

function showError(msg) {
  errorMessage.textContent = msg;
  errorSection.classList.remove("hidden");
}

function clearError() {
  errorMessage.textContent = "";
  errorSection.classList.add("hidden");
}

function updateProgress(stage, pct) {
  progressSection.classList.remove("hidden");
  stageText.textContent = `Processing: ${stage.toUpperCase()}...`;
  progressPct.textContent = `${pct}%`;
  progressBarFill.style.width = `${pct}%`;
}

function hideProgress() {
  progressSection.classList.add("hidden");
}

async function handleFormSubmit(e) {
  e.preventDefault();
  clearError();
  stopPlayback();

  const payload = {
    ra: parseFloat(raInput.value),
    dec: parseFloat(decInput.value),
    fov_arcmin: parseFloat(fovInput.value),
    detector: parseInt(detectorSelect.value, 10),
    mode: modeSelect.value,
  };

  submitBtn.disabled = true;
  updateProgress("Submitting request", 5);

  try {
    const res = await fetch("/api/v1/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Server returned error (${res.status})`;
      throw new Error(msg);
    }

    const data = await res.json();
    sequenceKey = data.key;

    if (data.status === "done" && data.result) {
      await loadSequenceResult(data.result);
    } else {
      await pollSequence(sequenceKey);
    }
  } catch (err) {
    showError(err.message);
    hideProgress();
  } finally {
    submitBtn.disabled = false;
  }
}

async function pollSequence(key) {
  const pollInterval = 1500;
  let attempts = 0;
  const maxAttempts = 240; // 6 minutes max

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, pollInterval));

    const res = await fetch(`/api/v1/sequences/${encodeURIComponent(key)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Failed polling sequence status.");
    }

    const statusObj = await res.json();
    if (statusObj.status === "running" || statusObj.status === "queued") {
      const stage = statusObj.stage || "processing";
      const done = statusObj.progress?.done || 0;
      const total = statusObj.progress?.total || 1;
      const pct = Math.min(95, Math.max(10, Math.round((done / total) * 100)));
      updateProgress(stage, pct);
    } else if (statusObj.status === "done") {
      updateProgress("Loading images", 98);
      await loadSequenceResult(statusObj.result);
      return;
    } else if (statusObj.status === "failed") {
      throw new Error(statusObj.error?.message || "Sequence processing failed.");
    }
  }

  throw new Error("Polling timed out while waiting for sequence.");
}

async function loadSequenceResult(result) {
  frames = result.frames || [];
  if (frames.length === 0) {
    throw new Error("No frames available in this sequence.");
  }

  // Set canvas size from grid dimensions
  if (result.grid) {
    canvas.width = result.grid.width;
    canvas.height = result.grid.height;
  }

  // Preload frame PNG images
  loadedImages = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = f.url;
    });
    loadedImages.push(img);
  }

  hideProgress();

  // Enable player controls
  playPauseBtn.disabled = false;
  stepPrevBtn.disabled = false;
  stepNextBtn.disabled = false;
  frameSlider.disabled = false;
  frameSlider.max = (frames.length - 1).toString();
  frameSlider.value = "0";

  currentFrameIndex = 0;
  showFrame(0);
  startPlayback();
}

function showFrame(index) {
  if (index < 0 || index >= loadedImages.length) return;
  currentFrameIndex = index;
  frameSlider.value = index.toString();
  frameCounter.textContent = `${index + 1} / ${loadedImages.length}`;

  const img = loadedImages[index];
  if (img && img.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  const f = frames[index];
  if (f) {
    metaMjd.textContent = `MJD: ${f.mjd.toFixed(2)}`;
    metaDate.textContent = `Date: ${f.iso.slice(0, 10)}`;
    metaWavelength.textContent = f.wavelength_um ? `\u03bb: ${f.wavelength_um.toFixed(2)} \u03bcm` : "\u03bb: -- \u03bcm";
  }
}

function stepFrame(delta) {
  let next = currentFrameIndex + delta;
  if (next >= loadedImages.length) next = 0;
  if (next < 0) next = loadedImages.length - 1;
  showFrame(next);
}

function togglePlayPause() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (loadedImages.length <= 1) return;
  isPlaying = true;
  playPauseBtn.textContent = "||";
  playIntervalId = setInterval(() => {
    stepFrame(1);
  }, playSpeedMs);
}

function stopPlayback() {
  isPlaying = false;
  playPauseBtn.textContent = ">";
  if (playIntervalId) {
    clearInterval(playIntervalId);
    playIntervalId = null;
  }
}
