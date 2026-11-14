/**
 * MURFX Local Development Server
 * 
 * Zero-dependency native Node.js HTTP server that serves the frontend
 * and provides full mock / simulated SPHEREx API responses.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "8000", 10);
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const CACHE_DIR = path.join(ROOT_DIR, "cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Preset Targets for SIMBAD Resolver
const RESOLVE_PRESETS = {
  "wise 0855": { query: "WISE 0855", name: "WISE J085510.83−071442.5", ra: 133.795125, dec: -7.245147, pm_ra_mas_yr: -8100.0, pm_dec_mas_yr: 700.0, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "wise0855": { query: "WISE 0855", name: "WISE J085510.83−071442.5", ra: 133.795125, dec: -7.245147, pm_ra_mas_yr: -8100.0, pm_dec_mas_yr: 700.0, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "barnard's star": { query: "Barnard's Star", name: "Barnard's Star", ra: 269.452083, dec: 4.693333, pm_ra_mas_yr: -798.58, pm_dec_mas_yr: 10328.24, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "barnard": { query: "Barnard's Star", name: "Barnard's Star", ra: 269.452083, dec: 4.693333, pm_ra_mas_yr: -798.58, pm_dec_mas_yr: 10328.24, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "epsilon indi b": { query: "eps Ind B", name: "eps Ind B", ra: 330.840417, dec: -56.786111, pm_ra_mas_yr: 3961.4, pm_dec_mas_yr: -2538.3, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "eps ind b": { query: "eps Ind B", name: "eps Ind B", ra: 330.840417, dec: -56.786111, pm_ra_mas_yr: 3961.4, pm_dec_mas_yr: -2538.3, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "epsind": { query: "eps Ind B", name: "eps Ind B", ra: 330.840417, dec: -56.786111, pm_ra_mas_yr: 3961.4, pm_dec_mas_yr: -2538.3, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "rw aurigae": { query: "RW Aur", name: "RW Aur", ra: 77.10625, dec: 30.401389, pm_ra_mas_yr: 1.25, pm_dec_mas_yr: -18.7, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "rw aur": { query: "RW Aur", name: "RW Aur", ra: 77.10625, dec: 30.401389, pm_ra_mas_yr: 1.25, pm_dec_mas_yr: -18.7, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "rwaur": { query: "RW Aur", name: "RW Aur", ra: 77.10625, dec: 30.401389, pm_ra_mas_yr: 1.25, pm_dec_mas_yr: -18.7, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "r draconis": { query: "R Dra", name: "R Dra", ra: 247.575417, dec: 66.704722, pm_ra_mas_yr: -8.1, pm_dec_mas_yr: 15.4, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "r dra": { query: "R Dra", name: "R Dra", ra: 247.575417, dec: 66.704722, pm_ra_mas_yr: -8.1, pm_dec_mas_yr: 15.4, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
  "rdra": { query: "R Dra", name: "R Dra", ra: 247.575417, dec: 66.704722, pm_ra_mas_yr: -8.1, pm_dec_mas_yr: 15.4, target_epoch: "J2000.0", source: "SIMBAD (offline)", data_status: "simulated" },
};

// Sequences store in-memory for fast dev lookup
const activeSequences = new Map();

// Helper: Make PNG Chunk
function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = zlib.crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

// Helper: Generate Grayscale PNG
function createGrayscalePng(width, height, pixelFn) {
  const scanlines = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width);
    scanlines[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      scanlines[rowOffset + 1 + x] = Math.max(0, Math.min(255, Math.round(pixelFn(x, y))));
    }
  }
  const compressed = zlib.deflateSync(scanlines);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 0; // color type: grayscale
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdrData),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Helper: Read JSON Body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Generate Sequence Data
function buildMockSequence(reqData) {
  const ra = parseFloat(reqData.ra || 133.795125);
  const dec = parseFloat(reqData.dec || -7.245147);
  const det = parseInt(reqData.detector || 5, 10);
  const numFrames = 12;

  const key = crypto.createHash("md5").update(`${ra}_${dec}_${det}`).digest("hex");

  // SPHEREx band definitions (exact ranges per detector/array)
  const wavelengthsByDet = {
    1: [0.75, 1.11],   // D1: 0.75–1.11 µm
    2: [1.11, 1.64],   // D2: 1.11–1.64 µm
    3: [1.64, 2.42],   // D3: 1.64–2.42 µm
    4: [2.42, 3.82],   // D4: 2.42–3.82 µm
    5: [3.82, 4.42],   // D5: 3.82–4.42 µm
    6: [4.42, 5.00],   // D6: 4.42–5.00 µm
  };
  const [wMin, wMax] = wavelengthsByDet[det] || [3.82, 4.42];

  const frames = [];
  const startMjd = 60700.0; // Early 2025 SPHEREx observations
  for (let i = 0; i < numFrames; i++) {
    const mjd = startMjd + i * 28.5;
    const date = new Date((mjd - 40587) * 86400000).toISOString();
    const wl = wMin + (i / (numFrames - 1)) * (wMax - wMin);
    const centerVal = 3.2 + Math.sin(i * 0.7) * 1.5;

    frames.push({
      index: i,
      url: `/api/v1/sequences/${key}/frames/${i}.png`,
      mjd: Math.round(mjd * 100) / 100,
      iso: date,
      wavelength_um: Math.round(wl * 1000) / 1000,
      detector: det,
      n_exposures: 1,
      n_coadds: 1,
      flagged_fraction: 0.002,
      processing_version: "v1.2",
      center_value: Math.round(centerVal * 100) / 100,
    });
  }

  const result = {
    key,
    n_frames: numFrames,
    n_available: numFrames,
    truncated: false,
    n_failed_downloads: 0,
    request: { ra, dec, fov_arcmin: parseFloat(reqData.fov_arcmin || 8.0), detector: det },
    grid: {
      width: 100,
      height: 100,
      pixscale_arcsec: 3.08,
      native_pixscale_arcsec: 6.16,
      upsample: 2,
      orientation: "north-up, east-left, row 0 = north",
      wcs: {
        ctype: ["RA---TAN", "DEC--TAN"],
        crval: [ra, dec],
        crpix: [50.5, 50.5],
        cdelt_deg: [-0.000856, 0.000856],
      },
    },
    stretch: { mode: "global", function: "asinh", vmin: 0.0, vmax: 15.0, unit: "MJy/sr" },
    frames,
    warnings: [],
  };

  activeSequences.set(key, result);
  return { status: "done", key, result };
}

// Candidates File Helpers
function getCandidates(seqKey) {
  const filePath = path.join(CACHE_DIR, "candidates.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(list)) return [];
    if (seqKey) return list.filter((c) => c.sequence_key === seqKey);
    return list;
  } catch {
    return [];
  }
}

function saveCandidate(finding) {
  const filePath = path.join(CACHE_DIR, "candidates.json");
  const list = getCandidates();
  if (!finding.created_at) {
    finding.created_at = new Date().toISOString();
  }
  list.push(finding);
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
  return finding;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // Security Headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // API Endpoints
  if (pathname === "/api/v1/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", app: "MURFX", node_version: process.version }));
  }

  if (pathname === "/api/v1/meta") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        latest_observation: "2025-12-19T00:00:00Z",
        instrument: "SPHEREx",
        arrays: 6,
        channels_per_array: 17,
        total_channels: 102,
        pixel_scale_arcsec: 6.15,
      })
    );
  }

  if (pathname === "/api/v1/resolve") {
    const name = (parsedUrl.searchParams.get("name") || "").toLowerCase().trim();
    const preset = RESOLVE_PRESETS[name];
    if (preset) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(preset));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `Object "${name}" not found.` } }));
  }

  if (pathname === "/api/v1/sequences" && req.method === "POST") {
    try {
      const data = await parseJsonBody(req);
      const seqResponse = buildMockSequence(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(seqResponse));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "BAD_REQUEST", message: err.message } }));
    }
  }

  if (pathname.startsWith("/api/v1/sequences/") && pathname.endsWith("/frames/") === false) {
    const parts = pathname.split("/");
    const key = parts[4];

    // Frame PNG request: /api/v1/sequences/{key}/frames/{idx}.png
    if (parts[5] === "frames" && parts[6]) {
      const isFlags = parts[6].includes("flags");
      const idx = parseInt(parts[6], 10) || 0;

      const png = createGrayscalePng(100, 100, (x, y) => {
        if (isFlags) return 0; // zero flags
        // Background noise
        const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        let val = 15 + Math.abs(noise) * 20;

        // Static background star
        const dStar = Math.hypot(x - 30, y - 40);
        if (dStar < 6) val += Math.exp(-(dStar * dStar) / 5) * 160;

        // Moving Planet X / Brown Dwarf / Fast target shifting with frame index
        const targetX = 50 + (idx - 6) * 2.2;
        const targetY = 50 + (idx - 6) * 1.5;
        const dTarget = Math.hypot(x - targetX, y - targetY);
        if (dTarget < 6) val += Math.exp(-(dTarget * dTarget) / 5) * 220;

        return val;
      });

      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
      return res.end(png);
    }

    // Sequence Info GET
    if (parts.length === 5) {
      const seq = activeSequences.get(key);
      if (seq) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "done", key, result: seq }));
      }
    }
  }

  if (pathname === "/api/v1/spectrum") {
    const key = parsedUrl.searchParams.get("key") || "demo";
    const x = parseFloat(parsedUrl.searchParams.get("x") || 50);
    const y = parseFloat(parsedUrl.searchParams.get("y") || 50);

    const points = [];
    const wavelengths = [0.75, 0.95, 1.25, 1.65, 2.15, 2.85, 3.5, 4.15, 4.8];
    wavelengths.forEach((wl, i) => {
      points.push({
        wavelength_um: wl,
        flux_mjy_sr: Math.round((2.5 + Math.sin(i * 0.8) * 1.8) * 100) / 100,
        sigma: 0.12,
        mjd: 60700.0 + i * 35.0,
        detector: Math.min(6, Math.floor(i / 1.5) + 1),
      });
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ key, x, y, radius_px: 1, n_points: points.length, points }));
  }

  if (pathname.startsWith("/api/v1/catalog/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ sources: [] }));
  }

  if (pathname === "/api/v1/candidates" && req.method === "POST") {
    try {
      const finding = await parseJsonBody(req);
      const saved = saveCandidate(finding);
      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(saved));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { message: err.message } }));
    }
  }

  if (pathname === "/api/v1/candidates" && req.method === "GET") {
    const seqKey = parsedUrl.searchParams.get("sequence_key");
    const findings = getCandidates(seqKey);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(findings));
  }

  if (pathname === "/api/v1/candidates/export") {
    const seqKey = parsedUrl.searchParams.get("sequence_key");
    const findings = getCandidates(seqKey);
    const exportData = {
      project: "MURFX SPHEREx Wise-Cube & Blink Explorer",
      challenge: "NASA Space Apps Challenge 2026 - Planet X and SPHEREx",
      exported_at: new Date().toISOString(),
      filter_sequence_key: seqKey,
      total_findings: findings.length,
      findings,
    };
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="murfx_candidates.json"',
    });
    return res.end(JSON.stringify(exportData, null, 2));
  }

  // Static Frontend Files
  let filePath = path.join(FRONTEND_DIR, pathname === "/" ? "index.html" : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(FRONTEND_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 MURFX Server running at: http://localhost:${PORT}`);
  console.log(`Open in your browser: http://localhost:${PORT}/`);
  console.log(`======================================================\n`);
});
