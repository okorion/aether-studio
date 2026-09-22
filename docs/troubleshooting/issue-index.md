# 증상으로 찾는 전체 이슈 색인

초기 구현부터 PR #17(`cfee1e1`)까지 58항목, PR #18의 후속 수정 8항목을 모았다. 같은 원인의 반복 수정은 한 행에 묶었다. 각 행에서 당시 코드·검사·캡처를 찾아갈 수 있다.

분류의 의미는 다음과 같다.

- **결함:** 실제 화면·입력·실패 주입·리뷰에서 확인해 수정한 문제.
- **보강:** 구현 중 방어하거나 검사한 위험. 독립 운영 사고가 있었다고 해석하지 않는다.
- **시각 개선:** 동작·재질·공간 표현을 목표에 맞춘 변경.
- **관측 한계:** 당시 남은 문제, 기각한 가설 또는 측정·검증 범위의 제한.

## 01. 카메라·좌표·입력

본문: [카메라와 하강](posts/01-camera.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| C01 | 링과 리본 연결부가 따로 움직임 | 결함 | 같은 부모 좌표계로 통합하고 독립 회전 제거. `187e5ad`, [5장면 기록](../visual-comparison.md) |
| C02 | 드래그 해제 후 정면 복귀·회전 제한·누르기만 해도 줌 | 결함 | 시작 각도 누적, 각속도만 감쇠, 줌과 복귀 분리. `bdb607d`, [스크롤·드래그 입력](../continuous-journey.md) |
| C03 | 측면 궤도에서 고정 평면의 포인터 투영 한계 | 보강 | 내려가는 focus를 지나는 카메라 정면 평면에 ray 교차. `bdb607d`, [SceneInteraction](../../src/SceneInteraction.ts) |
| C04 | 형태만 바뀌고 하강·회전이 느껴지지 않음 | 결함 | 경로에 월드 높이·누적 방위각 추가, 방과 스케일 패널 고정. `de540a6`, `55190b7`, [실제 wheel·좌표](../dynamic-motion.md) |
| C05 | 구간별 smoothstep이 모든 기준점에서 속도를 0으로 만듦 | 보강 | 이웃 기울기를 사용하는 단조 cubic 보간. `de540a6`, [Journey](../../src/Journey.ts) |
| C06 | 마지막 링이 상하 반전 | 결함 | 심벌 Z축 반전 제거, 리본 방향 분리. `de540a6`, [링 방향 기록](../screenshots/motion/motion-evidence.json) |
| C07 | 금속 구조가 남은 전환 중 카메라 잠금 해제 | 결함 | 입력 허용과 적용 가중치를 공유, 잠금 중 관성·숨은 누적 제거. `22bf0ec`, `102931e`, [잠금 비교](../mechanical-camera.md) |
| C08 | 세로 드래그가 기대와 반대로 움직임 | 결함 | NDC와 pitch의 부호 교정, 수평 입력 유지. `23f8783`, [세로 입력 검증](../transition-input.md) |
| C09 | 모션 정지·재개에서 선택 시점 초기화 | 결함 | yaw·pitch·elapsed 보존, 정지 중 더블클릭 차단. `1a0a3d3`, `ad4f8c4`, [리뷰·검증](../continuous-journey.md) |

## 02. 체인·입자·포인터

본문: [입자 흐름](posts/02-particles.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| P01 | 본 컬럼과 체인이 스크롤 정지 후에도 이동 | 결함 | 절대 progress로 구조 위상 계산, 같은 위치에서 행렬 갱신 생략. `de540a6`, [정지·복귀 검사](../../tests/living-flow.spec.ts) |
| P02 | 체인이 본 컬럼 옆에 매달렸을 뿐 감기지 않음 | 시각 개선 | 각 체인이 앞뒤를 통과하는 두 나선과 경로 접선·교차 링크. `a7da4f0`, [본 컬럼 전후](../living-worlds.md) |
| P03 | 모든 입자가 같은 방식으로 이동 | 시각 개선 | 고정·이류 역할을 씨드에서 분리, 포인터 추가 이동은 scroll delta 방향 사용. `a7da4f0`, [역할·부호 검사](../../tests/living-flow.spec.ts) |
| P04 | 별도 본·리액터 코어가 연속 입자와 겹침 | 결함 | 중복 코어 제거, 같은 흐름이 고정 높이의 O로 수렴. `a7da4f0`, `4f76963`, [전환 검수](../living-worlds.md) |
| P05 | 정지한 리액터는 마우스 이동에 위치 반응이 없음 | 결함 | 스크롤 변위와 별도 view-space 포인터 변위. `23f8783`, `edf8af2`, [실제 coverage 검사](../../tests/device-pointer.spec.ts) |
| P06 | 리액터 포인터 영향이 또렷한 빈 원으로 보임 | 결함 | 고정 반경 cutoff를 Gaussian·soft core·씨드 편차로 완화. `f0cee5f`, [전후 화면·복귀](../particle-pointer-flow.md) |
| P07 | 포인터 흔적이 가시처럼 늘어남 | 결함 | 선두는 시간에 따라 전진, 잔광은 같은 경로의 과거 위치를 샘플링. `69b9ecb`, [픽셀 전진·소멸 검사](../../tests/interaction.spec.ts) |
| P08 | 둥근 포레스트 군집과 부족한 드래그 시차 | 시각 개선 | 월드 고정 가지·잎·미세 입자, 근접 fade와 상부 수관 재배분. `102931e`, `d0976c6`, [포레스트 전후](../living-worlds.md), [수관](../spatial-transitions.md) |
| P09 | 포레스트에 이전 포인터 방향의 흐름이 남지 않음 | 시각 개선 | 40×28 공유 격자의 확산·감쇠·지연 추종, 경계 가림 전에 변위. `8f4e430`, [상하단·경계 검사](../particle-pointer-flow.md) |
| P10 | 첫 접촉·긴 공백·점프가 가짜 궤적을 만들 위험 | 보강 | 재접촉은 기준점만 저장, 취소·UI·탭 숨김에서 흐름 초기화. `8f4e430`, [흐름 수명 검사](../../tests/pointer-flow.spec.ts) |

## 03. 경계·모델·빛

본문: [전환과 차폐](posts/03-transitions.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| L01 | 링·문구·본 컬럼·모니터가 별개로 교체됨 | 시각 개선 | viewport UV의 같은 사선 경계를 각 재질이 공유. `97fd24f`, `d0976c6`, [전환 비교](../layered-transitions.md) |
| L02 | 투명 기둥 또는 경계 밖 깊이가 뒤 장면을 가림 | 결함 | 장식과 불투명 차폐 재질 분리, 숨긴 fragment는 깊이 쓰기 전 discard. `55190b7`, `d0976c6`, [색·깊이 검사](../../tests/interaction.spec.ts) |
| L03 | 바닥 통과 시 큰 띠·근접 파편 노출 | 결함 | 바닥 위면·slab 두께·아래 천장 분리, 실제 카메라 높이 기반 fade. `d0976c6`, `b9b61fc`, [바닥 전후](../spatial-transitions.md) |
| L04 | 리액터 받침과 바닥의 간격 | 결함 | 받침 상단 유지, 하단을 실제 굴곡 바닥과 교차하도록 연장. `4219d2e`, [접지·Box3 검증](../scene-occlusion-light.md) |
| L05 | 리액터 덮개와 천장이 떨어짐 | 결함 | 덮개 상단과 천장 하부의 공통 접점 계산, 배관·보도 연결. `fc8781c`, [동일 시점 전후](../chamber-art-direction.md) |
| L06 | 모니터 영역에 입자 수렴 전 과정이 먼저 보임 | 결함 | 불투명 천장·닫힌 덮개와 monitorExit 입자 마스크. `4219d2e`, [63.5~68.5% 전후](../scene-occlusion-light.md) |
| L07 | 아래층 천장 밑으로 위층 부품·잔해가 노출 | 결함 | 실제 아래층 진입 시 돌출된 위층 구조 숨김, 천장빛은 유지. `4219d2e`, [78.5% 전후·왕복](../scene-occlusion-light.md) |
| L08 | 하단 포레스트 경계 전에 링·O·리본 노출 | 결함 | 모든 심벌에 같은 forestEntry 경계 적용. `4219d2e`, [sampleEmblemCurtain](../../src/SceneLayers.ts), [90% 전후](../scene-occlusion-light.md) |
| L09 | 금속 스케일 패널의 동심원·마름모 소용돌이 | 시각 개선 | 반지름 기반 위상을 방향성 굴곡으로 교체, 별도 나선 입자 제거. `fc8781c`, [80·85% 전후](../chamber-art-direction.md) |
| L10 | 단순 잔해 배치와 선명한 조명 영상 패턴 | 시각 개선 | 중앙을 비운 양측 설비, 어두운 자체 사틴 영상. `fc8781c`, `a671a44`, [공간 비용·전후](../chamber-art-direction.md), [영상 규격·루프](../light-projection-media.md) |
| L11 | 장면 전체가 같은 빛으로 바뀌어 공간의 깊이가 약함 | 시각 개선 | 월드 위치별 영상 샘플링·절차적 빛, 기존 단일 반사의 수면과 천장빛. `b46256d`, `5269de9`, [조사 범위·구현 차이](../spatial-transitions.md) |

## 04. 모니터·미디어

본문: [유리 모니터](posts/04-monitors.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| M01 | 판이 같은 높이에서 반복 회전하고 본 컬럼 형상이 촘촘함 | 시각 개선 | 고도차가 있는 6판의 유한 경로, 비대칭 본 세그먼트·곡면 유리. `fd46733`, `55fcdd0`, [본 컬럼·판 전후](../spine-monitors.md) |
| M02 | 고해상도 굴절 화면의 DPR 중복 | 결함 | 물리 크기의 타깃 viewport를 사용, 실제 gl.VIEWPORT 검사. `55fcdd0`, [DPR 1.5·2 검사](../../tests/interaction.spec.ts) |
| M03 | 캡처 실패가 renderer 상태·숨긴 판에 남을 위험 | 보강 | RT·viewport·scissor·XR·visibility 등을 finally 복원, 오래된 굴절과 반복 재시도 차단. [SceneMonitors](../../src/SceneMonitors.ts), [실패 주입 검사](../../tests/interaction.spec.ts) |
| M04 | GPU 장면 재구성 때 영상 초기화·늦은 play 결과 충돌 위험 | 보강 | 미디어 소유자 분리, 2개 디코더 공유, attempt 번호와 pause/resume. `6308f56`, [재생 수명 검사](../../tests/video.spec.ts) |
| M05 | 영상 404·디코딩 오류·재생 거부·지원 조회 실패 | 보강 | 선택 형식만 로드, 절차적 대체 표현·반복 재시도 제한, 실제 종료 때 해제. [미디어 규격](../media-sources.md), [영상 검사](../../tests/video.spec.ts) |
| M06 | 모니터 선택이 드래그·스크롤·가려진 표면과 충돌할 위험 | 보강 | 같은 판의 짧은 press/release만 선택, UI·큰 이동·가림·스크롤 제외. `de648fa`, [호버·선택 조건](../monitor-cinema.md) |
| M07 | 영상 sRGB를 이중 변환한다는 리뷰 의심 | 관측 한계 | 실제 RGBA8 업로드·기본 map 픽셀과 비교해 명시적 변환 유지. `8004558`, [색 공간 수치](../performance/video-color-v13.json) |
| M08 | 재인코딩 후 규격은 같아도 화질·루프·보호 파일이 달라질 위험 | 보강 | 전체 디코딩, SSIM·루프 경계·SHA-256 검사. `cdb7bc3`, `a671a44`, [모니터 manifest](../../public/media/monitor-webm-manifest.json), [조명 검증](../light-projection-media.md) |

## 05. 전환 성능·컬링·측정

본문: [첫 전환 성능](posts/05-performance.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| F01 | 첫 하강에서만 최대 2.8초, 재진입은 짧음 | 결함 | 광원 수 고정, 출력 경로별 compileAsync, 정적 텍스처·RT 및 실제 작은 draw 준비. `da14095`, [첫 비교](../transition-performance.md) |
| F02 | 준비 완료 뒤에도 첫 모니터에 약 66~100ms 프레임 | 관측 한계 | 조명 샘플링 사전 준비 후에도 잔여 지연 보존, 새 하부 전환과 구분. `09bcdcf`, [PR #11 기록](../spatial-transitions.md), [PR #13 기록](../scene-occlusion-light.md) |
| F03 | 모니터 영상 초기화와 겹치는 긴 프레임 | 결함 | 요청 차단·정지·코덱·디코더 비교 후 지원 환경에서 VP8 지연 선택. `cdb7bc3`, [분리 실험](../monitor-transition-performance.md) |
| F04 | 굴절 캡처 중 반사가 재귀적으로 전체 장면을 그림 | 결함 | 굴절 캡처 동안만 수면 반사 제외 후 복원. `da14095`, [SceneWorlds](../../src/SceneWorlds.ts) |
| F05 | 완전히 가려진 장면의 굴절·수면 반사 비용 | 보강 | 닫힌 경계·판 투영 범위·실제 패스 카메라로 캡처 선별. `6da8426`, [겹침 비용](../monitor-transition-performance.md) |
| F06 | 주 카메라 컬링을 전역 적용하면 반사 내용 소실 위험 | 보강 | 객체 전체 visible과 패스별 컬링 구분, near-plane 보수 판정·재진입 즉시 캡처. `6da8426`, [SceneVisibility](../../src/SceneVisibility.ts), [재진입 검사](../../tests/interaction.spec.ts) |
| F07 | 200ms 초과 프레임이 적응형 품질 집계에서 누락 | 결함 | 애니메이션 delta 제한과 품질 관측을 분리해 큰 간격도 반영. `1a0a3d3`, [리뷰 기록](../continuous-journey.md) |
| F08 | draw 감소를 GPU·FPS 향상으로 해석할 위험 | 관측 한계 | 방향별 CPU/GPU·draw를 각각 기록. 최신 챔버 최대 226 draw와 단일 표본 한계 보존. [방법](../evidence/monitor-performance-method.md), [챔버 표본](../evidence/chamber-art-performance.json) |
| F09 | p95·정착 표본이 희소한 첫 진입 지연을 가림 | 관측 한계 | 최댓값·임계 초과 수·첫 진입 구간·반복 조건을 함께 기록. 요청 p/렌더 p와 RAF/CPU/GPU/trace 시계를 분리. [측정 방법](../evidence/monitor-performance-method.md) |

## 06. 실패 격리·검증 도구·릴리스

본문: [복구와 릴리스](posts/06-recovery-and-release.md)

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| R01 | 장면 chunk 요청 실패가 앱 전체로 전파 | 결함 | SceneBoundary로 3D만 격리, CSS·본문·탐색 유지. [초기 red-team·실패 요청 검사](../verification.md), [SceneBoundary](../../src/SceneBoundary.tsx) |
| R02 | CSS 대체 화면과 실제 링 중복 | 결함 | 실제 렌더 준비·실패 상태와 표시 동기화. [초기 화면 검수](../verification.md) |
| R03 | 짧은 화면의 히어로 잘림·섹션 이동 후 잔여 화면 | 결함 | 레이아웃과 섹션 표시 정리, 실제 크기별 확인. [초기 화면 검수](../verification.md) |
| R04 | context loss·비동기 준비 완료가 옛 상태를 깨울 위험 | 보강 | 렌더 취소·세대 검사·재준비, 미디어/시점 소유자 보존. [복구 기록](../verification.md), [준비 테스트](../../tests/preparation.spec.ts) |
| R05 | 테스트 보고서 저장 때문에 개발 화면 새로고침 | 결함 | `.qa/`로 모으고 Vite 감시 제외, CI production 실행. `1860ad4`, `9ef2782`, [검증 환경](../verification.md) |
| R06 | CI에서 정상 링크의 클릭 안정성 대기가 시간 초과 | 결함 | 소프트웨어 예산·프레임 사이 입력 여유·worker 1, 실패 trace 보존. `3fbb045`, [초기 RAF 공백과 재검증](../verification.md) |
| R07 | PR #17의 기존 Work 클릭 CI 재실행도 시간 초과 | 관측 한계 | 같은 앱 코드의 로컬·직전 CI와 대조, 코드 변경 없이 실패 작업 재실행 통과. 새 원인 해결로 주장하지 않음. [PR #17](https://github.com/okorion/aether-studio/pull/17) |
| R08 | 정지 스크린샷 안정성 대기·동시 GPU 검사 간섭 | 보강 | 렌더 완료 기준 대기, 단일 GPU 실행, 실제 렌더 직후 픽셀 읽기와 DOM 검사를 분리. `e905e69`, [검사 범위](../layered-transitions.md) |
| R09 | 카드 설명·전경 프로젝트 불일치와 접근 가능한 문구 누락 | 결함 | 설명 교정, Canvas 뒤 DOM 문구 유지, WebGL 대체 화면·초점/Escape 검사. `d067bdb`, [접근성 회귀](../layered-transitions.md), [사용자 흐름](../../tests/experience.spec.ts) |
| R10 | 파비콘 작업에서 승인 OG 재생성·오래된 아이콘 캐시 위험 | 보강 | 아이콘/OG 생성 분리, OG 해시 유지, 버전 URL과 9자산 검증. `be28f58`, [메타데이터](../metadata.md) |
| R11 | 명칭 수정으로 이전 제목 fragment 링크 단절 | 결함 | 변경된 제목의 이전 HTML 앵커 보존. `7071e5f`, [용어표](../scene-glossary.md), [PR #17](https://github.com/okorion/aether-studio/pull/17) |

## 07. 후속 장면 연속성·배치

아래 8항목은 PR #18의 후속 기록이다. 앞의 역사 스냅샷 58항목과 구분하며, 구현 `6654c71`·검사 `e61208b`를 기준으로 한다. [후속 글](posts/07-scene-continuity.md) · [실행 기록](../scene-continuity.md).

| ID | 증상·판단 | 분류 | 대응과 근거 |
| --- | --- | --- | --- |
| N01 | 본 → 리액터 전환에서 넓은 남색 판이 다음 공간을 가림 | 결함 | 넓은 천장 렌더를 끄고 작은 장치 덮개·접점은 유지. 실행 기록의 65% 전후 캡처. |
| N02 | 전환 끝에 본이 위로 올라가며 먼저 사라짐 | 결함 | 추가 상승량 제거, 기준점을 따라가며 화면 경계로만 퇴장. 실제 셰이더 경계 픽셀 검사. |
| N03 | 아래 입자의 수렴 때문에 위쪽 본 주변 입자까지 소실 | 결함 | 겹침 구간에 버퍼를 공유하는 별도 Points 사용. 원래 형태·정지·역스크롤 검사. |
| N04 | 카메라가 바닥 아래로 가면 리액터 전체가 먼저 사라짐 | 결함 | 공통 deviceExit 경계로 각 공간을 자르고 하부 천장·조명 그룹 분리. 76.5% 캡처와 픽셀 검사. |
| N05 | 모니터가 스크롤에 따라 회전하며 본·체인을 가로지름 | 결함 | 패널 방향·깊이 고정, 세로 이동과 바깥쪽 호버. quaternion·복원·실제 geometry 깊이 검사. |
| N06 | 본이 낮고 많으며 스케일 표면 반사가 단조로움 | 시각 개선 | 본 높이·개수 조정, 표면별 박막·거칠기·굴곡. 같은 조건의 전후 캡처. |
| N07 | 유도 섬광이 중간 장면으로 넘어감 | 결함 | 포레스트 생성 영역과 이동 후 픽셀을 함께 제한하고 지난 궤적 초기화. CPU 입력 회귀 검사. |
| N08 | 하단 리본이 아래에서 위로 뒤집히며 등장 | 시각 개선 | 보이지 않는 중간 구간에서 위쪽 부착 자세를 미리 설정. 마지막 포레스트 전후 캡처. |

## 검증 환경

모의 renderer·DOM 검사, 실제 WebGL·디코더 검사와 화면 캡처의 위치는 [출처](sources.md)에 정리했다. 모바일 검사는 에뮬레이션이며 실물 Safari/iOS는 남아 있다.

AETHER의 컬링 관련 항목은 F06의 반사 기여·near-plane·재진입 검사다. 과거 개인 블로그의 별도 사건은 포함하지 않았다. 원본 사이트와의 시각 유사도는 수치로 측정하지 않았다.
