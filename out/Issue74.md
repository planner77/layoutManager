# Issue #74 — Main CI 실행명 긴 commit body 회귀 방지

Date: 2026-10-25 · Scope: GitHub Actions run-name metadata, squash merge operations · State: implementation proposed / GitHub real-event validation pending

## 실제 회귀 증거

| Run | Event | 표시명 / 분석 |
| --- | --- | --- |
| [Main #34 / 40158498214](https://github.com/planner77/layoutManager/actions/runs/40158498214) | main push, SHA 38f05e0 | `MAIN CI | #68 | Actions Run Type·Issue·설명 표시 및 GHCR 게시 제외` — 정상 단일행 commit |
| [Main #35 / 40159667229](https://github.com/planner77/layoutManager/actions/runs/40159667229) | main push, SHA 306ffda | `MAIN CI | #42 | ...` 뒤에 `Refs #42, #37...` 등 commit body가 모두 포함 |
| [Main #36 / 40162889687](https://github.com/planner77/layoutManager/actions/runs/40162889687) | main push, SHA d948b06 | `MAIN CI | #43 | ...` 뒤에 PR 및 QA 범위 설명 body까지 포함 |

원인: push payload의 `github.event.head_commit.message`는 **commit subject+body 전체**이다. 저장소 설정 API 조회 결과 `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES`; 기본 squash merge에 다중행 message가 추가될 수 있다. [GitHub Actions run-name 공식 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name), [Expressions 지원 함수](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions), [저장소 설정 API](https://docs.github.com/en/rest/repos/repos#update-a-repository).

## 설계 결정

1. **일상 경로:** PR 제목과 squash commit subject는 `#N | 짧은 설명` 또는 `NO-ISSUE | 짧은 설명`, 한 줄, 권장 80자 이내. 이때 현재 `MAIN CI | #N | 설명` 표현식이 그대로 적용된다.
2. **정확한 영구 해결:** GitHub 저장소 Settings → General → Pull Requests → Allow squash merging → Default commit message **Pull request title**. API 값 `PR_TITLE / BLANK`. 현재 확인되는 기본값은 다르며 **자동 수정 권한·도구가 없어 미적용**이다. Agent/REST `merge_pull_request` 호출 시 `merge_method=squash`, `commit_title='#N | 설명'`, `commit_message=''`를 전달해 기본 본문 추가를 막는다.
3. **임의 Push 예외:** `run-name`은 Job 실행 전 `github`/ `inputs`만 접근하므로 `git log -1 --format=%s` 및 JS `split` 불가능. `contains(message, fromJSON('"\\n"'))`으로 LF를 식별한 경우 고정된 `MAIN CI | SUBJECT-ONLY-REQUIRED | run N`을 사용한다. 번호/요약을 추측해서 잘못 표기하는 대신 예외를 명확히 보인다.
4. **불변 사항:** `.github/workflows/docker-publish.yml`의 `on:` 이하, `pr-ci.yml`, GHCR release-scope, Job gate/concurrency/permissions, App/DXF/DB/버전 변경 없음. Main push가 문서/Workflow만 바꿨다면 기존 게이트에 따라 GHCR 게시 생략.

## 검증 / 제약

- [TC-CI-NAME-007~011](TestPlan.md)로 단일행 #Issue·NO-ISSUE / 다중행 / tag / 설정을 구분.
- 변경 Workflow의 `on:` 이후가 원문과 **동일**한지 문자열 기준으로 비교. run-name 내 `fromJSON`/조건 분기와 fallback을 정적 확인.
- PR CI·Main CI 실제 실행명/실제 GHCR 게시 결과는 **각 workflow 실행 후 별도 확인**해야 하며, PR CI만으로 MAIN display 검증을 통과 처리하지 않는다.
- 과거 #35/#36 run-name은 재기록 불가. 저장소 설정 변경 권한이 있는 주체가 `PR_TITLE / BLANK` 적용 후 API로 재조회해야 전체 완료.
