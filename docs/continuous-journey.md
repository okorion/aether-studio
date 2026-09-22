# 중앙 오브젝트의 연속 여정 · 2026-09-22

> 이전 구현의 역사 기록입니다. 현재 카메라의 하강·회전, O 심벌, 본 컬럼 정지·역방향과 구간별 드래그 잠금은 [동작 검증 문서](dynamic-motion.md)를 참고하세요. 아래의 고정 원점·전체 구간 드래그·이전 흔적 설명과 이미지는 현재 동작을 의미하지 않습니다.

Active Theory를 실제 브라우저로 다시 관찰하고 카메라와 장면 구성을 24개 기준 지점으로 세분화했습니다. 원본 소스·영상·모델은 사용하지 않았습니다. 로고와 작품, 영상 표면은 자체 제작한 절차적 콘텐츠입니다.

## 비교 조건

- 데스크톱 1440×900, Chromium, Windows D3D11 GPU.
- 원본은 DOM 스크롤이 없는 가상 스크롤입니다. 900px씩 실제 wheel을 입력한 누적 0~20,700px의 24개 대표 상태입니다. 원본 내부 진행률과 정확히 일치하는 비율은 아닙니다.
- AETHER는 native scroll 총 길이의 0~100%를 23개 등간격으로 나눈 24개 위치입니다. `1800svh` 홈과 24개 연속 카메라 키프레임을 사용합니다.
- 동적 장면의 픽셀 일치율은 측정하지 않습니다. 요청된 80%는 시각적 완성도 목표이며, 자동으로 인증된 유사도 점수가 아닙니다.

## 24개 지점의 역할

| 단계 | 흐름 | 중심과 주변의 변화 |
| --- | --- | --- |
| 01–03 | Arrival → Suspension → Approach | 링·리본 트레일의 결합을 유지하며 카메라 접근 |
| 04–05 | Insignia → Imagination | 중앙 로고 확대와 소개 문구 |
| 06–07 | Unfold → Vertebrae | 링을 중심의 금속 관절 구조로 연결 |
| 08–11 | Current → Living screens → Orbit → Cascade | 본 컬럼을 따라 빠르게 흐르는 체인·입자와 움직이는 모니터 |
| 12–15 | Resonance → Parallax → Convergence → Descent | 중심축을 유지하는 원근 변화와 리액터로의 수렴 |
| 16–17 | Chamber → Reactor | 지하 구조물·파이프·발광 코어 |
| 18–20 | Iridescence → Metal bloom → Fold | 금속 스케일 패널과 조명 변화 |
| 21–24 | Depth → Afterglow → Return → Silence | 빛이 줄어드는 하부 공간, 위쪽으로 이어진 리본 트레일과 링 |

## 인터랙션

카메라는 중앙 `(0, 0, 0)`을 바라보며 구면 궤도로 회전합니다. 좌우 드래그는 누적되며 여러 번 이어서 한 바퀴 이상 회전할 수 있습니다. 손을 놓으면 회전 속도만 감쇠하고 선택한 시점은 유지합니다. 빈 공간 더블클릭은 기본 시점으로 부드럽게 복귀합니다. 클릭만으로 카메라를 확대하지 않습니다.

마우스 흔적은 카메라를 향하는 평면에 투영하여 측면·뒷면에서도 포인터 주변에 남습니다. 버튼·링크·dialog와 터치는 궤도 입력에서 제외하며, blur·pointercancel·탭 숨김에서 드래그 상태를 해제합니다.

## 렌더링 예산

공유 geometry, InstancedMesh와 GPU 입자 shader를 사용합니다. GPU·모바일·소프트웨어 렌더러의 예산을 구분하고, 지속적으로 프레임 시간이 길어지면 DPR을 낮춥니다. HDR bloom은 데스크톱 GPU에서 사용하며 낮은 품질 단계와 좁은 화면에서는 직접 렌더링합니다. 숨긴 탭과 reduced-motion에서는 연속 애니메이션을 중지하고, 언마운트에서 geometry·material·texture·render target·입력 이벤트를 정리합니다.

모니터는 시간 기반의 자체 GPU 영상 표면입니다. 외부 MP4나 원본 고객의 영상을 재사용하지 않았습니다. 모션 정지 시 같은 시간 값을 유지하여 정지합니다.

## 실제 24단계 비교

각 이미지를 클릭하면 전체 크기로 볼 수 있습니다. 원본의 정확한 내부 진행률 대신 입력 순서를 비교합니다.

