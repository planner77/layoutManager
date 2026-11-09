# Owner Managed — 소규모 사내망 개발·배포 운영 표준

> **2026-11-09 Owner 결정 / #279.** 보호된 조직 내부 네트워크, 사용자 50명 이내, 개발·배포·운영·유지보수 전담 전문가가 없는 환경을 기준으로 한다. 기본은 단순한 Owner 승인과 재사용 가능한 검증이다. 이 문서는 기존 상세 이력을 삭제하지 않으며, 일반 업무에 대한 오래된 반복 승인/중복 QA 지시보다 우선한다.
>
> **이번 PR은 운영 정책 및 PR CI 이벤트만 변경한다.** 활성 Ruleset, GitHub Environment, GHCR, tag, 운영 서버의 DB/CAD/Volume/.env/백업을 변경하거나 출시·배포를 승인하지 않는다.

## 1. 우선순위와 예외 기준

| 구분 | 일반 변경의 기본값 | 추가 게이트가 필요한 실질 위험 |
| --- | --- | --- |
| 개발·리뷰 | 관련 기능을 가능한 하나의 PR에서 구현, 기존 코드/테스트/근거 재사용 | 코드 리뷰의 미해결 보안 결함·충돌, 실제 재현된 실패 |
| PR CI | 최종 exact HEAD의 필수 aggregate check 1회 성공; Draft→Ready만으로 재실행하지 않음 | HEAD 변경, 필수 check 실패/취소/누락, 범위가 다른 근거 |
| 승인·병합 | Owner의 명시적 지시 또는 직접 Squash 병합을 승인으로 사용; 요구 승인 리뷰 0회 | Owner가 별도 GO를 지정한 운영/출고 변경 또는 보안·데이터 위험 |
| Main | 정상 병합 후 해당 Main SHA의 CI 실행·성공 확인; 같은 SHA 증거 재활용 | GitHub_TOKEN으로 병합해 자동 push CI가 시작되지 않는 경우 명시적 dispatch |
| GHCR | #229의 자동 Publisher HOLD를 따른다; 코드 병합은 릴리스 GO가 아님 | 3-role 이미지 출처/서명/불변 digest, 부분 게시, 원격 쓰기 불확실성 |
| Issue | 명시된 해당 Issue 수용 기준 확인 후 종료 | 상위/후속 AC 미완료, 다른 릴리스에만 유효한 증거 |

예외는 **실제 위험**이 있는 경우에 한정한다: 데이터 손실·복구 및 비가역 DB migration, 인증·권한·secret 변경, 새로운 외부 접근, 불변 이미지/태그 출고, 출처 불명 OCI, 실패·취소·부분 완료, 실제 보안 취약점. 예외라 하더라도 새 QA 조직/대규모 승인 체계를 만들지 않고 한 번의 Owner GO로 **정확히 지정한 범위**를 집행한다.

## 2. 일반 PR의 표준 작업 — 복잡한 Finalizer 불요

