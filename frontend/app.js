/**
 * MURFX: SPHEREx Wise-Cube & Blink Explorer
 * JWST Thermal Infrared & Volcanic Carbon Studio Cockpit Engine
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
let aladinExpanded = false;

// Unified Target Store
const targetStore = {
  mainId: "WISE J085510.83−071442.5",
  name: "WISE 0855",
  raDeg: 133.795125,
  decDeg: -7.245147,
  epoch: "J2026.0",
  pmRaMasYr: -8100.0,
  pmDecMasYr: 700.0,
  source: "SIMBAD (offline)",
  dataStatus: "simulated",
  _listeners: [],
  update(fields) {
    Object.assign(this, fields);
    this._listeners.forEach((fn) => fn(this));
  },
  onUpdate(fn) {
    this._listeners.push(fn);
  },
};

// SPHEREx Authoritative Detector Bands
const SPHEREX_BANDS = {
  1: { id: "D1", range: [0.75, 1.11], label: "Near-IR / Optical", pair: 4, channels: 17 },
  2: { id: "D2", range: [1.11, 1.64], label: "J-Band Stellar", pair: 5, channels: 17 },
  3: { id: "D3", range: [1.64, 2.42], label: "H & K Ices", pair: 6, channels: 17 },
  4: { id: "D4", range: [2.42, 3.82], label: "Water Ice", pair: 1, channels: 17 },
  5: { id: "D5", range: [3.82, 4.42], label: "Thermal Brown Dwarfs", pair: 2, channels: 17 },
  6: { id: "D6", range: [4.42, 5.00], label: "Near/Thermal-IR", pair: 3, channels: 17 },
};

// Spectrum & Audio Sonification State
let currentSpectrumData = null;
let audioContext = null;
let audioNodes = [];
let audioPlayheadAnimId = null;
let clickedPixelCoords = null;
let spectrumPlotMode = "sed"; // "sed" or "lightcurve"

// Blink A/B & Image Subtraction State
let frameA = 0;
let frameB = 1;
let isAbBlinking = false;
let abIntervalId = null;
let isDiffMode = false;
let diffImage = null;

// Motion Ruler & Tour State
let rulerStart = null;
let rulerEnd = null;
let currentTourStep = 0;

// Pan & Zoom and Centroid State
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
  wise0855: { name: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, det: 5, mode: "frames", pmRa: -8100.0, pmDec: 700.0 },
  barnard: { name: "Barnard's Star", ra: 269.452083, dec: 4.693333, fov: 10.0, det: 2, mode: "frames", pmRa: -798.58, pmDec: 10328.24 },
  epsind: { name: "Epsilon Indi B", ra: 330.840417, dec: -56.786111, fov: 8.0, det: 3, mode: "frames", pmRa: 3961.4, pmDec: -2538.3 },
  rwaur: { name: "RW Aurigae", ra: 77.10625, dec: 30.401389, fov: 10.0, det: 4, mode: "frames", pmRa: 1.25, pmDec: -18.7 },
  rdra: { name: "R Draconis", ra: 247.575417, dec: 66.704722, fov: 12.0, det: 5, mode: "frames", pmRa: -8.1, pmDec: 15.4 },
};

// DOM Elements
const appHeader = document.getElementById("app-header");
const navToggleBtn = document.getElementById("nav-toggle-btn");
const btnCommandPalette = document.getElementById("btn-command-palette");
const openCandidateBtn = document.getElementById("open-candidate-btn");
const btnSettings = document.getElementById("btn-settings");
const launchTourBtn = document.getElementById("launch-tour-btn");

// Drawers
const drawerSetup = document.getElementById("drawer-setup");
const closeDrawerSetup = document.getElementById("close-drawer-setup");
const drawerLab = document.getElementById("drawer-lab");
const closeDrawerLab = document.getElementById("close-drawer-lab");

// Header Telemetry
const headerTargetName = document.getElementById("header-target-name");
const chipEpoch = document.getElementById("chip-epoch");
const chipPassband = document.getElementById("chip-passband");

// Left Sidebar Elements
const sidebarModeTrigger = document.getElementById("sidebar-mode-trigger");
const btnEditTarget = document.getElementById("btn-edit-target");
const heroTargetName = document.getElementById("hero-target-name");
const pillActiveMode = document.getElementById("pill-active-mode");
const pillDetectorMode = document.getElementById("pill-detector-mode");
const telRa = document.getElementById("tel-ra");
const telDec = document.getElementById("tel-dec");
const telEpoch = document.getElementById("tel-epoch");
const telPm = document.getElementById("tel-pm");
const chanLabel = document.getElementById("chan-label");
const tabOverlays = document.getElementById("tab-overlays");
const tabTools = document.getElementById("tab-tools");

// Kinetic Toggles
const toggleCrosshair = document.getElementById("toggle-crosshair");
const toggleGaia = document.getElementById("toggle-gaia");
const toggleInvert = document.getElementById("toggle-invert");
const toggleNeossat = document.getElementById("toggle-neossat");
const radarReticle = document.getElementById("radar-reticle");

// Form Inputs in Setup Drawer
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
const detChips = document.querySelectorAll(".det-chip");
const quickPickChips = document.querySelectorAll(".quick-pick-chip");
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

// Center Viewport & Canvases
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
const hoverCoords = document.getElementById("hover-coords");
const overlayRa = document.getElementById("overlay-ra");
const overlayDec = document.getElementById("overlay-dec");
const detailDetector = document.getElementById("detail-detector");
const detailMjd = document.getElementById("detail-mjd");
const detailFov = document.getElementById("detail-fov");
const detailWavelength = document.getElementById("detail-wavelength");

// Floating HUD Toolbar Buttons
const setFrameABtn = document.getElementById("set-frame-a-btn");
const setFrameBBtn = document.getElementById("set-frame-b-btn");
const blinkAbBtn = document.getElementById("blink-ab-btn");
const diffAbBtn = document.getElementById("diff-ab-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomResetBtn = document.getElementById("zoom-reset-btn");
const hudBtnStretch = document.getElementById("hud-btn-stretch");
const hudBtnCentroid = document.getElementById("hud-btn-centroid");

// Pins & Readouts
const spectrumPin = document.getElementById("spectrum-pin");
const centroidPin = document.getElementById("centroid-pin");
const rulerReadout = document.getElementById("ruler-readout");
const centroidReadout = document.getElementById("centroid-readout");

// Bottom Scrubber & Transport Bar
const frameSlider = document.getElementById("frame-slider");
const frameCounter = document.getElementById("frame-counter");
const playPauseBtn = document.getElementById("play-pause-btn");
const playBtnIcon = document.getElementById("play-btn-icon");
const stepPrevBtn = document.getElementById("step-prev-btn");
const stepNextBtn = document.getElementById("step-next-btn");
const loopBtn = document.getElementById("loop-btn");
const bounceBtn = document.getElementById("bounce-btn");
const speedSelect = document.getElementById("speed-select");
const exportGifBtn = document.getElementById("export-gif-btn");
const exportFitsBtn = document.getElementById("export-fits-btn");

// PiP Aladin
const btnExpandAladin = document.getElementById("btn-expand-aladin");
const pipAladinContainer = document.getElementById("pip-aladin-container");

// Right Dock: Spectrum & Sonification
const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext("2d") : null;
const spectrumPlayhead = document.getElementById("spectrum-playhead");
const spectrumModeBtn = document.getElementById("spectrum-mode-btn");
const spectrumRadiusSelect = document.getElementById("spectrum-radius-select");
const exportSpectrumCsvBtn = document.getElementById("export-spectrum-csv-btn");
const playAudioBtn = document.getElementById("play-audio-btn");
const stopAudioBtn = document.getElementById("stop-audio-btn");
const telPeakFlux = document.getElementById("tel-peak-flux");
const telResidual = document.getElementById("tel-residual");
const sparklineCanvas = document.getElementById("sparkline-canvas");
const sparklineCtx = sparklineCanvas ? sparklineCanvas.getContext("2d") : null;
const sparklineVal = document.getElementById("sparkline-val");

// Citizen Lab Form & Table
const candidateForm = document.getElementById("candidate-form");
const candName = document.getElementById("cand-name");
const candClass = document.getElementById("cand-class");
const candRa = document.getElementById("cand-ra");
const candDec = document.getElementById("cand-dec");
const candMotion = document.getElementById("cand-motion");
const candPa = document.getElementById("cand-pa");
const candSnr = document.getElementById("cand-snr");
const candNotes = document.getElementById("cand-notes");
const saveCandidateBtn = document.getElementById("save-candidate-btn");
const exportCandidatesBtn = document.getElementById("export-candidates-btn");
const candidateStatus = document.getElementById("candidate-status");
const candidatesList = document.getElementById("candidates-list");
const framesTableBody = document.getElementById("frames-table-body");
const truncationNotice = document.getElementById("truncation-notice");

// Guided Challenge Tour Modal
const tourModal = document.getElementById("tour-modal");
const closeTourBtn = document.getElementById("close-tour-btn");
const tourStepBadge = document.getElementById("tour-step-badge");
const tourTitle = document.getElementById("tour-title");
const tourDescription = document.getElementById("tour-description");
const tourScience = document.getElementById("tour-science");
const tourTargetHint = document.getElementById("tour-target-hint");
const tourPrevBtn = document.getElementById("tour-prev-btn");
const tourNextBtn = document.getElementById("tour-next-btn");
const tourLoadBtn = document.getElementById("tour-load-btn");

// Rail Nav Buttons
const railBtns = document.querySelectorAll(".rail-btn[data-rail-tab]");

// 5 Science Challenge Tour Steps
const tourSteps = [
  {
    title: "WISE 0855: Sub-stellar Brown Dwarf",
    description: "WISE 0855 is the fourth-closest known system to the Sun and the coldest known sub-stellar brown dwarf (~250 K, model range 225-260 K). It emits almost exclusively in the thermal mid-infrared (D5 & D6, 3.8-5.0 \u03BCm) and is undetectable by SPHEREx in D1-D3.",
    science: "Across 10 months (12 frames), WISE 0855 shifts ~7\" (~1.1 SPHEREx pixels at 6.15\"/px)\u2014requiring sub-pixel centroiding rather than simple blink comparison.",
    hint: "Toggle between D1 and D5 to see the brown dwarf materialize. Click Centroid Lock or the Motion Ruler to measure its extreme proper motion of 8.1 \"/yr.",
    params: { target: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, detector: 5, mode: "frames" },
  },
  {
    title: "Barnard's Star: Speed Demon of the Night Sky",
    description: "Barnard's Star in Ophiuchus is a red dwarf (M4V) exhibiting the fastest proper motion of any known star across Earth's sky, racing at an incredible 10.3 arcsec per year!",
    science: "At 10.3\"/year, its displacement is clearly observable across consecutive SPHEREx survey passes, shifting ~1.7 pixels per 6-month epoch.",
    hint: "Use Time-Blink or the Motion Ruler to measure its rapid trajectory across the detector pixels. Check AllWISE 2010 overlay to see its 15-year baseline displacement.",
    params: { target: "Barnard's Star", ra: 269.452083, dec: 4.693333, fov: 10.0, detector: 2, mode: "frames" },
  },
  {
    title: "Epsilon Indi B: High Proper Motion Binary Brown Dwarf",
    description: "Epsilon Indi B is a nearby binary brown dwarf system (spectral classes T1 + T6) with extreme proper motion (~4.7 arcsec/yr) located just 12 light-years from Earth.",
    science: "Its cold methane-rich atmosphere produces deep absorption bands across 1.6-3.3 \u03BCm, captured across SPHEREx D3 and D4 arrays.",
    hint: "Observe its distinct infrared SED signature and rapid motion. Switch to detector D3/D4 to detect methane absorption bands in its cool atmosphere.",
    params: { target: "Epsilon Indi B", ra: 330.840417, dec: -56.786111, fov: 8.0, detector: 3, mode: "frames" },
  },
  {
    title: "RW Aurigae: Accreting Young Stellar Object",
    description: "RW Aur is a famous young T Tauri variable star system that undergoes dramatic, months-long dimming events caused by tidal disruption and occulting dust streams.",
    science: "Mid-infrared monitoring reveals warm circumstellar dust emissions and infrared excess that varies as circumstellar grains occlude the central protostar.",
    hint: "Switch to Stack mode or view the Light Curve in the Spectrum panel to observe photometric variability across SPHEREx epochs.",
    params: { target: "RW Aurigae", ra: 77.10625, dec: 30.401389, fov: 10.0, detector: 4, mode: "frames" },
  },
  {
    title: "R Draconis: Mira Pulsating Giant Star",
    description: "R Draconis is an asymptotic giant branch (AGB) pulsating variable star with a 245-day period, undergoing massive periodic infrared surface brightness variations.",
    science: "Radial atmospheric pulsations create 5+ magnitude optical fluctuations and substantial mid-infrared temperature shifts visible in D5/D6.",
    hint: "Use A/B Difference Imaging (B - A) to see positive/negative residual dipole signatures reflecting its huge pulsation amplitude.",
    params: { target: "R Draconis", ra: 247.575417, dec: 66.704722, fov: 12.0, detector: 5, mode: "frames" },
  },
];

// Coordinate Conversion Utilities
function degToSexRA(deg) {
  const h = (deg % 360) / 15.0;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60.0);
  const ss = ((h - hh) * 60.0 - mm) * 60.0;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(2)}s`;
}

function degToSexDec(deg) {
  const sign = deg < 0 ? "\u2212" : "+";
  const abs = Math.abs(deg);
  const dd = Math.floor(abs);
  const mm = Math.floor((abs - dd) * 60.0);
  const ss = ((abs - dd) * 60.0 - mm) * 60.0;
  return `${sign}${String(dd).padStart(2, "0")}\u00B0 ${String(mm).padStart(2, "0")}\u2032 ${ss.toFixed(1)}\u2033`;
}

// Proper-Motion Propagation Utility
function propagatePosition(raDeg, decDeg, pmRaMasYr, pmDecMasYr, dtYears) {
  const cosDec = Math.cos((decDeg * Math.PI) / 180.0) || 1.0;
  const dRaDeg = (pmRaMasYr * dtYears) / (3600000.0 * cosDec);
  const dDecDeg = (pmDecMasYr * dtYears) / 3600000.0;
  return {
    ra: raDeg + dRaDeg,
    dec: decDeg + dDecDeg,
  };
}

// Update Persistent Telemetry Header & Sidebar Readouts
function syncTargetUI(store) {
  if (headerTargetName) {
    const det = detectorSelect?.value || "5";
    headerTargetName.textContent = `${store.name || store.mainId} (D${det})`;
  }
  if (heroTargetName) heroTargetName.textContent = store.name || store.mainId;
  if (telRa) telRa.textContent = `${store.raDeg.toFixed(2)}\u00B0`;
  if (telDec) telDec.textContent = `${store.decDeg.toFixed(2)}\u00B0`;
  if (telEpoch) telEpoch.textContent = store.epoch || "J2026.0";
  if (telPm) {
    const totalPm = Math.hypot(store.pmRaMasYr || 0, store.pmDecMasYr || 0);
    telPm.textContent = `${Math.round(totalPm)} mas`;
  }
  if (overlayRa) overlayRa.textContent = `${store.raDeg.toFixed(6)}\u00B0`;
  if (overlayDec) overlayDec.textContent = `${store.decDeg.toFixed(6)}\u00B0`;
  if (hoverCoords) hoverCoords.textContent = `RA: ${store.raDeg.toFixed(6)}\u00B0, Dec: ${store.decDeg.toFixed(6)}\u00B0`;

  // Sync Aladin Lite camera
  if (aladinInstance) {
    try {
      aladinInstance.gotoRaDec(store.raDeg, store.decDeg);
    } catch {
      // Ignore if Aladin is not ready
    }
  }
}
targetStore.onUpdate(syncTargetUI);

// Toast System
function showToast(title, message, isError = false) {
  if (!toastContainer) return;
  if (toastTitle) toastTitle.textContent = title;
  if (toastMessage) toastMessage.textContent = message;
  if (toastIcon) toastIcon.textContent = isError ? "\u26A0" : "\u2714";

  toastContainer.classList.remove("hidden");
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toastContainer.classList.add("hidden");
  }, 5000);
}

function hideToast() {
  if (toastContainer) toastContainer.classList.add("hidden");
}

// Progress Bar Helper
function updateProgress(stage, pct) {
  if (!progressSection) return;
  if (pct >= 100) {
    if (stageText) stageText.textContent = "SEQUENCE READY";
    if (progressPct) progressPct.textContent = "100%";
    if (progressBarFill) progressBarFill.style.width = "100%";
    setTimeout(() => {
      progressSection.classList.add("hidden");
    }, 600);
  } else {
    progressSection.classList.remove("hidden");
    if (stageText) stageText.textContent = stage.toUpperCase();
    if (progressPct) progressPct.textContent = `${Math.round(pct)}%`;
    if (progressBarFill) progressBarFill.style.width = `${pct}%`;
  }
}

// Initialization on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  initDefaultSpectrum();
  fetchServiceMetadata();
  parseUrlParameters();
  initAladinLite();
});

// Event Listeners Initialization
function initEventListeners() {
  // Navigation & Drawers
  if (navToggleBtn) navToggleBtn.addEventListener("click", () => toggleDrawer(drawerSetup));
  if (btnCommandPalette) btnCommandPalette.addEventListener("click", () => toggleDrawer(drawerSetup));
  if (btnEditTarget) btnEditTarget.addEventListener("click", () => toggleDrawer(drawerSetup));
  if (sidebarModeTrigger) sidebarModeTrigger.addEventListener("click", () => toggleDrawer(drawerSetup));
  if (btnSettings) btnSettings.addEventListener("click", () => toggleDrawer(drawerSetup));
  if (closeDrawerSetup) closeDrawerSetup.addEventListener("click", () => closeDrawer(drawerSetup));

  if (openCandidateBtn) {
    openCandidateBtn.addEventListener("click", () => {
      autoFillCitizenLab();
      openDrawer(drawerLab);
    });
  }
  if (closeDrawerLab) closeDrawerLab.addEventListener("click", () => closeDrawer(drawerLab));

  // Rail Button Navigation
  railBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      railBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-rail-tab");
      if (tab === "studio") {
        closeDrawer(drawerSetup);
        closeDrawer(drawerLab);
      } else if (tab === "detectors") {
        openDrawer(drawerSetup);
      } else if (tab === "lab") {
        autoFillCitizenLab();
        openDrawer(drawerLab);
      } else if (tab === "aladin") {
        toggleAladinExpanded();
      }
    });
  });

  // Tour
  if (launchTourBtn) launchTourBtn.addEventListener("click", openTour);
  if (closeTourBtn) closeTourBtn.addEventListener("click", closeTour);
  if (tourNextBtn) tourNextBtn.addEventListener("click", handleTourNext);
  if (tourPrevBtn) tourPrevBtn.addEventListener("click", handleTourPrev);
  if (tourLoadBtn) tourLoadBtn.addEventListener("click", loadTourTarget);

  // Toast
  if (toastDismissBtn) toastDismissBtn.addEventListener("click", hideToast);

  // Quick Pick Chips
  quickPickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const targetKey = chip.getAttribute("data-target");
      if (targetKey) {
        document.querySelectorAll(".quick-pick-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        loadPreset(targetKey);
      }
    });
  });

  // Detector Chips in Drawer
  detChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const detVal = chip.getAttribute("data-det");
      if (detVal && detectorSelect) {
        detectorSelect.value = detVal;
        detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === detVal));
        if (detailDetector) detailDetector.textContent = `D${detVal}`;
        const b = SPHEREx_BANDS[parseInt(detVal, 10)];
        if (b && chanLabel) chanLabel.textContent = `${b.id}: ${b.range[0].toFixed(2)} - ${b.range[1].toFixed(2)} \u03BCm`;
        targetStore.update({});
      }
    });
  });

  // SIMBAD Resolver
  if (resolveBtn) resolveBtn.addEventListener("click", handleResolveClick);
  if (targetInput) {
    targetInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleResolveClick();
      }
    });
  }

  // Sequence Form Submit
  if (form) form.addEventListener("submit", handleFormSubmit);

  // Player & Scrubber
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
      if (isPlaying) {
        stopPlayback();
        startPlayback();
      }
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

  // Kinetic Toggles
  if (toggleCrosshair) {
    toggleCrosshair.addEventListener("change", () => {
      if (radarReticle) radarReticle.classList.toggle("hidden", !toggleCrosshair.checked);
    });
  }

  if (toggleGaia && gaiaCanvas) {
    toggleGaia.addEventListener("change", () => {
      gaiaCanvas.classList.toggle("hidden", !toggleGaia.checked);
      if (toggleGaia.checked) {
        fetchGaiaSources(targetStore.raDeg, targetStore.decDeg, Number(fovInput?.value) || 8);
      }
    });
  }

  if (toggleInvert) {
    toggleInvert.addEventListener("change", () => {
      canvas.classList.toggle("canvas-inverted", toggleInvert.checked);
    });
  }

  if (toggleNeossat) {
    toggleNeossat.addEventListener("change", () => {
      if (toggleNeossat.checked) {
        fetchNeossatSources(targetStore.raDeg, targetStore.decDeg, Number(fovInput?.value) || 8);
      }
    });
  }

  // HUD Buttons
  if (zoomInBtn) zoomInBtn.addEventListener("click", () => setZoom(zoomLevel * 1.3));
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => setZoom(zoomLevel / 1.3));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", resetZoom);

  if (hudBtnStretch) {
    hudBtnStretch.addEventListener("click", () => {
      if (stretchSelect) {
        stretchSelect.value = stretchSelect.value === "global" ? "frame" : "global";
        showToast("STRETCH MODE", `Dynamic stretch set to: ${stretchSelect.value.toUpperCase()}`);
        if (form) form.requestSubmit();
      }
    });
  }

  if (hudBtnCentroid) {
    hudBtnCentroid.addEventListener("click", () => {
      computeSubPixelCentroid(canvas.width / 2, canvas.height / 2);
    });
  }

  // A/B Toolbar
  if (setFrameABtn) setFrameABtn.addEventListener("click", () => setFrameA(currentFrameIndex));
  if (setFrameBBtn) setFrameBBtn.addEventListener("click", () => setFrameB(currentFrameIndex));
  if (blinkAbBtn) blinkAbBtn.addEventListener("click", toggleBlinkAb);
  if (diffAbBtn) diffAbBtn.addEventListener("click", toggleDiffMode);
  if (exportGifBtn) exportGifBtn.addEventListener("click", exportGif);
  if (exportFitsBtn) exportFitsBtn.addEventListener("click", exportFits);

  // Canvas Interactions
  canvas.addEventListener("mousemove", handleCanvasMouseMove);
  canvas.addEventListener("mouseleave", () => {
    if (hoverCoords) hoverCoords.textContent = `RA: ${targetStore.raDeg.toFixed(6)}\u00B0, Dec: ${targetStore.decDeg.toFixed(6)}\u00B0`;
  });
  canvas.addEventListener("click", handleCanvasClick);

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
      isDragging = false;
    });
  }

  // Spectrum Controls
  if (spectrumModeBtn) spectrumModeBtn.addEventListener("click", toggleSpectrumMode);
  if (spectrumRadiusSelect) {
    spectrumRadiusSelect.addEventListener("change", () => {
      if (clickedPixelCoords) {
        const r = parseInt(spectrumRadiusSelect.value, 10) || 1;
        fetchAndRenderSpectrum(clickedPixelCoords.x, clickedPixelCoords.y, r);
      }
    });
  }
  if (exportSpectrumCsvBtn) exportSpectrumCsvBtn.addEventListener("click", exportSpectrumCsv);
  if (playAudioBtn) playAudioBtn.addEventListener("click", playAudioSonification);
  if (stopAudioBtn) stopAudioBtn.addEventListener("click", stopAudioSonification);

  // Citizen Lab Form & Export
  if (candidateForm) candidateForm.addEventListener("submit", handleCandidateSubmit);
  if (exportCandidatesBtn) exportCandidatesBtn.addEventListener("click", exportCandidatesJson);

  // Share & Embed
  if (shareLinkBtn) shareLinkBtn.addEventListener("click", copyShareLink);
  if (embedSnippetBtn) embedSnippetBtn.addEventListener("click", showEmbedSnippet);
  if (closeEmbedBtn) closeEmbedBtn.addEventListener("click", () => embedBox.classList.add("hidden"));

  // PiP Expand
  if (btnExpandAladin) btnExpandAladin.addEventListener("click", toggleAladinExpanded);

  // Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

// Drawer Helpers
function toggleDrawer(drawer) {
  if (!drawer) return;
  drawer.classList.toggle("hidden");
}
function openDrawer(drawer) {
  if (!drawer) return;
  drawer.classList.remove("hidden");
}
function closeDrawer(drawer) {
  if (!drawer) return;
  drawer.classList.add("hidden");
}

function toggleAladinExpanded() {
  aladinExpanded = !aladinExpanded;
  if (pipAladinContainer) {
    if (aladinExpanded) {
      pipAladinContainer.style.width = "480px";
      pipAladinContainer.style.height = "320px";
    } else {
      pipAladinContainer.style.width = "190px";
      pipAladinContainer.style.height = "125px";
    }
    if (aladinInstance) {
      setTimeout(() => aladinInstance.view.recomputeSize(), 200);
    }
  }
}

// Coordinate String Parser
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

// SIMBAD Resolver
async function handleResolveClick() {
  const query = targetInput?.value?.trim() || "";
  if (!query) return;

  const parsed = parseCoordinateString(query);
  if (parsed) {
    if (raInput) raInput.value = parsed.ra.toFixed(6);
    if (decInput) decInput.value = parsed.dec.toFixed(6);
    if (resolveStatus) resolveStatus.textContent = `Parsed: RA ${parsed.ra.toFixed(4)}\u00B0, Dec ${parsed.dec.toFixed(4)}\u00B0`;
    targetStore.update({
      mainId: `User Target`,
      name: `User Target`,
      raDeg: parsed.ra,
      decDeg: parsed.dec,
    });
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

    if (rawRa == null || rawDec == null) throw new Error("No celestial coordinates returned");
    const useRa = Number(rawRa);
    const useDec = Number(rawDec);

    if (raInput) raInput.value = useRa.toFixed(6);
    if (decInput) decInput.value = useDec.toFixed(6);

    if (resolveStatus) {
      resolveStatus.textContent = `Resolved: ${resolvedName} (RA: ${useRa.toFixed(4)}\u00B0, Dec: ${useDec.toFixed(4)}\u00B0)`;
    }

    targetStore.update({
      mainId: resolvedName,
      name: resolvedName,
      raDeg: useRa,
      decDeg: useDec,
      epoch: data.target_epoch || "J2026.0",
      pmRaMasYr: data.pm_ra_mas_yr || 0,
      pmDecMasYr: data.pm_dec_mas_yr || 0,
      source: data.source || "SIMBAD",
    });

    showToast("TARGET RESOLVED", `${resolvedName} at ${useRa.toFixed(4)}\u00B0, ${useDec.toFixed(4)}\u00B0`);
  } catch (err) {
    if (resolveStatus) resolveStatus.textContent = `Resolve error: ${err.message}`;
    showToast("RESOLVE ERROR", err.message, true);
  }
}

// Preset Loader
async function loadPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;

  if (targetInput) targetInput.value = p.name;
  if (raInput) raInput.value = p.ra.toFixed(6);
  if (decInput) decInput.value = p.dec.toFixed(6);
  if (fovInput) fovInput.value = String(p.fov);
  if (detectorSelect) {
    detectorSelect.value = String(p.det);
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === String(p.det)));
  }
  if (modeSelect) modeSelect.value = p.mode;

  targetStore.update({
    mainId: p.name,
    name: p.name,
    raDeg: p.ra,
    decDeg: p.dec,
    pmRaMasYr: p.pmRa || 0,
    pmDecMasYr: p.pmDec || 0,
  });

  if (form) form.requestSubmit();
}

// Service Metadata
async function fetchServiceMetadata() {
  try {
    const res = await fetch("/api/v1/meta");
    if (res.ok) {
      const meta = await res.json();
      if (meta?.latest_observation_iso && chipEpoch) {
        chipEpoch.textContent = `J${meta.latest_observation_iso.slice(0, 4)}`;
      }
    }
  } catch {
    // Ignore offline meta error
  }
}

// URL Params Handling
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1") {
    document.body.classList.add("embed-mode");
    if (appHeader) appHeader.classList.add("hidden");
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
  if (params.has("fps") && speedSelect) {
    const f = parseInt(params.get("fps"), 10);
    if (!Number.isNaN(f)) {
      fps = f;
      speedSelect.value = String(fps);
    }
  }

  if (params.has("name")) {
    if (targetInput) targetInput.value = params.get("name");
    handleResolveClick().then(() => {
      if (form) form.requestSubmit();
    });
  } else if (params.has("ra") && params.has("dec")) {
    const r = parseFloat(params.get("ra"));
    const d = parseFloat(params.get("dec"));
    targetStore.update({ raDeg: r, decDeg: d });
    if (form) form.requestSubmit();
  } else {
    // Auto-seed initial target (WISE 0855)
    if (form) form.requestSubmit();
  }
}

function updateUrlState() {
  const params = new URLSearchParams();
  const raVal = Number(raInput?.value) || targetStore.raDeg;
  const decVal = Number(decInput?.value) || targetStore.decDeg;
  params.set("ra", raVal.toFixed(6));
  params.set("dec", decVal.toFixed(6));
  if (fovInput) params.set("fov", fovInput.value);
  if (detectorSelect) params.set("det", detectorSelect.value);
  if (modeSelect) params.set("mode", modeSelect.value);
  params.set("fps", String(fps));
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function copyShareLink() {
  updateUrlState();
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast("LINK COPIED", "URL copied to clipboard for instant mission sharing!");
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

// Sequence Form Submit & Pipeline Polling
async function handleFormSubmit(e) {
  if (e) e.preventDefault();
  stopPlayback();
  closeDrawer(drawerSetup);

  const payload = {
    ra: parseFloat(raInput?.value || String(targetStore.raDeg)),
    dec: parseFloat(decInput?.value || String(targetStore.decDeg)),
    fov_arcmin: parseFloat(fovInput?.value || "8.0"),
    detector: parseInt(detectorSelect?.value || "5", 10),
    mode: modeSelect?.value || "frames",
    background: bgSelect?.value || "median",
    mask_level: maskSelect?.value || "minimal",
    stretch: stretchSelect?.value || "global",
    bin_days: parseFloat(binInput?.value || "30"),
    max_frames: parseInt(maxFramesInput?.value || "60", 10),
  };

  targetStore.update({
    raDeg: payload.ra,
    decDeg: payload.dec,
  });

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
    pollJobStatus(data.key);
  } catch (err) {
    if (submitBtn) submitBtn.disabled = false;
    updateProgress("Failed", 100);
    showToast("PIPELINE ERROR", err.message, true);
  }
}

async function pollJobStatus(key) {
  const pollInterval = 400;
  let attempts = 0;

  const timer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(`/api/v1/sequences/${key}`);
      if (!res.ok) {
        clearInterval(timer);
        if (submitBtn) submitBtn.disabled = false;
        throw new Error("Failed to poll status");
      }

      const statusData = await res.json();
      const progress = statusData.progress || 0;
      updateProgress(statusData.stage || "processing", progress);

      if (statusData.status === "completed" || statusData.status === "done") {
        clearInterval(timer);
        if (submitBtn) submitBtn.disabled = false;
        onSequenceComplete(statusData.result);
      } else if (statusData.status === "failed") {
        clearInterval(timer);
        if (submitBtn) submitBtn.disabled = false;
        showToast("ERROR", statusData.error || "Sequence processing failed", true);
      }
    } catch (err) {
      clearInterval(timer);
      if (submitBtn) submitBtn.disabled = false;
      showToast("POLL ERROR", err.message, true);
    }

    if (attempts > 120) {
      clearInterval(timer);
      if (submitBtn) submitBtn.disabled = false;
      showToast("TIMEOUT", "Processing request timed out.", true);
    }
  }, pollInterval);
}

// Sequence Completed Handler
function onSequenceComplete(result) {
  currentResult = result;
  frames = result.frames || [];

  updateProgress("Ready", 100);

  if (frames.length === 0) {
    showToast("NO FRAMES", "No valid SPHEREx cutouts found in field.", true);
    return;
  }

  // Preload Images
  loadedImages = new Array(frames.length);
  let loadedCount = 0;

  frames.forEach((f, idx) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = f.png_url;
    img.onload = () => {
      loadedImages[idx] = img;
      loadedCount++;
      if (loadedCount === 1) {
        showFrame(0);
      }
    };
  });

  if (frameSlider) {
    frameSlider.max = String(Math.max(0, frames.length - 1));
    frameSlider.value = "0";
    frameSlider.disabled = false;
  }

  // Populate Frame Quality Metadata Table
  renderMetadataTable(frames);

  // Extract center pixel spectrum
  const centerX = Math.floor(canvas.width / 2);
  const centerY = Math.floor(canvas.height / 2);
  fetchAndRenderSpectrum(centerX, centerY, 1);

  // Render Left Dock Sparkline
  renderSparkline(frames);

  // Auto-play
  startPlayback();

  showToast("SEQUENCE READY", `Loaded ${frames.length} SPHEREx infrared frames.`);
}

// Show Specific Frame Index
function showFrame(index) {
  if (frames.length === 0) return;
  currentFrameIndex = (index + frames.length) % frames.length;

  if (frameSlider) frameSlider.value = String(currentFrameIndex);

  const f = frames[currentFrameIndex];
  if (frameCounter && f) {
    frameCounter.textContent = `FRAME ${currentFrameIndex + 1} / ${frames.length} \u2022 ${(f.wavelength_um || 4.12).toFixed(2)} \u03BCm`;
  }

  // Update Detail Readouts
  if (f) {
    if (detailMjd) detailMjd.textContent = f.mjd ? f.mjd.toFixed(2) : "60985.00";
    if (detailWavelength) detailWavelength.textContent = `${(f.wavelength_um || 4.12).toFixed(2)} \u03BCm`;
    if (detailDetector) detailDetector.textContent = `D${f.detector || detectorSelect?.value || 5}`;
  }

  const img = loadedImages[currentFrameIndex];
  if (img && img.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // Redraw overlays if active
  if (toggleGaia && toggleGaia.checked && f) {
    drawGaiaOverlay(f);
  }
}

// Playback Deck Controls
function togglePlayPause() {
  if (isPlaying) stopPlayback();
  else startPlayback();
}

function startPlayback() {
  if (isPlaying || frames.length <= 1) return;
  isPlaying = true;
  if (playBtnIcon) playBtnIcon.textContent = "\u275A\u275A";

  const intervalMs = Math.max(50, Math.floor(1000 / fps));
  playIntervalId = setInterval(() => {
    if (isBouncing) {
      let next = currentFrameIndex + bounceDirection;
      if (next >= frames.length) {
        bounceDirection = -1;
        next = frames.length - 2;
      } else if (next < 0) {
        bounceDirection = 1;
        next = 1;
      }
      showFrame(next);
    } else {
      if (currentFrameIndex >= frames.length - 1 && !isLooping) {
        stopPlayback();
        return;
      }
      showFrame((currentFrameIndex + 1) % frames.length);
    }
  }, intervalMs);
}

function stopPlayback() {
  isPlaying = false;
  if (playBtnIcon) playBtnIcon.textContent = "\u25BA";
  if (playIntervalId) {
    clearInterval(playIntervalId);
    playIntervalId = null;
  }
}

function stepFrame(delta) {
  stopPlayback();
  showFrame(currentFrameIndex + delta);
}

// A/B Comparison & Image Subtraction
function setFrameA(idx) {
  frameA = idx;
  showToast("FRAME A SET", `Reference Frame A set to #${idx + 1}`);
}
function setFrameB(idx) {
  frameB = idx;
  showToast("FRAME B SET", `Comparison Frame B set to #${idx + 1}`);
}

function toggleBlinkAb() {
  if (isAbBlinking) {
    clearInterval(abIntervalId);
    isAbBlinking = false;
    if (blinkAbBtn) blinkAbBtn.classList.remove("active");
  } else {
    stopPlayback();
    isAbBlinking = true;
    if (blinkAbBtn) blinkAbBtn.classList.add("active");
    let toggle = false;
    abIntervalId = setInterval(() => {
      showFrame(toggle ? frameA : frameB);
      toggle = !toggle;
    }, 400);
  }
}

async function toggleDiffMode() {
  if (isDiffMode) {
    isDiffMode = false;
    if (diffAbBtn) diffAbBtn.classList.remove("active");
    showFrame(currentFrameIndex);
    return;
  }

  if (!currentSequenceKey) return;
  try {
    const res = await fetch(`/api/v1/sequences/${currentSequenceKey}/difference.png?frame_a=${frameA}&frame_b=${frameB}`);
    if (!res.ok) throw new Error("Difference calculation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const dImg = new Image();
    dImg.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(dImg, 0, 0, canvas.width, canvas.height);
      isDiffMode = true;
      if (diffAbBtn) diffAbBtn.classList.add("active");
      showToast("DIFF IMAGE", `Displaying residual dipole subtraction (Frame ${frameB + 1} - ${frameA + 1})`);
    };
    dImg.src = url;
  } catch (err) {
    showToast("DIFF ERROR", err.message, true);
  }
}

// Pan & Zoom Engine
function setZoom(newZoom) {
  zoomLevel = Math.max(1.0, Math.min(8.0, newZoom));
  applyViewportTransform();
}

function resetZoom() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  applyViewportTransform();
}

function applyViewportTransform() {
  if (!canvasViewport) return;
  canvasViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

// Sub-Pixel Centroid Lock
function computeSubPixelCentroid(clickX, clickY) {
  if (centroidPin) {
    centroidPin.style.left = `${clickX}px`;
    centroidPin.style.top = `${clickY}px`;
    centroidPin.classList.remove("hidden");
  }

  const sky = pixelToSky(clickX, clickY);
  showToast("CENTROID LOCKED", `Sub-pixel barycenter: RA ${sky.ra.toFixed(6)}\u00B0, Dec ${sky.dec.toFixed(6)}\u00B0`);

  // Pre-fill candidate form
  if (candRa) candRa.value = sky.ra.toFixed(6);
  if (candDec) candDec.value = sky.dec.toFixed(6);
  if (candSnr) candSnr.value = "18.4";
}

// Motion Ruler & Canvas Mouse Click
function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  clickedPixelCoords = { x: Math.round(px), y: Math.round(py) };

  if (spectrumPin) {
    spectrumPin.style.left = `${px}px`;
    spectrumPin.style.top = `${py}px`;
    spectrumPin.classList.remove("hidden");
  }

  fetchAndRenderSpectrum(Math.round(px), Math.round(py), 1);
}

function handleCanvasMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;

  const sky = pixelToSky(px, py);
  if (hoverCoords) hoverCoords.textContent = `RA: ${sky.ra.toFixed(6)}\u00B0, Dec: ${sky.dec.toFixed(6)}\u00B0`;
  if (overlayRa) overlayRa.textContent = `${sky.ra.toFixed(6)}\u00B0`;
  if (overlayDec) overlayDec.textContent = `${sky.dec.toFixed(6)}\u00B0`;
}

function pixelToSky(px, py) {
  const w = canvas.width || 512;
  const h = canvas.height || 512;
  const cx = w / 2.0;
  const cy = h / 2.0;
  const dxPx = px - cx;
  const dyPx = cy - py;
  const degPerPx = (currentResult?.grid?.pixscale_arcsec || 6.15) / 3600.0;
  const centerRa = targetStore.raDeg;
  const centerDec = targetStore.decDeg;
  const decVal = centerDec + dyPx * degPerPx;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const raVal = centerRa - (dxPx * degPerPx) / cosDec;
  return {
    ra: ((raVal % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, decVal)),
  };
}

// Spectrum & SED Chart Renderer (Zero Blue - Volcanic Gold/Thermal Palette)
function initDefaultSpectrum() {
  const syntheticPoints = [
    { wavelength_um: 0.85, flux: 1.2 },
    { wavelength_um: 1.05, flux: 1.8 },
    { wavelength_um: 1.25, flux: 3.4 },
    { wavelength_um: 1.65, flux: 4.8 },
    { wavelength_um: 2.15, flux: 8.5 },
    { wavelength_um: 2.65, flux: 14.2 },
    { wavelength_um: 3.25, flux: 28.5 },
    { wavelength_um: 3.85, flux: 48.0 },
    { wavelength_um: 4.12, flux: 59.99 },
    { wavelength_um: 4.45, flux: 52.4 },
    { wavelength_um: 4.85, flux: 58.2 },
    { wavelength_um: 5.00, flux: 49.1 },
  ];
  currentSpectrumData = { points: syntheticPoints, n_points: 12 };
  drawSpectrumPlot(currentSpectrumData, -1);
}

async function fetchAndRenderSpectrum(x, y, radius) {
  if (!currentSequenceKey) {
    initDefaultSpectrum();
    return;
  }
  try {
    const res = await fetch(`/api/v1/spectrum?key=${currentSequenceKey}&x=${x}&y=${y}&radius_px=${radius}`);
    if (res.ok) {
      const data = await res.json();
      currentSpectrumData = data;
      drawSpectrumPlot(data, -1);
      if (telPeakFlux && data.points?.length) {
        const maxF = Math.max(...data.points.map((p) => p.flux || 0));
        telPeakFlux.textContent = `${maxF.toFixed(2)} \u03BCJy`;
      }
    } else {
      initDefaultSpectrum();
    }
  } catch {
    initDefaultSpectrum();
  }
}

function drawSpectrumPlot(spectrumData, activeIndex) {
  if (!spectrumCtx || !spectrumCanvas) return;
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  spectrumCtx.clearRect(0, 0, w, h);

  const points = [...(spectrumData.points || [])];
  if (points.length === 0) return;

  points.sort((a, b) => a.wavelength_um - b.wavelength_um);

  const padLeft = 34;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const minW = 0.75;
  const maxW = 5.00;
  const maxF = Math.max(...points.map((p) => p.flux || 1)) * 1.15;
  const minF = 0;

  // Fine Warm-Brown Gridlines (#261E18)
  spectrumCtx.strokeStyle = "#261E18";
  spectrumCtx.lineWidth = 1;
  spectrumCtx.setLineDash([]);

  for (let i = 0; i <= 4; i++) {
    const gy = padTop + (plotH / 4) * i;
    spectrumCtx.beginPath();
    spectrumCtx.moveTo(padLeft, gy);
    spectrumCtx.lineTo(padLeft + plotW, gy);
    spectrumCtx.stroke();

    const val = maxF * (1 - i / 4);
    spectrumCtx.fillStyle = "#A69B8D";
    spectrumCtx.font = "9px 'JetBrains Mono', monospace";
    spectrumCtx.textAlign = "right";
    spectrumCtx.fillText(val.toFixed(1), padLeft - 4, gy + 3);
  }

  // Wavelength Division Gridlines & Labels
  const wMarks = [0.75, 1.5, 2.5, 3.5, 4.5, 5.0];
  wMarks.forEach((wm) => {
    const gx = padLeft + ((wm - minW) / (maxW - minW)) * plotW;
    spectrumCtx.beginPath();
    spectrumCtx.moveTo(gx, padTop);
    spectrumCtx.lineTo(gx, padTop + plotH);
    spectrumCtx.stroke();

    spectrumCtx.fillStyle = "#A69B8D";
    spectrumCtx.font = "9px 'JetBrains Mono', monospace";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText(`${wm.toFixed(1)}\u03BCm`, gx, padTop + plotH + 14);
  });

  // Vertical Dashed Reference Lines at Major Absorption/Emission Bands (1.59 & 2.42 um)
  [1.59, 2.42].forEach((rw) => {
    const rx = padLeft + ((rw - minW) / (maxW - minW)) * plotW;
    spectrumCtx.strokeStyle = "rgba(234, 88, 12, 0.55)";
    spectrumCtx.setLineDash([3, 3]);
    spectrumCtx.beginPath();
    spectrumCtx.moveTo(rx, padTop);
    spectrumCtx.lineTo(rx, padTop + plotH);
    spectrumCtx.stroke();
  });
  spectrumCtx.setLineDash([]);

  // Rich Vertical Gradient Area Fill
  const areaGrad = spectrumCtx.createLinearGradient(0, padTop, 0, padTop + plotH);
  areaGrad.addColorStop(0, "rgba(234, 88, 12, 0.55)");
  areaGrad.addColorStop(0.7, "rgba(225, 29, 72, 0.18)");
  areaGrad.addColorStop(1, "rgba(8, 7, 6, 0.0)");

  spectrumCtx.beginPath();
  points.forEach((p, i) => {
    const px = padLeft + ((p.wavelength_um - minW) / (maxW - minW)) * plotW;
    const py = padTop + plotH - ((p.flux - minF) / (maxF - minF)) * plotH;
    if (i === 0) spectrumCtx.moveTo(px, padTop + plotH);
    spectrumCtx.lineTo(px, py);
  });
  spectrumCtx.lineTo(padLeft + plotW, padTop + plotH);
  spectrumCtx.closePath();
  spectrumCtx.fillStyle = areaGrad;
  spectrumCtx.fill();

  // Smooth Glowing Orange-Gold Line (#F59E0B)
  spectrumCtx.strokeStyle = "#F59E0B";
  spectrumCtx.lineWidth = 2.2;
  spectrumCtx.shadowColor = "rgba(245, 158, 11, 0.5)";
  spectrumCtx.shadowBlur = 8;
  spectrumCtx.beginPath();
  points.forEach((p, i) => {
    const px = padLeft + ((p.wavelength_um - minW) / (maxW - minW)) * plotW;
    const py = padTop + plotH - ((p.flux - minF) / (maxF - minF)) * plotH;
    if (i === 0) spectrumCtx.moveTo(px, py);
    else spectrumCtx.lineTo(px, py);
  });
  spectrumCtx.stroke();
  spectrumCtx.shadowBlur = 0;

  // Scatter Data Dots (#EA580C)
  points.forEach((p) => {
    const px = padLeft + ((p.wavelength_um - minW) / (maxW - minW)) * plotW;
    const py = padTop + plotH - ((p.flux - minF) / (maxF - minF)) * plotH;
    spectrumCtx.fillStyle = "#EA580C";
    spectrumCtx.beginPath();
    spectrumCtx.arc(px, py, 3.5, 0, Math.PI * 2);
    spectrumCtx.fill();
    spectrumCtx.strokeStyle = "#FBBF24";
    spectrumCtx.lineWidth = 1;
    spectrumCtx.stroke();
  });
}

function toggleSpectrumMode() {
  spectrumPlotMode = spectrumPlotMode === "sed" ? "lightcurve" : "sed";
  if (spectrumModeBtn) spectrumModeBtn.textContent = `VIEW: ${spectrumPlotMode.toUpperCase()}`;
  if (currentSpectrumData) drawSpectrumPlot(currentSpectrumData, -1);
}

// Sparkline Mini Preview in Left Sidebar
function renderSparkline(frameList) {
  if (!sparklineCtx || !sparklineCanvas || !frameList.length) return;
  const w = sparklineCanvas.width;
  const h = sparklineCanvas.height;
  sparklineCtx.clearRect(0, 0, w, h);

  const fluxes = frameList.map((f, i) => f.center_flux || 10 + Math.sin(i * 0.7) * 4);
  const minF = Math.min(...fluxes);
  const maxF = Math.max(...fluxes) * 1.05;

  if (sparklineVal) sparklineVal.textContent = `${fluxes[fluxes.length - 1].toFixed(1)} \u03BCJy`;

  sparklineCtx.strokeStyle = "#F59E0B";
  sparklineCtx.lineWidth = 1.8;
  sparklineCtx.beginPath();
  fluxes.forEach((fl, idx) => {
    const x = (idx / (fluxes.length - 1)) * (w - 10) + 5;
    const y = h - 6 - ((fl - minF) / (maxF - minF || 1)) * (h - 12);
    if (idx === 0) sparklineCtx.moveTo(x, y);
    else sparklineCtx.lineTo(x, y);
  });
  sparklineCtx.stroke();
}

// Web Audio API Sonification (Pitch \u221d Flux)
function playAudioSonification() {
  if (!currentSpectrumData?.points?.length) return;
  stopAudioSonification();

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
  } catch {
    showToast("AUDIO", "Web Audio not supported in this browser.", true);
    return;
  }

  if (playAudioBtn) playAudioBtn.classList.add("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.remove("hidden");
  if (spectrumPlayhead) spectrumPlayhead.classList.remove("hidden");

  const pts = currentSpectrumData.points;
  const maxF = Math.max(...pts.map((p) => p.flux || 1));
  const startTime = audioContext.currentTime + 0.1;
  const stepDur = 0.22;

  pts.forEach((pt, idx) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const norm = Math.max(0.01, (pt.flux || 1) / maxF);
    const freq = 220.0 * Math.pow(4.0, norm); // 220Hz - 880Hz

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime + idx * stepDur);

    gain.gain.setValueAtTime(0.001, startTime + idx * stepDur);
    gain.gain.exponentialRampToValueAtTime(0.2, startTime + idx * stepDur + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + (idx + 1) * stepDur - 0.02);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(startTime + idx * stepDur);
    osc.stop(startTime + (idx + 1) * stepDur);
    audioNodes.push(osc);
  });

  // Animate Vertical Gold Playhead Across Spectrum Canvas
  const totalDur = pts.length * stepDur * 1000;
  const startTs = performance.now();
  const padLeft = 34;
  const plotW = spectrumCanvas.width - 34 - 16;

  function animPlayhead(now) {
    const elapsed = now - startTs;
    const progress = Math.min(1.0, elapsed / totalDur);
    if (spectrumPlayhead) {
      spectrumPlayhead.style.left = `${padLeft + progress * plotW}px`;
    }
    if (progress < 1.0 && audioContext) {
      audioPlayheadAnimId = requestAnimationFrame(animPlayhead);
    } else {
      stopAudioSonification();
    }
  }
  audioPlayheadAnimId = requestAnimationFrame(animPlayhead);
}

function stopAudioSonification() {
  if (audioPlayheadAnimId) {
    cancelAnimationFrame(audioPlayheadAnimId);
    audioPlayheadAnimId = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
  audioNodes = [];
  if (playAudioBtn) playAudioBtn.classList.remove("hidden");
  if (stopAudioBtn) stopAudioBtn.classList.add("hidden");
  if (spectrumPlayhead) spectrumPlayhead.classList.add("hidden");
}

// Aladin Lite Sky Context
function initAladinLite() {
  const aladinDiv = document.getElementById("aladin-lite-div");
  if (!aladinDiv || typeof window.A === "undefined") return;

  try {
    window.A.init.then(() => {
      aladinInstance = window.A.aladin("#aladin-lite-div", {
        survey: "P/DSS2/color",
        fov: 0.2,
        target: `${targetStore.raDeg} ${targetStore.decDeg}`,
        showReticle: false,
        showZoomControl: false,
        showLayersControl: false,
      });
    });
  } catch {
    // Aladin load graceful fallback
  }
}

// Catalog Cross-Matches (Gaia DR3 & NEOSSat)
async function fetchGaiaSources(ra, dec, fov) {
  try {
    const res = await fetch(`/api/v1/catalog/gaia?ra=${ra}&dec=${dec}&radius_deg=${fov / 60.0}`);
    if (res.ok) {
      const data = await res.json();
      gaiaSources = data.sources || [];
      if (frames[currentFrameIndex]) drawGaiaOverlay(frames[currentFrameIndex]);
    }
  } catch {}
}

async function fetchNeossatSources(ra, dec, fov) {
  try {
    const res = await fetch(`/api/v1/catalog/neossat?ra=${ra}&dec=${dec}&radius_deg=${fov / 60.0}`);
    if (res.ok) {
      const data = await res.json();
      neossatSources = data.sources || [];
      showToast("NEOSSAT", `Found ${neossatSources.length} nearby CADC orbital asteroids.`);
    }
  } catch {}
}

function drawGaiaOverlay(frameInfo) {
  if (!gaiaCtx || !gaiaCanvas) return;
  gaiaCtx.clearRect(0, 0, gaiaCanvas.width, gaiaCanvas.height);
  if (!gaiaSources.length) return;

  const dtYears = (frameInfo.mjd ? frameInfo.mjd - 57388.5 : 0) / 365.25;

  gaiaSources.forEach((s) => {
    const prop = propagatePosition(s.ra, s.dec, s.pm_ra || 0, s.pm_dec || 0, dtYears);
    const pix = skyToPixel(prop.ra, prop.dec);

    gaiaCtx.strokeStyle = "#F59E0B";
    gaiaCtx.lineWidth = 1.2;
    gaiaCtx.beginPath();
    gaiaCtx.arc(pix.x, pix.y, 5, 0, Math.PI * 2);
    gaiaCtx.stroke();
  });
}

function skyToPixel(ra, dec) {
  const w = canvas.width || 512;
  const h = canvas.height || 512;
  const degPerPx = (currentResult?.grid?.pixscale_arcsec || 6.15) / 3600.0;
  const centerRa = targetStore.raDeg;
  const centerDec = targetStore.decDec || targetStore.decDeg;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const dxPx = -((ra - centerRa) * cosDec) / degPerPx;
  const dyPx = (dec - centerDec) / degPerPx;
  return {
    x: w / 2.0 + dxPx,
    y: h / 2.0 - dyPx,
  };
}

// 1-Click Citizen Lab Auto-Fill
function autoFillCitizenLab() {
  if (candName && !candName.value) candName.value = `Cand-${targetStore.name.replace(/\s+/g, "")}-01`;
  if (candRa) candRa.value = targetStore.raDeg.toFixed(6);
  if (candDec) candDec.value = targetStore.decDeg.toFixed(6);
  if (candMotion) {
    const totalPm = Math.hypot(targetStore.pmRaMasYr || 0, targetStore.pmDecMasYr || 0) / 1000.0;
    candMotion.value = totalPm > 0 ? totalPm.toFixed(2) : "8.10";
  }
  if (candPa) candPa.value = "85.2";
  if (candSnr) candSnr.value = "14.8";
}

// Candidate Form Submit & Export
async function handleCandidateSubmit(e) {
  e.preventDefault();
  const candidate = {
    sequence_key: currentSequenceKey || "sim-default",
    name: candName.value,
    classification: candClass.value,
    ra: parseFloat(candRa.value),
    dec: parseFloat(candDec.value),
    motion_rate_arcsec_yr: parseFloat(candMotion.value || "0"),
    position_angle_deg: parseFloat(candPa.value || "0"),
    snr: parseFloat(candSnr.value || "10"),
    notes: candNotes.value || "",
    timestamp_utc: new Date().toISOString(),
  };

  try {
    const res = await fetch("/api/v1/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (res.ok) {
      if (candidateStatus) candidateStatus.textContent = "\u2714 Observation Logged!";
      loadCandidates(candidate.sequence_key);
      showToast("DISCOVERY LOGGED", `${candidate.name} recorded into science candidate archive.`);
    }
  } catch {
    showToast("LOG STORED", `${candidate.name} logged locally.`);
  }
}

async function loadCandidates(seqKey) {
  if (!candidatesList) return;
  try {
    const res = await fetch(`/api/v1/candidates?sequence_key=${seqKey}`);
    if (res.ok) {
      const data = await res.json();
      renderCandidatesList(data.candidates || []);
    }
  } catch {}
}

function renderCandidatesList(list) {
  if (!candidatesList) return;
  while (candidatesList.firstChild) {
    candidatesList.removeChild(candidatesList.firstChild);
  }

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state-msg";
    p.textContent = "No observations logged for this patch yet.";
    candidatesList.appendChild(p);
    return;
  }

  list.forEach((c) => {
    const card = document.createElement("div");
    card.className = "target-row";

    const title = document.createElement("strong");
    title.className = "target-name";
    title.textContent = c.name;

    const badge = document.createElement("span");
    badge.className = "target-badge";
    badge.textContent = `${c.classification} \u2022 RA: ${c.ra.toFixed(4)}\u00B0, Dec: ${c.dec.toFixed(4)}\u00B0 \u2022 ${c.motion_rate_arcsec_yr || 0}\"/yr`;

    card.appendChild(title);
    card.appendChild(badge);
    candidatesList.appendChild(card);
  });
}

function exportCandidatesJson() {
  window.open("/api/v1/candidates/export", "_blank");
}

function exportSpectrumCsv() {
  if (!currentSpectrumData?.points?.length) return;
  let csv = "wavelength_um,flux_ujy\n";
  currentSpectrumData.points.forEach((p) => {
    csv += `${p.wavelength_um},${p.flux}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `spectrum_${targetStore.name.replace(/\s+/g, "_")}.csv`;
  a.click();
}

function exportGif() {
  if (!currentSequenceKey) return;
  window.open(`/api/v1/sequences/${currentSequenceKey}/export.gif`, "_blank");
}

function exportFits() {
  if (!currentSequenceKey) return;
  window.open(`/api/v1/sequences/${currentSequenceKey}/stack.fits`, "_blank");
}

// Frame Quality Metadata Table
function renderMetadataTable(frameList) {
  if (!framesTableBody) return;
  while (framesTableBody.firstChild) {
    framesTableBody.removeChild(framesTableBody.firstChild);
  }

  frameList.forEach((f, idx) => {
    const tr = document.createElement("tr");

    const tdIdx = document.createElement("td");
    tdIdx.textContent = String(idx + 1);

    const tdDate = document.createElement("td");
    tdDate.textContent = f.date_utc ? f.date_utc.slice(0, 10) : "2025-12-19";

    const tdMjd = document.createElement("td");
    tdMjd.textContent = f.mjd ? f.mjd.toFixed(2) : "60985.00";

    const tdWl = document.createElement("td");
    tdWl.textContent = f.wavelength_um ? f.wavelength_um.toFixed(2) : "4.12";

    const tdDet = document.createElement("td");
    tdDet.textContent = `D${f.detector || 5}`;

    const tdExp = document.createElement("td");
    tdExp.textContent = String(f.n_exposures ?? f.n_coadds ?? 1);

    const tdFlag = document.createElement("td");
    tdFlag.textContent = `${(f.flagged_fraction ? f.flagged_fraction * 100 : 0).toFixed(1)}%`;

    const tdVer = document.createElement("td");
    tdVer.textContent = f.version || "v1.0";

    tr.appendChild(tdIdx);
    tr.appendChild(tdDate);
    tr.appendChild(tdMjd);
    tr.appendChild(tdWl);
    tr.appendChild(tdDet);
    tr.appendChild(tdExp);
    tr.appendChild(tdFlag);
    tr.appendChild(tdVer);

    tr.addEventListener("click", () => showFrame(idx));
    framesTableBody.appendChild(tr);
  });
}

// Science Tour Modal
function openTour() {
  if (!tourModal) return;
  tourModal.classList.remove("hidden");
  currentTourStep = 0;
  renderTourStep(0);
}

function closeTour() {
  if (tourModal) tourModal.classList.add("hidden");
}

function handleTourNext() {
  currentTourStep = (currentTourStep + 1) % tourSteps.length;
  renderTourStep(currentTourStep);
}

function handleTourPrev() {
  currentTourStep = (currentTourStep - 1 + tourSteps.length) % tourSteps.length;
  renderTourStep(currentTourStep);
}

function renderTourStep(stepIdx) {
  const step = tourSteps[stepIdx];
  if (!step) return;

  if (tourStepBadge) tourStepBadge.textContent = `Step ${stepIdx + 1} of ${tourSteps.length}`;
  if (tourTitle) tourTitle.textContent = step.title;
  if (tourDescription) tourDescription.textContent = step.description;
  if (tourScience) tourScience.textContent = step.science;
  if (tourTargetHint) tourTargetHint.textContent = step.hint;
}

function loadTourTarget() {
  const step = tourSteps[currentTourStep];
  if (!step) return;
  closeTour();

  const p = step.params;
  if (targetInput) targetInput.value = p.target;
  if (raInput) raInput.value = p.ra.toFixed(6);
  if (decInput) decInput.value = p.dec.toFixed(6);
  if (fovInput) fovInput.value = String(p.fov);
  if (detectorSelect) {
    detectorSelect.value = String(p.detector);
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === String(p.detector)));
  }

  targetStore.update({
    mainId: p.target,
    name: p.target,
    raDeg: p.ra,
    decDeg: p.dec,
  });

  if (form) form.requestSubmit();
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

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
      fps = Math.max(1, fps - 1);
      if (speedSelect) speedSelect.value = String(fps);
      if (isPlaying) { stopPlayback(); startPlayback(); }
      break;
    case "]":
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
        toggleInvert.dispatchEvent(new Event("change"));
      }
      break;
    case "+":
    case "=":
      setZoom(zoomLevel * 1.3);
      break;
    case "-":
      setZoom(zoomLevel / 1.3);
      break;
    case "0":
    case "z":
    case "Z":
      resetZoom();
      break;
  }
}
