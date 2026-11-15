/**
 * MURFX: SPHEREx Wise-Cube & Blink Explorer
 * Interactive Landing Page Controller & Visualization Engine
 * 
 * Features:
 * 1. View Routing (Seamless transition between Landing Page and Explorer Workspace)
 * 2. Hero Interactive Mini-Blink & Dipole HTML5 Canvas (WISE 0855 simulation)
 * 3. Instant Coordinate Launch & Quick-Pick Target Resolver
 * 4. 4-Pillar Interactive Bento Grid Demos (Dipole Diff, Molecular Spectrum SVG, Centroiding, Verification Ladder)
 * 5. Dichroic Instrument Paired Detector Selector
 * 6. Telemetry Ribbon Live Counters
 */

// Preset Targets with Astrometry & SPHEREx Configuration
const PRESET_TARGETS = {
  wise0855: {
    name: "WISE J085510.83−071442.5",
    query: "WISE 0855",
    ra: 133.795125,
    dec: -7.245147,
    det: "5",
    type: "Y Dwarf (Coldest Sub-stellar Object)",
    pm_ra: -8100.0,
    pm_dec: 700.0,
    fov: 8.0,
  },
  mass0415: {
    name: "2MASS J0415−0935",
    query: "2MASS J0415",
    ra: 63.831417,
    dec: -9.585167,
    det: "4",
    type: "T8 Dwarf Benchmark",
    pm_ra: 1870.0,
    pm_dec: -1250.0,
    fov: 6.0,
  },
  luhman16: {
    name: "Luhman 16 (WISE J1049-5319)",
    query: "Luhman 16",
    ra: 162.32875,
    dec: -53.319444,
    det: "3",
    type: "Binary Brown Dwarf (3rd Closest System)",
    pm_ra: -2759.0,
    pm_dec: 354.0,
    fov: 6.0,
  },
  comet2025: {
    name: "C/2025 SPHEREx Comet Candidate",
    query: "R Dra",
    ra: 247.575417,
    dec: 66.704722,
    det: "5",
    type: "Outer Solar System Fast Mover",
    pm_ra: -8.1,
    pm_dec: 15.4,
    fov: 12.0,
  },
};

// ============================================================================
// 1. VIEW ROUTING CONTROLLER
// ============================================================================

export function switchView(targetView, params = null) {
  const landingView = document.getElementById("landing-view");
  const explorerView = document.getElementById("explorer-view");
  const body = document.body;

  if (targetView === "explorer") {
    if (landingView) landingView.classList.add("hidden");
    if (explorerView) explorerView.classList.remove("hidden");
    body.classList.remove("landing-active");
    body.classList.add("explorer-active");

    window.location.hash = "#explorer";

    if (params) {
      applyParamsToExplorer(params);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  } else {
    // Show Landing View
    if (landingView) landingView.classList.remove("hidden");
    if (explorerView) explorerView.classList.add("hidden");
    body.classList.add("landing-active");
    body.classList.remove("explorer-active");

    if (window.location.hash === "#explorer") {
      history.pushState(null, "", window.location.pathname + window.location.search);
    }
  }
}

// Make switchView globally accessible
window.switchView = switchView;

function applyParamsToExplorer(params) {
  const targetInput = document.getElementById("target-input");
  const raInput = document.getElementById("ra-input");
  const decInput = document.getElementById("dec-input");
  const fovInput = document.getElementById("fov-input");
  const detectorSelect = document.getElementById("detector-select");
  const detChips = document.querySelectorAll(".det-chip");
  const resolveBtn = document.getElementById("resolve-btn");

  if (params.name && targetInput) {
    targetInput.value = params.name;
  }
  if (params.ra != null && raInput) {
    raInput.value = parseFloat(params.ra).toFixed(6);
  }
  if (params.dec != null && decInput) {
    decInput.value = parseFloat(params.dec).toFixed(6);
  }
  if (params.fov != null && fovInput) {
    fovInput.value = String(params.fov);
  }
  if (params.det != null && detectorSelect) {
    detectorSelect.value = String(params.det);
    detChips.forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-det") === String(params.det));
    });
  }

  // Trigger resolve or submit if targetInput has text
  if (params.name && resolveBtn) {
    setTimeout(() => {
      resolveBtn.click();
    }, 150);
  }
}

