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

// Blink A/B, Image Subtraction & NEOSSat State (Slice 7)
let frameA = 0;
let frameB = 1;
let isAbBlinking = false;
let abIntervalId = null;
let isDiffMode = false;
let diffImage = null;
let neossatSources = [];
let wiseSources = []; // AllWISE 2010 catalog sources (Slice 8)

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

// Blink A/B & Difference DOM Elements (Slice 7)
const setFrameABtn = document.getElementById("set-frame-a-btn");
const setFrameBBtn = document.getElementById("set-frame-b-btn");
const blinkAbBtn = document.getElementById("blink-ab-btn");
const diffAbBtn = document.getElementById("diff-ab-btn");
const abStatus = document.getElementById("ab-status");
const toggleNeossat = document.getElementById("toggle-neossat");

// AllWISE & Export DOM Elements (Slice 8)
const toggleWise = document.getElementById("toggle-wise");
const exportGifBtn = document.getElementById("export-gif-btn");
const exportSpectrumCsvBtn = document.getElementById("export-spectrum-csv-btn");
const detChips = document.querySelectorAll(".det-chip");

// Invert, FITS Export & Light Curve Elements (Slice 9)
const toggleInvert = document.getElementById("toggle-invert");
const exportFitsBtn = document.getElementById("export-fits-btn");
const spectrumModeBtn = document.getElementById("spectrum-mode-btn");
let spectrumPlotMode = "sed"; // "sed" or "lightcurve"

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

// Motion Ruler, Candidate Logger & Guided Tour DOM Elements (Slice 10)
const toggleRuler = document.getElementById("toggle-ruler");
const rulerCanvas = document.getElementById("ruler-canvas");
const rulerCtx = rulerCanvas ? rulerCanvas.getContext("2d") : null;
const rulerReadout = document.getElementById("ruler-readout");

const openCandidateBtn = document.getElementById("open-candidate-btn");
const candidateSection = document.getElementById("candidate-section");
const closeCandidateBtn = document.getElementById("close-candidate-btn");
const candidateForm = document.getElementById("candidate-form");
const candName = document.getElementById("cand-name");
const candClass = document.getElementById("cand-class");
const candRa = document.getElementById("cand-ra");
const candDec = document.getElementById("cand-dec");
const candMotion = document.getElementById("cand-motion");
const candPa = document.getElementById("cand-pa");
const candNotes = document.getElementById("cand-notes");
const candidateStatus = document.getElementById("candidate-status");
const candidatesList = document.getElementById("candidates-list");

const startTourBtn = document.getElementById("start-tour-btn");
const tourModal = document.getElementById("tour-modal");
const closeTourBtn = document.getElementById("close-tour-btn");
const tourStepBadge = document.getElementById("tour-step-badge");
const tourTitle = document.getElementById("tour-title");
const tourDescription = document.getElementById("tour-description");
const tourTargetHint = document.getElementById("tour-target-hint");
const tourPrevBtn = document.getElementById("tour-prev-btn");
const tourNextBtn = document.getElementById("tour-next-btn");
const tourLoadBtn = document.getElementById("tour-load-btn");

let rulerStart = null;
let rulerEnd = null;

// Pan & Zoom and Centroid Inspector (Slice 11)
const canvasViewport = document.getElementById("canvas-viewport");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");
const toggleCentroid = document.getElementById("toggle-centroid");
const centroidPin = document.getElementById("centroid-pin");
const centroidReadout = document.getElementById("centroid-readout");
const exportCandidatesBtn = document.getElementById("export-candidates-btn");

