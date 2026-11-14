/**
 * MURFX: SPHEREx Wise-Cube & Blink Explorer - Zero-Scroll HUD SPA Engine
 * Specification: docs/FRONTEND_SPEC.md, docs/ARCHITECTURE.md, docs/SECURITY.md
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
let bounceDirection = 1;
let lastResolvedData = null;
let blinkMode = "time";
let gaiaSources = [];
let wiseSources = [];
let neossatSources = [];
let aladinInstance = null;

// Spectrum & Audio Sonification State (Slice 6 & 9)
let currentSpectrumData = null;
let audioContext = null;
let audioNodes = [];
let audioPlayheadAnimId = null;
let clickedPixelCoords = null;
let spectrumPlotMode = "sed"; // "sed" or "lightcurve"

// Blink A/B & Image Subtraction State (Slice 7)
let frameA = 0;
let frameB = 1;
let isAbBlinking = false;
let abIntervalId = null;
let isDiffMode = false;
let diffImage = null;

// Motion Ruler & Tour State (Slice 10)
let rulerStart = null;
let rulerEnd = null;
let currentTourStep = 0;

// Pan & Zoom and Centroid State (Slice 11)
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Toast Timer
let toastTimeoutId = null;

// Target Presets from docs/TEST_TARGETS.md
const PRESETS = {
  wise0855: { name: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, det: 5, mode: "frames" },
  barnard: { name: "Barnard's Star", ra: 269.452083, dec: 4.693333, fov: 10.0, det: 2, mode: "frames" },
  epsind: { name: "Epsilon Indi B", ra: 330.840417, dec: -56.786111, fov: 8.0, det: 3, mode: "frames" },
  rwaur: { name: "RW Aurigae", ra: 77.10625, dec: 30.401389, fov: 10.0, det: 4, mode: "frames" },
  rdra: { name: "R Draconis", ra: 247.575417, dec: 66.704722, fov: 12.0, det: 5, mode: "frames" },
};

// DOM Elements
const appHeader = document.getElementById("app-header");
const appFooter = document.getElementById("app-footer");
const form = document.getElementById("sequence-form");

// Top Nav Tabs
const navTabs = document.querySelectorAll(".nav-tab");
const sections = document.querySelectorAll(".hud-section");
const headerTargetName = document.getElementById("header-target-name");
const launchTourBtn = document.getElementById("launch-tour-btn");

// Inputs
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
const detChips = document.querySelectorAll(".det-chip");
const quickPickChips = document.querySelectorAll(".quick-pick-chip");

// Action Buttons
const submitBtn = document.getElementById("submit-btn");
const shareLinkBtn = document.getElementById("share-link-btn");
const embedSnippetBtn = document.getElementById("embed-snippet-btn");
const embedBox = document.getElementById("embed-box");
const embedCodeText = document.getElementById("embed-code-text");
const closeEmbedBtn = document.getElementById("close-embed-btn");

// Progress & Toast
const progressSection = document.getElementById("progress-section");
const stageText = document.getElementById("stage-text");
const progressPct = document.getElementById("progress-pct");
const progressBarFill = document.getElementById("progress-bar-fill");

const toastContainer = document.getElementById("toast-container");
const toastTitle = document.getElementById("toast-title");
const toastMessage = document.getElementById("toast-message");
const toastIcon = document.getElementById("toast-icon");
const toastDismissBtn = document.getElementById("toast-dismiss-btn");
const warningsText = document.getElementById("warnings-text");
const errorMessage = document.getElementById("error-message");

// Studio Canvases
const canvas = document.getElementById("blink-canvas");
const ctx = canvas.getContext("2d");
const flagsCanvas = document.getElementById("flags-canvas");
const flagsCtx = flagsCanvas ? flagsCanvas.getContext("2d") : null;
const gaiaCanvas = document.getElementById("gaia-canvas");
const gaiaCtx = gaiaCanvas ? gaiaCanvas.getContext("2d") : null;
const rulerCanvas = document.getElementById("ruler-canvas");
const rulerCtx = rulerCanvas ? rulerCanvas.getContext("2d") : null;

const canvasContainer = document.getElementById("canvas-container");
const canvasViewport = document.getElementById("canvas-viewport");
const crosshairLayer = document.getElementById("crosshair-layer");
const compassLayer = document.getElementById("compass-layer");
const scaleLayer = document.getElementById("scale-layer");
const scaleBarLine = document.getElementById("scale-bar-line");
const scaleBarText = document.getElementById("scale-bar-text");
const hoverCoords = document.getElementById("hover-coords");
const metaMjd = document.getElementById("meta-mjd");
const metaDate = document.getElementById("meta-date");
const metaWavelength = document.getElementById("meta-wavelength");

// Dock metadata
const detailMjd = document.getElementById("detail-mjd");
const detailDate = document.getElementById("detail-date");
const detailWavelength = document.getElementById("detail-wavelength");
const detailDetector = document.getElementById("detail-detector");
const detailFlagged = document.getElementById("detail-flagged");
const dataThroughText = document.getElementById("data-through-text");

// Toggles & Zoom
const toggleCrosshair = document.getElementById("toggle-crosshair");
const toggleCompass = document.getElementById("toggle-compass");
const toggleScale = document.getElementById("toggle-scale");
const toggleGaia = document.getElementById("toggle-gaia");
const toggleWise = document.getElementById("toggle-wise");
const toggleNeossat = document.getElementById("toggle-neossat");
const toggleRuler = document.getElementById("toggle-ruler");
const toggleCentroid = document.getElementById("toggle-centroid");
const toggleFlags = document.getElementById("toggle-flags");
const toggleSmooth = document.getElementById("toggle-smooth");
const toggleInvert = document.getElementById("toggle-invert");

const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");

// Markers & Readouts
const spectrumPin = document.getElementById("spectrum-pin");
const centroidPin = document.getElementById("centroid-pin");
const rulerReadout = document.getElementById("ruler-readout");
const centroidReadout = document.getElementById("centroid-readout");

// Playback Deck
const playPauseBtn = document.getElementById("play-pause-btn");
const stepPrevBtn = document.getElementById("step-prev-btn");
const stepNextBtn = document.getElementById("step-next-btn");
const frameSlider = document.getElementById("frame-slider");
const frameCounter = document.getElementById("frame-counter");
const blinkModeBtn = document.getElementById("blink-mode-btn");
const loopBtn = document.getElementById("loop-btn");
const bounceBtn = document.getElementById("bounce-btn");
const speedSelect = document.getElementById("speed-select");

// A/B Toolbar
const setFrameABtn = document.getElementById("set-frame-a-btn");
const setFrameBBtn = document.getElementById("set-frame-b-btn");
const blinkAbBtn = document.getElementById("blink-ab-btn");
const diffAbBtn = document.getElementById("diff-ab-btn");
const exportGifBtn = document.getElementById("export-gif-btn");
const exportFitsBtn = document.getElementById("export-fits-btn");
const abStatus = document.getElementById("ab-status");

// Spectrum & Sonification
const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext("2d") : null;
const spectrumCoordsText = document.getElementById("spectrum-coords-text");
const spectrumRadiusSelect = document.getElementById("spectrum-radius-select");
const spectrumModeBtn = document.getElementById("spectrum-mode-btn");
const playAudioBtn = document.getElementById("play-audio-btn");
const stopAudioBtn = document.getElementById("stop-audio-btn");
const exportSpectrumCsvBtn = document.getElementById("export-spectrum-csv-btn");
const closeSpectrumBtn = document.getElementById("close-spectrum-btn");
const spectrumStats = document.getElementById("spectrum-stats");

// Sparkline
const sparklineCanvas = document.getElementById("sparkline-canvas");
const sparklineCtx = sparklineCanvas ? sparklineCanvas.getContext("2d") : null;

// Aladin
const toggleAladinBtn = document.getElementById("toggle-aladin-btn");

// Citizen Lab
const openCandidateBtn = document.getElementById("open-candidate-btn");
const closeCandidateBtn = document.getElementById("close-candidate-btn");
const candidateForm = document.getElementById("candidate-form");
const candName = document.getElementById("cand-name");
const candClass = document.getElementById("cand-class");
const candRa = document.getElementById("cand-ra");
const candDec = document.getElementById("cand-dec");
const candMotion = document.getElementById("cand-motion");
const candPa = document.getElementById("cand-pa");
const candNotes = document.getElementById("cand-notes");
const saveCandidateBtn = document.getElementById("save-candidate-btn");
const exportCandidatesBtn = document.getElementById("export-candidates-btn");
const candidateStatus = document.getElementById("candidate-status");
const candidatesList = document.getElementById("candidates-list");

const framesTableBody = document.getElementById("frames-table-body");
const truncationNotice = document.getElementById("truncation-notice");

// Guided Tour
const tourModal = document.getElementById("tour-modal");
const closeTourBtn = document.getElementById("close-tour-btn");
const tourStepBadge = document.getElementById("tour-step-badge");
const tourTitle = document.getElementById("tour-title");
const tourDescription = document.getElementById("tour-description");
const tourTargetHint = document.getElementById("tour-target-hint");
const tourPrevBtn = document.getElementById("tour-prev-btn");
const tourNextBtn = document.getElementById("tour-next-btn");
const tourLoadBtn = document.getElementById("tour-load-btn");

// Guided Tour Steps
const tourSteps = [
  {
    title: "WISE 0855: Sub-stellar Brown Dwarf",
    description: "WISE 0855 is the fourth-closest known system to the Sun and the coldest known sub-stellar brown dwarf (-13 \u00B0C). It emits almost exclusively in the thermal mid-infrared (D5 & D6, 3.8-5.0 \u03BCm) and is completely invisible in optical and near-IR bands!",
    hint: "Notice how WISE 0855 is completely absent in D1/D2, but glows prominently in D5 and D6. Use the Motion Ruler to measure its extreme proper motion of 8.1 arcsec/yr.",
    params: { target: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, detector: 5, mode: "frames" },
  },
  {
    title: "Barnard's Star: Speed Demon of the Night Sky",
    description: "Barnard's Star in Ophiuchus is a red dwarf (M4V) exhibiting the fastest proper motion of any known star across Earth's sky, racing at an incredible 10.3 arcsec per year!",
    hint: "Use Time-Blink or the Motion Ruler to measure its rapid trajectory across the detector pixels. Check AllWISE 2010 overlay to see its 15-year baseline displacement.",
    params: { target: "Barnard's Star", ra: 269.452083, dec: 4.693333, fov: 10.0, detector: 2, mode: "frames" },
  },
  {
    title: "Epsilon Indi B: High Proper Motion Binary Brown Dwarf",
    description: "Epsilon Indi B is a nearby binary brown dwarf system (spectral classes T1 + T6) with extreme proper motion (~4.7 arcsec/yr) located just 12 light-years from Earth.",
    hint: "Observe its distinct infrared SED signature and rapid motion. Switch to detector D3/D4 to detect methane absorption bands in its cool atmosphere.",
    params: { target: "Epsilon Indi B", ra: 330.840417, dec: -56.786111, fov: 8.0, detector: 3, mode: "frames" },
  },
  {
    title: "RW Aurigae: Accreting Young Stellar Object",
    description: "RW Aur is a famous young T Tauri variable star system that undergoes dramatic, months-long dimming events caused by tidal disruption and occulting dust streams.",
    hint: "Switch to Stack mode or view the Light Curve in the Spectrum panel to observe photometric variability across SPHEREx epochs.",
    params: { target: "RW Aurigae", ra: 77.10625, dec: 30.401389, fov: 10.0, detector: 4, mode: "frames" },
  },
  {
    title: "R Draconis: Mira Pulsating Giant Star",
    description: "R Draconis is an asymptotic giant branch (AGB) pulsating variable star with a 245-day period, undergoing massive periodic infrared surface brightness variations.",
    hint: "Use A/B Difference Imaging (B - A) to see positive/negative residual dipole signatures reflecting its huge pulsation amplitude.",
    params: { target: "R Draconis", ra: 247.575417, dec: 66.704722, fov: 12.0, detector: 5, mode: "frames" },
  },
];

// Initialization
window.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  fetchServiceMetadata();
  parseUrlParameters();
});

// Tab Navigation
function switchTab(targetTabId) {
  navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === targetTabId);
  });

  sections.forEach((sec) => {
    const isTarget = sec.id === `view-${targetTabId}`;
    sec.classList.toggle("active-section", isTarget);
  });

  if (targetTabId === "aladin") {
    initAladinLite();
  } else if (targetTabId === "lab") {
    if (currentSequenceKey) loadCandidates(currentSequenceKey);
  }
}

function updateHeaderTargetBadge() {
  if (!headerTargetName) return;
  const name = targetInput?.value?.trim() || "WISE 0855";
  const det = detectorSelect?.value || "5";
  headerTargetName.textContent = `${name} (D${det})`;
}

// Toast Notifications
function showToast(title, message, isError = false) {
  if (!toastContainer) return;
  if (toastTitle) toastTitle.textContent = title;
  if (toastMessage) toastMessage.textContent = message;
  if (toastIcon) toastIcon.textContent = isError ? "\u26A0" : "\u2714";

  if (errorMessage && isError) errorMessage.textContent = message;
  if (warningsText && !isError) warningsText.textContent = message;

  toastContainer.classList.remove("hidden");
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toastContainer.classList.add("hidden");
  }, 5000);
}

function hideToast() {
  if (toastContainer) toastContainer.classList.add("hidden");
}

function initEventListeners() {
  // Nav Tab clicks
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");
      if (tabId) switchTab(tabId);
    });
  });

  if (toastDismissBtn) toastDismissBtn.addEventListener("click", hideToast);

  // Quick picks
  quickPickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const targetKey = chip.getAttribute("data-target");
      if (targetKey) loadPreset(targetKey);
    });
  });

  // Detector selection
  detChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const detVal = chip.getAttribute("data-det");
      if (detVal && detectorSelect) {
        detectorSelect.value = detVal;
        detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === detVal));
        updateHeaderTargetBadge();
      }
    });
  });

  if (detectorSelect) {
    detectorSelect.addEventListener("change", () => {
      detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === detectorSelect.value));
      updateHeaderTargetBadge();
    });
  }

  // Resolve
  if (resolveBtn) resolveBtn.addEventListener("click", handleResolveClick);
  if (targetInput) {
    targetInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleResolveClick();
      }
    });
    targetInput.addEventListener("input", updateHeaderTargetBadge);
  }

  // Form submit
  if (form) form.addEventListener("submit", handleFormSubmit);

  // Player controls
  if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlayPause);
  if (stepPrevBtn) stepPrevBtn.addEventListener("click", () => stepFrame(-1));
  if (stepNextBtn) stepNextBtn.addEventListener("click", () => stepFrame(1));

  if (frameSlider) {
    frameSlider.addEventListener("input", () => {
      const idx = parseInt(frameSlider.value, 10);
      if (!Number.isNaN(idx)) showFrame(idx);
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener("change", () => {
      fps = parseInt(speedSelect.value, 10) || 4;
      if (isPlaying) { stopPlayback(); startPlayback(); }
    });
  }

  if (loopBtn) {
    loopBtn.addEventListener("click", () => {
      isLooping = !isLooping;
      loopBtn.classList.toggle("active", isLooping);
    });
  }

  if (bounceBtn) {
    bounceBtn.addEventListener("click", () => {
      isBouncing = !isBouncing;
      bounceBtn.classList.toggle("active", isBouncing);
    });
  }

  // Toggles
  if (toggleCrosshair) {
    toggleCrosshair.addEventListener("change", () => {
      crosshairLayer.classList.toggle("hidden", !toggleCrosshair.checked);
    });
  }
  if (toggleCompass) {
    toggleCompass.addEventListener("change", () => {
      compassLayer.classList.toggle("hidden", !toggleCompass.checked);
    });
  }
  if (toggleScale) {
    toggleScale.addEventListener("change", () => {
      scaleLayer.classList.toggle("hidden", !toggleScale.checked);
    });
  }
  if (toggleFlags && flagsCanvas) {
    toggleFlags.addEventListener("change", () => {
      flagsCanvas.classList.toggle("hidden", !toggleFlags.checked);
      if (toggleFlags.checked) loadAndDrawFlags(currentFrameIndex);
    });
  }
  if (toggleGaia && gaiaCanvas) {
    toggleGaia.addEventListener("change", () => {
      gaiaCanvas.classList.toggle("hidden", !toggleGaia.checked);
      if (toggleGaia.checked && frames[currentFrameIndex]) drawGaiaOverlay(frames[currentFrameIndex]);
    });
  }
  if (toggleWise) {
    toggleWise.addEventListener("change", () => {
      if (toggleWise.checked) {
        fetchWiseSources(Number(raInput?.value) || 0, Number(decInput?.value) || 0, Number(fovInput?.value) || 8);
      } else if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    });
  }
  if (toggleNeossat) {
    toggleNeossat.addEventListener("change", () => {
      if (toggleNeossat.checked) {
        fetchNeossatSources(Number(raInput?.value) || 0, Number(decInput?.value) || 0, Number(fovInput?.value) || 8);
      }
    });
  }
  if (toggleRuler) {
    toggleRuler.addEventListener("change", () => {
      if (!toggleRuler.checked) clearRuler();
    });
  }
  if (toggleCentroid) {
    toggleCentroid.addEventListener("change", () => {
      if (!toggleCentroid.checked) {
        if (centroidPin) centroidPin.classList.add("hidden");
        if (centroidReadout) centroidReadout.classList.add("hidden");
      }
    });
  }
  if (toggleInvert) {
    toggleInvert.addEventListener("change", () => {
      canvas.classList.toggle("canvas-inverted", toggleInvert.checked);
    });
  }
  if (toggleSmooth) {
    toggleSmooth.addEventListener("change", () => {
      canvas.style.imageRendering = toggleSmooth.checked ? "auto" : "pixelated";
    });
  }

  // Zoom & Pan
  if (zoomInBtn) zoomInBtn.addEventListener("click", () => setZoom(zoomLevel * 1.3));
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => setZoom(zoomLevel / 1.3));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", resetZoom);

  if (blinkModeBtn) blinkModeBtn.addEventListener("click", toggleBlinkMode);
  if (toggleAladinBtn) toggleAladinBtn.addEventListener("click", initAladinLite);

  // Canvas Interactions
  canvas.addEventListener("mousemove", handleCanvasMouseMove);
  canvas.addEventListener("mouseleave", () => {
    if (hoverCoords) hoverCoords.textContent = "RA: --, Dec: --";
  });
  canvas.addEventListener("click", handleCanvasClick);
  if (flagsCanvas) flagsCanvas.addEventListener("click", handleCanvasClick);
  if (gaiaCanvas) gaiaCanvas.addEventListener("click", handleCanvasClick);
  if (rulerCanvas) {
    rulerCanvas.addEventListener("click", handleCanvasClick);
    rulerCanvas.addEventListener("mousemove", handleCanvasMouseMove);
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

  // A/B Toolbar
  if (setFrameABtn) setFrameABtn.addEventListener("click", () => setFrameA(currentFrameIndex));
  if (setFrameBBtn) setFrameBBtn.addEventListener("click", () => setFrameB(currentFrameIndex));
  if (blinkAbBtn) blinkAbBtn.addEventListener("click", toggleBlinkAb);
  if (diffAbBtn) diffAbBtn.addEventListener("click", toggleDiffMode);
  if (exportGifBtn) exportGifBtn.addEventListener("click", exportGif);
  if (exportFitsBtn) exportFitsBtn.addEventListener("click", exportFits);

  // Spectrum
  if (spectrumRadiusSelect) {
    spectrumRadiusSelect.addEventListener("change", () => {
      if (clickedPixelCoords) {
        const r = parseInt(spectrumRadiusSelect.value, 10) || 1;
        fetchAndRenderSpectrum(clickedPixelCoords.x, clickedPixelCoords.y, r);
      }
    });
  }
  if (spectrumModeBtn) spectrumModeBtn.addEventListener("click", toggleSpectrumMode);
  if (playAudioBtn) playAudioBtn.addEventListener("click", playAudioSonification);
  if (stopAudioBtn) stopAudioBtn.addEventListener("click", stopAudioSonification);
  if (exportSpectrumCsvBtn) exportSpectrumCsvBtn.addEventListener("click", exportSpectrumCsv);
  if (closeSpectrumBtn) {
    closeSpectrumBtn.addEventListener("click", () => {
      stopAudioSonification();
      if (spectrumPin) spectrumPin.classList.add("hidden");
      clickedPixelCoords = null;
    });
  }

  // Citizen Lab
  if (openCandidateBtn) {
    openCandidateBtn.addEventListener("click", () => {
      switchTab("lab");
      if (candRa && !candRa.value && raInput) candRa.value = Number(raInput.value).toFixed(6);
      if (candDec && !candDec.value && decInput) candDec.value = Number(decInput.value).toFixed(6);
    });
  }
  if (closeCandidateBtn) closeCandidateBtn.addEventListener("click", () => switchTab("studio"));
  if (candidateForm) candidateForm.addEventListener("submit", handleCandidateSubmit);
  if (exportCandidatesBtn) exportCandidatesBtn.addEventListener("click", exportCandidatesJson);

  // Tour
  if (launchTourBtn) launchTourBtn.addEventListener("click", openTour);
  if (closeTourBtn) closeTourBtn.addEventListener("click", closeTour);
  if (tourNextBtn) tourNextBtn.addEventListener("click", handleTourNext);
  if (tourPrevBtn) tourPrevBtn.addEventListener("click", handleTourPrev);
  if (tourLoadBtn) tourLoadBtn.addEventListener("click", loadTourTarget);

  // Share & Embed
  if (shareLinkBtn) shareLinkBtn.addEventListener("click", copyShareLink);
  if (embedSnippetBtn) embedSnippetBtn.addEventListener("click", showEmbedSnippet);
  if (closeEmbedBtn) closeEmbedBtn.addEventListener("click", () => embedBox.classList.add("hidden"));

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

// Coordinate Parser & Resolver
function parseCoordinateString(inputStr) {
  const s = inputStr.trim();
  const decPair = s.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (decPair) {
    const ra = parseFloat(decPair[1]);
    const dec = parseFloat(decPair[2]);
    if (!Number.isNaN(ra) && !Number.isNaN(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }

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

    if (!Number.isNaN(ra) && !Number.isNaN(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }
  return null;
}

async function handleResolveClick() {
  const query = targetInput?.value?.trim() || "";
  if (!query) return;

  const parsed = parseCoordinateString(query);
  if (parsed) {
    if (raInput) raInput.value = Number(parsed.ra).toFixed(6);
    if (decInput) decInput.value = Number(parsed.dec).toFixed(6);
    if (resolveStatus) {
      resolveStatus.textContent = `Parsed coordinates: RA ${Number(parsed.ra).toFixed(4)}\u00B0, Dec ${Number(parsed.dec).toFixed(4)}\u00B0`;
    }
    updateHeaderTargetBadge();
    return;
  }

  if (resolveStatus) resolveStatus.textContent = `Resolving "${query}" in SIMBAD...`;
  try {
    const res = await fetch(`/api/v1/resolve?name=${encodeURIComponent(query)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || "Object name not found");
    }
    const data = await res.json();
    lastResolvedData = data;

    const resolvedName = data.name || data.query || query;
    const rawRa = data.ra_now ?? data.ra;
    const rawDec = data.dec_now ?? data.dec;

    if (rawRa == null || rawDec == null) {
      throw new Error("No celestial coordinates returned");
    }

    const useRa = Number(rawRa);
    const useDec = Number(rawDec);

    if (raInput) raInput.value = useRa.toFixed(6);
    if (decInput) decInput.value = useDec.toFixed(6);

    const sourceLabel = data.source ? ` via ${data.source}` : "";
    const epochLabel = data.target_epoch ? ` (Epoch ${data.target_epoch}${sourceLabel})` : "";
    if (resolveStatus) {
      resolveStatus.textContent = `Resolved: ${resolvedName} (RA: ${useRa.toFixed(4)}\u00B0, Dec: ${useDec.toFixed(4)}\u00B0)${epochLabel}`;
    }
    updateHeaderTargetBadge();
  } catch (err) {
    if (resolveStatus) resolveStatus.textContent = `Resolve error: ${err.message}`;
    showToast("RESOLVE ERROR", err.message, true);
  }
}

async function loadPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;

  if (targetInput) targetInput.value = p.name;
  if (p.ra != null && p.dec != null) {
    if (raInput) raInput.value = Number(p.ra).toFixed(6);
    if (decInput) decInput.value = Number(p.dec).toFixed(6);
    if (resolveStatus) resolveStatus.textContent = `Target: ${p.name}`;
  } else {
    await handleResolveClick();
  }

  if (p.fov && fovInput) fovInput.value = String(p.fov);
  if (p.det && detectorSelect) {
    detectorSelect.value = String(p.det);
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === String(p.det)));
  }
  if (p.mode && modeSelect) modeSelect.value = p.mode;

  updateHeaderTargetBadge();
  if (form) form.requestSubmit();
}

async function fetchServiceMetadata() {
  try {
    const res = await fetch("/api/v1/meta");
    if (res.ok) {
      const meta = await res.json();
      if (meta?.latest_observation_iso && dataThroughText) {
        dataThroughText.textContent = `Data through: ${meta.latest_observation_iso.slice(0, 10)}`;
      }
    }
  } catch {
    // Ignore meta errors
  }
}

// URL Parameter Handling
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("embed") === "1") {
    document.body.classList.add("embed-mode");
    if (appHeader) appHeader.classList.add("hidden");
    if (appFooter) appFooter.classList.add("hidden");
  }

  if (params.has("ra") && raInput) {
    const r = parseFloat(params.get("ra"));
    if (!Number.isNaN(r)) raInput.value = r.toFixed(6);
  }
  if (params.has("dec") && decInput) {
    const d = parseFloat(params.get("dec"));
    if (!Number.isNaN(d)) decInput.value = d.toFixed(6);
  }
  if (params.has("fov") && fovInput) fovInput.value = params.get("fov");
  if (params.has("det") && detectorSelect) {
    detectorSelect.value = params.get("det");
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === params.get("det")));
  }
  if (params.has("mode") && modeSelect) modeSelect.value = params.get("mode");
  if (params.has("bg") && bgSelect) bgSelect.value = params.get("bg");
  if (params.has("mask") && maskSelect) maskSelect.value = params.get("mask");
  if (params.has("stretch") && stretchSelect) stretchSelect.value = params.get("stretch");
  if (params.has("fps") && speedSelect) {
    const f = parseInt(params.get("fps"), 10);
    if (!Number.isNaN(f)) {
      fps = f;
      speedSelect.value = String(fps);
    }
  }

  updateHeaderTargetBadge();

  if (params.has("name")) {
    if (targetInput) targetInput.value = params.get("name");
    handleResolveClick().then(() => {
      if (form) form.requestSubmit();
    });
  } else if (params.has("ra") && params.has("dec")) {
    if (form) form.requestSubmit();
  }
}

function updateUrlState() {
  const params = new URLSearchParams();
  const raVal = Number(raInput?.value) || 0;
  const decVal = Number(decInput?.value) || 0;
  params.set("ra", raVal.toFixed(6));
  params.set("dec", decVal.toFixed(6));
  if (fovInput) params.set("fov", fovInput.value);
  if (detectorSelect) params.set("det", detectorSelect.value);
  if (modeSelect) params.set("mode", modeSelect.value);
  params.set("fps", String(fps));

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function copyShareLink() {
  updateUrlState();
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast("LINK COPIED", "URL copied to clipboard for instant sharing!");
  }).catch(() => {
    prompt("Copy link:", window.location.href);
  });
}

function showEmbedSnippet() {
  updateUrlState();
  const embedUrl = `${window.location.href}&embed=1`;
  const snippet = `<iframe src="${embedUrl}" width="600" height="520" frameborder="0" allowfullscreen></iframe>`;
  if (embedCodeText) embedCodeText.value = snippet;
  if (embedBox) embedBox.classList.remove("hidden");
}

// Request & Pipeline
async function handleFormSubmit(e) {
  e.preventDefault();
  stopPlayback();

  // Smoothly switch view to Studio so user sees the sky canvas immediately
  switchTab("studio");

  const payload = {
    ra: parseFloat(raInput?.value || "133.795125"),
    dec: parseFloat(decInput?.value || "-7.245147"),
    fov_arcmin: parseFloat(fovInput?.value || "8.0"),
    detector: parseInt(detectorSelect?.value || "5", 10),
    mode: modeSelect?.value || "frames",
    background: bgSelect?.value || "median",
    mask_level: maskSelect?.value || "minimal",
    stretch: stretchSelect?.value || "global",
    bin_days: parseFloat(binInput?.value || "30"),
    max_frames: parseInt(maxFramesInput?.value || "60", 10),
  };

  if (submitBtn) submitBtn.disabled = true;
  updateProgress("Submitting request", 5);

  try {
    const res = await fetch("/api/v1/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Server returned error (${res.status})`);
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
    showToast("PIPELINE ERROR", err.message, true);
    hideProgress();
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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

  if (result.warnings && result.warnings.length > 0) {
    showToast("DATA NOTICE", result.warnings.join(" \u2022 "), false);
  }

  if (result.truncated && truncationNotice) {
    truncationNotice.textContent = `Showing ${result.n_frames} of ${result.n_available} exposures`;
    truncationNotice.classList.remove("hidden");
  } else if (truncationNotice) {
    truncationNotice.classList.add("hidden");
  }

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

    const raVal = Number(raInput?.value) || 0;
    const decVal = Number(decInput?.value) || 0;
    const fovVal = Number(fovInput?.value) || 8;
    fetchGaiaSources(raVal, decVal, fovVal);
    if (toggleWise && toggleWise.checked) fetchWiseSources(raVal, decVal, fovVal);
    if (toggleNeossat && toggleNeossat.checked) fetchNeossatSources(raVal, decVal, fovVal);
  }

  renderTableRows(frames);

  if (sparklineCanvas && frames.some((f) => f.center_value != null)) {
    drawSparkline(frames, 0);
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

  if (playPauseBtn) playPauseBtn.disabled = false;
  if (stepPrevBtn) stepPrevBtn.disabled = false;
  if (stepNextBtn) stepNextBtn.disabled = false;
  if (frameSlider) {
    frameSlider.disabled = false;
    frameSlider.max = String(Math.max(0, frames.length - 1));
    frameSlider.value = "0";
  }

  currentFrameIndex = 0;
  frameA = 0;
  frameB = Math.min(1, frames.length - 1);
  updateAbStatus();
  showFrame(0);
  clearRuler();
  resetZoom();
  loadCandidates(currentSequenceKey);

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    startPlayback();
  }
}

function updateScaleBar(pixscaleArcsec) {
  if (!scaleBarLine || !scaleBarText) return;
  const oneArcminPx = 60.0 / (pixscaleArcsec || 3.08);
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

  const sky = pixelToSky(px, py);
  if (hoverCoords) {
    hoverCoords.textContent = `RA: ${sky.ra.toFixed(4)}\u00B0, Dec: ${sky.dec.toFixed(4)}\u00B0`;
  }

  if (toggleRuler && toggleRuler.checked && rulerStart && !rulerEnd) {
    drawRulerPreview(px, py);
  }
}

function showFrame(index) {
  if (index < 0 || index >= loadedImages.length) return;
  currentFrameIndex = index;
  if (frameSlider) frameSlider.value = String(index);
  if (frameCounter) frameCounter.textContent = `${index + 1} / ${loadedImages.length}`;

  const curFrame = frames[index];
  if (curFrame) {
    if (detailMjd) detailMjd.textContent = curFrame.mjd != null ? Number(curFrame.mjd).toFixed(2) : "--";
    if (detailDate) detailDate.textContent = curFrame.iso ? curFrame.iso.slice(0, 10) : "--";
    if (detailWavelength) detailWavelength.textContent = curFrame.wavelength_um != null ? `${Number(curFrame.wavelength_um).toFixed(2)} \u03BCm` : "--";
    if (detailDetector) detailDetector.textContent = `D${curFrame.detector ?? 5}`;
    if (detailFlagged) detailFlagged.textContent = `${((curFrame.flagged_fraction ?? 0) * 100).toFixed(1)}%`;
  }

  if (isDiffMode && diffImage && diffImage.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(diffImage, 0, 0, canvas.width, canvas.height);
    if (metaDate) metaDate.textContent = `Diff (B: #${frameB + 1} - A: #${frameA + 1})`;
    if (metaMjd) metaMjd.textContent = `\u0394t: ${(frames[frameB].mjd - frames[frameA].mjd).toFixed(1)} d`;
    if (metaWavelength) metaWavelength.textContent = `Subtracted Frame`;
    return;
  }

  const img = loadedImages[index];
  if (img && img.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (curFrame) {
      if (metaMjd) metaMjd.textContent = `MJD: ${curFrame.mjd != null ? Number(curFrame.mjd).toFixed(2) : "--"}`;
      if (metaDate) metaDate.textContent = curFrame.iso ? curFrame.iso.slice(0, 10) : "";
      if (metaWavelength) metaWavelength.textContent = curFrame.wavelength_um != null ? `\u03BB: ${Number(curFrame.wavelength_um).toFixed(2)} \u03BCm` : "";
    }
  }

  if (toggleFlags && toggleFlags.checked) loadAndDrawFlags(index);
  if (toggleGaia && toggleGaia.checked && curFrame) drawGaiaOverlay(curFrame);
  if (sparklineCanvas && frames.length > 0) drawSparkline(frames, index);
}

function updateProgress(stage, pct) {
  if (progressSection) progressSection.classList.remove("hidden");
  if (stageText) stageText.textContent = `PROCESSING: ${stage.toUpperCase()}...`;
  if (progressPct) progressPct.textContent = `${pct}%`;
  if (progressBarFill) progressBarFill.style.width = `${pct}%`;
}

function hideProgress() {
  if (progressSection) progressSection.classList.add("hidden");
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
      if (!isLooping) { stopPlayback(); return; }
      next = 0;
    }
    if (next < 0) next = loadedImages.length - 1;
    showFrame(next);
  }
}

function togglePlayPause() {
  if (isPlaying) stopPlayback();
  else startPlayback();
}

function startPlayback() {
  if (loadedImages.length <= 1) return;
  isPlaying = true;
  if (playPauseBtn) playPauseBtn.textContent = "||";
  const intervalMs = Math.round(1000 / fps);
  playIntervalId = setInterval(() => stepFrame(1), intervalMs);
}

function stopPlayback() {
  isPlaying = false;
  if (playPauseBtn) playPauseBtn.textContent = ">";
  if (playIntervalId) clearInterval(playIntervalId);
  playIntervalId = null;
}

// Sparkline
function drawSparkline(frameList, activeIdx) {
  if (!sparklineCtx || !sparklineCanvas) return;
  const w = sparklineCanvas.width;
  const h = sparklineCanvas.height;
  sparklineCtx.clearRect(0, 0, w, h);

  const validVals = frameList
    .map((f) => f.center_value)
    .filter((v) => v != null && !Number.isNaN(v));
  if (validVals.length < 2) return;

  const minVal = Math.min(...validVals);
  const maxVal = Math.max(...validVals);
  const valRange = maxVal > minVal ? maxVal - minVal : 1.0;

  const padding = 8;
  const graphW = w - padding * 2;
  const graphH = h - padding * 2;

  sparklineCtx.beginPath();
  sparklineCtx.strokeStyle = "#00F5D4";
  sparklineCtx.lineWidth = 1.5;

  frameList.forEach((f, i) => {
    const val = f.center_value != null ? f.center_value : minVal;
    const x = padding + (i / Math.max(1, frameList.length - 1)) * graphW;
    const y = h - padding - ((val - minVal) / valRange) * graphH;
    if (i === 0) sparklineCtx.moveTo(x, y);
    else sparklineCtx.lineTo(x, y);
  });
  sparklineCtx.stroke();

  // Highlight active
  const actVal = frameList[activeIdx]?.center_value ?? minVal;
  const actX = padding + (activeIdx / Math.max(1, frameList.length - 1)) * graphW;
  const actY = h - padding - ((actVal - minVal) / valRange) * graphH;
  sparklineCtx.beginPath();
  sparklineCtx.arc(actX, actY, 4, 0, Math.PI * 2);
  sparklineCtx.fillStyle = "#FF2A85";
  sparklineCtx.fill();
}

// Flags Overlay
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

// Table Rows (Safe DOM methods, zero innerHTML)
function renderTableRows(frameList) {
  if (!framesTableBody) return;
  while (framesTableBody.firstChild) {
    framesTableBody.removeChild(framesTableBody.firstChild);
  }

  frameList.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => showFrame(idx));

    const tdIdx = document.createElement("td");
    tdIdx.textContent = String(f.index + 1);

    const tdDate = document.createElement("td");
    tdDate.textContent = f.iso ? f.iso.slice(0, 10) : "--";

    const tdMjd = document.createElement("td");
    tdMjd.textContent = f.mjd != null ? Number(f.mjd).toFixed(2) : "--";

    const tdWl = document.createElement("td");
    tdWl.textContent = f.wavelength_um != null ? Number(f.wavelength_um).toFixed(2) : "n/a";

    const tdDet = document.createElement("td");
    tdDet.textContent = `D${f.detector ?? 1}`;

    const tdExp = document.createElement("td");
    tdExp.textContent = String(f.n_exposures ?? f.n_coadds ?? 1);

    const tdFlag = document.createElement("td");
    tdFlag.textContent = `${((f.flagged_fraction ?? 0) * 100).toFixed(1)}%`;

    const tdVer = document.createElement("td");
    tdVer.textContent = f.version || f.processing_version || "v1.0";

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

// WCS Sky Math
function pixelToSky(px, py) {
  if (!currentResult || !currentResult.grid) {
    return {
      ra: Number(raInput?.value) || 0,
      dec: Number(decInput?.value) || 0,
    };
  }
  const w = canvas.width || 400;
  const h = canvas.height || 400;
  const cx = w / 2.0;
  const cy = h / 2.0;
  const dxPx = px - cx;
  const dyPx = cy - py;
  const degPerPx = (currentResult.grid.pixscale_arcsec || 3.08) / 3600.0;
  const centerRa = Number(raInput?.value) || 0;
  const centerDec = Number(decInput?.value) || 0;
  const decVal = centerDec + dyPx * degPerPx;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const raVal = centerRa - (dxPx * degPerPx) / cosDec;
  return {
    ra: ((raVal % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, decVal)),
  };
}

// Canvas Click Multiplexer
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

  if (spectrumPin) {
    spectrumPin.style.left = `${gridX}px`;
    spectrumPin.style.top = `${gridY}px`;
    spectrumPin.classList.remove("hidden");
  }

  const radius = parseInt(spectrumRadiusSelect?.value || "1", 10) || 1;
  fetchAndRenderSpectrum(gridX, gridY, radius);
}

// Spectrum Extraction
async function fetchAndRenderSpectrum(x, y, radius) {
  if (!currentSequenceKey) return;
  if (spectrumCoordsText) {
    spectrumCoordsText.textContent = `Extracting spectrum at pixel (${x}, ${y})...`;
  }

  try {
    const res = await fetch(`/api/v1/spectrum?key=${currentSequenceKey}&x=${x}&y=${y}&radius_px=${radius}`);
    if (!res.ok) {
      if (res.status === 404 && spectrumCoordsText) {
        spectrumCoordsText.textContent = `Spectral cube data not retained for sequence.`;
      }
      return;
    }

    const data = await res.json();
    currentSpectrumData = data;

    const sky = pixelToSky(x, y);
    if (spectrumCoordsText) {
      spectrumCoordsText.textContent = `Pixel (${x}, ${y}) \u2022 RA: ${sky.ra.toFixed(4)}\u00B0, Dec: ${sky.dec.toFixed(4)}\u00B0 \u2022 ${data.n_points} points`;
    }

    drawSpectrumPlot(data, -1);
  } catch (err) {
    if (spectrumCoordsText) spectrumCoordsText.textContent = `Network error: ${err.message}`;
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
    spectrumCtx.font = "12px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText("No valid spectral points in aperture.", w / 2, h / 2);
    return;
  }

  if (isLightCurve) points.sort((a, b) => a.mjd - b.mjd);
  else points.sort((a, b) => a.wavelength_um - b.wavelength_um);

  const padLeft = 45;
  const padRight = 15;
  const padTop = 15;
  const padBottom = 25;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xMin = isLightCurve ? Math.min(...points.map((p) => p.mjd)) : 0.75;
  const xMax = isLightCurve ? Math.max(...points.map((p) => p.mjd)) : 5.0;
  const xRange = xMax > xMin ? xMax - xMin : 1.0;

  const fluxVals = points.map((p) => p.flux_mjy_sr);
  const minFlux = Math.min(...fluxVals);
  const maxFlux = Math.max(...fluxVals);
  const fluxPad = Math.max(0.1, (maxFlux - minFlux) * 0.15);
  const yMin = minFlux - fluxPad;
  const yMax = maxFlux + fluxPad;
  const yRange = yMax > yMin ? yMax - yMin : 1.0;

  // Axes
  spectrumCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  spectrumCtx.lineWidth = 1;
  spectrumCtx.beginPath();
  spectrumCtx.moveTo(padLeft, padTop);
  spectrumCtx.lineTo(padLeft, h - padBottom);
  spectrumCtx.lineTo(w - padRight, h - padBottom);
  spectrumCtx.stroke();

  // Plot line
  spectrumCtx.beginPath();
  spectrumCtx.strokeStyle = isLightCurve ? "#FF2A85" : "#00F5D4";
  spectrumCtx.lineWidth = 2;

  points.forEach((pt, i) => {
    const xVal = isLightCurve ? pt.mjd : pt.wavelength_um;
    const px = padLeft + ((xVal - xMin) / xRange) * plotW;
    const py = h - padBottom - ((pt.flux_mjy_sr - yMin) / yRange) * plotH;
    if (i === 0) spectrumCtx.moveTo(px, py);
    else spectrumCtx.lineTo(px, py);
  });
  spectrumCtx.stroke();

  // Dots
  points.forEach((pt, i) => {
    const xVal = isLightCurve ? pt.mjd : pt.wavelength_um;
    const px = padLeft + ((xVal - xMin) / xRange) * plotW;
    const py = h - padBottom - ((pt.flux_mjy_sr - yMin) / yRange) * plotH;
    spectrumCtx.beginPath();
    spectrumCtx.arc(px, py, i === activeIndex ? 4 : 2.5, 0, Math.PI * 2);
    spectrumCtx.fillStyle = i === activeIndex ? "#CCFF00" : (isLightCurve ? "#FF2A85" : "#00F5D4");
    spectrumCtx.fill();
  });
}

function toggleSpectrumMode() {
  spectrumPlotMode = spectrumPlotMode === "sed" ? "lightcurve" : "sed";
  if (spectrumModeBtn) {
    spectrumModeBtn.textContent = spectrumPlotMode === "sed" ? "View: SED" : "View: Light Curve";
  }
  if (currentSpectrumData) drawSpectrumPlot(currentSpectrumData, -1);
}

// Web Audio Sonification
function playAudioSonification() {
  if (!currentSpectrumData || !currentSpectrumData.points || currentSpectrumData.points.length === 0) {
    showToast("SONIFICATION", "Click on the sky view to extract a spectrum first!", false);
    return;
  }

  stopAudioSonification();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioContext = new AudioCtx();

  const points = [...currentSpectrumData.points].sort((a, b) => a.wavelength_um - b.wavelength_um);
  const fluxes = points.map((p) => p.flux_mjy_sr);
  const minF = Math.min(...fluxes);
  const maxF = Math.max(...fluxes);
  const fRange = maxF > minF ? maxF - minF : 1.0;

  if (playAudioBtn) playAudioBtn.classList.add("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.remove("hidden");

  const durationPerTone = 0.22;
  const now = audioContext.currentTime;

  points.forEach((pt, idx) => {
    const startTime = now + idx * durationPerTone;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const norm = Math.max(0, Math.min(1, (pt.flux_mjy_sr - minF) / fRange));
    const freq = 220.0 * Math.pow(4.0, norm);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationPerTone);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(startTime);
    osc.stop(startTime + durationPerTone);
    audioNodes.push(osc);
  });

  const totalTime = points.length * durationPerTone;
  const startAnimTime = performance.now();

  function animatePlayhead() {
    const elapsed = (performance.now() - startAnimTime) / 1000.0;
    const currentPtIdx = Math.floor(elapsed / durationPerTone);
    if (currentPtIdx < points.length) {
      drawSpectrumPlot(currentSpectrumData, currentPtIdx);
      audioPlayheadAnimId = requestAnimationFrame(animatePlayhead);
    } else {
      stopAudioSonification();
    }
  }
  audioPlayheadAnimId = requestAnimationFrame(animatePlayhead);
}

function stopAudioSonification() {
  if (audioNodes.length > 0) {
    audioNodes.forEach((osc) => {
      try { osc.stop(); } catch {}
    });
    audioNodes = [];
  }
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
  if (audioPlayheadAnimId) {
    cancelAnimationFrame(audioPlayheadAnimId);
    audioPlayheadAnimId = null;
  }
  if (playAudioBtn) playAudioBtn.classList.remove("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.add("hidden");
  if (currentSpectrumData) drawSpectrumPlot(currentSpectrumData, -1);
}

function exportSpectrumCsv() {
  if (!currentSpectrumData || !currentSpectrumData.points || currentSpectrumData.points.length === 0) {
    showToast("EXPORT CSV", "No spectrum extracted. Click a sky pixel first.", false);
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
  a.download = `spectrum_${currentSequenceKey ? currentSequenceKey.slice(0, 8) : "demo"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Blink A/B & Difference
function setFrameA(idx) {
  frameA = idx;
  updateAbStatus();
}
function setFrameB(idx) {
  frameB = idx;
  updateAbStatus();
}
function updateAbStatus() {
  if (abStatus) abStatus.textContent = `A: #${frameA + 1} \u2022 B: #${frameB + 1}`;
}

function toggleBlinkAb() {
  if (isAbBlinking) {
    isAbBlinking = false;
    if (abIntervalId) clearInterval(abIntervalId);
    abIntervalId = null;
    if (blinkAbBtn) blinkAbBtn.classList.remove("active");
  } else {
    isAbBlinking = true;
    stopPlayback();
    if (blinkAbBtn) blinkAbBtn.classList.add("active");
    let state = false;
    abIntervalId = setInterval(() => {
      state = !state;
      showFrame(state ? frameA : frameB);
    }, Math.round(1000 / fps));
  }
}

async function toggleDiffMode() {
  isDiffMode = !isDiffMode;
  if (diffAbBtn) diffAbBtn.classList.toggle("active", isDiffMode);

  if (isDiffMode) {
    stopPlayback();
    const diffUrl = `/api/v1/sequences/${currentSequenceKey}/difference.png?frame_a=${frameA}&frame_b=${frameB}`;
    diffImage = new Image();
    diffImage.onload = () => showFrame(currentFrameIndex);
    diffImage.src = diffUrl;
  } else {
    diffImage = null;
    showFrame(currentFrameIndex);
  }
}

function exportGif() {
  if (!currentSequenceKey || frames.length === 0) {
    showToast("EXPORT GIF", "Load a sequence first before exporting GIF.", true);
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

function exportFits() {
  if (!currentSequenceKey) {
    showToast("EXPORT FITS", "Load a sequence first before exporting FITS.", true);
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

// Gaia & Catalogs
async function fetchGaiaSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/gaia?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      gaiaSources = data.sources || [];
      if (frames[currentFrameIndex]) drawGaiaOverlay(frames[currentFrameIndex]);
    }
  } catch {
    gaiaSources = [];
  }
}

async function fetchWiseSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/wise?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      wiseSources = data.sources || [];
      if (frames[currentFrameIndex]) drawGaiaOverlay(frames[currentFrameIndex]);
    }
  } catch {
    wiseSources = [];
  }
}

async function fetchNeossatSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/neossat?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      neossatSources = data.sources || [];
      if (frames[currentFrameIndex]) drawGaiaOverlay(frames[currentFrameIndex]);
    }
  } catch {
    neossatSources = [];
  }
}

function drawGaiaOverlay(frame) {
  if (!gaiaCtx || !gaiaCanvas || !currentResult || !currentResult.grid) return;
  gaiaCtx.clearRect(0, 0, gaiaCanvas.width, gaiaCanvas.height);

  const centerRa = Number(raInput?.value) || 0;
  const centerDec = Number(decInput?.value) || 0;
  const degPerPx = (currentResult.grid.pixscale_arcsec || 3.08) / 3600.0;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const cx = gaiaCanvas.width / 2.0;
  const cy = gaiaCanvas.height / 2.0;

  // Draw Gaia
  if (toggleGaia && toggleGaia.checked && gaiaSources.length > 0) {
    gaiaSources.forEach((src) => {
      const dxDeg = (centerRa - src.ra) * cosDec;
      const dyDeg = src.dec - centerDec;
      const x = cx + dxDeg / degPerPx;
      const y = cy - dyDeg / degPerPx;
      if (x >= 0 && x <= gaiaCanvas.width && y >= 0 && y <= gaiaCanvas.height) {
        gaiaCtx.beginPath();
        gaiaCtx.arc(x, y, 4, 0, Math.PI * 2);
        gaiaCtx.strokeStyle = "#00F5D4";
        gaiaCtx.lineWidth = 1.5;
        gaiaCtx.stroke();
      }
    });
  }

  // Draw AllWISE
  if (toggleWise && toggleWise.checked && wiseSources.length > 0) {
    wiseSources.forEach((src) => {
      const dxDeg = (centerRa - src.ra) * cosDec;
      const dyDeg = src.dec - centerDec;
      const x = cx + dxDeg / degPerPx;
      const y = cy - dyDeg / degPerPx;
      if (x >= 0 && x <= gaiaCanvas.width && y >= 0 && y <= gaiaCanvas.height) {
        gaiaCtx.beginPath();
        gaiaCtx.arc(x, y, 5, 0, Math.PI * 2);
        gaiaCtx.strokeStyle = "#F59E0B";
        gaiaCtx.lineWidth = 1.5;
        gaiaCtx.stroke();
      }
    });
  }
}

function toggleBlinkMode() {
  blinkMode = blinkMode === "time" ? "wavelength" : "time";
  if (blinkModeBtn) blinkModeBtn.textContent = blinkMode === "time" ? "Time" : "Wavelength";

  if (blinkMode === "wavelength") {
    frames.sort((a, b) => (a.wavelength_um ?? 0) - (b.wavelength_um ?? 0));
  } else {
    frames.sort((a, b) => (a.mjd ?? 0) - (b.mjd ?? 0));
  }
  showFrame(0);
}

// Aladin Context
function initAladinLite() {
  const aladinDiv = document.getElementById("aladin-lite-div");
  if (!aladinDiv) return;

  const ra = Number(raInput?.value) || 133.795125;
  const dec = Number(decInput?.value) || -7.245147;
  const fovDeg = (Number(fovInput?.value) || 8.0) / 60.0;

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

// Motion Ruler
function clearRuler() {
  if (rulerCtx && rulerCanvas) {
    rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);
  }
  if (rulerReadout) rulerReadout.classList.add("hidden");
  rulerStart = null;
  rulerEnd = null;
}

function handleRulerClick(px, py, e) {
  if (!rulerStart || (rulerStart && rulerEnd)) {
    rulerStart = { x: px, y: py };
    rulerEnd = null;
    if (rulerReadout) rulerReadout.classList.add("hidden");
    if (rulerCtx && rulerCanvas) {
      rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);
      rulerCtx.beginPath();
      rulerCtx.arc(px, py, 4, 0, Math.PI * 2);
      rulerCtx.fillStyle = "#00F5D4";
      rulerCtx.fill();
    }
  } else {
    rulerEnd = { x: px, y: py };
    finalizeRuler(rulerStart, rulerEnd);
  }
}

function drawRulerPreview(px, py) {
  if (!rulerCtx || !rulerCanvas || !rulerStart) return;
  rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);

  rulerCtx.beginPath();
  rulerCtx.moveTo(rulerStart.x, rulerStart.y);
  rulerCtx.lineTo(px, py);
  rulerCtx.strokeStyle = "rgba(0, 245, 212, 0.7)";
  rulerCtx.lineWidth = 2;
  rulerCtx.setLineDash([4, 4]);
  rulerCtx.stroke();
  rulerCtx.setLineDash([]);

  rulerCtx.beginPath();
  rulerCtx.arc(rulerStart.x, rulerStart.y, 4, 0, Math.PI * 2);
  rulerCtx.arc(px, py, 4, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#00F5D4";
  rulerCtx.fill();
}

function finalizeRuler(p1, p2) {
  if (!rulerCtx || !rulerCanvas) return;
  rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);

  rulerCtx.beginPath();
  rulerCtx.moveTo(p1.x, p1.y);
  rulerCtx.lineTo(p2.x, p2.y);
  rulerCtx.strokeStyle = "#00F5D4";
  rulerCtx.lineWidth = 2.5;
  rulerCtx.stroke();

  rulerCtx.beginPath();
  rulerCtx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
  rulerCtx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#00F5D4";
  rulerCtx.fill();

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
    if (mjdA != null && mjdB != null) {
      deltaDays = Math.abs(mjdB - mjdA);
    }
  }

  let motionRate = deltaDays > 0.01 ? sepArcsec / (deltaDays / 365.25) : sepArcsec;

  if (rulerReadout) {
    const midX = (p1.x + p2.x) / 2.0;
    const midY = (p1.y + p2.y) / 2.0;
    rulerReadout.style.left = `${midX + 10}px`;
    rulerReadout.style.top = `${midY - 20}px`;
    rulerReadout.textContent = `Sep: ${sepArcsec.toFixed(2)}" \u2022 PA: ${paDeg.toFixed(1)}\u00B0 \u2022 \u03BC: ${motionRate.toFixed(2)}"/yr`;
    rulerReadout.classList.remove("hidden");
  }

  if (candRa) candRa.value = sky2.ra.toFixed(6);
  if (candDec) candDec.value = sky2.dec.toFixed(6);
  if (candMotion) candMotion.value = motionRate.toFixed(2);
  if (candPa) candPa.value = paDeg.toFixed(1);
}

// Sub-Pixel Centroid
function computeSubPixelCentroid(cx, cy) {
  if (!ctx || !canvas) return;

  const halfSize = 2;
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
    const val = data[i];
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

// Pan & Zoom
function applyViewportTransform() {
  if (canvasViewport) {
    canvasViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
  if (zoomResetBtn) {
    zoomResetBtn.textContent = `${zoomLevel.toFixed(1)}x`;
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

// Guided Tour
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
  if (targetInput) targetInput.value = step.params.target;
  if (raInput) raInput.value = Number(step.params.ra).toFixed(6);
  if (decInput) decInput.value = Number(step.params.dec).toFixed(6);
  if (fovInput) fovInput.value = String(step.params.fov);
  if (detectorSelect) {
    detectorSelect.value = String(step.params.detector);
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === String(step.params.detector)));
  }
  if (modeSelect) modeSelect.value = step.params.mode;

  updateHeaderTargetBadge();
  closeTour();
  if (form) form.requestSubmit();
}

// Candidates
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
      detailsDiv.style.fontSize = "0.7rem";
      detailsDiv.style.marginTop = "2px";
      const motionText = cand.motion_rate_arcsec_yr > 0 ? ` \u2022 \u03BC: ${cand.motion_rate_arcsec_yr}"/yr (${cand.position_angle_deg}\u00B0)` : "";
      const rVal = cand.ra != null ? Number(cand.ra).toFixed(4) : "--";
      const dVal = cand.dec != null ? Number(cand.dec).toFixed(4) : "--";
      detailsDiv.textContent = `RA: ${rVal}\u00B0, Dec: ${dVal}\u00B0${motionText}`;
      leftDiv.appendChild(detailsDiv);

      item.appendChild(leftDiv);

      const jumpBtn = document.createElement("button");
      jumpBtn.type = "button";
      jumpBtn.className = "btn-micro";
      jumpBtn.textContent = "Jump";
      jumpBtn.addEventListener("click", () => {
        if (raInput) raInput.value = Number(cand.ra).toFixed(6);
        if (decInput) decInput.value = Number(cand.dec).toFixed(6);
        updateHeaderTargetBadge();
        if (form) form.requestSubmit();
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
  if (!candName?.value || !candRa?.value || !candDec?.value) return;

  const payload = {
    name: candName.value.trim(),
    sequence_key: currentSequenceKey || "manual",
    ra: parseFloat(candRa.value),
    dec: parseFloat(candDec.value),
    classification: candClass ? candClass.value : "Planet X Candidate",
    motion_rate_arcsec_yr: parseFloat(candMotion?.value || "0"),
    position_angle_deg: parseFloat(candPa?.value || "0"),
    notes: candNotes?.value?.trim() || "",
  };

  if (saveCandidateBtn) saveCandidateBtn.disabled = true;
  if (candidateStatus) candidateStatus.textContent = "Saving...";

  try {
    const res = await fetch("/api/v1/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || "Failed to save candidate finding");
    }

    if (candidateStatus) {
      candidateStatus.textContent = "\u2714 Discovery candidate saved!";
      setTimeout(() => {
        if (candidateStatus) candidateStatus.textContent = "";
      }, 4000);
    }
    if (candName) candName.value = "";
    if (candNotes) candNotes.value = "";
    loadCandidates(currentSequenceKey);
    showToast("DISCOVERY SAVED", "Candidate logged to sequence registry!", false);
  } catch (err) {
    if (candidateStatus) candidateStatus.textContent = `Error: ${err.message}`;
    showToast("SAVE ERROR", err.message, true);
  } finally {
    if (saveCandidateBtn) saveCandidateBtn.disabled = false;
  }
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

// Global Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

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
      if (speedSelect) speedSelect.value = String(fps);
      if (isPlaying) { stopPlayback(); startPlayback(); }
      break;
    case "]":
      e.preventDefault();
      fps = Math.min(15, fps + 1);
      if (speedSelect) speedSelect.value = String(fps);
      if (isPlaying) { stopPlayback(); startPlayback(); }
      break;
    case "l":
    case "L":
      if (loopBtn) loopBtn.click();
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
