# 모니터 전환 성능 증거의 수집·집계 방법

[증거 JSON](monitor-performance.json)은 PR #15의 원본 계측 보고서 30개를 요약한다. `.qa/performance-v14`는 실제 수집 경로이며 PR 번호와 별개다. 수집일은 2026-09-22이다. [성능 분석 본문](../monitor-transition-performance.md)과 함께 읽는다.

## 범위와 소스 고정

| 자료 | 개수 | 용도 |
| --- | ---: | --- |
| `baseline/*.json` | 18 | 기본·영상 차단·codec 등 원인 분리, 조건별 2회 |
| `traced-baseline/normal-0.json` | 1 | Chrome trace를 켠 별도 실행 |
| `final-entry-isolated/*.json` | 3 | 최종 소스의 독립적인 첫 모니터 진입 |
| `full-before/*.json`, `full-after/*.json` | 각 4 | 전후 각각 새 브라우저 2회, 회차마다 정방향·역방향 |

`final-entry`는 lint 작업이 겹쳤으므로 전부 제외했다. 원본 JSON과 대용량 trace는 `.qa`에 그대로 보존하며 Git에는 이 요약과 원본 bytes의 SHA-256만 넣는다. 원본이 없는 환경에서는 해시로 원시 trace를 복원하거나 재분석할 수 없다.

변경 전 소스는 `2d34128767db976a4eab65ef13296dcba496cd68`, 변경 후 소스는 `6da842680c3d88f8192a5b12c66c211a3bb4966f`이다. 최종 측정은 `cdb7bc3`에 visibility 변경이 합쳐진 작업 트리에서 수행됐으며, 측정 담당자가 그와 동일한 runtime 소스를 `6da8426`으로 커밋했음을 확인했다. JSON에 해당 소스 6개와 실제 빌드 자산의 SHA-256을 기록했다. 최종 대상은 `Scene-Du2IMWZi.js`, `index-DSjGQt4l.js`이며 소스 파일 bytes도 커밋과 일치한다.

## 실행 환경과 재현 범위

Windows의 RTX 2060 SUPER, ANGLE D3D11, CSS 1440×900, DPR 1에서 Playwright Chromium을 `--use-angle=d3d11`로 실행했다. CDP의 `Network.setCacheDisabled(true)`를 사용했다. 각 보고서에 실제 renderer 문자열, URL, ready 시각과 canvas 상태를 보존했다. 설치된 Playwright 버전은 보존하지만 실행 브라우저의 정확한 버전은 원본에 수집되지 않았다.

페이지의 `canvas[data-render-state="ready"]`를 기다린 뒤 1초 후 계측을 시작했다. `ready.ms`는 navigation 이후 `performance.now()` 시각이다. 첫 진입은 7초 동안 실제 스크롤 위치를 0→36.5%로 선형 이동한다. 전체 흐름은 19초 동안 0→99%, 800ms 대기 후 같은 브라우저에서 19초 동안 99→0%로 이동한다. 각 반복은 새 브라우저·컨텍스트에서 시작하므로 역방향만 이미 재생한 영상 상태를 이어받는다.

현재 보관된 계측 스크립트와 해시는 JSON의 `instrumentation.sources`에 있다. 다음은 독립된 로컬 production 서버와 브라우저를 사용하는 재현 명령의 예다. 명령 자체는 이 증거 정리 중 실행하지 않았다. 실험 라벨은 새 폴더를 사용해 원본 측정을 보존한다.

```powershell
node .qa/performance-v14/diagnose.mjs normal 3 reproduce-entry http://127.0.0.1:4173/
node .qa/performance-v14/travel.mjs normal 2 reproduce-travel http://127.0.0.1:4173/
$env:TRACE='1'
node .qa/performance-v14/diagnose.mjs normal 1 reproduce-trace http://127.0.0.1:4173/
Remove-Item Env:TRACE
```

