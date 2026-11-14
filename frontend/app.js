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
let blinkMode = "time"; // "time" or "wavelength"
let gaiaSources = [];
let aladinInstance = null;

// Spectrum & Audio Sonification State (Slice 6)
let currentSpectrumData = null;
let audioContext = null;
let audioNodes = [];
let audioPlayheadAnimId = null;
let clickedPixelCoords = null;

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
const flagsCanvas = document.getElementById("flags-canvas");
const flagsCtx = flagsCanvas ? flagsCanvas.getContext("2d") : null;
const sparklineCanvas = document.getElementById("sparkline-canvas");
const sparklineCtx = sparklineCanvas ? sparklineCanvas.getContext("2d") : null;
const sparklineSection = document.getElementById("sparkline-section");
const tableSection = document.getElementById("table-section");
const framesTableBody = document.getElementById("frames-table-body");
const truncationNotice = document.getElementById("truncation-notice");

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
const toggleGaia = document.getElementById("toggle-gaia");
const toggleFlags = document.getElementById("toggle-flags");
const toggleSmooth = document.getElementById("toggle-smooth");
const toggleAladinBtn = document.getElementById("toggle-aladin-btn");
const aladinSection = document.getElementById("aladin-section");
const blinkModeBtn = document.getElementById("blink-mode-btn");

const gaiaCanvas = document.getElementById("gaia-canvas");
const gaiaCtx = gaiaCanvas ? gaiaCanvas.getContext("2d") : null;

// Spectrum & Audio DOM Elements (Slice 6)
const spectrumSection = document.getElementById("spectrum-section");
const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext("2d") : null;
const spectrumCoordsText = document.getElementById("spectrum-coords-text");
const spectrumRadiusSelect = document.getElementById("spectrum-radius-select");
const playAudioBtn = document.getElementById("play-audio-btn");
const stopAudioBtn = document.getElementById("stop-audio-btn");
const closeSpectrumBtn = document.getElementById("close-spectrum-btn");
const spectrumStats = document.getElementById("spectrum-stats");
const spectrumPin = document.getElementById("spectrum-pin");

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
  if (toggleFlags && flagsCanvas) {
    toggleFlags.addEventListener("change", () => {
      flagsCanvas.classList.toggle("hidden", !toggleFlags.checked);
      if (toggleFlags.checked) {
        loadAndDrawFlags(currentFrameIndex);
      }
    });
  }
  if (toggleGaia && gaiaCanvas) {
    toggleGaia.addEventListener("change", () => {
      gaiaCanvas.classList.toggle("hidden", !toggleGaia.checked);
      if (toggleGaia.checked && frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    });
  }
  if (blinkModeBtn) {
    blinkModeBtn.addEventListener("click", toggleBlinkMode);
  }
  if (toggleAladinBtn && aladinSection) {
    toggleAladinBtn.addEventListener("click", toggleAladinView);
  }
  toggleSmooth.addEventListener("change", () => {
    canvas.style.imageRendering = toggleSmooth.checked ? "auto" : "pixelated";
  });

  // Hover Coordinates Tracking
  canvas.addEventListener("mousemove", handleCanvasMouseMove);
  canvas.addEventListener("mouseleave", () => {
    hoverCoords.textContent = "RA: --, Dec: --";
  });

  // Canvas Click for Pixel Spectrum Extraction (Slice 6)
  canvas.addEventListener("click", handleCanvasClick);
  if (flagsCanvas) flagsCanvas.addEventListener("click", handleCanvasClick);
  if (gaiaCanvas) gaiaCanvas.addEventListener("click", handleCanvasClick);

  if (spectrumRadiusSelect) {
    spectrumRadiusSelect.addEventListener("change", () => {
      if (clickedPixelCoords) {
        const r = parseInt(spectrumRadiusSelect.value, 10) || 1;
        fetchAndRenderSpectrum(clickedPixelCoords.x, clickedPixelCoords.y, r);
      }
    });
  }
  if (playAudioBtn) playAudioBtn.addEventListener("click", playAudioSonification);
  if (stopAudioBtn) stopAudioBtn.addEventListener("click", stopAudioSonification);
  if (closeSpectrumBtn) {
    closeSpectrumBtn.addEventListener("click", () => {
      stopAudioSonification();
      if (spectrumSection) spectrumSection.classList.add("hidden");
      if (spectrumPin) spectrumPin.classList.add("hidden");
      clickedPixelCoords = null;
    });
  }

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

  // Truncation notice
  if (result.truncated && truncationNotice) {
    truncationNotice.textContent = `Showing ${result.n_frames} of ${result.n_available} exposures, evenly spaced in time`;
    truncationNotice.classList.remove("hidden");
  } else if (truncationNotice) {
    truncationNotice.classList.add("hidden");
  }

  // Set canvas size from grid dimensions
  if (result.grid) {
    canvas.width = result.grid.width;
    canvas.height = result.grid.height;
    if (flagsCanvas) {
      flagsCanvas.width = result.grid.width;
      flagsCanvas.height = result.grid.height;
    }
    if (gaiaCanvas) {
      gaiaCanvas.width = result.grid.width;
      gaiaCanvas.height = result.grid.height;
    }
    updateScaleBar(result.grid.pixscale_arcsec);
    fetchGaiaSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
  }

  // Render Table Rows
  renderTableRows(frames);
  if (tableSection) tableSection.classList.remove("hidden");

  // Render Sparkline
  if (sparklineCanvas && frames.some((f) => f.center_value !== null)) {
    drawSparkline(frames, 0);
    if (sparklineSection) sparklineSection.classList.remove("hidden");
  } else if (sparklineSection) {
    sparklineSection.classList.add("hidden");
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

  // Update active table row
  if (framesTableBody) {
    const rows = framesTableBody.querySelectorAll("tr");
    rows.forEach((r, idx) => {
      r.classList.toggle("active-row", idx === index);
    });
  }

  // Update Sparkline Cursor
  if (sparklineCanvas && frames.some((f) => f.center_value !== null)) {
    drawSparkline(frames, index);
  }

  // Draw flags mask if enabled
  if (toggleFlags && toggleFlags.checked) {
    loadAndDrawFlags(index);
  }

  // Draw Gaia DR3 overlay if enabled
  if (toggleGaia && toggleGaia.checked && frames[index]) {
    drawGaiaOverlay(frames[index]);
  }
}

async function fetchGaiaSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/gaia?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      gaiaSources = data.sources || [];
      if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    }
  } catch {
    gaiaSources = [];
  }
}

