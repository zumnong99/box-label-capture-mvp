# GitHub Pages 배포 절차

## 전제 조건

- GitHub 계정이 있어야 합니다.
- 저장소 이름은 기본적으로 `box-label-capture-mvp`를 사용합니다.
- 저장소 이름을 바꾸면 `vite.config.ts`의 `base`도 `/<repo-name>/`으로 바꿔야 합니다.
- 로컬에서 Node.js와 npm이 동작해야 합니다.
- 배포할 변경 사항은 commit된 상태여야 합니다.
- GitHub Pages 설정은 `GitHub Actions` source를 사용합니다.

## 원격 저장소 연결

GitHub에서 빈 저장소를 만든 뒤 로컬 repo에서 실행합니다.

```powershell
git remote add origin https://github.com/<github-user>/box-label-capture-mvp.git
git branch -M main
git push -u origin main
```

이미 origin이 있으면 현재 값을 확인한 뒤 필요한 경우 올바른 GitHub 저장소로 바꿉니다.

```powershell
git remote -v
```

## Pages 설정

GitHub 저장소에서 `Settings > Pages`로 이동합니다.

- Source: `GitHub Actions`
- Workflow: `.github/workflows/pages.yml`

`main` 브랜치에 push하면 workflow가 다음 순서로 실행됩니다.

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `dist/` artifact 업로드
6. GitHub Pages 배포

배포 URL은 다음 형식입니다.

```text
https://<github-user>.github.io/box-label-capture-mvp/
```

## 정적 앱 동작 범위

GitHub Pages는 앱 코드만 호스팅합니다. 촬영한 사진은 GitHub로 업로드되지 않습니다.

- 사진 Blob: iPhone Safari의 IndexedDB에 저장
- 세션 상태: 브라우저 localStorage와 IndexedDB에 저장
- PC 이동: 사용자가 ZIP 다운로드 또는 공유 후 수동 이동
- PC repo input 폴더 자동 저장: GitHub Pages에서 불가능

## 문제 해결

Blank page after deployment:
`vite.config.ts`의 `base`가 실제 GitHub repo 이름과 같은지 확인합니다. 현재 기본값은 `/box-label-capture-mvp/`입니다.

Camera not available:
iPhone Safari에서 배포된 HTTPS URL을 직접 열었는지 확인합니다. 앱 안의 `카메라 시작` 버튼을 누른 뒤 권한을 허용해야 합니다.

ZIP download odd behavior on iPhone:
다운로드가 예상과 다르면 공유 버튼을 사용해 파일 앱, AirDrop, iCloud Drive 등으로 보내는 방식을 확인합니다.

Photos missing after reload:
Safari 사생활 보호 모드나 저장소 제한 상태가 아닌지 확인합니다. iOS 저장소 압박 상황에서는 브라우저 저장 데이터가 정리될 수 있습니다.

## iPhone 테스트 진입점

배포 후 iPhone Safari에서 HTTPS URL을 직접 엽니다.

```text
https://<github-user>.github.io/box-label-capture-mvp/
```

다음 세션의 목표는 `Step 6: iPhone Safari deployed-site test checklist and targeted fixes`입니다.