1. **계획:** 연관 Issue/의존성을 확인한다. 구현 범위가 겹치면 하나의 PR을 우선 사용한다. 범위 외/미구현은 별도 이슈로 분리하고 성공한 이전 근거는 source·SHA·scope가 같으면 재사용한다.
2. **구현:** 필요한 코드·문서·직접 회귀 검증을 한꺼번에 작성하고, 가능하면 최종 commit 1회 후 PR을 연다. 실패 원장은 **실제 실패/원인/보완/결과**가 있을 때 갱신하고 과거 기록은 삭제하지 않는다.
3. **CI:** `pr-ci.yml`의 `opened/synchronize/reopened`로 자동 PR CI를 시작한다. `ready_for_review`는 단독 트리거가 아니다. 코드/Workflow 변경이면 full scope, Markdown-only면 검증된 docs-only scope가 동작하지만 최종 `Typecheck, lint, test, build, E2E` required check는 유지한다. 정확 HEAD CI가 성공했다면 Ready 상태 전환만으로 새 CI를 요구하지 않는다.
4. **GO-INTEGRATE:** 최신 HEAD와 required CI, unresolved review threads 및 mergeability/branch 상태를 확인한다. Owner의 해당 PR 병합 지시가 이미 있다면 또 묻지 않는다. GitHub에서 0 required approving review는 **Owner 의사 표시 생략**이 아니라 스스로 Approve 리뷰를 요구하지 않는 구성을 뜻한다. 검증되면 **Squash**로 병합하고 실제 merge SHA를 확인한다.
5. **Main CI:** 해당 Main SHA의 실제 CI 성공을 확인한다. 이미 동일 SHA로 성공한 run을 재사용한다. 자동 push CI가 없는 `GITHUB_TOKEN` 기반 merge에 한해 `main-hold.yml`을 정확 source로 명시 dispatch한다. 기존 자동 run이 있으면 중복 dispatch하지 않는다. 사용자가 모니터링 생략을 지시했으면 **시작 확인까지만** 수행하고 성공으로 표현하지 않는다.
6. **게시·종료:** `#229` 자동 GHCR HOLD가 적용되면 이미지 미게시가 정상이고, 이를 Main CI 실패로 오해하지 않는다. GHCR 릴리스, 새 기능 운영 배포/Worker 설정 변경은 별도의 정확 버전 Owner GO다. 해당 이슈 AC가 완전히 충족되면 종료한다. 새로운 릴리스/운영 AC가 남아 있으면 OPEN 또는 후속 이슈로 분리한다.

### 중복 실행·재사용 규칙
- 이벤트만 변하고 HEAD/검증 조건이 동일하면 이전 **완료 성공**을 우선 사용한다. 새 HEAD나 실제 실패에 대해서는 성공 증거를 소급 적용하지 않는다.
- CI 취소/실패는 통과가 아니다. 원인을 고친 다음 필요한 범위만 재검증하되 필수 aggregate를 우회하지 않는다.
- 임의 workflow_dispatch/manual rerun은 자동 재시도하지 않는다. 특히 원격 GHCR partial/unknown write는 중단 후 읽기 전용 점검.
- **일반 PR에서는 RF01→RF04의 패킷/서명/복수 보호 환경 승인 절차를 요구하지 않는다.** RF Finalizer는 사용자가 별도 Release GO를 승인하고 정확한 OCI 출고가 필요한 작업에만 적용한다.

## 3. 보호 규칙 — 실제 조회값과 관리자 변경 준비

2026-11-09 GitHub read-only 조회. 실제 설정은 GitHub Settings → Rules → Rulesets에서 확인한다.

| 대상/ID | 현재 live 상태 | 1차 목표 | 향후 선택 변경 |
| --- | --- | --- | --- |
| main `issue225-main-release-source` / `26731716` | PR 필수; Squash만; 승인 리뷰 0; 리뷰 스레드 해소 필수; 정확 required check `Typecheck, lint, test, build, E2E` (App 15368); up-to-date strict=**true**; 삭제/강제 push 금지; bypass 없음 | **변경 없이 유지**. 이미 Owner-managed 기본값에 부합 | 여러 병렬 PR의 불필요한 base sync가 반복되면 strict=false 후보 검토 |
| tag `issue231-release-tags-hold` / `26731135` | `refs/tags/v*` 생성·수정·삭제 제한; bypass 없음 | **변경 없이 유지** | 출고 경로 전환 시 source/immutable 과거 tag를 지키는 승인된 좁은 예외만 별도 검토 |
| 기존 Environment / #229 HOLD / RF-03 | 보호된 Candidate/Promotion 승인 및 독립 출고·서명 검증 | **변경 없이 유지**; 일반 PR 승인과 혼동하지 않음 | 릴리스 실무를 간소화하더라도 정확한 OCI/digest/Owner 승인/unknown halt 보존 |

**중요 결합:** 현재 `src/tests/oci/release_finalizer_integrate.py::check_ruleset`은 Ruleset ID 및 `strict_required_status_checks_policy is True`를 강제한다. 관리자 UI에서 strict=false만 단독 변경하면 RF-02 검증이 차단된다. 변경하려면 다음을 **함께** 준비해야 한다.