let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

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
  if (rulerCanvas) {
    rulerCanvas.addEventListener("click", handleCanvasClick);
    rulerCanvas.addEventListener("mousemove", handleCanvasMouseMove);
  }

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

  // Blink A/B & Difference Controls (Slice 7)
  if (setFrameABtn) setFrameABtn.addEventListener("click", () => setFrameA(currentFrameIndex));
  if (setFrameBBtn) setFrameBBtn.addEventListener("click", () => setFrameB(currentFrameIndex));
  if (blinkAbBtn) blinkAbBtn.addEventListener("click", toggleBlinkAb);
  if (diffAbBtn) diffAbBtn.addEventListener("click", toggleDiffMode);
  if (toggleNeossat) {
    toggleNeossat.addEventListener("change", () => {
      if (toggleNeossat.checked) {
        fetchNeossatSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
      }
    });
  }

  // Detector Matrix & AllWISE Overlay & Exports (Slice 8)
  detChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const detVal = chip.getAttribute("data-det");
      if (detVal) {
        detectorSelect.value = detVal;
        detChips.forEach((c) => c.classList.toggle("active", c === chip));
      }
    });
  });

  detectorSelect.addEventListener("change", () => {
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === detectorSelect.value));
  });

  if (toggleWise) {
    toggleWise.addEventListener("change", () => {
      if (toggleWise.checked) {
        fetchWiseSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
      } else if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    });
  }

  if (exportGifBtn) exportGifBtn.addEventListener("click", exportGif);
  if (exportSpectrumCsvBtn) exportSpectrumCsvBtn.addEventListener("click", exportSpectrumCsv);

  // Invert Mode & FITS Export & Light Curve (Slice 9)
  if (toggleInvert) {
    toggleInvert.addEventListener("change", () => {
      canvas.classList.toggle("canvas-inverted", toggleInvert.checked);
    });
  }
  if (exportFitsBtn) exportFitsBtn.addEventListener("click", exportFits);
  if (spectrumModeBtn) spectrumModeBtn.addEventListener("click", toggleSpectrumMode);

  // Motion Ruler, Candidate Logger & Guided Tour (Slice 10)
  if (toggleRuler) {
    toggleRuler.addEventListener("change", () => {
      if (!toggleRuler.checked) {
        clearRuler();
      }
    });
  }
  if (openCandidateBtn) openCandidateBtn.addEventListener("click", toggleCandidateSection);
  if (closeCandidateBtn) closeCandidateBtn.addEventListener("click", toggleCandidateSection);
  if (candidateForm) candidateForm.addEventListener("submit", handleCandidateSubmit);

  if (startTourBtn) startTourBtn.addEventListener("click", openTour);
  if (closeTourBtn) closeTourBtn.addEventListener("click", closeTour);
  if (tourNextBtn) tourNextBtn.addEventListener("click", handleTourNext);
  if (tourPrevBtn) tourPrevBtn.addEventListener("click", handleTourPrev);
  if (tourLoadBtn) tourLoadBtn.addEventListener("click", loadTourTarget);

  // Pan & Zoom, Centroid & Discovery Export (Slice 11)
  if (zoomInBtn) zoomInBtn.addEventListener("click", () => setZoom(zoomLevel * 1.3));
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => setZoom(zoomLevel / 1.3));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", resetZoom);

  if (toggleCentroid) {
    toggleCentroid.addEventListener("change", () => {
      if (!toggleCentroid.checked) {
        if (centroidPin) centroidPin.classList.add("hidden");
        if (centroidReadout) centroidReadout.classList.add("hidden");
      }
    });
  }

  if (exportCandidatesBtn) {
    exportCandidatesBtn.addEventListener("click", exportCandidatesJson);
  }

  if (canvasContainer) {
    canvasContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom(zoomLevel * factor);
    }, { passive: false });

    canvasContainer.addEventListener("mousedown", (e) => {
      if (zoomLevel > 1.0 && e.button === 0) {
        isDragging = true;
        dragStartX = e.clientX - panX;
        dragStartY = e.clientY - panY;
        canvasContainer.classList.add("is-panning");
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (isDragging) {
        panX = e.clientX - dragStartX;
        panY = e.clientY - dragStartY;
        applyViewportTransform();
      }
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        canvasContainer.classList.remove("is-panning");
      }
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
    if (rulerCanvas) {
      rulerCanvas.width = result.grid.width;
      rulerCanvas.height = result.grid.height;
    }
    updateScaleBar(result.grid.pixscale_arcsec);
    fetchGaiaSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
    if (toggleWise && toggleWise.checked) {
      fetchWiseSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
    }
    if (toggleNeossat && toggleNeossat.checked) {
      fetchNeossatSources(parseFloat(raInput.value), parseFloat(decInput.value), parseFloat(fovInput.value));
    }
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
  frameA = 0;
  frameB = Math.min(1, frames.length - 1);
  updateAbStatus();
  showFrame(0);
  clearRuler();
  resetZoom();
  loadCandidates(currentSequenceKey);

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

  if (toggleRuler && toggleRuler.checked && rulerStart && !rulerEnd) {
    drawRulerPreview(px, py);
  }
}

function showFrame(index) {
  if (index < 0 || index >= loadedImages.length) return;
  currentFrameIndex = index;
  frameSlider.value = index.toString();
  frameCounter.textContent = `${index + 1} / ${loadedImages.length}`;

  if (isDiffMode && diffImage && diffImage.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(diffImage, 0, 0, canvas.width, canvas.height);
    metaDate.textContent = `Diff (B: #${frameB + 1} - A: #${frameA + 1})`;
    metaMjd.textContent = `\u0394t: ${(frames[frameB].mjd - frames[frameA].mjd).toFixed(1)} d`;
    metaWavelength.textContent = `Subtracted Frame`;
    return;
  }

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

  // NEOSSat CADC Asteroid/Satellite Overlay (Slice 7)
  if (toggleNeossat && toggleNeossat.checked && neossatSources.length > 0) {
    neossatSources.forEach((ast) => {
      const pt = worldToCanvasPx(ast.ra, ast.dec);
      if (pt && pt.x >= 0 && pt.x <= gaiaCanvas.width && pt.y >= 0 && pt.y <= gaiaCanvas.height) {
        gaiaCtx.save();
        gaiaCtx.translate(pt.x, pt.y);
        gaiaCtx.rotate(Math.PI / 4);
        gaiaCtx.strokeStyle = "#38bdf8";
        gaiaCtx.lineWidth = 1.8;
        gaiaCtx.strokeRect(-5, -5, 10, 10);
        gaiaCtx.restore();

        gaiaCtx.fillStyle = "#38bdf8";
        gaiaCtx.font = "10px sans-serif";
        gaiaCtx.fillText(ast.target_name || "NEOSSat", pt.x + 8, pt.y - 4);
      }
    });
  }

  // AllWISE 2010 Historical Catalog Overlay (Slice 8)
  if (toggleWise && toggleWise.checked && wiseSources.length > 0) {
    wiseSources.forEach((src) => {
      const pt = worldToCanvasPx(src.ra, src.dec);
      if (pt && pt.x >= -30 && pt.x <= gaiaCanvas.width + 30 && pt.y >= -30 && pt.y <= gaiaCanvas.height + 30) {
        gaiaCtx.beginPath();
        gaiaCtx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        gaiaCtx.strokeStyle = "#f97316"; // Bright Orange for 2010 WISE
        gaiaCtx.lineWidth = 1.6;
        gaiaCtx.stroke();

        gaiaCtx.fillStyle = "#f97316";
        gaiaCtx.font = "10px sans-serif";
        const magLabel = src.w2_mag < 90 ? `W2: ${src.w2_mag} (2010)` : "WISE 2010";
        gaiaCtx.fillText(magLabel, pt.x + 9, pt.y + 3);
      }
    });
  }
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
  frameA = 0;
  frameB = Math.min(1, frames.length - 1);
  updateAbStatus();
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
    case "i":
    case "I":
      if (toggleInvert) {
        toggleInvert.checked = !toggleInvert.checked;
        canvas.classList.toggle("canvas-inverted", toggleInvert.checked);
      }
      break;
    case "f":
    case "F":
      if (!document.fullscreenElement) {
        canvasContainer.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      break;
    case "+":
    case "=":
      e.preventDefault();
      setZoom(zoomLevel * 1.3);
      break;
    case "-":
    case "_":
      e.preventDefault();
      setZoom(zoomLevel / 1.3);
      break;
    case "z":
    case "Z":
    case "0":
      e.preventDefault();
      resetZoom();
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

  if (toggleRuler && toggleRuler.checked) {
    handleRulerClick(px, py, e);
    return;
  }

  const gridX = Math.round(px);
  const gridY = Math.round(py);

  if (toggleCentroid && toggleCentroid.checked) {
    computeSubPixelCentroid(gridX, gridY);
    return;
  }

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

  const isLightCurve = spectrumPlotMode === "lightcurve";
  const points = [...(spectrumData.points || [])];
  if (points.length === 0) {
    spectrumCtx.fillStyle = "#64748b";
    spectrumCtx.font = "14px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText("No valid spectral points in extracted aperture.", w / 2, h / 2);
    return;
  }

  // Sort according to plot mode
  if (isLightCurve) {
    points.sort((a, b) => a.mjd - b.mjd);
  } else {
    points.sort((a, b) => a.wavelength_um - b.wavelength_um);
  }

  const padLeft = 60;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xMin = isLightCurve ? Math.min(...points.map((p) => p.mjd)) : Math.min(0.75, Math.min(...points.map((p) => p.wavelength_um)));
  const xMax = isLightCurve ? Math.max(...points.map((p) => p.mjd)) : Math.max(5.0, Math.max(...points.map((p) => p.wavelength_um)));
  const xRange = xMax > xMin ? xMax - xMin : 1.0;

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

  // X ticks
  spectrumCtx.fillStyle = "#64748b";
  spectrumCtx.font = "11px monospace";
  spectrumCtx.textAlign = "center";

  if (isLightCurve) {
    const numXTicks = 4;
    for (let i = 0; i <= numXTicks; i++) {
      const frac = i / numXTicks;
      const mjdVal = xMin + frac * xRange;
      const x = padLeft + frac * plotW;
      spectrumCtx.beginPath();
      spectrumCtx.strokeStyle = "#1e293b";
      spectrumCtx.moveTo(x, padTop);
      spectrumCtx.lineTo(x, h - padBottom);
      spectrumCtx.stroke();
      spectrumCtx.fillText(`${mjdVal.toFixed(1)}`, x, h - padBottom + 16);
    }
    spectrumCtx.fillStyle = "#38bdf8";
    spectrumCtx.font = "bold 11px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText("Variable Star Light Curve (Flux vs MJD)", w / 2, padTop + 10);
  } else {
    for (let wl = 1.0; wl <= 5.0; wl += 1.0) {
      const x = padLeft + ((wl - xMin) / xRange) * plotW;
      if (x >= padLeft && x <= w - padRight) {
        spectrumCtx.beginPath();
        spectrumCtx.strokeStyle = "#1e293b";
        spectrumCtx.moveTo(x, padTop);
        spectrumCtx.lineTo(x, h - padBottom);
        spectrumCtx.stroke();
        spectrumCtx.fillText(`${wl.toFixed(1)} \u03bcm`, x, h - padBottom + 16);
      }
    }

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
      const x1 = padLeft + ((det.min - xMin) / xRange) * plotW;
      const x2 = padLeft + ((det.max - xMin) / xRange) * plotW;
      spectrumCtx.fillStyle = det.color;
      spectrumCtx.globalAlpha = 0.15;
      spectrumCtx.fillRect(x1, padTop, x2 - x1, 14);
      spectrumCtx.globalAlpha = 1.0;
      spectrumCtx.fillStyle = det.color;
      spectrumCtx.font = "9px sans-serif";
      spectrumCtx.textAlign = "center";
      spectrumCtx.fillText(det.name, (x1 + x2) / 2, padTop + 10);
    });
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

  // Plot line
  const coords = points.map((p, idx) => {
    const xVal = isLightCurve ? p.mjd : p.wavelength_um;
    const x = padLeft + ((xVal - xMin) / xRange) * plotW;
    const y = h - padBottom - ((p.flux_mjy_sr - yMin) / yRange) * plotH;
    return { x, y, point: p, idx };
  });

  spectrumCtx.beginPath();
  spectrumCtx.strokeStyle = isLightCurve ? "#f59e0b" : "#38bdf8";
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
    spectrumCtx.fillStyle = isAct ? "#f59e0b" : (isLightCurve ? "#f59e0b" : "#38bdf8");
    spectrumCtx.fill();
    if (isAct) {
      spectrumCtx.strokeStyle = "#ffffff";
      spectrumCtx.lineWidth = 2;
      spectrumCtx.stroke();

      spectrumCtx.fillStyle = "#f59e0b";
      spectrumCtx.font = "bold 11px monospace";
      spectrumCtx.textAlign = "center";
      const lbl = isLightCurve ? `MJD ${p.mjd.toFixed(1)} : ${p.flux_mjy_sr.toFixed(2)} MJy/sr` : `${p.wavelength_um.toFixed(2)}\u03bcm : ${p.flux_mjy_sr.toFixed(2)} MJy/sr`;
      spectrumCtx.fillText(lbl, c.x, Math.max(padTop + 24, c.y - 12));
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

// Slice 7: Blink A/B & Image Subtraction
function setFrameA(index) {
  if (index < 0 || !frames[index]) return;
  frameA = index;
  updateAbStatus();
  if (isDiffMode) loadAndShowDifference();
}

function setFrameB(index) {
  if (index < 0 || !frames[index]) return;
  frameB = index;
  updateAbStatus();
  if (isDiffMode) loadAndShowDifference();
}

function updateAbStatus() {
  if (!abStatus) return;
  const nameA = frames[frameA] ? `#${frameA + 1} (${frames[frameA].iso.slice(0, 10)})` : "--";
  const nameB = frames[frameB] ? `#${frameB + 1} (${frames[frameB].iso.slice(0, 10)})` : "--";
  abStatus.textContent = `A: ${nameA} \u2022 B: ${nameB}`;
}

function toggleBlinkAb() {
  if (frames.length < 2) return;
  stopPlayback();
  isDiffMode = false;
  if (diffAbBtn) diffAbBtn.classList.remove("active");

  isAbBlinking = !isAbBlinking;
  if (blinkAbBtn) blinkAbBtn.classList.toggle("active", isAbBlinking);

  if (isAbBlinking) {
    let currentAb = frameA;
    showFrame(currentAb);
    const intervalMs = Math.round(1000 / fps);
    abIntervalId = setInterval(() => {
      currentAb = currentAb === frameA ? frameB : frameA;
      showFrame(currentAb);
    }, intervalMs);
  } else {
    if (abIntervalId) {
      clearInterval(abIntervalId);
      abIntervalId = null;
    }
  }
}

async function toggleDiffMode() {
  if (frames.length < 2) return;
  stopPlayback();
  if (isAbBlinking) toggleBlinkAb();

  isDiffMode = !isDiffMode;
  if (diffAbBtn) diffAbBtn.classList.toggle("active", isDiffMode);

  if (isDiffMode) {
    await loadAndShowDifference();
  } else {
    diffImage = null;
    showFrame(currentFrameIndex);
  }
}

async function loadAndShowDifference() {
  if (!currentSequenceKey || frames.length < 2) return;
  const url = `/api/v1/sequences/${currentSequenceKey}/difference.png?frame_a=${frameA}&frame_b=${frameB}`;
  const img = new Image();
  img.onload = () => {
    diffImage = img;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    metaDate.textContent = `Diff (B: #${frameB + 1} - A: #${frameA + 1})`;
    const dt = Math.abs((frames[frameB]?.mjd || 0) - (frames[frameA]?.mjd || 0));
    metaMjd.textContent = `\u0394t: ${dt.toFixed(1)} d`;
    metaWavelength.textContent = `Image Subtraction`;
  };
  img.src = url;
}

async function fetchNeossatSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/neossat?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      neossatSources = data.observations || [];
      if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    }
  } catch {
    neossatSources = [];
  }
}