function worldToCanvasPx(ra, dec) {
  if (!currentResult || !currentResult.grid) return null;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2.0;
  const cy = h / 2.0;

  const degPerPx = (currentResult.grid.pixscale_arcsec || 3.08) / 3600.0;
  const centerRa = parseFloat(raInput.value);
  const centerDec = parseFloat(decInput.value);

  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const dxDeg = (centerRa - ra) * cosDec;
  const dyDeg = dec - centerDec;

  const x = cx + dxDeg / degPerPx;
  const y = cy - dyDeg / degPerPx;
  return { x, y };
}

function drawGaiaOverlay(frame) {
  if (!gaiaCtx || !gaiaCanvas || !gaiaSources.length || !currentResult || !currentResult.grid) {
    if (gaiaCtx && gaiaCanvas) gaiaCtx.clearRect(0, 0, gaiaCanvas.width, gaiaCanvas.height);
    return;
  }
  gaiaCtx.clearRect(0, 0, gaiaCanvas.width, gaiaCanvas.height);

  // Propagate Gaia sources from catalog epoch J2016.0 to frame epoch
  const frameEpoch = 2000.0 + (frame.mjd - 51544.5) / 365.25;
  const dt = frameEpoch - 2016.0;

  gaiaSources.forEach((src) => {
    const pmraDegYr = (src.pmra_mas_yr || 0.0) / (3600.0 * 1000.0);
    const pmdecDegYr = (src.pmdec_mas_yr || 0.0) / (3600.0 * 1000.0);
    const cosDec = Math.cos((src.dec * Math.PI) / 180.0) || 1.0;

    const raEpoch = src.ra + (pmraDegYr * dt) / cosDec;
    const decEpoch = src.dec + pmdecDegYr * dt;

    const pt = worldToCanvasPx(raEpoch, decEpoch);
    if (pt && pt.x >= -30 && pt.x <= gaiaCanvas.width + 30 && pt.y >= -30 && pt.y <= gaiaCanvas.height + 30) {
      gaiaCtx.beginPath();
      gaiaCtx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      gaiaCtx.strokeStyle = "#4ade80"; // Bright Green
      gaiaCtx.lineWidth = 1.5;
      gaiaCtx.stroke();

      // Draw proper motion vector arrow if significant
      const pmTot = Math.hypot(src.pmra_mas_yr || 0, src.pmdec_mas_yr || 0);
      if (pmTot > 50.0) {
        const arrowDx = -((src.pmra_mas_yr || 0) / 100.0);
        const arrowDy = -((src.pmdec_mas_yr || 0) / 100.0);
        gaiaCtx.beginPath();
        gaiaCtx.moveTo(pt.x, pt.y);
        gaiaCtx.lineTo(pt.x + arrowDx, pt.y + arrowDy);
        gaiaCtx.strokeStyle = "#facc15";
        gaiaCtx.lineWidth = 1.2;
        gaiaCtx.stroke();
      }
    }
  });
}

