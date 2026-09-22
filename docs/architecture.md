# 장면과 입력 구조

스크롤 위치는 카메라와 장면의 배치를 결정하고, 시간은 영상·조명·미세 움직임에 사용한다. 그래서 같은 스크롤 위치로 돌아오면 본 컬럼과 모니터 배치는 복원되지만 영상 프레임까지 되감기지는 않는다.

## 화면과 장면 수명

[App.tsx](../src/App.tsx)는 홈·Work·Contact, 프로젝트 상세와 모션 설정을 관리한다. [Scene.tsx](../src/Scene.tsx)는 Three.js 장면을 만들고 입력·카메라·재질·영상 상태를 프레임마다 연결한다. 3D 모듈이 실패하면 [SceneBoundary.tsx](../src/SceneBoundary.tsx)가 오류를 받아 본문과 탐색을 유지한다.

셰이더와 정적 GPU 자원은 [ScenePreparation.ts](../src/ScenePreparation.ts)에서 첫 표시 전에 준비한다. Work·Contact·상세 화면과 숨긴 탭에서는 연속 렌더링과 영상 재생을 멈춘다. 복귀하면 기존 스크롤 위치와 재생 상태를 이어간다. 자원을 해제하거나 컨텍스트를 다시 만들 때는 오래된 비동기 준비가 새 장면을 활성화하지 않도록 취소 상태를 확인한다.

## 스크롤과 카메라

[Journey.ts](../src/Journey.ts)는 스크롤 위치에서 카메라 높이·각도·장면 가중치를 계산한다. 드래그 회전의 입력은 [SceneInteraction.ts](../src/SceneInteraction.ts)에서 받고, 실제 카메라에 적용할 범위는 `orbitWeight`로 정한다. 본 컬럼·리액터·스케일 패널에서는 카메라 회전을 잠그되 표면의 포인터 반응은 유지한다.

화면에 함께 보이는 장면은 [SceneLayers.ts](../src/SceneLayers.ts)의 경계를 공유한다. [SceneVisibility.ts](../src/SceneVisibility.ts)는 경계와 카메라 투영 범위를 보고 굴절·반사 캡처가 필요한지 판단한다. 경계값을 바꿀 때는 메시 표시뿐 아니라 캡처·클릭 판정도 함께 확인한다.

## 장면별 동작

| 대상 | 현재 동작 | 구현 |
| --- | --- | --- |
| 상단·하단 포레스트 | 고정된 월드 위치의 가지·잎·입자가 카메라 시차를 만든다. 마우스의 이동 방향이 잎과 입자에 잠시 남는다. | [ForestGeometry](../src/ForestGeometry.ts), [SceneForest](../src/SceneForest.ts) |
| 본 컬럼·체인 | 마디 방향이 높이에 따라 조금씩 달라진다. 체인 경로도 중심의 굽힘을 따른다. | [SceneSpine](../src/SceneSpine.ts) |
| 본 컬럼 입자 | 약 80%는 필드 안의 위치를 유지하고 나머지가 스크롤을 따라 이동한다. 고정은 화면 좌표 고정을 뜻하지 않는다. | [Atmosphere](../src/Atmosphere.ts) |
| 모니터 | 본 컬럼 앞뒤의 사선 나선을 따라 위치·높이·방향이 함께 바뀐다. 호버는 나선 바깥쪽으로 조금 이동시키며 클릭은 프로젝트 상세를 연다. | [SceneMonitors](../src/SceneMonitors.ts) |
| 리액터 | 고정된 높이의 금속 장치 안으로 O 입자가 모인다. 포인터 주변의 입자는 변형됐다가 돌아온다. | [SceneWorlds](../src/SceneWorlds.ts), [Atmosphere](../src/Atmosphere.ts) |
| 스케일 패널 | 원형 파동에 따라 육각 조각이 뒤집힌다. 포인터 흐름을 공유해 지나간 자리의 변형이 감쇠한다. 마모·거칠기·미세 요철은 생성 텍스처로 표현한다. | [SceneScaleSurface](../src/SceneScaleSurface.ts) |
| 벨 크리처 | 몸통·테두리·촉수가 상단·하단 포레스트의 경계를 공유한다. 중간 장면에는 배치하지 않는다. | [Scene](../src/Scene.tsx) |

명칭과 사용자 별칭은 [용어집](scene-glossary.md)에서 찾을 수 있다. 모니터 나선과 입자 비율, O 크기를 바꾼 근거는 [장면 수정 기록](scene-reference-detail.md)에 있다.

## 포인터와 미디어

포인터 스트릭과 점 잔광은 포레스트에서만 생성·표시한다. 포레스트를 벗어나면 이전 입자의 수명을 비워 빠르게 돌아와도 오래된 궤적이 다시 나타나지 않는다. 표면 변형에 사용하는 흐름은 별도이므로 리액터·스케일 패널의 입력을 끄지 않는다.

[SceneVideo.ts](../src/SceneVideo.ts)는 모니터가 공유하는 영상을 지연 로드한다. VP8 지원 여부에 따라 WebM 또는 MP4를 고르고, 선택한 영상이 실패하면 절차적 셰이더를 표시한다. [SceneLightVideo.ts](../src/SceneLightVideo.ts)는 별도 조명 영상의 재생과 텍스처를 관리한다. 두 수명 모두 정지·복귀·실패·해제를 구분한다.

작은 화면과 소프트웨어 렌더러는 입자·조각 수와 반사 계산을 줄인다. 적응형 DPR과 후처리 설정은 `Scene.tsx`에 있다. 비용을 바꿀 때는 평균 프레임 시간만 보지 말고 첫 진입과 장면이 겹치는 구간을 따로 확인한다.