// Slice 8: AllWISE 2010 Historical Overlay & Sequence Exports
async function fetchWiseSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/wise?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      wiseSources = data.sources || [];
      if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    }
  } catch {
    wiseSources = [];
  }
}

function exportGif() {
  if (!currentSequenceKey || frames.length === 0) {
    alert("Load a sequence first before exporting GIF.");
    return;
  }
  const url = `/api/v1/sequences/${currentSequenceKey}/export.gif?fps=${fps}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `spherex_${currentSequenceKey.slice(0, 8)}_${fps}fps.gif`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportSpectrumCsv() {
  if (!currentSpectrumData || !currentSpectrumData.points || currentSpectrumData.points.length === 0) {
    alert("No extracted spectrum data to export. Click a pixel on the sky view first.");
    return;
  }
  const rows = [["wavelength_um", "flux_mjy_sr", "sigma", "mjd", "detector"]];
  currentSpectrumData.points.forEach((pt) => {
    rows.push([pt.wavelength_um, pt.flux_mjy_sr, pt.sigma, pt.mjd, pt.detector]);
  });
  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spectrum_${currentSequenceKey.slice(0, 8)}_x${currentSpectrumData.x}_y${currentSpectrumData.y}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Slice 9: Spectrum Mode Switch (SED vs Light Curve) & FITS Export
function toggleSpectrumMode() {
  spectrumPlotMode = spectrumPlotMode === "sed" ? "lightcurve" : "sed";
  if (spectrumModeBtn) {
    spectrumModeBtn.textContent = spectrumPlotMode === "sed" ? "View: SED" : "View: Light Curve";
  }
  if (currentSpectrumData) {
    drawSpectrumPlot(currentSpectrumData, -1);
  }
}

function exportFits() {
  if (!currentSequenceKey) {
    alert("Load a sequence first before exporting FITS.");
    return;
  }
  const url = `/api/v1/sequences/${currentSequenceKey}/stack.fits`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `spherex_${currentSequenceKey.slice(0, 8)}_stack.fits`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================================
// Slice 10: Motion Ruler, Candidate Discovery Logger & Guided Challenge Tour
// ============================================================================

function pixelToSky(px, py) {
  if (!currentResult || !currentResult.grid) {
    return { ra: parseFloat(raInput.value), dec: parseFloat(decInput.value) };
  }
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2.0;
  const cy = h / 2.0;
  const dxPx = px - cx;
  const dyPx = cy - py;
  const degPerPx = (currentResult.grid.pixscale_arcsec || 3.08) / 3600.0;
  const centerRa = parseFloat(raInput.value);
  const centerDec = parseFloat(decInput.value);
  const decVal = centerDec + dyPx * degPerPx;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const raVal = centerRa - (dxPx * degPerPx) / cosDec;
  return {
    ra: ((raVal % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, decVal)),
  };
}

function clearRuler() {
  if (rulerCtx && rulerCanvas) {
    rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);
  }
  if (rulerReadout) {
    rulerReadout.classList.add("hidden");
  }
  rulerStart = null;
  rulerEnd = null;
}

function handleRulerClick(px, py, e) {
  if (!rulerStart || (rulerStart && rulerEnd)) {
    // Start new ruler measurement
    rulerStart = { x: px, y: py };
    rulerEnd = null;
    if (rulerReadout) rulerReadout.classList.add("hidden");
    if (rulerCtx && rulerCanvas) {
      rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);
      rulerCtx.beginPath();
      rulerCtx.arc(px, py, 4, 0, Math.PI * 2);
      rulerCtx.fillStyle = "#38bdf8";
      rulerCtx.fill();
    }
  } else {
    // Complete ruler measurement
    rulerEnd = { x: px, y: py };
    finalizeRuler(rulerStart, rulerEnd);
  }
}

function drawRulerPreview(px, py) {
  if (!rulerCtx || !rulerCanvas || !rulerStart) return;
  rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);

  // Dashed guide line
  rulerCtx.beginPath();
  rulerCtx.moveTo(rulerStart.x, rulerStart.y);
  rulerCtx.lineTo(px, py);
  rulerCtx.strokeStyle = "rgba(56, 189, 248, 0.7)";
  rulerCtx.lineWidth = 2;
  rulerCtx.setLineDash([4, 4]);
  rulerCtx.stroke();
  rulerCtx.setLineDash([]);

  // Endpoints
  rulerCtx.beginPath();
  rulerCtx.arc(rulerStart.x, rulerStart.y, 4, 0, Math.PI * 2);
  rulerCtx.arc(px, py, 4, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#38bdf8";
  rulerCtx.fill();
}

function finalizeRuler(p1, p2) {
  if (!rulerCtx || !rulerCanvas) return;
  rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);

  // Draw solid ruler line
  rulerCtx.beginPath();
  rulerCtx.moveTo(p1.x, p1.y);
  rulerCtx.lineTo(p2.x, p2.y);
  rulerCtx.strokeStyle = "#38bdf8";
  rulerCtx.lineWidth = 2.5;
  rulerCtx.shadowColor = "#38bdf8";
  rulerCtx.shadowBlur = 6;
  rulerCtx.stroke();
  rulerCtx.shadowBlur = 0;

  // Circles at endpoints
  rulerCtx.beginPath();
  rulerCtx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
  rulerCtx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#38bdf8";
  rulerCtx.fill();
  rulerCtx.strokeStyle = "#ffffff";
  rulerCtx.lineWidth = 1.5;
  rulerCtx.stroke();

  // Compute metrics
  const sky1 = pixelToSky(p1.x, p1.y);
  const sky2 = pixelToSky(p2.x, p2.y);

  const cosDec = Math.cos((sky1.dec * Math.PI) / 180.0);
  const dRaArcsec = (sky2.ra - sky1.ra) * cosDec * 3600.0;
  const dDecArcsec = (sky2.dec - sky1.dec) * 3600.0;
  const sepArcsec = Math.sqrt(dRaArcsec * dRaArcsec + dDecArcsec * dDecArcsec);

  let paDeg = (Math.atan2(dRaArcsec, dDecArcsec) * 180.0) / Math.PI;
  if (paDeg < 0) paDeg += 360.0;

  let deltaDays = 0;
  if (frames.length >= 2) {
    const mjdA = frames[frameA]?.mjd ?? frames[0]?.mjd;
    const mjdB = frames[frameB]?.mjd ?? frames[frames.length - 1]?.mjd;
    if (mjdA !== undefined && mjdB !== undefined) {
      deltaDays = Math.abs(mjdB - mjdA);
    }
  }

  let motionRate = 0;
  if (deltaDays > 0.01) {
    motionRate = sepArcsec / (deltaDays / 365.25);
  } else {
    motionRate = sepArcsec;
  }

  // Position floating readout
  if (rulerReadout) {
    const midX = (p1.x + p2.x) / 2.0;
    const midY = (p1.y + p2.y) / 2.0;
    rulerReadout.style.left = `${midX + 10}px`;
    rulerReadout.style.top = `${midY - 20}px`;
    rulerReadout.textContent = `Sep: ${sepArcsec.toFixed(2)}" \u2022 PA: ${paDeg.toFixed(1)}\u00B0 \u2022 \u03BC: ${motionRate.toFixed(2)}"/yr`;
    rulerReadout.classList.remove("hidden");
  }

  // Populate candidate form
  if (candRa) candRa.value = sky2.ra.toFixed(6);
  if (candDec) candDec.value = sky2.dec.toFixed(6);
  if (candMotion) candMotion.value = motionRate.toFixed(2);
  if (candPa) candPa.value = paDeg.toFixed(1);
}

// Guided Challenge Tour
const tourSteps = [
  {
    title: "WISE 0855: Sub-stellar Brown Dwarf",
    description: "WISE 0855 is the fourth-closest known system to the Sun and the coldest known sub-stellar brown dwarf (-13 \u00B0C). It emits almost exclusively in the thermal mid-infrared (D5 & D6, 3.8-5.0 \u03BCm) and is completely invisible in optical and near-IR bands!",
    hint: "Notice how WISE 0855 is completely absent in D1/D2, but glows prominently in D5 and D6. Use the Motion Ruler to measure its extreme proper motion of 8.1 arcsec/yr.",
    params: {
      target: "WISE 0855",
      ra: 133.795125,
      dec: -7.245147,
      fov: 8.0,
      detector: 5,
      mode: "frames",
    },
  },
  {
    title: "Barnard's Star: Speed Demon of the Night Sky",
    description: "Barnard's Star in Ophiuchus is a red dwarf (M4V) exhibiting the fastest proper motion of any known star across Earth's sky, racing at an incredible 10.3 arcsec per year!",
    hint: "Use Time-Blink or the Motion Ruler to measure its rapid trajectory across the detector pixels. Check AllWISE 2010 overlay to see its 15-year baseline displacement.",
    params: {
      target: "Barnard's Star",
      ra: 269.452083,
      dec: 4.693333,
      fov: 10.0,
      detector: 2,
      mode: "frames",
    },
  },
  {
    title: "Epsilon Indi B: High Proper Motion Binary Brown Dwarf",
    description: "Epsilon Indi B is a nearby binary brown dwarf system (spectral classes T1 + T6) with extreme proper motion (~4.7 arcsec/yr) located just 12 light-years from Earth.",
    hint: "Observe its distinct infrared SED signature and rapid motion. Switch to detector D3/D4 to detect methane absorption bands in its cool atmosphere.",
    params: {
      target: "Epsilon Indi B",
      ra: 330.840417,
      dec: -56.786111,
      fov: 8.0,
      detector: 3,
      mode: "frames",
    },
  },
  {
    title: "RW Aurigae: Accreting Young Stellar Object",
    description: "RW Aur is a famous young T Tauri variable star system that undergoes dramatic, months-long dimming events caused by tidal disruption and occulting dust streams.",
    hint: "Switch to Stack mode or view the Light Curve in the Spectrum panel to observe photometric variability across SPHEREx epochs.",
    params: {
      target: "RW Aurigae",
      ra: 77.10625,
      dec: 30.401389,
      fov: 10.0,
      detector: 4,
      mode: "frames",
    },
  },
  {
    title: "R Draconis: Mira Pulsating Giant Star",
    description: "R Draconis is an asymptotic giant branch (AGB) pulsating variable star with a 245-day period, undergoing massive periodic infrared surface brightness variations.",
    hint: "Use A/B Difference Imaging (B - A) to see positive/negative residual dipole signatures reflecting its huge pulsation amplitude.",
    params: {
      target: "R Draconis",
      ra: 247.575417,
      dec: 66.704722,
      fov: 12.0,
      detector: 5,
      mode: "frames",
    },
  },
];

let currentTourStep = 0;

function openTour() {
  currentTourStep = 0;
  renderTourStep();
  if (tourModal) tourModal.classList.remove("hidden");
}

function closeTour() {
  if (tourModal) tourModal.classList.add("hidden");
}

function renderTourStep() {
  if (currentTourStep < 0) currentTourStep = 0;
  if (currentTourStep >= tourSteps.length) currentTourStep = tourSteps.length - 1;
  const step = tourSteps[currentTourStep];
  if (tourStepBadge) tourStepBadge.textContent = `Target ${currentTourStep + 1} of ${tourSteps.length}`;
  if (tourTitle) tourTitle.textContent = step.title;
  if (tourDescription) tourDescription.textContent = step.description;
  if (tourTargetHint) tourTargetHint.textContent = step.hint;
  if (tourPrevBtn) tourPrevBtn.disabled = currentTourStep === 0;
  if (tourNextBtn) {
    tourNextBtn.textContent = currentTourStep === tourSteps.length - 1 ? "Finish Tour" : "Next Target \u00BB";
  }
}

function handleTourNext() {
  if (currentTourStep < tourSteps.length - 1) {
    currentTourStep++;
    renderTourStep();
  } else {
    closeTour();
  }
}

function handleTourPrev() {
  if (currentTourStep > 0) {
    currentTourStep--;
    renderTourStep();
  }
}

function loadTourTarget() {
  const step = tourSteps[currentTourStep];
  if (!step) return;
  targetInput.value = step.params.target;
  raInput.value = step.params.ra.toFixed(6);
  decInput.value = step.params.dec.toFixed(6);
  fovInput.value = step.params.fov.toFixed(1);
  detectorSelect.value = step.params.detector.toString();
  modeSelect.value = step.params.mode;

  detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === step.params.detector.toString()));
  closeTour();
  form.dispatchEvent(new Event("submit", { cancelable: true }));
}

// Citizen Science Candidate Logger
function toggleCandidateSection() {
  if (!candidateSection) return;
  candidateSection.classList.toggle("hidden");
  if (!candidateSection.classList.contains("hidden")) {
    if (!candRa.value) candRa.value = raInput.value;
    if (!candDec.value) candDec.value = decInput.value;
    if (currentSequenceKey) loadCandidates(currentSequenceKey);
  }
}

async function loadCandidates(seqKey) {
  if (!candidatesList) return;
  try {
    const url = seqKey ? `/api/v1/candidates?sequence_key=${seqKey}` : "/api/v1/candidates";
    const res = await fetch(url);
    if (!res.ok) return;
    const candidates = await res.json();

    while (candidatesList.firstChild) {
      candidatesList.removeChild(candidatesList.firstChild);
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No candidates logged for this sequence yet. Use the Motion Ruler or click on an object to log one!";
      candidatesList.appendChild(p);
      return;
    }

    candidates.forEach((cand) => {
      const item = document.createElement("div");
      item.className = "candidate-item";

      const leftDiv = document.createElement("div");
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = cand.name;
      leftDiv.appendChild(nameSpan);

      const space1 = document.createTextNode(" ");
      leftDiv.appendChild(space1);

      const badge = document.createElement("span");
      badge.className = "cand-badge";
      badge.textContent = cand.classification;
      leftDiv.appendChild(badge);

      const detailsDiv = document.createElement("div");
      detailsDiv.style.color = "var(--text-muted)";
      detailsDiv.style.fontSize = "0.75rem";
      detailsDiv.style.marginTop = "4px";
      const motionText = cand.motion_rate_arcsec_yr > 0 ? ` \u2022 \u03BC: ${cand.motion_rate_arcsec_yr}"/yr (${cand.position_angle_deg}\u00B0)` : "";
      detailsDiv.textContent = `RA: ${cand.ra.toFixed(4)}\u00B0, Dec: ${cand.dec.toFixed(4)}\u00B0${motionText}`;
      if (cand.notes) {
        const notesP = document.createElement("div");
        notesP.style.fontStyle = "italic";
        notesP.textContent = `"${cand.notes}"`;
        detailsDiv.appendChild(notesP);
      }
      leftDiv.appendChild(detailsDiv);

      item.appendChild(leftDiv);

      const jumpBtn = document.createElement("button");
      jumpBtn.type = "button";
      jumpBtn.className = "btn btn-chip";
      jumpBtn.textContent = "Jump to Coords";
      jumpBtn.addEventListener("click", () => {
        raInput.value = cand.ra.toFixed(6);
        decInput.value = cand.dec.toFixed(6);
        form.dispatchEvent(new Event("submit", { cancelable: true }));
      });
      item.appendChild(jumpBtn);

      candidatesList.appendChild(item);
    });
  } catch (err) {
    console.error("Failed loading candidates", err);
  }
}