function toggleBlinkMode() {
  if (!frames || frames.length <= 1) return;
  blinkMode = blinkMode === "time" ? "wavelength" : "time";
  if (blinkModeBtn) {
    blinkModeBtn.textContent = blinkMode === "wavelength" ? "Blink: Wavelength" : "Blink: Time";
  }

  // Reorder frames & loadedImages
  const combined = frames.map((f, i) => ({ frame: f, img: loadedImages[i] }));
  if (blinkMode === "wavelength") {
    combined.sort((a, b) => (a.frame.wavelength_um || 0) - (b.frame.wavelength_um || 0));
  } else {
    combined.sort((a, b) => a.frame.mjd - b.frame.mjd);
  }

  frames = combined.map((c) => c.frame);
  loadedImages = combined.map((c) => c.img);

  renderTableRows(frames);
  currentFrameIndex = 0;
  showFrame(0);
}

function toggleAladinView() {
  if (!aladinSection) return;
  aladinSection.classList.toggle("hidden");
  if (!aladinSection.classList.contains("hidden")) {
    initAladinLite();
  }
}

function initAladinLite() {
  const aladinDiv = document.getElementById("aladin-lite-div");
  if (!aladinDiv) return;

  const ra = parseFloat(raInput.value);
  const dec = parseFloat(decInput.value);
  const fovDeg = parseFloat(fovInput.value) / 60.0;

  // Use embedded CDS iframe context if script is blocked or in offline mode
  while (aladinDiv.firstChild) {
    aladinDiv.removeChild(aladinDiv.firstChild);
  }

  const iframe = document.createElement("iframe");
  iframe.src = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${ra} ${dec}`)}&fov=${fovDeg.toFixed(3)}&survey=P%2F2MASS%2Fcolor`;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.title = "Aladin Lite Survey Context";
  aladinDiv.appendChild(iframe);
}

async function loadAndDrawFlags(index) {
  if (!flagsCtx || !flagsCanvas || !currentSequenceKey) return;
  const flagsUrl = `/api/v1/sequences/${currentSequenceKey}/frames/${index}/flags.png`;
  const flagImg = new Image();
  flagImg.onload = () => {
    flagsCtx.clearRect(0, 0, flagsCanvas.width, flagsCanvas.height);
    flagsCtx.drawImage(flagImg, 0, 0, flagsCanvas.width, flagsCanvas.height);
  };
  flagImg.src = flagsUrl;
}

