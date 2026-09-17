# Release 0.24.0

기준일: 2026-09-18

## 릴리스 범위

GitHub Issue #17의 전체 화면 `three-dxf-viewer` 레이어 선택/표시 제어 기능을 릴리스한다.

- 애플리케이션 버전: `0.24.0`
- 이전 버전: `0.23.0`
- SemVer: 기존 API/DB 호환성을 유지하는 신규 UI 기능이므로 MINOR
- DB schema/migration 변경 없음
- API contract 변경 없음
- 외부 dependency 버전 변경 없음

주요 변경:

- 전체 화면 `three-dxf-viewer` 좌측에 접이식 레이어 패널 추가
- 현재 DXF 레이어별 체크박스 표시/숨김
- 전체 선택 / 전체 해제
- 많은 레이어를 위한 내부 세로 스크롤
- 일반 화면 `LayerDropdown`과 동일한 선택 상태 공유
- 기존 `ViewerManager.showLayer()`를 통한 즉시 반영
- 레이어 조작 중 Viewer/Adapter/Canvas 재생성 및 원본 재다운로드 방지
- 기존 Zoom/Pan 상태 보존
- `dxf-viewer` 등 다른 Viewer 전체 화면에는 레이어 UI 미표시

## PR / CI

- PR: #21 `feat: 전체 화면 three-dxf-viewer 레이어 패널 추가`
- 최종 PR head: `9f2a71e31f98d379a4831db8cadc44c6ce2b0eab`
- 최종 PR CI: run `35278486135` **PASS**

최종 CI 결과:

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Vitest Unit / Integration: **23 files / 105 tests PASS**
- Production build: PASS
- Chromium Playwright E2E: **35 / 35 PASS**

CI 과정에서 사전 결함과 테스트 기준 문제를 발견해 수정했다.

1. run `35277124003`: 지원되지 않는 공통 Button `secondary` variant 때문에 TypeScript 실패. `outline`으로 수정했다.
2. run `35277242955`: E2E 34/35. 전체 화면 진입으로 canvas가 resize되는데 진입 전 screenshot과 비교한 기준 오류를 수정했다.
3. run `35277825527`: E2E 34/35. WebGL 렌더의 픽셀 완전 일치를 요구한 assertion을 요구사항 중심의 상태/DOM/네트워크/view-state 검증으로 변경했다.
4. run `35278486135`: 전체 pipeline 최종 PASS.

`npm ci` 및 Docker build는 기존 dependency에 대해 high severity audit 경고 4건을 표시했다. 이번 릴리스에서는 dependency 버전을 변경하지 않았으며 해당 경고는 CI 실패 조건이 아니다.

## 병합 및 이슈 처리

- 병합 방식: squash merge
- PR #21 merge commit: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- merge commit: GitHub verified
- 작업 branch: `feature/issue-17-fullscreen-layer-panel`
- 저장소의 병합 후 branch 자동 삭제 정책으로 작업 branch 삭제 확인
- GitHub Issue #17: `completed` 상태로 종료

## Release tag

- Tag: `v0.24.0`
- 형식: annotated tag
- Tag object: `8ddaad353ba7f57d796e28b7e396b382fc15b6db`
- 대상 commit: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- 생성 주체: `github-actions[bot]`

## GHCR 게시

`main` 병합 후 `Build and publish Docker image` workflow run `35279000480`이 성공했다.

게시 이미지:

- `ghcr.io/planner77/layoutmanager:0.24.0`
- `ghcr.io/planner77/layoutmanager:latest`

게시 결과:

- Platform: `linux/amd64`
- Digest: `sha256:bfd80f24e43b5e108c480b3a51913daa66d47331c880855f340233468616993c`
- OCI revision: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- OCI version: `0.24.0`
- 두 태그는 동일 digest를 가리킨다.

## 검증 범위와 제한

자동 E2E는 한글/영문/숫자/공백을 포함한 합성 복수 레이어 DXF를 사용해 레이어 선택, 전체 선택/해제, 화면 상태 보존, 원본 재요청 방지, 동일 Canvas 유지, 일반 레이어 드롭다운 동기화와 다른 Viewer 회귀를 검증했다.

매우 많은 레이어를 포함한 실제 업무 도면의 패널 사용성, 초대형 DXF에서의 레이어 토글 체감 성능, 브라우저/GPU별 장시간 사용 특성은 이번 CI 범위에 포함하지 않았다. 운영 배포 시 실제 도면 smoke test로 별도 확인한다.
