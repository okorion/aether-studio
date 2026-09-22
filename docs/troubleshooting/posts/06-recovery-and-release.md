# WebGL 오류 뒤에 남겨야 했던 화면

장면 모듈 요청을 차단하자 본문까지 사라졌다. 정상 네트워크에서 장면만 확인할 때는 보이지 않던 문제였다. 오류 경계를 좁히는 작업부터 테스트 중 새로고침, 느린 CI, 아이콘과 문서 링크까지 렌더링 바깥에서 수정한 내용을 모았다.

## 장면 모듈의 오류 경계

3D 장면은 동적으로 불러온다. 독립 레드팀 검수에서 이 요청을 차단했더니 오류가 앱 전체로 전파됐다. `SceneBoundary`를 장면 주변에 두고 실패하면 CSS 배경을 표시하도록 바꿨다. 본문과 Work·Contact는 그대로 탐색할 수 있다.

다음은 `SceneBoundary.tsx`의 핵심 부분이다.

```tsx
static getDerivedStateFromError() {
  return { failed: true }
}

componentDidCatch() {
  this.props.onUnavailable()
}

render() {
  return this.state.failed ? null : this.props.children
}
```

React 오류 경계가 잡는 범위 밖의 실패도 있다. 이벤트, 영상 재생 Promise, 렌더 루프는 각 코드에서 따로 처리했다. 데스크톱·모바일 크기에서 장면 모듈 요청을 실제로 차단해 탐색이 남는지 검사했고, WebGL 미지원 경로도 별도로 확인했다.

## CSS 링과 WebGL 링의 중복

대체 배경을 너무 늦게 숨기면 링이 두 개로 보이고, 너무 일찍 숨기면 장면 준비 중 화면이 빈다. 실제 렌더 준비 상태에 맞춰 canvas와 대체 배경을 전환했다. 장면 실패나 컨텍스트 손실이 발생하면 다시 대체 배경을 보여준다.

짧은 뷰포트에서 히어로 문구가 잘리는 문제, Work·Contact로 이동한 뒤 이전 섹션 일부가 남는 문제도 이때 수정했다.

![초기 버전의 소프트웨어 렌더링 화면](../../screenshots/software-home.png)

*초기 버전의 실제 소프트웨어 WebGL 화면. CSS 대체 화면은 아니다.*

## 컨텍스트 복원 뒤의 재생 상태

WebGL 자원을 다시 만들 때 스크롤과 선택한 시점을 유지해야 했다. `webglcontextlost`에서 기본 동작을 막고 예약된 렌더를 취소했다. 준비 작업의 세대 번호도 바꿨다. 복원 시에는 환경·해상도를 설정하고 장면을 다시 준비한다.

```ts
// 개념을 줄인 예시
function onContextLost(event: Event) {
  event.preventDefault()
  contextLost = true
  preparationGeneration++
  cancelScheduledRender()
}

async function prepare() {
  const generation = ++preparationGeneration
  await prepareGpuResources()
  if (disposed || contextLost || generation !== preparationGeneration) return
  requestRender()
}
```

이전 준비 작업이 늦게 끝나도 세대 번호가 다르면 렌더를 시작하지 않는다. 실제 코드에는 영상 동기화와 대체 화면 전환도 포함된다.

`WEBGL_lose_context`로 컨텍스트 손실을 만들었다. 브라우저 검수에서는 스크롤 40%의 장면·미디어 복귀와 canvas 중복 여부를 확인했다. 자동검사의 탭 숨김은 `document.hidden`과 이벤트를 모의했으며, 영상 위치 보존은 `video.spec.ts`에서 검사했다. 선택 시점과 일부 애니메이션 상태까지 확인한 범위다.

![WebGL·미디어 오류의 복구 경로](../images/recovery.png)

*개념도. DOM, WebGL, 미디어가 각각 처리하는 실패와 복귀 검사 항목.*

## 테스트 보고서가 일으킨 새로고침

Playwright가 HTML 보고서를 저장할 때마다 Vite가 파일 변경을 감지했다. 검사 도중 전체 새로고침이 발생한 이유였다.

산출물을 `.qa/`로 모으고 개발 서버의 감시 대상에서 제외했다.

```ts
server: { watch: { ignored: ['**/.qa/**'] } }
```

CI는 빌드한 production 파일을 사용한다. 보고서 저장이 앱 실행 상태를 바꾸지 않도록 실행 환경도 분리했다.

## 느린 렌더링으로 시간 초과된 클릭

Linux CI에서는 Work 링크와 자산 요청이 정상이었는데 클릭이 끝나지 않았다. trace에서 화면 갱신 간격이 최대 10.21초였다. Playwright가 요소의 안정성을 기다리는 동안 다음 프레임이 늦게 도착하고 있었다.

