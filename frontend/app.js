/**
 * MURFX: SPHEREx Wise-Cube & Blink Explorer - Slice 2 Frontend Engine
 * Specification: docs/FRONTEND_SPEC.md and docs/SECURITY.md
 * Strictly adheres to NO innerHTML.
 */

// Application State
let currentSequenceKey = null;
let currentResult = null;
let frames = [];
let loadedImages = [];
let currentFrameIndex = 0;
let isPlaying = false;
let playIntervalId = null;
let fps = 4;
let isLooping = true;
let isBouncing = false;
let bounceDirection = 1; // 1 = forward, -1 = reverse
let lastResolvedData = null;

// DOM Elements
const appHeader = document.getElementById("app-header");
const appFooter = document.getElementById("app-footer");
const controlsSection = document.getElementById("controls-section");
const quickPicksSection = document.getElementById("quick-picks-section");
const form = document.getElementById("sequence-form");

const targetInput = document.getElementById("target-input");
const resolveBtn = document.getElementById("resolve-btn");
const resolveStatus = document.getElementById("resolve-status");
const raInput = document.getElementById("ra-input");
const decInput = document.getElementById("dec-input");
const fovInput = document.getElementById("fov-input");
const detectorSelect = document.getElementById("detector-select");
const modeSelect = document.getElementById("mode-select");
const bgSelect = document.getElementById("bg-select");
const maskSelect = document.getElementById("mask-select");
const stretchSelect = document.getElementById("stretch-select");
const binInput = document.getElementById("bin-input");
const maxFramesInput = document.getElementById("max-frames-input");

const submitBtn = document.getElementById("submit-btn");
const shareLinkBtn = document.getElementById("share-link-btn");
const embedSnippetBtn = document.getElementById("embed-snippet-btn");
const embedBox = document.getElementById("embed-box");
const embedCodeText = document.getElementById("embed-code-text");
const closeEmbedBtn = document.getElementById("close-embed-btn");

const progressSection = document.getElementById("progress-section");
const stageText = document.getElementById("stage-text");
const progressPct = document.getElementById("progress-pct");
const progressBarFill = document.getElementById("progress-bar-fill");

const warningsSection = document.getElementById("warnings-section");
const warningsText = document.getElementById("warnings-text");
const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");

const canvas = document.getElementById("blink-canvas");
const ctx = canvas.getContext("2d");
const canvasContainer = document.getElementById("canvas-container");
const crosshairLayer = document.getElementById("crosshair-layer");
const compassLayer = document.getElementById("compass-layer");
const scaleLayer = document.getElementById("scale-layer");
const scaleBarLine = document.getElementById("scale-bar-line");
const scaleBarText = document.getElementById("scale-bar-text");
const hoverCoords = document.getElementById("hover-coords");

const toggleCrosshair = document.getElementById("toggle-crosshair");
const toggleCompass = document.getElementById("toggle-compass");
const toggleScale = document.getElementById("toggle-scale");
const toggleSmooth = document.getElementById("toggle-smooth");

const metaMjd = document.getElementById("meta-mjd");
const metaDate = document.getElementById("meta-date");
const metaWavelength = document.getElementById("meta-wavelength");

const playPauseBtn = document.getElementById("play-pause-btn");
const stepPrevBtn = document.getElementById("step-prev-btn");
const stepNextBtn = document.getElementById("step-next-btn");
const frameSlider = document.getElementById("frame-slider");
const frameCounter = document.getElementById("frame-counter");
const loopBtn = document.getElementById("loop-btn");
const bounceBtn = document.getElementById("bounce-btn");
const speedSelect = document.getElementById("speed-select");

const detailDate = document.getElementById("detail-date");
const detailMjd = document.getElementById("detail-mjd");
const detailWavelength = document.getElementById("detail-wavelength");
const detailDetector = document.getElementById("detail-detector");
const detailExposures = document.getElementById("detail-exposures");
const detailFlagged = document.getElementById("detail-flagged");
const detailVersion = document.getElementById("detail-version");
const dataThroughText = document.getElementById("data-through-text");

// Target Presets from docs/TEST_TARGETS.md
const PRESETS = {
  wise0855: { name: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, det: 5, mode: "frames" },
  barnard: { name: "Barnard's Star", fov: 8.0, det: 2, mode: "frames" },
  epsind: { name: "eps Ind B", fov: 12.0, det: 3, mode: "frames" },
  rwaur: { name: "RW Aur", fov: 4.0, det: 2, mode: "frames" },
  rdra: { name: "R Dra", fov: 4.0, det: 2, mode: "frames" },
};

// Initialization on DOM Load
window.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  fetchMetadata();
  parseUrlParameters();
});

