"""Generate Aether's original dark satin lighting loop without source footage.

Run: python scripts/generate-light-video.py [--qa-dir PATH]
Requires the existing numpy and ffmpeg/imageio-ffmpeg installation.
Only the lighting film and its manifest are published; monitor files are protected.
"""

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public/media"
WIDTH, HEIGHT, FPS, SECONDS = 256, 160, 12, 14
FRAMES, MAX_BYTES = FPS * SECONDS, 400_000
FILM_NAME, MANIFEST_NAME = "light-projection.mp4", "light-projection-manifest.json"
X, Y = np.meshgrid(np.linspace(-1.6, 1.6, WIDTH), np.linspace(-1., 1., HEIGHT))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frame_at(second):
    """Periodic low-frequency folds, authored in display RGB for the sRGB decoder.

    All motion uses integer multiples of one 14-second phase. There is no input
    footage, random per-frame noise, radial center, grid or white contour.
    """
    phase = 2 * np.pi * (second % SECONDS) / SECONDS
    warp = (.13 * np.sin(X * 1.8 + Y * 1.2 + phase)
            + .08 * np.sin(X * .8 - Y * 2.3 - 2 * phase))
    haze = .5 + .5 * np.sin(X * .9 + Y * 1.3 + phase)
    rgb = np.empty((HEIGHT, WIDTH, 3), dtype=np.float64)
    rgb[:] = [3., 6., 9.]
    rgb += haze[..., None] * np.array([2., 3., 4.])
    # Independently moving, unequal surfaces: teal, ink violet and graphite.
    folds = [(-.48, -.08, -.34, .25, 1.25, [27., 89., 87.], .25),
             (.64, .26, .53, .32, .94, [59., 31., 89.], 2.6),
             (-.18, .74, -.82, .18, 1.12, [50., 63., 67.], 4.5)]
    for cx, cy, angle, width, length, color, offset in folds:
        a = angle + .18 * np.sin(phase + offset)
        px = X - cx - .31 * np.cos(phase + offset)
        py = Y - cy - .26 * np.sin(phase + offset)
        along = np.cos(a) * px + np.sin(a) * py
        across = -np.sin(a) * px + np.cos(a) * py
        fold = (across + warp + .2 * np.sin(along * 1.45 + phase + offset)
                + .10 * np.sin(along * .65 - 2 * phase + offset))
        envelope = np.exp(-np.power(along / length, 4) * .8)
        shoulder = np.exp(-np.square((fold + .18) / (width * 1.5)))
        crest = np.exp(-np.square(fold / width))
        illumination = .46 + .54 * (.5 + .5 * np.cos(phase + offset))
        surface = (crest * .77 + shoulder * .23) * envelope * illumination
        rgb += surface[..., None] * np.array(color)
        reflection = (np.exp(-np.square((fold - .025) / (width * .64)))
                      * envelope * (.5 + .5 * np.sin(along * 1.7 + phase + offset)) ** 3)
        rgb += reflection[..., None] * np.array([22., 24., 24.]) * illumination
    shadow = .52 + .48 * (1 - np.exp(-np.square((X + .48 * Y - .6 * np.sin(phase)) / .6)))
    return np.clip(np.rint(rgb * shadow[..., None]), 0, 180).astype(np.uint8)