function renderTableRows(frameList) {
  if (!framesTableBody) return;
  // Clear existing rows without innerHTML
  while (framesTableBody.firstChild) {
    framesTableBody.removeChild(framesTableBody.firstChild);
  }

  frameList.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => showFrame(idx));

    const tdIdx = document.createElement("td");
    tdIdx.textContent = (f.index + 1).toString();

    const tdDate = document.createElement("td");
    tdDate.textContent = f.iso.slice(0, 10);

    const tdMjd = document.createElement("td");
    tdMjd.textContent = f.mjd.toFixed(2);

    const tdWl = document.createElement("td");
    tdWl.textContent = f.wavelength_um ? f.wavelength_um.toFixed(2) : "n/a";

    const tdDet = document.createElement("td");
    tdDet.textContent = `D${f.detector}`;

    const tdExp = document.createElement("td");
    tdExp.textContent = f.n_exposures.toString();

    const tdFlag = document.createElement("td");
    tdFlag.textContent = `${(f.flag_fraction * 100).toFixed(1)}%`;

    const tdVer = document.createElement("td");
    tdVer.textContent = f.version || "l2b";

    tr.appendChild(tdIdx);
    tr.appendChild(tdDate);
    tr.appendChild(tdMjd);
    tr.appendChild(tdWl);
    tr.appendChild(tdDet);
    tr.appendChild(tdExp);
    tr.appendChild(tdFlag);
    tr.appendChild(tdVer);

    framesTableBody.appendChild(tr);
  });
}

function drawSparkline(frameList, activeIdx) {
  if (!sparklineCtx || !sparklineCanvas) return;
  const values = frameList.map((f) => f.center_value).filter((v) => v !== null && v !== undefined);
  if (values.length < 2) return;

  const w = sparklineCanvas.width;
  const h = sparklineCanvas.height;
  sparklineCtx.clearRect(0, 0, w, h);

  const padding = 20;
  const graphW = w - padding * 2;
  const graphH = h - padding * 2;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal > minVal ? maxVal - minVal : 1.0;

  // Draw background grid lines
  sparklineCtx.strokeStyle = "#243049";
  sparklineCtx.lineWidth = 1;
  sparklineCtx.beginPath();
  sparklineCtx.moveTo(padding, padding);
  sparklineCtx.lineTo(padding, h - padding);
  sparklineCtx.lineTo(w - padding, h - padding);
  sparklineCtx.stroke();

  // Plot line
  sparklineCtx.beginPath();
  sparklineCtx.strokeStyle = "#38bdf8";
  sparklineCtx.lineWidth = 2;

  const pts = [];
  frameList.forEach((f, i) => {
    const val = f.center_value !== null && f.center_value !== undefined ? f.center_value : minVal;
    const x = padding + (i / (frameList.length - 1)) * graphW;
    const y = h - padding - ((val - minVal) / valRange) * graphH;
    pts.push({ x, y, idx: i, val });
    if (i === 0) {
      sparklineCtx.moveTo(x, y);
    } else {
      sparklineCtx.lineTo(x, y);
    }
  });
  sparklineCtx.stroke();

  // Draw point dots
  pts.forEach((pt) => {
    sparklineCtx.beginPath();
    const isActive = pt.idx === activeIdx;
    sparklineCtx.arc(pt.x, pt.y, isActive ? 5 : 3, 0, Math.PI * 2);
    sparklineCtx.fillStyle = isActive ? "#f59e0b" : "#38bdf8";
    sparklineCtx.fill();
    if (isActive) {
      sparklineCtx.strokeStyle = "#ffffff";
      sparklineCtx.lineWidth = 1.5;
      sparklineCtx.stroke();

      // Label current value
      sparklineCtx.fillStyle = "#f59e0b";
      sparklineCtx.font = "11px monospace";
      sparklineCtx.fillText(`${pt.val.toFixed(2)} MJy/sr`, pt.x - 20, Math.max(12, pt.y - 8));
    }
  });
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
  stopAudioSonification();
  if (spectrumSection) spectrumSection.classList.add("hidden");
  if (spectrumPin) spectrumPin.classList.add("hidden");
  clickedPixelCoords = null;
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

// Slice 6: Pixel Spectrum Extraction & Audio Sonification
function handleCanvasClick(e) {
  if (!currentSequenceKey || !currentResult || !currentResult.grid) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) return;

  const gridX = Math.round(px);
  const gridY = Math.round(py);
  clickedPixelCoords = { x: gridX, y: gridY };

  // Position visual pin marker on canvas
  if (spectrumPin) {
    spectrumPin.style.left = `${e.clientX - rect.left}px`;
    spectrumPin.style.top = `${e.clientY - rect.top}px`;
    spectrumPin.classList.remove("hidden");
  }

  const radius = parseInt(spectrumRadiusSelect?.value || "1", 10) || 1;
  fetchAndRenderSpectrum(gridX, gridY, radius);
}

