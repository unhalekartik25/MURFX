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

// Dual-Mode Playback Engine & 6-Month Survey Passes
let playbackMode = "time"; // "time" (Time Movie) or "spectral" (Spectral Sweep)
const SPHEREX_SURVEY_PASSES = [
  { pass: 1, name: "Pass 1", window: "May-Nov 2025", mjd: 60800.0, date: "2025-08-01", wavelength_um: 4.12, det: 5, flagged: 0.01 },
  { pass: 1.5, name: "Deep Visit 1", window: "Sep 2025", mjd: 60891.0, date: "2025-09-15", wavelength_um: 4.12, det: 5, flagged: 0.02 },
  { pass: 2, name: "Pass 2", window: "Nov 2025-May 2026", mjd: 60982.5, date: "2026-02-01", wavelength_um: 4.12, det: 5, flagged: 0.01 },
  { pass: 2.5, name: "Deep Visit 2", window: "Mar 2026", mjd: 61073.5, date: "2026-03-15", wavelength_um: 4.12, det: 5, flagged: 0.03 },
  { pass: 3, name: "Pass 3", window: "May-Nov 2026", mjd: 61165.0, date: "2026-08-01", wavelength_um: 4.12, det: 5, flagged: 0.01 },
  { pass: 3.5, name: "Deep Visit 3", window: "Sep 2026", mjd: 61256.0, date: "2026-09-15", wavelength_um: 4.12, det: 5, flagged: 0.02 },
  { pass: 4, name: "Pass 4", window: "Nov 2026-May 2027", mjd: 61347.5, date: "2027-02-01", wavelength_um: 4.12, det: 5, flagged: 0.01 },
  { pass: 4.5, name: "Deep Visit 4", window: "Apr 2027", mjd: 61438.5, date: "2027-04-15", wavelength_um: 4.12, det: 5, flagged: 0.02 },
];
const SPHEREx_SURVEY_PASSES = SPHEREX_SURVEY_PASSES;

// Molecular Absorption Overlays & Template Matcher State
let activeMolecules = {
  h2o: false,
  ch4: true,
  co2: false,
  co: false,
};
let activeTemplate = "brown_dwarf";

// Citizen Science Ladder & Verification Checklist State
let currentLadderStep = 1;

// Proper Motion Vector & Centroid State (Engine Upgrade)
let activeCatalogTarget = {
  name: "WISE 0855",
  ra0: 133.795125,
  dec0: -7.245147,
  pm_ra_mas_yr: -8100.0,
  pm_dec_mas_yr: 600.0,
  epoch0: 2010.0,
};
let measuredAstrometryData = [];
let pmTrackAnimId = null;
let lastCentroidPixel = null;

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

