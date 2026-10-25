# Issue #42 — U5 외곽선 업무 타입 지정·이름·JSON 메타데이터 (v0.35.0)

## 현황과 선행 조건 (2026-10-25)

- Epic #37, DXF 기하·선택 #31, 도구 ON/OFF #40, 비영속 타입 설계 시안 #41/PR #64.
- 실제 **서버 제공 활성·현재 Scope 타입 카탈로그는 아직 없다.** #65는 IdP/세션·Admin/Reader/Editor RBAC·Scope·감사 정책 미승인으로 OPEN/BLOCKED. #31 P4 역시 서버 원본 재검증과 영구 저장 승인 대기.
- 루트 `DESIGN.md`는 없음(404). 설계 기준은 AGENTS.md, Architecture.md, Decisions.md, Database.md 및 본 문서.
- 이번 PR은 **타입 메타데이터 계약·임시 확정의 선택적 경로·UI 게이트·v2 JSON 및 자동 테스트의 선행 개발**이다. 운영 U5 End-to-End **완료가 아니다.**
- #65 완료·보안 Owner 승인 전에는 DB migration, GET/POST/PATCH 타입 API, server-side outline write/reclassify, 임의 브라우저 lab 타입 연결을 만들거나 켜지 않는다.

## 구현 설계

1. `domain/outline-assignment.ts`: 서버로부터 제공될 `ScopedOutlineCatalog` 계약은 `versionId/sourceSha256/scopeKey/types[]`. 버전·SHA 대조, UUID ID·active·scope 및 100자 trim/NFC·Cc/Cf/Cs 거부·기본 이름 `외곽선 N`을 로컬 순수 함수로 검증. `scopeKey=null`인 #41 브라우저 실험 타입은 절대 사용 불가.
2. `viewer.tsx`: U3 ON 및 적합한 DXF/three-dxf-viewer일 때 타입 선택·이름 입력·'타입 지정 후 확정' UI 경로 노출. 실서버 카탈로그가 아직 없으므로 선택/확정 **disabled + #65 안내**. 해당 자료가 서버의 검증된 Context로 전달될 때만 활성화 설계. 클라이언트 메타데이터만으로 서버 권한이 성립하지 않음.
3. `ViewerManager` → `CadViewerAdapter` → `ThreeDxfViewerAdapter`: `confirmOutline(assignment?)`는 Worker/geometry를 재계산하지 않고 `result`와 별개의 `outlineTypeId/outlineTypeName/name`를 `SavedOutline`에 추가. 선택·Preview·Overlay·lifecycle 및 `kind=CONVEX|PRECISE` 불변.
4. `domain/outline-draft.ts`: 원래 type-less 브라우저 임시 결과는 이전의 **schemaVersion 1**으로 내보내며 기존 v1 import parser 호환. typed/mixed 세션은 **schemaVersion 2**로 내보내고, 각 outline에 이름·타입 ID·타입명 스냅샷을 독립 필드로 포함. 혼합의 기존 미분류는 세 필드 모두 명시적 `null`. import 시 v1/v2 모두 Version/SHA/stable Handle/algorithm/persistable/finite WCS 좌표 검증 유지. v2 타입 메타데이터 형식 검사도 추가. **v2 JSON 검증만으로 서버 신뢰/영속 쓰기 승인 불가.**
5. 이름 중복 허용: 별개의 `local-N` ID가 정체성이며 표시 이름은 중복 허용. 이름 생략·공백은 `외곽선 N` 기본값. 타입만 변경하면 좌표/원본 Entity ID/해시/algorithm이 변경되지 않는다.
6. **Legacy U3 유지**: 기존 '임시 확정'은 *미분류 브라우저 임시 결과*이며 영속 저장이 아니다. 타입 신규 확정 경로와 UI/JSON의 의미를 분리하고, #65 완료 시 신규 생성에 타입 필수 정책 전환 및 기존 미분류 UI 처리 방침을 다시 검증한다.
7. 트리뷰 #43: `SavedOutline`의 타입·이름·kind는 동일 메모리 목록에서 소비하도록 준비했지만 **트리 UI 자체는 이 이슈 범위가 아니고 아직 disabled**. Type rename은 JSON snapshot과 Live catalogue의 이름 차이가 가능하므로 ID를 실제 식별자로 사용한다.

## 추적: 요구사항 → 코드 → 테스트

| AC | 상태 | 현재 근거·잔여 |
| --- | --- | --- |
| U5-01 타입별/알고리즘 독립 | CODED / CI 미검증 | `resolveOutlineAssignment`, `confirmOutline`, `TC-U5-UNIT-001`. 서버 catalogue E2E 대기 |
| U5-02 필수·비활성·다른 scope·이름 | PARTIAL | `TC-U5-UNIT-002` fail-closed, E2E gate 001. 실서버 401/403와 활성 타입 조회는 #65 후 |
| U5-03 geometry/source SHA·kind 불변 | CODED / CI 미검증 | 별도 metadata 객체 + 기존 Worker 그대로, `TC-U5-UNIT-001`. Server recompute 승인 후 필요 |
| U5-04 v1/v2 및 U6 트리 | PARTIAL | `TC-U5-UNIT-003`, 기존 #31/#40 export 회귀. #43 타입 트리 자체 미구현 |
| U5-05 보안 승인 전 영속 차단 | CODE GATE | API/DB 미변경, UI disabled, `TC-U5-E2E-GATE-001`. 승인 후 401/403/cross-version/tamper/CAS 검증 필요 |

## 테스트와 배포

- 신규 Unit: `tests/unit/outline-assignment.test.ts` TC-U5-UNIT-001~003.
- 신규 Browser: `tests/e2e/issue42-outline-assignment-gate.spec.ts` TC-U5-E2E-GATE-001: 타입 API 404·Viewer 게이트·관리 메뉴 비활성.
- 기존 회귀: outline-draft, outline geometry/Worker, #31/40/41/38/39, renderer switching, legacy DB migration.
- 개발 환경 네트워크 제한으로 로컬 `npm ci/typecheck/lint/test/build/playwright` **NOT RUN**. PR CI workflow 실행으로 검증 요청, 결과 미확정. 실 DXF/GPU/native fullscreen/실 권한 통합 검증 별도.
- 원본 DXF/DB/Schema/외부 라이브러리 변경 없음. v0.35.0 SemVer MINOR·lockfile 동기화; rollback은 PR revert (기존 v1 내보내기는 유지).
- 사용자 요청은 **PR CI 시작까지**, Main 병합/GHCR/Issue close 및 CI 결과 모니터링은 수행하지 않음.

## 후속 통합 순서

Owner 보안·Scope·감사 승인 → #31 P4 IdP/RBAC·Server canonical geometry 재검증 → #65 DB/카탈로그 API/Scope 정책 → Viewer에 검증된 카탈로그 바인딩 → 타입 필수로 신규 확정 전환·레거시 재분류 정책 승인 → Server-side validation/409/audit/실 E2E → #43 타입 트리.
