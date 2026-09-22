# 트러블슈팅 문서와 보관 묶음

[전체 문서 시작](index.md) · [이슈 색인](issue-index.md) · [다음 프로젝트 가이드](runbook.md) · [출처·검증 자료](sources.md)

기본 6편은 PR #17 병합 `cfee1e1`까지의 구현 기록이다. 후속 변경은 별도 부록으로 추가하며 과거 실패와 측정값을 소급 변경하지 않는다. 현재 저장소는 공개되어 있다. 초기 검증 문서의 비공개 저장소 설명은 초기 배포 당시의 이력이다.

## 원본 구조

```text
docs/troubleshooting/
  index.md       전체 안내와 읽는 순서
  issue-index.md 증상별 이슈·해결·근거 색인
  runbook.md     다음 구현의 결정표·검증·측정 템플릿
  sources.md     기준 버전·코드·캡처·외부 참고 자료
  posts/         주제별 게시 원고와 후속 부록
  images/        설명용 PNG 도식·측정 기록 기반 차트
docs/screenshots/
                 기존 실제 실행 캡처 원본
```

원본 Markdown은 상대 경로로 이미지를 참조한다. Markdown 파일만 다른 폴더에 복사하면 이미지가 빠질 수 있으므로 저장소 전체나 아래 보관 묶음을 사용한다.

## 릴리스 보관 형태

생성기는 다음 형태로 보관본을 만든다. 게시된 파일은 저장소 [Releases](https://github.com/okorion/aether-studio/releases)에서 확인한다.

| 파일·폴더 | 용도 |
| --- | --- |
| `Aether-3D-Troubleshooting.html` | 문서와 이미지 바이트를 한 파일에 담은 읽기용 보관본. 본문 열람은 오프라인 가능하며 외부 근거 링크는 인터넷이 필요하다. |
| `Aether-3D-Troubleshooting.zip` | HTML, Markdown, 실제 이미지 파일, manifest를 함께 이동·백업하는 묶음. |
| `portable/` | 로컬 이미지 파일을 참조하는 Markdown. ZIP 구조를 유지해 사용한다. |
| `velog/` | 게시용 Markdown. 본문은 원본과 같고 이미지·근거 주소를 고정 커밋의 공개 URL로 바꾼다. |
| `images/` | 실제 캡처와 도식 원본 파일. Velog에 직접 이미지 업로드할 때도 사용한다. |
| `manifest.json` | 구현 기준, 문서·이미지의 파일 경로와 SHA-256, 자산 종류. |

HTML 안에 포함된 이미지와 ZIP의 실제 이미지가 같은 자료인지 manifest로 대조할 수 있다. 도식은 새로 만든 설명 자료이고, 실제 캡처는 당시 실행 결과다. 파일에 들어 있다는 이유만으로 현재 버전의 화면이나 새 측정이 되는 것은 아니다.

## Velog에 직접 게시할 때

1. 원하는 편의 게시용 Markdown을 에디터에 붙여 넣고 제목·코드·표·그림을 미리보기에서 확인한다.
2. 공개 이미지 링크를 그대로 쓰거나, 보관 묶음의 실제 이미지 파일을 Velog에 업로드한 뒤 해당 주소만 교체한다. 로컬 상대 경로나 HTML의 data URI를 그대로 붙이는 방식에 의존하지 않는다.
3. 게시 전 당시 버전·캡처 조건·미확인 범위를 포함한 캡션을 유지한다. 게시한 글의 주소는 필요할 때 이 원본에 별도로 연결한다.

기본 보관 위치는 공개 GitHub 저장소와 릴리스다. Google Drive에는 필요하면 같은 ZIP을 복사해 추가 백업할 수 있다. Drive나 Velog에 저장·게시됐다는 결과는 실제 업로드를 확인하기 전까지 추정하지 않는다.

## 재생성

문서와 이미지를 커밋한 뒤 [`build-troubleshooting.py`](../../scripts/build-troubleshooting.py)의 `--asset-ref`에 해당 커밋을 전달한다. 기본 6편의 구현 기준은 `cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d`다. 후속 부록의 기준을 추가한 경우에는 생성 결과의 링크와 manifest에서 각 버전이 맞는지 다시 확인한다.

도식 생성기는 [`build-troubleshooting-figures.py`](../../scripts/build-troubleshooting-figures.py)다. 재생성은 문서 포장 작업이며 과거 GPU 측정을 다시 수행하는 명령이 아니다. 빌드가 끝나면 HTML의 이미지 표시, 코드 줄바꿈, 내부 링크와 ZIP 무결성을 확인한다.
