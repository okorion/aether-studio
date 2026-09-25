# 레퍼런스 장면 교정 · 2026-09-25

이 문서는 당시 변경 기록이다. 이후 스케일 패널 크기를 복구하고 전체 장면 스크롤 거리를 줄였으며, 포레스트 영상·본 컬럼·기체 등은 [후속 수정 기록](scene-spatial-followup.md)에서 교정했다.

기준 커밋은 `5941628`이다. 사용자 캡처와 [Active Theory](https://activetheory.net/)를 1440×900에서 열어 기존 Aether 화면과 비교했다. 앞부분의 세 요청은 A1~A3, 본 컬럼 이후 요청은 B1~B14, 후속 제목→본 컬럼 전환 요청은 C1로 구분한다. 원본의 코드·영상·모델·텍스처를 프로젝트에 복사하지 않았다.

## 확인한 원인과 변경

| 항목 | 기존 원인 | 변경 파일과 동작 |
| --- | --- | --- |
| A1 · 초기 역V 입자 | 본 컬럼으로 전환하는 공통 입자의 도착 곡선을 초기 화면에도 표시 | `Atmosphere.ts`의 초기 공통 필드를 숨긴다. 포레스트의 입자와 리본 트레일은 유지한다. |
| A2 · 물살 중앙·복원 | 접촉 영역에도 높이 기울기를 적용하고, 속도 바이트를 고주파 무늬 위상에 사용 | `PointerFlow.ts`, `SceneSurfaceFlow.ts`에 이동하지 않는 접촉 이력을 추가한다. 접촉 중앙의 굴절은 0, 주변 물살은 기존 반경으로 유지한다. 속도에 따라 흔들리던 고주파 위상을 제거한다. |
| A3 · 큰 글자 번짐 | 캔버스 글자의 선명한 잉크만 표시 | `SceneLayers.ts`에서 큰 제목에만 옅은 청백색 번짐을 합성한다. 본문 크기와 위치는 유지한다. |
| B1 · 본 컬럼 반사색 | 분홍·청록·보라 방향 반사만 강하게 표현 | `SceneSpine.ts`에 금색·녹색 반사를 보태고 기본 코팅의 보라 편향을 줄인다. 흰 금속 하이라이트와 미세 표면은 유지한다. |
| B2 · 본 개수·후방 돌기 | 같은 높이에 PC 13행을 배치하고 둥근 관절 구를 사용 | `SceneSpine.ts`를 10행으로 조정한다. 신경궁 양쪽 뿌리를 연결하고 위·아래 관절돌기, 편평한 횡돌기, 긴 후방 극돌기를 만든다. |
| B3 · 체인 높이 | 스크롤이 체인의 상단 높이를 직접 낮춤 | `SceneChain.ts`에서 이동량을 나선 위상으로 바꾼다. `SceneSpine.ts`가 투영식으로 상단 중심의 화면 Y를 고정해 앞·뒤 감김에 따른 원근 이동도 보정한다. |
| B4 · 꽃 밀도 | 꽃 전용 입자가 PC 44,000개이고 얇은 조각의 투과가 중첩됨 | `Atmosphere.ts`에서 꽃 전용 입자를 PC 180,000개, 모바일 60,000개로 늘린다. 꽃 입자의 크기·불투명도를 조정한다. 리액터 입자 수는 유지한다. |
| B5 · 안개 크기·시간 | 넓은 브러시와 느린 밀도 감쇠 | `PointerFlow.ts`에서 안개 브러시 지름을 기존의 60%로 줄이고 감쇠를 높인다. 정지 뒤 약 1초 이내에 가시적 흔적이 사라지게 한다. |
| B6 · 체인 표면 | 푸른 기본색과 강한 박막 효과에 의존 | `SceneChain.ts`에서 링크 단면을 조금 두껍게 하고 거칠기·박막 두께·방향별 반사색을 조정한다. |
| B7 · 직선 광선 | 입자 필드의 shaft, 원뿔 광선, 챔버 light fan이 중첩 | `Atmosphere.ts`, `SceneChamberLight.ts`, `SceneLightShafts.ts`에서 해당 챔버 광선의 렌더링을 제거한다. 표면에 입혀지는 빛은 유지한다. |
| B8 · 장치 영상 조명 | 포레스트와 별개 영상, 좁은 구멍에서 퍼지는 투영, 어두운 보조광 | `Scene.tsx`에서 포레스트와 챔버가 한 영상 디코더를 공유한다. `SceneLighting.ts`, `SceneWorlds.ts`에서 월드 XZ 좌표로 영상 색을 읽고 표면 방향에 따라 반영한다. |
| B9 · 리액터 실선 | 입자 곡선을 따르는 `LineSegments` 필라멘트 | `Atmosphere.ts`에서 필라멘트 렌더링을 제거한다. 내부 GPU 입자 유동은 유지한다. |
| B10 · 스케일 패널 높이 | 25행으로 구성된 넓은 세로 면적 | `SceneWorlds.ts`에서 PC 15행으로 줄인다. 폭과 육각 타일 크기를 유지하며 모바일에도 같은 비율을 적용한다. |
| B11 · 천장 격자·영상 늘어짐 | Voronoi 셀 경계와 사인 함수로 접은 영상 좌표 | `SceneWorlds.ts`에서 부드러운 파동의 곡선 무늬·미세 질감으로 바꾼다. 영상은 한 번의 평면 좌표로 읽고 물무늬의 색·밝기를 조절한다. |
| B12 · 하단 포레스트 드래그 | 포레스트가 나타난 뒤에도 .94까지 카메라 잠금 | `Journey.ts`에서 .86~.88에 카메라 조작을 복구한다. 포레스트가 보이는 .89에서 드래그를 검증한다. |
| B13 · 전환면 원형 구멍 | 뿌리·지면 입자를 반경 2.8~3.6 바깥에만 배치하고 화면 중앙에 원형 마스크 적용 | `SceneForest.ts`에서 중앙까지 면적에 비례해 입자를 배치하고 중앙 마스크를 제거한다. 상·하단 포레스트는 같은 지면 버퍼를 공유한다. |
| B14 · 포레스트 입자 조립 | 줄기는 실체 메시이고 잎은 고정 위치에서 시간 진동만 수행 | `ForestAssembly.ts`, `SceneForest.ts`에서 줄기·잎 모두 입자로 표현한다. 드문 초기 입자와 포레스트의 완성 위치를 절대 스크롤 값으로 연결한다. 포인터 유동을 유지하며 역스크롤은 같은 경로를 거꾸로 따른다. |
| C1 · 제목→본 컬럼 전환 | 검은 배경판 자체가 글자와 함께 올라가 수평 하단이 드러남. 첫 모니터가 화면 아래에서 옆면으로 늦게 진입 | `SceneLayers.ts`는 판을 화면에 고정하고 글자 UV만 이동한다. 같은 사선 경계가 판을 걷어내며, `SceneMonitors.ts`는 정면 모니터를 그 뒤에 미리 배치한다. 이후 모니터 나선 경로는 유지한다. |

## 지하 조명의 근거

공개 실행 화면과 [공개 앱 번들](https://activetheory.net/assets/js/app.1780406240914.js), [공개 셰이더](https://activetheory.net/assets/shaders/compiled.vs)를 읽어 확인했다. `ViewController/video`의 공통 reel 입력을 `TreeFBR`, 리액터 입자, `WaterCeilingShader` 등이 공유한다. `TreeFBR`은 월드 XZ 좌표로 영상 색을 읽고 재질 색과 합성한다. 천장도 물무늬와 영상 색을 함께 쓴다. 따라서 본 컬럼 위의 구멍에서 내려오는 단일 광선만으로 설명할 수 없다.

Aether는 기존 자체 영상 `forest-memory.mp4`를 공유 입력으로 사용한다. 원본 reel의 내용이나 픽셀을 복제한 것은 아니다. 천장의 caustics도 광선 추적이나 실제 유체 광학 계산이 아닌 절차적 파동 표현이다.

관련 용어는 **video-driven material lighting**, **world-space planar projection**, **thin-film iridescence**, **surface-gradient refraction**, **dry-contact mask**, **dissipation**, **point-cloud morphing**, **screen-space anchoring**, **procedural caustics**다.

## 검증 기록

`lint`, `typecheck`, `build`가 통과했다. 앞선 교정 커밋 `daf976c`는 GitHub Actions의 desktop·mobile·interaction 전체 검사를 통과했다([실행 기록](https://github.com/okorion/aether-studio/actions/runs/36120562962)). 후속 전환 수정은 관련 33개 검사에서 32개가 통과했고, 배경판 자체의 이동을 기대하던 1개를 새 동작에 맞춰 수정한 뒤 재실행해 통과했다. 후속 커밋도 PR의 전체 CI로 검증한다.

1440×900 Chromium/ANGLE D3D11에서 A1~A3, B1~B14에 해당하는 장면을 직접 실행하고 캡처했다. 아래 검증은 실제 제품 셰이더와 앱을 사용한다.

| 대상 | 실제 검증 |
| --- | --- |
| A1~A3 | 초기 역V 제거와 제목 번짐을 캡처로 확인. 같은 마우스 경로의 직후·0.2·0.5·1·2초 화면을 비교. GPU 출력에서 접촉 중앙 변위 0, 주변 변위 유지, 최종 변위 0을 확인. |
| B1~B4, B6 | 본 컬럼 앞·뒤 각도에서 반사색·돌기·행 간격·꽃 밀도·체인 표면을 확인. PC·모바일 투영 검사에서 체인 상단 NDC Y=.72를 유지하며 역스크롤 뒤 링크 행렬이 일치. |
| B5 | 안개 범위 60%와 약 1초의 소멸을 포인터 입력 후 확인. 시간별 밀도 감소, UI 경계·터치·프레임 지연 후 잔상 수명 검사를 통과. |
| B7~B9 | 실제 리액터에서 광선·필라멘트가 없고 영상 색이 금속·수면에 반영됨을 확인. GPU 검사에서 챔버 광선 픽셀·draw call이 0. 공통 영상 디코더·재생·정지·실패 경로 검사 통과. |
| B10~B11 | 같은 진행도에서 패널 높이 축소와 타일 폭 유지, 천장의 곡선 물무늬와 연속된 영상 투영을 확인. |
| B12 | 진행도 .89에서 실제 드래그로 시점이 1.2623rad 바뀜. .85로 역스크롤하면 다시 잠김. |
| B13~B14 | 상·하단 전환면의 중앙 입자, 줄기·잎의 점 표현, 스크롤에 따른 포레스트 조립을 확인. 같은 시간의 정·역방향 11개 구간에서 카메라·모델·회전·체인 진행도 telemetry 차이 0. 포레스트 위치 표본과 링크 행렬도 정확히 복원. |
| C1 | 진행도 .21~.305의 실제 전환을 다시 촬영. PC·모바일 GPU 검사에서 사선 위의 배경 누출 0, .255부터 사선 아래 모니터 픽셀 확인, 정·역방향 픽셀 차이 0. 관련 33개 검사 중 기존 판 이동 기대값 1개를 수정하고 재검사했다. |

PC의 8개 구간에서 각각 RAF 100개를 수집했다. 중앙값 16.7ms, p95 16.8ms, 품질 배율 1.00이었다. 이는 이 Windows GPU 환경의 프레임 간격 관찰이며 GPU 실행 시간이나 모든 기기의 성능을 뜻하지 않는다. 390×844에서도 포레스트·제목·본 컬럼·리액터·스케일 패널·하단 진입을 확인했다. 해당 실행에서 브라우저 예외는 없었다.

## 시각적 변경

모두 1440×900에서 같은 진행도·포인터 경로를 사용한 실제 Aether 화면이다. 영상과 실시간 애니메이션의 촬영 시각에는 차이가 있으므로 반사색의 모든 픽셀을 정량 비교하지 않는다. 마지막 두 전환 비교의 기준은 앞선 교정이 반영된 `daf976c`이며 모션을 정지한 상태다. 원본 사이트 캡처는 재배포하지 않는다.

| 대상 | 변경 전 | 변경 후 | 판단 포인트 |
| --- | --- | --- | --- |
| 초기 포레스트 | ![초기 포레스트 이전](screenshots/reference-corrections/before/forest.jpg) | ![초기 포레스트 이후](screenshots/reference-corrections/after/forest.jpg) | 역V 제거, 드문 초기 입자 |
| 제목 물살 | ![물살 이전](screenshots/reference-corrections/before/text-stroke.jpg) | ![물살 이후](screenshots/reference-corrections/after/text-stroke.jpg) | 접촉 중앙과 주변 변형, 글자 번짐 |
| 본 컬럼 | ![본 컬럼 이전](screenshots/reference-corrections/before/column.jpg) | ![본 컬럼 이후](screenshots/reference-corrections/after/column.jpg) | 본 간격·돌기·반사색·꽃 밀도·체인 |
| 리액터 | ![리액터 이전](screenshots/reference-corrections/before/reactor.jpg) | ![리액터 이후](screenshots/reference-corrections/after/reactor.jpg) | 선 제거, 표면에 입혀지는 영상 조명 |
| 물빛 천장 | ![천장 이전](screenshots/reference-corrections/before/ceiling.jpg) | ![천장 이후](screenshots/reference-corrections/after/ceiling.jpg) | 직선 격자 제거와 곡선 caustics |
| 스케일 패널 | ![패널 이전](screenshots/reference-corrections/before/scales.jpg) | ![패널 이후](screenshots/reference-corrections/after/scales.jpg) | 폭·타일 크기 유지, 높이 축소 |
| 포레스트 전환면 | ![포레스트 전환 이전](screenshots/reference-corrections/before/forest-exit.jpg) | ![포레스트 전환 이후](screenshots/reference-corrections/after/forest-exit.jpg) | 중앙 구멍 제거, 줄기와 잎의 입자 표현 |
| 제목 전환 시작 | ![수평 띠 이전](screenshots/reference-corrections/before/transition-band.jpg) | ![수평 띠 제거](screenshots/reference-corrections/after/transition-band.jpg) | 수평 색상 띠 없이 배경 유지 |
| 본 컬럼 진입 | ![모니터 진입 이전](screenshots/reference-corrections/before/transition-monitor.jpg) | ![모니터 진입 이후](screenshots/reference-corrections/after/transition-monitor.jpg) | 사선 경계 바로 아래 정면 모니터 표시 |

## 비교 범위

원본에서 관찰한 형태·색 분포·밀도·이동 원리·화면 점유율을 기준으로 교정했다. 원본 모델과 영상은 사용하지 않았으므로 픽셀 단위로 동일하지 않다. 모바일 캡처는 데스크톱 Chromium의 좁은 화면이며, 실제 휴대전화 하드웨어 검증을 대신하지 않는다.
