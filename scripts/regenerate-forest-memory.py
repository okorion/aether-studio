# -*- coding: utf-8 -*-
"""저장소 밖의 원본으로 포레스트용 24초 순환 영상을 만든다. 네트워크는 사용하지 않는다.

python scripts/regenerate-forest-memory.py --input-directory SOURCE_DIR --output-directory OUTPUT_DIR
원본 파일명과 SHA-256은 SOURCES에 고정되어 있다. --qa-directory로 외부 검수 이미지 폴더를 지정할 수 있다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess


SOURCES = [
    {
        "id": "flight-over-clouds",
        "file": "flight-over-clouds.original.webm",
        "sha256": "b9fb9f05b919a6f45248fdfd463bde2421fbd1c33d31560a8c3d124d232298f2",
        "creator": "L. Shyamal",
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "source": "https://commons.wikimedia.org/wiki/File:Flight_over_clouds.webm",
        "download": "https://upload.wikimedia.org/wikipedia/commons/2/2d/Flight_over_clouds.webm",
    },
    {
        "id": "street-in-mumbai",
        "file": "street-in-mumbai.original.webm",
        "sha256": "3913782ffdfa9ce1f340b334db4ae0c6291d2a393f878898d1fd5ba8c30865c8",
        "creator": "Nicolas Vigier",
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "source": "https://commons.wikimedia.org/wiki/File:Street_in_Mumbai_(video)_02.webm",
        "download": "https://upload.wikimedia.org/wikipedia/commons/6/66/Street_in_Mumbai_%28video%29_02.webm",
        "provenance": "Vimeo 원출처의 CC0를 Wikimedia가 2020-05-19 확인했다.",
    },
    {
        "id": "misty-river",
        "file": "misty-river.original.webm",
        "sha256": "17dfe6e9154647ab7bb1942227d1a38cdcde2f3afc00bc75684b62c9abc24e39",
        "creator": "Digitura",
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "source": "https://commons.wikimedia.org/wiki/File:Misty_river.webm",
        "download": "https://upload.wikimedia.org/wikipedia/commons/3/3d/Misty_river.webm",
    },
    {
        "id": "aurora-bloom",
        "file": "aurora-bloom.original.mp4",
        "sha256": "8e1f7e6839d5a91932e7a287865171d769c0f59015bc6dda2ed9b237e308f903",
        "creator": "Aether Studio 프로젝트",
        "license": "프로젝트 자체 제작 에셋",
        "source": "https://github.com/okorion/aether-studio/blob/17f3abb1f61bf8ce468cd08bef76d68b1ecbeb19/public/media/aurora-bloom.mp4",
    },
    {
        "id": "chrome-current",
        "file": "chrome-current.original.mp4",
        "sha256": "546f31b436c2c094a119ecd7b76be7f93661b4c2b9cf62f56decc61e211ed123",
        "creator": "Aether Studio 프로젝트",
        "license": "프로젝트 자체 제작 에셋",
        "source": "https://github.com/okorion/aether-studio/blob/17f3abb1f61bf8ce468cd08bef76d68b1ecbeb19/public/media/chrome-current.mp4",
    },
]

# 모든 구간은 원본 시간 기준 4.5초다. 0.5초씩 겹쳐 순환 길이는 24초다.
CLIPS = [
    {"source": "flight-over-clouds", "in": 0.75, "look": "노을·구름 / amber / 중간 밝기",
     "filter": "crop=960:540:0:650,scale=512:288,eq=contrast=1.1:brightness=0.02:saturation=1.25,colorbalance=rs=0.035:bs=-0.025"},
    {"source": "aurora-bloom", "in": 0.5, "look": "광환 / cyan·violet / 어두움",
     "filter": "crop=640:360:0:20,scale=512:288,eq=contrast=1.14:saturation=1.2"},
    {"source": "street-in-mumbai", "in": 16.0, "look": "거리 / amber / 중간 밝기",
     "filter": "crop=720:404:120:70,scale=512:288,eq=contrast=1.08:brightness=0.015:saturation=1.18,colorbalance=rs=0.025:bs=-0.02"},
    {"source": "chrome-current", "in": 1.75, "look": "유체 / cyan·white / 밝음",
     "filter": "crop=640:360:0:20,scale=512:288,eq=contrast=1.05:brightness=0.015:saturation=1.2"},
    {"source": "misty-river", "in": 22.0, "look": "안개·강 / blue·cyan / 어두움",
     "filter": "scale=512:288,eq=contrast=1.28:brightness=-0.11:saturation=1.0,colorbalance=rs=-0.055:gs=0.005:bs=0.045"},
    {"source": "chrome-current", "in": 5.0, "look": "유체 / magenta·amber / 밝음",
     "filter": "crop=640:360:0:20,scale=512:288,colorchannelmixer=rr=0:rg=1:gr=1:gg=0,eq=contrast=1.08:brightness=-0.015:saturation=1.35"},
]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        hasher = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr or "명령 실행 실패")
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-directory", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--qa-directory", type=Path)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    ffmpeg = args.ffmpeg
    if not ffmpeg:
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError as error:
            raise SystemExit("설치된 ffmpeg 경로를 --ffmpeg로 지정하세요.") from error

    inputs = args.input_directory.resolve()
    output_dir = args.output_directory.resolve()
    repository = Path(__file__).resolve().parents[1]
    if inputs == repository or repository in inputs.parents:
        raise SystemExit("원본 영상은 저장소 밖의 --input-directory에서 읽어야 합니다.")
    source_map = {source["id"]: source for source in SOURCES}
    for source in SOURCES:
        path = inputs / source["file"]
        if digest(path) != source["sha256"]:
            raise SystemExit(f"원본 SHA-256 불일치: {path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "forest-memory.mp4"

    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error"]
    for clip in CLIPS:
        command += ["-ss", str(clip["in"]), "-t", "4.5", "-i", str(inputs / source_map[clip["source"]]["file"])]
    filters = []
    for index, clip in enumerate(CLIPS):
        # fps는 setpts 뒤에 둬서 xfade 입력의 고정 프레임률을 유지한다.
        filters.append(f"[{index}:v]{clip['filter']},setsar=1,setpts=PTS-STARTPTS,fps=24,format=yuv420p[c{index}]")
    filters.append("[c0]split=2[first][repeat]")
    left = "first"
    for index in range(1, 7):
        right = f"c{index}" if index < 6 else "repeat"
        result = f"mix{index}"
        filters.append(f"[{left}][{right}]xfade=transition=fade:duration=0.5:offset={index * 4},fps=24[{result}]")
        left = result
    # 처음 0.5초를 잘라낸 뒤 마지막에 같은 첫 구간의 0.5초로 이어서 순환한다.
    filters.append(f"[{left}]trim=start=0.5:end=24.5,setpts=PTS-STARTPTS,fps=24,format=yuv420p[video]")
    graph = ";".join(filters)
    command += ["-filter_complex", graph, "-map", "[video]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "25", "-maxrate", "550k", "-bufsize", "1100k", "-movflags", "+faststart", "-map_metadata", "-1", str(output)]
    run(command)
    # 실제 출력 스트림과 576프레임 전체를 확인한다. 복구 가능한 오류도 실패한다.
    decoded = subprocess.run(
        [ffmpeg, "-hide_banner", "-xerror", "-i", str(output), "-map", "0", "-f", "null", "-", "-progress", "pipe:1"],
        capture_output=True, text=True,
    )
    if decoded.returncode:
        raise RuntimeError(decoded.stderr)
    stream = re.search(r"Video: (\w+).*?, (\d+)x(\d+)[ ,].*? ([\d.]+) fps", decoded.stderr)
    frames = re.findall(r"^frame=(\d+)$", decoded.stdout, re.MULTILINE)
    if not stream or stream.groups() != ("h264", "512", "288", "24") or not frames or int(frames[-1]) != 576 or "Audio:" in decoded.stderr:
        raise SystemExit("출력 스트림 또는 프레임 수가 요청 규격과 다릅니다.")
    boxes = {}
    with output.open("rb") as file:
        while header := file.read(8):
            if len(header) != 8:
                raise SystemExit("MP4 box header가 잘렸습니다.")
            size = int.from_bytes(header[:4], "big")
            box_type = header[4:].decode("ascii")
            offset = file.tell() - 8
            if size == 1:
                size = int.from_bytes(file.read(8), "big")
            if size == 0:
                size = output.stat().st_size - offset
            boxes[box_type] = offset
            file.seek(offset + size)
    if not ("moov" in boxes and "mdat" in boxes and boxes["moov"] < boxes["mdat"]):
        raise SystemExit("faststart용 moov 위치를 확인할 수 없습니다.")
    if output.stat().st_size > 2_000_000:
        raise SystemExit("출력 영상이 2MB 목표를 초과했습니다.")
    for source in SOURCES:
        if digest(inputs / source["file"]) != source["sha256"]:
            raise SystemExit(f"작업 중 원본이 변경되었습니다: {source['file']}")

    if args.qa_directory:
        qa_directory = args.qa_directory.resolve()
        if qa_directory == repository or repository in qa_directory.parents:
            raise SystemExit("검수 이미지는 저장소 밖의 --qa-directory에 보관해야 합니다.")
        qa_directory.mkdir(parents=True, exist_ok=True)
        sheet = qa_directory / "forest-memory.contact-sheet.jpg"
        run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(output), "-vf", "select='not(mod(n,48))',scale=256:144,tile=4x3", "-frames:v", "1", "-q:v", "2", str(sheet)])
        for name, timestamp in [("start", 0), ("end", 575 / 24)]:
            image = qa_directory / f"forest-memory.loop-{name}.png"
            run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(timestamp), "-i", str(output), "-frames:v", "1", str(image)])

    manifest = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "상단·하단 포레스트 배경과 산란광에 사용하는 24초 순환 영상",
        "sources": [{**source, "size_bytes": (inputs / source["file"]).stat().st_size} for source in SOURCES],
        "clips": [{**clip, "out": clip["in"] + 4.5} for clip in CLIPS],
        "transform": {"filter_complex": graph, "audio": "removed", "source_metadata": "removed", "crossfade_seconds": 0.5, "cycle_trim_seconds": [0.5, 24.5]},
        "encoding": {"codec": "libx264", "preset": "medium", "crf": 25, "maxrate": "550k", "bufsize": "1100k", "movflags": "+faststart"},
        "output": {"file": output.name, "duration_seconds": 24, "width": 512, "height": 288, "fps": 24, "codec": "H.264 / yuv420p", "faststart": True, "size_bytes": output.stat().st_size, "sha256": digest(output)},
        "validation": {"source_sha256_before_after": "pass", "full_decode_with_xerror": "pass", "actual_frames": int(frames[-1]), "actual_video": {"codec": stream[1], "width": int(stream[2]), "height": int(stream[3]), "fps": float(stream[4])}, "audio_streams": 0, "moov_offset": boxes["moov"], "mdat_offset": boxes["mdat"], "under_2mb": True},
        "notes": [
            "원본 에셋은 변경하지 않았다.",
            "실사 색보정과 자체 영상의 채널 교환은 재현용 변환이며 원본 영상의 색과 다르다.",
            "CC0는 저작권상 출처 표시를 의무화하지 않지만 원본 추적을 위해 크레딧을 보존한다.",
            "CC0는 별도 초상권·상표권을 부여하지 않는다. 거리 구간은 클로즈업 없는 높은 시점의 전경이다.",
            "리액터 챔버용 light-projection.mp4는 입력으로 사용하지 않았다.",
        ],
        "regeneration": {"script": "scripts/" + Path(__file__).name, "script_sha256": digest(Path(__file__)), "ffmpeg_version": run([ffmpeg, "-version"]).splitlines()[0]},
    }
    manifest_path = output_dir / "forest-memory-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["output"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