// Check initial URL state
function initRoute() {
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  const hasTargetParams = urlParams.has("ra") || urlParams.has("name") || urlParams.has("dec") || urlParams.get("embed") === "1";
  
  if (hash === "#explorer" || hasTargetParams) {
    switchView("explorer");
  } else {
    switchView("landing");
  }

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#explorer") {
      switchView("explorer");
    } else if (window.location.hash === "#landing" || window.location.hash === "") {
      switchView("landing");
    }
  });
}

// ============================================================================
// 2. HERO INTERACTIVE MINI-BLINK & DIPOLE CANVAS SIMULATOR
// ============================================================================

class HeroBlinkSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    this.mode = "movie"; // "movie" | "diff" | "pm"
    this.currentPass = 1; // 1 (May 2025) or 2 (Nov 2025)
    this.isPlaying = true;
    this.speed = 1; // 1x, 2x, 4x
    this.lastBlinkTime = performance.now();
    this.blinkIntervalMs = 1200;

    // Field & Target Specifications (WISE 0855: proper motion -8.1"/yr RA, +0.7"/yr Dec)
    this.pixelScaleArcsec = 6.15; // SPHEREx 6.15"/pixel
    this.fovArcmin = 8.0;
    this.baseWidth = 512;
    this.baseHeight = 384;

    // Background Static Stars (Steel Grey)
    this.stars = this.generateStars(55);

    // Moving Brown Dwarf Position
    // Pass 1: Center + slight right offset
    // Pass 2: Shifted by -4.05 arcsec (0.66 SPHEREx px) in RA
    this.mover = {
      p1: { x: 0.52 * this.baseWidth, y: 0.50 * this.baseHeight, flux: 1.0 },
      p2: { x: (0.52 * this.baseWidth) - 34, y: (0.50 * this.baseHeight) + 4, flux: 1.0 },
    };

    // Telemetry display elements
    this.epochText = document.getElementById("hero-hud-epoch");
    this.mjdText = document.getElementById("hero-hud-mjd");
    this.modeBadge = document.getElementById("hero-hud-mode-badge");

    this.initCanvasSize();
    this.initControls();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  generateStars(count) {
    const stars = [];
    // Pseudo-random deterministic stars
    let seed = 42;
    function rand() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand() * this.baseWidth,
        y: rand() * this.baseHeight,
        radius: 0.7 + rand() * 2.2,
        flux: 0.25 + rand() * 0.75,
        color: rand() > 0.85 ? "#E5484D" : "#777D87", // Most are Steel Grey, few faint IR points
      });
    }
    return stars;
  }

  initCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || this.baseWidth;
    this.height = rect.height || this.baseHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  initControls() {
    // Mode toggles
    const pills = document.querySelectorAll(".lp-toggle-pill");
    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        this.mode = pill.getAttribute("data-hero-mode");
        this.updateHud();
      });
    });

    // Play/Pause button
    const playBtn = document.getElementById("hero-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        this.isPlaying = !this.isPlaying;
        playBtn.textContent = this.isPlaying ? "❚❚ Pause" : "▶ Play";
      });
    }

    // Speed button
    const speedBtn = document.getElementById("hero-speed-btn");
    if (speedBtn) {
      speedBtn.addEventListener("click", () => {
        if (this.speed === 1) this.speed = 2;
        else if (this.speed === 2) this.speed = 4;
        else this.speed = 1;
        speedBtn.textContent = `${this.speed}×`;
      });
    }

    // Resize
    window.addEventListener("resize", () => {
      this.initCanvasSize();
    });
  }

  updateHud() {
    if (!this.epochText || !this.mjdText) return;

    if (this.mode === "diff") {
      this.epochText.textContent = "DIFF (Pass 2 − Pass 1)";
      this.mjdText.textContent = "Δt = 184.2 days";
      if (this.modeBadge) this.modeBadge.textContent = "DIPOLE DIFF";
    } else if (this.mode === "pm") {
      this.epochText.textContent = "PROPER MOTION VECTOR";
      this.mjdText.textContent = "μ = -8.10\"/yr · PA 275°";
      if (this.modeBadge) this.modeBadge.textContent = "PM TRACK";
    } else {
      if (this.currentPass === 1) {
        this.epochText.textContent = "PASS 1 (May 2025)";
        this.mjdText.textContent = "MJD 60814.2";
      } else {
        this.epochText.textContent = "PASS 2 (Nov 2025)";
        this.mjdText.textContent = "MJD 60998.4";
      }
      if (this.modeBadge) this.modeBadge.textContent = "TIME MOVIE";
    }
  }

  animate(now) {
    // Auto-blink timing for movie mode
    if (this.isPlaying && this.mode === "movie") {
      const interval = this.blinkIntervalMs / this.speed;
      if (now - this.lastBlinkTime >= interval) {
        this.currentPass = this.currentPass === 1 ? 2 : 1;
        this.lastBlinkTime = now;
        this.updateHud();
      }
    }

    this.render();
    requestAnimationFrame(this.animate);
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const scaleX = w / this.baseWidth;
    const scaleY = h / this.baseHeight;

    // Background Canvas Fill (Charcoal Deep Space #0C0D10)
    ctx.fillStyle = "#0C0D10";
    ctx.fillRect(0, 0, w, h);

    // Draw Astrometric Coordinate Grid Lines (Steel Grey, 10% opacity)
    ctx.strokeStyle = "rgba(119, 125, 135, 0.14)";
    ctx.lineWidth = 1;
    const gridStep = 48 * scaleX;
    ctx.beginPath();
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Mode-Specific Rendering
    if (this.mode === "diff") {
      this.renderDifferenceFrame(ctx, scaleX, scaleY, w, h);
    } else if (this.mode === "pm") {
      this.renderProperMotionTrack(ctx, scaleX, scaleY, w, h);
    } else {
      this.renderBlinkFrame(ctx, scaleX, scaleY, w, h);
    }
  }

  // 1. Blink Frame: Static background stars + single moving brown dwarf
  renderBlinkFrame(ctx, scaleX, scaleY, w, h) {
    // Draw static stars
    this.stars.forEach((star) => {
      const x = star.x * scaleX;
      const y = star.y * scaleY;
      const rad = star.radius * Math.min(scaleX, scaleY);

      // Star Glow
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
      grad.addColorStop(0, "rgba(243, 244, 246, 0.95)");
      grad.addColorStop(0.3, "rgba(119, 125, 135, 0.5)");
      grad.addColorStop(1, "rgba(119, 125, 135, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rad * 3, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Core
      ctx.fillStyle = "#F3F4F6";
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Moving Target: WISE 0855
    const pos = this.currentPass === 1 ? this.mover.p1 : this.mover.p2;
    const tx = pos.x * scaleX;
    const ty = pos.y * scaleY;
    const moverRadius = 4.2 * Math.min(scaleX, scaleY);

    // Warm Thermal-IR glow (SPHEREx Band D5 4.3 µm)
    const mGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, moverRadius * 4);
    mGrad.addColorStop(0, "#F3F4F6");
    mGrad.addColorStop(0.2, "rgba(243, 244, 246, 0.9)");
    mGrad.addColorStop(0.6, "rgba(229, 72, 77, 0.45)");
    mGrad.addColorStop(1, "rgba(229, 72, 77, 0)");
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(tx, ty, moverRadius * 4, 0, Math.PI * 2);
    ctx.fill();

    // Signal Red Discovery Reticle around mover
    this.drawTargetReticle(ctx, tx, ty, 18, "#E5484D");
  }

  // 2. Dipole Diff Frame: Background stars cancel to zero; moving target creates dipole
  renderDifferenceFrame(ctx, scaleX, scaleY, w, h) {
    // Slight noise floor representing residual background subtraction
    ctx.fillStyle = "rgba(119, 125, 135, 0.04)";
    ctx.fillRect(0, 0, w, h);

    const p1x = this.mover.p1.x * scaleX;
    const p1y = this.mover.p1.y * scaleY;
    const p2x = this.mover.p2.x * scaleX;
    const p2y = this.mover.p2.y * scaleY;
    const rad = 4.5 * Math.min(scaleX, scaleY);

    // Negative Trough (Pass 1 position: black hole / depression)
    const negGrad = ctx.createRadialGradient(p1x, p1y, 0, p1x, p1y, rad * 3.5);
    negGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
    negGrad.addColorStop(0.5, "rgba(15, 17, 21, 0.8)");
    negGrad.addColorStop(1, "rgba(15, 17, 21, 0)");
    ctx.fillStyle = negGrad;
    ctx.beginPath();
    ctx.arc(p1x, p1y, rad * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Draw negative indicator ring
    ctx.strokeStyle = "rgba(119, 125, 135, 0.5)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p1x, p1y, rad * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Positive Peak (Pass 2 position: bright white/red core)
    const posGrad = ctx.createRadialGradient(p2x, p2y, 0, p2x, p2y, rad * 4);
    posGrad.addColorStop(0, "#FFFFFF");
    posGrad.addColorStop(0.3, "rgba(243, 244, 246, 0.95)");
    posGrad.addColorStop(0.7, "rgba(229, 72, 77, 0.5)");
    posGrad.addColorStop(1, "rgba(229, 72, 77, 0)");
    ctx.fillStyle = posGrad;
    ctx.beginPath();
    ctx.arc(p2x, p2y, rad * 4, 0, Math.PI * 2);
    ctx.fill();

    // Dual Reticles: Steel Grey for Negative, Signal Red for Positive
    this.drawTargetReticle(ctx, p1x, p1y, 14, "#777D87");
    this.drawTargetReticle(ctx, p2x, p2y, 18, "#E5484D");

    // Dipole connecting axis
    ctx.strokeStyle = "rgba(229, 72, 77, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    // Dipole labels
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillStyle = "#777D87";
    ctx.fillText("− DIPOLE (PASS 1)", p1x - 30, p1y + 26);
    ctx.fillStyle = "#E5484D";
    ctx.fillText("+ DIPOLE (PASS 2)", p2x - 30, p2y - 20);
  }

  // 3. Proper Motion Track Frame: Trajectory vector & measurement
  renderProperMotionTrack(ctx, scaleX, scaleY, w, h) {
    // First draw background stars
    this.stars.forEach((star) => {
      const x = star.x * scaleX;
      const y = star.y * scaleY;
      ctx.fillStyle = "rgba(119, 125, 135, 0.45)";
      ctx.beginPath();
      ctx.arc(x, y, star.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });

    const p1x = this.mover.p1.x * scaleX;
    const p1y = this.mover.p1.y * scaleY;
    const p2x = this.mover.p2.x * scaleX;
    const p2y = this.mover.p2.y * scaleY;

    // Both pass positions visible
    ctx.fillStyle = "rgba(119, 125, 135, 0.7)";
    ctx.beginPath();
    ctx.arc(p1x, p1y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#E5484D";
    ctx.beginPath();
    ctx.arc(p2x, p2y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Trajectory Vector Arrow
    ctx.strokeStyle = "#E5484D";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    // Arrowhead at p2
    const angle = Math.atan2(p2y - p1y, p2x - p1x);
    ctx.fillStyle = "#E5484D";
    ctx.beginPath();
    ctx.moveTo(p2x, p2y);
    ctx.lineTo(p2x - 10 * Math.cos(angle - Math.PI / 6), p2y - 10 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(p2x - 10 * Math.cos(angle + Math.PI / 6), p2y - 10 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Vector Annotations
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.fillStyle = "#F3F4F6";
    ctx.fillText("Δθ = 4.05\" (6 mos)", (p1x + p2x) / 2 - 45, (p1y + p2y) / 2 - 14);
    ctx.fillStyle = "#777D87";
    ctx.fillText("Pass 1 (May '25)", p1x + 10, p1y + 14);
    ctx.fillStyle = "#E5484D";
    ctx.fillText("Pass 2 (Nov '25)", p2x - 90, p2y + 18);

    this.drawTargetReticle(ctx, p2x, p2y, 20, "#E5484D");
  }

  drawTargetReticle(ctx, x, y, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const corner = size * 0.35;

    // 4 Corner Brackets
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x - size, y - size + corner);
    ctx.lineTo(x - size, y - size);
    ctx.lineTo(x - size + corner, y - size);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + size - corner, y - size);
    ctx.lineTo(x + size, y - size);
    ctx.lineTo(x + size, y - size + corner);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + size, y + size - corner);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x + size - corner, y + size);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x - size + corner, y + size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x - size, y + size - corner);
    ctx.stroke();

    // Central crosshair point
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================================
// 3. BENTO GRID 4-PILLAR INTERACTIVE DEMOS
// ============================================================================

// Card 1 Demo: Mini Blink / Diff Canvas
function initCard1Demo() {
  const canvas = document.getElementById("bento-diff-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let mode = "diff"; // "blink" | "diff"

  function render() {
    ctx.fillStyle = "#0C0D10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (mode === "diff") {
      // Background cancellation
      ctx.fillStyle = "rgba(119, 125, 135, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dark negative dipole
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 20, canvas.height / 2, 7, 0, Math.PI * 2);
      ctx.fill();

      // Bright positive dipole
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(canvas.width / 2 + 20, canvas.height / 2, 8, 0, Math.PI * 2);
      ctx.fill();

      // Signal Red reticle
      ctx.strokeStyle = "#E5484D";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(canvas.width / 2 + 10, canvas.height / 2 - 10, 20, 20);

      ctx.fillStyle = "#777D87";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.fillText("B−A DIPOLE SIGNATURE", 10, 18);
    } else {
      // Normal Star Field
      ctx.fillStyle = "#F3F4F6";
      ctx.beginPath();
      ctx.arc(60, 40, 3, 0, Math.PI * 2);
      ctx.arc(180, 70, 2.5, 0, Math.PI * 2);
      ctx.arc(220, 30, 2, 0, Math.PI * 2);
      ctx.fill();

      // Mover
      ctx.fillStyle = "#E5484D";
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#777D87";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.fillText("EPOCH PASS 1", 10, 18);
    }
  }

  const btnDiff = document.getElementById("demo-card1-diff");
  const btnBlink = document.getElementById("demo-card1-blink");

  if (btnDiff && btnBlink) {
    btnDiff.addEventListener("click", () => {
      mode = "diff";
      btnDiff.classList.add("active");
      btnBlink.classList.remove("active");
      render();
    });
    btnBlink.addEventListener("click", () => {
      mode = "blink";
      btnBlink.classList.add("active");
      btnDiff.classList.remove("active");
      render();
    });
  }

  render();
}

// Card 2 Demo: 102-Band Interactive Spectrum with Molecular Hover Tooltip
function initCard2Demo() {
  const spectrumWrap = document.getElementById("bento-spectrum-wrap");
  const tooltip = document.getElementById("spectrum-hover-tooltip");
  if (!spectrumWrap || !tooltip) return;

  const bandRegions = [
    { start: 0.75, end: 1.11, det: "D1", mol: "Optical/Near-IR Continuum", color: "rgba(119, 125, 135, 0.15)" },
    { start: 1.11, end: 1.64, det: "D2", mol: "H2O Absorption (1.4 µm)", color: "rgba(229, 72, 77, 0.18)" },
    { start: 1.64, end: 2.42, det: "D3", mol: "CH4 & H2 Collision Peak (2.1 µm)", color: "rgba(119, 125, 135, 0.18)" },
    { start: 2.42, end: 3.82, det: "D4", mol: "CH4 Fundamental (3.3 µm)", color: "rgba(229, 72, 77, 0.22)" },
    { start: 3.82, end: 4.42, det: "D5", mol: "CO2 Ice / Gas Deep Band (4.26 µm)", color: "rgba(229, 72, 77, 0.35)" },
    { start: 4.42, end: 5.00, det: "D6", mol: "CO Band & Thermal Y-Dwarf Peak (4.7 µm)", color: "rgba(243, 244, 246, 0.2)" },
  ];

  spectrumWrap.addEventListener("mousemove", (e) => {
    const rect = spectrumWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const wavelength = 0.75 + (pct * (5.00 - 0.75));

    // Find matching detector band
    const match = bandRegions.find((b) => wavelength >= b.start && wavelength <= b.end) || bandRegions[bandRegions.length - 1];

    tooltip.style.display = "block";
    tooltip.style.left = `${Math.min(rect.width - 150, Math.max(10, x - 70))}px`;
    tooltip.style.top = "-42px";
    tooltip.innerHTML = `<strong>${wavelength.toFixed(2)} µm (${match.det})</strong><br><span>${match.mol}</span>`;
  });

  spectrumWrap.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

// Card 3 Demo: Sub-Pixel Centroiding Simulator
function initCard3Demo() {
  const canvas = document.getElementById("bento-centroid-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Draw 5x5 sub-pixel flux intensity grid
  const gridSize = 5;
  const cellSize = canvas.width / gridSize;

  // Gaussian intensity profile centered at (2.42, 2.68)
  const cx = 2.42;
  const cy = 2.68;
  const sigma = 0.85;

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const distSq = Math.pow(gx + 0.5 - cx, 2) + Math.pow(gy + 0.5 - cy, 2);
      const intensity = Math.exp(-distSq / (2 * sigma * sigma));

      // Steel grey to Signal Red intensity mapping
      ctx.fillStyle = `rgba(229, 72, 77, ${0.1 + (intensity * 0.85)})`;
      ctx.fillRect(gx * cellSize, gy * cellSize, cellSize - 1, cellSize - 1);
    }
  }

  // Draw Sub-Pixel Centroid Crosshair in Off-White
  const px = cx * cellSize;
  const py = cy * cellSize;
  ctx.strokeStyle = "#F3F4F6";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(px - 10, py);
  ctx.lineTo(px + 10, py);
  ctx.moveTo(px, py - 10);
  ctx.lineTo(px, py + 10);
  ctx.stroke();

  ctx.strokeStyle = "#E5484D";
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.stroke();
}

// Card 4 Demo: Citizen Verification Ladder Clicker
function initCard4Demo() {
  const steps = document.querySelectorAll(".lp-ladder-step");
  const statusDesc = document.getElementById("ladder-status-desc");
  if (!steps.length || !statusDesc) return;

  const descriptions = [
    "Step 1 (Logged): Candidate recorded in Citizen Science SQLite database with coordinates, detector D5, and timestamp.",
    "Step 2 (Self-Checked): User checked all 6 dichroic detector bands to rule out diffraction spikes and optical artifacts.",
    "Step 3 (Independent Review): Verified by at least two Backyard Worlds peer reviewers against Gaia & AllWISE.",
    "Step 4 (Confirmed): Validated high proper-motion candidate ready for Keck / JWST follow-up spectroscopy!",
  ];

  steps.forEach((step, idx) => {
    step.addEventListener("click", () => {
      steps.forEach((s) => s.classList.remove("active"));
      step.classList.add("active");
      statusDesc.textContent = descriptions[idx];
    });
  });
}

// ============================================================================
// 4. DICHROIC INSTRUMENT BREAKDOWN
// ============================================================================

function initDichroicBreakdown() {
  const cards = document.querySelectorAll(".lp-dichroic-card");
  const detailBox = document.getElementById("dichroic-detail-text");
  if (!cards.length) return;

  const details = [
    "Pair 1 (D1 + D4): Balances 0.75–1.11 µm near-IR with 2.42–3.82 µm thermal window. Crucial for detecting cool M/L dwarfs and water frost absorption.",
    "Pair 2 (D2 + D5): High-resolution R=110 channel covering 3.82–4.42 µm. Essential for mapping Carbon Dioxide (CO2) ice/gas features in comets and Y-dwarfs.",
    "Pair 3 (D3 + D6): Resolving power R=130 covering 4.42–5.00 µm. Directly captures the peak 4.5 µm thermal atmospheric flux of ultra-cool sub-stellar worlds (~250 K).",
  ];

  cards.forEach((card, idx) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      if (detailBox) detailBox.textContent = details[idx];
    });
  });
}

