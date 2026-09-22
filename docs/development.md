# 개발과 배포

저장소 루트에서 실행한다. Node.js 22.13 이상과 npm이 필요하며 CI는 Node.js 24를 사용한다. 잠긴 의존성을 설치하려면 `npm ci`를 사용한다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 `http://127.0.0.1:5173`에서 열린다. 포트가 사용 중이면 터미널의 실제 주소를 확인한다. 서버·DB·환경변수는 필요하지 않다.

## 빌드와 검사

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

`npm run build`는 TypeScript 검사 후 Vite로 `dist/`를 만든다. `npm run preview`는 이 결과를 제공하므로 소스를 바꾼 뒤에는 먼저 다시 빌드한다. 테스트의 서버 재사용과 GPU 실행 조건은 [검증 안내](testing.md)를 따른다.

## 콘텐츠와 자산 변경

프로젝트 데이터는 [projects.ts](../src/projects.ts), 소개·연락처는 [App.tsx](../src/App.tsx)에 있다. 현재 프로젝트와 연락처는 예시다. 실제 콘텐츠로 바꿀 때는 메타데이터의 제목·설명·공유 이미지도 함께 확인한다.

- [모니터 영상](media-sources.md): Python 생성·인코딩 명령, 파일 규격과 실패 시 표시.
- [조명 영상](light-projection-media.md): 생성 조건, 밝기·루프 검증, 재생 수명.
- [메타데이터](metadata.md): HTML·manifest·공유 이미지·아이콘과 재생성 명령.

영상·아이콘은 저장소에 포함되어 일반 빌드에서 다시 생성하지 않는다. 생성 도구의 선택 의존성도 일반 앱 실행에는 필요하지 않다.

## Vercel 배포

[공개 사이트](https://aether-studio-nu.vercel.app/)는 GitHub 저장소와 연결된 Vercel 프로젝트에서 제공한다. production 브랜치는 `main`, 빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`다. 다른 정적 호스팅에서도 같은 빌드 결과를 사용할 수 있다.

GitHub Actions와 Vercel 자동 배포는 독립적으로 실행된다. 현재 설정에서 Actions 통과가 Vercel 배포를 자동으로 막거나 허용하는 게이트는 아니다. 병합 전 PR 검사를 확인하고 배포 후에는 실제 파일과 화면을 다시 확인한다.

저장소와 Vercel 프로젝트 권한이 있는 환경에서 수동 배포할 때는 다음 명령을 사용할 수 있다.

```sh
npx vercel link --project aether-studio --scope okorions-projects
npx vercel deploy --prod --scope okorions-projects
```

`.vercel/`, `.env*`, 검수용 `.qa/`는 Git에서 제외한다. 배포 확인 시 소스 커밋, 공개 주소, 새 자산의 응답과 브라우저 오류를 기록한다.