async function fetchAndRenderSpectrum(x, y, radius) {
  if (!currentSequenceKey) return;
  if (spectrumCoordsText) {
    spectrumCoordsText.textContent = `Extracting spectrum at pixel (${x}, ${y})...`;
  }
  if (spectrumSection) {
    spectrumSection.classList.remove("hidden");
  }

  try {
    const res = await fetch(`/api/v1/spectrum?key=${currentSequenceKey}&x=${x}&y=${y}&radius_px=${radius}`);
    if (!res.ok) {
      if (res.status === 404) {
        if (spectrumCoordsText) {
          spectrumCoordsText.textContent = `Spectral cube data not retained for sequence (generate sequence locally to retain cube).`;
        }
        return;
      }
      const err = await res.json().catch(() => ({}));
      if (spectrumCoordsText) {
        spectrumCoordsText.textContent = `Error: ${err.error?.message || "Failed to extract spectrum"}`;
      }
      return;
    }

    const data = await res.json();
    currentSpectrumData = data;

    // Compute sky RA/Dec for the extracted coordinate
    const centerRa = parseFloat(raInput.value);
    const centerDec = parseFloat(decInput.value);
    const degPerPx = (currentResult?.grid?.pixscale_arcsec || 3.08) / 3600.0;
    const dxPx = x - canvas.width / 2.0;
    const dyPx = canvas.height / 2.0 - y;
    const decVal = centerDec + dyPx * degPerPx;
    const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
    const raVal = centerRa - (dxPx * degPerPx) / cosDec;

    if (spectrumCoordsText) {
      spectrumCoordsText.textContent = `Pixel (${x}, ${y}) \u2022 RA: ${raVal.toFixed(4)}\u00B0, Dec: ${decVal.toFixed(4)}\u00B0 \u2022 ${data.n_points} spectral points`;
    }

    drawSpectrumPlot(data, -1);
  } catch (err) {
    if (spectrumCoordsText) {
      spectrumCoordsText.textContent = `Network error fetching spectrum: ${err.message}`;
    }
  }
}

