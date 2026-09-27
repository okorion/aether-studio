# 저장소 문서 작성 기준

README는 사이트를 소개하고 실행할 수 있게 안내한다. GitHub About의 description은 사용자 요청에 따라 `Interactive 3D`로 고정하며 부연 문구를 덧붙이지 않는다. 구현 단계·PR·검사 횟수를 첫인상으로 내세우지 않는다. 기능은 사용자의 조작과 화면 변화로 설명하고, 개발에 필요한 값은 해당 구조·검증 문서에 둔다.

## 문서별 역할

| 위치 | 작성 기준 |
| --- | --- |
| 루트 README | 무엇을 하는 사이트인지, 어디서 보고 실행하는지부터 설명 |
| GitHub About | `Interactive 3D`로 고정 |
| 구조·개발 안내 | 실제 코드의 책임·연결·변경 위치와 명령을 설명 |
| 검증·변경 기록 | 기준 커밋·환경·관찰값·남은 문제를 함께 기록 |
| 트러블슈팅 글 | 당시 증상·가설·수정·검증의 순서를 보존 |
| 라이선스·배포 보관본 | 원문과 파일을 보존하고 새 안내에서 연결 |

“24단계 3D 구현”은 소개에서 “스크롤로 탐색하는 3D 웹사이트”처럼 바꾼다. 실제 카메라 기준점 수나 측정 위치 수는 재현에 필요하면 남긴다. “고도화”, “완성도 향상”만으로 변경을 설명하지 않고 무엇이 움직이고 무엇을 확인했는지 쓴다.

같은 사실을 도입·기능 목록·결론에 반복하지 않는다. 과장이나 사람의 경험을 덧붙여 자연스럽게 보이게 하지 않는다. 구현과 문서 작성에 사용한 AI를 사람의 단독 작업으로 바꾸지 않는다. [장면 용어집](scene-glossary.md)의 명칭을 사용하고 그림 제목은 대상·현상 중심의 명사형으로 쓴다.

## 현재 상태와 과거 기록

이전 동작이 남은 문서에는 무엇이 바뀌었는지와 후속 기록을 짧게 붙인다. 예를 들어 방향이 고정된 모니터의 옛 비교표는 유지하고, 현재는 나선 경로를 따라 회전한다는 링크를 앞에 둔다. 측정값·이미지·코드 버전을 바꾸어 과거 검증을 최신 결과처럼 만들지 않는다.

제목을 바꿀 때는 기존 앵커 링크를 확인한다. 실행 명령은 manifest·설정과 대조하고, 파일·이미지·앵커가 실제로 열리는지 검사한다. GitHub의 PC·모바일 렌더에서 긴 표와 코드 블록도 확인한다.

## 참고한 README

### 2026-09-27 정리 기준

README는 초급 개발 경험이 있는 독자가 화면을 먼저 탐색하고 코드로 이동하도록 구성한다. 상위 제목에만 소량의 이모지를 쓰고, 장면별 이미지·짧은 설명·직접 할 조작을 묶는다. 조작 표와 보조 정보는 접고, 구조 설명은 Mermaid와 쉬운 용어로 연결한다.

| 확인한 공개 저장소 | 적용한 문서 방식 |
| --- | --- |
| [Three.js](https://github.com/mrdoob/three.js/blob/dev/README.md) | 짧은 소개에서 실행·예제·상세 문서로 이어지는 경로 |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | 역할을 먼저 설명하고 작은 수정 예제로 연결 |
| [Drei](https://github.com/pmndrs/drei) | 현재 문서와 오래된 안내를 구분하고 보관 링크 유지 |
| [Lenis](https://github.com/darkroomengineering/lenis) | 설치·설정·제약·트러블슈팅을 독자의 작업 순서로 구분 |

구조만 참고했으며 문장·브랜드·성능 주장·라이선스는 가져오지 않았다. Aether의 의존성에 React Three Fiber·Drei·Lenis를 추가했다는 뜻도 아니다. 새 README 이미지에는 촬영 커밋과 렌더러 조건을 남긴다.

### 이전 참고 기록

2026-09-22에 [GitHub README 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes), [Three.js README](https://github.com/mrdoob/three.js/blob/dev/README.md), [React Three Fiber README](https://github.com/pmndrs/react-three-fiber)를 확인했다. 짧은 역할 설명, 바로 실행할 수 있는 예, 상세 문서로 이어지는 링크 구성을 참고했다. 문장·기능 주장·라이선스·브랜딩은 복사하지 않았다.

이번 README는 실제 화면·조작법·로컬 실행을 앞에 두었다. 라이브러리의 API 예제나 후원 영역처럼 이 웹 데모에 필요하지 않은 구성은 가져오지 않았다.