소프트웨어 렌더러에서는 DPR을 0.75로 낮추고 입자 상한과 환경 반사 비용을 줄였다. 프레임이 끝난 뒤 50ms의 입력 처리 여유도 뒀다. WebGL 브라우저끼리 자원을 다투지 않도록 worker는 1개로 고정했다. 당시 입자 상한 2,000개는 초기 버전의 설정이다.

로컬 SwiftShader에서 Work 클릭은 71ms로 관측됐다. 다만 이후 PR #17에서도 Work 클릭의 10초 제한을 재시도까지 넘긴 CI 실행이 있었다. 같은 앱 코드의 직전 CI와 로컬 두 실행은 통과했고, 실패 작업도 코드 변경 없이 다시 실행해 통과했다. 원인이 해결됐다고 닫을 수 없는 시간 초과 기록으로 남겼다.

## 렌더를 기다린 뒤 넣은 입력

초기 검수에는 GPU 캡처를 동시에 실행하거나, 입력 후 새 프레임이 나오기 전에 화면을 비교하는 문제가 있었다. 렌더 완료를 기다리고 실제 wheel·pointer·클릭을 넣도록 순서를 바꿨다.

좌표·행렬 검사에서는 이동 방향과 복귀를, 픽셀 비교에서는 셰이더 반응을, 화면 캡처에서는 겹침과 배치를 확인했다. 상세 화면은 Escape로 닫은 뒤 원래 카드로 초점이 돌아오는지, 스크롤 잠금이 풀리는지 검사했다. 다음 프로젝트의 제목과 본문도 확인했다.

초기 카드 설명과 전경 프로젝트가 다른 부분은 공통 문구로 고쳤다. 스케일 패널의 시각 문구를 추가할 때는 접근 가능한 DOM 설명도 남겼다.

![초기 프로젝트 상세 화면](../../screenshots/desktop-project.png)

*초기 버전의 실제 상세 화면. 초점·Escape 동작은 `experience.spec.ts`의 입력 검사에 기록했다.*

## 아이콘 생성과 공유 이미지 생성의 분리

아이콘과 OG 카드를 같은 스크립트로 만들고 있었다. 파비콘만 바꾸는 작업에서 기존 OG 카드까지 재생성되지 않도록 기본 실행을 아이콘 생성으로 좁혔다. 공유 이미지는 `--share-card`를 지정해야 만든다. 기존 OG 카드의 SHA-256도 비교했다.

아이콘 URL에는 이전 캐시와 구분할 버전 쿼리를 붙였다.

```html
<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=2" />
<link rel="manifest" href="/site.webmanifest?v=2" />
```

SVG, 16·32px PNG, ICO 내부 크기, Apple·maskable 아이콘을 확인했다. 운영 배포에서 HTML과 manifest가 가리키는 자산 9개를 요청해 로컬 파일과 비교했다. 원형으로 잘라도 심벌이 남도록 중앙 안전 영역 안에 배치했다.

![기존 아이콘의 실크기 비교](../../screenshots/brand/before.png)
![변경한 아이콘의 실크기 비교](../../screenshots/brand/after.png)

*같은 Chromium 본문에서 같은 크기로 렌더한 실제 아이콘. 탭 바 캡처는 아니며 OG 이미지는 유지했다.*

## 제목 변경으로 끊긴 문서 주소

장면 이름을 본 컬럼·리액터 챔버로 정리하면서 문서 제목도 바꿨다. GitHub는 제목으로 fragment를 만들기 때문에 기존 `#...` 링크가 끊겼다.

리뷰에서 발견한 뒤 변경된 제목 14개에 이전 앵커를 추가했다.

```html
<a id="지하-공간과-조명-영상-정리"></a>

# 리액터 챔버와 조명 영상 정리
```

GitHub가 렌더한 이전 제목 ID와 새 앵커를 대조했다. 문서 안에서 새로 생성한 링크만 검사했으면 외부 북마크의 문제는 놓쳤을 것이다.

이 글의 검증 환경은 Chromium과 모바일 에뮬레이션 중심이다. 실제 Safari/iOS·저사양 GPU·장시간 발열 검사는 남아 있다. 초기 axe 검사에서 위반이 검출되지 않은 결과도 전체 접근성 검증을 대신하지는 못한다.

[실패 격리·CI 기록](../../verification.md) · [메타데이터](../../metadata.md) · [SceneBoundary](../../../src/SceneBoundary.tsx) · [장면 생명주기](../../../src/Scene.tsx) · [Vite 설정](../../../vite.config.ts) · [사용자 흐름 검사](../../../tests/experience.spec.ts) · [메타데이터 검사](../../../tests/metadata.spec.ts)

관련 변경은 `1860ad4`, `3fbb045`, `be28f58`, `7071e5f`다. PR #17의 CI 재실행은 [PR 기록](https://github.com/okorion/aether-studio/pull/17)에 남아 있다.
