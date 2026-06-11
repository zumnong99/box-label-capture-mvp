# 박스 라벨 촬영 관리 MVP

모바일 브라우저에서 카트 단위 박스 라벨 촬영 순서를 관리하기 위한 정적 웹앱 초안입니다. 이 저장소의 첫 MVP는 OCR, 서버, DB, 자동 업로드 없이 촬영 진행 상태와 내보내기용 manifest 구조를 확인하는 데 집중합니다.

## MVP가 하는 일

- `session_YYYYMMDD_001` 형식의 세션 ID를 표시합니다.
- 기본 카트 번호 `001`과 8개 박스 촬영 순서를 표시합니다.
- 2열 4행 촬영 순서에서 현재 박스와 촬영 완료 박스를 구분합니다.
- `촬영`, `재촬영`, `이전 박스`, `다음 박스`, `카트 완료`, `세션 내보내기` 동작을 브라우저 상태로 처리합니다.
- 실제 사진 대신 placeholder 파일 경로로 `manifest.json` / `manifest.csv` 미리보기를 생성합니다.
- 이미지 blob 없이 가벼운 세션 상태만 `localStorage`에 저장합니다.

## MVP가 하지 않는 일

- OCR 인식
- 실제 카메라 권한 요청과 사진 촬영
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

## 검증

```bash
npm run typecheck
npm run build
```

`npm test`는 현재 TypeScript 타입 검사를 실행하는 최소 테스트 스캐폴딩입니다.

## 정적 배포

Vite 빌드 결과물은 `dist/`에 생성됩니다. 이후 GitHub Pages 배포를 붙일 때는 정적 파일 배포만 필요하며, 별도 백엔드 서버는 필요하지 않습니다.

## iPhone Safari 메모

향후 실제 카메라 기능을 구현할 때 iPhone Safari의 `getUserMedia`는 HTTPS 환경이 필요합니다. GitHub Pages 배포 환경에서는 HTTPS가 기본 제공됩니다.
