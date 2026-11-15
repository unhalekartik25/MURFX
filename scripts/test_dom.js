const fs = require('fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');
const requiredElements = [
  'id="app-header"',
  'id="tab-setup"',
  'id="tab-studio"',
  'id="tab-aladin"',
  'id="tab-lab"',
  'id="launch-tour-btn"',
  'id="open-candidate-btn"',
  'id="view-setup"',
  'id="view-studio"',
  'id="view-aladin"',
  'id="view-lab"',
  'id="target-input"',
  'id="resolve-btn"',
  'id="ra-input"',
  'id="dec-input"',
  'id="fov-input"',
  'id="submit-btn"',
  'id="share-link-btn"',
  'id="embed-snippet-btn"',
  'id="blink-canvas"',
  'id="gaia-canvas"',
  'id="flags-canvas"',
  'id="ruler-canvas"',
  'id="play-pause-btn"',
  'id="step-prev-btn"',
  'id="step-next-btn"',
  'id="frame-slider"',
  'id="loop-btn"',
  'id="bounce-btn"',
  'id="speed-select"',
  'id="set-frame-a-btn"',
  'id="set-frame-b-btn"',
  'id="blink-ab-btn"',
  'id="diff-ab-btn"',
  'id="export-gif-btn"',
  'id="export-fits-btn"',
  'id="spectrum-canvas"',
  'id="play-audio-btn"',
  'id="export-spectrum-csv-btn"',
  'id="toggle-crosshair"',
  'id="toggle-compass"',
  'id="toggle-scale"',
  'id="toggle-gaia"',
  'id="toggle-wise"',
  'id="toggle-neossat"',
  'id="toggle-ruler"',
  'id="toggle-centroid"',
  'id="toggle-invert"',
  'id="toggle-smooth"',
  'id="toggle-flags"',
  'id="aladin-lite-div"',
  'id="toggle-aladin-btn"',
  'id="card-gaia-desc"',
  'id="card-wise-desc"',
  'id="card-neossat-desc"',
  'id="candidate-form"',
  'id="save-candidate-btn"',
  'id="export-candidates-btn"',
  'id="frames-table-body"',
  'id="tour-modal"'
];

let missing = 0;
for (const el of requiredElements) {
  if (!html.includes(el)) {
    console.error('MISSING:', el);
    missing++;
  }
}
if (missing === 0) {
  console.log(`[PASS] All ${requiredElements.length} required DOM elements verified in index.html!`);
} else {
  console.error(`[FAIL] ${missing} elements missing.`);
  process.exit(1);
}

// Landing Page Specific Elements
const landingElements = [
  'id="landing-view"',
  'id="landing-hero"',
  'id="landing-telemetry"',
  'id="landing-mission"',
  'id="landing-how"',
  'id="landing-spectroscopy"',
  'id="landing-citizen"',
  'id="hero-blink-canvas"',
  'id="hero-launch-input"',
  'id="hero-launch-btn"',
  'data-target-key="wise0855"',
  'data-target-key="mass0415"',
  'data-target-key="luhman16"',
  'data-target-key="comet2025"',
  'id="bento-diff-canvas"',
  'id="bento-spectrum-wrap"',
  'id="bento-centroid-canvas"',
  'id="dichroic-detail-text"',
  'assets/murfx-logo.png'
];

let missingLanding = 0;
for (const el of landingElements) {
  if (!html.includes(el)) {
    console.error('MISSING LANDING ELEMENT:', el);
    missingLanding++;
  }
}
if (missingLanding === 0) {
  console.log(`[PASS] All ${landingElements.length} Landing Page components verified!`);
} else {
  console.error(`[FAIL] ${missingLanding} Landing elements missing.`);
  process.exit(1);
}
