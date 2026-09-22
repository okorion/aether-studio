"""Re-encode Aether's authored chrome film into one small lighting projection.

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
SOURCE = ROOT / "public/media/chrome-current.mp4"
OUTPUT = ROOT / "public/media/light-projection.mp4"
MANIFEST = ROOT / "public/media/light-projection-manifest.json"
WIDTH, HEIGHT, FPS, SECONDS = 256, 160, 12, 10


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg")
    args = parser.parse_args()
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    sources = json.loads((ROOT / "public/media/media-manifest.json").read_text())
    expected = next(item for item in sources if item["file"] == SOURCE.name)["sha256"]
    if source_hash != expected:
        raise RuntimeError("Source does not match the authored monitor-film manifest")
    arguments = [
        "-y", "-hide_banner", "-loglevel", "error", "-i", str(SOURCE),
        "-vf", f"fps={FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos,setsar=1", "-t", str(SECONDS),
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
    frames = len(decoded) // (WIDTH * HEIGHT * 3)
    if not (len(decoded) == WIDTH * HEIGHT * 3 * FPS * SECONDS
            and "Video: h264" in inspection and "yuv420p" in inspection
            and f"{WIDTH}x{HEIGHT}" in inspection and f"{FPS} fps" in inspection
            and "Duration: 00:00:10.00" in inspection and "Audio:" not in inspection
            and atoms.index("moov") < atoms.index("mdat") and len(data) < 250_000):
        raise RuntimeError(f"Lighting media contract failed: {inspection}")
    manifest = {
        "file": OUTPUT.name, "bytes": len(data), "codec": "H.264 Main", "pixel_format": "yuv420p",
        "width": WIDTH, "height": HEIGHT, "fps": FPS, "seconds": SECONDS, "frames": frames,
        "audio": False, "faststart": True, "full_decode_verified": True,
        "sha256": hashlib.sha256(data).hexdigest(),
        "source": "chrome-current.mp4", "source_sha256": source_hash,
        "authorship": "Derived only from Aether's mathematical chrome-current film; no external footage",
        "generator": "scripts/generate-light-video.py", "crf": 28, "maxrate": "160k", "gop": 24,
        "ffmpeg_version": subprocess.check_output([ffmpeg, "-version"], text=True).splitlines()[0],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