function initEventListeners() {
  form.addEventListener("submit", handleFormSubmit);
  resolveBtn.addEventListener("click", handleResolveClick);

  // Quick Pick Chips
  document.querySelectorAll(".btn-chip[data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-target");
      loadPreset(key);
    });
  });

  // Player controls
  playPauseBtn.addEventListener("click", togglePlayPause);
  stepPrevBtn.addEventListener("click", () => stepFrame(-1));
  stepNextBtn.addEventListener("click", () => stepFrame(1));
  frameSlider.addEventListener("input", (e) => showFrame(parseInt(e.target.value, 10)));
  speedSelect.addEventListener("change", (e) => {
    fps = parseInt(e.target.value, 10);
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  });

  loopBtn.addEventListener("click", () => {
    isLooping = !isLooping;
    loopBtn.classList.toggle("active", isLooping);
  });

  bounceBtn.addEventListener("click", () => {
    isBouncing = !isBouncing;
    bounceBtn.classList.toggle("active", isBouncing);
  });

  // Overlay Toggles
  toggleCrosshair.addEventListener("change", () => {
    crosshairLayer.classList.toggle("hidden", !toggleCrosshair.checked);
  });
  toggleCompass.addEventListener("change", () => {
    compassLayer.classList.toggle("hidden", !toggleCompass.checked);
  });
  toggleScale.addEventListener("change", () => {
    scaleLayer.classList.toggle("hidden", !toggleScale.checked);
  });
  toggleSmooth.addEventListener("change", () => {
    canvas.style.imageRendering = toggleSmooth.checked ? "auto" : "pixelated";
  });

  // Hover Coordinates Tracking
  canvas.addEventListener("mousemove", handleCanvasMouseMove);
  canvas.addEventListener("mouseleave", () => {
    hoverCoords.textContent = "RA: --, Dec: --";
  });

  // Share & Embed Buttons
  shareLinkBtn.addEventListener("click", copyShareLink);
  embedSnippetBtn.addEventListener("click", showEmbedSnippet);
  closeEmbedBtn.addEventListener("click", () => embedBox.classList.add("hidden"));

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

