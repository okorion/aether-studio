# AETHER STUDIO 시각 변천 기록

초기 구현부터 현재까지 같은 문서 스크롤 비율에서 화면이 어떻게 바뀌었는지 비교합니다. 과거 6개 대표 버전은 `main`의 first-parent 병합 기록을 기준으로 골랐고, PR #10과 #11의 확정 소스를 추가했습니다. 총 **8개 버전·48장**을 수록했습니다. PR #3·#5·#7의 변화는 각각 후속 대표 버전에 포함됩니다.

## 비교 조건

- 과거 6개 병합 커밋의 원본 소스를 별도 `git archive`로 추출한 뒤 production 빌드로 재실행했습니다. 과거 소스는 수정하지 않았고, 현재 작업 트리를 되돌리지 않았습니다. PR #10은 `da14095`, PR #11은 `b9b61fc`의 production 빌드로 촬영했습니다.
- 공통 뷰포트는 **1440×900, 기기 DPR 1, Chromium·ANGLE D3D11**입니다. 실제 GPU canvas가 ready인 것을 확인하고 웹폰트 로딩을 기다렸습니다.
- 각 버전의 실제 문서 길이를 기준으로 **0 / 20 / 40 / 60 / 80 / 98%**로 이동했습니다. 포인터 이동·드래그·모션 정지 없이 기본 카메라를 사용하며, 각 지점에서 2.3초 이상 기다리고 제공되는 렌더 진행률도 확인합니다.
- 버전마다 문서 길이와 장면 배치가 다릅니다. 같은 비율은 같은 이야기 장면이나 월드 좌표를 뜻하지 않습니다. 초기 버전은 Work와 Contact도 문서 스크롤 안에 있으므로 그대로 보존합니다.
- 입자·조명·영상의 시간은 서로 동기화하지 않았습니다. 이 자료는 화면 구성의 변천 기록이며, 픽셀 일치율·시각 유사도·프레임률 비교가 아닙니다.
- 모든 과거 버전의 `package-lock.json` Git blob이 동일함을 확인하여 같은 설치를 재사용했습니다. 소스 버전은 고정됐지만 과거 당시의 브라우저 바이너리까지 복원한 기록은 아닙니다.

[전체 캡처 목록·소스 커밋·파일 SHA-256](screenshots/history/manifest.json)을 함께 보존합니다. 전체 8개 버전 48장의 원본 JPEG 합계는 약 10.64MB입니다.

## 개발 흐름