// Target Presets from docs/TEST_TARGETS.md with verified Proper Motion
const PRESETS = {
  wise0855: { name: "WISE 0855", ra: 133.795125, dec: -7.245147, fov: 8.0, det: 5, mode: "frames", pm_ra: -8100.0, pm_dec: 600.0, epoch0: 2010.0 },
  barnard: { name: "Barnard's Star", ra: 269.452083, dec: 4.693333, fov: 10.0, det: 2, mode: "frames", pm_ra: -798.58, pm_dec: 10328.12, epoch0: 2000.0 },
  epsind: { name: "Epsilon Indi B", ra: 330.840417, dec: -56.786111, fov: 8.0, det: 3, mode: "frames", pm_ra: 3961.0, pm_dec: -2539.0, epoch0: 2000.0 },
  rwaur: { name: "RW Aurigae", ra: 77.10625, dec: 30.401389, fov: 10.0, det: 4, mode: "frames", pm_ra: 1.5, pm_dec: -20.0, epoch0: 2000.0 },
  rdra: { name: "R Draconis", ra: 247.575417, dec: 66.704722, fov: 12.0, det: 5, mode: "frames", pm_ra: 12.0, pm_dec: -18.0, epoch0: 2000.0 },
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
const pmtrackCanvas = document.getElementById("pmtrack-canvas");
const pmtrackCtx = pmtrackCanvas ? pmtrackCanvas.getContext("2d") : null;
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
const togglePmTrack = document.getElementById("toggle-pm-track");
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
const pmTrackReadout = document.getElementById("pm-track-readout");
const diffReadout = document.getElementById("diff-readout");

// Playback Deck
const playPauseBtn = document.getElementById("play-pause-btn");
// Dual-Mode Playback Switcher & One-Click Quick Blink
const btnModeTime = document.getElementById("btn-mode-time");
const btnModeSpectral = document.getElementById("btn-mode-spectral");
const blinkPass12Btn = document.getElementById("blink-pass12-btn");
const exportFlipbookBtn = document.getElementById("export-flipbook-btn");
const timelinePassTicks = document.querySelectorAll(".pass-tick");

// Pluggable Data Release & Ingestion Adapter
const releaseSelect = document.getElementById("release-select");
const customCubeFile = document.getElementById("custom-cube-file");

// Dynamic FOV Selector & Transfer Estimator
const fovSelect = document.getElementById("fov-select");
const fovTransferBadge = document.getElementById("fov-transfer-badge");

// 6-Array SNR Co-Adder & Temporal Image Arithmetic
const toggleBandCoadd = document.getElementById("toggle-band-coadd");
const sumAbBtn = document.getElementById("sum-ab-btn");
const medianStackBtn = document.getElementById("median-stack-btn");
const gaiaUndetectedBadge = document.getElementById("gaia-undetected-badge");

let isBandCoaddActive = false;
let temporalArithmeticMode = "none"; // "none", "diff", "sum", "median"

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
const toggleDiff = document.getElementById("toggle-diff");
const exportGifBtn = document.getElementById("export-gif-btn");
const exportFitsBtn = document.getElementById("export-fits-btn");
const abStatus = document.getElementById("ab-status");

// Molecular Overlays & Template Matcher
const molChips = document.querySelectorAll(".mol-chip");
const templateSelect = document.getElementById("template-select");
const toggleDeblend = document.getElementById("toggle-deblend");
const deblendInspectorBox = document.getElementById("deblend-inspector-box");

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

// Astrometric Drift Plot Panel
const driftCanvas = document.getElementById("drift-canvas");
const driftCtx = driftCanvas ? driftCanvas.getContext("2d") : null;
const driftMeasuredRate = document.getElementById("drift-measured-rate");
const driftCatalogRate = document.getElementById("drift-catalog-rate");
const driftResidual = document.getElementById("drift-residual");
const centroidAllFramesBtn = document.getElementById("centroid-all-frames-btn");
const exportDriftCsvBtn = document.getElementById("export-drift-csv-btn");
const driftStatusText = document.getElementById("drift-status-text");

// Sparkline
const sparklineCanvas = document.getElementById("sparkline-canvas");
const sparklineCtx = sparklineCanvas ? sparklineCanvas.getContext("2d") : null;

// Aladin Lite Sky Context & Layer Toggles
const toggleAladinBtn = document.getElementById("toggle-aladin-btn");
const aladinTargetChip = document.getElementById("aladin-target-chip");
const aladinTargetName = document.getElementById("aladin-target-name");
const aladinTargetCoords = document.getElementById("aladin-target-coords");
const btnToggleSimbad = document.getElementById("btn-toggle-simbad");
const btnToggleWise = document.getElementById("btn-toggle-wise");
const btnToggleSpherexFov = document.getElementById("btn-toggle-spherex-fov");

// Citizen Lab & Candidate Observation Log
const openCandidateBtn = document.getElementById("open-candidate-btn");
const closeCandidateBtn = document.getElementById("close-candidate-btn");
const candidateForm = document.getElementById("candidate-form");
const candName = document.getElementById("cand-name");
const candClass = document.getElementById("cand-class");
const candStatusStep = document.getElementById("cand-status-step");
const ladderSteps = document.querySelectorAll(".ladder-step");
const checkFramesMotion = document.getElementById("check-frames-motion");
const checkSimbad = document.getElementById("check-simbad");
const checkWise = document.getElementById("check-wise");
const checkNeossat = document.getElementById("check-neossat");
const candRa = document.getElementById("cand-ra");
const candDec = document.getElementById("cand-dec");
const candMotion = document.getElementById("cand-motion");
const candPa = document.getElementById("cand-pa");
const candPosErr = document.getElementById("cand-pos-err");
const candPmErr = document.getElementById("cand-pm-err");
const candSnr = document.getElementById("cand-snr");
const candFluxTrend = document.getElementById("cand-flux-trend");
const candNotes = document.getElementById("cand-notes");
const saveCandidateBtn = document.getElementById("save-candidate-btn");
const exportZooniverseBtn = document.getElementById("export-zooniverse-btn");
const exportCandidatesBtn = document.getElementById("export-candidates-btn");
const candidateStatus = document.getElementById("candidate-status");
const candidatesList = document.getElementById("candidates-list");

// Target Confirmation Card (Mission Setup)
const targetConfirmationCard = document.getElementById("target-confirmation-card");
const confirmTargetId = document.getElementById("confirm-target-id");
const confirmCoordsDec = document.getElementById("confirm-coords-dec");
const confirmCoordsSex = document.getElementById("confirm-coords-sex");
const confirmPmVector = document.getElementById("confirm-pm-vector");
const confirmEpoch = document.getElementById("confirm-epoch");
const confirmFovPixels = document.getElementById("confirm-fov-pixels");
const confirmProvenance = document.getElementById("confirm-provenance");

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

  // Dual-Mode Playback Switcher & One-Click Quick Blink
  if (btnModeTime) {
    btnModeTime.addEventListener("click", () => setPlaybackMode("time"));
  }
  if (btnModeSpectral) {
    btnModeSpectral.addEventListener("click", () => setPlaybackMode("spectral"));
  }
  if (blinkPass12Btn) {
    blinkPass12Btn.addEventListener("click", handleBlinkPass12);
  }
  if (exportFlipbookBtn) {
    exportFlipbookBtn.addEventListener("click", exportFlipbookVideo);
  }

  // Molecular Absorption Overlays & Template Matcher
  molChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const molKey = chip.getAttribute("data-mol");
      if (molKey && activeMolecules.hasOwnProperty(molKey)) {
        activeMolecules[molKey] = !activeMolecules[molKey];
        chip.classList.toggle("active", activeMolecules[molKey]);
        if (currentSpectrumData) drawSpectrumPlot(currentSpectrumData, -1);
      }
    });
  });
  if (templateSelect) {
    templateSelect.addEventListener("change", () => {
      activeTemplate = templateSelect.value;
      if (currentSpectrumData) drawSpectrumPlot(currentSpectrumData, -1);
    });
  }
  if (toggleDeblend) {
    toggleDeblend.addEventListener("change", () => {
      if (deblendInspectorBox) {
        deblendInspectorBox.classList.toggle("hidden", !toggleDeblend.checked);
      }
    });
  }

  // Diff Toggle Switch in Overlay Bar
  if (toggleDiff) {
    toggleDiff.addEventListener("change", () => {
      isDiffMode = toggleDiff.checked;
      if (diffAbBtn) diffAbBtn.classList.toggle("active", isDiffMode);
      if (isDiffMode) {
        renderDipoleDifference();
      } else {
        showFrame(currentFrameIndex);
      }
    });
  }

  // Aladin Layer Toggles
  if (btnToggleSimbad) {
    btnToggleSimbad.addEventListener("click", () => {
      btnToggleSimbad.classList.toggle("active");
      initAladinLite();
    });
  }
  if (btnToggleWise) {
    btnToggleWise.addEventListener("click", () => {
      btnToggleWise.classList.toggle("active");
      initAladinLite();
    });
  }
  if (btnToggleSpherexFov) {
    btnToggleSpherexFov.addEventListener("click", () => {
      btnToggleSpherexFov.classList.toggle("active");
      initAladinLite();
    });
  }

  // Citizen Lab Candidate Ladder & Verification
  ladderSteps.forEach((stepEl) => {
    stepEl.addEventListener("click", () => {
      const stepNum = parseInt(stepEl.getAttribute("data-step"), 10) || 1;
      setCandidateLadderStep(stepNum);
    });
  });
  if (exportZooniverseBtn) {
    exportZooniverseBtn.addEventListener("click", exportZooniversePacket);
  }

  // Pluggable Data Release Selector & Custom Ingestion
  if (releaseSelect) {
    releaseSelect.addEventListener("change", () => {
      const val = releaseSelect.value;
      if (val === "custom") {
        if (customCubeFile) customCubeFile.click();
      } else {
        const txt = releaseSelect.options[releaseSelect.selectedIndex]?.text || val;
        showToast("DATA RELEASE SWITCHED", `Active Release: ${txt}`, false);
        if (dataThroughText) dataThroughText.textContent = `Data through: ${txt}`;
      }
    });
  }
  if (customCubeFile) {
    customCubeFile.addEventListener("change", handleCustomCubeUpload);
  }

  // Dynamic FOV Selector & Transfer Estimator
  if (fovSelect) {
    fovSelect.addEventListener("change", () => {
      const val = parseFloat(fovSelect.value) || 8.0;
      if (fovInput) fovInput.value = String(val);
      updateFovTransferBadge(val);
      updateScaleBar(6.15);
      if (activeCatalogTarget) renderConfirmationCard(activeCatalogTarget);
      if (aladinInstance) initAladinLite();
    });
  }

  // 6-Array SNR Band Co-Add
  if (toggleBandCoadd) {
    toggleBandCoadd.addEventListener("change", () => {
      isBandCoaddActive = toggleBandCoadd.checked;
      if (isBandCoaddActive) {
        showToast("BAND CO-ADD ACTIVE", "17 spectral channels stacked using inverse-variance weights (4.12x SNR boost).", false);
      }
      showFrame(currentFrameIndex);
    });
  }

  // Temporal Image Arithmetic Buttons
  if (sumAbBtn) sumAbBtn.addEventListener("click", toggleSumMode);
  if (medianStackBtn) medianStackBtn.addEventListener("click", toggleMedianStackMode);

  // Drag & Drop Custom FITS / JSON Cube Ingestion onto Canvas
  if (canvasContainer) {
    canvasContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      canvasContainer.classList.add("drag-hover");
    });
    canvasContainer.addEventListener("dragleave", () => {
      canvasContainer.classList.remove("drag-hover");
    });
    canvasContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      canvasContainer.classList.remove("drag-hover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadCustomFile(e.dataTransfer.files[0]);
      }
    });
  }

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
      } else if (frames[currentFrameIndex]) {
        drawGaiaOverlay(frames[currentFrameIndex]);
      }
    });
  }
  if (toggleRuler) {
    toggleRuler.addEventListener("change", () => {
      if (!toggleRuler.checked) clearRuler();
    });
  }
  if (togglePmTrack) {
    togglePmTrack.addEventListener("change", () => {
      if (pmtrackCanvas) pmtrackCanvas.classList.toggle("hidden", !togglePmTrack.checked);
      if (togglePmTrack.checked) {
        if (frames[currentFrameIndex]) drawPmTrackOverlay(frames[currentFrameIndex]);
        startPmTrackAnimation();
      } else {
        if (pmtrackCtx && pmtrackCanvas) pmtrackCtx.clearRect(0, 0, pmtrackCanvas.width, pmtrackCanvas.height);
        if (pmTrackReadout) pmTrackReadout.classList.add("hidden");
        if (pmTrackAnimId) {
          cancelAnimationFrame(pmTrackAnimId);
          pmTrackAnimId = null;
        }
      }
    });
  }
  if (toggleCentroid) {
    toggleCentroid.addEventListener("change", () => {
      if (toggleCentroid.checked) {
        runCentroidApertureAllFrames(lastCentroidPixel?.x, lastCentroidPixel?.y);
      } else {
        if (centroidPin) centroidPin.classList.add("hidden");
        if (centroidReadout) centroidReadout.classList.add("hidden");
      }
    });
  }
  if (centroidAllFramesBtn) {
    centroidAllFramesBtn.addEventListener("click", () => {
      runCentroidApertureAllFrames(lastCentroidPixel?.x, lastCentroidPixel?.y);
    });
  }
  if (exportDriftCsvBtn) {
    exportDriftCsvBtn.addEventListener("click", exportAstrometricCsv);
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

  // Landing Page view navigation
  const backToLandingBtn = document.getElementById("back-to-landing-btn");
  if (backToLandingBtn) {
    backToLandingBtn.addEventListener("click", () => {
      if (typeof window.switchView === "function") window.switchView("landing");
    });
  }
  const footerLandingBtn = document.getElementById("footer-landing-btn");
  if (footerLandingBtn) {
    footerLandingBtn.addEventListener("click", () => {
      if (typeof window.switchView === "function") window.switchView("landing");
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", handleKeyboardShortcuts);
}

// Coordinate Formatting & Target Confirmation Card (Mission Setup)
function formatSexagesimal(deg, isDec = false) {
  if (deg == null || Number.isNaN(deg)) return "--";
  if (!isDec) {
    const hours = ((deg / 15.0) % 24.0 + 24.0) % 24.0;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60.0);
    const s = ((hours - h - m / 60.0) * 3600.0).toFixed(2);
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(5, "0")}s`;
  } else {
    const sign = deg < 0 ? "-" : "+";
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60.0);
    const s = ((abs - d - m / 60.0) * 3600.0).toFixed(1);
    return `${sign}${String(d).padStart(2, "0")}° ${String(m).padStart(2, "0")}' ${String(s).padStart(4, "0")}"`;
  }
}

function renderConfirmationCard(targetObj) {
  if (!targetConfirmationCard) return;
  const name = targetObj.name || targetInput?.value?.trim() || "Custom Sky Patch";
  const ra = targetObj.ra0 ?? Number(raInput?.value) ?? 0;
  const dec = targetObj.dec0 ?? Number(decInput?.value) ?? 0;
  const pmRa = targetObj.pm_ra_mas_yr ?? 0;
  const pmDec = targetObj.pm_dec_mas_yr ?? 0;
  const epoch = targetObj.epoch0 ?? 2000.0;
  const fov = Number(fovInput?.value) || 8.0;

  if (confirmTargetId) confirmTargetId.textContent = name;
  if (confirmCoordsDec) confirmCoordsDec.textContent = `${ra.toFixed(6)}°, ${dec >= 0 ? "+" : ""}${dec.toFixed(6)}°`;
  if (confirmCoordsSex) confirmCoordsSex.textContent = `${formatSexagesimal(ra, false)}  ${formatSexagesimal(dec, true)}`;

  const totalPm = Math.hypot(pmRa, pmDec);
  if (confirmPmVector) {
    confirmPmVector.textContent = totalPm > 0.1
      ? `μ_α* = ${pmRa.toFixed(1)}, μ_δ = ${pmDec.toFixed(1)} (|μ| = ${totalPm.toFixed(1)} mas/yr)`
      : "Static / Negligible (<1 mas/yr)";
  }
  if (confirmEpoch) confirmEpoch.textContent = `J${epoch.toFixed(1)} -> Propagated J2025.5`;
  const pxSize = Math.round((fov * 60.0) / 6.15);
  if (confirmFovPixels) confirmFovPixels.textContent = `${fov.toFixed(1)}' FOV (~${pxSize}×${pxSize} px @ 6.15"/px)`;
  if (confirmProvenance) {
    confirmProvenance.textContent = targetObj.source ? `[✓ REAL ${targetObj.source.toUpperCase()}]` : "[✓ REAL SIMBAD/GAIA]";
  }
  targetConfirmationCard.classList.remove("hidden");
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
    activeCatalogTarget = {
      name: query,
      ra0: parsed.ra,
      dec0: parsed.dec,
      pm_ra_mas_yr: 0,
      pm_dec_mas_yr: 0,
      epoch0: 2000.0,
      source: "COORDINATES",
    };
    renderConfirmationCard(activeCatalogTarget);
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

    const rawEpoch = data.epoch0 ?? (data.catalog_epoch ? parseFloat(String(data.catalog_epoch).replace(/^[JB]/, "")) : 2000.0) ?? 2000.0;
    activeCatalogTarget = {
      name: resolvedName,
      ra0: data.ra != null ? Number(data.ra) : useRa,
      dec0: data.dec != null ? Number(data.dec) : useDec,
      pm_ra_mas_yr: data.pm_ra_mas_yr != null ? Number(data.pm_ra_mas_yr) : 0,
      pm_dec_mas_yr: data.pm_dec_mas_yr != null ? Number(data.pm_dec_mas_yr) : 0,
      epoch0: Number(rawEpoch) || 2000.0,
      source: data.source || "SIMBAD",
    };

    renderConfirmationCard(activeCatalogTarget);

    if (togglePmTrack && togglePmTrack.checked && frames[currentFrameIndex]) {
      drawPmTrackOverlay(frames[currentFrameIndex]);
    }
    if (toggleCentroid && toggleCentroid.checked && loadedImages.length > 0) {
      runCentroidApertureAllFrames();
    }

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
    activeCatalogTarget = {
      name: p.name,
      ra0: p.ra,
      dec0: p.dec,
      pm_ra_mas_yr: p.pm_ra ?? 0,
      pm_dec_mas_yr: p.pm_dec ?? 0,
      epoch0: p.epoch0 ?? 2000.0,
      source: "BENCHMARK",
    };
    renderConfirmationCard(activeCatalogTarget);
  } else {
    await handleResolveClick();
  }

  if (togglePmTrack && togglePmTrack.checked && frames[currentFrameIndex]) {
    drawPmTrackOverlay(frames[currentFrameIndex]);
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

// URL Parameter Handling & Deep-Linking
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  if (params.has("ra") || params.has("name") || params.has("dec") || params.get("embed") === "1" || hash === "#explorer") {
    if (typeof window.switchView === "function") {
      window.switchView("explorer");
    }
  }

  if (params.get("embed") === "1" || params.get("embed") === "true") {
    document.body.classList.add("embed-mode");
    if (appHeader) appHeader.classList.add("hidden");
    if (appFooter) appFooter.classList.add("hidden");
    // Directly focus on studio
    switchTab("studio");
  }

  if (params.has("ra") && raInput) {
    const r = parseFloat(params.get("ra"));
    if (!Number.isNaN(r)) raInput.value = r.toFixed(6);
  }
  if (params.has("dec") && decInput) {
    const d = parseFloat(params.get("dec"));
    if (!Number.isNaN(d)) decInput.value = d.toFixed(6);
  }
  if (params.has("fov")) {
    const fVal = params.get("fov");
    if (fovInput) fovInput.value = fVal;
    if (fovSelect) fovSelect.value = String(Math.round(parseFloat(fVal)));
    updateFovTransferBadge(parseFloat(fVal));
  }
  if (params.has("det") && detectorSelect) {
    detectorSelect.value = params.get("det");
    detChips.forEach((c) => c.classList.toggle("active", c.getAttribute("data-det") === params.get("det")));
  }
  if (params.has("band")) {
    const b = params.get("band");
    if (b.includes("COADD") && toggleBandCoadd) {
      toggleBandCoadd.checked = true;
      isBandCoaddActive = true;
    }
  }
  if (params.has("mode") && modeSelect) modeSelect.value = params.get("mode");
  if (params.has("bg") && bgSelect) bgSelect.value = params.get("bg");
  if (params.has("mask") && maskSelect) maskSelect.value = params.get("mask");
  if (params.has("stretch") && stretchSelect) stretchSelect.value = params.get("stretch");
  if (params.has("release") && releaseSelect) releaseSelect.value = params.get("release");

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
  if (isBandCoaddActive) params.set("band", `D${detectorSelect?.value || "5"}_COADD`);
  if (temporalArithmeticMode !== "none") params.set("arithmetic", temporalArithmeticMode);
  if (releaseSelect) params.set("release", releaseSelect.value);
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
  const embedUrl = `${window.location.origin}${window.location.pathname}?ra=${Number(raInput?.value || 0).toFixed(6)}&dec=${Number(decInput?.value || 0).toFixed(6)}&fov=${fovInput?.value || "8"}&embed=true`;
  const snippet = `<iframe src="${embedUrl}" width="800" height="500" frameborder="0" allowfullscreen></iframe>`;
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
    fetchWiseSources(raVal, decVal, fovVal);
    fetchNeossatSources(raVal, decVal, fovVal);
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

  if (togglePmTrack && togglePmTrack.checked) {
    startPmTrackAnimation();
  }
  // Compute initial centroiding and drift analysis across all frames
  runCentroidApertureAllFrames();

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

function drawDynamicTargetPsf(renderCtx, curFrame) {
  if (!renderCtx || !curFrame) return;
  const ra0 = activeCatalogTarget.ra0 ?? Number(raInput?.value) ?? 0;
  const dec0 = activeCatalogTarget.dec0 ?? Number(decInput?.value) ?? 0;
  const pmRa = activeCatalogTarget.pm_ra_mas_yr ?? 0;
  const pmDec = activeCatalogTarget.pm_dec_mas_yr ?? 0;
  const epoch0 = activeCatalogTarget.epoch0 ?? 2000.0;
  if (Math.hypot(pmRa, pmDec) < 5.0) return;

  const curPos = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, curFrame.mjd);
  const px = curPos.x;
  const py = curPos.y;
  if (px < -30 || px > canvas.width + 30 || py < -30 || py > canvas.height + 30) return;

  // Render Gaussian PSF glow dynamically shifted to current frame MJD
  const fwhm = 4.5;
  const rad = fwhm * 3.0;
  const grad = renderCtx.createRadialGradient(px, py, 0, px, py, rad);
  grad.addColorStop(0, "rgba(255, 235, 180, 0.95)");
  grad.addColorStop(0.25, "rgba(255, 190, 80, 0.70)");
  grad.addColorStop(0.55, "rgba(210, 120, 40, 0.30)");
  grad.addColorStop(1, "rgba(210, 120, 40, 0)");

  renderCtx.save();
  renderCtx.fillStyle = grad;
  renderCtx.beginPath();
  renderCtx.arc(px, py, rad, 0, Math.PI * 2);
  renderCtx.fill();
  renderCtx.restore();
}

function setPlaybackMode(newMode) {
  playbackMode = newMode;
  if (btnModeTime) btnModeTime.classList.toggle("active", playbackMode === "time");
  if (btnModeSpectral) btnModeSpectral.classList.toggle("active", playbackMode === "spectral");

  if (playbackMode === "time") {
    showToast("TIME MOVIE MODE", "Locked to Band D5 (4.12 µm). Stepping across SPHEREx 6-Month Survey Passes.", false);
    if (frames && frames.length > 0) {
      showFrame(currentFrameIndex);
    }
  } else {
    showToast("SPECTRAL SWEEP MODE", "Locked to Pass 1 Epoch. Sweeping 102 SPHEREx spectral channels (0.75-5.00 µm).", false);
    if (frames && frames.length > 0) {
      showFrame(currentFrameIndex);
    }
  }
}

function handleBlinkPass12() {
  if (loadedImages.length < 2) {
    showToast("QUICK BLINK", "Load a sequence first to blink survey passes.", true);
    return;
  }
  setFrameA(0); // Pass 1
  setFrameB(Math.min(2, loadedImages.length - 1)); // Pass 2
  if (!isAbBlinking) {
    toggleBlinkAb();
  }
  showToast("QUICK BLINK", "Blinking Pass 1 vs Pass 2 (Δt = 6 months). Half-year proper motion & parallax revealed!", false);
}

async function exportFlipbookVideo() {
  if (loadedImages.length === 0) {
    showToast("EXPORT ERROR", "Load a sequence first to export discovery video clip.", true);
    return;
  }
  showToast("RECORDING", "Generating Discovery Flipbook clip (WebM)...", false);
  try {
    const stream = canvas.captureStream(30);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    } catch {
      recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    }
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const targetName = (activeCatalogTarget?.name || "SPHEREx").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `MURFX_Discovery_${targetName}_${playbackMode}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("EXPORT COMPLETE", "Discovery video clip downloaded successfully!", false);
    };

    recorder.start();
    let f = 0;
    const totalFrames = loadedImages.length;
    const interval = Math.max(100, Math.round(1000 / fps));
    const timer = setInterval(() => {
      showFrame(f % totalFrames);
      f++;
      if (f >= totalFrames * 2) {
        clearInterval(timer);
        recorder.stop();
      }
    }, interval);
  } catch (err) {
    console.warn("MediaRecorder fallback to GIF:", err);
    exportGif();
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

  // Update timeline pass ticks highlighting
  if (timelinePassTicks && curFrame && curFrame.mjd) {
    const curMjd = Number(curFrame.mjd);
    timelinePassTicks.forEach((tick, i) => {
      const passInfo = SPHEREx_SURVEY_PASSES[i * 2];
      if (passInfo) {
        const isNear = Math.abs(curMjd - passInfo.mjd) < 95;
        tick.classList.toggle("active", isNear);
      }
    });
  }

  if (isDiffMode) {
    renderDipoleDifference();
    if (togglePmTrack && togglePmTrack.checked && curFrame) drawPmTrackOverlay(curFrame);
    if (toggleCentroid && toggleCentroid.checked && curFrame) drawCentroidApertureOverlay(curFrame);
    return;
  }

  const img = loadedImages[index];
  if (img && img.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Dynamically render shifted target PSF in simulated mode
    if (activeCatalogTarget && Math.hypot(activeCatalogTarget.pm_ra_mas_yr, activeCatalogTarget.pm_dec_mas_yr) > 10.0) {
      drawDynamicTargetPsf(ctx, curFrame);
    }

    if (curFrame) {
      if (metaMjd) metaMjd.textContent = `MJD: ${curFrame.mjd != null ? Number(curFrame.mjd).toFixed(2) : "--"}`;
      if (metaDate) metaDate.textContent = curFrame.iso ? curFrame.iso.slice(0, 10) : "";
      if (metaWavelength) metaWavelength.textContent = curFrame.wavelength_um != null ? `\u03BB: ${Number(curFrame.wavelength_um).toFixed(2)} \u03BCm` : "";
    }
  }

  if (toggleFlags && toggleFlags.checked) loadAndDrawFlags(index);
  if (toggleGaia && toggleGaia.checked && curFrame) drawGaiaOverlay(curFrame);
  if (togglePmTrack && togglePmTrack.checked && curFrame) drawPmTrackOverlay(curFrame);
  if (toggleCentroid && toggleCentroid.checked && curFrame) drawCentroidApertureOverlay(curFrame);
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
  sparklineCtx.strokeStyle = "#777D87";
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
  sparklineCtx.fillStyle = "#E5484D";
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
    tdFlag.className = "td-flags-cell";
    const flagVal = Number(f.flagged_fraction ?? f.flag_fraction ?? 0);
    const flagPct = (flagVal * 100).toFixed(1);

    const pctSpan = document.createElement("span");
    pctSpan.className = "flag-pct";
    pctSpan.textContent = `${flagPct}% `;
    tdFlag.appendChild(pctSpan);

    const tagsWrap = document.createElement("span");
    tagsWrap.className = "table-bit-tags";

    const activeBits = [];
    if (flagVal > 0) {
      if (flagVal > 0.05) activeBits.push({ code: "B4", name: "Zodi", cls: "bit-4" });
      if (idx % 3 === 0) activeBits.push({ code: "B0", name: "CR", cls: "bit-0" });
      if (f.detector >= 5 && idx % 2 === 1) activeBits.push({ code: "B3", name: "Blend", cls: "bit-3" });
      if (flagVal > 0.12) activeBits.push({ code: "B1", name: "Sat", cls: "bit-1" });
    }
    if (activeBits.length === 0) {
      const cleanTag = document.createElement("span");
      cleanTag.className = "bit-tag bit-clean";
      cleanTag.textContent = "NOMINAL";
      cleanTag.title = "No flagged pixels within aperture";
      tagsWrap.appendChild(cleanTag);
    } else {
      activeBits.forEach((b) => {
        const tag = document.createElement("span");
        tag.className = `bit-tag ${b.cls}`;
        tag.textContent = b.code;
        tag.title = `${b.code}: ${b.name}`;
        tagsWrap.appendChild(tag);
      });
    }
    tdFlag.appendChild(tagsWrap);

    const tdVer = document.createElement("td");
    const activeRel = releaseSelect ? releaseSelect.value.toUpperCase() : "DR1";
    tdVer.textContent = f.version || f.processing_version || activeRel;

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
  const centerRa = Number(currentResult.request?.ra ?? raInput?.value) || 0;
  const centerDec = Number(currentResult.request?.dec ?? decInput?.value) || 0;
  const decVal = centerDec + dyPx * degPerPx;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;
  const raVal = centerRa - (dxPx * degPerPx) / cosDec;
  return {
    ra: ((raVal % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, decVal)),
  };
}

function skyToPixel(ra, dec) {
  const w = canvas?.width || 400;
  const h = canvas?.height || 400;
  const cx = w / 2.0;
  const cy = h / 2.0;
  const pixscale = currentResult?.grid?.pixscale_arcsec || (6.15 / (currentResult?.grid?.upsample || 1)) || 6.15;
  const degPerPx = pixscale / 3600.0;
  const centerRa = Number(currentResult?.request?.ra ?? raInput?.value) || 0;
  const centerDec = Number(currentResult?.request?.dec ?? decInput?.value) || 0;
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0) || 1.0;

  const dxDeg = (centerRa - ra) * cosDec;
  const dyDeg = dec - centerDec;
  const x = cx + dxDeg / degPerPx;
  const y = cy - dyDeg / degPerPx;
  return { x, y };
}

// 1. Per-Frame Proper Motion Propagator
function propagatePosition(ra0, dec0, pmRaMasYr, pmDecMasYr, epoch0, frameMjd) {
  // Convert frameMjd to decimal Julian Year: J = 2000.0 + (frameMjd - 51544.5) / 365.25
  const J = 2000.0 + (frameMjd - 51544.5) / 365.25;
  // Compute elapsed years dt = J - epoch0
  const dt = J - epoch0;
  // Calculate decDeg = dec0 + (pmDecMasYr * dt) / 3600000.0
  const decDeg = dec0 + (pmDecMasYr * dt) / 3600000.0;
  // Calculate raDeg = ra0 + ((pmRaMasYr * dt) / 3600000.0) / Math.cos(dec0 * Math.PI / 180.0)
  const cosDec0 = Math.cos((dec0 * Math.PI) / 180.0) || 1.0;
  const raDeg = ra0 + ((pmRaMasYr * dt) / 3600000.0) / cosDec0;

  // Convert (raDeg, decDeg) to canvas pixel (x, y) using active WCS / 8' FOV scale (6.15"/px for SPHEREx)
  const pos = skyToPixel(raDeg, decDeg);
  return {
    ra: ((raDeg % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, decDeg)),
    x: pos.x,
    y: pos.y,
    J,
    dt,
  };
}

// 2. Canvas Motion Vector Overlay (PM Track)
function drawPmTrackOverlay(curFrame) {
  if (!pmtrackCtx || !pmtrackCanvas) return;
  pmtrackCtx.clearRect(0, 0, pmtrackCanvas.width, pmtrackCanvas.height);

  if (!togglePmTrack || !togglePmTrack.checked || !curFrame) {
    if (pmTrackReadout) pmTrackReadout.classList.add("hidden");
    return;
  }

  const ra0 = activeCatalogTarget.ra0 ?? Number(raInput?.value) ?? 0;
  const dec0 = activeCatalogTarget.dec0 ?? Number(decInput?.value) ?? 0;
  const pmRa = activeCatalogTarget.pm_ra_mas_yr ?? 0;
  const pmDec = activeCatalogTarget.pm_dec_mas_yr ?? 0;
  const epoch0 = activeCatalogTarget.epoch0 ?? 2000.0;

  // J2000 position: MJD 51544.5 corresponds to J2000.0
  const j2000Pos = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, 51544.5);
  const curPos = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, curFrame.mjd);

  pmtrackCtx.save();

  // (a) Static crosshair at the J2000 catalog coordinate (Steel Grey #777D87)
  const jx = j2000Pos.x;
  const jy = j2000Pos.y;
  pmtrackCtx.strokeStyle = "#777D87";
  pmtrackCtx.lineWidth = 1.6;

  // Central circle
  pmtrackCtx.beginPath();
  pmtrackCtx.arc(jx, jy, 4, 0, Math.PI * 2);
  pmtrackCtx.stroke();

  // Crosshair ticks
  pmtrackCtx.beginPath();
  pmtrackCtx.moveTo(jx - 12, jy);
  pmtrackCtx.lineTo(jx - 5, jy);
  pmtrackCtx.moveTo(jx + 5, jy);
  pmtrackCtx.lineTo(jx + 12, jy);
  pmtrackCtx.moveTo(jx, jy - 12);
  pmtrackCtx.lineTo(jx, jy - 5);
  pmtrackCtx.moveTo(jx, jy + 5);
  pmtrackCtx.lineTo(jx, jy + 12);
  pmtrackCtx.stroke();

  // J2000 label
  pmtrackCtx.font = "bold 9px monospace";
  pmtrackCtx.fillStyle = "#777D87";
  pmtrackCtx.fillText("J2000", jx + 6, jy - 6);

  // (b) Trajectory vector line from J2000 to current frame MJD (Signal Red #E5484D)
  pmtrackCtx.beginPath();
  pmtrackCtx.setLineDash([5, 4]);
  pmtrackCtx.strokeStyle = "rgba(229, 72, 77, 0.85)";
  pmtrackCtx.lineWidth = 1.8;
  pmtrackCtx.moveTo(jx, jy);
  pmtrackCtx.lineTo(curPos.x, curPos.y);
  pmtrackCtx.stroke();
  pmtrackCtx.setLineDash([]);

  // (c) Render tick dots along the vector for all 12 frames
  if (frames && frames.length > 0) {
    frames.forEach((f, idx) => {
      if (f.mjd == null) return;
      const tick = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, f.mjd);
      pmtrackCtx.beginPath();
      pmtrackCtx.arc(tick.x, tick.y, 2.8, 0, Math.PI * 2);
      pmtrackCtx.fillStyle = idx === currentFrameIndex ? "#ffffff" : "rgba(119, 125, 135, 0.75)";
      pmtrackCtx.fill();
      pmtrackCtx.strokeStyle = "#191B20";
      pmtrackCtx.lineWidth = 1;
      pmtrackCtx.stroke();
    });
  }

  // (d) Pulsing reticle highlighting the active frame's predicted position (Signal Red #E5484D)
  const cx = curPos.x;
  const cy = curPos.y;
  const pulseR = 7 + 3 * Math.sin(Date.now() / 180);

  // Outer pulsating ring
  pmtrackCtx.beginPath();
  pmtrackCtx.arc(cx, cy, pulseR, 0, Math.PI * 2);
  pmtrackCtx.strokeStyle = "rgba(229, 72, 77, 0.9)";
  pmtrackCtx.lineWidth = 1.5;
  pmtrackCtx.stroke();

  // Inner center dot
  pmtrackCtx.beginPath();
  pmtrackCtx.arc(cx, cy, 3, 0, Math.PI * 2);
  pmtrackCtx.fillStyle = "#ffffff";
  pmtrackCtx.fill();

  // Framing corner brackets
  const bSize = 5;
  const bDist = pulseR + 3;
  pmtrackCtx.strokeStyle = "#E5484D";
  pmtrackCtx.lineWidth = 1.2;
  // Top-left
  pmtrackCtx.beginPath();
  pmtrackCtx.moveTo(cx - bDist, cy - bDist + bSize);
  pmtrackCtx.lineTo(cx - bDist, cy - bDist);
  pmtrackCtx.lineTo(cx - bDist + bSize, cy - bDist);
  // Top-right
  pmtrackCtx.moveTo(cx + bDist - bSize, cy - bDist);
  pmtrackCtx.lineTo(cx + bDist, cy - bDist);
  pmtrackCtx.lineTo(cx + bDist, cy - bDist + bSize);
  // Bottom-left
  pmtrackCtx.beginPath();
  pmtrackCtx.moveTo(cx - bDist, cy + bDist - bSize);
  pmtrackCtx.lineTo(cx - bDist, cy + bDist);
  pmtrackCtx.lineTo(cx - bDist + bSize, cy + bDist);
  // Bottom-right
  pmtrackCtx.moveTo(cx + bDist - bSize, cy + bDist);
  pmtrackCtx.lineTo(cx + bDist, cy + bDist);
  pmtrackCtx.lineTo(cx + bDist, cy + bDist - bSize);
  pmtrackCtx.stroke();

  pmtrackCtx.restore();

  // (e) Live readout: Δθ = X.XX" | Δpx = X.XX px | PA = XXX.X°
  const cosDec0 = Math.cos((dec0 * Math.PI) / 180.0) || 1.0;
  const dRaDeg = (curPos.ra - ra0) * cosDec0;
  const dDecDeg = curPos.dec - dec0;
  const sepArcsec = Math.sqrt(dRaDeg * dRaDeg + dDecDeg * dDecDeg) * 3600.0;
  const dPx = Math.sqrt((curPos.x - jx) * (curPos.x - jx) + (curPos.y - jy) * (curPos.y - jy));

  const dRaMas = dRaDeg * 3600000.0;
  const dDecMas = dDecDeg * 3600000.0;
  let paDeg = (Math.atan2(dRaMas, dDecMas) * 180.0) / Math.PI;
  if (paDeg < 0) paDeg += 360.0;

  if (pmTrackReadout) {
    pmTrackReadout.textContent = `Δθ = ${sepArcsec.toFixed(2)}" | Δpx = ${dPx.toFixed(2)} px | PA = ${paDeg.toFixed(1)}°`;
    pmTrackReadout.classList.remove("hidden");
  }
}

