# 출처·구현 기준·시각 자료

기본 6편과 이슈 색인은 **`cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d`까지의 역사 기록**이다. 문서화 시점에 저장된 코드, Git 변경 이력, 기존 검증 문서와 이미지·JSON을 대조했다. 문서를 작성했다는 이유만으로 해당 GPU 측정이나 모바일 검수를 새로 실행했다고 표시하지 않는다.

[기준 커밋의 저장소](https://github.com/okorion/aether-studio/tree/cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d) · [변경 이력](https://github.com/okorion/aether-studio/commits/main/) · [전체 이슈 색인](issue-index.md)

현재 저장소는 공개되어 있다. 초기 [검증 기록](../verification.md)의 PRIVATE 설명은 최초 배포 당시 상태로 보존한다. 후속 부록은 해당 변경의 소스·검증 기준을 별도로 적고 기본 6편의 역사값에 합산하지 않는다.

## 주제별 근거

| 주제 | 당시 기록 | 구현·자동 검사 |
| --- | --- | --- |
| 초기 화면·실패 격리·CI | [초기 검증](../verification.md), [다섯 장면 비교](../visual-comparison.md) | [SceneBoundary](../../src/SceneBoundary.tsx), [사용자 흐름](../../tests/experience.spec.ts), [Vite 설정](../../vite.config.ts) |
| 좌표·카메라·24단계 여정 | [연속 여정](../continuous-journey.md), [실제 동작](../dynamic-motion.md), [입력 잠금](../mechanical-camera.md), [세로 입력](../transition-input.md) | [Journey](../../src/Journey.ts), [SceneInteraction](../../src/SceneInteraction.ts), [interaction 검사](../../tests/interaction.spec.ts), [device-pointer 검사](../../tests/device-pointer.spec.ts) |
| 본 컬럼·체인·입자·포레스트 | [본 컬럼·모니터](../spine-monitors.md), [월드 공간](../living-worlds.md), [포인터 흐름](../particle-pointer-flow.md) | [SceneSpine](../../src/SceneSpine.ts), [Atmosphere](../../src/Atmosphere.ts), [PointerFlow](../../src/PointerFlow.ts), [역할·왕복 검사](../../tests/living-flow.spec.ts), [흐름 수명 검사](../../tests/pointer-flow.spec.ts) |
| 평면 전환·차폐·수면 | [레이어 전환](../layered-transitions.md), [공간과 빛](../spatial-transitions.md), [입체 차폐](../scene-occlusion-light.md), [챔버 접점·설비](../chamber-art-direction.md) | [SceneCurtains](../../src/SceneCurtains.ts), [SceneLayers](../../src/SceneLayers.ts), [SceneWorlds](../../src/SceneWorlds.ts), [SceneWater](../../src/SceneWater.ts) |
| 모니터 영상·입력·색 공간 | [영상 모니터](../monitor-cinema.md), [자체 영상 출처](../media-sources.md), [조명 영상](../light-projection-media.md) | [SceneMonitors](../../src/SceneMonitors.ts), [SceneVideo](../../src/SceneVideo.ts), [SceneLightVideo](../../src/SceneLightVideo.ts), [영상 검사](../../tests/video.spec.ts), [색 공간 검사](../../tests/light-video-color.spec.ts) |
| 전환 준비·디코딩·겹침 비용 | [최초 준비](../transition-performance.md), [첫 영상 진입](../monitor-transition-performance.md), [표본·쿼리 매칭 방법](../evidence/monitor-performance-method.md) | [ScenePreparation](../../src/ScenePreparation.ts), [SceneVisibility](../../src/SceneVisibility.ts), [준비 취소·복구 검사](../../tests/preparation.spec.ts) |
| 아이콘·OG·문서 명칭 | [메타데이터](../metadata.md), [장면 용어표](../scene-glossary.md), [PR #17](https://github.com/okorion/aether-studio/pull/17) | [자산 생성기](../../scripts/generate-metadata.mjs), [메타데이터 검사](../../tests/metadata.spec.ts) |

본문의 짧은 코드는 실제 발췌인지, 설명을 위해 줄인 예시인지 표시했다. 예시는 앱 전체를 그대로 실행하는 완성 코드가 아니다. 본 컬럼이라는 이름도 Three.js `Bone`·`Skeleton`·`SkinnedMesh` 리깅을 구현했다는 의미가 아니다.

## 수치 자료

- [첫 준비 전](../performance/before.json)과 [후](../performance/after.json): PR #10의 최초 하강·상승 RAF, 긴 프레임, 컴파일·링크 기록. 비용을 초기 표시 전으로 옮긴 것과 제거한 것을 구분한다.
- [공간 전환](../performance/spatial.json)과 [차폐 전환](../performance/occlusion-v13.json): PR #11·13에 남은 최초 모니터 지연. 앞선 실험과 콘텐츠·실행 조건이 달라 하나의 누적 개선율로 사용하지 않는다.
- [포인터 비교](../performance/pointer.json): 같은 장비의 정착 후 입력 표본. 새로운 흐름이 추가되었다고 모든 환경의 성능이 향상된 자료로 해석하지 않는다.
- [영상 경로·반복 측정](../evidence/monitor-performance.json): 요청 차단·코덱·디코딩 경로와 최종 첫 진입 반복. [측정 방법](../evidence/monitor-performance-method.md)에 구간, GPU query, 제외 표본과 시계 해석을 기록했다.
- [챔버 왕복 표본](../evidence/chamber-art-performance.json): 후속 설비 추가 뒤 최대 draw 226과 방향별 GPU 시간. 단일 장비·버전별 한 번의 비교다.
- [영상 색 공간](../performance/video-color-v13.json): SwiftShader에서 실제 MP4 두 정지 프레임을 비교한 결과. D3D11 성능 실험과 별개이며 다른 Three 버전의 업로드 방식까지 보장하지 않는다.
- [모니터 인코딩 manifest](../../public/media/monitor-webm-manifest.json)와 [조명 영상 문서](../light-projection-media.md): 규격, 전체 디코딩, 화질·루프와 해시. 영상 파일의 밝기 값은 최종 셰이더·노출·bloom을 거친 화면 밝기와 다르다.

보관된 해시는 파일 동일성을 확인하는 정보다. 원시 trace가 없는 곳에서 SHA-256만으로 trace를 복원할 수는 없다. 모의 renderer/DOM 검사, 실제 WebGL 픽셀 검사, 실제 디코더 검사, 최종 화면 캡처도 서로 다른 범위의 증거다.

## 실제 이미지와 설명 그림

기본 6편에는 원본 Active Theory 화면을 삽입하지 않고 AETHER의 자체 실행 캡처와 새 설명 그림을 사용했다. 과거 비교 문서에는 원본 사이트 캡처가 남아 있으므로 두 종류를 혼동하지 않는다.

| 자료 | 종류·조건 |
| --- | --- |
| [motion 캡처·입력값](../screenshots/motion/motion-evidence.json) | 당시 실제 wheel·카메라·정지·역방향. GIF의 재생 간격은 측정 FPS가 아니다. |
| [카메라 잠금 입력값](../screenshots/mechanical-lock/input-evidence.json) | 동일 수평 드래그 전후 실제 방위각. 영상·조명 위상은 맞추지 않았다. |
| [living 장면 기록](../living-worlds.md) | 본 컬럼·체인·포레스트·리액터 전후 실제 화면. 현재 최종 재질과는 다른 역사 화면이다. |
| [pointer 이미지 manifest](../screenshots/pointer/manifest.json) | 같은 위치·입력 경로의 전후. 정적 이미지와 별도 위치 coverage 검사를 구분한다. |
| [occlusion 이미지 manifest](../screenshots/occlusion-v13/manifest.json) | 차폐 전후·시간에 따른 빛·모바일. 자율 영상 시계가 다른 비교는 개선율 계산에 쓰지 않는다. |
| [performance 이미지 manifest](../screenshots/performance/manifest.json) | 1440×900·DPR 1, 논리 시계 270프레임·영상 2초 정지. 화질 비교이며 실시간 지연 측정이 아니다. |
| [chamber-art 이미지 manifest](../screenshots/chamber-art/manifest.json) | 같은 카메라·스크롤·시계·영상 정지 조건의 접점·설비·조명 전후. |
| [brand 이미지 manifest](../screenshots/brand/manifest.json) | 아이콘 실제 파일을 Chromium 본문에서 크기별 렌더. 브라우저 탭 바 캡처가 아니다. |
| [coordinates](images/coordinates.png), [particle-flow](images/particle-flow.png), [layers](images/layers.png) | 좌표·입력·차폐 설명용 PNG 도식. 실제 실행 화면이 아니다. |
| [render-target](images/render-target.png), [recovery](images/recovery.png) | DPR·상태 복구를 설명하는 도식. |
| [frame-evidence](images/frame-evidence.png), [cold-warm](images/cold-warm.png) | 저장된 측정값 또는 관측 범위를 설명하는 차트. 새 GPU 측정 결과가 아니다. |

릴리스 manifest는 문서화에 실제로 사용한 이미지 파일의 경로·바이트·SHA-256을 열거한다. 추가 부록에 새 캡처가 들어오면 그 파일의 조건과 기준 커밋도 별도로 남긴다.

## 후속 기록: PR #18

[장면 연속성 글](posts/07-scene-continuity.md)은 구현 `6654c71`·검사 `e61208b`를 기준으로 한다. [실행 기록](../scene-continuity.md), [26장 이미지 manifest](../screenshots/continuity-v18/manifest.json), [별도 왕복 성능 표본](../evidence/scene-continuity-performance.json)을 연결했다. 새 표본을 기본 6편의 과거 측정과 합산하지 않는다.

## 문체 참고: okorion Velog

2026-09-22 공개된 작성자와 본문을 확인한 세 편이다. 제목·글의 구조와 설명 방식을 참고했으며 긴 문장이나 코드를 복제하지 않았다.

- [🎥 절두체 컬링과의 전쟁](https://velog.io/@okorion/절두체-컬링과의-전쟁): 특정 카메라 조건에서 시작해 공간 개념과 관련 API를 짧게 연결하는 방식.
- [PWA 서비스워커가 MyHits 조회수 배지를 캐시한 문제 해결기](https://velog.io/@okorion/PWA-서비스워커가-MyHits-조회수-배지를-캐시한-문제-해결기-rfvfju0v): 접속 조건별 증상, 첫 가설, 실제 요청 경로, 수정 후 남는 상태를 나누는 방식.
- [Codex App - Git Bash `max consoles is 32` 오류](https://velog.io/@okorion/Codex-App-Git-Bash-max-consoles-is-32-오류): 오류 메시지와 실행 환경·프로세스 수명을 연결하고 적용 순서를 분리하는 방식.

과거 Velog의 절두체 컬링 결함을 AETHER의 실제 사고로 옮기지 않았다. 이번 AETHER 기록에서 확인한 컬링 범위는 반사 카메라의 기여, 근접면의 보수적 판정, 재진입 캡처를 보호한 코드와 검사다. 공개 글 세 편으로 블로그 전체의 문체를 통계적으로 대표한다고 보지도 않는다.

## 시각·구조 참고: Active Theory

[Active Theory](https://activetheory.net/)는 중앙 오브젝트를 따라 내려가는 공간, 금속 표면, 입자·모니터와 포인터 반응의 참고 대상이다. 초기에는 실제 wheel·드래그와 화면을 관찰했고, 이후에는 당시 공개된 [실행 코드](https://activetheory.net/assets/js/app.1780406240914.js), [설정](https://activetheory.net/assets/data/uil.1780406240914.json), [셰이더](https://activetheory.net/assets/shaders/compiled.vs)로 일부 구조를 확인했다. 상세 관찰 범위는 [공간 전환 기록](../spatial-transitions.md), [포인터 조사](../particle-pointer-flow.md), [차폐·빛 기록](../scene-occlusion-light.md)에 있다.

이 주소는 조사 당시의 배포 자산이며 이후 교체될 수 있다. 원본의 가상 스크롤과 AETHER의 native scroll 비율은 일치하지 않는다. 원본 코드·모델·영상·음악을 AETHER 런타임에 복사하지 않았으며, 자체 구현을 원본과 동일한 유체·광학·볼류메트릭 방식이라고 설명하지 않는다.