| 단계 · AETHER 진행률 | 원본 대표 상태 | 변경 전 | 변경 후 |
| --- | --- | --- | --- |
| 01 · 0.0% | ![원본 01](screenshots/continuous/reference/stage-01.jpg) | ![이전 01](screenshots/continuous/before/stage-01.jpg) | ![현재 01](screenshots/continuous/after/stage-01.jpg) |
| 02 · 4.3% | ![원본 02](screenshots/continuous/reference/stage-02.jpg) | ![이전 02](screenshots/continuous/before/stage-02.jpg) | ![현재 02](screenshots/continuous/after/stage-02.jpg) |
| 03 · 8.7% | ![원본 03](screenshots/continuous/reference/stage-03.jpg) | ![이전 03](screenshots/continuous/before/stage-03.jpg) | ![현재 03](screenshots/continuous/after/stage-03.jpg) |
| 04 · 13.0% | ![원본 04](screenshots/continuous/reference/stage-04.jpg) | ![이전 04](screenshots/continuous/before/stage-04.jpg) | ![현재 04](screenshots/continuous/after/stage-04.jpg) |
| 05 · 17.4% | ![원본 05](screenshots/continuous/reference/stage-05.jpg) | ![이전 05](screenshots/continuous/before/stage-05.jpg) | ![현재 05](screenshots/continuous/after/stage-05.jpg) |
| 06 · 21.7% | ![원본 06](screenshots/continuous/reference/stage-06.jpg) | ![이전 06](screenshots/continuous/before/stage-06.jpg) | ![현재 06](screenshots/continuous/after/stage-06.jpg) |
| 07 · 26.1% | ![원본 07](screenshots/continuous/reference/stage-07.jpg) | ![이전 07](screenshots/continuous/before/stage-07.jpg) | ![현재 07](screenshots/continuous/after/stage-07.jpg) |
| 08 · 30.4% | ![원본 08](screenshots/continuous/reference/stage-08.jpg) | ![이전 08](screenshots/continuous/before/stage-08.jpg) | ![현재 08](screenshots/continuous/after/stage-08.jpg) |
| 09 · 34.8% | ![원본 09](screenshots/continuous/reference/stage-09.jpg) | ![이전 09](screenshots/continuous/before/stage-09.jpg) | ![현재 09](screenshots/continuous/after/stage-09.jpg) |
| 10 · 39.1% | ![원본 10](screenshots/continuous/reference/stage-10.jpg) | ![이전 10](screenshots/continuous/before/stage-10.jpg) | ![현재 10](screenshots/continuous/after/stage-10.jpg) |
| 11 · 43.5% | ![원본 11](screenshots/continuous/reference/stage-11.jpg) | ![이전 11](screenshots/continuous/before/stage-11.jpg) | ![현재 11](screenshots/continuous/after/stage-11.jpg) |
| 12 · 47.8% | ![원본 12](screenshots/continuous/reference/stage-12.jpg) | ![이전 12](screenshots/continuous/before/stage-12.jpg) | ![현재 12](screenshots/continuous/after/stage-12.jpg) |
| 13 · 52.2% | ![원본 13](screenshots/continuous/reference/stage-13.jpg) | ![이전 13](screenshots/continuous/before/stage-13.jpg) | ![현재 13](screenshots/continuous/after/stage-13.jpg) |
| 14 · 56.5% | ![원본 14](screenshots/continuous/reference/stage-14.jpg) | ![이전 14](screenshots/continuous/before/stage-14.jpg) | ![현재 14](screenshots/continuous/after/stage-14.jpg) |
| 15 · 60.9% | ![원본 15](screenshots/continuous/reference/stage-15.jpg) | ![이전 15](screenshots/continuous/before/stage-15.jpg) | ![현재 15](screenshots/continuous/after/stage-15.jpg) |
| 16 · 65.2% | ![원본 16](screenshots/continuous/reference/stage-16.jpg) | ![이전 16](screenshots/continuous/before/stage-16.jpg) | ![현재 16](screenshots/continuous/after/stage-16.jpg) |
| 17 · 69.6% | ![원본 17](screenshots/continuous/reference/stage-17.jpg) | ![이전 17](screenshots/continuous/before/stage-17.jpg) | ![현재 17](screenshots/continuous/after/stage-17.jpg) |
| 18 · 73.9% | ![원본 18](screenshots/continuous/reference/stage-18.jpg) | ![이전 18](screenshots/continuous/before/stage-18.jpg) | ![현재 18](screenshots/continuous/after/stage-18.jpg) |
| 19 · 78.3% | ![원본 19](screenshots/continuous/reference/stage-19.jpg) | ![이전 19](screenshots/continuous/before/stage-19.jpg) | ![현재 19](screenshots/continuous/after/stage-19.jpg) |
| 20 · 82.6% | ![원본 20](screenshots/continuous/reference/stage-20.jpg) | ![이전 20](screenshots/continuous/before/stage-20.jpg) | ![현재 20](screenshots/continuous/after/stage-20.jpg) |
| 21 · 87.0% | ![원본 21](screenshots/continuous/reference/stage-21.jpg) | ![이전 21](screenshots/continuous/before/stage-21.jpg) | ![현재 21](screenshots/continuous/after/stage-21.jpg) |
| 22 · 91.3% | ![원본 22](screenshots/continuous/reference/stage-22.jpg) | ![이전 22](screenshots/continuous/before/stage-22.jpg) | ![현재 22](screenshots/continuous/after/stage-22.jpg) |
| 23 · 95.7% | ![원본 23](screenshots/continuous/reference/stage-23.jpg) | ![이전 23](screenshots/continuous/before/stage-23.jpg) | ![현재 23](screenshots/continuous/after/stage-23.jpg) |
| 24 · 100.0% | ![원본 24](screenshots/continuous/reference/stage-24.jpg) | ![이전 24](screenshots/continuous/before/stage-24.jpg) | ![현재 24](screenshots/continuous/after/stage-24.jpg) |

