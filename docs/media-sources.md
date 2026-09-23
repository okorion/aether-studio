# 모니터 영상 자산

모니터는 크롬 유체와 오로라 영상을 공유한다. 영상과 포스터는 [생성 스크립트](../scripts/generate-media.py)로 만들며 외부 미디어를 사용하지 않는다. 브라우저의 VP8 지원 여부에 따라 WebM 또는 MP4 한 형식을 로드한다. 장면과의 연결은 [구조 문서](architecture.md)에 있다.

| 자산 | 내용 | 형식 |
| --- | --- | --- |
| [chrome-current.webm](../public/media/chrome-current.webm) | 자체 크롬 유체 MP4의 VP8 대체 형식 | 640×400, 24fps, 10초 |
| [aurora-bloom.webm](../public/media/aurora-bloom.webm) | 자체 오로라 MP4의 VP8 대체 형식 | 640×400, 24fps, 10초 |
| [chrome-current.mp4](../public/media/chrome-current.mp4) | 움직이는 높이장의 법선과 반사 벡터로 만든 크롬 유체. 수식으로 정의한 은색·청록·금색·보라색 조명이 표면을 따라 흐른다. | 640×400, 24fps, 10초 |
| [aurora-bloom.mp4](../public/media/aurora-bloom.mp4) | 세 겹의 접힌 오로라 리본과 미세한 발광 실. 리본의 폭·굽힘·색·중첩을 주기 함수로 변화시킨다. | 640×400, 24fps, 10초 |
| [chrome-current.jpg](../public/media/chrome-current.jpg) | 크롬 영상의 1.8초 시점 포스터 | JPEG, 640×400 |
| [aurora-bloom.jpg](../public/media/aurora-bloom.jpg) | 오로라 영상의 1.8초 시점 포스터 | JPEG, 640×400 |

MP4는 H.264 High / `yuv420p`, 무음, `faststart`로 인코딩한다. 원본 두 편의 합계는 **2,101,778바이트**이며 크롬 1,510,755바이트·오로라 591,023바이트다. 원본 생성 예산은 합계 5MB·개별 2.5MB이며 [원본 manifest](../public/media/media-manifest.json)에 규격과 SHA-256을 기록한다.

| VP8 파일 | 용량 | 원본 MP4 대비 SSIM | SHA-256 |
| --- | ---: | ---: | --- |
| 크롬 | 1,476,078 bytes | 0.977189 | `28ddf17c64918408d44b12afedc928dc30114fbfe4d15efec5c9aae06471d768` |
| 오로라 | 594,901 bytes | 0.984363 | `b8a2c38dd2d25bd63843d5b5fc8349aa8e56843b9bbe194be004ac41cfbd3377` |
| **합계** | **2,070,979 bytes** | — | — |

VP8도 `yuv420p`·무음·240프레임이다. 640×400·24fps와 내용은 유지하되 손실 재인코딩이므로 무손실이라고 부르지 않는다. [WebM manifest](../public/media/monitor-webm-manifest.json)에 원본·결과 해시, 전체 디코딩과 SSIM을 기록한다. 기존 MP4·공유 조명 영상은 변경하지 않았다.

## 런타임 선택과 실패 처리

홈의 모니터 구간이 처음 열릴 때 VP8 지원 여부를 확인한다. `canPlayType('video/webm; codecs="vp8"')`가 `probably` 또는 `maybe`이면 WebM, 미지원·조회 오류이면 원본 MP4를 선택한다. 두 형식을 함께 다운로드하지 않으며 초기 `preload`는 `none`이다.

선택한 영상의 다운로드·디코딩·자동 재생이 실패하면 절차적 영상 셰이더를 표시한다. WebM 실패 후 MP4를 연속 요청하거나 프레임마다 재시도하지 않는다. 모션 정지·숨긴 탭·화면 전환에서는 기존 소스와 재생 위치를 보존하며, 처음부터 모션 축소 상태이면 영상 소스를 연결하지 않는다. JPEG 포스터는 자산 확인용으로 보존하고 화면 밖 영상 요소에 연결하지 않아 런타임에서 요청하지 않는다.

두 영상은 `public/media/`에서 사이트와 함께 Vercel CDN으로 제공한다. 별도 클라우드 계정·API 키·외부 미디어 요청은 필요하지 않다. 디코더 경로와 실제 첫 진입 비교는 [성능 보고서](monitor-transition-performance.md)에 기록했다.

