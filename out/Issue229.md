# Issue #229 — Main 통합과 GHCR 릴리스 분리

## 검증된 위험 및 정책

- 선행 [PR #228](https://github.com/planner77/layoutManager/pull/228) exact HEAD
  fff0b31040af5ec1a571e5b2106686202d4a3140의 PR CI #590은 성공했다.
  이 성공은 **GO-INTEGRATE 코드 수준 근거**이지 실제 운영 Worker GO-PILOT 근거가 아니다.
- 기존 Main `.github/workflows/docker-publish.yml`은 런타임 변경마다
  App/Migrator :version과 :latest를 게시할 수 있다. 새 v0.61.0의 별도
  CPU Worker 이미지는 해당 출고 대상이 아니므로 불완전한 릴리스가 생길 위험이 있다.

## 결정 (ADR-229)

1. 별도의 작은 release-guard 브랜치를 기존 Main(0.60.0)에서 분기한다.
   #228 Source/G7/DB/Volume/운영 설정은 변경하지 않는다.
2. `.github/scripts/issue229_release_hold.py`는 실제 `src/package.json` SemVer의
   **0.61.0 이상 전체를 지속 HOLD**한다. Main CI는 실행하지만 GHCR
   build-and-push는 SKIPPED. v0.61.1, v0.62.0 및 다음 Main 커밋에도 적용.
   Commit subject나 단일 merge ID로만 예외를 만들지 않는다.
3. v0.61.0 이상인 Git tag 이벤트는 비정상 tag 이름 또는 직접 태그 푸시도
   fail-closed로 처리한다. 이미지/태그 변경 Job에는 중복 preflight를
   tag 생성/로그인/버전 alias/registry push **이전**에 둔다.
4. 0.60.0 및 그 이하의 기존 릴리스 및 #216의 source-pinned immutable recovery
   경로는 유지한다. #229 자체의 소수 Workflow/테스트/문서 변경은
   정확한 경로 allowlist 기반으로만 비출고 Main CI에 포함한다.
5. 향후 v0.61.0+ 정식 릴리스는 **별도 승인 PR**에서 이 정책을 변경해야 한다.
   해당 PR은 정확 버전·릴리스 source·role, App/Migrator/CPU Worker **3-image**
   linux/amd64/tag/digest/immutable alias/복구 정책 및 실제 Worker 검증을
   제출해야 한다. 단순 package version bump/Commit title/태그 생성은 승인 근거가 아니다.

## 보안/운영 한계

GitHub Actions는 태그가 가리키는 과거 커밋의 Workflow를 실행할 수 있다.
이 리포지토리 코드의 새 Gate만으로 과거 버전의 Workflow를 소급 차단할 수는 없다.
GitHub 관리자에게 태그 생성·강제 업데이트 Ruleset과 GHCR write 권한 제한이
별도로 요구된다. 해당 설정은 이번 구현에서 **NOT VERIFIED**이며 완전한
우회 태그 방지로 주장하지 않는다.

`SCENE_AUTO_BUILD_ENABLED`와 `SCENE_CPU_WORKER_ENABLED`의 운영 기본 OFF,
이전 v0.60.0 App/Migrator digest/tag, 운영 .env/DB/CAD/Volumes는 불변이다.
#225와 #218 OPEN, #228 Draft/GO-INTEGRATE HOLD, GO-PILOT BLOCKED.

## 검증 계획 (실제 실행 전에는 NOT RUN)

- Python 정책: 0.60.0 이하 정상 공개 경로, 0.61.0/0.61.1/0.62.0 Main
  지속 HOLD, v0.61+ tag deny, 잘못된 Ref·SemVer·손상된 package.json 차단.
- 기존 release-scope Bash를 임시 Git 저장소에서 실제 실행하여 정상·오류·
  후속 Main 커밋·tag push·무관한 파일 포함 조합을 검증한다.
- Main release-scope의 `publish=false`, build job의 mutation 이전 사전
  정책 검사, 기존 #216 immutable source/tag checks 유지.
- PR CI의 정확 HEAD 성공, 미해결 리뷰 스레드·충돌 0을 확인한 뒤 별도로
  #228 GO-INTEGRATE 재판정한다. **#229 CI 자체는 GO-PILOT 승인이 아니다.**

실행: `python3 .github/scripts/test_issue229_release_hold.py`,
`cd src && npm test -- tests/unit/g7-staging-ghcr-guard.test.ts`.
정식 판정에는 해당 PR HEAD의 기존 Required CI를 모두 사용한다.
