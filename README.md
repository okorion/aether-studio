# Aether Studio

스크롤로 포레스트와 기계 장면을 탐색하는 인터랙티브 3D 웹사이트입니다. 본 컬럼을 감싸는 영상 모니터를 지나 리액터와 금속 스케일 패널로 내려가며, 마우스를 움직이면 입자와 표면이 반응합니다. React, TypeScript, Three.js, Vite로 만들었습니다.

[사이트 열기](https://aether-studio-nu.vercel.app/) · [개발 문서](docs/README.md) · [트러블슈팅](docs/troubleshooting/index.md)

![본 컬럼을 감싸는 영상 모니터와 입자](docs/screenshots/reference-detail/after/scroll-399.jpg)

실제 실행 화면입니다. 본 컬럼·모니터·리액터·스케일 패널을 수정한 [PR #20](https://github.com/okorion/aether-studio/pull/20)의 캡처를 사용했습니다.

## 둘러보기

스크롤을 내리면 상단 포레스트의 링에서 본 컬럼, 리액터 챔버, 스케일 패널, 하단 포레스트로 이어집니다. 위로 스크롤하면 같은 경로를 돌아갑니다.

- **마우스 이동:** 포레스트의 입자와 잎, 리액터 O, 스케일 패널이 반응합니다. 포인터 스트릭과 잔광은 상단·하단 포레스트에만 나타납니다.
- **빈 공간 드래그:** 링과 소개 구간에서 시점을 돌립니다. 놓으면 선택한 시점을 유지하고, 더블클릭하면 기본 시점으로 돌아갑니다. 본 컬럼부터 스케일 패널까지는 스크롤로 시점을 제어합니다.
- **모니터 클릭:** 해당 프로젝트의 상세 화면을 엽니다. Work에서도 프로젝트를 선택할 수 있습니다. Escape로 상세 화면을 닫습니다.
- **모션·사운드:** 화면의 모션 버튼으로 애니메이션을 멈추거나 재개합니다. 사운드는 직접 켰을 때만 재생됩니다. 운영체제의 모션 축소 설정도 따릅니다.

| 리액터 | 스케일 패널 |
| --- | --- |
| ![장치 안에 모인 O 입자](docs/screenshots/reference-detail/after/scroll-700.jpg) | ![원형 파동이 지나는 금속 스케일 패널](docs/screenshots/reference-detail/after/scroll-850.jpg) |

## 로컬 실행

Node.js 22.13 이상이 필요합니다. CI는 Node.js 24를 사용합니다.

```sh
git clone https://github.com/okorion/aether-studio.git
cd aether-studio
npm ci
npm run dev
```

터미널에 표시된 개발 서버 주소를 엽니다. 기본 주소는 `http://127.0.0.1:5173`입니다. 서버·데이터베이스·API 키는 필요하지 않습니다.

```sh
npm run build
npm run preview
```

빌드 결과는 `dist/`에 생성됩니다. 실행 옵션과 배포 설정은 [개발 안내](docs/development.md)에 있습니다.

## 코드 수정

| 바꿀 내용 | 시작할 파일 |
| --- | --- |
| 소개·연락처와 화면 구성 | [App.tsx](src/App.tsx), [styles.css](src/styles.css) |
| 프로젝트 내용 | [projects.ts](src/projects.ts) |
| 스크롤 경로·카메라 | [Journey.ts](src/Journey.ts), [Scene.tsx](src/Scene.tsx) |
| 본 컬럼·체인·모니터 | [SceneSpine.ts](src/SceneSpine.ts), [SceneMonitors.ts](src/SceneMonitors.ts) |
| 입자·포인터 반응 | [Atmosphere.ts](src/Atmosphere.ts), [SceneInteraction.ts](src/SceneInteraction.ts) |
| 리액터·스케일 패널 | [SceneWorlds.ts](src/SceneWorlds.ts), [SceneScaleSurface.ts](src/SceneScaleSurface.ts) |

모듈 간 연결과 장면 수명은 [구조 문서](docs/architecture.md)에 정리했습니다. 영상과 아이콘을 바꿀 때는 [자산 문서](docs/README.md#자산과-메타데이터)도 확인하세요.

## 검사

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Playwright는 탐색·상세 화면·스크롤 왕복·영상 재생과 실패 처리·WebGL 대체 화면을 검사합니다. 실제 셰이더의 픽셀과 모델 행렬을 읽는 검사도 포함합니다. 실행 환경과 최근 결과는 [검증 안내](docs/testing.md)에 있습니다.

모바일 화면은 Chromium 에뮬레이션으로 확인했습니다. 실제 Safari/iOS와 저사양 기기의 장시간 실행은 아직 검증하지 않았습니다. WebGL을 사용할 수 없으면 CSS 배경과 본문·탐색을 유지합니다.

## 참고와 자산

[Active Theory](https://activetheory.net/)의 공간 구성과 인터랙션을 참고했습니다. 제휴 프로젝트는 아니며, 해당 사이트의 소스·로고·모델·영상을 앱 자산으로 사용하지 않습니다. 이 저장소의 모델과 영상은 코드와 생성 스크립트로 만듭니다. 비교 문서의 원본 캡처는 관찰 근거입니다.

Aether Studio와 프로젝트는 가상 콘셉트입니다. `hello@aether.example`은 예시 주소이며 Contact는 이메일 앱을 엽니다. 실제 문의를 받으려면 연락처를 교체해야 합니다.

구현과 문서 작성에는 AI를 사용했습니다. 코드·리뷰·실행 결과를 바탕으로 정리한 수정 과정은 트러블슈팅 문서에 남겼습니다.

글꼴과 패키지 라이선스 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.