function drawSpectrumPlot(spectrumData, activeIndex) {
  if (!spectrumCtx || !spectrumCanvas) return;
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  spectrumCtx.clearRect(0, 0, w, h);

  const points = spectrumData.points || [];
  if (points.length === 0) {
    spectrumCtx.fillStyle = "#64748b";
    spectrumCtx.font = "14px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText("No valid spectral points in extracted aperture.", w / 2, h / 2);
    return;
  }

  const padLeft = 60;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const wlMin = Math.min(0.75, Math.min(...points.map((p) => p.wavelength_um)));
  const wlMax = Math.max(5.0, Math.max(...points.map((p) => p.wavelength_um)));
  const wlRange = wlMax > wlMin ? wlMax - wlMin : 1.0;

  const fluxVals = points.map((p) => p.flux_mjy_sr);
  const minFlux = Math.min(...fluxVals);
  const maxFlux = Math.max(...fluxVals);
  const fluxPad = Math.max(0.1, (maxFlux - minFlux) * 0.15);
  const yMin = minFlux - fluxPad;
  const yMax = maxFlux + fluxPad;
  const yRange = yMax > yMin ? yMax - yMin : 1.0;

  // Background axes
  spectrumCtx.strokeStyle = "#1e293b";
  spectrumCtx.lineWidth = 1;
  spectrumCtx.beginPath();
  spectrumCtx.moveTo(padLeft, padTop);
  spectrumCtx.lineTo(padLeft, h - padBottom);
  spectrumCtx.lineTo(w - padRight, h - padBottom);
  spectrumCtx.stroke();

  // Wavelength ticks: 1.0, 2.0, 3.0, 4.0, 5.0 um
  spectrumCtx.fillStyle = "#64748b";
  spectrumCtx.font = "11px monospace";
  spectrumCtx.textAlign = "center";
  for (let wl = 1.0; wl <= 5.0; wl += 1.0) {
    const x = padLeft + ((wl - wlMin) / wlRange) * plotW;
    if (x >= padLeft && x <= w - padRight) {
      spectrumCtx.beginPath();
      spectrumCtx.strokeStyle = "#1e293b";
      spectrumCtx.moveTo(x, padTop);
      spectrumCtx.lineTo(x, h - padBottom);
      spectrumCtx.stroke();
      spectrumCtx.fillText(`${wl.toFixed(1)} \u03bcm`, x, h - padBottom + 16);
    }
  }

  // Flux Y ticks
  spectrumCtx.textAlign = "right";
  const numYTicks = 4;
  for (let i = 0; i <= numYTicks; i++) {
    const frac = i / numYTicks;
    const fluxVal = yMin + frac * yRange;
    const y = h - padBottom - frac * plotH;
    spectrumCtx.beginPath();
    spectrumCtx.strokeStyle = "#1e293b";
    spectrumCtx.moveTo(padLeft, y);
    spectrumCtx.lineTo(w - padRight, y);
    spectrumCtx.stroke();
    spectrumCtx.fillText(fluxVal.toFixed(2), padLeft - 8, y + 4);
  }

  // Y-axis label
  spectrumCtx.save();
  spectrumCtx.translate(14, h / 2);
  spectrumCtx.rotate(-Math.PI / 2);
  spectrumCtx.textAlign = "center";
  spectrumCtx.fillStyle = "#94a3b8";
  spectrumCtx.font = "11px sans-serif";
  spectrumCtx.fillText("Flux (MJy/sr)", 0, 0);
  spectrumCtx.restore();

  // Detector band markers (D1-D6)
  const detectors = [
    { name: "D1", min: 0.75, max: 1.09, color: "#38bdf8" },
    { name: "D2", min: 1.10, max: 1.62, color: "#818cf8" },
    { name: "D3", min: 1.63, max: 2.41, color: "#a855f7" },
    { name: "D4", min: 2.42, max: 3.82, color: "#ec4899" },
    { name: "D5", min: 3.83, max: 4.41, color: "#f43f5e" },
    { name: "D6", min: 4.42, max: 5.00, color: "#ef4444" },
  ];
  detectors.forEach((det) => {
    const x1 = padLeft + ((det.min - wlMin) / wlRange) * plotW;
    const x2 = padLeft + ((det.max - wlMin) / wlRange) * plotW;
    spectrumCtx.fillStyle = det.color;
    spectrumCtx.globalAlpha = 0.15;
    spectrumCtx.fillRect(x1, padTop, x2 - x1, 14);
    spectrumCtx.globalAlpha = 1.0;
    spectrumCtx.fillStyle = det.color;
    spectrumCtx.font = "9px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText(det.name, (x1 + x2) / 2, padTop + 10);
  });

  // Plot line
  const coords = points.map((p, idx) => {
    const x = padLeft + ((p.wavelength_um - wlMin) / wlRange) * plotW;
    const y = h - padBottom - ((p.flux_mjy_sr - yMin) / yRange) * plotH;
    return { x, y, point: p, idx };
  });

  spectrumCtx.beginPath();
  spectrumCtx.strokeStyle = "#38bdf8";
  spectrumCtx.lineWidth = 2;
  coords.forEach((c, idx) => {
    if (idx === 0) spectrumCtx.moveTo(c.x, c.y);
    else spectrumCtx.lineTo(c.x, c.y);
  });
  spectrumCtx.stroke();

  // Error bars and points
  coords.forEach((c) => {
    const isAct = c.idx === activeIndex;
    const p = c.point;

    if (p.sigma > 0) {
      const yErrTop = h - padBottom - ((p.flux_mjy_sr + p.sigma - yMin) / yRange) * plotH;
      const yErrBot = h - padBottom - ((p.flux_mjy_sr - p.sigma - yMin) / yRange) * plotH;
      spectrumCtx.beginPath();
      spectrumCtx.strokeStyle = isAct ? "#f59e0b" : "#0284c7";
      spectrumCtx.lineWidth = 1;
      spectrumCtx.moveTo(c.x, yErrTop);
      spectrumCtx.lineTo(c.x, yErrBot);
      spectrumCtx.moveTo(c.x - 3, yErrTop);
      spectrumCtx.lineTo(c.x + 3, yErrTop);
      spectrumCtx.moveTo(c.x - 3, yErrBot);
      spectrumCtx.lineTo(c.x + 3, yErrBot);
      spectrumCtx.stroke();
    }

    spectrumCtx.beginPath();
    spectrumCtx.arc(c.x, c.y, isAct ? 6 : 3.5, 0, Math.PI * 2);
    spectrumCtx.fillStyle = isAct ? "#f59e0b" : "#38bdf8";
    spectrumCtx.fill();
    if (isAct) {
      spectrumCtx.strokeStyle = "#ffffff";
      spectrumCtx.lineWidth = 2;
      spectrumCtx.stroke();

      spectrumCtx.fillStyle = "#f59e0b";
      spectrumCtx.font = "bold 11px monospace";
      spectrumCtx.textAlign = "center";
      spectrumCtx.fillText(
        `${p.wavelength_um.toFixed(2)}\u03bcm : ${p.flux_mjy_sr.toFixed(2)} MJy/sr`,
        c.x,
        Math.max(padTop + 24, c.y - 12)
      );
    }
  });

  // Vertical playhead line
  if (activeIndex >= 0 && activeIndex < coords.length) {
    const cur = coords[activeIndex];
    spectrumCtx.beginPath();
    spectrumCtx.strokeStyle = "#f59e0b";
    spectrumCtx.lineWidth = 1.5;
    spectrumCtx.setLineDash([4, 4]);
    spectrumCtx.moveTo(cur.x, padTop);
    spectrumCtx.lineTo(cur.x, h - padBottom);
    spectrumCtx.stroke();
    spectrumCtx.setLineDash([]);
  }
}

