"""Encode the two authored monitor MP4s as validated VP8 WebM alternatives.

Run: python scripts/generate-monitor-webm.py [--ffmpeg PATH]
Requires ffmpeg on PATH or the existing imageio-ffmpeg installation.
Sources and the shared light-projection film are never rewritten. All encoding,
full-frame validation and SSIM checks finish in staging before publication.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public" / "media"
WIDTH, HEIGHT, FPS, SECONDS = 640, 400, 24, 10
FRAMES = FPS * SECONDS
SSIM_FILTER = ("[0:v]settb=AVTB,setpts=N/24/TB[a];"
               "[1:v]settb=AVTB,setpts=N/24/TB[b];"
               "[a][b]ssim=shortest=1:repeatlast=0")
PROFILES = [
    ("chrome-current", "1200k", .97, 2_000_000),
    ("aurora-bloom", "500k", .98, 900_000),
]
ENCODING = {"encoder": "libvpx", "crf": 10, "deadline": "good", "cpu_used": 4,
            "threads": 2, "gop": 48, "audio": False}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_media(ffmpeg, path, codec):
    # Inspection intentionally has no output target. Its nonzero exit status is
    # expected; the subsequent -xerror decode validates the actual file contents.
    inspection = subprocess.run([ffmpeg, "-hide_banner", "-nostdin", "-i", str(path)],
                                capture_output=True, text=True, check=False).stderr
    videos = re.findall(r"Stream #.*Video:.*", inspection)
    duration = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", inspection)
    seconds = (int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])) if duration else -1
    if not (len(videos) == 1 and f"Video: {codec}" in videos[0]
            and "yuv420p" in videos[0] and f"{WIDTH}x{HEIGHT}" in videos[0]
            and re.search(rf"\b{FPS}(?:\.0+)? fps\b", videos[0])
            and abs(seconds - SECONDS) < .02 and "Audio:" not in inspection):
        raise RuntimeError(f"Unexpected monitor format for {path.name}:\n{inspection}")


def decode_frames(ffmpeg, path):
    # Count every decoded RGB byte without retaining a 184 MB film in memory.
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen([
            ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-xerror",
            "-threads", "2", "-i", str(path), "-map", "0:v:0", "-an",
            "-pix_fmt", "rgb24", "-threads", "2", "-fps_mode", "passthrough", "-f", "rawvideo", "-",
        ], stdout=subprocess.PIPE, stderr=errors)
        count = 0
        try:
            for chunk in iter(lambda: process.stdout.read(1024 * 1024), b""):
                count += len(chunk)
            code = process.wait()
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
                process.wait()
        errors.seek(0)
        failure = errors.read().decode("utf-8", errors="replace")
    if code or count != WIDTH * HEIGHT * 3 * FRAMES:
        raise RuntimeError(f"Full decode failed for {path.name}: {count} RGB bytes, exit {code}: {failure}")
    return FRAMES


def compare_ssim(ffmpeg, source, output):
    result = subprocess.run([
        ffmpeg, "-hide_banner", "-nostdin", "-xerror", "-threads", "2", "-i", str(source),
        "-threads", "2", "-i", str(output), "-filter_complex_threads", "1",
        "-lavfi", SSIM_FILTER, "-an", "-f", "null", "-",
    ], capture_output=True, text=True, check=True)
    values = re.findall(r"\bAll:([0-9.]+)", result.stderr)
    if not values:
        raise RuntimeError(f"SSIM result missing for {output.name}")
    return float(values[-1])


def write_json(path, value):
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(value, indent=2) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", help="Existing ffmpeg binary; no download is performed")
    args = parser.parse_args()
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    manifest_path = MEDIA / "monitor-webm-manifest.json"
    source_manifest = json.loads((MEDIA / "media-manifest.json").read_text(encoding="utf-8"))
    expected = {item["file"]: item for item in source_manifest}
    protected = [MEDIA / f"{name}.mp4" for name, *_ in PROFILES]
    protected.extend([MEDIA / "media-manifest.json", MEDIA / "light-projection.mp4",
                      MEDIA / "light-projection-manifest.json"])
    before = {path.name: sha256(path) for path in protected}
    for name, *_ in PROFILES:
        source = MEDIA / f"{name}.mp4"
        if before[source.name] != expected[source.name]["sha256"]:
            raise RuntimeError(f"Source differs from the authored manifest: {source.name}")
        inspect_media(ffmpeg, source, "h264")

    lock = MEDIA / ".monitor-webm.lock"
    # Exclusive creation prevents two regeneration jobs from mixing outputs.
    with lock.open("x", encoding="ascii") as stream:
        stream.write(str(os.getpid()))
    try:
        with tempfile.TemporaryDirectory(prefix=".monitor-webm-", dir=MEDIA) as temporary:
            staging = Path(temporary)
            files = []
            for name, bitrate, minimum_ssim, maximum_bytes in PROFILES:
                source = MEDIA / f"{name}.mp4"
                output = staging / f"{name}.webm"
                options = ["-c:v", "libvpx", "-crf", "10", "-b:v", bitrate,
                           "-deadline", "good", "-cpu-used", "4", "-threads", "2", "-g", "48", "-an"]
                subprocess.run([ffmpeg, "-y", "-hide_banner", "-nostdin", "-loglevel", "error",
                                "-i", str(source), *options, str(output)], check=True)
                inspect_media(ffmpeg, output, "vp8")
                frames = decode_frames(ffmpeg, output)
                ssim = compare_ssim(ffmpeg, source, output)
                size = output.stat().st_size
                if size > maximum_bytes or size <= 0 or ssim < minimum_ssim:
                    raise RuntimeError(f"WebM quality/size contract failed: {output.name}, {size} bytes, SSIM {ssim}")
                files.append({"file": output.name, "bytes": size, "sha256": sha256(output),
                              "source": source.name, "source_sha256": before[source.name],
                              "bitrate": bitrate, "encode_options": options, "frames": frames,
                              "ssim_all": ssim, "minimum_ssim": minimum_ssim})
            after = {path.name: sha256(path) for path in protected}
            if after != before:
                raise RuntimeError("An authored source or lighting asset changed during regeneration")
            manifest = {
                "generator": "scripts/generate-monitor-webm.py", "codec": "VP8", "container": "WebM",
                "pixel_format": "yuv420p", "width": WIDTH, "height": HEIGHT, "fps": FPS,
                "seconds": SECONDS, "frames": FRAMES, "audio": False, "encoding": ENCODING,
                "validation": {"mode": "regenerated_and_fully_decoded", "full_decode_verified": True,
                               "ssim_filter": SSIM_FILTER,
                               "source_hashes_before": before, "source_hashes_after": after,
                               "protected_sources_unchanged": True},
                "publication": "validated staging; atomic replacement per file; manifest published last",
                "byte_reproducibility": "Hashes can vary with ffmpeg/libvpx version and WebM muxer metadata",
                "ffmpeg_version": subprocess.check_output([ffmpeg, "-version"], text=True).splitlines()[0],
                "files": files,
            }
            staged_manifest = staging / manifest_path.name
            write_json(staged_manifest, manifest)
            # These paths name only generated alternatives. Original MP4s and
            # the lighting projection are never publication destinations.
            for item in files:
                os.replace(staging / item["file"], MEDIA / item["file"])
            os.replace(staged_manifest, manifest_path)
        print(json.dumps(manifest, indent=2))
    finally:
        lock.unlink()


if __name__ == "__main__":
    main()
