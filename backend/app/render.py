"""PNG rendering of 2D image arrays and flag masks.

Specification: docs/ARCHITECTURE.md section 5 step 10:
- Mode LA (Grayscale + Alpha)
- Alpha 0 where invalid / NaN
- Row 0 of the PNG is NORTH (top) -> flip array vertically (np.flipud) because FITS arrays are bottom-up
"""

from __future__ import annotations

import io
import numpy as np
from PIL import Image


def render_to_png_bytes(
    array_uint8: np.ndarray,
    valid_mask: np.ndarray,
) -> bytes:
    """Encode 2D uint8 array and boolean mask into a PNG image.

    Flips vertically so Row 0 corresponds to North (top of the image).
    """
    if array_uint8.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {array_uint8.shape}")

    # Invert vertical axis: FITS is row 0 = South (bottom), PNG is row 0 = North (top)
    gray = np.flipud(array_uint8)
    alpha = np.flipud(np.where(valid_mask, 255, 0).astype(np.uint8))

    # Stack grayscale and alpha into shape (H, W, 2)
    la_array = np.dstack((gray, alpha))

    img = Image.fromarray(la_array, mode="LA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_flags_png(flags_mask: np.ndarray) -> bytes:
    """Render a boolean flag mask as an RGBA PNG overlay with semi-transparent red on bad pixels."""
    if flags_mask.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {flags_mask.shape}")

    h, w = flags_mask.shape
    flipped_mask = np.flipud(flags_mask)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    # Bad pixels marked with semi-transparent red (R=239, G=68, B=68, A=160)
    rgba[flipped_mask] = [239, 68, 68, 160]

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_difference_png(
    diff_array: np.ndarray,
    valid_mask: np.ndarray,
    already_flipped: bool = True,
    colormap: str = "grayscale",
) -> bytes:
    """Render a 2D difference array into a PNG image.

    Modes:
      - 'grayscale' (Slice 7 default): Neutral zero difference mapped to 128 (neutral gray),
        positive values bright (>128), negative dark (<128) in LA mode.
      - 'diverging' (Dipole Difference Engine): Diverging scientific colormap where
        negative flux at t1 = vibrant blue, zero background static stars = pure black,
        and positive flux at t2 = amber/white in RGBA mode.
    """
    if diff_array.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {diff_array.shape}")

    valid = valid_mask & np.isfinite(diff_array)
    if np.any(valid):
        diff_valid = diff_array[valid]
        std = float(np.nanstd(diff_valid))
        limit = 3.0 * std if std > 1e-5 else float(np.percentile(np.abs(diff_valid), 99))
        if limit <= 1e-6:
            limit = 1.0
    else:
        limit = 1.0

    if colormap == "diverging":
        # Normalized difference in [-1, 1]
        norm = np.clip(np.nan_to_num(diff_array / limit, nan=0.0), -1.0, 1.0)
        h, w = diff_array.shape
        rgba = np.zeros((h, w, 4), dtype=np.uint8)

        # Negative mask (old position t1): Map 0 -> -1 to black -> vibrant celestial blue
        neg_mask = (norm < 0) & valid
        if np.any(neg_mask):
            t_neg = -norm[neg_mask]  # 0 to 1
            r_neg = np.clip(25.0 * t_neg, 0, 255).astype(np.uint8)
            g_neg = np.clip(135.0 * np.power(t_neg, 1.3), 0, 255).astype(np.uint8)
            b_neg = np.clip(255.0 * np.power(t_neg, 0.65), 0, 255).astype(np.uint8)
            rgba[neg_mask, 0] = r_neg
            rgba[neg_mask, 1] = g_neg
            rgba[neg_mask, 2] = b_neg

        # Positive mask (new position t2): Map 0 -> 1 to black -> rich amber -> white
        pos_mask = (norm > 0) & valid
        if np.any(pos_mask):
            t_pos = norm[pos_mask]  # 0 to 1
            r_pos = np.zeros_like(t_pos, dtype=np.float32)
            g_pos = np.zeros_like(t_pos, dtype=np.float32)
            b_pos = np.zeros_like(t_pos, dtype=np.float32)

            low = t_pos <= 0.65
            high = ~low

            # Low branch: black to amber
            if np.any(low):
                u_low = t_pos[low] / 0.65
                r_pos[low] = 255.0 * np.power(u_low, 0.75)
                g_pos[low] = 145.0 * u_low
                b_pos[low] = 20.0 * u_low

            # High branch: amber to incandescent white
            if np.any(high):
                u_high = (t_pos[high] - 0.65) / 0.35
                r_pos[high] = 255.0
                g_pos[high] = 145.0 + 110.0 * u_high
                b_pos[high] = 20.0 + 235.0 * u_high

            rgba[pos_mask, 0] = np.clip(r_pos, 0, 255).astype(np.uint8)
            rgba[pos_mask, 1] = np.clip(g_pos, 0, 255).astype(np.uint8)
            rgba[pos_mask, 2] = np.clip(b_pos, 0, 255).astype(np.uint8)

        # Alpha channel: opaque for valid pixels, 0 for outside FOV / masked
        rgba[:, :, 3] = np.where(valid, 255, 0).astype(np.uint8)

        if not already_flipped:
            rgba = np.flipud(rgba)

        img = Image.fromarray(rgba, mode="RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    # Standard grayscale LA mode
    scaled = 128.0 + 127.0 * np.clip(diff_array / limit, -1.0, 1.0)
    gray = np.nan_to_num(scaled, nan=128.0).astype(np.uint8)
    alpha = np.where(valid, 255, 0).astype(np.uint8)

    if not already_flipped:
        gray = np.flipud(gray)
        alpha = np.flipud(alpha)

    la_array = np.dstack((gray, alpha))
    img = Image.fromarray(la_array, mode="LA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_animation_gif(png_bytes_list: list[bytes], fps: int = 4) -> bytes:
    """Compile a list of PNG frame bytes into a looping Animated GIF (Slice 8).

    duration is in milliseconds per frame (e.g. fps=4 -> 250ms).
    loop=0 means loop indefinitely.
    """
    if not png_bytes_list:
        raise ValueError("Cannot render empty animation list")

    frames: list[Image.Image] = []
    for b in png_bytes_list:
        img = Image.open(io.BytesIO(b)).convert("RGB")
        frames.append(img)

    buf = io.BytesIO()
    duration_ms = max(50, int(1000 / max(1, min(15, fps))))

    frames[0].save(
        buf,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
    )
    return buf.getvalue()
