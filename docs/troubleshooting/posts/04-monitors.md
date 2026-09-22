# Three.js 유리 모니터의 DPR 오류와 영상 재생 관리

본 컬럼 옆 모니터 여섯 장에는 두 종류의 영상이 반복된다. 유리 뒤로는 본과 입자가 굴절되어 보인다. 스크롤을 멈추면 모니터는 멈추고 영상은 계속 재생된다.

이 구간을 만들면서 고해상도 화면의 굴절 캡처가 어긋났다. 모니터를 떠났다가 돌아올 때는 이전 `play()` 호출의 결과가 늦게 도착하는 경우도 처리해야 했다.

| 영상 적용 전 | 영상 적용 후 |
| --- | --- |
| ![영상 모니터 적용 전](../../screenshots/monitors/before-40.jpg) | ![영상 모니터 적용 후](../../screenshots/monitors/after-40.jpg) |

*1440×900, DPR 1, 스크롤 40%. 영상·재질을 함께 바꾼 당시 화면이며 조명 시각은 고정하지 않았다.*

## 굴절 캡처에 두 번 적용된 DPR

유리 배경은 장면을 `RenderTarget`에 한 번 그려서 여섯 모니터가 공유한다. RenderTarget은 화면 대신 렌더 결과를 담아 두는 GPU 버퍼다.

캡처 크기는 `getDrawingBufferSize()`로 구했다. 이 함수가 반환하는 값은 이미 DPR이 적용된 물리 픽셀 크기다. 그런데 타깃을 설정한 뒤 같은 값으로 `setViewport()`를 호출하면서 DPR이 한 번 더 적용됐다.

![DPR 중복 적용과 렌더 타깃 크기](../images/render-target.png)

*단위 설명용 예시. CSS 800×500, DPR 2는 프로젝트의 고정 해상도가 아니다.*

타깃 크기를 물리 픽셀로 정한 다음 타깃 자체의 viewport를 사용하도록 고쳤다.

```ts
// 캡처 크기와 렌더링 부분을 줄인 예시
renderer.getDrawingBufferSize(drawingSize)
const width = Math.max(1, Math.min(720, Math.floor(drawingSize.x)))
const height = Math.max(
  1,
  Math.round(width * drawingSize.y / Math.max(1, drawingSize.x)),
)

target.setSize(width, height)
renderer.setRenderTarget(target)
renderer.render(scene, camera)
```

DPR 1.5와 2에서 실제 draw 직전의 `gl.VIEWPORT`를 읽었다. 검사용 타깃의 `[0, 0, 720, 540]`이 그대로 사용됐다. 크기 계산만 검사해서는 renderer가 추가한 배율을 찾을 수 없었다.

## 캡처 도중 바뀐 상태의 복원

배경을 캡처할 때는 모니터를 잠깐 숨긴다. 모니터가 자기 배경에 다시 찍히기 때문이다. 렌더 타깃과 `autoClear`, XR 상태도 잠시 바뀐다.

이 구간에서 예외가 나도 원래 화면으로 돌아오도록 `finally`에서 상태를 복원했다.

```ts
// 복원 구조를 줄인 예시
const previousTarget = renderer.getRenderTarget()
const previousVisible = monitors.visible

try {
  monitors.visible = false
  renderer.setRenderTarget(backgroundTarget)
  renderer.render(scene, camera)
} finally {
  monitors.visible = previousVisible
  renderer.setRenderTarget(previousTarget)
}
```

실제 코드는 cube face, mip level, XR 상태도 보존한다. 캡처에 실패하면 오래된 배경을 비우고 절차적 유리 표현을 사용한다. 매 프레임 같은 실패를 반복하지 않도록 실패 상태도 저장했다. 이 경로는 렌더 오류를 주입해 검사했다.

굴절 배경을 그리다가 수면 반사가 전체 장면을 다시 그리는 중복도 있었다. 굴절 캡처 동안만 수면 반사를 제외하고 끝나면 복원했다.

## 여섯 모니터가 공유하는 영상 두 편

영상 종류에 맞춰 미디어 요소와 `VideoTexture`를 두 개만 만들었다. 처음에는 `preload='none'`으로 두고 `src`도 연결하지 않는다. 모니터 구간에 진입하면 선택한 형식 하나를 내려받는다. 모션 감소 상태로 처음 접속하면 영상 요청을 하지 않는다.

재생 조건은 다음과 같다.

| 상태 | 영상 동작 |
| --- | --- |
| 모니터 구간에서 스크롤 정지 | 재생 유지 |
| 다른 화면·상세 dialog·숨긴 탭 | 일시정지 |
| 모션 중지 | 일시정지 |
| 모니터 구간 복귀 | 같은 객체와 재생 위치 사용 |

