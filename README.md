# 박스 라벨 촬영 관리 MVP

모바일 브라우저에서 카트 단위 박스 라벨 촬영 순서를 관리하기 위한 정적 웹앱 초안입니다. 이 저장소의 MVP는 OCR, 서버, DB, 자동 업로드 없이 촬영 진행 상태, 카메라 미리보기, 내보내기용 manifest 구조를 확인하는 데 집중합니다.

## MVP가 하는 일

- `session_YYYYMMDD_001` 형식의 세션 ID를 표시합니다.
- 기본 카트 번호 `001`과 8개 박스 촬영 순서를 표시합니다.
- 2열 4행 촬영 순서에서 현재 박스와 촬영 완료 박스를 구분합니다.
- `촬영`, `재촬영`, `이전 박스`, `다음 박스`, `카트 완료`, `세션 내보내기` 동작을 브라우저 상태로 처리합니다.
- 사용자가 `카메라 시작`을 누르면 `getUserMedia`로 카메라 미리보기를 시작합니다.
- 가능한 경우 후면 카메라를 우선 사용하고, 실패하면 기본 카메라로 재시도합니다.
- 실제 사진 대신 placeholder 파일 경로로 `manifest.json` / `manifest.csv` 미리보기를 생성합니다.
- 이미지 blob 없이 가벼운 세션 상태만 `localStorage`에 저장합니다.

## MVP가 하지 않는 일

- OCR 인식
- 실제 사진 저장
- canvas 캡처와 이미지 resize
- IndexedDB 이미지 저장
- ZIP 파일 생성
- DB 저장
- PC 자동 업로드
- 사용자 로그인
- 백엔드 서버 실행

## 로컬 실행

```bash
npm install
npm run dev
```

카메라 미리보기는 페이지 로드 시 자동으로 시작하지 않습니다. 앱 화면에서 `카메라 시작`을 누를 때만 브라우저 권한 요청이 발생합니다.

## 검증

```bash
npm run typecheck
npm run build
```

`npm test`는 현재 TypeScript 타입 검사를 실행하는 최소 테스트 스캐폴딩입니다.

## 정적 배포

Vite 빌드 결과물은 `dist/`에 생성됩니다. 이후 GitHub Pages 배포를 붙일 때는 정적 파일 배포만 필요하며, 별도 백엔드 서버는 필요하지 않습니다.

## iPhone Safari 메모

iPhone Safari의 `getUserMedia`는 HTTPS 환경이 필요합니다. 개발 PC의 `localhost` / `127.0.0.1`에서는 로컬 테스트가 가능할 수 있지만, iPhone 실기기 테스트에는 HTTPS 배포 URL 또는 별도로 구성한 로컬 HTTPS/LAN 환경이 필요합니다.

GitHub Pages는 HTTPS를 제공하므로 이후 실제 기기 테스트와 배포에 적합합니다. 현재 단계는 카메라 미리보기만 제공하며 사진 파일은 아직 저장하지 않습니다.
