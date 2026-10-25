# Issue #76 — GitHub Squash Merge 기본 커밋 메시지 정책

Date: 2026-10-25 · Scope: GitHub repository admin setting / read-only CI audit / operator guide · State: **admin setting NOT APPLIED**

## 목표·근거

- [Issue #68](https://github.com/planner77/layoutManager/issues/68) 실행명 계약: PR/squash subject는 `#<Issue> | 짧은 설명`; main Actions 제목은 `MAIN CI | #<Issue> | 설명`.
- [Issue #74](https://github.com/planner77/layoutManager/issues/74) / [PR #75](https://github.com/planner77/layoutManager/pull/75)의 multiline 보호는 **안전 폴백**일 뿐, 기본 Squash 메시지를 고치지 않는다. Main #35/#36에서는 body가 실행명에 유입됐고, Main #37은 명시적인 빈 merge body로 정상 표시됐다.
- 2026-10-25 REST `GET /repos/planner77/layoutManager` 실제 응답: `allow_squash_merge=true`, `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES`. 목표 `true / PR_TITLE / BLANK`.
- 프로젝트 Root에는 `DESIGN.md`가 없다. [Architecture](Architecture.md)·[ADR-041](Decisions.md)·[Operation](Operation.md)을 설계 근거로 사용한다.

## 구현 범위 / 경계

1. `.github/workflows/pr-ci.yml`의 Verify 초기에 GitHub REST repository metadata를 **GET만** 호출하는 감사 단계를 추가한다. 허용된 CI token은 인증 헤더로만 전달하고 로그·아티팩트에 출력하지 않는다. `allow_squash_merge`, `squash_merge_commit_title`, `squash_merge_commit_message` 3개만 비교한다.
2. 정확히 `true / PR_TITLE / BLANK`일 때만 `PASS`; 다른 유효 응답은 `NOT APPLIED` 경고·Job Summary; API 오류·JSON 파싱 오류는 `NOT VERIFIED` 경고·Summary. **세 경우 모두 advisory step exit 0**: 관련 없는 PR 검증을 정책 설정 문제로 차단하지 않는다. 이 로그를 설정 완료 증거로 삼지 않는다.
3. 관리자 설정 변경 권한을 제공하는 GitHub 연결 도구가 없어, repo 관리자 UI/인증 REST `PATCH`를 호출하지 못했다. **관리자 기본값 변경·실제 Main 새 run 재현은 미완료**. 읽기 전용 검사와 운영 문서/테스트를 구현 범위로 한정한다.
4. 기존 Main multiline fallback, PR/Release run-name, GHCR 이미지 pair/게시 gate, workflow trigger·permissions·concurrency, 앱 code/package version/DB/설비 도면 데이터는 변경하지 않는다. Markdown+Workflow YAML만 바뀌므로 #68의 Main docs/workflow-only 변경 시 GHCR 제외 정책이 적용되어야 한다.

## 관리자 완료 절차 (수동)

1. [저장소 General 설정](https://github.com/planner77/layoutManager/settings) → **Pull Requests** → **Allow squash merging** 활성 유지 → **Default commit message** = **Pull request title**를 선택한다. [GitHub 공식 안내](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).
2. 변경 후 인증된/공개 repo REST `GET /repos/planner77/layoutManager`에서 정확히 `allow_squash_merge=true`, `squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=BLANK`를 재확인한다. `PATCH` 가능 관리자 권한이 있다면 공식 [Update a repository](https://docs.github.com/en/rest/repos/repos#update-a-repository)의 해당 2개 속성만 변경하고 성공 후 다시 `GET`. 여기서는 **자동 설정 PATCH를 수행하지 않는다**.
3. 다음 **정상 PR** 제목을 `#N | 간략한 설명` (권장 80자 이내)로 작성하고 Squash Merge의 기본 subject·본문(빈 문자열)을 확인한다. API/Agent 병합 시 계속 `merge_method=squash`, `commit_title='#N | 설명'`, `commit_message=''` 명시.
4. 실제 main commit `%s`는 한 줄 `#N | 설명`, `%b`는 빈 문자열인지 확인하고, 해당 main push의 Actions 실행명을 `MAIN CI | #N | 설명`으로 확인한다. 이전 #35/#36 실행명은 소급 변경 불가.
5. 이슈의 수용 체크박스는 관리자 UI/API 재조회 및 **새 Main Run**의 객관적 증거를 모두 확보한 후만 완료한다. PR CI audit 경고가 사라져도 Main 동작 검증을 대신하지 않는다.

## Acceptance / 테스트 추적

| AC | 검증 | 현 상태 |
| --- | --- | --- |
| AC-76-01 Repo 기본값 `PR_TITLE/BLANK`로 실제 변경 | 관리자 Settings + REST GET 3항목 | **BLOCKED / NOT APPLIED** |
| AC-76-02 설정 변경 여부를 안전하게 진단 | TC-CI-76-001~004; PR Job Summary | Bash 샘플의 4 fixture 검증, 실제 PR CI 대기 |
| AC-76-03 새 정상 Squash main subject/body/Run 이름 | TC-CI-76-005, 실제 main push | **NOT RUN** |
| AC-76-04 GHCR 등 다른 CI 계약 불변 | TC-CI-76-006, Workflow diff | 정적 검사, 실제 PR CI 대기 |

실제 REST 설정 조회는 위 **불일치** 증거이며, GitHub Runner/관리자 UI에 대한 실행 성공은 아니다. [TestPlan](TestPlan.md)·[TestReport](TestReport.md)·[Operation](Operation.md) 참고.
