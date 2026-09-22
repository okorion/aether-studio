# 출처·구현 기준·시각 자료

1~6편과 기본 이슈 58항목의 기준은 `cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d`다. 7편과 후속 8항목은 PR #18을 다룬다. 저장된 코드·Git 이력·검증 문서·이미지·JSON을 대조해 작성했다. 이번 개정에서는 문장과 설명 그림을 수정했다.

[기준 커밋의 저장소](https://github.com/okorion/aether-studio/tree/cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d) · [변경 이력](https://github.com/okorion/aether-studio/commits/main/) · [전체 이슈 색인](issue-index.md)

현재 저장소는 공개 상태다. 초기 [검증 기록](../verification.md)의 PRIVATE는 최초 배포 당시 설명이다. 각 실험은 당시 빌드와 조건으로 읽는다.

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

본문의 코드는 실제 발췌와 설명용 예시를 구분했다. 본 컬럼은 금속 모델의 명칭이며 Three.js의 리깅 기능을 사용한 모델은 아니다.

## 수치 자료

- [첫 준비 전](../performance/before.json)과 [후](../performance/after.json): PR #10 최초 하강·상승의 RAF, 긴 프레임, 컴파일·링크 기록.
- [공간 전환](../performance/spatial.json)과 [차폐 전환](../performance/occlusion-v13.json): PR #11·13의 첫 모니터 지연.
- [포인터 비교](../performance/pointer.json): 같은 장비에서 장면이 정착한 뒤 입력한 표본.
- [영상 경로·반복 측정](../evidence/monitor-performance.json): 요청 차단·코덱·디코더 비교와 최종 첫 진입. 구간·GPU query·제외 표본은 [측정 방법](../evidence/monitor-performance-method.md)에 있다.
- [챔버 왕복 표본](../evidence/chamber-art-performance.json): PR #16의 최대 draw 226과 방향별 GPU 시간. 단일 장비에서 버전별 한 번 왕복했다.
- [영상 색 공간](../performance/video-color-v13.json): SwiftShader에서 MP4의 두 정지 프레임을 비교한 결과.
- [모니터 인코딩 manifest](../../public/media/monitor-webm-manifest.json)와 [조명 영상 문서](../light-projection-media.md): 규격·전체 디코딩·화질·루프·해시.

SHA-256은 파일 동일성을 확인하는 값이다. 원시 trace의 보관 여부는 별도로 확인해야 한다. 모의 renderer·DOM, 실제 WebGL·디코더, 화면 캡처는 각 자료에 표시한 검사 범위를 따른다.

## 실제 이미지와 설명 그림

본문 이미지는 AETHER의 실행 캡처와 설명 그림이다. 별도로 연결한 과거 비교 문서에는 Active Theory의 참고 화면도 있다.

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

릴리스 manifest에서 사용한 이미지의 경로·바이트·SHA-256을 확인할 수 있다. 설명 그림의 제목·내부 문구·텍스트 영역은 [그림 문구 목록](editorial/figure-text.json)에 있다.

## 후속 기록: PR #18

[장면 연속성 글](posts/07-scene-continuity.md)은 구현 `6654c71`·검사 `e61208b`를 기준으로 한다. [실행 기록](../scene-continuity.md), [26장 이미지 manifest](../screenshots/continuity-v18/manifest.json), [별도 왕복 성능 표본](../evidence/scene-continuity-performance.json)을 연결했다. 새 표본을 기본 6편의 과거 측정과 합산하지 않는다.

## 문체 참고: okorion Velog

2026-09-22 공개된 작성자와 본문을 확인한 세 편이다. 제목·글의 구조와 설명 방식을 참고했으며 긴 문장이나 코드를 복제하지 않았다.

- [🎥 절두체 컬링과의 전쟁](https://velog.io/@okorion/절두체-컬링과의-전쟁): 특정 카메라 조건에서 시작해 공간 개념과 관련 API를 짧게 연결하는 방식.
- [PWA 서비스워커가 MyHits 조회수 배지를 캐시한 문제 해결기](https://velog.io/@okorion/PWA-서비스워커가-MyHits-조회수-배지를-캐시한-문제-해결기-rfvfju0v): 접속 조건별 증상, 첫 가설, 실제 요청 경로, 수정 후 남는 상태를 나누는 방식.
- [Codex App - Git Bash `max consoles is 32` 오류](https://velog.io/@okorion/Codex-App-Git-Bash-max-consoles-is-32-오류): 오류 메시지와 실행 환경·프로세스 수명을 연결하고 적용 순서를 분리하는 방식.

이 세 글은 문체 참고 자료다. 각 글의 경험·코드를 AETHER의 작업으로 가져오지는 않았다. 추가로 조사한 라이팅 원칙·스킬·도구와 적용 기준은 [편집 기록](editorial/README.md)에 정리했다.

## 시각·구조 참고: Active Theory

[Active Theory](https://activetheory.net/)는 중앙 오브젝트를 따라 내려가는 공간, 금속 표면, 입자·모니터와 포인터 반응의 참고 대상이다. 초기에는 실제 wheel·드래그와 화면을 관찰했고, 이후에는 당시 공개된 [실행 코드](https://activetheory.net/assets/js/app.1780406240914.js), [설정](https://activetheory.net/assets/data/uil.1780406240914.json), [셰이더](https://activetheory.net/assets/shaders/compiled.vs)로 일부 구조를 확인했다. 상세 관찰 범위는 [공간 전환 기록](../spatial-transitions.md), [포인터 조사](../particle-pointer-flow.md), [차폐·빛 기록](../scene-occlusion-light.md)에 있다.

이 주소는 조사 당시의 배포 자산이며 이후 교체될 수 있다. 원본의 가상 스크롤과 AETHER의 native scroll 비율은 일치하지 않는다. 원본 코드·모델·영상·음악을 AETHER 런타임에 복사하지 않았으며, 자체 구현을 원본과 동일한 유체·광학·볼류메트릭 방식이라고 설명하지 않는다.
