# 모니터 영상 자산

두 영상과 포스터는 이 저장소의 [생성 스크립트](../scripts/generate-media.py)로 직접 만든 절차적 그래픽이다. 외부 영상, 사진, 브랜드, 3D 모델, 텍스처, 음악을 다운로드하거나 복제하지 않았다. 실행 시에도 외부 미디어에 접속하지 않는다.

| 자산 | 내용 | 형식 |
| --- | --- | --- |
| [chrome-current.mp4](../public/media/chrome-current.mp4) | 움직이는 높이장의 법선과 반사 벡터로 만든 크롬 유체. 수식으로 정의한 은색·청록·금색·보라색 조명이 표면을 따라 흐른다. | 640×400, 24fps, 10초 |
| [aurora-bloom.mp4](../public/media/aurora-bloom.mp4) | 세 겹의 접힌 오로라 리본과 미세한 발광 실. 리본의 폭·굽힘·색·중첩을 주기 함수로 변화시킨다. | 640×400, 24fps, 10초 |
| [chrome-current.jpg](../public/media/chrome-current.jpg) | 크롬 영상의 1.8초 시점 포스터 | JPEG, 640×400 |
| [aurora-bloom.jpg](../public/media/aurora-bloom.jpg) | 오로라 영상의 1.8초 시점 포스터 | JPEG, 640×400 |

MP4는 H.264 High / `yuv420p`, 무음, `faststart`로 인코딩한다. 현재 두 영상의 총 용량은 **2,101,778바이트(약 2.10MB)**이며, 크롬 1,510,755바이트·오로라 591,023바이트다. 총 예산은 5MB이고 개별 영상은 2.5MB를 넘으면 스크립트가 실패한다. 해상도·프레임 수·용량·SHA-256은 [manifest](../public/media/media-manifest.json)에 기록한다.

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

## 검증

- 시간 의존식은 10초 주기를 사용한다. 스크립트가 0초와 10초의 생성 프레임을 비교하여 최대 RGB 차이가 1을 넘으면 중단한다.
- 각 영상은 240프레임이며 음성 트랙이 없다.
- 두 파일의 총 480프레임을 끝까지 디코딩하고 H.264·`yuv420p`·해상도·프레임 속도·10초 길이를 확인했다. MP4의 `moov` atom이 `mdat`보다 앞에 있어 스트리밍 재생에 필요한 `faststart` 순서임을 확인했다.
- 포스터는 실제 생성 프레임에서 추출했으며 별도의 참고 이미지가 아니다.
- 브라우저 재생 성공·상태 전환·실제 모니터 재질과의 합성은 애플리케이션 통합 검증에서 확인한다.

기존 영상을 다시 생성하지 않고 위 검증과 manifest 갱신만 실행할 수 있다.

```sh
python scripts/generate-media.py --verify-only
```
