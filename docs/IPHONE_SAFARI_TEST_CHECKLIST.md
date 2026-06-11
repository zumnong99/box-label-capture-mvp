# iPhone Safari 테스트 체크리스트

## A. GitHub Pages 배포

- [ ] GitHub Actions Pages workflow가 성공 완료되었는지 확인합니다.
- [ ] GitHub 저장소 `Settings > Pages`의 Source가 `GitHub Actions`인지 확인합니다.
- [ ] 예상 URL을 엽니다.

```text
https://<github-user>.github.io/box-label-capture-mvp/
```

- [ ] 페이지가 빈 화면이 아닌지 확인합니다.
- [ ] 빈 화면이면 `vite.config.ts`의 `base`가 `/box-label-capture-mvp/`인지 확인합니다.

## B. iPhone Safari 진입

- [ ] KakaoTalk, LINE, Gmail 등 앱 안의 브라우저가 아니라 Safari에서 URL을 직접 엽니다.
- [ ] 주소창에서 HTTPS 잠금 상태를 확인합니다.
- [ ] `카메라 시작`을 누릅니다.
- [ ] 카메라 권한을 허용합니다.
- [ ] 후면 카메라 미리보기가 보이는지 확인합니다.
- [ ] 노란 정사각형 라벨 가이드가 video 위에 보이는지 확인합니다.
- [ ] `진단 정보`를 열어 보안 컨텍스트, 카메라 API, IndexedDB가 `예`인지 확인합니다.

## C. 촬영 테스트

- [ ] 1번 박스를 촬영합니다.
- [ ] 현재 박스 사진 미리보기가 나타나는지 확인합니다.
- [ ] 예상 파일명이 아래와 같은지 확인합니다.

```text
cart_001_box_01.jpg
```

- [ ] 2번, 3번 박스를 촬영합니다.
- [ ] 2x4 grid의 촬영 완료 상태가 갱신되는지 확인합니다.
- [ ] 박스 사이를 이동했을 때 각 박스의 미리보기가 올바르게 바뀌는지 확인합니다.

## D. IndexedDB 새로고침 테스트

- [ ] Safari 페이지를 새로고침합니다.
- [ ] 촬영 완료 상태가 유지되는지 확인합니다.
- [ ] 사진 미리보기가 복원되는지 확인합니다.
- [ ] `진단 정보`의 세션 사진 수가 촬영 수와 맞는지 확인합니다.
- [ ] 미리보기가 사라지면 Safari 사생활 보호 모드, 저장소 제한, iOS 저장소 압박 여부를 기록합니다.

## E. 재촬영 테스트

- [ ] 촬영 완료된 1번 박스를 선택합니다.
- [ ] `재촬영`을 누릅니다.
- [ ] 사진 미리보기가 새 이미지로 바뀌는지 확인합니다.
- [ ] 재촬영 횟수가 증가하는지 확인합니다.
- [ ] Safari 페이지를 새로고침하고 최신 사진이 유지되는지 확인합니다.

## F. ZIP 내보내기 테스트

- [ ] `세션 내보내기`를 누릅니다.
- [ ] 내보내기 요약이 표시되는지 확인합니다.
- [ ] 미완료 카트 경고가 있어도 export가 막히지 않는지 확인합니다.
- [ ] ZIP 생성이 완료되는지 확인합니다.
- [ ] `ZIP 다운로드`를 시도합니다.
- [ ] 가능하면 `공유로 보내기`도 시도합니다.
- [ ] ZIP을 PC로 옮깁니다.
- [ ] ZIP을 열고 아래 구조가 있는지 확인합니다.

```text
session_YYYYMMDD_NNN/
  manifest.json
  manifest.csv
  cart_001/
    cart_001_box_01.jpg
    cart_001_box_02.jpg
```

## G. PC OCR 인계 확인

- [ ] ZIP을 PC OCR input 폴더에 압축 해제합니다.
- [ ] 이미지 경로가 `manifest.json`과 `manifest.csv`의 path와 맞는지 확인합니다.
- [ ] 기존 PC OCR 프로그램이 이미지 파일을 읽을 수 있는지 확인합니다.
- [ ] OCR 자체 정확도와 OCR pipeline 수정은 이 웹앱 범위 밖으로 기록합니다.

## H. 실패 기록 템플릿

| Date/time | iPhone model | iOS version | Safari or Home Screen app | Test URL | Step | Expected | Actual | Screenshot/video file name if any | Fix needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
