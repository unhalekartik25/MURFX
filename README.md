# MURFX: SPHEREx Wise-Cube & Blink Explorer

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-orange)](https://www.spaceappschallenge.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)

**MURFX** is a high-performance, public web application created for the **NASA Space Apps Challenge 2026** under the challenge topic *"Planet X and SPHEREx"*.

The tool allows researchers, citizen scientists, and astronomy enthusiasts to enter any celestial coordinates or object name and instantly explore aligned, time-ordered, and wavelength-ordered infrared cutouts from NASA's **SPHEREx** mission via the Infrared Science Archive (IRSA).

---

## Key Features

1. **Dual-Mode Blinking**:
   - **Time-Blink**: Animate exposures in chronological order to detect high-proper-motion stars, brown dwarfs, asteroids, and moving solar system bodies.
   - **Wavelength-Blink**: Animate exposures across spectral space ($0.75\text{ to }5.0\,\mu\text{m}$) across SPHEREx detectors D1 through D6 to inspect chemical and spectral features.
2. **Tangent-Plane WCS Alignment**:
   - Every cutout is reprojected via `reproject` onto a common North-Up, East-Left tangent sky grid fixed on the sky, eliminating pointing jitter and keeping fixed background stars stationary.
3. **NEOSSat-Grade Background Subtraction**:
   - Eliminates temporal zodiacal light fluctuations with median and zodiacal model background subtraction (`none`, `median`, `zodi`).
4. **Time-Bin Stacking (`mode=stack`)**:
   - Inverse-variance weighted co-addition of exposures into time bins ($1\text{ to }180\text{ days}$), boosting the Signal-to-Noise Ratio (SNR) by approximately $\sqrt{N}$.
5. **Gaia DR3 Real-Time Cross-Match Overlay**:
   - Overlays known Gaia DR3 catalog stars on the canvas, dynamically propagating their positions from catalog epoch J2016.0 to each frame's exact observation epoch with proper-motion vector arrows.
6. **Central Flux Sparkline**:
   - Interactive native HTML5 canvas sparkline displaying target central $3\times3$ pixel mean flux over time, ideal for monitoring variable stars (e.g. RW Aurigae, R Draconis).
7. **Aladin Lite Sky Context Panel**:
   - Built-in Aladin Lite v3 viewer synchronized with the target coordinates and field of view, providing multi-wavelength survey context (2MASS, DSS).
8. **Embeddable & Shareable**:
   - URL parameter synchronization (`ra`, `dec`, `name`, `fov`, `det`, `mode`, `fps`) and `embed=1` parameter for responsive, lightweight iframe integration into blogs and science articles.

---

## Architecture

The system operates as a single FastAPI Python backend serving both the REST API and the static web client:

```
Browser (HTML5 / ES Modules / Canvas)  --HTTP-->  FastAPI App (uvicorn)  --TAP/HTTPS-->  IRSA Archive
    |                                                |
    +-- Controls, Blink Player, Sparkline            +-- In-Memory Job Queue (ThreadPool)
    +-- Canvas Overlays (Crosshair, Scale, Compass)   +-- LRU Atomic Disk Cache (cache/cutouts, cache/sequences)
    +-- Aladin Lite v3 (CDS Strasbourg)              +-- Gaia DR3 & SIMBAD TAP Resolvers
```

### Key Architectural Decisions
- **No Database**: Pure file-based LRU disk cache and in-memory job registry. The system is lightweight, stateless, and instantly deployable.
- **Single Uvicorn Worker**: Prevents concurrency desynchronization and maintains global memory/disk limits.
- **Strict Privacy**: Zero tracking, zero analytics, and zero cookies (`Set-Cookie` is never sent).
- **Strict Security**: Parameter validation via Pydantic (`extra="forbid"`), ADQL injection prevention (strictly formatted numeric parameters), allowlisted HTTPS outbound hosts, and rigorous Content Security Policy (`CSP`).

---

## Verified Challenge Test Targets

All five required challenge targets can be loaded directly in the UI via one-click quick-pick buttons or by name:

| Target | Entry Method | Phenomenon & Behavior | Recommended Settings |
|---|---|---|---|
| **WISE 0855** | Coordinates or "WISE 0855" | Extremely cold brown dwarf moving $\sim 8''/\text{yr}$; shifts visibly across epochs | Detector 5 or 6, $\text{FOV}=8.0'$, Stack mode |
| **Barnard's Star** | "Barnard's Star" | High proper motion star ($\sim 10.3''/\text{yr}$); centered on **propagated J2026.0** position | Detector 1 or 2, $\text{FOV}=8.0'$ |
| **Epsilon Indi B** | "eps Ind B" | Brown dwarf binary shifting against stationary background stars | Detector 2 or 3, $\text{FOV}=12.0'$ |
| **RW Aurigae** | "RW Aur" | Young irregular variable star displaying dramatic brightness swings across epochs | Detector 1, 2, or 3, $\text{FOV}=4.0'$ |
| **R Draconis** | "R Dra" | Mira-type periodic variable star with pronounced amplitude changes | Detector 1, 2, or 3, $\text{FOV}=4.0'$ |

---

## Quick Start (Local / GitHub Codespaces)

### 1. Environment Setup
```bash
# Clone repository
git clone https://github.com/unhalekartik25/MURFX.git
cd MURFX

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --no-cache-dir -r requirements.txt
```

### 2. Run Development Server
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### 3. Run Verification Tests
```bash
# Run offline unit and integration tests
python -m pytest -q

# Run live network tests (requires internet connection to IRSA / Gaia)
python -m pytest -q -m network

# Run target verification runner
python scripts/run_targets.py --target all
```

---

## Deployment (Docker / Cloud Containers)

The repository includes an optimized `Dockerfile` tailored for deployment on **Render**, **Hugging Face Spaces**, or standard container environments:

```bash
# Build Docker image
docker build -t murfx-spherex-viewer .

# Run container with 512MB RAM cap
docker run -p 8000:8000 --memory="512m" murfx-spherex-viewer
```

Run deployment smoke test:
```bash
python scripts/smoke_deploy.py http://localhost:8000 --deep
```

---

## REST API Reference

Base path: `/api/v1`

- `GET /api/v1/health`: Health status, application version, pipeline version, and uptime (`?deep=1` performs live IRSA TAP ping).
- `GET /api/v1/meta`: Static metadata, detector wavelength boundaries, field of view bounds, and latest observation timestamp.
- `GET /api/v1/resolve?name=<string>`: Resolves astronomical object names via SIMBAD with proper motion propagation to `J2026.0`.
- `GET /api/v1/catalog/gaia?ra=<deg>&dec=<deg>&radius_arcmin=<min>`: Returns Gaia DR3 sources with positions and proper motions.
- `POST /api/v1/sequences`: Enqueues or retrieves a sequence job. Returns `200 OK` if cached or `202 Accepted` with `Location` header.
- `GET /api/v1/sequences/{key}`: Polls processing status (`queued`, `running`, `done`, `failed`) and returns metadata.
- `GET /api/v1/sequences/{key}/frames/{index}.png`: Returns rendered 8-bit grayscale+alpha PNG frame with North up and East left.
- `GET /api/v1/sequences/{key}/frames/{index}/flags.png`: Returns bad-pixel mask overlay PNG.

---

## How Updates Work

The application requires no periodic re-ingestion or database sync. Every sequence query checks live IRSA TAP metadata, cached under an in-memory TTL (`TAP_CACHE_TTL_S = 6h`). As NASA IRSA ingests new SPHEREx data releases weekly, new exposures become automatically discoverable upon cache expiration.

---

## Credits & Attribution

- **NASA Space Apps Challenge 2026**: Challenge *"Planet X and SPHEREx"*.
- **Data Source**: Data provided by the **NASA / IPAC Infrared Science Archive (IRSA)**, operated by the Jet Propulsion Laboratory, California Institute of Technology, under contract with the National Aeronautics and Space Administration.
- **Catalogs**: CDS SIMBAD & Sesame name resolvers; ESA Gaia DR3; CDS Aladin Lite v3.