def inspect_contract(ffmpeg, output, frame_provider=frame_at, column=False):
    inspection = subprocess.run([ffmpeg, "-hide_banner", "-nostdin", "-i", str(output)],
                                capture_output=True, text=True, check=False).stderr
    data = output.read_bytes()
    offset, atoms = 0, []
    while offset + 8 <= len(data):
        size, kind = struct.unpack(">I4s", data[offset:offset + 8])
        if size < 8 or offset + size > len(data):
            raise RuntimeError("Unexpected MP4 atom size")
        atoms.append(kind.decode("ascii"))
        offset += size
    if not ("Video: h264" in inspection and "yuv420p" in inspection
            and f"{WIDTH}x{HEIGHT}" in inspection and f"{FPS} fps" in inspection
            and f"Duration: 00:00:{SECONDS:02}.00" in inspection and "Audio:" not in inspection
            and "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat")
            and offset == len(data) and 0 < len(data) <= MAX_BYTES):
        raise RuntimeError(f"Lighting media contract failed: {inspection}")
    decoded = subprocess.run([
        ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-xerror", "-threads", "1",
        "-i", str(output), "-an", "-pix_fmt", "rgb24", "-threads", "1", "-f", "rawvideo", "-",
    ], capture_output=True, check=True).stdout
    if len(decoded) != FRAMES * WIDTH * HEIGHT * 3:
        raise RuntimeError(f"Expected {FRAMES} complete RGB frames, got {len(decoded)} bytes")
    frames = np.frombuffer(decoded, dtype=np.uint8).reshape(FRAMES, HEIGHT, WIDTH, 3)
    rgb = frames.astype(np.float32)
    luma = rgb @ np.array([.2126, .7152, .0722], dtype=np.float32)
    adjacent = np.abs(rgb[1:] - rgb[:-1]).mean(axis=(1, 2, 3))
    seam = float(np.abs(rgb[-1] - rgb[0]).mean())
    ordinary_p95 = float(np.percentile(adjacent, 95))
    seam_limit = max(1., ordinary_p95 * 1.65)
    dark_fraction = float((luma < 24).mean())
    upper_luma = float(luma.max())
    maximum = 255 if column else 160
    if seam > seam_limit or upper_luma > maximum or not (.25 if column else .4) <= dark_fraction <= .98:
        raise RuntimeError(f"Lighting palette/loop failed: seam={seam}, max luma={upper_luma}, dark={dark_fraction}")
    stats = {
        "method": "Rec.709 weighted display RGB over all decoded pixels, range 0-255; not linear scene radiance",
        "mean": round(float(luma.mean()), 5), "p95": round(float(np.percentile(luma, 95)), 5),
        "p99": round(float(np.percentile(luma, 99)), 5), "maximum": round(upper_luma, 5),
        "maximum_allowed": maximum, "fraction_below_24": round(dark_fraction, 6),
        "fraction_above_150": round(float((luma > 150).mean()), 6),
        "frame_mean_min": round(float(luma.mean(axis=(1, 2)).min()), 5),
        "frame_mean_max": round(float(luma.mean(axis=(1, 2)).max()), 5),
    }
    loop = {"verified": True, "method": "all decoded adjacent-frame RGB differences and last-to-first seam",
            "mean_abs_rgb": round(seam, 5), "adjacent_p95_mean_abs_rgb": round(ordinary_p95, 5),
            "maximum_allowed_mean_abs_rgb": round(seam_limit, 5),
            "procedural_first_and_period_endpoint_identical": bool(np.array_equal(frame_provider(0), frame_provider(SECONDS)))}
    if column:
        endpoint = np.abs(frame_provider(0).astype(float) - frame_provider(SECONDS).astype(float))
        loop["render_endpoint_mean_abs_rgb"] = float(endpoint.mean())
        loop["render_endpoint_tolerance"] = .01
        if endpoint.mean() > .01:
            raise RuntimeError("Rendered loop endpoint differs beyond GPU roundoff")
    if not column and not loop["procedural_first_and_period_endpoint_identical"]:
        raise RuntimeError("Procedural loop endpoint mismatch")
    return data, frames, stats, loop


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg")
    parser.add_argument("--frames-dir", type=Path, help="Frames from node scripts/render-light-column.mjs; optional original satin fallback")
    parser.add_argument("--qa-dir", type=Path, help="Optional directory for three decoded stills")
    parser.add_argument("--output-dir", type=Path, default=MEDIA, help="Defaults to public/media; may stage a review candidate")
    args = parser.parse_args()
    source = None
    frame_provider = frame_at
    if args.frames_dir:
        from PIL import Image
        source = json.loads((args.frames_dir / "source.json").read_text(encoding="utf-8"))
        for name, digest in source["sources"].items():
            if sha256(ROOT / name) != digest:
                raise RuntimeError(f"Column source changed: {name}")
        column_frames = [np.array(Image.open(args.frames_dir / f"{i:03}.png").convert("RGB")) for i in range(FRAMES + 1)]
        if any(frame.shape != (HEIGHT, WIDTH, 3) for frame in column_frames):
            raise RuntimeError("Column frame dimensions mismatch")
        frame_provider = lambda second: column_frames[round(second * FPS)]
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    protected_names = ["chrome-current.mp4", "aurora-bloom.mp4", "chrome-current.webm",
                       "aurora-bloom.webm", "media-manifest.json", "monitor-webm-manifest.json"]
    before = {name: sha256(MEDIA / name) for name in protected_names}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".light-film-", dir=args.output_dir) as temporary:
        output = Path(temporary) / FILM_NAME
        arguments = [
            "-y", "-hide_banner", "-nostdin", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "pipe:0", "-an", "-c:v", "libx264",
            "-preset", "slow", "-crf", "22", "-maxrate", "160k", "-bufsize", "320k", "-pix_fmt", "yuv420p",
            "-profile:v", "main", "-level", "3.0", "-g", str(FPS * 2), "-keyint_min", str(FPS * 2),
            "-sc_threshold", "0", "-movflags", "+faststart", "-map_metadata", "-1", "-threads", "1", str(output),
        ]
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen([ffmpeg, *arguments], stdin=subprocess.PIPE, stderr=errors)
            try:
                for index in range(FRAMES):
                    process.stdin.write(frame_provider(index / FPS).tobytes())
                process.stdin.close()
                if process.wait() != 0:
                    errors.seek(0)
                    raise RuntimeError(errors.read().decode("utf-8", errors="replace"))
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
        data, frames, stats, loop = inspect_contract(ffmpeg, output, frame_provider, bool(source))
        after = {name: sha256(MEDIA / name) for name in protected_names}
        if before != after:
            raise RuntimeError("A protected monitor asset changed during generation")
        manifest = {
            "file": FILM_NAME, "bytes": len(data), "codec": "H.264 Main", "pixel_format": "yuv420p",
            "width": WIDTH, "height": HEIGHT, "fps": FPS, "seconds": SECONDS, "frames": FRAMES,
            "audio": False, "faststart": True, "full_decode_verified": True,
            "sha256": hashlib.sha256(data).hexdigest(), "sources": [],
            "authorship": source["authorship"] if source else "Original periodic mathematical satin and low-frequency haze; no external footage or monitor-film sampling",
            "rendered_source": source,
            "palette": ["graphite", "deep teal", "ink violet", "restrained silver"],
            "sequence": "Rotating Aether column, slow white/violet highlights and dark intervals; seamless 14-second loop" if source else "Continuous asymmetric folds and soft reflected light; one periodic 14-second phase; broad unlit space",
            "protected_monitor_hashes_before": before, "protected_monitor_hashes_after": after,
            "source_hashes_verified_before_and_after": True, "luma": stats, "loop_join": loop,
            "generator": "scripts/generate-light-video.py", "crf": 22, "maxrate": "160k", "gop": 24,
            "ffmpeg_version": subprocess.check_output([ffmpeg, "-version"], text=True).splitlines()[0],
        }
        staged_manifest = Path(temporary) / MANIFEST_NAME
        staged_manifest.write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
        if args.qa_dir:
            from PIL import Image
            args.qa_dir.mkdir(parents=True, exist_ok=True)
            samples = []
            for timestamp, label in [(1, "teal-satin"), (5.5, "ink-haze"), (10, "graphite-silver")]:
                image = frames[round(timestamp * FPS)]
                still = args.qa_dir / f"light-{timestamp:04.1f}-{label}.png"
                Image.fromarray(image).save(still)
                samples.append({"file": still.name, "second": timestamp,
                                "mean_rgb": np.round(image.mean(axis=(0, 1)), 3).tolist()})
            (args.qa_dir / "analysis.json").write_bytes((json.dumps({"samples": samples, "luma": stats, "loop_join": loop}, indent=2) + "\n").encode("utf-8"))
        # All validation precedes per-file atomic publication, with manifest last.
        os.replace(output, args.output_dir / FILM_NAME)
        os.replace(staged_manifest, args.output_dir / MANIFEST_NAME)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
