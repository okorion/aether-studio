"""Crossfade Aether's two authored films into one small lighting projection.

Run: python scripts/generate-light-video.py
Requires ffmpeg on PATH or imageio-ffmpeg; --ffmpeg can name an existing binary.
This never fetches external media and does not modify the two monitor films.
"""

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [ROOT / "public/media/chrome-current.mp4", ROOT / "public/media/aurora-bloom.mp4"]
OUTPUT = ROOT / "public/media/light-projection.mp4"
MANIFEST = ROOT / "public/media/light-projection-manifest.json"
WIDTH, HEIGHT, FPS, SECONDS = 256, 160, 12, 14
MAX_BYTES = 400_000


def rgb_difference(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg")
    parser.add_argument("--qa-dir", type=Path, help="Optional directory for three decoded color stills")
    args = parser.parse_args()
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    authored = json.loads((ROOT / "public/media/media-manifest.json").read_text())
    sources = []
    for source in SOURCES:
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        expected = next(item for item in authored if item["file"] == source.name)
        if source_hash != expected["sha256"] or expected["seconds"] != 10:
            raise RuntimeError(f"Source does not match the authored monitor-film manifest: {source.name}")
        sources.append({"file": source.name, "sha256": source_hash, "seconds": 10})
    # Both original 10-second periods stretch to the same 14-second loop.
    # Cosine crossfades have zero slope at each end: chrome -> aurora -> chrome.
    # The seam returns to chrome at its original phase instead of cutting to
    # an unrelated last frame or fading through black.
    aurora = "if(lt(T,2),0,if(lt(T,5),(1-cos(PI*(T-2)/3))/2,if(lt(T,9),1,if(lt(T,12),(1+cos(PI*(T-9)/3))/2,0))))"
    prepare = f"setpts=PTS*{SECONDS / 10},fps={FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos,setsar=1,format=gbrp"
    filters = (f"[0:v]{prepare}[chrome];[1:v]{prepare}[aurora];"
               f"[chrome][aurora]blend=all_expr='A*(1-({aurora}))+B*({aurora})',format=yuv420p[film]")
    arguments = [
        "-y", "-hide_banner", "-loglevel", "error",
        "-threads", "1", "-stream_loop", "-1", "-i", str(SOURCES[0]),
        "-threads", "1", "-stream_loop", "-1", "-i", str(SOURCES[1]),
        "-filter_complex_threads", "1", "-filter_complex", filters,
        "-map", "[film]", "-t", str(SECONDS),
        "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-maxrate", "160k",
        "-bufsize", "320k", "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "3.0",
        "-g", str(FPS * 2), "-keyint_min", str(FPS * 2), "-sc_threshold", "0",
        "-movflags", "+faststart", "-map_metadata", "-1", "-threads", "1", str(OUTPUT),
    ]
    subprocess.run([ffmpeg, *arguments], check=True)
    inspection = subprocess.run([ffmpeg, "-hide_banner", "-i", str(OUTPUT)],
                                capture_output=True, text=True, check=False).stderr
    decoded = subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(OUTPUT),
                              "-an", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
                             capture_output=True, check=True).stdout
    data = OUTPUT.read_bytes()
    offset, atoms = 0, []
    while offset + 8 <= len(data):
        size, kind = struct.unpack(">I4s", data[offset:offset + 8])
        if size < 8:
            raise RuntimeError("Unexpected MP4 atom size")
        atoms.append(kind.decode("ascii"))
        offset += size
    frame_size = WIDTH * HEIGHT * 3
    frames = len(decoded) // frame_size
    if not (len(decoded) == frame_size * FPS * SECONDS
            and "Video: h264" in inspection and "yuv420p" in inspection
            and f"{WIDTH}x{HEIGHT}" in inspection and f"{FPS} fps" in inspection
            and f"Duration: 00:00:{SECONDS:02}.00" in inspection and "Audio:" not in inspection
            and atoms.index("moov") < atoms.index("mdat") and len(data) < MAX_BYTES):
        raise RuntimeError(f"Lighting media contract failed: {inspection}")
    frame = lambda index: memoryview(decoded)[index * frame_size:(index + 1) * frame_size]
    adjacent = [rgb_difference(frame(i), frame(i + 1)) for i in range(0, frames - 1, max(1, frames // 24))]
    adjacent.sort()
    typical_peak = adjacent[int((len(adjacent) - 1) * .95)]
    loop_difference = rgb_difference(frame(frames - 1), frame(0))
    loop_limit = max(3., typical_peak * 1.65)
    if loop_difference > loop_limit:
        raise RuntimeError(f"Loop join is larger than ordinary frame changes: {loop_difference:.4f} > {loop_limit:.4f}")
    for source, checked in zip(SOURCES, sources):
        if hashlib.sha256(source.read_bytes()).hexdigest() != checked["sha256"]:
            raise RuntimeError(f"Source changed during generation: {source.name}")
    manifest = {
        "file": OUTPUT.name, "bytes": len(data), "codec": "H.264 Main", "pixel_format": "yuv420p",
        "width": WIDTH, "height": HEIGHT, "fps": FPS, "seconds": SECONDS, "frames": frames,
        "audio": False, "faststart": True, "full_decode_verified": True,
        "sha256": hashlib.sha256(data).hexdigest(),
        "sources": sources, "source_hashes_verified_before_and_after": True,
        "authorship": "Derived only from Aether's mathematical chrome-current and aurora-bloom films; no external footage",
        "sequence": "chrome 0-2s; cosine crossfade 2-5s; aurora 5-9s; cosine crossfade 9-12s; chrome 12-14s",
        "source_period_seconds": 10, "source_time_scale": SECONDS / 10,
        "loop_join": {"verified": True, "method": "decoded last-to-first mean absolute RGB difference versus sampled adjacent frames",
                      "mean_abs_rgb": round(loop_difference, 5), "adjacent_p95_mean_abs_rgb": round(typical_peak, 5),
                      "maximum_allowed_mean_abs_rgb": round(loop_limit, 5)},
        "generator": "scripts/generate-light-video.py", "crf": 28, "maxrate": "160k", "gop": 24,
        "ffmpeg_version": subprocess.check_output([ffmpeg, "-version"], text=True).splitlines()[0],
    }
    MANIFEST.write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    if args.qa_dir:
        args.qa_dir.mkdir(parents=True, exist_ok=True)
        samples = []
        for timestamp, label in [(1, "chrome"), (7, "aurora"), (3.5, "crossfade")]:
            still = args.qa_dir / f"light-{timestamp:02}-{label}.png"
            subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(timestamp),
                            "-i", str(OUTPUT), "-frames:v", "1", "-threads", "1", "-update", "1", str(still)], check=True)
            rgb = frame(round(timestamp * FPS))
            means = [sum(rgb[channel::3]) / (WIDTH * HEIGHT) for channel in range(3)]
            samples.append({"file": still.name, "second": timestamp,
                            "mean_rgb": [round(value, 3) for value in means],
                            "mean_luma": round(sum(value * weight for value, weight in zip(means, [.2126, .7152, .0722])), 3)})
        (args.qa_dir / "analysis.json").write_bytes((json.dumps({"samples": samples, "loop_join": manifest["loop_join"]}, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
