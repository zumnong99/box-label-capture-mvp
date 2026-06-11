# MVP 사양 요약

## 세션 / 카트 / 박스

- 세션은 하루 작업 단위의 최상위 묶음입니다.
- MVP 기본 세션 ID는 `session_YYYYMMDD_001` 형식입니다.
- 카트는 박스 8개를 담는 작업 묶음이며, 기본 카트 번호는 `001`입니다.
- 박스는 촬영 상태, 위치, 재촬영 횟수, 파일 경로, 이미지 metadata를 가집니다.

## 2x4 촬영 순서

| 박스 | 행 | 열 |
| --- | --- | --- |
| 1 | 1 | 1 |
| 2 | 1 | 2 |
| 3 | 2 | 1 |
| 4 | 2 | 2 |
| 5 | 3 | 1 |
| 6 | 3 | 2 |
| 7 | 4 | 1 |
| 8 | 4 | 2 |

## 파일 이름 규칙

사진 파일 경로는 다음 규칙으로 manifest와 IndexedDB record에 기록합니다.

```text
cart_001/cart_001_box_01.jpg
cart_001/cart_001_box_02.jpg
...
cart_001/cart_001_box_08.jpg
```

## Manifest 규칙

- `manifest.json`은 세션, 카트, 박스 목록을 계층 구조로 표현합니다.
- `manifest.csv`는 박스별 행으로 펼쳐서 표현합니다.
- 공통 필드는 세션 ID, 카트 번호, 박스 번호, 행, 열, 촬영 상태, 재촬영 횟수, 파일 경로, 촬영 시각, 이미지 크기, 파일 크기, MIME type입니다.
- ZIP에는 모든 박스 metadata가 담긴 `manifest.json`과 `manifest.csv`가 포함됩니다.

## 카메라 미리보기 규칙

- 카메라는 페이지 로드 시 자동으로 시작하지 않습니다.
- 사용자가 `카메라 시작`을 누를 때만 권한 요청을 합니다.
- `playsinline`, `autoplay`, `muted` 속성으로 iPhone Safari 미리보기를 고려합니다.
- 후면 카메라를 우선 요청하되, 실패하면 기본 카메라로 재시도합니다.
- `카메라 중지`는 모든 media track을 중지합니다.
- 현재 단계는 video 프레임을 canvas로 캡처하고 JPEG Blob으로 변환합니다.
- 정사각형 가이드는 시각 안내용이며, 저장 대상은 크기 조정된 전체 카메라 프레임입니다.
- 사진 Blob은 IndexedDB `photos` object store에 저장합니다.
- object URL은 IndexedDB에 저장하지 않고 런타임 미리보기용으로만 생성합니다.
- 새로고침 후에는 현재 세션의 IndexedDB 사진을 다시 읽어 object URL을 재생성합니다.
- IndexedDB에 사진이 있지만 localStorage 상태가 촬영 완료가 아니면 삭제하지 않고, 해당 박스 선택 시 표시할 수 있게 남깁니다.

## ZIP 내보내기 규칙

- ZIP 파일명은 `{session_id}.zip`입니다.
- ZIP 내부 루트 폴더명은 `session_id`와 같습니다.
- ZIP에는 `{session_id}/manifest.json`, `{session_id}/manifest.csv`, 실제 IndexedDB 사진 파일만 포함합니다.
- 사진 내부 경로는 `cart_001/cart_001_box_01.jpg` 형식을 유지합니다.
- 미완료 카트가 있어도 경고만 표시하고 내보내기를 허용합니다.
- 사진이 없으면 ZIP 생성을 막고 `내보낼 사진이 없습니다.`를 표시합니다.
- ZIP 생성 결과는 사용자가 직접 다운로드하거나 공유해야 합니다.

## 제외 기능

- OCR
- 서버 DB 저장
- 백엔드 업로드
- PC 자동 저장
- 로그인