## 시점 유지와 모니터 애니메이션

드래그를 놓고 2초 뒤에도 선택한 시점이 유지되는 실제 화면입니다.

![드래그 후 유지](screenshots/continuous/after/orbit-retained.jpg)

같은 스크롤 위치에서 1.6초 간격으로 캡처한 GPU 영상입니다.

| 시각 A | 1.6초 후 |
| --- | --- |
| ![A](screenshots/continuous/after/screen-motion-a.jpg) | ![B](screenshots/continuous/after/screen-motion-b.jpg) |

## 최종 검증 · 2026-09-22

- lint·typecheck·production build 통과. Playwright 22개가 production·SwiftShader에서 재시도 없이 통과(2.1분).
- 24개 위치의 중앙 투영 좌표 유지, 누적 360° 이상 회전, 해제 후 시점 유지, pause/resume 시점 보존, 더블클릭 복귀, 마우스 흔적의 실제 픽셀 생성·소멸을 검증했습니다.
- GPU 캡처 24장과 모바일 6장에 브라우저 오류가 없고, 1440px·390px에서 가로 넘침이 없습니다.
- 독립 레드팀의 P2 두 건(모션 정지 시 시점 초기화, 200ms 초과 프레임의 품질 집계 누락)을 수정하고 재검토를 마쳤습니다. 시각 리뷰의 전면 카드 크기·금속 과포화·스케일 패널 앞 리액터 중첩도 반영 후 확인했습니다.

### 실제 성능 관측

RTX 2060 SUPER / Chromium D3D11, 각 구간 1.5초 정착 후 2.5초 동안 브라우저 프레임 간격을 수집했습니다. 모바일은 동일 데스크톱 GPU의 390×844 터치 에뮬레이션이며 실기기 성능 측정은 아닙니다. 아래 값은 브라우저 프레임 간격으로 GPU 타이머 측정과는 다릅니다.

| 환경 | 위치 | 중앙값 | p95 | draw calls | 품질 계수 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 데스크톱 | 0% | 16.7ms | 16.8ms | 72 | 1.00 |
| 데스크톱 | 17% | 16.7ms | 16.7ms | 71 | 1.00 |
| 데스크톱 | 43% | 16.7ms | 16.8ms | 97 | 0.85 |
| 데스크톱 | 71% | 16.7ms | 16.8ms | 137 | 0.95 |
| 데스크톱 | 82% | 16.7ms | 16.8ms | 114 | 0.95 |
| 데스크톱 | 100% | 16.7ms | 16.7ms | 98 | 1.00 |
| 모바일 에뮬레이션 | 0% | 16.7ms | 16.8ms | 28 | 1.00 |
| 모바일 에뮬레이션 | 17% | 16.7ms | 16.8ms | 14 | 1.00 |
| 모바일 에뮬레이션 | 43% | 16.7ms | 16.7ms | 50 | 0.85 |
| 모바일 에뮬레이션 | 71% | 16.7ms | 16.8ms | 43 | 0.95 |
| 모바일 에뮬레이션 | 82% | 16.7ms | 16.8ms | 38 | 0.95 |
| 모바일 에뮬레이션 | 100% | 16.7ms | 16.8ms | 41 | 1.00 |

이 환경의 정착 후 관측은 약 60fps였습니다. 적응형 해상도 계수가 0.85→0.95→1.0으로 회복되는 것도 관측했습니다. 모든 장면을 본 뒤 3회 왕복한 시점의 GPU geometry/texture 개수는 데스크톱 83/20, 모바일 61/6으로 추가 증가가 없었습니다. 이는 짧은 반복 검증이며 장기 메모리 누수 검증이나 모든 기기의 60fps 보장은 아닙니다. 실제 Safari/iOS·저사양 모바일 실기기는 미검증입니다.

### 남아 있는 차이

원본의 실제 고객 영상과 복잡한 모델 대신 자체 GPU 영상을 사용합니다. 정교한 지하 수면·광학 반사와 원본의 표면 디테일에는 차이가 있습니다. 중심축 연속성, 시점 유지, 영상 교대, 리액터·스케일 패널·하부 링은 24장 비교와 실제 입력으로 검수했습니다.