| 단계 | 변경의 중심 | 대표 화면 |
| --- | --- | --- |
| [PR #1](https://github.com/okorion/aether-studio/pull/1) | 초기 금속 A 링·리본 트레일과 입자 배경, Work·Contact | 초기 스튜디오 |
| [PR #2](https://github.com/okorion/aether-studio/pull/2) | 링과 리본 트레일 결합, 스크롤 장면 확대, 은빛 흔적과 드래그 | 다섯 장면과 마우스 흔적 |
| [PR #3](https://github.com/okorion/aether-studio/pull/3) → [#4](https://github.com/okorion/aether-studio/pull/4) | 24단계 연속 중심 흐름, 카메라 수직 하강과 정지·역방향 체인 | #4 병합본 |
| [PR #5](https://github.com/okorion/aether-studio/pull/5) → [#6](https://github.com/okorion/aether-studio/pull/6) | 중간 장면 카메라 잠금, 본 컬럼 관절·체인과 굴절 모니터 | #6 병합본 |
| [PR #7](https://github.com/okorion/aether-studio/pull/7) → [#8](https://github.com/okorion/aether-studio/pull/8) | 포레스트·문구·독립 지하층 전환, 실제 MP4와 모니터 호버·클릭 | #8 병합본 |
| [PR #9](https://github.com/okorion/aether-studio/pull/9) | 입체 포레스트, 유기적 본 컬럼·감기는 체인, 연속 입자 O와 리액터, 전진 섬광 | #9 병합본 |
| PR #10 개선본 | 작은 타깃으로 장면 사전 준비, 리액터 O 포인터 반응·세로 궤도, 사이트 메타데이터 | `da14095` production 빌드 |
| [PR #11](https://github.com/okorion/aether-studio/pull/11) | 세 공간의 사선 경계·넓은 수면·상부 수관·공유 영상 조명 | `b9b61fc` production 빌드 |

## 실제 재실행 갤러리

모든 대표 버전의 실제 캡처를 확보했습니다. 이미지를 누르면 원래 해상도로 볼 수 있습니다.

### 초기 스튜디오 · PR #1

기준: [`4ba178d`](https://github.com/okorion/aether-studio/commit/4ba178dba238455102b4731323488fe40d51c443) · 금속 A 링·리본 트레일, 입자 배경, 문서 안의 Work·Contact. [당시 설명](verification.md)

재실행 완료 · 실제 문서 높이 3607px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr01/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 1 · 0%](screenshots/history/pr01/scroll-000.jpg)](screenshots/history/pr01/scroll-000.jpg) | [![PR 1 · 20%](screenshots/history/pr01/scroll-020.jpg)](screenshots/history/pr01/scroll-020.jpg) | [![PR 1 · 40%](screenshots/history/pr01/scroll-040.jpg)](screenshots/history/pr01/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 1 · 60%](screenshots/history/pr01/scroll-060.jpg)](screenshots/history/pr01/scroll-060.jpg) | [![PR 1 · 80%](screenshots/history/pr01/scroll-080.jpg)](screenshots/history/pr01/scroll-080.jpg) | [![PR 1 · 98%](screenshots/history/pr01/scroll-098.jpg)](screenshots/history/pr01/scroll-098.jpg) |

### 다섯 장면과 마우스 흔적 · PR #2

기준: [`a950b50`](https://github.com/okorion/aether-studio/commit/a950b50d186f225e900747263b1634ea9cb41451) · 링·리본 트레일 결합, 500svh 장면, 카메라 드래그·은빛 흔적. [당시 설명](visual-comparison.md)

재실행 완료 · 실제 문서 높이 4500px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr02/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 2 · 0%](screenshots/history/pr02/scroll-000.jpg)](screenshots/history/pr02/scroll-000.jpg) | [![PR 2 · 20%](screenshots/history/pr02/scroll-020.jpg)](screenshots/history/pr02/scroll-020.jpg) | [![PR 2 · 40%](screenshots/history/pr02/scroll-040.jpg)](screenshots/history/pr02/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 2 · 60%](screenshots/history/pr02/scroll-060.jpg)](screenshots/history/pr02/scroll-060.jpg) | [![PR 2 · 80%](screenshots/history/pr02/scroll-080.jpg)](screenshots/history/pr02/scroll-080.jpg) | [![PR 2 · 98%](screenshots/history/pr02/scroll-098.jpg)](screenshots/history/pr02/scroll-098.jpg) |

### 연속 하강과 24단계 · PR #4

기준: [`31ffdee`](https://github.com/okorion/aether-studio/commit/31ffdee24d8c0ce17692f46870650b9fd09922e3) · PR #3의 24단계 흐름에 실제 수직 하강·왕복 체인·O 방향 보정. [당시 설명](dynamic-motion.md)

재실행 완료 · 실제 문서 높이 16200px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr04/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 4 · 0%](screenshots/history/pr04/scroll-000.jpg)](screenshots/history/pr04/scroll-000.jpg) | [![PR 4 · 20%](screenshots/history/pr04/scroll-020.jpg)](screenshots/history/pr04/scroll-020.jpg) | [![PR 4 · 40%](screenshots/history/pr04/scroll-040.jpg)](screenshots/history/pr04/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 4 · 60%](screenshots/history/pr04/scroll-060.jpg)](screenshots/history/pr04/scroll-060.jpg) | [![PR 4 · 80%](screenshots/history/pr04/scroll-080.jpg)](screenshots/history/pr04/scroll-080.jpg) | [![PR 4 · 98%](screenshots/history/pr04/scroll-098.jpg)](screenshots/history/pr04/scroll-098.jpg) |

### 본 컬럼과 굴절 모니터 · PR #6

기준: [`f40a58f`](https://github.com/okorion/aether-studio/commit/f40a58fd07a6bf98fcb0184797b1d4dfcb280d33) · 본 컬럼 관절·체인, 나선형 유리 모니터와 배경 굴절. [당시 설명](spine-monitors.md)

재실행 완료 · 실제 문서 높이 16200px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr06/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 6 · 0%](screenshots/history/pr06/scroll-000.jpg)](screenshots/history/pr06/scroll-000.jpg) | [![PR 6 · 20%](screenshots/history/pr06/scroll-020.jpg)](screenshots/history/pr06/scroll-020.jpg) | [![PR 6 · 40%](screenshots/history/pr06/scroll-040.jpg)](screenshots/history/pr06/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 6 · 60%](screenshots/history/pr06/scroll-060.jpg)](screenshots/history/pr06/scroll-060.jpg) | [![PR 6 · 80%](screenshots/history/pr06/scroll-080.jpg)](screenshots/history/pr06/scroll-080.jpg) | [![PR 6 · 98%](screenshots/history/pr06/scroll-098.jpg)](screenshots/history/pr06/scroll-098.jpg) |

### 포레스트의 층 전환과 실제 영상 · PR #8

기준: [`ec640da`](https://github.com/okorion/aether-studio/commit/ec640daeef447b32a6df024739cae2851f4a7c5f) · PR #7의 포레스트·평면 문구·독립 지하층에 실제 MP4 두 편과 판 호버·클릭. [당시 설명](monitor-cinema.md)

재실행 완료 · 실제 문서 높이 16200px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr08/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 8 · 0%](screenshots/history/pr08/scroll-000.jpg)](screenshots/history/pr08/scroll-000.jpg) | [![PR 8 · 20%](screenshots/history/pr08/scroll-020.jpg)](screenshots/history/pr08/scroll-020.jpg) | [![PR 8 · 40%](screenshots/history/pr08/scroll-040.jpg)](screenshots/history/pr08/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 8 · 60%](screenshots/history/pr08/scroll-060.jpg)](screenshots/history/pr08/scroll-060.jpg) | [![PR 8 · 80%](screenshots/history/pr08/scroll-080.jpg)](screenshots/history/pr08/scroll-080.jpg) | [![PR 8 · 98%](screenshots/history/pr08/scroll-098.jpg)](screenshots/history/pr08/scroll-098.jpg) |

