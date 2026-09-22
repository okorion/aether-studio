# 리액터 챔버와 조명 영상 정리

리액터의 가장 위쪽 덮개를 얇은 천장판에 맞추고, 스케일 패널 표면의 동심원 소용돌이를 제거했습니다. 리액터 챔버는 중앙 O와 수면을 비운 양측 서비스 홀로 재구성했으며, 포레스트의 밝고 선명한 영상 패턴은 어두운 청록·먹보라 사틴 반사로 바꿨습니다.

## 구조와 동작

- 덮개 중심 `3.15`와 두께 `.26`에서 접점 `3.28`을 계산해 천장 하부와 공유합니다. 천장판은 `64 × .18 × 64`이며 세계 높이 `-37.12`에서 덮개와 맞닿습니다. 기존 `5.8` 천장과의 `2.52` 간격이 사라집니다. 케이블 종점과 가로보도 이 높이에 맞췄습니다.
- 리액터 챔버 양측에 기단·캐비닛·프레임·배관·플랜지·작은 상태등을 배치했습니다. 데스크톱/모바일/소프트웨어에서 한쪽당 5/4/3개 베이를 사용합니다. 중앙 좌우 4.5 단위 안쪽에는 새 설비를 두지 않습니다. 무작위 잔해는 가장자리로 줄였습니다.
- 스케일 패널의 방사형 회전과 별도 나선 입자를 제거했습니다. 금속 육각 타일은 넓고 얕은 방향성 굴곡을 유지하며 마우스 위치에서 들림·반사광이 반응합니다. 지하 O로 모이는 스크롤 입자 흐름은 기존 구현을 유지합니다.
- 조명 영상은 모니터 두 편과 독립된 자체 수식 루프입니다. 256×160, 12fps, 14초, **40,498 bytes**로 기존 218,586 bytes보다 약 81.5% 작습니다. [영상·밝기·루프 검증](light-projection-media.md)을 참고하세요.
- 새 설비는 7개 InstancedMesh로 묶었습니다(기존 4개 대비 +3). 대신 스케일 패널의 별도 입자 draw를 제거했습니다. 수면 반사, 모니터 굴절 캡처, 전체 차폐 시 패스 생략 정책은 유지합니다.

## 시각적 변경

변경 전은 `9dfb892`의 고정된 production 빌드, 변경 후는 `a671a44`의 production 빌드입니다. 모두 실제 Chromium GPU 렌더링을 1440×900, DPR 1, 같은 카메라·스크롤·입력 없음 상태에서 캡처했습니다. 각 위치마다 동일하게 60Hz 기준 270번 시계를 진행하고 영상은 2초에서 정지했습니다. 프레임률 측정 자료와 구분합니다. 각 파일 SHA-256과 카메라·영상 상태는 [manifest](screenshots/chamber-art/manifest.json)에 있습니다.

