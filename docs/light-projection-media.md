# 공유 조명 영상

[`light-projection.mp4`](../public/media/light-projection.mp4)는 Aether 본 컬럼의 실제 형상과 재질을 렌더한 14초 영상입니다. 컬럼이 회전하면서 은색·보라 반사광과 어두운 구간이 천천히 바뀝니다. 외부 영상이나 AT 자산을 사용하지 않습니다.

| 항목 | 값 |
| --- | --- |
| 크기 | 274,410 bytes · 상한 400,000 bytes |
| 규격 | 256 × 160, 12 fps, 14초, 168프레임 |
| 포맷 | H.264 Main / yuv420p, 무음, faststart |
| SHA-256 | `ed28eaf89b16e3d14c3f0e347b19db4cb8b40e4b251bedb8364776a92b48fb46` |
| 원본 | `SceneSpine.ts` 본체·재질, 오프라인 렌더 · 체인 제외 |

## 장면 적용

리액터 개구부에서 내려오는 광선, 금속 구조물, 입자, 수면은 같은 영상 프레임을 공유합니다. 월드 좌표와 개구부까지의 거리에 따라 투사 좌표가 벌어집니다. 영상의 어두운 부분은 어둡게 남기고, 밝은 반사광이 지나가는 부분만 강하게 비춥니다. 수면은 물결 법선에 따라 투사 좌표와 반사가 흔들립니다.

런타임에는 조명 디코더 하나와 기존 텍스처를 사용합니다. 컬럼 촬영은 제작 시에만 수행하므로 장면 캡처나 디코더를 추가하지 않습니다. 준비 전·재생 실패·소프트웨어 렌더링에서는 기존 절차적 조명이 남습니다. 모션 감소에서 영상을 요청하지 않고, 일시 정지·탭 숨김·장면 비활성화에서는 프레임을 유지한 채 재생을 멈춥니다.

## 생성과 검증

```powershell
node scripts/render-light-column.mjs .qa/light-column-frames
python scripts/generate-light-video.py --frames-dir .qa/light-column-frames --qa-dir .qa/light-film/stills
```

Node.js, Playwright Chromium, Python, NumPy, Pillow, FFmpeg가 필요합니다. FFmpeg가 PATH에 없으면 `--ffmpeg`를 지정하거나 설치된 `imageio-ffmpeg`를 사용합니다. `--output-dir`로 검수용 후보를 별도 경로에 생성할 수 있습니다. `--frames-dir` 생략은 이전 수식 기반 사틴 영상 생성 방식이며 현재 배포 영상 재생성에는 사용하지 않습니다.

렌더 스크립트는 0초부터 14초까지 169장의 PNG와 원본 코드 해시를 남깁니다. 인코더는 원본 해시·해상도를 확인하고 168프레임을 인코딩합니다. 전체 디코딩으로 프레임 수·길이·포맷·오디오 부재·faststart·용량을 검증합니다. 마지막→첫 프레임 변화는 전체 인접 프레임 차이의 95백분위와 비교합니다. 0초·14초 원본 렌더는 GPU 연산 차이를 고려해 평균 RGB 오차 0.01/255 이하를 허용합니다.

현재 영상의 디코딩된 RGB 기준 프레임 평균 luma는 3.01–64.25/255입니다. 전체 픽셀 중 luma 24 미만은 81.66%, 150 초과는 7.72%입니다. 최종 WebGL 화면의 선형 광량과는 구분합니다. 이전 사틴 영상의 좁은 밝기 변화보다 명암 차이를 넓혀 동적인 투사가 보이도록 했습니다.

인코딩 설정은 CRF 22, 최대 160k, GOP 24입니다. 검증 후 영상·manifest를 파일별로 교체합니다. 모니터 영상과 해당 manifest 6개의 SHA-256은 생성 전후 동일해야 합니다. 코드·GPU·FFmpeg 버전에 따라 재생성 해시가 달라질 수 있습니다. 상세 수치는 [미디어 manifest](../public/media/light-projection-manifest.json)에 기록합니다.