### 입체 포레스트와 연속 입자 O · PR #9

기준: [`af57c87`](https://github.com/okorion/aether-studio/commit/af57c8788ea7b068d57c5f59d619963c65def51c) · 월드 공간 포레스트, 유기적 본 컬럼과 감기는 체인, 리액터·단일 입자 O·전진 섬광. [당시 설명](living-worlds.md)

재실행 완료 · 실제 문서 높이 16200px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr09/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| [![PR 9 · 0%](screenshots/history/pr09/scroll-000.jpg)](screenshots/history/pr09/scroll-000.jpg) | [![PR 9 · 20%](screenshots/history/pr09/scroll-020.jpg)](screenshots/history/pr09/scroll-020.jpg) | [![PR 9 · 40%](screenshots/history/pr09/scroll-040.jpg)](screenshots/history/pr09/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![PR 9 · 60%](screenshots/history/pr09/scroll-060.jpg)](screenshots/history/pr09/scroll-060.jpg) | [![PR 9 · 80%](screenshots/history/pr09/scroll-080.jpg)](screenshots/history/pr09/scroll-080.jpg) | [![PR 9 · 98%](screenshots/history/pr09/scroll-098.jpg)](screenshots/history/pr09/scroll-098.jpg) |

### 전환 성능·리액터 입력·세로 궤도 · PR #10

기준: [`da14095`](https://github.com/okorion/aether-studio/commit/da140951e28c4dd4e211eda76570962eabecd7c4) · 장면을 작은 렌더 타깃에서 사전 준비하고, 리액터 O의 포인터 반응과 링 구간의 세로 궤도 입력을 보완했습니다. 사이트 제목·공유 카드·아이콘도 함께 정리했습니다. [메타데이터와 공유 이미지](metadata.md)

실제 production 캡처 완료 · 문서 높이 16200px · 브라우저 오류 0개 · [캡처 조건과 좌표](screenshots/history/pr10/report.json)

이미지는 포인터 조작 전 기본 시점입니다. 성능 개선과 드래그 동작의 검증 결과를 정지 이미지에서 추론하지 않습니다.

| 0% | 20% | 40% |
| --- | --- | --- |
| [![현재 10 · 0%](screenshots/history/pr10/scroll-000.jpg)](screenshots/history/pr10/scroll-000.jpg) | [![현재 10 · 20%](screenshots/history/pr10/scroll-020.jpg)](screenshots/history/pr10/scroll-020.jpg) | [![현재 10 · 40%](screenshots/history/pr10/scroll-040.jpg)](screenshots/history/pr10/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| [![현재 10 · 60%](screenshots/history/pr10/scroll-060.jpg)](screenshots/history/pr10/scroll-060.jpg) | [![현재 10 · 80%](screenshots/history/pr10/scroll-080.jpg)](screenshots/history/pr10/scroll-080.jpg) | [![현재 10 · 98%](screenshots/history/pr10/scroll-098.jpg)](screenshots/history/pr10/scroll-098.jpg) |

### 공간 전환·수면·공유 영상 조명 · PR #11

기준: `b9b61fc` · [세 전환의 전후 비교와 조명 조사](spatial-transitions.md) · [캡처 조건과 좌표](screenshots/history/pr11/report.json)

| 0% | 20% | 40% |
| --- | --- | --- |
| ![PR11 0%](screenshots/history/pr11/scroll-000.jpg) | ![PR11 20%](screenshots/history/pr11/scroll-020.jpg) | ![PR11 40%](screenshots/history/pr11/scroll-040.jpg) |

| 60% | 80% | 98% |
| --- | --- | --- |
| ![PR11 60%](screenshots/history/pr11/scroll-060.jpg) | ![PR11 80%](screenshots/history/pr11/scroll-080.jpg) | ![PR11 98%](screenshots/history/pr11/scroll-098.jpg) |

## 기존 검증 자료

- [초기 배포·콘텐츠 화면](verification.md)
- [초기 5지점 전후·원본 비교](visual-comparison.md)
- [24단계 연속 흐름](continuous-journey.md) · [실제 하강·역스크롤](dynamic-motion.md)
- [본 컬럼과 굴절 모니터](spine-monitors.md) · [층 전환](layered-transitions.md)
- [실제 영상·호버·프로젝트 열기](monitor-cinema.md)
- [입체 포레스트·본 컬럼·리액터](living-worlds.md)
- [사이트 메타데이터·공유 카드·아이콘](metadata.md)

이전 문서의 이미지는 당시 조건의 증거로 보존합니다. 위 갤러리와 뷰포트·스크롤 간격·시간이 다른 이미지를 동일 조건으로 섞지 않았습니다.