프로젝트 상세는 열려 있는 동안 별도 HTML video 한 개로 해당 종류의 MP4를 재생한다. 모니터의 두 공유 디코더는 그동안 멈추고 위치를 보존한다. 처음부터 모션 축소 상태이면 JPEG 포스터를 표시하고, 재생 중 정지하면 현재 프레임을 유지한다. 재생 실패 때는 기존 ProjectArt를 표시한다. 종료 때 별도 디코더를 해제한다. 이 동작과 전환 검증은 [6단계 기록](monitor-interactions-2026-09-23.md)에 있다.

## 재생성

Python 3.9 이상에서 NumPy, Pillow, imageio-ffmpeg를 설치하고 저장소 루트에서 실행한다. imageio-ffmpeg는 FFmpeg 실행 파일을 제공한다.

```sh
python -m pip install numpy Pillow imageio-ffmpeg
python scripts/generate-media.py
```

포스터만 빠르게 확인하려면 다음 명령을 사용한다.

```sh
python scripts/generate-media.py --posters-only
```

제작에 사용한 환경은 Python 3.9.9, NumPy 1.23.5, Pillow 9.1.0, imageio-ffmpeg 0.6.0, FFmpeg 7.1이다. CPU NumPy로 프레임을 생성하며 브라우저·GPU 렌더러가 필요하지 않다. 동일 환경에서는 수식·시드·프레임 순서가 고정되어 같은 결과를 재생성할 수 있다. 다른 라이브러리 또는 인코더 버전에서는 최종 압축 바이트가 달라질 수 있다.

인코딩 설정은 `libx264 -preset slow -crf 21 -maxrate 1600k -bufsize 3200k -pix_fmt yuv420p -profile:v high -level 3.1 -g 48 -keyint_min 48 -movflags +faststart -an`이다. 입력은 240장의 RGB24 프레임이다.

### VP8 대체 형식 재생성

원본 MP4가 준비된 상태에서 다음 명령을 사용한다. [WebM 생성 스크립트](../scripts/generate-monitor-webm.py)는 원본과 조명 자산을 다시 쓰지 않는다.

```sh
python scripts/generate-monitor-webm.py
# 기존 FFmpeg 실행 파일을 지정할 때
python scripts/generate-monitor-webm.py --ffmpeg /path/to/ffmpeg
```

설정은 `libvpx -crf 10 -deadline good -cpu-used 4 -threads 2 -g 48 -an`이며 비트레이트는 크롬 `1200k`, 오로라 `500k`다. 임시 디렉터리에서 인코딩·전체 디코딩·SSIM 검증을 끝낸 뒤 생성 파일을 각각 원자적으로 교체하고 manifest를 마지막에 기록한다. 크롬은 2MB·SSIM 0.97, 오로라는 0.9MB·SSIM 0.98 조건을 벗어나면 실패한다. FFmpeg/libvpx·WebM 메타데이터 차이로 다른 환경의 압축 바이트·해시는 달라질 수 있다.

## 검증

- 시간 의존식은 10초 주기를 사용한다. 스크립트가 0초와 10초의 생성 프레임을 비교하여 최대 RGB 차이가 1을 넘으면 중단한다.
- 각 영상은 240프레임이며 음성 트랙이 없다.
- 두 파일의 총 480프레임을 끝까지 디코딩하고 H.264·`yuv420p`·해상도·프레임 속도·10초 길이를 확인했다. MP4의 `moov` atom이 `mdat`보다 앞에 있어 스트리밍 재생에 필요한 `faststart` 순서임을 확인했다.
- PR #15의 배포 대상 WebM도 두 편 합계 480프레임을 끝까지 디코딩하고 VP8·`yuv420p`·640×400·24fps·10초·무음과 SSIM을 확인했다. 원본·조명 파일의 전후 SHA-256이 동일하다.
- 포스터는 실제 생성 프레임에서 추출했으며 별도의 참고 이미지가 아니다.
- 브라우저 재생 성공·상태 전환·실제 모니터 재질과의 합성은 애플리케이션 통합 검증에서 확인한다.
- PR #15의 로컬 전체 68개 테스트가 통과했다. 지원 조회를 조작한 형식 선택과 실패 시 절차적 표현을 포함하며, 실제 Safari/iOS 기기 검증과는 구분한다.

기존 영상을 다시 생성하지 않고 위 검증과 manifest 갱신만 실행할 수 있다.

```sh
python scripts/generate-media.py --verify-only
```
