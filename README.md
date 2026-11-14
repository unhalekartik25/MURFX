# MURFX: SPHEREx Wise-Cube & Blink Explorer

Public web tool for the **NASA Space Apps Challenge 2026** (*"Planet X and SPHEREx"*).

MURFX displays time-series and spectral infrared image cutouts from NASA's SPHEREx mission via IRSA, aligns them onto a common WCS sky grid, and provides interactive blink animations to spot moving and changing celestial objects.

## Architecture

- **Backend**: Python (FastAPI, uvicorn), Astropy, Reproject, SciPy, PyVO / Astroquery
- **Frontend**: Plain HTML5, CSS3, ES modules (no JS framework, no bundler)
- **Data Source**: NASA / IPAC Infrared Science Archive (IRSA) TAP & Cutout service
- **Persistence**: File-based LRU cache and in-memory job queue (no database required)

## Quick Start (Local / Codespaces)

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server (single worker required)
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Running Tests

```bash
# Run offline unit and integration tests
python -m pytest -q

# Run live network tests (includes external IRSA pings)
python -m pytest -q -m network
```

## API Endpoints

- `GET /api/v1/health`: Server health and version info (support `?deep=1` for IRSA ping)
- `GET /api/v1/meta`: Static metadata, detector bands, and limits
- `GET /`: Interactive web client

## Attribution

Data provided by NASA SPHEREx / IPAC / IRSA / Caltech. Built for NASA Space Apps Challenge 2026.
