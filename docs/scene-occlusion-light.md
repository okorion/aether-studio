# 장면 차폐와 영상에 반응하는 빛

PR #13 후속 기록. 리액터가 떠 보이던 간격, 전환 중 드러나던 입자 수렴, 스케일 패널 천장 아래로 튀어나오던 위층 구조물을 정리했습니다. 포레스트와 지하층의 빛은 자체 크롬·오로라 영상의 장면 변화에 함께 반응하도록 연결했습니다. 이전 [PR #11 공간 전환 기록](spatial-transitions.md)과 [PR #12 포인터 흐름 기록](particle-pointer-flow.md)은 당시 결과로 보존합니다.

## 위층과 아래층의 가림

아래 좌표는 AETHER의 월드 좌표이며, `p`는 전체 홈 스크롤의 정규화 값입니다. 원본 사이트의 좌표나 진행률과 같다는 의미는 아닙니다.

| 대상 | 원인과 변경 | 유지한 범위 |
| --- | --- | --- |
| 리액터 접지 | 기존 받침 하단과 바닥 사이에 약 0.485 간격이 있었습니다. 받침 상단을 고정하고 하단을 `Y=-44.13`까지 연장해 바닥 `Y=-44.1`에 접지했습니다. | 리액터·O 중심 `Y=-40.4`, 스케일 패널 중심 `Y=-48` |
| 모니터 → 리액터 | 투명한 리액터 챔버 천장과 속이 빈 상단 소켓을 통해 수렴 중인 입자가 보였습니다. `Y=-34.6`에 64×64 양면 불투명 천장을 두고 리액터 소켓을 상단 `Y=-37.12`의 막힌 덮개로 닫았습니다. | `p=.61~.69`의 기존 사선 전환과 카메라 경로 |
| 바닥 → 스케일 패널 | `Y=-44.155`의 아래향 불투명 천장 면을 64×64로 넓혔습니다. 카메라가 `Y≤-44.13`이면 위층 리액터·잔해·긴 기둥과 보를 숨겨, 바닥 아래로 돌출된 부분도 남지 않게 했습니다. 단순한 뒤쪽 벽은 아래 방의 배경으로 유지합니다. | 바닥 위 물과 기존 512×512 반사 타깃 하나 |

불투명 차폐면은 깊이를 기록하며, 공간 장식과 별도 머티리얼을 사용합니다. 잔해처럼 바닥 아래로 이미 돌출된 형상은 천장 면만으로 가릴 수 없어 실제 카메라 높이로 가시성을 분리했습니다. 위로 스크롤하면 위층 리액터와 잔해의 원래 상태를 복원합니다. 구현은 [`SceneWorlds.ts`](../src/SceneWorlds.ts)에 있습니다.

## 수렴 입자와 마지막 링의 경계

[`Atmosphere.ts`](../src/Atmosphere.ts)는 `p=.60~.635`에서 `monitorExit` 화면 마스크를 적용하기 시작합니다. O로 모이는 입자는 들어오는 리액터 영역 안에만 나타나고, 위로 빠져나가는 모니터 영역에는 수렴 과정이 새지 않도록 했습니다. 입자의 기본 모양·스크롤 이동과 포인터 반응은 유지합니다.

마지막 링·내부 O·리본 트레일은 [`sampleEmblemCurtain`](../src/SceneLayers.ts)의 같은 `forestEntry` 경계를 사용합니다. 하단 포레스트가 드러난 영역 안에서 링이 나타나므로 스케일 패널 화면 위에 링이나 리본 트레일 일부가 먼저 노출되는 문제를 줄입니다. 공통 경계는 [`SceneCurtains.ts`](../src/SceneCurtains.ts), 실제 링 적용은 [`Scene.tsx`](../src/Scene.tsx)에 있습니다.

## 원본 관찰과 자체 구현의 차이

