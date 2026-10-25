# Issue #68 — GitHub Actions 실행명 표준화

Date: 2026-10-25 · Scope: CI workflow metadata and documentation only · Status: PR validation pending

## 목적

- GitHub Actions Run 목록에서 **Run Type | Issue 참조 | 간략 설명** 순서로 확인한다.
- **Issue 번호는 PR 번호와 다르다.** GitHub Actions가 실행 시작 전에 평가하는 최상위 `run-name`은 `github` / `inputs` 컨텍스트만 지원하므로, 별도 조회 Step에서 추출한 Issue 번호를 사용할 수 없다.
- `DESIGN.md`는 현재 repository에 없으며, CI 경계의 설계 판단은 [Decisions](Decisions.md) ADR-038을 따른다.

## 표준

| Trigger | 표시 Run Type | 입력 기준 | 예시 |
| --- | --- | --- | --- |
| `pull_request` | `PR CI` | PR 제목을 `#68 \| Actions 실행명 정리`와 같이 시작 | `PR CI \| #68 \| Actions 실행명 정리` |
| `workflow_dispatch` | `MANUAL CI` | `issue_ref`, `run_description` | `MANUAL CI \| #68 \| CI 재검증` |
| `push: main` | `MAIN/GHCR` | squash merge **커밋 제목**에 `#68 \| Actions 실행명 정리` 지정 | `MAIN/GHCR \| #68 \| Actions 실행명 정리` |
| `push: v*.*.*` | `RELEASE` | 버전 태그에 특정 Issue 강제 연계하지 않음 | `RELEASE \| NO-ISSUE \| v0.35.0 GHCR 이미지 게시` |

연관 이슈가 실제 없으면 PR 제목/커밋 제목을 `NO-ISSUE | 설명`으로 시작한다. PR 및 main 커밋 제목이 위 규약을 따르지 않으면 `ISSUE-UNKNOWN`을 접두에 붙여 *확인 불가*를 명시한다. Issue가 없다고 단정하지 않는다. 수동 실행의 Issue 참조 기본값은 `NO-ISSUE`이다.

## 기술적 제약과 운영 규칙

1. `pull_request` 이벤트에서 `github.event.pull_request.number`는 **PR 번호**이며 Issue 번호가 아니다. 사용하지 않는다.
2. 자동 Run의 제목/설명은 PR 제목·squash commit subject에 입력해야 한다. 예: `#42 | 외곽선 타입 지정`. 임의 문구에서 `#숫자`를 정규식 파싱할 수 없으므로 커밋/PR 형식을 표준화한다.
3. GitHub Expressions `startsWith`로 `#` 또는 `NO-ISSUE |` 시작 여부를 분기한다. 정확한 숫자 형식을 정규식으로 검증하는 기능은 `run-name`에 없으므로 PR 작성자가 제목을 확인한다.
4. `github.event.head_commit.message`는 제목 외 커밋 본문도 포함할 수 있으므로 **첫 줄을 간결하게 작성**한다. Actions UI가 긴 메시지를 생략할 수 있다. squash merge에서는 기본 생성 문구를 확인하고 제목을 명시적으로 수정한다.
5. PR 제목 수정만으로 기존 실행 이름이 변경되지는 않는다. 기존 `pull_request` trigger(열기·새 커밋·재오픈·Ready)로 다음 Run을 시작해야 한다. 과거 Run은 소급 변경하지 않는다.
6. 수동 `workflow_dispatch`는 기본 브랜치에 Workflow가 반영된 이후에 Actions의 입력 폼에 나타난다. 자동 PR run과 별개이다.
7. Release 워크플로는 `main` push에서도 버전 이미지 조건을 확인한다. Run type `MAIN/GHCR`은 *게시 성공*을 의미하지 않는다. Job/permission/concurrency/이미지 쌍 게시 정책은 불변.

## 수용 테스트

| ID | 입력/시나리오 | 기대 값 | 상태 |
| --- | --- | --- | --- |
| TC-CI-NAME-001 | PR 제목 `#68 | Actions 실행명 정리` 후 PR opened/synchronize | `PR CI | #68 | Actions 실행명 정리` (Issue 68, PR 번호와 구별) | PR Run 확인 전 |
| TC-CI-NAME-002 | PR 제목 `NO-ISSUE | 환경 문서` 또는 비정형 `docs: something` | 각각 `PR CI | NO-ISSUE | 환경 문서`, `PR CI | ISSUE-UNKNOWN | docs: something` | 정적 검토 |
| TC-CI-NAME-003 | 수동 issue_ref `#68` / run_description `CI 재검증`; 기본값 | `MANUAL CI | #68 | CI 재검증`; `MANUAL CI | NO-ISSUE | 수동 검증` | main 반영 후 가능 |
| TC-CI-NAME-004 | main squash subject `#68 | Actions 실행명 정리`, `NO-ISSUE | 정리`, 비정형 제목 | `MAIN/GHCR` + 적절한 참조·설명 / 비정형은 `ISSUE-UNKNOWN` | main push 미실행 |
| TC-CI-NAME-005 | tag `v0.35.0` | `RELEASE | NO-ISSUE | v0.35.0 GHCR 이미지 게시` | tag push 미실행 |
| TC-CI-NAME-006 | workflow 구문 및 기존 triggers/jobs/concurrency/permissions diff | 실행 정책·GHCR 배포 로직 불변 | 문자열 diff 검증: 기존 PR trigger와 두 YAML의 permissions/concurrency/jobs/main push 로직 동일. Actions YAML 서버 평가 미확인 |

**작성 후 정적 점검:** 신규 형식·이슈 없음·비정형 PR/Main·tag·manual 7개 fixture의 명명 로직과 두 YAML 기존 실행 구간의 diff를 검사했다. 이는 Actions parser/Runner 검증을 대체하지 않는다.

실행하지 않은 CI, Main 이미지 게시, tag 검증은 PASS로 기록하지 않는다. 실제 Run ID와 Head SHA를 확인한 뒤 결과를 갱신한다.

## 영향

App/DXF/DWG/DB/Prisma/Dockerfile/버전 및 GHCR tag 생성 정책 변경 없음. 워크플로 제목, 수동 실행 폼, 개발 협업 규칙만 변경한다. 롤백은 본 변경 revert로 가능하다.