- RF-02의 규칙 검증과 테스트를 변경된 strict 정책에 맞추고, exact HEAD 필수 CI, stale PR HEAD, main 충돌, 미해결 스레드, wrong source/owner, missing check에 대한 거부 시험을 유지.
- 먼저 PR에서 검증·병합하고 관리자 화면에서 규칙 변경 후 Rulesets API로 실제 적용값 읽기. 한 번에 둘 다 바꾸지 말 것.
- 문제가 생기면 **직전 Ruleset 값을 복원**하고 해당 Main SHA와 RF-02 gate를 다시 읽기 전용 확인한다. 강제 push, bypass, 기존 태그 재작성으로 우회하지 않는다.
- strict=true→false는 **선택 사항**으로 이번 준비 PR의 완료 조건은 아니다. 실제 GitHub 권한 관리 설정 변경은 Owner의 후속 승인 후만 실시한다.

## 4. 특별 변경 — 필요한 증거만 유지

- **Release:** #229 `HOLD_MAIN` / `G7_RELEASE_HOLD_TAG_BLOCKED`는 지속. 버전·source/tree·3-role OCI 이미지·signed candidate·immutable digest·rollback baseline을 묶은 Owner GO 후 승인된 경로로 출고한다. `latest` 및 과거 태그를 암묵적으로 이동하지 않는다.
- **운영 배포·migration:** 코드 병합/이미지 출고와 실제 Docker 전환은 별개. 현재 DB/도면·백업 기준 확인, 새/기존 상태 구분, 복구 절차·실제 확인 결과를 기록한다. 숫자 RPO/RTO SLA가 없다는 사실만으로 새 승인 요구를 만들지 않는다.
- **불확실한 외부 쓰기:** 부분 출고, 권한 오류, timeout/불완전 응답은 자동 재시도·overwrite·cleanup을 금지하고 실제 원격 상태를 읽기 전용으로 정합화한다.
- **Issue #273:** 기존 Release Finalizer는 기술적으로 별도 릴리스 고위험 기능의 현행 계약이다. 이 문서만으로 새로운 Release GO를 부여하거나 기존 RF01–RF04 실제 AC를 완료했다고 보지 않는다.

## 5. 변경 순서 / 인수 확인

**1차 (이 PR):** 가이드 및 AGENTS/Decisions/Operation 정본 추가, `pr-ci.yml`의 Ready 전환 이벤트 제거, 이벤트/required check 회귀 검사. Draft PR/새 HEAD required CI를 확인하고 Owner GO 전 병합하지 않음. 기존 [PR #275](https://github.com/planner77/layoutManager/pull/275)는 동일 한 줄 변경을 포함하므로 병합 순서에 따라 중복 PR 정리 (무단 수정·닫기 금지).

**2차 (선택, 별도 변경):** strict=false 채택 시 RF-02/테스트를 선행 보완하고 Owner 승인을 받은 뒤 Ruleset 관리자 수정·readback·복구 검증. 일반 PR 경로를 우회하지 않는지 확인.

**3차 (릴리스 프로세스 개선 필요 시):** #273/#229/Tag/Environment 승인 단계를 단순화할 실증을 별도 설계한다. 기존 태그/OCI/운영 데이터의 비가역 변경은 새 Owner GO 없이는 실행하지 않는다.

**이번 PR 검증 목록:** Markdown 정책 우선순위 명확, PR event 필수 `opened/synchronize/reopened`, Ready 단독 트리거 부재, aggregate check 이름 불변, 기존 `pr_ci_scope.py`의 docs-only/full fail-closed 분기 불변, Main/Tag Ruleset 및 GHCR/운영 미변경. PR CI 실행 후 성공 여부를 실제 결과와 구분하여 기록한다.

관련 문서: [AGENTS](../AGENTS.md), [Decisions](Decisions.md), [Operation](Operation.md), [FailureLedger](FailureLedger.md), [Issue #273](https://github.com/planner77/layoutManager/issues/273), [Issue #229](https://github.com/planner77/layoutManager/issues/229), [Issue #231](https://github.com/planner77/layoutManager/issues/231), [Issue #279](https://github.com/planner77/layoutManager/issues/279).
