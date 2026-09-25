# 장면 명칭과 구현 용어

사용자 요청의 형태 중심 명칭을 아래 개발 문서 명칭으로 해석합니다. 기존 코드 식별자·파일명·URL은 그대로 유지합니다. 과거 문서의 명칭을 정리하더라도 당시 구현 범위·측정값·커밋·캡처는 바꾸지 않습니다.

| 사용자 요청에서 쓰인 명칭 | 개발 문서 명칭 | 대상과 실제 구현 모듈 |
| --- | --- | --- |
| 척추, 뼈 모양 기둥 | **본 컬럼(Bone Column)** | 출처가 명시된 해부학 메시를 반복 배치한 관절형 세그먼트. [SceneSpine.ts](../src/SceneSpine.ts), [메시 출처](../src/assets/README.md) |
| 사슬, 쇠사슬 | **체인(Chain)** | 본 컬럼을 따라 내려오는 한 줄의 캡슐형 링크와 자유단. [SceneChain.ts](../src/SceneChain.ts), [SceneSpine.ts](../src/SceneSpine.ts) |
| 지하 장치, 중앙 장치 | **리액터(Reactor)** | O 입자를 감싸는 중앙 금속 구조와 받침. 구조는 [SceneWorlds.ts](../src/SceneWorlds.ts), 수렴 입자는 [Atmosphere.ts](../src/Atmosphere.ts) |
| 지하실, 장치 주변 공간 | **리액터 챔버(Reactor Chamber)** | 리액터가 놓인 방의 천장·바닥·주변 설비·수면. [SceneWorlds.ts](../src/SceneWorlds.ts), [SceneRuins.ts](../src/SceneRuins.ts), [SceneWater.ts](../src/SceneWater.ts) |
| 비늘, 금속 비늘 벽 | **스케일 패널(Scale Panel)** | 챔버 바닥 아래 독립 층의 육각 금속 타일 표면. [SceneWorlds.ts](../src/SceneWorlds.ts) |
| 원형 링의 꼬리 | **리본 트레일(Ribbon Trail)** | 링과 같은 부모에 연결된 금속 리본 형상. [Scene.tsx](../src/Scene.tsx) |
| 해파리, 떠다니는 해파리 테두리·다리 | **벨 크리처(Bell Creature)** | 상단·하단 포레스트의 종 모양 부유체. 몸통·테두리·촉수가 같은 장면 경계를 공유. [Scene.tsx](../src/Scene.tsx) |
| 상단 숲, 하단 숲 | **상단·하단 포레스트(Forest)** | 고정된 월드 위치의 가지·잎·미세 입자. [ForestGeometry.ts](../src/ForestGeometry.ts), [SceneForest.ts](../src/SceneForest.ts) |
| 마우스 섬광의 꼬리, 느린 유도탄 같은 빛 | **포인터 스트릭(Pointer Streak)과 잔광 궤적** | 입력 후에도 전진하는 선두 광점과 그 이전 경로를 따르는 잔광. 링의 리본 트레일과 별도 효과. [SceneInteraction.ts](../src/SceneInteraction.ts) |

**본 컬럼은 Three.js의 `Bone`, `Skeleton`, `SkinnedMesh`를 사용한 리깅을 뜻하지 않습니다.** 현재 구현은 수정한 해부학 geometry와 `InstancedMesh`의 변환을 스크롤에 맞춰 갱신합니다. 각 마디는 높이에 따라 조금씩 돌아가며 부모의 전체 회전과 별도로 꼬인 형상을 유지합니다. 본 컬럼과 체인이라는 이름만으로 골격 애니메이션·관절 물리·체인 물리를 구현했다고 해석하지 않습니다. 리액터도 시각적 장면 이름이며 실제 장치 시뮬레이션을 의미하지 않습니다.

리액터는 중앙 오브젝트, 리액터 챔버는 이를 둘러싼 공간입니다. 리액터 받침과 챔버 바닥·수면을 구분하며, 그 아래 스케일 패널 공간을 같은 방으로 묶지 않습니다. 포레스트의 **상단·하단**은 스크롤 장면 위치이고 **상부 수관**은 각 포레스트 안의 높은 가지·잎 영역입니다.

형상이나 결함은 원인을 읽을 수 있게 기록합니다. 예를 들어 ‘마리모’는 **구형 입자 군집**, ‘가시 같은 흔적’은 **생성점에 고정된 채 뾰족하게 늘어난 스트릭**, ‘뚫려 보이는 천장’은 **천장 차폐 누락 또는 경계 밖 구조 노출**, ‘버벅임’은 **긴 프레임 간격**으로 구체화합니다. 측정하지 않은 원인은 단정하지 않고, 화면 관찰과 코드·성능 근거를 구분합니다.
