# 공유 조명 영상

숲과 지하 장치의 표면색에 사용하는 영상은 이 프로젝트에서 수식으로 제작한 [`chrome-current.mp4`](../public/media/chrome-current.mp4)와 [`aurora-bloom.mp4`](../public/media/aurora-bloom.mp4)를 교차 전환하는 저해상도 파생본입니다. 크롬의 넓은 은색·청록 반사와 오로라의 어두운 배경·보라색 발광 장면이 교대하므로, 표면 조명도 영상 속 장면 변화에 따라 달라집니다. Active Theory의 영상이나 모델 자산을 사용하지 않았습니다. 모니터 영상 2편과 별도로 하나의 디코더와 텍스처를 공유합니다.

| 항목 | 값 |
| --- | --- |
| 파일 | [`light-projection.mp4`](../public/media/light-projection.mp4) |
| 크기 | 218,586 bytes — 생성 상한 400,000 bytes |
| 규격 | 256 × 160, 12 fps, 14초, 168프레임 |
| 포맷 | H.264 Main / yuv420p, 무음, faststart |
| SHA-256 | `36b9720b2d1cce38bde73f661b1cf71ae6212da4713d0dcc21c8cdde982f83bd` |
| 크롬 원본 SHA-256 | `546f31b436c2c094a119ecd7b76be7f93661b4c2b9cf62f56decc61e211ed123` |
| 오로라 원본 SHA-256 | `8e1f7e6839d5a91932e7a287865171d769c0f59015bc6dda2ed9b237e308f903` |

0–2초는 크롬, 2–5초는 오로라로 전환, 5–9초는 오로라, 9–12초는 크롬으로 전환, 12–14초는 크롬입니다. 전환에는 양 끝의 변화율이 0인 코사인 곡선을 사용합니다. 두 원본의 10초 주기를 각각 14초로 늘리고 같은 위상으로 되돌려, 검은 화면이나 다른 장면으로 끊지 않고 반복합니다.

영상 요청은 호출부가 실제 조명 구간을 활성화할 때 시작합니다. 초기 모션 감소 상태에서는 URL을 연결하지 않습니다. 호출부는 소프트웨어 렌더링에서도 활성화를 차단해야 합니다. 탭 숨김, 장면 비활성화, 모션 일시 정지에서는 재생을 멈추고 이미 받은 프레임과 재생 위치를 유지합니다. 재생 거부 또는 미디어 오류는 해당 소유자의 수명 동안 재시도하지 않으며, 조명 셰이더는 기본 절차적 효과로 돌아갑니다.

[`SceneLightVideo.ts`](../src/SceneLightVideo.ts)의 `texture`는 준비 상태에 따라 검은 1px 텍스처 또는 영상 텍스처를 반환하는 getter입니다. 호출부는 `texture`와 `getReady()`를 공유 조명 uniform에 함께 반영합니다. `dispose()`는 재생, 미디어 URL, 프레임 콜백, 이벤트 리스너와 두 텍스처를 정리합니다.

## 재생성

저장소 루트에서 Python과 FFmpeg를 사용합니다. FFmpeg가 PATH에 없으면 `--ffmpeg`로 경로를 지정하거나 `imageio-ffmpeg`에 포함된 실행 파일을 사용할 수 있습니다.

```powershell
python scripts/generate-light-video.py
python scripts/generate-light-video.py --ffmpeg "C:\tools\ffmpeg.exe"
python scripts/generate-light-video.py --qa-dir .qa/occlusion-v13/media
```

[`생성 스크립트`](../scripts/generate-light-video.py)는 기존 미디어 manifest와 두 원본 SHA-256을 변환 전후에 대조합니다. 168프레임 전체를 RGB로 디코드하여 프레임 수를 확인하고 영상 메타데이터, faststart, 파일 크기를 검증합니다. 마지막→첫 프레임의 평균 RGB 차이는 16.396/255로, 표본 인접 프레임 차이의 95백분위인 26.047/255보다 작았습니다. 이는 인코딩된 반복 경계에 비정상적으로 큰 장면 점프가 없는지 확인하는 검사이며, 마지막과 첫 프레임이 완전히 같은 이미지라는 뜻은 아닙니다. 상세 결과는 [`별도 manifest`](../public/media/light-projection-manifest.json)에 기록됩니다. FFmpeg 버전이 다르면 인코딩 결과의 해시는 달라질 수 있습니다.

`--qa-dir`를 지정하면 1초 크롬, 7초 오로라, 3.5초 전환의 실제 디코딩 프레임과 색·밝기 요약을 저장합니다. 현재 검수 프레임에서 크롬과 오로라의 평균 휘도는 각각 119.219/255와 47.668/255로, 밝고 조밀한 반사 장면과 어두운 발광 장면의 차이가 확인되었습니다. 화면의 최종 밝기·광선 모양은 이 영상을 사용하는 조명 셰이더와 별도로 검수합니다.

[`수명 테스트`](../tests/light-video.spec.ts)는 실제 브라우저나 디코더를 만들지 않는 DOM 모의 검증입니다. 지연 다운로드, 일시 정지와 재개, 탭 숨김, 오래된 play Promise, 차단과 오류, 정리를 확인합니다. 실제 표면의 조명 변화와 디코더 성능은 전체 장면의 브라우저 검증 대상입니다.
