# 초기 구현 검증 · 2026-09-21

## 결과

- ESLint, TypeScript, Vite production build 통과
- Playwright: 데스크톱·모바일의 주요 흐름 12개, WebGL 비활성 1개, Scene 모듈 요청 실패 2개 — 최종 전체 실행 **15/15 통과** (1.9분)
- axe 자동 검사: 검출된 위반 0개. WebGL·그라데이션 배경의 대비는 자동 판정 불가 항목이 남아 있으므로 완전한 접근성 인증을 의미하지 않음
- npm audit: 설치 시 알려진 취약점 0개

## 실제 화면

| 화면 | 캡처 |
| --- | --- |
| 데스크톱 홈 · 1440×900 | ![홈](screenshots/desktop-home.png) |
| 데스크톱 Work · 1440×900 | ![Work](screenshots/desktop-work.png) |
| 프로젝트 상세 · 1440×900 | ![상세](screenshots/desktop-project.png) |
| Contact · 1440×900 | ![Contact](screenshots/desktop-contact.png) |
| 모바일 홈 · 390×844 | ![모바일](screenshots/mobile-home.png) |

## 리뷰 대응

독립 레드팀 리뷰에서 Scene 동적 모듈 로딩 실패 시 앱 전체가 사라지는 결함을 재현했습니다. `SceneBoundary`로 오류를 3D 장면에 한정하고 CSS 배경·본문·탐색을 유지하도록 수정했습니다. 실패 요청을 실제 차단하는 데스크톱·모바일 테스트로 재검증했고 리뷰를 종료했습니다.

화면 검수에서는 CSS fallback과 실시간 링의 중복 표시, 짧은 뷰포트에서 히어로 텍스트 잘림, 섹션 이동 후 이전 섹션의 일부가 남는 문제를 수정했습니다.

`WEBGL_lose_context`를 사용한 실제 컨텍스트 손실에서는 fallback이 표시되고, 복구 후 canvas가 하나만 유지되며 3D 화면으로 복귀하는 것을 확인했습니다. 여러 WebGL 브라우저와 캡처를 동시에 실행한 최종 검수 중 timeout이 발생해 테스트 worker를 1개로 고정했습니다. 후속 서버 로그에서 Playwright HTML 산출물이 Vite 전체 새로고침을 유발하는 것도 확인해 `.qa/`를 파일 감시에서 제외했습니다.

## 검증 범위와 한계

Chromium 및 Chromium 모바일 에뮬레이션으로 검증했습니다. 실제 휴대폰, Safari, Firefox와 저사양 GPU 장기 성능은 미검증입니다. GPU fallback은 단순한 정적 장면이며 3D 효과를 대신하지 않습니다. 브랜드·프로젝트·연락처는 초기 콘셉트이므로 실제 서비스 콘텐츠로 교체해야 합니다.