// ============================================================================
// 5. INSTANT LAUNCH BAR & QUICK-PICK CHIPS
// ============================================================================

function initLaunchBar() {
  const launchInput = document.getElementById("hero-launch-input");
  const launchBtn = document.getElementById("hero-launch-btn");
  const chips = document.querySelectorAll(".lp-target-chip");

  function launchWithInput() {
    const val = launchInput ? launchInput.value.trim() : "";
    if (!val) {
      switchView("explorer");
      return;
    }

    // Check if input matches RA Dec numbers (e.g., "133.795125 -7.245147")
    const coordMatch = val.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      switchView("explorer", {
        ra: parseFloat(coordMatch[1]),
        dec: parseFloat(coordMatch[2]),
        name: `RA ${coordMatch[1]}, Dec ${coordMatch[2]}`,
        det: "5",
      });
    } else {
      switchView("explorer", {
        name: val,
        det: "5",
      });
    }
  }

  if (launchBtn) launchBtn.addEventListener("click", launchWithInput);
  if (launchInput) {
    launchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") launchWithInput();
    });
  }

  // Quick Chips
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const targetKey = chip.getAttribute("data-target-key");
      const target = PRESET_TARGETS[targetKey];
      if (target) {
        switchView("explorer", {
          name: target.query,
          ra: target.ra,
          dec: target.dec,
          det: target.det,
          fov: target.fov,
        });
      }
    });
  });

  // Top Nav Explorer CTA
  const navExplorerBtn = document.getElementById("launch-explorer-nav-btn");
  if (navExplorerBtn) {
    navExplorerBtn.addEventListener("click", () => switchView("explorer"));
  }

  // Footer Explorer CTA
  const footerExplorerBtn = document.getElementById("launch-explorer-footer-btn");
  if (footerExplorerBtn) {
    footerExplorerBtn.addEventListener("click", () => switchView("explorer"));
  }

  // Workspace Back to Landing Button
  const backToLandingBtn = document.getElementById("back-to-landing-btn");
  if (backToLandingBtn) {
    backToLandingBtn.addEventListener("click", () => switchView("landing"));
  }

  // Header Brand Logo click
  const brandBadge = document.querySelector(".hud-header-left .brand-badge");
  if (brandBadge) {
    brandBadge.addEventListener("click", () => switchView("landing"));
  }
}

// ============================================================================
// 6. INITIALIZATION ENTRYPOINT
// ============================================================================

window.addEventListener("DOMContentLoaded", () => {
  initRoute();
  new HeroBlinkSimulator("hero-blink-canvas");
  initCard1Demo();
  initCard2Demo();
  initCard3Demo();
  initCard4Demo();
  initDichroicBreakdown();
  initLaunchBar();
});
