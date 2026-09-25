# 검증 실행과 결과

## 자동 검사

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Playwright 설정은 [playwright.config.ts](../playwright.config.ts), CI 설정은 [ci.yml](../.github/workflows/ci.yml)에 있다. 로컬에서는 개발 서버, CI에서는 빌드된 preview를 사용한다. 둘 다 5173 포트의 기존 서버를 재사용하므로 다른 버전의 서버가 떠 있으면 먼저 확인한다. 소스를 바꾼 뒤 기존 preview로 검사한다면 다시 빌드해야 한다.

| 프로젝트 | 검사 범위 |
| --- | --- |
| `desktop` | PC 탐색·상세 화면·스크롤·모션과 영상 흐름 |
| `mobile` | 모바일 크기의 Chromium에서 탐색·레이아웃·동작 |
| `interaction` | 실제 장면 행렬·셰이더 픽셀·포인터·미디어 수명과 실패 처리 |
| `no-webgl` | WebGL 비활성 및 3D 모듈 실패 시 본문·탐색 유지 |

일부만 실행하려면 `npm test -- --project=interaction`처럼 프로젝트를 지정한다. CI는 SwiftShader를 사용하고 각 작업의 worker를 하나로 제한한다. 실제 GPU 검수는 별도로 실행하며 성능 측정 중 다른 GPU 작업을 함께 실행하지 않는다.

## 최근 확인 결과

2026-09-25 재질·유체 변경의 검사 범위와 실제 GPU 관찰은 [재질·유체 표현과 검증](graphics-detail-fidelity.md)에 있다. 아래 PR #20 측정은 당시 상태를 보존한 기록이다.

[PR #20 최종 CI](https://github.com/okorion/aether-studio/actions/runs/35721404162)는 2026-09-22의 `b8da2eb` 기준이다. 인터랙션 57개, PC·WebGL 미지원 9개, 모바일 8개가 재시도 없이 통과했고 lint·typecheck·build도 통과했다. 병합 커밋은 `03f5130`이다. 이후 변경의 상태는 [Actions](https://github.com/okorion/aether-studio/actions)에서 확인한다.

같은 배포의 공개 사이트에서 PC 11개·모바일 5개 상태를 확인했다. 역스크롤과 마우스 이동을 포함하며 브라우저 오류는 없었다. 배포 장면 파일과 로컬 검증본의 SHA-256도 일치했다. [배포 검수 기록](https://github.com/okorion/aether-studio/pull/20#issuecomment-5775722227)

장면을 분리한 픽셀 검사에서는 중간 구간의 포인터 스트릭·흰 점이 나타나지 않았고, 리액터 O 지름은 변경 전의 약 2/3였다. 모니터 역방향 복원과 스케일 패널의 입력 후 복귀도 확인했다. [검사 조건](scene-reference-detail.md)

## 성능과 실기기 범위

PR #20의 RTX 2060 SUPER·Chromium ANGLE D3D11·1440×900·DPR 1 측정에서 19초 하강과 19초 상승의 RAF p95는 각각 16.8ms였고, 33.5ms를 넘는 프레임은 없었다. 한 기기의 한 차례 왕복 결과이며 모든 환경의 FPS를 뜻하지 않는다. 정지 스크린샷은 성능 측정에 사용하지 않는다.

모바일 캡처와 자동 검사는 Chromium 에뮬레이션이다. 실제 Safari/iOS, 저사양 GPU, 장시간 발열·메모리 검증은 남아 있다. [후속 검증](next-improvements.md)에 확인할 흐름과 완료 기준을 정리했다.

이전 구현의 수치와 실패 기록은 [문서 색인](README.md#변경과-측정-기록)에 보존한다. 서로 다른 커밋·기기·측정 방식의 수치를 합쳐 누적 개선율로 계산하지 않는다.