최종 독립 측정과 전체 전후 측정은 다른 GPU 브라우저 작업 없이 수행했음을 측정 담당자가 확인했다. 인터넷 CDN, 모바일, 페이지 전체 초기 로딩, 모든 GPU의 성능을 대표하는 측정은 아니다. GL wrapper·query·영상 콜백 관측 비용도 존재한다. trace를 켠 1회는 다른 반복과 합치지 않는다.

## modes

| 조건 | 실제 계측 변경 |
| --- | --- |
| `normal` | 해당 빌드를 그대로 실행 |
| `no-monitor` | 두 모니터 MP4 요청 abort |
| `no-light` | `light-projection.mp4` 요청 abort |
| `single-monitor` | `aurora-bloom.mp4`만 abort |
| `still-monitor` | 모니터 `play()`를 loadeddata 후 pause·resolve로 대체. decode 자체를 없앤 실험은 아님 |
| `skip-refraction` | 720×450 framebuffer draw를 GL 실행 직전에 생략. 같은 해상도의 다른 pass도 포함될 수 있음 |
| `software-video` | `--disable-accelerated-video-decode` 추가 |
| `webm` | 같은 MP4 요청 URL에 실험용 VP9 WebM bytes를 route fulfill |
| `vp8` | 같은 MP4 요청 URL에 실험용 VP8 WebM bytes를 route fulfill |

`skip-refraction`은 draw 카운터를 증가시킨 **뒤에** 실제 GL 호출을 생략한다. 따라서 해당 조건의 카운터는 실행된 draw가 아니라 호출 시도 수이며, 다른 조건과 실제 draw 절감량으로 비교하지 않는다. codec 실험의 이벤트 URL은 `.mp4`여도 응답 bytes가 다르다. 실험용 VP8와 최종 balanced VP8의 bytes도 다르므로 각각 해시를 보존한다.

## 집계 기준

세 전환 구간은 요청 스크롤 `p`의 반개구간 `[.23,.31)`, `[.59,.69)`, `[.69,.78)`이다. 실제 모델은 관성으로 지연될 수 있다. 15 렌더 프레임마다 갱신되는 `renderP`를 구간 분류나 draw 집계 기준으로 쓰지 않았고, 관측 범위만 별도 보존했다.

RAF wrapper는 앱 렌더뿐 아니라 스크롤 드라이버 등 모든 RAF callback에 GPU query를 생성한다. 스크롤만 처리한 callback에는 draw가 없어 이를 GPU 렌더 시간에서 제외한다. callback과 query는 동일하게 저장된 시작 시각·스크롤 값 `(t,p)`가 정확히 같고 양쪽이 하나인 경우에만 연결한다.

```python
render_callbacks = [c for c in callbacks if c['draws'] > 0]
# (t,p)별 원본 callback과 query가 각각 1개인지 먼저 검사한다.
render_gpu = [query_for(c['t'], c['p']) for c in render_callbacks
              if unique_exact_query_exists(c['t'], c['p'])]
average_draws = sum(c['draws'] for c in render_callbacks) / len(render_callbacks)
```

모든 보고서에서 확장 지원·`disjoint=false`가 확인됐고, 렌더 callback의 모호한 매칭은 0개다. 각 보고서 마지막 렌더 query 1개는 종료 시 아직 회수되지 않았다. 역방향 파일마다 이전 회차의 pending query 2개가 섞여 있어 현재 callback에 매칭되지 않는 항목으로 제외했다. `gpuValidityAndMatching`에 유효·제외·미회수 수를 남겼다. query의 `t`는 결과를 읽은 시각이 아니라 callback 시작 시각이다.

draw 합계에는 모니터 배경 캡처·반사·후처리를 포함한 해당 callback의 GL draw 호출이 모두 들어간다. `sum(draws)/렌더 callback 수`를 평균으로 보존하며, 표본 수 차이나 중앙값 비율로 총 렌더 비용을 대신하지 않는다. `frames.draws`는 갱신 간격이 있는 canvas 진단값이므로 집계에 쓰지 않는다. 원본 `summary`는 변경 없이 별도로 보존했다.