async function handleCandidateSubmit(e) {
  e.preventDefault();
  if (!candName.value || !candRa.value || !candDec.value) return;

  const payload = {
    name: candName.value.trim(),
    sequence_key: currentSequenceKey || "manual",
    ra: parseFloat(candRa.value),
    dec: parseFloat(candDec.value),
    classification: candClass.value,
    motion_rate_arcsec_yr: parseFloat(candMotion.value || "0"),
    position_angle_deg: parseFloat(candPa.value || "0"),
    notes: candNotes.value.trim(),
  };

  const saveBtn = document.getElementById("save-candidate-btn");
  if (saveBtn) saveBtn.disabled = true;
  if (candidateStatus) candidateStatus.textContent = "Saving...";

  try {
    const res = await fetch("/api/v1/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to save candidate finding");
    }

    if (candidateStatus) {
      candidateStatus.textContent = "\u2714 Discovery candidate saved!";
      setTimeout(() => {
        if (candidateStatus) candidateStatus.textContent = "";
      }, 4000);
    }
    candName.value = "";
    candNotes.value = "";
    loadCandidates(currentSequenceKey);
  } catch (err) {
    if (candidateStatus) candidateStatus.textContent = `Error: ${err.message}`;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ============================================================================
// Slice 11: Canvas Pan & Zoom, Sub-Pixel Centroid & Discovery Export
// ============================================================================

function applyViewportTransform() {
  if (canvasViewport) {
    canvasViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
  if (zoomResetBtn) {
    zoomResetBtn.textContent = `${zoomLevel.toFixed(1)}x (Reset)`;
  }
  if (canvasContainer) {
    canvasContainer.classList.toggle("is-zoomed", zoomLevel > 1.0);
  }
}

function setZoom(newZoom) {
  const clamped = Math.max(1.0, Math.min(8.0, Math.round(newZoom * 10) / 10));
  zoomLevel = clamped;
  if (zoomLevel <= 1.0) {
    panX = 0;
    panY = 0;
  }
  applyViewportTransform();
}

function resetZoom() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  applyViewportTransform();
}

function computeSubPixelCentroid(cx, cy) {
  if (!ctx || !canvas) return;

  const halfSize = 2; // 5x5 box
  const x0 = Math.max(0, cx - halfSize);
  const y0 = Math.max(0, cy - halfSize);
  const w = Math.min(canvas.width - x0, 5);
  const h = Math.min(canvas.height - y0, 5);

  let imgData;
  try {
    imgData = ctx.getImageData(x0, y0, w, h);
  } catch {
    return;
  }
  const data = imgData.data;

  let minVal = Infinity;
  let maxVal = -Infinity;
  const intensities = [];

  for (let i = 0; i < data.length; i += 4) {
    const val = data[i]; // Red channel in grayscale PNG
    intensities.push(val);
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
  }

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = dy * w + dx;
      const weight = Math.max(0, intensities[idx] - minVal);
      sumW += weight;
      sumWX += weight * (x0 + dx);
      sumWY += weight * (y0 + dy);
    }
  }

  let finalX = cx;
  let finalY = cy;
  if (sumW > 0) {
    finalX = sumWX / sumW;
    finalY = sumWY / sumW;
  }

  const sky = pixelToSky(finalX, finalY);

  if (centroidPin) {
    centroidPin.style.left = `${finalX}px`;
    centroidPin.style.top = `${finalY}px`;
    centroidPin.classList.remove("hidden");
  }

  if (centroidReadout) {
    centroidReadout.style.left = `${finalX + 10}px`;
    centroidReadout.style.top = `${finalY - 20}px`;
    centroidReadout.textContent = `Centroid: (${finalX.toFixed(2)}, ${finalY.toFixed(2)}) \u2022 RA: ${sky.ra.toFixed(6)}\u00B0, Dec: ${sky.dec.toFixed(6)}\u00B0 \u2022 Peak: ${maxVal.toFixed(0)}`;
    centroidReadout.classList.remove("hidden");
  }

  if (candRa) candRa.value = sky.ra.toFixed(6);
  if (candDec) candDec.value = sky.dec.toFixed(6);
}

function exportCandidatesJson() {
  const url = `/api/v1/candidates/export${currentSequenceKey ? `?sequence_key=${currentSequenceKey}` : ""}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = currentSequenceKey ? `murfx_candidates_${currentSequenceKey.slice(0, 8)}.json` : "murfx_all_candidates.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
