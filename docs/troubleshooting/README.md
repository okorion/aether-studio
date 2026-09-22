# 트러블슈팅 원고와 보관 파일

[글 목록](index.md) · [이슈 색인](issue-index.md) · [구현·검증 가이드](runbook.md) · [출처](sources.md) · [편집 기록](editorial/README.md)

1~6편은 PR #17, 7편은 PR #18의 기록이다. 이번 문체 개정에서도 기존 캡처와 측정 자료는 그대로 사용한다. 초판 릴리스는 보존하고 개정판을 별도로 만든다.

## 원본 위치

| 경로 | 내용 |
| --- | --- |
| `posts/` | Velog 게시 원고 7편 |
| `images/` | 설명 도식·측정 차트 7개 |
| `editorial/` | 문체 기준, 조사 출처, 그림 문구·배치 기록 |
| `../screenshots/` | 실제 실행 캡처 원본 |

원본 Markdown은 상대 경로로 이미지를 연결한다. 저장소 밖으로 옮길 때는 아래 ZIP의 구조를 유지한다.

## 릴리스 구성

게시된 파일은 [Releases](https://github.com/okorion/aether-studio/releases)에서 받는다.

| 파일·폴더 | 용도 |
| --- | --- |
| `Aether-3D-Troubleshooting.html` | 문서와 이미지를 담은 파일. 본문은 오프라인에서 읽고 외부 근거 링크는 인터넷에 연결해 연다. |
| `Aether-3D-Troubleshooting.zip` | HTML, Markdown, 이미지, 편집 기록, manifest를 묶은 보관본. |
| `portable/` | ZIP 안의 이미지와 연결한 Markdown. |
| `velog/` | 원본과 같은 본문에 고정 커밋의 이미지·근거 URL을 적용한 게시용 Markdown. |
| `images/` | 실제 캡처와 설명 도식. 직접 업로드할 때 사용하는 파일. |
| `editorial/` | 개정 기준, 스킬 사본, 그림 문구 목록. |
| `manifest.json` | 기준 커밋과 파일별 SHA-256. |

## Velog 게시 순서

1. `velog/`의 원고를 에디터에 붙여 넣고 제목·표·코드·그림을 확인한다.
2. 이미지 링크를 그대로 쓰거나 `images/`의 파일을 업로드해 주소를 바꾼다.
3. 캡션의 버전·촬영 조건을 유지하고 직접 게시한다.

## 재생성과 검사

도식은 [`build-troubleshooting-figures.py`](../../scripts/build-troubleshooting-figures.py)로 만든다. 모든 텍스트가 지정 영역에 들어오는지 검사한 뒤 PNG와 문구 목록을 저장한다.

문서와 이미지를 커밋한 뒤 [`build-troubleshooting.py`](../../scripts/build-troubleshooting.py)의 `--asset-ref`에 커밋 SHA를 넘긴다. 과거 코드 링크의 기본 기준은 `cfee1e1036f50482fd24e2e2c3239c67b1d2bb4d`다.

생성 후에는 파일 해시, 게시용 본문, 내부 링크, ZIP 무결성을 검사한다. HTML은 PC·모바일 크기에서 오프라인으로 열어 이미지와 줄바꿈을 확인한다. 이 절차는 문서 검수이며 GPU 성능 재측정은 포함하지 않는다.