function playAudioSonification() {
  if (!currentSpectrumData || !currentSpectrumData.points || currentSpectrumData.points.length === 0) return;
  stopAudioSonification();

  const points = currentSpectrumData.points;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  audioContext = new AudioCtx();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const fluxes = points.map((p) => p.flux_mjy_sr);
  const minFlux = Math.min(...fluxes);
  const maxFlux = Math.max(...fluxes);
  const fluxRange = maxFlux > minFlux ? maxFlux - minFlux : 1.0;

  const totalDuration = Math.max(2.0, Math.min(5.0, points.length * 0.25));
  const timeStep = totalDuration / points.length;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = "sine";
  osc.connect(gain);
  gain.connect(audioContext.destination);

  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);

  points.forEach((pt, i) => {
    const t = now + i * timeStep;
    const norm = (pt.flux_mjy_sr - minFlux) / fluxRange;
    const freq = 220.0 * Math.pow(2.0, norm * 2.0); // 220 Hz to 880 Hz
    if (i === 0) {
      osc.frequency.setValueAtTime(freq, t);
    } else {
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq), t);
    }
  });

  const endTime = now + totalDuration;
  gain.gain.setValueAtTime(0.2, endTime - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.start(now);
  osc.stop(endTime);
  audioNodes = [osc, gain];

  if (playAudioBtn) playAudioBtn.classList.add("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.remove("hidden");

  const startTime = performance.now();
  function animatePlayhead() {
    const elapsed = (performance.now() - startTime) / 1000.0;
    const progress = elapsed / totalDuration;
    if (progress >= 1.0) {
      stopAudioSonification();
      drawSpectrumPlot(currentSpectrumData, -1);
      return;
    }
    const curIdx = Math.min(points.length - 1, Math.floor(progress * points.length));
    drawSpectrumPlot(currentSpectrumData, curIdx);
    audioPlayheadAnimId = requestAnimationFrame(animatePlayhead);
  }
  audioPlayheadAnimId = requestAnimationFrame(animatePlayhead);

  osc.onended = () => {
    stopAudioSonification();
    drawSpectrumPlot(currentSpectrumData, -1);
  };
}

function stopAudioSonification() {
  if (audioPlayheadAnimId) {
    cancelAnimationFrame(audioPlayheadAnimId);
    audioPlayheadAnimId = null;
  }
  if (audioNodes && audioNodes.length > 0) {
    audioNodes.forEach((node) => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch {}
    });
    audioNodes = [];
  }
  if (audioContext) {
    try {
      audioContext.close();
    } catch {}
    audioContext = null;
  }
  if (playAudioBtn) playAudioBtn.classList.remove("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.add("hidden");
}
