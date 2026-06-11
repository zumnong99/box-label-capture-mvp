# 구현 계획

## Step 1: 정적 UI와 상태

- Vite + TypeScript 기반 정적 앱을 구성합니다.
- 모바일 우선 촬영 화면, 2x4 촬영 순서, 기본 버튼 동작을 구현합니다.
- 세션 / 카트 / 박스 상태를 `localStorage`에 저장합니다.
- `manifest.json` / `manifest.csv` 생성 함수를 순수 함수로 유지합니다.

## Step 2: camera getUserMedia

- 카메라 권한 요청을 명시적인 사용자 버튼 뒤에 연결합니다.
- iPhone Safari HTTPS 환경에서 동작을 확인합니다.
- 실패 시 사용자가 이해할 수 있는 한국어 오류 메시지를 표시합니다.

## Step 3: canvas capture and image resize

- video 프레임을 canvas로 캡처합니다.
- 라벨 촬영에 충분한 최대 해상도와 JPEG 품질 기준을 정합니다.
- 저장 전 파일 이름 규칙과 현재 박스 상태를 연결합니다.

## Step 4: IndexedDB blob storage

- 이미지 blob은 `localStorage`가 아닌 IndexedDB에 저장합니다.
- 세션 상태와 blob 저장소의 키를 분리합니다.
- 세션 삭제 시 blob도 함께 정리합니다.

## Step 5: JSZip export

- `manifest.json`, `manifest.csv`, 이미지 파일을 ZIP으로 묶습니다.
- ZIP 생성 중 진행 상태를 표시합니다.
- 실패 시 재시도 가능한 상태를 남깁니다.

## Step 6: iPhone Safari real-device test

- 실제 iPhone Safari에서 카메라 권한, 화면 회전, 저장 용량, 긴 세션 동작을 확인합니다.
- 네트워크가 불안정해도 정적 앱이 촬영 상태를 유지하는지 점검합니다.

## Step 7: GitHub Pages deployment

- Vite base path와 GitHub Actions 배포를 설정합니다.
- HTTPS 배포 URL에서 카메라 기능을 다시 검증합니다.
- README에 배포 절차와 운영 메모를 추가합니다.