[Active Theory](https://activetheory.net/)의 화면, [공개 실행 코드](https://activetheory.net/assets/js/app.1780406240914.js), [공개 셰이더](https://activetheory.net/assets/shaders/compiled.vs)를 확인했습니다. 원본 에셋이나 코드를 복사하지 않고 관찰한 움직임과 공간 관계를 재구성했습니다. **동일한 렌더링 방식의 재현은 아닙니다.**

| 원본에서 확인한 구조 | AETHER에 적용한 방식 |
| --- | --- |
| 공유 `reel.mp4`를 `HomeVideoShader`와 굴절에 사용하며 곡면은 geometry로 구성 | 자체 제작 영상 텍스처 하나를 곡면 배경·표면·광선에서 공유 |
| `WaterCeilingShader`가 천장 무늬와 영상 Overlay 약 0.3을 합성 | 기존 천장 물결빛 위에 공유 영상의 색과 명암을 합성 |
| `FX.VolumetricLight`의 20개 샘플을 사용하는 광선 효과 | 깊이 검사를 사용하는 넓고 부드러운 광선 면을 instancing으로 구성 |

새 [`SceneLightShafts.ts`](../src/SceneLightShafts.ts)는 포레스트 뒤의 곡면 배경 1 draw와 광선 면 1 draw로 구성됩니다. 영상의 밝고 어두운 부분이 빛의 색·밀도를 바꾸며, 장면 경계를 따라 나타나고 사라집니다. 추가 디코더나 반사·후처리 타깃을 만들지 않습니다. 소프트웨어 렌더링에서는 이 두 draw를 표시하지 않습니다.

공유 [`light-projection.mp4`](../public/media/light-projection.mp4)는 저장소의 크롬 유체·오로라 영상만으로 만든 **256×160, 12fps, 14초, 무음, 218,586바이트** 루프입니다. 크롬→오로라→크롬으로 부드럽게 교대하며, 포레스트와 지하층의 빛도 장면 전환에 반응합니다. 원본 두 편의 해시, 전체 디코딩과 반복 연결 검사는 [조명 영상 문서](light-projection-media.md)에 기록했습니다. 최종 장면 밝기와 성능은 영상 파일 검증과 별도로 확인합니다.

## 시각적 변경

변경 후 소스는 `4219d2e`입니다. 아래는 **1440×900, DPR 1, 같은 스크롤 비율·기본 카메라·무입력 상태**의 실제 실행 화면입니다. 영상의 재생 시간은 캡처 사이에 고정하지 않았으므로 같은 영상 프레임의 비교가 아닙니다. 공간 가림과 배치를 판단하는 자료이며, 빛의 픽셀 차이를 개선율로 해석하지 않습니다.

[캡처 manifest](screenshots/occlusion-v13/manifest.json)에 전후 12쌍·빛 변화 8장·모바일 6장, **총 38장·약 8.85MB**를 보관합니다.

| 대상 | 변경 전 | 변경 후 | 판단 포인트 |
| --- | --- | --- | --- |
| 포레스트 → 소개 · 14.5% | ![변경 전 포레스트와 소개](screenshots/occlusion-v13/before/scroll-145.jpg) | ![변경 후 포레스트와 소개](screenshots/occlusion-v13/after/scroll-145.jpg) | 곡면 배경의 빛과 링 주위 공간 |
| 리액터 진입 · 63.5% | ![변경 전 리액터 진입](screenshots/occlusion-v13/before/scroll-635.jpg) | ![변경 후 리액터 진입](screenshots/occlusion-v13/after/scroll-635.jpg) | 수렴 입자가 모니터 영역에 새지 않는지 |
| 두 공간 경계 · 66% | ![변경 전 공간 경계](screenshots/occlusion-v13/before/scroll-660.jpg) | ![변경 후 공간 경계](screenshots/occlusion-v13/after/scroll-660.jpg) | 닫힌 천장과 화면 사선 경계 |
| 리액터 상단 · 68.5% | ![변경 전 리액터 상단](screenshots/occlusion-v13/before/scroll-685.jpg) | ![변경 후 리액터 상단](screenshots/occlusion-v13/after/scroll-685.jpg) | 막힌 덮개와 내부 입자의 가림 |
| 리액터 받침과 챔버 수면 · 72% | ![변경 전 리액터 받침](screenshots/occlusion-v13/before/scroll-720.jpg) | ![변경 후 리액터 받침](screenshots/occlusion-v13/after/scroll-720.jpg) | 받침 접지와 수면 반사 |
| 바닥 접근 · 75.5% | ![변경 전 바닥 접근](screenshots/occlusion-v13/before/scroll-755.jpg) | ![변경 후 바닥 접근](screenshots/occlusion-v13/after/scroll-755.jpg) | 위층에서 보이는 바닥과 아래 공간 |
| 바닥 통과 · 76.5% | ![변경 전 바닥 통과](screenshots/occlusion-v13/before/scroll-765.jpg) | ![변경 후 바닥 통과](screenshots/occlusion-v13/after/scroll-765.jpg) | 가까운 차폐면과 리액터 하단의 노출 |
| 스케일 패널 천장 · 78.5% | ![변경 전 스케일 패널 천장](screenshots/occlusion-v13/before/scroll-785.jpg) | ![변경 후 스케일 패널 천장](screenshots/occlusion-v13/after/scroll-785.jpg) | 위층 리액터·잔해·기둥의 돌출 제거 |
| 스케일 패널 공간 · 80.5% | ![변경 전 스케일 패널 공간](screenshots/occlusion-v13/before/scroll-805.jpg) | ![변경 후 스케일 패널 공간](screenshots/occlusion-v13/after/scroll-805.jpg) | 천장 영상 명암과 아래층 광선 |
| 포레스트 진입 · 89% | ![변경 전 포레스트 진입](screenshots/occlusion-v13/before/scroll-890.jpg) | ![변경 후 포레스트 진입](screenshots/occlusion-v13/after/scroll-890.jpg) | 포레스트가 나타나는 영역과 링의 첫 노출 |
| 포레스트 경계 · 90% | ![변경 전 포레스트 경계](screenshots/occlusion-v13/before/scroll-900.jpg) | ![변경 후 포레스트 경계](screenshots/occlusion-v13/after/scroll-900.jpg) | 링·O·리본 트레일의 동일한 가림 경계 |
| 하단 포레스트 · 91.5% | ![변경 전 하단 포레스트](screenshots/occlusion-v13/before/scroll-915.jpg) | ![변경 후 하단 포레스트](screenshots/occlusion-v13/after/scroll-915.jpg) | 포레스트 깊이와 영상에 반응하는 배경 빛 |

아래는 스크롤·카메라·포인터를 고정하고 **4초 간격**으로 촬영한 변경 후 화면입니다. 공유 영상과 절차적 조명이 합성된 변화이며, 영상만의 기여도를 분리한 실험은 아닙니다.

| 고정 위치 | 처음 | 4초 뒤 |
| --- | --- | --- |
| 소개와 포레스트 · 14.5% | ![14.5% 조명 처음](screenshots/occlusion-v13/after/light-0.145-a.jpg) | ![14.5% 조명 4초 뒤](screenshots/occlusion-v13/after/light-0.145-b.jpg) |
| 리액터 · 72% | ![72% 조명 처음](screenshots/occlusion-v13/after/light-0.72-a.jpg) | ![72% 조명 4초 뒤](screenshots/occlusion-v13/after/light-0.72-b.jpg) |
| 스케일 패널 천장 · 78.5% | ![78.5% 조명 처음](screenshots/occlusion-v13/after/light-0.785-a.jpg) | ![78.5% 조명 4초 뒤](screenshots/occlusion-v13/after/light-0.785-b.jpg) |
| 하단 포레스트 진입 · 90% | ![90% 조명 처음](screenshots/occlusion-v13/after/light-0.9-a.jpg) | ![90% 조명 4초 뒤](screenshots/occlusion-v13/after/light-0.9-b.jpg) |

## 검증과 남은 확인

| 항목 | 결과 |
| --- | --- |
| lint·typecheck·build | 최종 lint·typecheck 재실행 통과, production build 통과(55 modules, Scene 청크 143.79KB) |
| 전체 자동 테스트 | 기본 구현에서 64개 통과, 4.2분 |
| 리뷰 후 재검증 | 상단 덮개의 shader define 보존 수정 후 관련 GPU 테스트 3개 통과, 4.3초. 전체 64개의 재실행 결과로 확대하지 않음 |
| 실제 영상 색 공간 | 자체 MP4를 정지한 2.52초·6.72초 프레임에서 조명 셰이더와 Three 기본 map 재질의 RGB 오차 0. 별도 테스트 1개 통과. [수치](performance/video-color-v13.json) |
| 실제 하부 스크롤 | native wheel 아래 40회·위 40회 후 초기 스크롤 위치 복귀 통과 |
| 정지 중 빛 변화 | 고정된 4위치에서 4초 간격 변화 확인 |
| 모바일·컨텍스트 복원 | 모바일 6위치 확인, WebGL context loss 후 복원 통과. 검수 오류 0 |
| 실제 브라우저 마우스 검수 | 최종 production 빌드에서 상·하단 포레스트 드래그 회전, 리액터 드래그 잠금, 포인터 이동, 모션 중지·재개 및 컨텍스트 복구 통과. 11개 스크롤 위치를 포함한 15개 기록, 오류 0 |
| 전환 프레임 시간·렌더 비용 | 아래 비교표와 [측정 기록](performance/occlusion-v13.json) |

자동 리뷰가 제기한 이중 sRGB 변환 가능성은 설치된 Three r186의 영상 업로드 경로와 실제 픽셀로 확인했습니다. `VideoTexture`는 `SRGBColorSpace`여도 `RGBA8`로 업로드되고, Three의 기본 map 재질은 셰이더에서 한 번 변환합니다. 커스텀 `uLightFilm`에는 그 map 변환이 없으므로 명시적 변환을 유지합니다. 실제 `texImage2D` 형식은 두 프레임 모두 `RGBA8`, `SRGB8_ALPHA8`는 0회였습니다. 변환을 제거한 대조군은 중간톤이 평균 57~59/255 더 밝아졌습니다. 이 추가 색상 검사는 SwiftShader에서 수행했으며 D3D11 성능 측정과 구분합니다.

## 전환 성능과 한계

1440×900·DPR 1의 Chromium ANGLE D3D11에서 GPU 브라우저를 하나씩 실행했습니다. 장면 준비 완료 후 1초 뒤부터 19초 하강·19초 상승을 빌드별로 한 번씩 측정했습니다. 수치는 `requestAnimationFrame` 사이 간격이며 GPU 타이머 측정값이 아닙니다. [측정 JSON](performance/occlusion-v13.json)에 조건과 소스·구간별 값을 기록했습니다.

| 항목 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 하강 중앙값 | 16.7ms | 16.7ms |
| 하강 95백분위 | 16.8ms | 16.8ms |
| 하강 최댓값 | 83.4ms | 83.3ms |
| 상승 95백분위 | 16.7ms | 16.7ms |
| 스크롤 중 shader compile / link | 0 / 0 | 0 / 0 |
| 스크롤 중 long task | 0 | 0 |
| 최소 품질 계수 | 1 | 1 |

첫 모니터가 들어오는 20–30% 구간의 약 83ms 한 프레임은 전후 모두 남았습니다. 이 결과를 프레임 시간 개선으로 주장하지 않습니다. 원인 분리와 다른 기기의 재현 확인은 후속 측정이 필요합니다.

| 하강 구간의 기록 draw 수 | 변경 전 | 변경 후 | 변화 |
| --- | --- | --- | --- |
| 60–70% | 208 | 217 | 차폐면·조명 추가로 증가 |
| 70–80% | 209 | 143 | 아래층 진입 시 위층 리액터·잔해 제외 |
| 80–90% | 71 | 60 | 불필요한 위층 구조물 제외 |

변경 전은 원격 배포, 변경 후는 로컬 production 빌드여서 네트워크·디코더 준비 조건이 다릅니다. **초기 로딩 시간은 비교하지 않습니다.** 단일 실행의 프레임 간격과 draw 변화로 모든 하드웨어의 FPS를 보장하지 않습니다. 모바일 캡처도 모든 기기·브라우저의 검증으로 확대하지 않습니다. 운영 배포 후 확인은 [PR #13](https://github.com/okorion/aether-studio/pull/13)의 배포 검수 댓글에 별도로 기록합니다.
