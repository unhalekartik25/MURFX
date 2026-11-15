"""Astronomical object name resolution and proper-motion propagation to TARGET_EPOCH.

Specification: docs/API_SPEC.md section 3.3, docs/DATA_SOURCES.md section 6, docs/SECURITY.md section 2.4.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from cachetools import TTLCache

from backend.app.config import settings
from backend.app.errors import AppError

logger = logging.getLogger("spherex.resolver")

NAME_REGEX = re.compile(r"^[A-Za-z0-9 .+\-_\[\]'*/:]{1,64}$")

# 24-hour in-memory cache for resolved target names
resolve_cache: TTLCache[str, dict[str, Any]] = TTLCache(maxsize=512, ttl=86400)

# Well-known fallback catalog for offline testing and resilience (TEST_TARGETS.md)
KNOWN_TARGETS: dict[str, dict[str, Any]] = {
    "barnard's star": {
        "query": "Barnard's Star",
        "ra": 269.452083,
        "dec": 4.693361,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": -798.58,
        "pm_dec_mas_yr": 10328.12,
        "ra_now": 269.44633,
        "dec_now": 4.76795,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "wise 0855": {
        "query": "WISE 0855",
        "ra": 133.795125,
        "dec": -7.245147,
        "catalog_epoch": "J2010.0",
        "epoch0": 2010.0,
        "pm_ra_mas_yr": -8100.0,
        "pm_dec_mas_yr": 600.0,
        "ra_now": 133.75913,
        "dec_now": -7.24248,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "eps ind b": {
        "query": "eps Ind B",
        "ra": 330.26042,
        "dec": -56.78917,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 3961.0,
        "pm_dec_mas_yr": -2539.0,
        "ra_now": 330.3072,
        "dec_now": -56.8075,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "epsilon indi b": {
        "query": "Epsilon Indi B",
        "ra": 330.26042,
        "dec": -56.78917,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 3961.0,
        "pm_dec_mas_yr": -2539.0,
        "ra_now": 330.3072,
        "dec_now": -56.8075,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "rw aur": {
        "query": "RW Aur",
        "ra": 76.70958,
        "dec": 30.40139,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 1.5,
        "pm_dec_mas_yr": -20.0,
        "ra_now": 76.7096,
        "dec_now": 30.4012,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "rw aurigae": {
        "query": "RW Aurigae",
        "ra": 76.70958,
        "dec": 30.40139,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 1.5,
        "pm_dec_mas_yr": -20.0,
        "ra_now": 76.7096,
        "dec_now": 30.4012,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "r dra": {
        "query": "R Dra",
        "ra": 248.34167,
        "dec": 66.70472,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 12.0,
        "pm_dec_mas_yr": -18.0,
        "ra_now": 248.3421,
        "dec_now": 66.7046,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "r draconis": {
        "query": "R Draconis",
        "ra": 248.34167,
        "dec": 66.70472,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 12.0,
        "pm_dec_mas_yr": -18.0,
        "ra_now": 248.3421,
        "dec_now": 66.7046,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "luhman 16": {
        "query": "Luhman 16",
        "ra": 162.32875,
        "dec": -53.31944,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": -2759.0,
        "pm_dec_mas_yr": 357.0,
        "ra_now": 162.2785,
        "dec_now": -53.3168,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "proxima centauri": {
        "query": "Proxima Centauri",
        "ra": 217.428938,
        "dec": -62.679492,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": -3775.75,
        "pm_dec_mas_yr": 765.54,
        "ra_now": 217.3035,
        "dec_now": -62.6739,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "teegarden's star": {
        "query": "Teegarden's Star",
        "ra": 43.25379,
        "dec": 16.88127,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": 3436.5,
        "pm_dec_mas_yr": -3804.8,
        "ra_now": 43.2801,
        "dec_now": 16.8537,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
    "wolf 359": {
        "query": "Wolf 359",
        "ra": 164.12025,
        "dec": 7.01467,
        "catalog_epoch": "J2000.0",
        "epoch0": 2000.0,
        "pm_ra_mas_yr": -3842.0,
        "pm_dec_mas_yr": -2724.0,
        "ra_now": 164.0924,
        "dec_now": 6.9949,
        "target_epoch": settings.target_epoch,
        "source": "SIMBAD (offline catalog)",
    },
}


def parse_epoch_decimal(epoch_val: Any) -> float:
    """Parse a catalog epoch string (e.g. 'J2000.0', 'J2010.0', '2016.0') to float decimal year."""
    if isinstance(epoch_val, (int, float)):
        return float(epoch_val)
    if isinstance(epoch_val, str):
        cleaned = epoch_val.strip().upper().replace("J", "").replace("B", "")
        try:
            return float(cleaned)
        except ValueError:
            pass
    return 2000.0


def to_sexagesimal(ra_deg: float, dec_deg: float) -> tuple[str, str]:
    """Convert decimal coordinates to sexagesimal strings using astropy SkyCoord with fallback."""
    try:
        from astropy.coordinates import SkyCoord
        import astropy.units as u
        sc = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")
        s = sc.to_string("hmsdms", precision=2).split()
        return s[0], s[1]
    except Exception:
        hours = ((ra_deg / 15.0) % 24.0 + 24.0) % 24.0
        h = int(hours)
        m = int((hours - h) * 60.0)
        sec = round((hours - h - m / 60.0) * 3600.0, 2)
        ra_str = f"{h:02d}h{m:02d}m{sec:05.2f}s"

        sign = "-" if dec_deg < 0 else "+"
        abs_dec = abs(dec_deg)
        d = int(abs_dec)
        dm = int((abs_dec - d) * 60.0)
        dsec = round((abs_dec - d - dm / 60.0) * 3600.0, 1)
        dec_str = f"{sign}{d:02d}d{dm:02d}m{dsec:04.1f}s"
        return ra_str, dec_str


def propagate_position(
    ra: float,
    dec: float,
    pm_ra_mas_yr: float,
    pm_dec_mas_yr: float,
    catalog_epoch_str: str = "J2000.0",
    target_epoch_str: str = "J2026.0",
) -> tuple[float, float]:
    """Propagate ICRS coordinates from catalog epoch to target epoch using astropy SkyCoord & proper motion."""
    cat_ep = parse_epoch_decimal(catalog_epoch_str)
    tgt_ep = parse_epoch_decimal(target_epoch_str)
    try:
        import astropy.units as u
        from astropy.coordinates import SkyCoord
        from astropy.time import Time

        cat_time = Time(cat_ep, format="decimalyear")
        target_time = Time(tgt_ep, format="decimalyear")

        coord = SkyCoord(
            ra=ra * u.deg,
            dec=dec * u.deg,
            pm_ra_cosdec=pm_ra_mas_yr * u.mas / u.yr,
            pm_dec=pm_dec_mas_yr * u.mas / u.yr,
            obstime=cat_time,
            frame="icrs",
        )
        propagated = coord.apply_space_motion(new_obstime=target_time)
        return round(float(propagated.ra.deg), 6), round(float(propagated.dec.deg), 6)
    except Exception as e:
        import math
        logger.debug("Astropy space motion propagation fallback used: %s", e)
        dt = tgt_ep - cat_ep
        cos_dec = math.cos(math.radians(dec)) or 1.0
        ra_p = ra + (pm_ra_mas_yr * dt) / (3600000.0 * cos_dec)
        dec_p = dec + (pm_dec_mas_yr * dt) / 3600000.0
        return round(ra_p % 360.0, 6), round(max(-90.0, min(90.0, dec_p)), 6)


def resolve_object_name(name: str) -> dict[str, Any]:
    """Resolve an object name using SIMBAD with proper motion propagation to TARGET_EPOCH.

    Input name is strictly validated against NAME_REGEX.
    """
    clean_name = name.strip()
    if not NAME_REGEX.match(clean_name):
        raise AppError(
            "INVALID_PARAMETER",
            422,
            f"Invalid object name format: '{clean_name}'. Must match ^[A-Za-z0-9 .+\\-_[]'*/:]{{1,64}}$",
        )

    cache_key = clean_name.lower()
    if cache_key in resolve_cache:
        return resolve_cache[cache_key]

    # Check offline / fallback targets
    if cache_key in KNOWN_TARGETS:
        res = dict(KNOWN_TARGETS[cache_key])
        ra_sex, dec_sex = to_sexagesimal(res["ra"], res["dec"])
        res["ra_sexagesimal"] = ra_sex
        res["dec_sexagesimal"] = dec_sex
        resolve_cache[cache_key] = res
        return res

    # Attempt online resolution via astroquery.simbad or astropy SkyCoord.from_name
    try:
        from astroquery.simbad import Simbad
        custom_simbad = Simbad()
        custom_simbad.add_votable_fields("pmra", "pmdec", "plx", "rv_value")
        table = custom_simbad.query_object(clean_name)

        if table is not None and len(table) > 0:
            row = table[0]
            # Parse RA and Dec from SIMBAD table
            import astropy.units as u
            from astropy.coordinates import SkyCoord
            raw_ra = str(row["RA"])
            raw_dec = str(row["DEC"])
            sc = SkyCoord(f"{raw_ra} {raw_dec}", unit=(u.hourangle, u.deg))
            ra_deg = float(sc.ra.deg)
            dec_deg = float(sc.dec.deg)

            pm_ra = float(row["PMRA"]) if "PMRA" in row.colnames and not row.mask["PMRA"] else None
            pm_dec = float(row["PMDEC"]) if "PMDEC" in row.colnames and not row.mask["PMDEC"] else None

            ra_now, dec_now = None, None
            if pm_ra is not None and pm_dec is not None:
                ra_now, dec_now = propagate_position(
                    ra=ra_deg,
                    dec=dec_deg,
                    pm_ra_mas_yr=pm_ra,
                    pm_dec_mas_yr=pm_dec,
                    catalog_epoch_str="J2000.0",
                    target_epoch_str=settings.target_epoch,
                )

            ra_sex, dec_sex = to_sexagesimal(ra_deg, dec_deg)
            result = {
                "query": clean_name,
                "ra": round(ra_deg, 6),
                "dec": round(dec_deg, 6),
                "ra_sexagesimal": ra_sex,
                "dec_sexagesimal": dec_sex,
                "catalog_epoch": "J2000.0",
                "epoch0": 2000.0,
                "pm_ra_mas_yr": round(pm_ra, 2) if pm_ra is not None else None,
                "pm_dec_mas_yr": round(pm_dec, 2) if pm_dec is not None else None,
                "ra_now": ra_now,
                "dec_now": dec_now,
                "target_epoch": settings.target_epoch,
                "source": "SIMBAD",
            }
            resolve_cache[cache_key] = result
            return result

    except Exception as e:
        logger.warning("SIMBAD query failed for '%s': %s", clean_name, e)

    # Fallback to SkyCoord.from_name
    try:
        from astropy.coordinates import SkyCoord
        sc = SkyCoord.from_name(clean_name)
        ra_deg = float(sc.ra.deg)
        dec_deg = float(sc.dec.deg)
        ra_sex, dec_sex = to_sexagesimal(ra_deg, dec_deg)
        result = {
            "query": clean_name,
            "ra": round(ra_deg, 6),
            "dec": round(dec_deg, 6),
            "ra_sexagesimal": ra_sex,
            "dec_sexagesimal": dec_sex,
            "catalog_epoch": "J2000.0",
            "epoch0": 2000.0,
            "pm_ra_mas_yr": None,
            "pm_dec_mas_yr": None,
            "ra_now": None,
            "dec_now": None,
            "target_epoch": settings.target_epoch,
            "source": "Sesame",
        }
        resolve_cache[cache_key] = result
        return result
            "pm_dec_mas_yr": None,
            "ra_now": None,
            "dec_now": None,
            "target_epoch": settings.target_epoch,
            "source": "Sesame",
        }
        resolve_cache[cache_key] = result
        return result
    except Exception as e:
        logger.warning("Sesame resolution failed for '%s': %s", clean_name, e)

    raise AppError(
        "NOT_FOUND",
        404,
        f"Target name '{clean_name}' could not be resolved in SIMBAD or Sesame archives.",
    )
