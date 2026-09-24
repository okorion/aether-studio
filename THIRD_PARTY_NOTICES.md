# 서드파티 자료

앱은 @fontsource를 통해 DM Sans, IBM Plex Mono, Barlow Condensed를 자체 호스팅합니다. 세 글꼴은 SIL Open Font License 1.1로 제공됩니다. 원문 고지와 라이선스 사본은 `public/licenses/`에 보존했으며 빌드에도 포함됩니다.

- [DM Sans](public/licenses/dm-sans.txt)
- [IBM Plex Mono](public/licenses/ibm-plex-mono.txt)
- [Barlow Condensed](public/licenses/barlow-condensed.txt)

React·Three.js·Vite 등 패키지의 버전과 의존성은 `package-lock.json`에 고정되어 있습니다. 각 소프트웨어의 원 라이선스는 설치 패키지에 포함됩니다.

Active Theory는 시각 구성과 인터랙션을 조사한 참고 사이트이며 이 프로젝트와 제휴 관계가 없습니다. 해당 사이트의 자산은 앱에 포함하지 않습니다.

`forest-memory.mp4`는 아래 CC0 영상의 일부와 기존 자체 제작 영상 `aurora-bloom.mp4`, `chrome-current.mp4`를 편집한 무음 순환 영상입니다. 크롭·색 보정·교차 전환을 적용했습니다.

| 원본 | 제작자 | 이용 조건 |
| --- | --- | --- |
| [Flight over clouds](https://commons.wikimedia.org/wiki/File:Flight_over_clouds.webm) | L. Shyamal | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Street in Mumbai (video) 02](https://commons.wikimedia.org/wiki/File:Street_in_Mumbai_(video)_02.webm) | Nicolas Vigier | CC0 1.0 |
| [Misty river](https://commons.wikimedia.org/wiki/File:Misty_river.webm) | Digitura | CC0 1.0 |

원본 URL·SHA-256·사용 구간·변환·배포 파일 검증 결과는 [영상 manifest](public/media/forest-memory-manifest.json)에 있습니다. [재생성 스크립트](scripts/regenerate-forest-memory.py)는 지정한 원본 해시를 검사하며, 원본 파일을 별도로 준비해야 합니다. 인코더 실행 환경에 따라 재생성 파일의 바이트 해시는 달라질 수 있습니다.