CPU 시간은 callback 진입부터 복귀까지의 `performance.now()` 차이다. 렌더·비렌더·전체 callback 분포를 분리했다. GPU 시간은 이 WebGL context의 `TIME_ELAPSED_EXT` query이며 영상 decoder, compositor, 디스플레이 대기를 모두 포함하는 총 GPU 시간이 아니다. 전후 각각 반복 2회의 표본을 방향별·양방향별로 풀링했으며, `pooledFullTravel`에서 원본 보고서 ID와 함께 확인할 수 있다.

정렬한 표본 `a`의 길이가 `n`이면 원본 스크립트와 같이 중앙값은 `a[floor(n×.5)]`, p95는 `a[floor(n×.95)]`다. 보간하지 않았고 원본 정밀도로 계산한 뒤 파생 수치만 소수 6자리로 반올림했다. 각 구간의 RAF 최대·중앙값·p95, render callback 수, draw 합계·평균·분포, CPU·GPU 분포, quality 분포를 보존했다.

## 영상과 최대 프레임 주변

각 파일·이벤트 종류별 첫 media 이벤트, 첫 `video-frame`, 첫 영상 텍스처 업로드를 보존했다. CDP player의 decoder·codec·해상도·bitrate 등 관련 속성은 유지하고 불투명 ID만 local index로 바꿨다. 원본에 미수집된 `players`는 명시적으로 unavailable이다. CDP 속성에는 파일 URL 연결 정보가 없으므로 같은 해상도의 두 모니터를 특정 파일에 임의 매칭하지 않는다.

`video-frame.processing`은 `requestVideoFrameCallback`의 `metadata.processingDuration` 원본이며 **초 단위**다. 다른 `ms` 필드와 혼동하지 않는다. media 이벤트 listener는 계측 시작 전의 load도 기록하지만 영상 프레임·GL 이벤트는 recording 구간만 기록한다. 전체 흐름의 역방향은 이벤트 배열을 비워 시작하므로 그 회차에서 관측되지 않은 load 이벤트가 없다.

최대 RAF interval의 구간은 `[frame.t-frame.ms, frame.t]`이며 앞뒤 150ms의 원본 frame·event·callback·query를 보존했다. 최대값이 같으면 원본 배열의 첫 항목을 선택한다. 첫 모니터 loadstart 앞 100ms~뒤 350ms도 별도 보존해 최종 실행의 최대 프레임이 모니터 진입 밖에 있더라도 첫 영상 처리 구간을 확인할 수 있다. 어떤 이벤트의 시간적 근접만으로 그 이벤트의 인과 기여도를 확정하지 않는다.

## trace

별도 원본 trace의 SHA-256, 파일 크기, 전체 이벤트 수와 수집 범주를 JSON에 기록했다. `ph=X`인 양의 complete span만 집계하며 비동기 begin/end를 임의로 합치지 않았다.

- `D3D11VideoDecoder::PictureBufferGPUResourceInitDone`: 최대 31.038ms.
- `D3D11VideoDecoder::DoDecode`: 최대 31.036ms. 위 span과 같은 GPU thread에서 거의 완전히 겹치므로 두 시간을 더하면 안 된다.
- `FireAnimationFrame`: 최대 44.831ms. 이 이벤트는 위 decoder span보다 약 2.223초 뒤에 발생해 같은 프레임의 비용으로 합산할 수 없다.

Chrome trace timestamp는 마이크로초 단위이고 performance 계측과 기준점을 연결하는 정보를 수집하지 않았다. 두 clock을 직접 맞추지 않는다. 선택한 세 span의 분포·최대값·30ms 초과 원본 시각을 보존하되, decoder와 프레임 지연의 정확한 인과 비율을 주장하지 않는다.

관측된 draw 감소와 GPU 시간 감소는 다른 결과다. 일부 구간은 draw 감소와 GPU p95 상승이 함께 나타났다. 초기 최대 99.9/83.3ms와 최종 독립 3회의 최대 16.8ms는 이 실행의 관측값이며, 일반적인 모든 프레임의 상한이나 보장된 개선율이 아니다.