// Sexagesimal and Input Parsing
function parseCoordinateString(inputStr) {
  const s = inputStr.trim();
  // Regex for two decimal numbers: e.g. "133.795125 -7.245147" or "133.795, -7.245"
  const decPair = s.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (decPair) {
    const ra = parseFloat(decPair[1]);
    const dec = parseFloat(decPair[2]);
    if (ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }

  // Regex for Sexagesimal: "08h55m10.83s -07d14m42.5s" or "08:55:10.83 -07:14:42.5"
  const sexaMatch = s.match(
    /^(\d{1,2})[h:](\d{1,2})[m:](\d{1,2}(?:\.\d+)?)s?[\s,]+([+-]?\d{1,2})[d:](\d{1,2})[m:](\d{1,2}(?:\.\d+)?)s?$/i
  );
  if (sexaMatch) {
    const rh = parseFloat(sexaMatch[1]);
    const rm = parseFloat(sexaMatch[2]);
    const rs = parseFloat(sexaMatch[3]);
    const ra = (rh + rm / 60.0 + rs / 3600.0) * 15.0;

    const dSign = sexaMatch[4].startsWith("-") ? -1 : 1;
    const dd = Math.abs(parseFloat(sexaMatch[4]));
    const dm = parseFloat(sexaMatch[5]);
    const ds = parseFloat(sexaMatch[6]);
    const dec = dSign * (dd + dm / 60.0 + ds / 3600.0);

    if (ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }

  return null;
}

async function handleResolveClick() {
  const query = targetInput.value.trim();
  if (!query) return;

  const parsed = parseCoordinateString(query);
  if (parsed) {
    raInput.value = parsed.ra.toFixed(6);
    decInput.value = parsed.dec.toFixed(6);
    resolveStatus.textContent = `Parsed coordinates: RA ${parsed.ra.toFixed(4)}\u00B0, Dec ${parsed.dec.toFixed(4)}\u00B0`;
    return;
  }

  // Treat as object name and query /api/v1/resolve
  resolveStatus.textContent = `Resolving "${query}" in SIMBAD...`;
  try {
    const res = await fetch(`/api/v1/resolve?name=${encodeURIComponent(query)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || "Object name not found");
    }
    const data = await res.json();
    lastResolvedData = data;

    // Use propagated position if proper motion exists
    const useRa = data.ra_now !== null && data.ra_now !== undefined ? data.ra_now : data.ra;
    const useDec = data.dec_now !== null && data.dec_now !== undefined ? data.dec_now : data.dec;

    raInput.value = useRa.toFixed(6);
    decInput.value = useDec.toFixed(6);

    if (data.ra_now !== null && data.ra_now !== undefined) {
      resolveStatus.textContent = `Resolved: ${data.query} (Propagated to ${data.target_epoch} via ${data.source})`;
    } else {
      resolveStatus.textContent = `Resolved: ${data.query} (${data.source})`;
    }
  } catch (err) {
    resolveStatus.textContent = `Resolve error: ${err.message}`;
  }
}

async function loadPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;

  targetInput.value = p.name;
  if (p.ra !== undefined && p.dec !== undefined) {
    raInput.value = p.ra.toFixed(6);
    decInput.value = p.dec.toFixed(6);
    resolveStatus.textContent = `Target: ${p.name}`;
  } else {
    await handleResolveClick();
  }

  if (p.fov) fovInput.value = p.fov.toString();
  if (p.det) detectorSelect.value = p.det.toString();
  if (p.mode) modeSelect.value = p.mode;

  // Auto-submit after selection
  form.requestSubmit();
}

// Metadata Fetching
async function fetchMetadata() {
  try {
    const res = await fetch("/api/v1/meta");
    if (res.ok) {
      const meta = await res.json();
      if (meta.latest_observation_iso) {
        dataThroughText.textContent = `Data through: ${meta.latest_observation_iso.slice(0, 10)}`;
      }
    }
  } catch {
    // Ignore meta errors
  }
}

// URL Parameter Handling and Sharing
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);

  // Embed Mode
  if (params.get("embed") === "1") {
    document.body.classList.add("embed-mode");
    if (appHeader) appHeader.classList.add("hidden");
    if (appFooter) appFooter.classList.add("hidden");
    if (controlsSection) controlsSection.classList.add("hidden");
    if (quickPicksSection) quickPicksSection.classList.add("hidden");
  }

  if (params.has("ra")) raInput.value = parseFloat(params.get("ra")).toFixed(6);
  if (params.has("dec")) decInput.value = parseFloat(params.get("dec")).toFixed(6);
  if (params.has("fov")) fovInput.value = params.get("fov");
  if (params.has("det")) detectorSelect.value = params.get("det");
  if (params.has("mode")) modeSelect.value = params.get("mode");
  if (params.has("bg")) bgSelect.value = params.get("bg");
  if (params.has("mask")) maskSelect.value = params.get("mask");
  if (params.has("stretch")) stretchSelect.value = params.get("stretch");
  if (params.has("fps")) {
    fps = parseInt(params.get("fps"), 10);
    speedSelect.value = fps.toString();
  }

  // Auto run if coordinates or name present
  if (params.has("name")) {
    targetInput.value = params.get("name");
    handleResolveClick().then(() => form.requestSubmit());
  } else if (params.has("ra") && params.has("dec")) {
    form.requestSubmit();
  }
}

function updateUrlState() {
  const params = new URLSearchParams();
  params.set("ra", parseFloat(raInput.value).toFixed(6));
  params.set("dec", parseFloat(decInput.value).toFixed(6));
  params.set("fov", fovInput.value);
  params.set("det", detectorSelect.value);
  params.set("mode", modeSelect.value);
  params.set("fps", fps.toString());

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function copyShareLink() {
  updateUrlState();
  navigator.clipboard.writeText(window.location.href).then(() => {
    shareLinkBtn.textContent = "Copied!";
    setTimeout(() => {
      shareLinkBtn.textContent = "Copy Share Link";
    }, 2000);
  });
}

function showEmbedSnippet() {
  updateUrlState();
  const embedUrl = `${window.location.href}&embed=1`;
  const snippet = `<iframe src="${embedUrl}" width="600" height="600" frameborder="0" allowfullscreen></iframe>`;
  embedCodeText.value = snippet;
  embedBox.classList.remove("hidden");
}

// Request & Pipeline Polling
async function handleFormSubmit(e) {
  e.preventDefault();
  clearNotices();
  stopPlayback();

  const payload = {
    ra: parseFloat(raInput.value),
    dec: parseFloat(decInput.value),
    fov_arcmin: parseFloat(fovInput.value),
    detector: parseInt(detectorSelect.value, 10),
    mode: modeSelect.value,
    background: bgSelect.value,
    mask_level: maskSelect.value,
    stretch: stretchSelect.value,
    bin_days: parseFloat(binInput.value),
    max_frames: parseInt(maxFramesInput.value, 10),
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
    currentSequenceKey = data.key;
    updateUrlState();

    if (data.status === "done" && data.result) {
      await loadSequenceResult(data.result);
    } else {
      await pollSequence(currentSequenceKey);
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
  const maxAttempts = 240;

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
  currentResult = result;
  frames = result.frames || [];
  if (frames.length === 0) {
    throw new Error("No frames available in this sequence.");
  }

  // Display warnings and notices
  if (result.warnings && result.warnings.length > 0) {
    warningsText.textContent = result.warnings.join(" \u2022 ");
    warningsSection.classList.remove("hidden");
  }

  // Set canvas size from grid dimensions
  if (result.grid) {
    canvas.width = result.grid.width;
    canvas.height = result.grid.height;
    updateScaleBar(result.grid.pixscale_arcsec);
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

  // Check prefers-reduced-motion before autoplay
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    startPlayback();
  }
}

function updateScaleBar(pixscaleArcsec) {
  // Compute pixel width of 1 arcminute (60 arcseconds)
  const oneArcminPx = 60.0 / pixscaleArcsec;
  scaleBarLine.style.width = `${Math.round(oneArcminPx)}px`;
  scaleBarText.textContent = "1'";
}

function handleCanvasMouseMove(e) {
  if (!currentResult || !currentResult.grid) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  // Tangent WCS approximation from center
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2.0;
  const cy = h / 2.0;

  // In FITS: py=0 is south, so in canvas py=0 is north (inverted)
  const dxPx = px - cx;
  const dyPx = cy - py; // positive north

  const degPerPx = (currentResult.grid.pixscale_arcsec || 3.08) / 3600.0;
  const centerRa = parseFloat(raInput.value);
  const centerDec = parseFloat(decInput.value);

  const decHover = centerDec + dyPx * degPerPx;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0);
  const raHover = centerRa - (dxPx * degPerPx) / (cosDec || 1.0);

  hoverCoords.textContent = `RA: ${raHover.toFixed(4)}\u00B0, Dec: ${decHover.toFixed(4)}\u00B0`;
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

    detailDate.textContent = `Date: ${f.iso.slice(0, 19)}Z`;
    detailMjd.textContent = `MJD: ${f.mjd.toFixed(3)}`;
    detailWavelength.textContent = f.wavelength_um ? `Wavelength: ${f.wavelength_um.toFixed(2)} \u03bcm` : "Wavelength: n/a";
    detailDetector.textContent = `Detector: D${f.detector}`;
    detailExposures.textContent = `Exposures: ${f.n_exposures}`;
    detailFlagged.textContent = `Flagged: ${(f.flag_fraction * 100).toFixed(1)}%`;
    detailVersion.textContent = `Version: ${f.version || "l2b"}`;
  }
}

function stepFrame(delta) {
  if (isBouncing) {
    let next = currentFrameIndex + bounceDirection * delta;
    if (next >= loadedImages.length) {
      bounceDirection = -1;
      next = loadedImages.length - 2;
    } else if (next < 0) {
      bounceDirection = 1;
      next = 1;
    }
    showFrame(Math.max(0, Math.min(loadedImages.length - 1, next)));
  } else {
    let next = currentFrameIndex + delta;
    if (next >= loadedImages.length) {
      if (!isLooping) {
        stopPlayback();
        return;
      }
      next = 0;
    }
    if (next < 0) next = loadedImages.length - 1;
    showFrame(next);
  }
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
  const intervalMs = Math.round(1000 / fps);
  playIntervalId = setInterval(() => {
    stepFrame(1);
  }, intervalMs);
}

function stopPlayback() {
  isPlaying = false;
  playPauseBtn.textContent = ">";
  if (playIntervalId) {
    clearInterval(playIntervalId);
    playIntervalId = null;
  }
}

// Keyboard Controls per docs/FRONTEND_SPEC.md section 5
function handleKeyboardShortcuts(e) {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    return;
  }

  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlayPause();
      break;
    case "ArrowLeft":
      e.preventDefault();
      stepFrame(-1);
      break;
    case "ArrowRight":
      e.preventDefault();
      stepFrame(1);
      break;
    case "[":
      e.preventDefault();
      fps = Math.max(1, fps - 1);
      speedSelect.value = fps.toString();
      if (isPlaying) { stopPlayback(); startPlayback(); }
      break;
    case "]":
      e.preventDefault();
      fps = Math.min(15, fps + 1);
      speedSelect.value = fps.toString();
      if (isPlaying) { stopPlayback(); startPlayback(); }
      break;
    case "l":
    case "L":
      loopBtn.click();
      break;
    case "f":
    case "F":
      if (!document.fullscreenElement) {
        canvasContainer.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      break;
  }
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorSection.classList.remove("hidden");
}

function clearNotices() {
  errorMessage.textContent = "";
  errorSection.classList.add("hidden");
  warningsText.textContent = "";
  warningsSection.classList.add("hidden");
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
