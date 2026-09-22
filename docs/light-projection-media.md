# 공유 조명 영상

숲과 지하 장치의 표면색에 사용하는 영상은 이 프로젝트에서 수식으로 제작한 [`chrome-current.mp4`](../public/media/chrome-current.mp4)의 저해상도 파생본입니다. Active Theory의 영상이나 모델 자산을 사용하지 않았습니다. 모니터 영상 2편과 별도로 하나의 디코더와 텍스처를 공유합니다.

| 항목 | 값 |
| --- | --- |
| 파일 | [`light-projection.mp4`](../public/media/light-projection.mp4) |
| 크기 | 218,188 bytes |
| 규격 | 256 × 160, 12 fps, 10초, 120프레임 |
| 포맷 | H.264 Main / yuv420p, 무음, faststart |
| SHA-256 | `d9e3d0e570671e73ff044b10029e921fc78c1c0c82094c25275905ef5a2bfc52` |
| 원본 SHA-256 | `546f31b436c2c094a119ecd7b76be7f93661b4c2b9cf62f56decc61e211ed123` |

영상 요청은 호출부가 실제 조명 구간을 활성화할 때 시작합니다. 초기 모션 감소 상태에서는 URL을 연결하지 않습니다. 호출부는 소프트웨어 렌더링에서도 활성화를 차단해야 합니다. 탭 숨김, 장면 비활성화, 모션 일시 정지에서는 재생을 멈추고 이미 받은 프레임과 재생 위치를 유지합니다. 재생 거부 또는 미디어 오류는 해당 소유자의 수명 동안 재시도하지 않으며, 조명 셰이더는 기본 절차적 효과로 돌아갑니다.

[`SceneLightVideo.ts`](../src/SceneLightVideo.ts)의 `texture`는 준비 상태에 따라 검은 1px 텍스처 또는 영상 텍스처를 반환하는 getter입니다. 호출부는 `texture`와 `getReady()`를 공유 조명 uniform에 함께 반영합니다. `dispose()`는 재생, 미디어 URL, 프레임 콜백, 이벤트 리스너와 두 텍스처를 정리합니다.

## 재생성

저장소 루트에서 Python과 FFmpeg를 사용합니다. FFmpeg가 PATH에 없으면 `--ffmpeg`로 경로를 지정하거나 `imageio-ffmpeg`에 포함된 실행 파일을 사용할 수 있습니다.

```powershell
python scripts/generate-light-video.py
python scripts/generate-light-video.py --ffmpeg "C:\tools\ffmpeg.exe"
```

[`생성 스크립트`](../scripts/generate-light-video.py)는 기존 미디어 manifest와 원본 SHA-256을 대조한 뒤 변환합니다. 모든 프레임을 RGB로 디코드하여 프레임 수를 확인하고 영상 메타데이터, faststart, 파일 크기를 검증합니다. 상세 결과는 [`별도 manifest`](../public/media/light-projection-manifest.json)에 기록됩니다. FFmpeg 버전이 다르면 인코딩 결과의 해시는 달라질 수 있습니다.

[`수명 테스트`](../tests/light-video.spec.ts)는 실제 브라우저나 디코더를 만들지 않는 DOM 모의 검증입니다. 지연 다운로드, 일시 정지와 재개, 탭 숨김, 오래된 play Promise, 차단과 오류, 정리를 확인합니다. 실제 표면의 조명 변화와 디코더 성능은 전체 장면의 브라우저 검증 대상입니다.