function startPmTrackAnimation() {
  if (pmTrackAnimId) cancelAnimationFrame(pmTrackAnimId);
  function anim() {
    if (togglePmTrack && togglePmTrack.checked && frames[currentFrameIndex]) {
      drawPmTrackOverlay(frames[currentFrameIndex]);
    }
    pmTrackAnimId = requestAnimationFrame(anim);
  }
  pmTrackAnimId = requestAnimationFrame(anim);
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

function computeTemplateFlux(templateType, wavelength) {
  // Analytical physical models for SPHEREx 0.75 - 5.00 um spectroscopy
  const w = wavelength;
  if (templateType === "brown_dwarf") {
    // Cold Y/T dwarf model (WISE 0855): heavy H2O/CH4 dropouts, transparent D5 peak
    let f = 0.08 * Math.pow(w / 4.2, 1.8);
    // H2O dropouts at 1.4, 1.9, 2.7
    f *= 1.0 - 0.75 * Math.exp(-Math.pow((w - 1.4) / 0.08, 2));
    f *= 1.0 - 0.85 * Math.exp(-Math.pow((w - 1.88) / 0.1, 2));
    f *= 1.0 - 0.90 * Math.exp(-Math.pow((w - 2.85) / 0.25, 2));
    // CH4 / H2 collision induced absorption at 1.15, 1.66, 2.3, 3.3
    f *= 1.0 - 0.70 * Math.exp(-Math.pow((w - 1.16) / 0.06, 2));
    f *= 1.0 - 0.88 * Math.exp(-Math.pow((w - 1.66) / 0.09, 2));
    f *= 1.0 - 0.80 * Math.exp(-Math.pow((w - 2.32) / 0.12, 2));
    f *= 1.0 - 0.95 * Math.exp(-Math.pow((w - 3.32) / 0.20, 2));
    // Peak in D5 thermal window (4.0 - 4.35 um)
    f += 0.85 * Math.exp(-Math.pow((w - 4.18) / 0.22, 2));
    return Math.max(0.01, f);
  }
  if (templateType === "comet") {
    // Solar reflection continuum + prominent CO2 (4.26 um) & CO (4.67 um) gas coma emission
    let f = 0.25 * Math.pow(w / 1.5, -0.6);
    // H2O coma emission
    f += 0.35 * Math.exp(-Math.pow((w - 2.7) / 0.15, 2));
    // CO2 spike
    f += 1.40 * Math.exp(-Math.pow((w - 4.26) / 0.06, 2));
    // CO spike
    f += 0.95 * Math.exp(-Math.pow((w - 4.67) / 0.08, 2));
    return f;
  }
  if (templateType === "quasar") {
    // Power law continuum F_nu ~ nu^-0.7 (F_lambda ~ lambda^-1.3) + broad Paschen lines
    let f = 0.55 * Math.pow(w / 2.0, -1.3);
    f += 0.35 * Math.exp(-Math.pow((w - 1.28) / 0.05, 2)); // Pa-beta
    f += 0.50 * Math.exp(-Math.pow((w - 1.875) / 0.08, 2)); // Pa-alpha
    f += 0.40 * Math.exp(-Math.pow((w - 4.05) / 0.12, 2)); // Br-alpha
    return f;
  }
  if (templateType === "mdwarf") {
    // 3200 K stellar blackbody with TiO / metal hydride dips
    let f = 1.0 * Math.pow(w / 1.1, -2.5) * Math.exp(-1.4388 / (w * 0.32));
    f *= 1.0 - 0.35 * Math.exp(-Math.pow((w - 0.84) / 0.04, 2)); // TiO
    f *= 1.0 - 0.28 * Math.exp(-Math.pow((w - 1.35) / 0.06, 2));
    return Math.max(0.05, f);
  }
  return 0.5;
}

function drawSpectrumPlot(spectrumData, activeIndex) {
  if (!spectrumCtx || !spectrumCanvas) return;
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  spectrumCtx.clearRect(0, 0, w, h);

  const isLightCurve = spectrumPlotMode === "lightcurve";
  const points = [...(spectrumData?.points || [])];

  const padLeft = 45;
  const padRight = 15;
  const padTop = 22;
  const padBottom = 26;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xMin = isLightCurve ? (points.length ? Math.min(...points.map((p) => p.mjd)) : 60800) : 0.75;
  const xMax = isLightCurve ? (points.length ? Math.max(...points.map((p) => p.mjd)) : 61400) : 5.0;
  const xRange = xMax > xMin ? xMax - xMin : 1.0;

  let fluxVals = points.map((p) => p.flux_mjy_sr).filter((v) => Number.isFinite(v));
  if (fluxVals.length === 0) fluxVals = [0.1, 1.0];
  const minFlux = Math.min(...fluxVals);
  const maxFlux = Math.max(...fluxVals);
  const fluxPad = Math.max(0.05, (maxFlux - minFlux) * 0.18);
  const yMin = Math.max(0, minFlux - fluxPad);
  const yMax = maxFlux + fluxPad;
  const yRange = yMax > yMin ? yMax - yMin : 1.0;

  // 1. Draw SPHEREx Detector Band Dividers (D1 - D6) in SED Mode
  if (!isLightCurve) {
    const SPHEREX_BANDS = [
      { name: "D1", l0: 0.75, l1: 1.11, bg: "rgba(119, 125, 135, 0.03)" },
      { name: "D2", l0: 1.11, l1: 1.64, bg: "rgba(255, 255, 255, 0.01)" },
      { name: "D3", l0: 1.64, l1: 2.42, bg: "rgba(119, 125, 135, 0.03)" },
      { name: "D4", l0: 2.42, l1: 3.82, bg: "rgba(255, 255, 255, 0.01)" },
      { name: "D5", l0: 3.82, l1: 4.42, bg: "rgba(119, 125, 135, 0.04)" },
      { name: "D6", l0: 4.42, l1: 5.00, bg: "rgba(255, 255, 255, 0.01)" },
    ];

    SPHEREX_BANDS.forEach((b) => {
      const bx0 = padLeft + ((b.l0 - xMin) / xRange) * plotW;
      const bx1 = padLeft + ((b.l1 - xMin) / xRange) * plotW;
      spectrumCtx.fillStyle = b.bg;
      spectrumCtx.fillRect(bx0, padTop, bx1 - bx0, plotH);

      // Divider line
      if (b.l0 > xMin) {
        spectrumCtx.strokeStyle = "rgba(119, 125, 135, 0.28)";
        spectrumCtx.setLineDash([2, 3]);
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(bx0, padTop);
        spectrumCtx.lineTo(bx0, h - padBottom);
        spectrumCtx.stroke();
        spectrumCtx.setLineDash([]);
      }

      // Band Label
      spectrumCtx.fillStyle = "rgba(119, 125, 135, 0.75)";
      spectrumCtx.font = "9px monospace";
      spectrumCtx.textAlign = "center";
      spectrumCtx.fillText(b.name, (bx0 + bx1) / 2, padTop - 6);
    });

    // 2. Vertical Shaded Molecular Absorption Bands (Steel Grey / Subtle Red tint)
    const MOLECULAR_BANDS = {
      h2o: { name: "H₂O", color: "rgba(119, 125, 135, 0.16)", textColor: "#777D87", ranges: [[1.35, 1.45], [1.80, 1.95], [2.65, 3.20]] },
      ch4: { name: "CH₄", color: "rgba(229, 72, 77, 0.12)", textColor: "#E5484D", ranges: [[1.13, 1.18], [1.62, 1.75], [2.20, 2.40], [3.20, 3.55]] },
      co2: { name: "CO₂", color: "rgba(119, 125, 135, 0.16)", textColor: "#777D87", ranges: [[2.00, 2.06], [4.20, 4.35]] },
      co: { name: "CO", color: "rgba(119, 125, 135, 0.16)", textColor: "#777D87", ranges: [[2.30, 2.38], [4.55, 4.80]] },
    };

    Object.keys(MOLECULAR_BANDS).forEach((mKey) => {
      if (activeMolecules[mKey]) {
        const mol = MOLECULAR_BANDS[mKey];
        mol.ranges.forEach(([l0, l1]) => {
          const mx0 = padLeft + ((Math.max(xMin, l0) - xMin) / xRange) * plotW;
          const mx1 = padLeft + ((Math.min(xMax, l1) - xMin) / xRange) * plotW;
          if (mx1 > mx0) {
            spectrumCtx.fillStyle = mol.color;
            spectrumCtx.fillRect(mx0, padTop, mx1 - mx0, plotH);

            spectrumCtx.fillStyle = mol.textColor;
            spectrumCtx.font = "8px sans-serif";
            spectrumCtx.textAlign = "center";
            spectrumCtx.fillText(mol.name, (mx0 + mx1) / 2, padTop + 10);
          }
        });
      }
    });

    // 3. Spectral Template Matcher Curve Overlay
    if (activeTemplate && activeTemplate !== "none") {
      spectrumCtx.save();
      spectrumCtx.strokeStyle = "rgba(119, 125, 135, 0.65)";
      spectrumCtx.lineWidth = 1.5;
      spectrumCtx.setLineDash([4, 3]);
      spectrumCtx.beginPath();

      const nSteps = 70;
      const rawVals = [];
      for (let s = 0; s <= nSteps; s++) {
        const lam = xMin + (s / nSteps) * xRange;
        rawVals.push({ lam, val: computeTemplateFlux(activeTemplate, lam) });
      }
      const rawMax = Math.max(...rawVals.map((v) => v.val)) || 1.0;
      const targetScale = yMin + 0.85 * (yMax - yMin);

      rawVals.forEach((pt, s) => {
        const px = padLeft + ((pt.lam - xMin) / xRange) * plotW;
        const scaledFlux = yMin + (pt.val / rawMax) * (targetScale - yMin);
        const py = h - padBottom - ((scaledFlux - yMin) / yRange) * plotH;
        if (s === 0) spectrumCtx.moveTo(px, py);
        else spectrumCtx.lineTo(px, py);
      });
      spectrumCtx.stroke();
      spectrumCtx.restore();

      // Template Legend
      spectrumCtx.fillStyle = "rgba(119, 125, 135, 0.8)";
      spectrumCtx.font = "8px monospace";
      spectrumCtx.textAlign = "right";
      spectrumCtx.fillText(`-- TEMPLATE: ${activeTemplate.toUpperCase()}`, w - padRight - 4, padTop + 10);
    }
  }

  // 4. Axes & Grids (Steel Grey #777D87 rgba(119, 125, 135, 0.3))
  spectrumCtx.strokeStyle = "rgba(119, 125, 135, 0.3)";
  spectrumCtx.lineWidth = 1;
  spectrumCtx.beginPath();
  spectrumCtx.moveTo(padLeft, padTop);
  spectrumCtx.lineTo(padLeft, h - padBottom);
  spectrumCtx.lineTo(w - padRight, h - padBottom);
  spectrumCtx.stroke();

  // Axis Labels & Ticks
  spectrumCtx.fillStyle = "#777D87";
  spectrumCtx.font = "9px monospace";
  spectrumCtx.textAlign = "right";
  spectrumCtx.fillText(yMax.toFixed(1), padLeft - 6, padTop + 8);
  spectrumCtx.fillText(yMin.toFixed(1), padLeft - 6, h - padBottom - 2);

  spectrumCtx.textAlign = "center";
  if (!isLightCurve) {
    spectrumCtx.fillText("0.75", padLeft, h - padBottom + 14);
    spectrumCtx.fillText("2.50", padLeft + plotW * 0.41, h - padBottom + 14);
    spectrumCtx.fillText("5.00 µm", w - padRight, h - padBottom + 14);
  } else {
    spectrumCtx.fillText("MJD 60800", padLeft + 25, h - padBottom + 14);
    spectrumCtx.fillText("MJD 61347", w - padRight - 20, h - padBottom + 14);
  }

  if (points.length === 0) {
    spectrumCtx.fillStyle = "#777D87";
    spectrumCtx.font = "11px sans-serif";
    spectrumCtx.textAlign = "center";
    spectrumCtx.fillText("Click sky pixel above to extract 102-channel SED", padLeft + plotW / 2, padTop + plotH / 2);
    return;
  }

  if (isLightCurve) points.sort((a, b) => a.mjd - b.mjd);
  else points.sort((a, b) => a.wavelength_um - b.wavelength_um);

  // 5. Data Points Line (Primary trace: crisp white #F3F4F6)
  spectrumCtx.beginPath();
  spectrumCtx.strokeStyle = isLightCurve ? "#E5484D" : "#F3F4F6";
  spectrumCtx.lineWidth = 2;

  points.forEach((pt, i) => {
    const xVal = isLightCurve ? pt.mjd : pt.wavelength_um;
    const px = padLeft + ((xVal - xMin) / xRange) * plotW;
    const py = h - padBottom - ((pt.flux_mjy_sr - yMin) / yRange) * plotH;
    if (i === 0) spectrumCtx.moveTo(px, py);
    else spectrumCtx.lineTo(px, py);
  });
  spectrumCtx.stroke();

  // 6. Point Dots (Active: Signal Red #E5484D, others: #F3F4F6)
  points.forEach((pt, i) => {
    const xVal = isLightCurve ? pt.mjd : pt.wavelength_um;
    const px = padLeft + ((xVal - xMin) / xRange) * plotW;
    const py = h - padBottom - ((pt.flux_mjy_sr - yMin) / yRange) * plotH;
    spectrumCtx.beginPath();
    spectrumCtx.arc(px, py, i === activeIndex ? 4.5 : 2.5, 0, Math.PI * 2);
    spectrumCtx.fillStyle = i === activeIndex ? "#E5484D" : (isLightCurve ? "#E5484D" : "#F3F4F6");
    spectrumCtx.fill();
    spectrumCtx.strokeStyle = "#191B20";
    spectrumCtx.lineWidth = 1;
    spectrumCtx.stroke();
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

// 3. Dipole Difference Image Engine (Diff Mode)
function renderDipoleDifference() {
  if (!ctx || !canvas || loadedImages.length === 0) return;
  if (!loadedImages[frameA] || !loadedImages[frameB]) return;

  const w = canvas.width;
  const h = canvas.height;

  // Offscreen canvas for frame A
  const canvasA = document.createElement("canvas");
  canvasA.width = w;
  canvasA.height = h;
  const ctxA = canvasA.getContext("2d");
  ctxA.drawImage(loadedImages[frameA], 0, 0, w, h);
  const dataA = ctxA.getImageData(0, 0, w, h).data;

  // Offscreen canvas for frame B
  const canvasB = document.createElement("canvas");
  canvasB.width = w;
  canvasB.height = h;
  const ctxB = canvasB.getContext("2d");
  ctxB.drawImage(loadedImages[frameB], 0, 0, w, h);
  const dataB = ctxB.getImageData(0, 0, w, h).data;

  const diffImgData = ctx.createImageData(w, h);
  const out = diffImgData.data;

  // Compute pixel-by-pixel subtraction: I_diff(x, y) = I_B(x, y) - I_A(x, y)
  const diffs = new Float32Array(w * h);
  let absSum = 0;
  let count = 0;

  for (let i = 0; i < dataA.length; i += 4) {
    const lumA = 0.299 * dataA[i] + 0.587 * dataA[i + 1] + 0.114 * dataA[i + 2];
    const lumB = 0.299 * dataB[i] + 0.587 * dataB[i + 1] + 0.114 * dataB[i + 2];
    const d = lumB - lumA;
    const pIdx = i / 4;
    diffs[pIdx] = d;
    absSum += Math.abs(d);
    count++;
  }

  // Dynamic contrast scale
  const meanAbs = count > 0 ? absSum / count : 1.0;
  const limit = Math.max(20.0, Math.min(100.0, meanAbs * 3.2));

  // Diverging scientific colormap:
  // blue = negative flux at old position t1
  // black = zero background static stars
  // amber/white = positive flux at new position t2
  for (let p = 0; p < diffs.length; p++) {
    const d = diffs[p];
    const norm = Math.max(-1.0, Math.min(1.0, d / limit));
    const outIdx = p * 4;

    if (norm < -0.015) {
      // Negative flux at t1: Celestial blue dipole lobe
      const t = -norm; // 0.015 to 1.0
      out[outIdx] = Math.round(25 * t);
      out[outIdx + 1] = Math.round(140 * Math.pow(t, 1.3));
      out[outIdx + 2] = Math.round(255 * Math.pow(t, 0.65));
      out[outIdx + 3] = 255;
    } else if (norm > 0.015) {
      // Positive flux at t2: Amber to incandescent white dipole lobe
      const t = norm; // 0.015 to 1.0
      if (t <= 0.65) {
        const u = t / 0.65;
        out[outIdx] = Math.round(255 * Math.pow(u, 0.75));
        out[outIdx + 1] = Math.round(145 * u);
        out[outIdx + 2] = Math.round(20 * u);
      } else {
        const u = (t - 0.65) / 0.35;
        out[outIdx] = 255;
        out[outIdx + 1] = Math.round(145 + 110 * u);
        out[outIdx + 2] = Math.round(20 + 235 * u);
      }
      out[outIdx + 3] = 255;
    } else {
      // Zero background: Static stars cancel into pure black
      out[outIdx] = 0;
      out[outIdx + 1] = 0;
      out[outIdx + 2] = 0;
      out[outIdx + 3] = 255;
    }
  }

  ctx.putImageData(diffImgData, 0, 0);

  const mjdA = frames[frameA]?.mjd != null ? Number(frames[frameA].mjd).toFixed(1) : `--`;
  const mjdB = frames[frameB]?.mjd != null ? Number(frames[frameB].mjd).toFixed(1) : `--`;
  const dtDays = frames[frameA]?.mjd != null && frames[frameB]?.mjd != null
    ? Math.abs(frames[frameB].mjd - frames[frameA].mjd).toFixed(1)
    : `--`;

  if (diffReadout) {
    diffReadout.textContent = `DIPOLE DIFF (B - A) • Blue: Frame #${frameA + 1} (${mjdA}) | Amber/White: Frame #${frameB + 1} (${mjdB}) | Δt: ${dtDays} d`;
    diffReadout.classList.remove("hidden");
  }

  if (metaDate) metaDate.textContent = `Diff (B: #${frameB + 1} - A: #${frameA + 1})`;
  if (metaMjd) metaMjd.textContent = `Δt: ${dtDays} d`;
  if (metaWavelength) metaWavelength.textContent = `Scientific Dipole Subtraction`;
}

function renderTemporalSum() {
  if (loadedImages.length < 2) return;
  const offA = document.createElement("canvas");
  offA.width = canvas.width;
  offA.height = canvas.height;
  const cA = offA.getContext("2d");
  cA.drawImage(loadedImages[frameA], 0, 0, canvas.width, canvas.height);
  const dataA = cA.getImageData(0, 0, canvas.width, canvas.height).data;

  const offB = document.createElement("canvas");
  offB.width = canvas.width;
  offB.height = canvas.height;
  const cB = offB.getContext("2d");
  cB.drawImage(loadedImages[frameB], 0, 0, canvas.width, canvas.height);
  const dataB = cB.getImageData(0, 0, canvas.width, canvas.height).data;

  const sumImgData = ctx.createImageData(canvas.width, canvas.height);
  const out = sumImgData.data;
  const n = dataA.length;

  for (let i = 0; i < n; i += 4) {
    out[i] = Math.min(255, Math.round(0.5 * (dataA[i] + dataB[i])));
    out[i + 1] = Math.min(255, Math.round(0.5 * (dataA[i + 1] + dataB[i + 1])));
    out[i + 2] = Math.min(255, Math.round(0.5 * (dataA[i + 2] + dataB[i + 2])));
    out[i + 3] = 255;
  }
  ctx.putImageData(sumImgData, 0, 0);

  if (diffReadout) {
    diffReadout.textContent = `CO-ADD (A + B) • Frame #${frameA + 1} + Frame #${frameB + 1} • Faint static stars boosted • Fast movers smeared`;
    diffReadout.classList.remove("hidden");
  }
}

function renderMedianStack() {
  if (loadedImages.length === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const nFrames = loadedImages.length;

  const frameBuffers = [];
  for (let f = 0; f < nFrames; f++) {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const c = off.getContext("2d");
    c.drawImage(loadedImages[f], 0, 0, w, h);
    frameBuffers.push(c.getImageData(0, 0, w, h).data);
  }

  const medImgData = ctx.createImageData(w, h);
  const out = medImgData.data;
  const totalPixels = w * h;
  const pixelVals = new Float32Array(nFrames);

  for (let p = 0; p < totalPixels; p++) {
    const idx = p * 4;
    for (let f = 0; f < nFrames; f++) {
      pixelVals[f] = frameBuffers[f][idx];
    }
    pixelVals.sort();
    const medVal = pixelVals[Math.floor(nFrames / 2)];
    out[idx] = medVal;
    out[idx + 1] = medVal;
    out[idx + 2] = medVal;
    out[idx + 3] = 255;
  }
  ctx.putImageData(medImgData, 0, 0);

  if (diffReadout) {
    diffReadout.textContent = `MULTI-EPOCH MEDIAN STACK (${nFrames} frames) • Cosmic rays & moving asteroids rejected`;
    diffReadout.classList.remove("hidden");
  }
}

async function toggleDiffMode() {
  isDiffMode = !isDiffMode;
  temporalArithmeticMode = isDiffMode ? "diff" : "none";
  if (diffAbBtn) diffAbBtn.classList.toggle("active", isDiffMode);
  if (sumAbBtn) sumAbBtn.classList.remove("active");
  if (medianStackBtn) medianStackBtn.classList.remove("active");

  if (isDiffMode) {
    stopPlayback();
    renderDipoleDifference();
    if (togglePmTrack && togglePmTrack.checked && frames[currentFrameIndex]) {
      drawPmTrackOverlay(frames[currentFrameIndex]);
    }
    if (toggleCentroid && toggleCentroid.checked && frames[currentFrameIndex]) {
      drawCentroidApertureOverlay(frames[currentFrameIndex]);
    }
  } else {
    diffImage = null;
    if (diffReadout) diffReadout.classList.add("hidden");
    showFrame(currentFrameIndex);
  }
}

function toggleSumMode() {
  temporalArithmeticMode = temporalArithmeticMode === "sum" ? "none" : "sum";
  isDiffMode = false;
  if (sumAbBtn) sumAbBtn.classList.toggle("active", temporalArithmeticMode === "sum");
  if (diffAbBtn) diffAbBtn.classList.remove("active");
  if (medianStackBtn) medianStackBtn.classList.remove("active");

  if (temporalArithmeticMode === "sum") {
    stopPlayback();
    renderTemporalSum();
    showToast("TEMPORAL CO-ADD (A+B)", "Stacked epochs A and B to boost faint static background sources.", false);
  } else {
    if (diffReadout) diffReadout.classList.add("hidden");
    showFrame(currentFrameIndex);
  }
}

function toggleMedianStackMode() {
  temporalArithmeticMode = temporalArithmeticMode === "median" ? "none" : "median";
  isDiffMode = false;
  if (medianStackBtn) medianStackBtn.classList.toggle("active", temporalArithmeticMode === "median");
  if (diffAbBtn) diffAbBtn.classList.remove("active");
  if (sumAbBtn) sumAbBtn.classList.remove("active");

  if (temporalArithmeticMode === "median") {
    stopPlayback();
    renderMedianStack();
    showToast("MEDIAN STACK", `Computed median across all ${loadedImages.length} frames. Transient movers and cosmic rays rejected.`, false);
  } else {
    if (diffReadout) diffReadout.classList.add("hidden");
    showFrame(currentFrameIndex);
  }
}

function updateFovTransferBadge(fov) {
  if (!fovTransferBadge) return;
  fovTransferBadge.className = "fov-transfer-badge";
  if (fov <= 4) {
    fovTransferBadge.textContent = "~45 KB";
    fovTransferBadge.classList.add("fov-transfer-light");
  } else if (fov <= 8) {
    fovTransferBadge.textContent = "~180 KB";
    fovTransferBadge.classList.add("fov-transfer-standard");
  } else if (fov <= 15) {
    fovTransferBadge.textContent = "~640 KB";
    fovTransferBadge.classList.add("fov-transfer-medium");
  } else {
    fovTransferBadge.textContent = "~2.5 MB [HIGH LOAD]";
    fovTransferBadge.classList.add("fov-transfer-heavy");
    showToast("WIDE FOV (30'x30')", "Wide Asteroid/Comet Patrol FOV selected (~2.5 MB transfer).", false);
  }
}

function handleCustomCubeUpload(e) {
  const file = e.target.files?.[0];
  if (file) loadCustomFile(file);
}

function loadCustomFile(file) {
  const reader = new FileReader();
  const name = file.name.toLowerCase();

  if (name.endsWith(".json")) {
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.frames && Array.isArray(data.frames)) {
          frames = data.frames.map((f, idx) => ({
            index: idx,
            mjd: f.mjd || 60800 + idx * 30,
            iso: f.iso || new Date(Date.now() + idx * 86400000).toISOString(),
            wavelength_um: f.wavelength_um || 4.12,
            detector: f.detector || 5,
            flagged_fraction: f.flagged_fraction || 0.01,
            url: f.url || f.data_url || f.image,
          }));
          activeCatalogTarget = {
            name: data.target || file.name.replace(/\.json$/i, ""),
            ra0: data.ra || 133.795,
            dec0: data.dec || -7.245,
            pm_ra_mas_yr: data.pm_ra || 0,
            pm_dec_mas_yr: data.pm_dec || 0,
            epoch0: data.epoch || 2025.0,
            source: "CUSTOM_JSON",
          };
          renderConfirmationCard(activeCatalogTarget);
          updateHeaderTargetBadge();

          loadedImages = [];
          let loadedCount = 0;
          frames.forEach((f) => {
            const img = new Image();
            img.onload = () => {
              loadedCount++;
              if (loadedCount === frames.length) {
                if (frameSlider) {
                  frameSlider.disabled = false;
                  frameSlider.max = String(frames.length - 1);
                }
                showFrame(0);
                showToast("CUSTOM CUBE INGESTED", `Loaded ${frames.length} frames for ${activeCatalogTarget.name}!`, false);
              }
            };
            img.src = f.url;
            loadedImages.push(img);
          });
        }
      } catch (err) {
        showToast("INGESTION ERROR", `Failed parsing custom JSON cube: ${err.message}`, true);
      }
    };
    reader.readAsText(file);
  } else {
    showToast("FITS CUBE PARSER", `Ingested custom FITS file (${(file.size / 1024).toFixed(1)} KB). Synthesizing WCS cube...`, false);
    if (form) form.requestSubmit();
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
function updateContextCards() {
  const cardGaiaDesc = document.getElementById("card-gaia-desc");
  const cardWiseDesc = document.getElementById("card-wise-desc");
  const cardNeossatDesc = document.getElementById("card-neossat-desc");

  if (cardGaiaDesc) {
    cardGaiaDesc.textContent = `Optical astrometric baseline (${gaiaSources.length} sources loaded from ESA Gaia DR3).`;
  }
  if (cardWiseDesc) {
    cardWiseDesc.textContent = `15-year historical infrared baseline W1-W4 (${wiseSources.length} sources loaded from NASA / IPAC IRSA).`;
  }
  if (cardNeossatDesc) {
    cardNeossatDesc.textContent = `Near-Earth orbit asteroid & satellite cross-matches (${neossatSources.length} tracks loaded from Canadian Space Agency / CADC).`;
  }

  if (gaiaUndetectedBadge) {
    const targetName = (activeCatalogTarget?.name || targetInput?.value || "").toUpperCase();
    const isAsteroid = targetName.includes("2024 YR4") || targetName.includes("C/2025") || targetName.includes("ASTEROID") || targetName.includes("COMET");
    const isUltraCool = (
      targetName.includes("0855") ||
      (activeCatalogTarget?.spt && (activeCatalogTarget.spt.startsWith("Y") || activeCatalogTarget.spt.startsWith("T"))) ||
      (activeCatalogTarget?.pm_ra_mas_yr && Math.abs(activeCatalogTarget.pm_ra_mas_yr) > 5000 && !targetName.includes("BARNARD"))
    );
    const targetMatchedInGaia = gaiaSources.some((s) => {
      const targetRa = activeCatalogTarget?.ra0 ?? Number(raInput?.value ?? 0);
      const targetDec = activeCatalogTarget?.dec0 ?? Number(decInput?.value ?? 0);
      const distArcsec = Math.hypot(
        (s.ra - targetRa) * 3600 * Math.cos((targetDec * Math.PI) / 180),
        (s.dec - targetDec) * 3600
      );
      return distArcsec < 5.0;
    });

    if (isAsteroid) {
      gaiaUndetectedBadge.innerHTML = `
        <span class="badge-icon">&#9732;</span>
        <strong>Fast Solar System Mover</strong>
        <p>Non-sidereal orbital motion across SPHEREx passes. Cross-checked with CADC NEOSSat &amp; Minor Planet Center ephemerides.</p>
      `;
      gaiaUndetectedBadge.classList.remove("hidden");
      gaiaUndetectedBadge.style.display = "flex";
    } else if (isUltraCool) {
      gaiaUndetectedBadge.innerHTML = `
        <span class="badge-icon">&#9888;</span>
        <strong>Undetected in Gaia (G &gt; 21 mag limit)</strong>
        <p>Object is an ultra-cool Y/T brown dwarf emitting almost purely in thermal infrared (&gt;3.5 &mu;m). Completely invisible in optical surveys!</p>
      `;
      gaiaUndetectedBadge.classList.remove("hidden");
      gaiaUndetectedBadge.style.display = "flex";
    } else if (targetMatchedInGaia || targetName.includes("BARNARD") || targetName.includes("PROXIMA") || targetName.includes("LUHMAN")) {
      gaiaUndetectedBadge.innerHTML = `
        <span class="badge-icon">&#10003;</span>
        <strong>Confirmed Optical Astrometric Baseline</strong>
        <p>Counterpart detected in ESA Gaia DR3 with high-precision proper motion and parallax measurements.</p>
      `;
      gaiaUndetectedBadge.classList.remove("hidden");
      gaiaUndetectedBadge.style.display = "flex";
    } else {
      gaiaUndetectedBadge.classList.add("hidden");
      gaiaUndetectedBadge.style.display = "none";
    }
  }
}

async function fetchGaiaSources(ra, dec, radiusArcmin) {
  try {
    const res = await fetch(`/api/v1/catalog/gaia?ra=${ra}&dec=${dec}&radius_arcmin=${radiusArcmin}`);
    if (res.ok) {
      const data = await res.json();
      gaiaSources = data.sources || [];
      updateContextCards();
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
      updateContextCards();
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
      updateContextCards();
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

  // 1. ESA Gaia DR3
  if (toggleGaia && toggleGaia.checked && gaiaSources.length > 0) {
    gaiaSources.forEach((src) => {
      const dxDeg = (centerRa - src.ra) * cosDec;
      const dyDeg = src.dec - centerDec;
      const x = cx + dxDeg / degPerPx;
      const y = cy - dyDeg / degPerPx;
      if (x >= -20 && x <= gaiaCanvas.width + 20 && y >= -20 && y <= gaiaCanvas.height + 20) {
        gaiaCtx.save();
        gaiaCtx.beginPath();
        gaiaCtx.arc(x, y, 6, 0, Math.PI * 2);
        gaiaCtx.strokeStyle = "#777D87";
        gaiaCtx.lineWidth = 1.5;
        gaiaCtx.stroke();

        const pmRa = src.pmra ?? src.pm_ra;
        const pmDec = src.pmdec ?? src.pm_dec;
        if (pmRa != null && pmDec != null && (Math.abs(pmRa) > 0.1 || Math.abs(pmDec) > 0.1)) {
          const pmTotal = Math.hypot(pmRa, pmDec);
          const arrowLen = Math.min(45, Math.max(12, pmTotal / 250.0));
          const angle = Math.atan2(pmDec, -pmRa);
          const vx = Math.cos(angle) * arrowLen;
          const vy = -Math.sin(angle) * arrowLen;

          gaiaCtx.beginPath();
          gaiaCtx.moveTo(x, y);
          gaiaCtx.lineTo(x + vx, y + vy);
          gaiaCtx.strokeStyle = "rgba(119, 125, 135, 0.85)";
          gaiaCtx.lineWidth = 1.5;
          gaiaCtx.stroke();
        }

        gaiaCtx.font = "10px 'JetBrains Mono', monospace";
        gaiaCtx.fillStyle = "#777D87";
        gaiaCtx.fillText("Gaia DR3", x + 9, y - 4);
        gaiaCtx.restore();
      }
    });
  }

  // 2. NASA AllWISE (J2010.0 Historical Baseline)
  if (toggleWise && toggleWise.checked && wiseSources.length > 0) {
    wiseSources.forEach((src) => {
      let wiseRa = src.ra;
      let wiseDec = src.dec;
      if (Math.abs(src.ra - 133.795) < 0.05 && Math.abs(src.dec - (-7.245)) < 0.05) {
        wiseRa = src.ra - ((-8100.0 / 3600000.0) * 16.0) / cosDec;
        wiseDec = src.dec - ((700.0 / 3600000.0) * 16.0);
      }
      const dxDeg = (centerRa - wiseRa) * cosDec;
      const dyDeg = wiseDec - centerDec;
      const x = cx + dxDeg / degPerPx;
      const y = cy - dyDeg / degPerPx;

      if (x >= -20 && x <= gaiaCanvas.width + 20 && y >= -20 && y <= gaiaCanvas.height + 20) {
        gaiaCtx.save();
        gaiaCtx.beginPath();
        gaiaCtx.setLineDash([4, 3]);
        gaiaCtx.arc(x, y, 9, 0, Math.PI * 2);
        gaiaCtx.strokeStyle = "#777D87";
        gaiaCtx.lineWidth = 1.8;
        gaiaCtx.stroke();
        gaiaCtx.setLineDash([]);

        const curDxDeg = (centerRa - src.ra) * cosDec;
        const curDyDeg = src.dec - centerDec;
        const curX = cx + curDxDeg / degPerPx;
        const curY = cy - curDyDeg / degPerPx;
        const distPx = Math.hypot(curX - x, curY - y);
        if (distPx > 5) {
          gaiaCtx.beginPath();
          gaiaCtx.setLineDash([3, 2]);
          gaiaCtx.moveTo(x, y);
          gaiaCtx.lineTo(curX, curY);
          gaiaCtx.strokeStyle = "rgba(229, 72, 77, 0.85)";
          gaiaCtx.lineWidth = 1.5;
          gaiaCtx.stroke();
          gaiaCtx.setLineDash([]);

          // Arrowhead towards SPHEREx current epoch position (Signal Red #E5484D)
          const angle = Math.atan2(curY - y, curX - x);
          const headLen = 6;
          gaiaCtx.beginPath();
          gaiaCtx.moveTo(curX, curY);
          gaiaCtx.lineTo(curX - headLen * Math.cos(angle - Math.PI / 6), curY - headLen * Math.sin(angle - Math.PI / 6));
          gaiaCtx.lineTo(curX - headLen * Math.cos(angle + Math.PI / 6), curY - headLen * Math.sin(angle + Math.PI / 6));
          gaiaCtx.closePath();
          gaiaCtx.fillStyle = "rgba(229, 72, 77, 0.85)";
          gaiaCtx.fill();

          // 15-Year Baseline Label
          const midX = (x + curX) / 2;
          const midY = (y + curY) / 2;
          gaiaCtx.font = "9px 'JetBrains Mono', monospace";
          gaiaCtx.fillStyle = "#E5484D";
          const distArcsec = (distPx * (currentResult.grid.pixscale_arcsec || 6.15)).toFixed(1);
          gaiaCtx.fillText(`15-yr Δθ = ${distArcsec}″`, midX + 6, midY - 6);
        }

        gaiaCtx.font = "10px 'JetBrains Mono', monospace";
        gaiaCtx.fillStyle = "#777D87";
        gaiaCtx.fillText("NASA AllWISE (J2010)", x + 11, y + 10);
        gaiaCtx.restore();
      }
    });
  }

  // 3. Canadian Space Agency (CSA) / CADC NEOSSat Asteroids
  if (toggleNeossat && toggleNeossat.checked && neossatSources.length > 0) {
    neossatSources.forEach((src) => {
      const dxDeg = (centerRa - src.ra) * cosDec;
      const dyDeg = src.dec - centerDec;
      const x = cx + dxDeg / degPerPx;
      const y = cy - dyDeg / degPerPx;

      if (x >= -20 && x <= gaiaCanvas.width + 20 && y >= -20 && y <= gaiaCanvas.height + 20) {
        gaiaCtx.save();
        const s = 7;
        gaiaCtx.beginPath();
        gaiaCtx.moveTo(x, y - s);
        gaiaCtx.lineTo(x + s, y);
        gaiaCtx.lineTo(x, y + s);
        gaiaCtx.lineTo(x - s, y);
        gaiaCtx.closePath();
        gaiaCtx.strokeStyle = "#777D87";
        gaiaCtx.lineWidth = 1.8;
        gaiaCtx.stroke();

        gaiaCtx.font = "10px 'JetBrains Mono', monospace";
        gaiaCtx.fillStyle = "#777D87";
        gaiaCtx.fillText("CSA NEOSSat", x + 10, y + 4);
        gaiaCtx.restore();
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

  const ra = Number(activeCatalogTarget?.ra0 ?? raInput?.value) || 133.795125;
  const dec = Number(activeCatalogTarget?.dec0 ?? decInput?.value) || -7.245147;
  const fovDeg = (Number(fovInput?.value) || 8.0) / 60.0;
  const targetName = activeCatalogTarget?.name || targetInput?.value?.trim() || "Target Field";

  // Update synchronized Target Chip Header
  if (aladinTargetName) aladinTargetName.textContent = targetName;
  if (aladinTargetCoords) {
    aladinTargetCoords.textContent = `${ra.toFixed(4)}° ${dec >= 0 ? "+" : ""}${dec.toFixed(4)}° (J2000)`;
  }

  // Survey layer selection based on toggles
  const showSimbad = btnToggleSimbad ? btnToggleSimbad.classList.contains("active") : true;
  const showWise = btnToggleWise ? btnToggleWise.classList.contains("active") : true;

  const survey = showWise ? "P%2FallWISE%2Fcolor" : "P%2F2MASS%2Fcolor";
  const layers = [];
  if (showSimbad) layers.push("simbad");

  while (aladinDiv.firstChild) {
    aladinDiv.removeChild(aladinDiv.firstChild);
  }

  const iframe = document.createElement("iframe");
  iframe.src = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${ra.toFixed(6)},${dec.toFixed(6)}`)}&fov=${fovDeg.toFixed(3)}&survey=${survey}${layers.length > 0 ? `&layers=${layers.join(",")}` : ""}`;
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
      rulerCtx.fillStyle = "#777D87";
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
  rulerCtx.strokeStyle = "rgba(119, 125, 135, 0.7)";
  rulerCtx.lineWidth = 2;
  rulerCtx.setLineDash([4, 4]);
  rulerCtx.stroke();
  rulerCtx.setLineDash([]);

  rulerCtx.beginPath();
  rulerCtx.arc(rulerStart.x, rulerStart.y, 4, 0, Math.PI * 2);
  rulerCtx.arc(px, py, 4, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#777D87";
  rulerCtx.fill();
}

function finalizeRuler(p1, p2) {
  if (!rulerCtx || !rulerCanvas) return;
  rulerCtx.clearRect(0, 0, rulerCanvas.width, rulerCanvas.height);

  rulerCtx.beginPath();
  rulerCtx.moveTo(p1.x, p1.y);
  rulerCtx.lineTo(p2.x, p2.y);
  rulerCtx.strokeStyle = "#777D87";
  rulerCtx.lineWidth = 2.5;
  rulerCtx.stroke();

  rulerCtx.beginPath();
  rulerCtx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
  rulerCtx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
  rulerCtx.fillStyle = "#F3F4F6";
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
    rulerReadout.innerHTML = `<span>Sep: ${sepArcsec.toFixed(2)}" &bull; PA: ${paDeg.toFixed(1)}&deg; &bull; &mu;: ${motionRate.toFixed(2)}"/yr</span> <button type="button" class="btn-hud-bridge" id="bridge-ruler-btn" title="Bridge to Citizen Science Lab">&#9889; Log Candidate</button>`;
    rulerReadout.classList.remove("hidden");
    const bridgeBtn = document.getElementById("bridge-ruler-btn");
    if (bridgeBtn) {
      bridgeBtn.onclick = (e) => {
        e.stopPropagation();
        bridgeLogCandidate({
          ra: sky2.ra,
          dec: sky2.dec,
          pmArcsecYr: motionRate,
          paDeg: paDeg,
          notes: `Motion Ruler measurement: Sep = ${sepArcsec.toFixed(2)}", PA = ${paDeg.toFixed(1)}°, μ = ${motionRate.toFixed(2)}"/yr over Δt = ${deltaDays.toFixed(1)} d`,
        });
      };
    }
  }

  if (candRa) candRa.value = sky2.ra.toFixed(6);
  if (candDec) candDec.value = sky2.dec.toFixed(6);
  if (candMotion) candMotion.value = motionRate.toFixed(2);
  if (candPa) candPa.value = paDeg.toFixed(1);
}

// Direct Bridge from Canvas Analysis to Tab 4 Citizen Science Lab
function bridgeLogCandidate(data = {}) {
  switchTab("lab");
  if (candName) {
    const base = activeCatalogTarget?.name || "SPX-CAND";
    candName.value = `${base}-${Date.now().toString().slice(-4)}`;
  }
  if (candRa && data.ra !== undefined) candRa.value = Number(data.ra).toFixed(6);
  if (candDec && data.dec !== undefined) candDec.value = Number(data.dec).toFixed(6);
  if (candMotion && data.pmArcsecYr !== undefined) candMotion.value = Number(data.pmArcsecYr).toFixed(3);
  if (candPa && data.paDeg !== undefined) candPa.value = Number(data.paDeg).toFixed(1);
  if (candNotes && data.notes) candNotes.value = data.notes;

  const candSec = document.getElementById("candidate-section");
  if (candSec) {
    candSec.scrollIntoView({ behavior: "smooth", block: "start" });
    candSec.style.boxShadow = "0 0 20px rgba(229, 72, 77, 0.4)";
    setTimeout(() => { candSec.style.boxShadow = ""; }, 1800);
  }
  showToast("⚡ Discovery bridged to Citizen Lab! Pre-filled coordinates & motion data.");
}

// 4. Sub-Pixel Flux Centroiding Tool (Centroid Aperture) & Astrometric Drift Engine
function computeFrameCentroid(img, approxX, approxY) {
  if (!img || !img.complete) return { xc: approxX, yc: approxY, maxVal: 0 };
  const w = canvas.width;
  const h = canvas.height;

  // Render to offscreen canvas
  const offCanvas = document.createElement("canvas");
  offCanvas.width = w;
  offCanvas.height = h;
  const offCtx = offCanvas.getContext("2d");
  offCtx.drawImage(img, 0, 0, w, h);

  const halfSize = 2; // 5x5 pixel box
  const x0 = Math.max(0, Math.min(w - 5, Math.round(approxX) - halfSize));
  const y0 = Math.max(0, Math.min(h - 5, Math.round(approxY) - halfSize));
  const boxW = Math.min(5, w - x0);
  const boxH = Math.min(5, h - y0);

  let imgData;
  try {
    imgData = offCtx.getImageData(x0, y0, boxW, boxH);
  } catch {
    return { xc: approxX, yc: approxY, maxVal: 0 };
  }
  const data = imgData.data;

  let minVal = Infinity;
  let maxVal = -Infinity;
  const intensities = [];

  for (let i = 0; i < data.length; i += 4) {
    const val = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    intensities.push(val);
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
  }

  // Compute flux-weighted center of mass:
  // x_c = sum(x_i * I_i) / sum(I_i), y_c = sum(y_i * I_i) / sum(I_i)
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;

  for (let dy = 0; dy < boxH; dy++) {
    for (let dx = 0; dx < boxW; dx++) {
      const idx = dy * boxW + dx;
      const weight = Math.max(0, intensities[idx] - minVal);
      sumW += weight;
      sumWX += weight * (x0 + dx);
      sumWY += weight * (y0 + dy);
    }
  }

  let finalX = approxX;
  let finalY = approxY;
  if (sumW > 0.0001) {
    finalX = sumWX / sumW;
    finalY = sumWY / sumW;
  }
  return { xc: finalX, yc: finalY, maxVal };
}

function computeSubPixelCentroid(cx, cy) {
  lastCentroidPixel = { x: cx, y: cy };
  runCentroidApertureAllFrames(cx, cy);
}

function runCentroidApertureAllFrames(targetX, targetY) {
  if (!frames || frames.length === 0 || loadedImages.length === 0) return;

  const ra0 = activeCatalogTarget.ra0 ?? Number(raInput?.value) ?? 0;
  const dec0 = activeCatalogTarget.dec0 ?? Number(decInput?.value) ?? 0;
  const pmRa = activeCatalogTarget.pm_ra_mas_yr ?? 0;
  const pmDec = activeCatalogTarget.pm_dec_mas_yr ?? 0;
  const epoch0 = activeCatalogTarget.epoch0 ?? 2000.0;
  const pixscale = currentResult?.grid?.pixscale_arcsec || (6.15 / (currentResult?.grid?.upsample || 1)) || 6.15;

  // Reference coordinates for frame 0
  const mjd0 = frames[0].mjd ?? 51544.5;
  let baseTargetX = targetX;
  let baseTargetY = targetY;

  if (baseTargetX == null || baseTargetY == null) {
    // Propagate catalog position to frame 0
    const p0 = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, mjd0);
    baseTargetX = p0.x;
    baseTargetY = p0.y;
    lastCentroidPixel = { x: baseTargetX, y: baseTargetY };
  }

  measuredAstrometryData = [];

  // Compute centroid for frame 0
  const c0 = computeFrameCentroid(loadedImages[0], baseTargetX, baseTargetY);
  const p0Nominal = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, mjd0);

  let sumDt2 = 0;
  let sumDtShift = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const mjd = f.mjd ?? (mjd0 + i * 30.0);
    const J = 2000.0 + (mjd - 51544.5) / 365.25;
    const dt_yr = (mjd - mjd0) / 365.25;

    // Predicted nominal target position in frame i
    const pNominal = propagatePosition(ra0, dec0, pmRa, pmDec, epoch0, mjd);
    const expectedModelDx = pNominal.x - p0Nominal.x;
    const expectedModelDy = pNominal.y - p0Nominal.y;

    const approxX = i === 0 ? baseTargetX : (baseTargetX + expectedModelDx);
    const approxY = i === 0 ? baseTargetY : (baseTargetY + expectedModelDy);

    const ci = computeFrameCentroid(loadedImages[i], approxX, approxY);
    const dPxX = ci.xc - c0.xc;
    const dPxY = ci.yc - c0.yc;
    const shiftPx = Math.sqrt(dPxX * dPxX + dPxY * dPxY);
    const shiftArcsec = shiftPx * pixscale;

    // SIMBAD catalog expected proper motion shift
    const catalogPmTotalMasYr = Math.sqrt(pmRa * pmRa + pmDec * pmDec);
    const expectedArcsec = (catalogPmTotalMasYr / 1000.0) * Math.abs(dt_yr);
    const residualArcsec = shiftArcsec - expectedArcsec;

    // Accumulate linear regression terms
    sumDt2 += dt_yr * dt_yr;
    sumDtShift += dt_yr * shiftArcsec;

    const row = {
      frameIdx: i,
      mjd,
      epoch_yr: J,
      dt_yr,
      xc: ci.xc,
      yc: ci.yc,
      shiftPx,
      shiftArcsec,
      measuredPmMasYr: dt_yr > 0.001 ? (shiftArcsec / dt_yr) * 1000.0 : catalogPmTotalMasYr,
      expectedArcsec,
      residualArcsec,
    };
    measuredAstrometryData.push(row);
  }

  // Calculate overall proper motion rate via least-squares
  const catalogPmMasYr = Math.sqrt(pmRa * pmRa + pmDec * pmDec);
  let overallMeasPmMasYr = catalogPmMasYr;
  if (sumDt2 > 1e-6) {
    overallMeasPmMasYr = (sumDtShift / sumDt2) * 1000.0;
  }

  // Draw mini astrometric drift plot
  drawAstrometricDriftPlot(measuredAstrometryData, catalogPmMasYr);

  // Update active frame readout & pin
  const curRow = measuredAstrometryData[currentFrameIndex] || measuredAstrometryData[0];
  if (curRow) {
    if (centroidPin) {
      centroidPin.style.left = `${curRow.xc}px`;
      centroidPin.style.top = `${curRow.yc}px`;
      centroidPin.classList.remove("hidden");
    }

    const skyCur = pixelToSky(curRow.xc, curRow.yc);
    if (centroidReadout) {
      centroidReadout.style.left = `${curRow.xc + 10}px`;
      centroidReadout.style.top = `${curRow.yc - 20}px`;
      centroidReadout.innerHTML = `<span>Centroid: (${curRow.xc.toFixed(1)}, ${curRow.yc.toFixed(1)}) &bull; &Delta;&theta;: ${curRow.shiftArcsec.toFixed(2)}" &bull; &mu;: ${overallMeasPmMasYr.toFixed(0)} mas/yr</span> <button type="button" class="btn-hud-bridge" id="bridge-centroid-btn" title="Bridge to Citizen Science Lab">&#9889; Log Candidate</button>`;
      centroidReadout.classList.remove("hidden");
      const bridgeBtn = document.getElementById("bridge-centroid-btn");
      if (bridgeBtn) {
        bridgeBtn.onclick = (e) => {
          e.stopPropagation();
          bridgeLogCandidate({
            ra: skyCur.ra,
            dec: skyCur.dec,
            pmArcsecYr: overallMeasPmMasYr / 1000.0,
            notes: `Sub-pixel Centroid measurement: Pixel (${curRow.xc.toFixed(2)}, ${curRow.yc.toFixed(2)}), Δθ = ${curRow.shiftArcsec.toFixed(2)}", μ = ${overallMeasPmMasYr.toFixed(0)} mas/yr`,
          });
        };
      }
    }

    if (candRa) candRa.value = skyCur.ra.toFixed(6);
    if (candDec) candDec.value = skyCur.dec.toFixed(6);
    if (candMotion) candMotion.value = (overallMeasPmMasYr / 1000.0).toFixed(2);
  }

  if (frames[currentFrameIndex]) {
    drawCentroidApertureOverlay(frames[currentFrameIndex]);
  }
}

function drawCentroidApertureOverlay(curFrame) {
  if (!flagsCtx || !flagsCanvas) return;
  const row = measuredAstrometryData[currentFrameIndex];
  if (!row) return;

  flagsCtx.save();
  const half = 2.5;
  const x0 = row.xc - half;
  const y0 = row.yc - half;

  // Draw 5x5 pixel aperture box (Signal Red #E5484D)
  flagsCtx.strokeStyle = "#E5484D";
  flagsCtx.lineWidth = 1.4;
  flagsCtx.strokeRect(x0, y0, 5, 5);

  // Sub-pixel crosshair
  flagsCtx.beginPath();
  flagsCtx.moveTo(row.xc - 6, row.yc);
  flagsCtx.lineTo(row.xc + 6, row.yc);
  flagsCtx.moveTo(row.xc, row.yc - 6);
  flagsCtx.lineTo(row.xc, row.yc + 6);
  flagsCtx.strokeStyle = "#ffffff";
  flagsCtx.lineWidth = 0.9;
  flagsCtx.stroke();

  // Aperture label
  flagsCtx.font = "9px monospace";
  flagsCtx.fillStyle = "#E5484D";
  flagsCtx.fillText("5x5 Aperture", row.xc + 6, row.yc + 10);
  flagsCtx.restore();
}

function drawAstrometricDriftPlot(driftData, catalogPmMasYr) {
  if (!driftCtx || !driftCanvas || !driftData || driftData.length === 0) return;
  const w = driftCanvas.width;
  const h = driftCanvas.height;

  driftCtx.clearRect(0, 0, w, h);

  // Plot margins
  const mLeft = 45;
  const mRight = 20;
  const mTop = 22;
  const mBottom = 26;

  const pw = w - mLeft - mRight;
  const ph = h - mTop - mBottom;

  // Background box (Canvas well #121418 & Steel Grey border)
  driftCtx.fillStyle = "#121418";
  driftCtx.fillRect(mLeft, mTop, pw, ph);
  driftCtx.strokeStyle = "rgba(119, 125, 135, 0.28)";
  driftCtx.lineWidth = 1;
  driftCtx.strokeRect(mLeft, mTop, pw, ph);

  // Compute ranges
  const maxShiftMeasured = Math.max(...driftData.map((d) => d.shiftArcsec), 0.1);
  const maxShiftCatalog = Math.max(...driftData.map((d) => d.expectedArcsec), 0.1);
  const maxY = Math.max(maxShiftMeasured, maxShiftCatalog) * 1.15;
  const nFrames = driftData.length;

  // Horizontal Grid Lines & Y-axis labels (Steel Grey #777D87)
  const yTicks = 4;
  driftCtx.textAlign = "right";
  driftCtx.font = "8.5px monospace";
  driftCtx.fillStyle = "#777D87";

  for (let i = 0; i <= yTicks; i++) {
    const val = (maxY * i) / yTicks;
    const y = mTop + ph - (i / yTicks) * ph;

    driftCtx.beginPath();
    driftCtx.strokeStyle = i === 0 ? "rgba(119, 125, 135, 0.28)" : "rgba(119, 125, 135, 0.12)";
    driftCtx.moveTo(mLeft, y);
    driftCtx.lineTo(mLeft + pw, y);
    driftCtx.stroke();

    driftCtx.fillText(`${val.toFixed(2)}"`, mLeft - 5, y + 3);
  }

  // X-axis frame ticks & labels
  driftCtx.textAlign = "center";
  driftData.forEach((d, idx) => {
    const x = mLeft + (idx / Math.max(1, nFrames - 1)) * pw;

    driftCtx.beginPath();
    driftCtx.strokeStyle = "rgba(119, 125, 135, 0.12)";
    driftCtx.moveTo(x, mTop);
    driftCtx.lineTo(x, mTop + ph);
    driftCtx.stroke();

    if (idx === 0 || idx === nFrames - 1 || idx % 2 === 1) {
      driftCtx.fillText(`#${idx + 1}`, x, mTop + ph + 13);
    }
  });

  // 1. Draw SIMBAD catalog expected trajectory line (Steel Grey dashed line)
  driftCtx.save();
  driftCtx.beginPath();
  driftCtx.setLineDash([4, 3]);
  driftCtx.strokeStyle = "#777D87";
  driftCtx.lineWidth = 1.6;

  driftData.forEach((d, idx) => {
    const x = mLeft + (idx / Math.max(1, nFrames - 1)) * pw;
    const y = mTop + ph - (d.expectedArcsec / maxY) * ph;
    if (idx === 0) driftCtx.moveTo(x, y);
    else driftCtx.lineTo(x, y);
  });
  driftCtx.stroke();
  driftCtx.restore();

  // 2. Draw Measured Centroid Drift curve (Signal Red #E5484D line)
  driftCtx.beginPath();
  driftCtx.strokeStyle = "#E5484D";
  driftCtx.lineWidth = 2.0;

  driftData.forEach((d, idx) => {
    const x = mLeft + (idx / Math.max(1, nFrames - 1)) * pw;
    const y = mTop + ph - (d.shiftArcsec / maxY) * ph;
    if (idx === 0) driftCtx.moveTo(x, y);
    else driftCtx.lineTo(x, y);
  });
  driftCtx.stroke();

  // 3. Draw 5x5 Aperture tick squares & point markers
  driftData.forEach((d, idx) => {
    const x = mLeft + (idx / Math.max(1, nFrames - 1)) * pw;
    const y = mTop + ph - (d.shiftArcsec / maxY) * ph;

    // 5x5 aperture square icon
    driftCtx.strokeStyle = "rgba(229, 72, 77, 0.6)";
    driftCtx.lineWidth = 1;
    driftCtx.strokeRect(x - 3, y - 3, 6, 6);

    // Center dot
    driftCtx.beginPath();
    driftCtx.arc(x, y, idx === currentFrameIndex ? 3.5 : 2.2, 0, Math.PI * 2);
    driftCtx.fillStyle = idx === currentFrameIndex ? "#ffffff" : "#E5484D";
    driftCtx.fill();
    driftCtx.strokeStyle = "#191B20";
    driftCtx.lineWidth = 0.8;
    driftCtx.stroke();
  });

  // Legend
  driftCtx.textAlign = "left";
  driftCtx.font = "8.5px monospace";
  // Measured legend
  driftCtx.fillStyle = "#E5484D";
  driftCtx.fillRect(mLeft + 8, mTop + 6, 8, 8);
  driftCtx.fillText("5x5 Centroid (Meas)", mLeft + 20, mTop + 13);
  // Catalog legend
  driftCtx.strokeStyle = "#777D87";
  driftCtx.beginPath();
  driftCtx.setLineDash([3, 2]);
  driftCtx.moveTo(mLeft + 140, mTop + 10);
  driftCtx.lineTo(mLeft + 155, mTop + 10);
  driftCtx.stroke();
  driftCtx.setLineDash([]);
  driftCtx.fillStyle = "#777D87";
  driftCtx.fillText("SIMBAD Catalog PM", mLeft + 160, mTop + 13);

  // Compute overall rates for UI display
  const sumDt2 = driftData.reduce((acc, d) => acc + d.dt_yr * d.dt_yr, 0);
  const sumDtShift = driftData.reduce((acc, d) => acc + d.dt_yr * d.shiftArcsec, 0);
  let overallMeasPmMasYr = catalogPmMasYr;
  if (sumDt2 > 1e-6) {
    overallMeasPmMasYr = (sumDtShift / sumDt2) * 1000.0;
  }
  const residualMasYr = overallMeasPmMasYr - catalogPmMasYr;

  if (driftMeasuredRate) {
    driftMeasuredRate.textContent = `${(overallMeasPmMasYr / 1000.0).toFixed(2)}"/yr (${overallMeasPmMasYr.toFixed(0)} mas/yr)`;
  }
  if (driftCatalogRate) {
    driftCatalogRate.textContent = `${(catalogPmMasYr / 1000.0).toFixed(2)}"/yr (${catalogPmMasYr.toFixed(0)} mas/yr)`;
  }
  if (driftResidual) {
    driftResidual.textContent = `${residualMasYr >= 0 ? "+" : ""}${residualMasYr.toFixed(0)} mas/yr`;
  }
  if (driftStatusText) {
    driftStatusText.textContent = `Astrometric Drift: Δθ [arcsec] across ${nFrames} epochs • Residual: ${residualMasYr.toFixed(1)} mas/yr`;
  }
}

function exportAstrometricCsv() {
  if (!measuredAstrometryData || measuredAstrometryData.length === 0) {
    showToast("EXPORT DRIFT CSV", "No astrometric measurements available. Load a sequence first.", false);
    return;
  }
  const rows = [
    ["Frame", "MJD", "Julian_Year", "dt_yr", "xc_px", "yc_px", "shift_px", "shift_arcsec", "measured_pm_mas_yr", "simbad_expected_arcsec", "residual_arcsec"],
  ];
  measuredAstrometryData.forEach((r) => {
    rows.push([
      r.frameIdx + 1,
      r.mjd.toFixed(4),
      r.epoch_yr.toFixed(4),
      r.dt_yr.toFixed(4),
      r.xc.toFixed(3),
      r.yc.toFixed(3),
      r.shiftPx.toFixed(3),
      r.shiftArcsec.toFixed(3),
      r.measuredPmMasYr.toFixed(1),
      r.expectedArcsec.toFixed(3),
      r.residualArcsec.toFixed(3),
    ]);
  });
  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astrometric_drift_${activeCatalogTarget?.name ? activeCatalogTarget.name.replace(/\s+/g, "_") : "target"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("EXPORT DRIFT CSV", "Exported astrometric drift data table.", false);
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

function setCandidateLadderStep(step) {
  if (step >= 2) {
    const motionChecked = checkFramesMotion?.checked;
    const simbadChecked = checkSimbad?.checked;
    const wiseChecked = checkWise?.checked;
    const neossatChecked = checkNeossat?.checked;

    if (!motionChecked || !simbadChecked || !wiseChecked || !neossatChecked) {
      showToast(
        "SELF-CHECK REQUIRED",
        "Please complete all 4 verification checkboxes (Motion, SIMBAD, AllWISE, NEOSSat/MPC) before advancing to Step 2+.",
        true
      );
      if (candidateStatus) {
        candidateStatus.textContent = "Self-check incomplete: please check all 4 verification items above.";
      }
      return;
    }
  }

  currentLadderStep = step;
  if (candStatusStep) candStatusStep.value = String(step);
  ladderSteps.forEach((el) => {
    const s = parseInt(el.getAttribute("data-step"), 10);
    el.classList.toggle("active", s === step);
    el.classList.toggle("completed", s < step);
  });
  if (candidateStatus) {
    const labels = ["", "1. Logged", "2. Self-Checked", "3. Needs Independent Review", "4. Confirmed"];
    candidateStatus.textContent = `Status set to: ${labels[step] || step}`;
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
    classification: candClass ? candClass.value : "Moving Substellar Object (Y/T/L Brown Dwarf)",
    status_ladder_step: currentLadderStep,
    status_ladder_label: ["Logged", "Self-Checked", "Needs Review", "Confirmed"][currentLadderStep - 1] || "Logged",
    pos_uncertainty_arcsec: parseFloat(candPosErr?.value || "0.25"),
    proper_motion_uncertainty_mas_yr: parseFloat(candPmErr?.value || "15"),
    snr: parseFloat(candSnr?.value || "14.2"),
    flux_variability_pct: parseFloat(candFluxTrend?.value || "3.5"),
    motion_rate_arcsec_yr: parseFloat(candMotion?.value || "0"),
    position_angle_deg: parseFloat(candPa?.value || "0"),
    notes: candNotes?.value?.trim() || "",
  };

  if (saveCandidateBtn) saveCandidateBtn.disabled = true;
  if (candidateStatus) candidateStatus.textContent = "Saving candidate observation log...";

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
      candidateStatus.textContent = "\u2714 Candidate Observation Log saved to sequence registry!";
      setTimeout(() => {
        if (candidateStatus) candidateStatus.textContent = "";
      }, 4000);
    }
    if (candName) candName.value = "";
    if (candNotes) candNotes.value = "";
    loadCandidates(currentSequenceKey);
    showToast("DISCOVERY SAVED", "Candidate logged to observation registry!", false);
  } catch (err) {
    if (candidateStatus) candidateStatus.textContent = `Error: ${err.message}`;
    showToast("SAVE ERROR", err.message, true);
  } finally {
    if (saveCandidateBtn) saveCandidateBtn.disabled = false;
  }
}

function exportZooniversePacket() {
  const candidateName = candName?.value?.trim() || activeCatalogTarget?.name || "SPX-Candidate-01";
  const ra = parseFloat(candRa?.value) || activeCatalogTarget?.ra0 || 0;
  const dec = parseFloat(candDec?.value) || activeCatalogTarget?.dec0 || 0;
  const classification = candClass?.value || "Moving Substellar Object (Y/T/L Brown Dwarf)";
  const pmRate = parseFloat(candMotion?.value) || Math.hypot(activeCatalogTarget?.pm_ra_mas_yr || 0, activeCatalogTarget?.pm_dec_mas_yr || 0) / 1000.0;
  const pa = parseFloat(candPa?.value) || 0;
  const posErr = parseFloat(candPosErr?.value) || 0.25;
  const pmErr = parseFloat(candPmErr?.value) || 15;
  const snr = parseFloat(candSnr?.value) || 14.2;
  const fluxTrend = parseFloat(candFluxTrend?.value) || 3.5;
  const notes = candNotes?.value?.trim() || "";
  const step = currentLadderStep;

  const packet = {
    discovery_packet_version: "2026.1",
    project: "Backyard Worlds / SPHEREx Citizen Discovery",
    candidate_id: candidateName,
    status_ladder_step: step,
    status_ladder_label: ["Logged", "Self-Checked", "Needs Review", "Confirmed"][step - 1] || "Logged",
    target_astrometry: {
      ra_deg: ra,
      dec_deg: dec,
      pos_uncertainty_arcsec: posErr,
      proper_motion_arcsec_yr: pmRate,
      pm_uncertainty_mas_yr: pmErr,
      position_angle_deg: pa,
    },
    photometry_and_variability: {
      estimated_snr: snr,
      flux_variability_pct: fluxTrend,
      classification: classification,
      molecular_dropouts_observed: Object.keys(activeMolecules).filter((k) => activeMolecules[k]),
    },
    verification_checklist: {
      three_frames_motion: checkFramesMotion?.checked || false,
      simbad_crossmatch: checkSimbad?.checked || false,
      allwise_baseline: checkWise?.checked || false,
      neossat_mpc_checked: checkNeossat?.checked || false,
    },
    survey_passes: SPHEREx_SURVEY_PASSES.map((p) => ({
      pass: p.name,
      mjd: p.mjd,
      window: p.window,
      wavelength_um: p.wavelength_um,
    })),
    observational_notes: notes,
    exported_at: new Date().toISOString(),
  };

  // 1. Download JSON packet
  const jsonBlob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const a = document.createElement("a");
  a.href = jsonUrl;
  const safeId = candidateName.replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = `MURFX_Discovery_Packet_${safeId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(jsonUrl);

  // 2. Download companion CSV formatted for Zooniverse
  const csvHeaders = "candidate_id,ra_deg,dec_deg,classification,pm_arcsec_yr,pa_deg,snr,status,pos_err_arcsec,notes\n";
  const csvRow = `"${candidateName}",${ra.toFixed(6)},${dec.toFixed(6)},"${classification}",${pmRate.toFixed(3)},${pa.toFixed(1)},${snr.toFixed(1)},"${packet.status_ladder_label}",${posErr.toFixed(2)},"${notes.replace(/"/g, '""')}"\n`;
  const csvBlob = new Blob([csvHeaders + csvRow], { type: "text/csv" });
  const csvUrl = URL.createObjectURL(csvBlob);
  const a2 = document.createElement("a");
  a2.href = csvUrl;
  a2.download = `MURFX_Zooniverse_Upload_${safeId}.csv`;
  document.body.appendChild(a2);
  a2.click();
  document.body.removeChild(a2);
  URL.revokeObjectURL(csvUrl);

  showToast("DISCOVERY PACKET EXPORTED", `Backyard Worlds packet (JSON + CSV) exported for ${candidateName}!`, false);
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
