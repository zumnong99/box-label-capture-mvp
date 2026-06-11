# 박스 라벨 촬영 관리 MVP

모바일 브라우저에서 카트 단위 박스 라벨 촬영 순서를 관리하기 위한 정적 웹앱 초안입니다. 이 저장소의 MVP는 OCR, 서버, DB, 자동 업로드 없이 촬영 진행 상태, 카메라 미리보기, JPEG 캡처, IndexedDB 사진 저장, ZIP 내보내기를 확인하는 데 집중합니다.

## MVP가 하는 일

- `session_YYYYMMDD_001` 형식의 세션 ID를 표시합니다.
- 기본 카트 번호 `001`에서 시작하고 `다음 카트`로 `009`까지 진행할 수 있습니다.
- 현재 카트와 현재 박스 진행 상태를 표시합니다.
- `촬영`, `재촬영`, `이전 박스`, `다음 박스`, `다음 카트`, `사진 ZIP 만들기` 동작을 브라우저 상태로 처리합니다.
- 사용자가 `카메라 시작`을 누르면 `getUserMedia`로 카메라 미리보기를 시작합니다.
- 가능한 경우 후면 카메라를 우선 사용하고, 실패하면 기본 카메라로 재시도합니다.
- `촬영`을 누르면 현재 video 프레임을 canvas로 캡처하고 JPEG Blob으로 변환합니다.
- IndexedDB에 JPEG Blob과 이미지 메타데이터를 저장하고 새로고침 후 복원합니다.
- 박스별 사진 미리보기와 이미지 메타데이터를 보여줍니다.
- `manifest.json` / `manifest.csv` 미리보기에 파일 경로와 이미지 메타데이터를 포함합니다.
- `사진 ZIP 만들기`로 IndexedDB에 저장된 JPEG 사진과 `manifest.json`, `manifest.csv`를 ZIP으로 묶습니다.
- ZIP은 다운로드하거나 Web Share API가 지원되는 브라우저에서 공유할 수 있습니다.
- Blob은 IndexedDB에 저장하고, object URL은 런타임 메모리에만 둡니다.
- `localStorage`에는 가벼운 세션 상태와 metadata만 저장합니다.

## MVP가 하지 않는 일

- OCR 인식
- 서버 DB 저장
- PC 자동 업로드
- 사용자 로그인
- 백엔드 서버 실행

## 로컬 실행

```bash
npm install
npm run dev
```

카메라 미리보기는 페이지 로드 시 자동으로 시작하지 않습니다. 앱 화면에서 `카메라 시작`을 누를 때만 브라우저 권한 요청이 발생합니다.

현재 사진 Blob은 IndexedDB에 저장됩니다. 다만 iPhone Safari 사생활 보호 모드나 저장소 제한 환경에서는 IndexedDB가 차단되거나 브라우저가 저장 데이터를 지울 수 있습니다.

ZIP 내보내기는 수동 작업입니다. ZIP을 다운로드하거나 공유한 뒤 PC로 옮기고, PC의 OCR 입력 폴더에 직접 압축 해제해야 합니다. GitHub Pages 정적 앱은 PC 로컬 저장소나 repo 폴더에 직접 저장할 수 없습니다.

## 검증

```bash
npm run typecheck
npm test
npm run build
```

`npm test`는 현재 TypeScript 타입 검사를 실행하는 최소 테스트 스캐폴딩입니다.

## 정적 배포

Vite 빌드 결과물은 `dist/`에 생성됩니다. GitHub Pages 배포는 GitHub Actions workflow가 `typecheck`, `test`, `build`를 통과한 뒤 `dist/`를 업로드합니다. 별도 백엔드 서버는 필요하지 않습니다.

현재 Vite `base`는 GitHub Pages repo URL에 맞춰 `/box-label-capture-mvp/`로 설정되어 있습니다. GitHub 저장소 이름을 바꾸면 `vite.config.ts`의 `base`도 같은 경로로 바꿔야 합니다.

GitHub 저장소를 만든 뒤 로컬 repo를 연결하고 `main` 브랜치로 푸시합니다.

```powershell
git remote add origin https://github.com/<github-user>/box-label-capture-mvp.git
git branch -M main
git push -u origin main
```

GitHub에서 `Settings > Pages > Source`를 `GitHub Actions`로 설정합니다. 배포가 완료되면 예상 URL은 다음 형식입니다.

```text
https://<github-user>.github.io/box-label-capture-mvp/
```

GitHub Pages는 앱 코드만 호스팅합니다. 촬영한 사진은 GitHub로 업로드되지 않고, 브라우저 IndexedDB에 남아 있다가 사용자가 ZIP으로 내보내거나 공유할 때만 이동합니다. GitHub Pages 정적 앱은 PC의 repo 폴더나 OCR 입력 폴더에 직접 저장할 수 없습니다.

## iPhone Safari 테스트

- 배포된 HTTPS GitHub Pages URL을 iPhone Safari에서 직접 엽니다.
- KakaoTalk, LINE 등 인앱 브라우저에서는 먼저 테스트하지 않습니다.
- `카메라 시작` → 촬영 → 새로고침 복원 → ZIP 내보내기 순서로 확인합니다.
- `진단 정보` 패널에서 HTTPS, 카메라, IndexedDB, 공유 지원 상태를 확인합니다.
- 촬영한 사진은 GitHub로 업로드되지 않습니다.
- ZIP은 다운로드 또는 공유 후 PC로 수동 이동해야 합니다.
- 상세 체크리스트는 `docs/IPHONE_SAFARI_TEST_CHECKLIST.md`를 따릅니다.

## iPhone Safari 메모

iPhone Safari의 `getUserMedia`는 HTTPS 환경이 필요합니다. 개발 PC의 `localhost` / `127.0.0.1`에서는 로컬 테스트가 가능할 수 있지만, iPhone 실기기 테스트에는 HTTPS 배포 URL 또는 별도로 구성한 로컬 HTTPS/LAN 환경이 필요합니다.

GitHub Pages는 HTTPS를 제공하므로 이후 실제 기기 테스트와 배포에 적합합니다. 현재 단계는 카메라 프레임을 JPEG Blob으로 캡처하고 IndexedDB에 저장하며, 수동 ZIP 내보내기를 제공합니다.

iPhone Safari 실기기 테스트는 배포된 HTTPS URL을 Safari에서 직접 열어 진행합니다. `카메라 시작`으로 권한을 허용한 뒤 여러 박스를 촬영하고, 새로고침 후 IndexedDB 복원 여부를 확인하고, 마지막으로 ZIP 다운로드 또는 공유 동작을 확인합니다.