![모니터 영상 재생](../../screenshots/monitors/film.gif)

*실제 화면의 시간 변화를 묶은 GIF.*

장면을 다시 만들 때도 미디어는 재사용한다. 모션 설정을 바꿨다는 이유로 영상을 0초부터 시작하지 않게 했다. 미디어 사용을 완전히 끝낼 때 이벤트와 텍스처, URL을 해제한다.

## 늦게 끝나는 `play()` 호출

`video.play()`는 Promise를 반환한다. 완료되기 전에 사용자가 화면을 떠났다가 다시 들어올 수 있다. 오래된 호출의 결과가 현재 재생을 건드리지 않도록 시도마다 번호를 붙였다.

```ts
// SceneVideo.ts의 완료 처리
const currentAttempt = ++attempt

void video.play().then(() => {
  if (disposed || !active) {
    video.pause()
    return
  }
  if (currentAttempt !== attempt || failed()) return
  loaded()
})
```

거부 경로도 별도로 처리한다. 다운로드·디코딩 오류나 자동 재생 차단이 발생하면 대체 셰이더를 표시한다. 같은 미디어 객체에서는 자동 재시도를 반복하지 않는다.

빠른 이탈·복귀, 해제 후 완료, `NotAllowedError`를 실패 주입으로 검사했다. 실제 브라우저에서는 일시정지한 350ms 동안 영상 시간이 유지되고, 복귀 전후 객체·소스·로드 횟수가 같은지 확인했다. 조명 영상의 일부 수명 검사는 모의 DOM을 사용했다.

## VP8 영상의 규격과 화질

첫 진입 지연을 분석한 뒤 VP8을 지원하는 환경에서는 WebM을 선택했다. 지원하지 않거나 지원 조회가 실패하면 H.264 MP4를 사용한다. 선택한 WebM이 실패했다고 MP4까지 연속 요청하지는 않는다.

두 형식은 모두 640×400, 24fps, 10초, 무음이다. 손실 재인코딩이므로 규격과 별개로 화질도 비교했다.

| 항목 | 결과 |
| --- | ---: |
| 기존 MP4 두 편 합계 | 2,101,778 bytes |
| 채택한 VP8 두 편 합계 | 2,070,979 bytes |
| 크롬 영상 원본 대비 SSIM | 0.977189 |
| 오로라 영상 원본 대비 SSIM | 0.984363 |

SSIM은 영상의 구조적 차이를 비교하는 값이다. 두 파일의 480프레임을 끝까지 디코딩하고, 모니터 재질과 합쳐진 모습도 확인했다. 영상은 자체 수식으로 생성해 사이트와 같은 CDN으로 제공한다. 원본·결과 해시는 manifest에 기록했다.

## 조명 영상의 sRGB 변환

조명 영상은 `THREE.SRGBColorSpace`로 설정했다. 리뷰에서는 커스텀 셰이더의 sRGB→linear 변환이 중복일 수 있다는 의견이 나왔다.

```ts
film.colorSpace = THREE.SRGBColorSpace
```

설치된 Three r186의 업로드 경로를 확인했다. 이 환경의 `VideoTexture`는 `RGBA8`로 올라갔다. 기본 `map` 재질은 셰이더에서 변환하지만 커스텀 `uLightFilm` 샘플러에는 그 처리가 붙지 않았다.

MP4를 2.52초와 6.72초에 멈추고 기본 재질과 비교했다.

| 비교 | 픽셀 결과 |
| --- | --- |
| 명시적 변환을 둔 조명 셰이더 ↔ Three 기본 map | 두 프레임 모두 평균·최대 RGB 오차 0 |
| 명시적 변환을 제거한 대조군 | 중간톤이 평균 약 57~59/255 더 밝음 |
| 확인한 영상 업로드 내부 형식 | `RGBA8`, `SRGB8_ALPHA8` 업로드 없음 |

따라서 변환은 유지했다. 이 결과는 Three r186·SwiftShader의 해당 영상 경로에서 확인한 값이다. 다른 버전에서 색이 어긋나면 업로드 형식과 샘플링 경로부터 다시 확인해야 한다.

실제 Safari/iOS의 코덱 선택과 백그라운드 복귀, 장시간 발열·메모리는 아직 확인하지 못했다.

[모니터·입력 검사](../../monitor-cinema.md) · [굴절 타깃 검사](../../spine-monitors.md) · [영상 생성·화질](../../media-sources.md) · [색 공간 측정](../../performance/video-color-v13.json)
