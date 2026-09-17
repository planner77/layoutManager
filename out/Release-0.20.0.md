# Release 0.20.0

기준일: 2026-09-17

## 소스 / 병합

- GitHub Issue #9 `도면 열기·등록 등 처리 중 전체 화면 로딩 스피너 및 사용자 입력 차단` 구현을 완료했다.
- PR #12를 squash merge했다.
- `main` 병합 커밋: `c7cbff41ed03c6994d387a34d367b40d706dcd81`
- 애플리케이션 버전 기준 `src/package.json`: `0.20.0`
- PR 최종 CI: GitHub Actions run `35203650606`
  - TypeScript: PASS
  - ESLint: PASS
  - Unit / Integration: 22 files / 100 tests PASS
  - Production build: PASS
  - Playwright Chromium E2E: 33 / 33 PASS

## 태그 / GHCR 게시

- 릴리스 태그: `v0.20.0`
- 게시 workflow: `Build and publish Docker image`, run `35205938957` — SUCCESS
- 플랫폼: `linux/amd64`
- 게시 이미지:
  - `ghcr.io/planner77/layoutmanager:0.20.0`
  - `ghcr.io/planner77/layoutmanager:latest`
- 이미지 digest: `sha256:3d5e567ddf7e1c72a1cf5696e67c3e8c65d6c24293d9c7801d5ee765e6b5b91a`
- OCI revision: `c7cbff41ed03c6994d387a34d367b40d706dcd81`
- OCI version: `0.20.0`

GHCR workflow 로그에서 두 태그가 동일 digest로 push된 것을 확인했다. 이 기록은 이미지 게시 성공 근거이며 실제 운영 서버 pull/재배포/health 검증을 수행했다는 의미는 아니다.

## 구현 요약

- 작업 ID 기반 전역 로딩 Provider와 전체 화면 오버레이 추가
- Viewer 최초 로드, renderer 전환, 다시 불러오기 연계
- 도면 등록/업로드, 삭제, Current 지정/변경 연계
- 빠른 연속 이벤트에 대한 ref 기반 중복 실행 방지
- `aria-busy`, `progressbar`, live 상태 문구 접근성 제공
- WebGL canvas와 headless Chromium의 합성 지연을 유발한 backdrop blur 제거

## 추적

- 상세 요구사항·설계·Acceptance Criteria·CI 근거: `out/Issue9.md`
- Pull Request: #12
- GitHub Issue: #9 (`completed`)
