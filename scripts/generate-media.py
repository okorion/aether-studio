"""Render Aether's original silent films; no downloaded images, models, or footage.

Requirements: numpy, Pillow, imageio-ffmpeg.
Run: python scripts/generate-media.py
Preview only: python scripts/generate-media.py --posters-only
"""

import argparse
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "media"
WIDTH, HEIGHT, FPS, SECONDS = 640, 400, 24, 10
X, Y = np.meshgrid(
    np.linspace(-1.6, 1.6, WIDTH, dtype=np.float32),
    np.linspace(1, -1, HEIGHT, dtype=np.float32),
)
R = np.sqrt(X * X + Y * Y)
TAU = 2 * math.pi


def normalize(vector):
    return vector / np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-6)


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def grade(color, bloom=0.18):
    """ACES-like film response, with a soft optical bloom on bright regions."""
    color = np.maximum(color, 0)
    highlight = np.clip((color - 0.6) / 2.2, 0, 1)
    bloom_image = Image.fromarray(np.uint8(highlight * 255)).filter(ImageFilter.GaussianBlur(7))
    color += np.asarray(bloom_image, dtype=np.float32) / 255 * bloom
    color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14)
    color = np.clip(color, 0, 1) ** (1 / 2.2)
    return np.uint8(color * 255 + 0.5)


def chrome_current(phase):
    """A deforming metallic height surface reflecting authored studio lights."""
    flow = X + 0.19 * np.sin(Y * 3.1 + phase) + 0.07 * np.sin(X * 2.1 - phase)
    cross = Y + 0.12 * np.sin(X * 2.4 - phase) + 0.06 * np.cos(Y * 4.3 + phase)
    height = (
        0.25 * np.sin(flow * 5.0 + np.cos(cross * 3.0 - phase) * 1.35 + phase)
        + 0.10 * np.sin(cross * 8.0 + np.sin(flow * 3.1 + phase) * 1.4 - phase)
        + 0.035 * np.sin(flow * 16.0 + cross * 7.0 + phase * 2)
    )
    dy, dx = np.gradient(height, 2 / (HEIGHT - 1), 3.2 / (WIDTH - 1))
    normal = normalize(np.stack((-dx * 0.85, dy * 0.85, np.ones_like(X)), axis=-1))
    view = normalize(np.stack((-X * 0.18, -Y * 0.14, np.ones_like(X) * 1.3), axis=-1))
    dot = np.sum(normal * view, axis=-1, keepdims=True)
    reflection = 2 * normal * dot - view
    rx, ry, rz = reflection[..., 0], reflection[..., 1], reflection[..., 2]
    color = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    color[:] = (0.008, 0.018, 0.028)

    def light(mask, tint, power):
        nonlocal color
        color += mask[..., None] * np.asarray(tint, np.float32) * power

    # Long studio softboxes and colored cards, defined mathematically in the
    # reflected direction. Broad reflection bands reveal the surface's depth.
    silver = np.exp(-((ry - 0.44 - rx * 0.23) / 0.12) ** 2)
    silver *= 0.25 + 0.75 * smoothstep(-0.8, 0.0, rz)
    light(silver, (0.72, 0.89, 0.94), 2.25)
    light(np.exp(-((rx + 0.64) / 0.25) ** 2 - ((ry + 0.04) / 0.70) ** 2), (0.07, 0.38, 0.42), 1.55)
    light(np.exp(-((ry + 0.46 - rx * 0.14) / 0.075) ** 2), (0.72, 0.40, 0.14), 1.7)
    light(np.exp(-((rx - 0.60) / 0.15) ** 2 - ((ry - 0.15) / 0.62) ** 2), (0.46, 0.34, 0.73), 1.2)
    light(np.exp(-((ry - 0.79) / 0.045) ** 2), (0.82, 0.91, 1.0), 1.7)
    facing = np.clip(dot[..., 0], 0, 1)
    color *= (0.30 + 0.70 * (1 - (1 - facing) ** 3))[..., None]
    micro = 0.965 + 0.035 * np.cos(flow * 175 + cross * 90 + phase)
    color *= micro[..., None]
    vignette = 0.64 + 0.36 * np.exp(-(X * X * 0.45 + Y * Y * 0.70))
    color *= vignette[..., None]
    return grade(color, 0.17)


