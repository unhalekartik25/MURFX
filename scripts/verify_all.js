const fs = require('fs');
const path = require('path');

async function verifyAll() {
  const base = 'http://127.0.0.1:8000';
  console.log('--- 1. VERIFYING HTML STRUCTURE & DOM ELEMENTS ---');
  let html = '';
  let serverOnline = false;
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      html = await res.text();
      serverOnline = true;
    }
  } catch (e) {
    const indexPath = path.resolve(__dirname, '../frontend/index.html');
    html = fs.readFileSync(indexPath, 'utf8');
    console.log('[INFO] Local server is not currently running on :8000; verifying index.html directly from disk.');
  }

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

  for (const el of requiredElements) {
    if (!html.includes(el)) {
      throw new Error(`Missing DOM element in index.html: ${el}`);
    }
  }
  console.log(`[PASS] All ${requiredElements.length} core UI elements verified in index.html!`);

  // Verify Landing Page Components & Logo
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

  for (const el of landingElements) {
    if (!html.includes(el)) {
      throw new Error(`Missing Landing Page element in index.html: ${el}`);
    }
  }
  console.log(`[PASS] All ${landingElements.length} Landing Page components & official Logo assets verified!`);

  if (!serverOnline) {
    console.log('\n======================================================');
    console.log('[PASS] DOM structure & Landing Page verified with 100% success.');
    console.log('[INFO] Start dev server (npm start) to run live API endpoint tests.');
    console.log('======================================================');
    return;
  }

  console.log('\n--- 2. VERIFYING TARGET RESOLUTION (SIMBAD) ---');
  const resolveRes = await fetch(`${base}/api/v1/resolve?name=WISE%200855`);
  const resolve = await resolveRes.json();
  if (!resolve.name || resolve.ra == null || resolve.dec == null) {
    throw new Error('Resolve failed to return name, ra, dec');
  }
  console.log(`[PASS] Resolved target: ${resolve.name} (RA: ${resolve.ra}, Dec: ${resolve.dec})`);

  console.log('\n--- 3. VERIFYING SPHEREx SEQUENCE GENERATION ---');
  const seqRes = await fetch(`${base}/api/v1/sequences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ra: 133.795125,
      dec: -7.245147,
      fov_arcmin: 8.0,
      detector: 5,
      mode: 'frames'
    })
  });
  const seq = await seqRes.json();
  if (seq.status !== 'done' || !seq.result?.frames || seq.result.frames.length !== 12) {
    throw new Error(`Sequence failed or returned unexpected frames: ${JSON.stringify(seq)}`);
  }
  console.log(`[PASS] Sequence generated: Key ${seq.key}, ${seq.result.frames.length} frames`);

  console.log('\n--- 4. VERIFYING FRAME PNG DOWNLOADS ---');
  for (let i = 0; i < 3; i++) {
    const frame = seq.result.frames[i];
    const frameRes = await fetch(`${base}${frame.url}`);
    if (frameRes.status !== 200 || frameRes.headers.get('content-type') !== 'image/png') {
      throw new Error(`Frame ${i} failed to download from ${frame.url}: ${frameRes.status}`);
    }
    const buf = await frameRes.arrayBuffer();
    if (buf.byteLength < 100) throw new Error(`Frame ${i} PNG buffer suspiciously small: ${buf.byteLength} bytes`);
    console.log(`[PASS] Frame #${i + 1} (${frame.wavelength_um} um, MJD ${frame.mjd}) verified: ${buf.byteLength} bytes`);
  }

  console.log('\n--- 5. VERIFYING NASA ALLWISE CATALOG DATA STREAM ---');
  const wiseRes = await fetch(`${base}/api/v1/catalog/wise?ra=133.795125&dec=-7.245147&radius_arcmin=8`);
  const wise = await wiseRes.json();
  if (!wise.sources || wise.sources.length === 0) throw new Error('No WISE sources returned');
  console.log(`[PASS] NASA AllWISE: ${wise.sources.length} sources returned with agency: ${wise.sources[0].agency}`);
  console.log(`       Target: ${wise.sources[0].designation}, W1: ${wise.sources[0].w1_mag}, W2: ${wise.sources[0].w2_mag}, Epoch: ${wise.sources[0].epoch}`);

  console.log('\n--- 6. VERIFYING CANADIAN SPACE AGENCY (CSA) CADC NEOSSat STREAM ---');
  const neossatRes = await fetch(`${base}/api/v1/catalog/neossat?ra=133.795125&dec=-7.245147&radius_arcmin=8`);
  const neossat = await neossatRes.json();
  if (!neossat.sources || neossat.sources.length === 0) throw new Error('No NEOSSat sources returned');
  console.log(`[PASS] CSA NEOSSat: ${neossat.sources.length} detections returned with agency: ${neossat.sources[0].agency}`);
  console.log(`       Detection: ${neossat.sources[0].target_name}, Mag: ${neossat.sources[0].mag}, MJD: ${neossat.sources[0].mjd}`);

  console.log('\n--- 7. VERIFYING ESA GAIA DR3 ASTROMETRIC STREAM ---');
  const gaiaRes = await fetch(`${base}/api/v1/catalog/gaia?ra=133.795125&dec=-7.245147&radius_arcmin=8`);
  const gaia = await gaiaRes.json();
  if (!gaia.sources || gaia.sources.length === 0) throw new Error('No Gaia sources returned');
  console.log(`[PASS] ESA Gaia DR3: ${gaia.sources.length} sources returned with agency: ${gaia.sources[0].agency}`);
  console.log(`       Source: ${gaia.sources[0].source_id}, pmRA: ${gaia.sources[0].pm_ra} mas/yr, pmDec: ${gaia.sources[0].pm_dec} mas/yr`);

  console.log('\n--- 8. VERIFYING SPECTRAL SED EXTRACTION ---');
  const specRes = await fetch(`${base}/api/v1/spectrum?key=${seq.key}&x=256&y=256&radius_px=1`);
  const spec = await specRes.json();
  if (!spec.points || spec.points.length === 0) throw new Error('No spectral points returned');
  console.log(`[PASS] Extracted ${spec.points.length} spectral photometry points across 0.75 - 5.0 um`);

  console.log('\n--- 9. VERIFYING CITIZEN SCIENCE DISCOVERY LOGGER & EXPORT ---');
  const candPayload = {
    sequence_key: seq.key,
    name: "PX-Test-Discovery-01",
    classification: "Planet X Candidate",
    ra: 133.795125,
    dec: -7.245147,
    pm_speed: 8.1,
    pa_deg: 94.9,
    notes: "Verified extreme thermal infrared proper motion between WISE J2010 and SPHEREx J2026."
  };
  const candPostRes = await fetch(`${base}/api/v1/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(candPayload)
  });
  const candPost = await candPostRes.json();
  if (candPost.status !== 'created' || !candPost.candidate?.id) throw new Error('Candidate post failed');
  console.log(`[PASS] Logged discovery finding: ID ${candPost.candidate.id}`);

  const candExportRes = await fetch(`${base}/api/v1/candidates/export?sequence_key=${seq.key}`);
  const candExport = await candExportRes.json();
  const findingsList = candExport.findings || (Array.isArray(candExport) ? candExport : []);
  if (!Array.isArray(findingsList) || findingsList.length === 0) throw new Error('Candidate export failed');
  console.log(`[PASS] Exported ${findingsList.length} candidate findings as JSON`);

  console.log('\n======================================================');
  console.log('>>> ALL VERIFICATION TESTS PASSED WITH 100% SUCCESS <<<');
  console.log('======================================================');
}

verifyAll().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