| 지점 | 변경 전 | 변경 후 | 판단 포인트 |
| --- | --- | --- | --- |
| 0% | ![변경 전 상단 포레스트 · 어두운 영상](screenshots/chamber-art/before/scroll-000.jpg) | ![변경 후 상단 포레스트 · 어두운 영상](screenshots/chamber-art/after/scroll-000.jpg) | 상단 포레스트 · 어두운 영상 |
| 14.5% | ![변경 전 포레스트에서 소개로 넘어가는 경계](screenshots/chamber-art/before/scroll-145.jpg) | ![변경 후 포레스트에서 소개로 넘어가는 경계](screenshots/chamber-art/after/scroll-145.jpg) | 포레스트에서 소개로 넘어가는 경계 |
| 24% | ![변경 전 소개와 링](screenshots/chamber-art/before/scroll-240.jpg) | ![변경 후 소개와 링](screenshots/chamber-art/after/scroll-240.jpg) | 소개와 링 |
| 28.5% | ![변경 전 첫 모니터 진입](screenshots/chamber-art/before/scroll-285.jpg) | ![변경 후 첫 모니터 진입](screenshots/chamber-art/after/scroll-285.jpg) | 첫 모니터 진입 |
| 63% | ![변경 전 모니터 하단과 천장 경계](screenshots/chamber-art/before/scroll-630.jpg) | ![변경 후 모니터 하단과 천장 경계](screenshots/chamber-art/after/scroll-630.jpg) | 모니터 하단과 천장 경계 |
| 65% | ![변경 전 천장 통과 전환](screenshots/chamber-art/before/scroll-650.jpg) | ![변경 후 천장 통과 전환](screenshots/chamber-art/after/scroll-650.jpg) | 천장 통과 전환 |
| 67.5% | ![변경 전 덮개·천장 접점과 양측 설비](screenshots/chamber-art/before/scroll-675.jpg) | ![변경 후 덮개·천장 접점과 양측 설비](screenshots/chamber-art/after/scroll-675.jpg) | 덮개·천장 접점과 양측 설비 |
| 70% | ![변경 전 리액터 O와 넓은 수면](screenshots/chamber-art/before/scroll-700.jpg) | ![변경 후 리액터 O와 넓은 수면](screenshots/chamber-art/after/scroll-700.jpg) | 리액터 O와 넓은 수면 |
| 72% | ![변경 전 리액터 챔버 바닥](screenshots/chamber-art/before/scroll-720.jpg) | ![변경 후 리액터 챔버 바닥](screenshots/chamber-art/after/scroll-720.jpg) | 리액터 챔버 바닥 |
| 76.5% | ![변경 전 아래층 진입과 상부 차폐](screenshots/chamber-art/before/scroll-765.jpg) | ![변경 후 아래층 진입과 상부 차폐](screenshots/chamber-art/after/scroll-765.jpg) | 아래층 진입과 상부 차폐 |
| 80% | ![변경 전 소용돌이를 제거한 스케일 패널](screenshots/chamber-art/before/scroll-800.jpg) | ![변경 후 소용돌이를 제거한 스케일 패널](screenshots/chamber-art/after/scroll-800.jpg) | 소용돌이를 제거한 스케일 패널 |
| 85% | ![변경 전 스케일 패널 굴곡](screenshots/chamber-art/before/scroll-850.jpg) | ![변경 후 스케일 패널 굴곡](screenshots/chamber-art/after/scroll-850.jpg) | 스케일 패널 굴곡 |
| 90% | ![변경 전 스케일 패널과 하단 포레스트 경계](screenshots/chamber-art/before/scroll-900.jpg) | ![변경 후 스케일 패널과 하단 포레스트 경계](screenshots/chamber-art/after/scroll-900.jpg) | 스케일 패널과 하단 포레스트 경계 |
| 98% | ![변경 전 하단 포레스트 · 어두운 영상](screenshots/chamber-art/before/scroll-980.jpg) | ![변경 후 하단 포레스트 · 어두운 영상](screenshots/chamber-art/after/scroll-980.jpg) | 하단 포레스트 · 어두운 영상 |

## 검증

- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` 통과.
- Playwright **68개 통과**(4.4분): 데스크톱·모바일·WebGL 대체 화면, 정·역방향 24지점, 천장 높이·두께·덮개 접점과 실제 depth 차폐, 하부 진입 시 리액터 가림과 역진입 복원, 스케일 패널·리액터·포레스트 마우스 픽셀 변화, 영상 재생·정지·실패 처리.
- 읽기 전용 red-team 검수에서 확정 결함 없음. 63·65·67.5%의 실제 화면에서 낮아진 천장 통과와 접점을 별도 확인.

### 왕복 성능 회귀 표본

RTX 2060 SUPER·Chromium ANGLE D3D11, 1440×900, DPR 1에서 버전별 새 브라우저 1회로 19초 하강과 19초 상승을 연속 측정했습니다. HTTP 캐시를 끄고 다른 GPU·빌드·인코딩 작업은 함께 실행하지 않았습니다. [프레임과 GPU 타이머 원자료](evidence/chamber-art-performance.json)의 disjoint는 모두 false입니다.

| 방향 | RAF 최대 전→후 | 33.5ms 초과 전→후 | GPU p95 전→후 | 최대 장면 draw 전→후 |
| --- | --- | --- | --- | --- |
| 하강 | 16.8→16.8ms | 0→0 | 4.35→3.92ms | 217→226 |
| 상승 | 16.8→16.8ms | 0→0 | 4.41→4.68ms | 208→217 |

영상과 리액터 챔버를 포함한 이번 표본에서 긴 프레임은 없었습니다. 새 설비가 여러 캡처에 함께 보이는 순간의 draw 비용은 증가했습니다. GPU 시간은 방향별로 일관되게 감소하지 않았으며, 1회 표본을 통계적인 성능 향상으로 해석하지 않습니다.

## 범위와 한계

영상은 화면 전체를 밝게 비추는 선명한 패턴을 의도적으로 줄였습니다. 조명 셰이더의 sRGB→linear 변환, 영상 재생 수명, 실패 시 절차적 대체 조명은 유지합니다. 모니터 영상은 교체하지 않았습니다. 실기기 Safari와 저사양 모바일 성능은 이 데스크톱 검증으로 보장하지 않습니다.