def aurora_bloom(phase):
    """Three folded, translucent light ribbons in an original dark atmosphere."""
    color = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    color[:] = (0.003, 0.008, 0.017)
    haze = np.exp(-((X + 0.36) ** 2 * 0.9 + (Y - 0.12) ** 2 * 1.6))
    color += haze[..., None] * np.array((0.005, 0.020, 0.023), np.float32)
    for layer in range(3):
        angle = -0.31 + layer * 0.28 + 0.09 * math.sin(phase + layer * 1.4)
        px = X * math.cos(angle) - Y * math.sin(angle)
        py = X * math.sin(angle) + Y * math.cos(angle)
        # Perspective-compressed, folded loops, with depth encoded by their
        # changing width, highlight and overlap. Every temporal term is periodic.
        px = px / (1.04 + layer * 0.11)
        py = py / (0.60 + layer * 0.09)
        theta = np.arctan2(py, px)
        radius = np.sqrt(px * px + py * py)
        bend = theta * 3 + phase + layer * 1.7
        centre = 0.77 + 0.095 * np.sin(bend) + 0.037 * np.cos(theta * 7 - phase * 2)
        thickness = 0.024 + 0.043 * (0.5 + 0.5 * np.sin(theta * 2 - phase + layer))
        surface = np.exp(-((radius - centre) / thickness) ** 2)
        halo = np.exp(-((radius - centre) / (thickness * 3.7)) ** 2)
        filaments = 0.32 + 0.68 * (0.5 + 0.5 * np.sin(theta * 92 + np.sin(theta * 13 + phase) * 2.1)) ** 7
        silk = 0.55 + 0.45 * np.sin((radius - centre) * 255 + theta * 6 - phase * 2) ** 2
        front = 0.2 + 0.8 * smoothstep(-0.8, 0.85, np.sin(theta + layer * 0.4))
        cyan = np.array((0.045, 0.62, 0.43), np.float32)
        violet = np.array((0.43, 0.08, 0.65), np.float32)
        blend = (0.5 + 0.5 * np.sin(theta * 1.0 + phase + layer * 1.3))[..., None]
        tint = cyan * (1 - blend) + violet * blend
        intensity = surface * silk * (0.4 + filaments * 0.8) * front
        color += tint * intensity[..., None] * (1.3 - layer * 0.15)
        color += tint * halo[..., None] * 0.12
        rim = np.exp(-((radius - centre - thickness * 0.3) / 0.010) ** 2)
        color += np.array((0.38, 0.75, 0.65), np.float32) * (rim * filaments * front * 0.4)[..., None]

    # A sparse, stationary field of very fine particles gives quiet depth; this
    # is deterministic and avoids high bitrate random video noise.
    stars = np.sin(X * 287.31 + Y * 431.72) * np.sin(X * 631.23 - Y * 197.43)
    stars = np.maximum(0, (stars - 0.995) * 140) * smoothstep(0.65, 1.3, R)
    color += stars[..., None] * np.array((0.055, 0.11, 0.14), np.float32)
    color *= (0.58 + 0.42 * np.exp(-R * R * 0.42))[..., None]
    return grade(color, 0.50)


FILMS = {"chrome-current": chrome_current, "aurora-bloom": aurora_bloom}


def verify_media(path):
    reader = imageio_ffmpeg.read_frames(str(path), pix_fmt="rgb24")
    metadata = next(reader)
    frames = sum(1 for _ in reader)
    data = path.read_bytes()
    offset, atoms = 0, []
    while offset + 8 <= len(data):
        size, kind = struct.unpack(">I4s", data[offset:offset + 8])
        if size < 8:
            raise RuntimeError(f"Unexpected MP4 atom size: {path}")
        atoms.append(kind.decode("ascii"))
        offset += size
    inspection = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-i", str(path)],
        capture_output=True, text=True, check=False,
    ).stderr
    valid = (
        frames == FPS * SECONDS and metadata["codec"] == "h264"
        and metadata["size"] == (WIDTH, HEIGHT) and metadata["fps"] == FPS
        and abs(metadata["duration"] - SECONDS) < .01
        and "yuv420p" in metadata["pix_fmt"] and "Audio:" not in inspection
        and "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat")
        and len(data) <= 2_500_000
    )
    if not valid:
        raise RuntimeError(f"Media contract verification failed: {path}: {metadata}")
    return {
        "file": path.name, "bytes": len(data), "codec": "H.264", "pixel_format": "yuv420p",
        "width": WIDTH, "height": HEIGHT, "fps": FPS, "seconds": SECONDS,
        "frames": frames, "audio": False, "faststart": True,
        "sha256": hashlib.sha256(data).hexdigest(), "full_decode_verified": True,
    }


def encode(name, render):
    destination = OUTPUT / f"{name}.mp4"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
        "-vcodec", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow",
        "-crf", "21", "-maxrate", "1600k", "-bufsize", "3200k", "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-level", "3.1", "-g", str(FPS * 2), "-keyint_min", str(FPS * 2),
        "-movflags", "+faststart", "-map_metadata", "-1", str(destination),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for frame in range(FPS * SECONDS):
            process.stdin.write(render(TAU * frame / (FPS * SECONDS)).tobytes())
            if frame % FPS == 0:
                print(f"{name}: {frame // FPS}/{SECONDS}s", flush=True)
    except BaseException:
        process.kill()
        process.wait()
        raise
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError(f"ffmpeg failed: {name}")
    return verify_media(destination)


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--posters-only", action="store_true")
    mode.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    metadata = []
    for name, render in FILMS.items():
        if args.verify_only:
            metadata.append(verify_media(OUTPUT / f"{name}.mp4"))
            print(f"{name}: media contract verified", flush=True)
            continue
        poster = render(TAU * 0.18)
        Image.fromarray(poster).save(OUTPUT / f"{name}.jpg", quality=93, subsampling=0)
        # Compare the mathematical end to the start, not the penultimate frame.
        seam = np.abs(render(0).astype(np.int16) - render(TAU).astype(np.int16))
        print(f"{name}: loop endpoint max RGB difference={int(seam.max())}", flush=True)
        if int(seam.max()) > 1:
            raise RuntimeError(f"Non-periodic film: {name}")
        if not args.posters_only:
            metadata.append(encode(name, render))
    if metadata:
        (OUTPUT / "media-manifest.json").write_bytes((json.dumps(metadata, indent=2) + "\n").encode("utf-8"))
        print(f"Total MP4 bytes: {sum(item['bytes'] for item in metadata):,}", flush=True)


if __name__ == "__main__":
    main()
