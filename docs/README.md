# 개발 문서

현재 동작을 확인하려면 구조·개발·검증 안내부터 읽는다. 아래 변경 기록은 각 문서에 적힌 커밋의 화면과 수치를 설명한다.

## 현재 안내

| 문서 | 내용 |
| --- | --- |
| [장면과 입력 구조](architecture.md) | 모듈 책임, 스크롤·시간·포인터의 연결, 미디어 수명 |
| [개발과 배포](development.md) | 로컬 실행, 콘텐츠 수정, 빌드와 Vercel 설정 |
| [검증 실행과 결과](testing.md) | 검사 명령, 최근 배포 확인, 실제 기기 검증 범위 |
| [후속 검증과 개선](next-improvements.md) | 실기기·장시간 실행·겹침 비용의 확인 순서 |
| [개선 요구사항과 작업 순서 · 2026-09-23](improvement-plan-2026-09-23.md) | 확정한 씬별 요구사항, 8개 PR 범위, 다음 세션 시작 문구 |
| [장면 용어집](scene-glossary.md) | 본 컬럼·리액터·스케일 패널 등 명칭과 구현 위치 |
| [문서 작성 기준](writing-guide.md) | README·소개·개발 문서·과거 기록의 편집 기준 |

## 자산과 메타데이터

| 문서 | 내용 |
| --- | --- |
| [모니터 영상](media-sources.md) | 영상 선택·실패 처리, 생성·인코딩 명령과 해시 |
| [기존 조명 영상](light-projection-media.md) | `light-projection.mp4` 규격, 밝기·반복 경계 검사, 재생 수명 |
| [사이트 메타데이터](metadata.md) | 검색·공유 설명, 아이콘·공유 이미지, 재생성 |
| [서드파티 자료](../THIRD_PARTY_NOTICES.md) | 글꼴·CC0 영상의 출처와 이용 조건 |

## 변경과 측정 기록

| 기록 | 다룬 문제·변경 |
| --- | --- |
| [링·포레스트·본 컬럼의 광학 표현](optical-scenes.md) | 굴절·영상·산란·표면 흐름의 구현, 미디어 출처와 비교 조건 |
| [모바일 광학 교정](mobile-optics-correction.md) | 검은 문구 판에 한정한 물막, 두꺼운 유리 링, 본 컬럼 형상·표면의 전후 비교 |
| [영상 방향·입자 나선·물막 교정](atmosphere-detail-correction.md) | 정면을 유지하는 포레스트 영상, 뒤쪽 나선, 타일 로고와 영상 반사의 전후 비교 |
| [본 컬럼 원경 입자와 꽃 회전](column-background-particles.md) | 멀고 성긴 나선 띠, 가까운 비꽃 입자 제거, 꽃의 시간 회전 해제 |
| [스크롤과 함께 내려오는 체인](single-chain.md) | 한 줄 체인, 보이는 끝 링크, 확대된 금속 링크와 전후 비교 |
| [모니터 영상과 상세 전환](monitor-interactions-2026-09-23.md) | 6단계 호버, 영상 상세·닫기·포커스 복귀와 전후 검증 |
| [리액터 개구부 빛·수면·잔해](reactor-chamber-2026-09-23.md) | 5단계 조명 정렬, 흐르는 수면, 잔해와 전후 검증 |
| [초기 로딩 진행률](loading-progress.md) | 실제 준비 이벤트, 실패 복구, 전후 화면과 로딩 모션 |
| [본 컬럼·리액터·스케일 패널 수정](scene-reference-detail.md) | 모니터 나선, 고정 입자, O 지름, 원형 파동, 중간 장면 잔상 제거 |
| [장면 경계와 모니터 배치](scene-continuity.md) | 공통 경계와 천장 제거. 고정 방향 모니터는 이후 나선 회전으로 변경 |
| [리액터 챔버와 조명](chamber-art-direction.md) | 장치 접점·주변 설비·어두운 조명 영상 |
| [첫 모니터 진입 성능](monitor-transition-performance.md) | 코덱·디코딩 경로 비교, 보이지 않는 캡처 생략 |
| [성능 증거의 수집·집계](evidence/monitor-performance-method.md) | RAF·GPU·영상 기록의 표본 선택과 단위 |
| [장면 차폐와 영상 조명](scene-occlusion-light.md) | 위층 구조 노출·리액터 접지·영상 색 공간 |
| [입자와 포인터 흐름](particle-pointer-flow.md) | 국소 변형과 흐름의 감쇠·복귀 |
| [지하층 전환과 빛](spatial-transitions.md) | 수면·천장·상부 수관과 공간별 조명 |
| [첫 스크롤 멈춤](transition-performance.md) | 셰이더·GPU 자원 준비와 중복 반사 |
| [리액터 입력과 세로 드래그](transition-input.md) | O의 국소 변위, 링 시점의 드래그 방향 |
| [월드 공간 포레스트](living-worlds.md) | 가지·잎·체인·입자와 카메라 시차 |
| [모니터 영상과 입력](monitor-cinema.md) | 초기 MP4 재생, 호버·선택·정지·복귀 |
| [층 전환과 포인터](layered-transitions.md) | 공간 높이·사선 가림·평면 문구의 접근성 |
| [본 컬럼과 굴절](spine-monitors.md) | 본 컬럼 형상·체인·배경 캡처의 DPR |
| [카메라 잠금](mechanical-camera.md) | 스케일 패널 퇴장 중 드래그 허용 문제 |
| [스크롤과 마우스 동작](dynamic-motion.md) | 카메라 하강·정지·역방향과 시점 유지 |
| [연속 스크롤 경로](continuous-journey.md) | 초기 카메라 경로와 같은 크기의 참고 화면 비교 |
| [초기 장면 비교](visual-comparison.md) | 링·입자·프로젝트·리액터 구도 |
| [초기 배포 검증](verification.md) | 탐색·오류 경계·컨텍스트 복원·소프트웨어 렌더러 |
| [시각 변천 갤러리](visual-history.md) | 과거 소스를 다시 실행한 화면과 이후 변경 링크 |

## 트러블슈팅 글

[글 목록](troubleshooting/index.md)에서 증상별 수정 과정을 읽을 수 있다. [이슈 색인](troubleshooting/issue-index.md)은 개별 문제를, [구현·검증 가이드](troubleshooting/runbook.md)는 다음 작업에서 확인할 순서를 다룬다. [출처](troubleshooting/sources.md)에는 코드·리뷰·측정 자료가 연결되어 있다.

블로그 원고는 당시 구현을 설명하는 글이다. 현재 동작과 다른 부분은 최신 구조·변경 기록을 함께 읽는다. 배포된 HTML·ZIP은 [보관 안내](troubleshooting/README.md), 문체 개정 내역은 [편집 기록](troubleshooting/editorial/README.md)에 있다.
