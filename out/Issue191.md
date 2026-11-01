# Issue #191 — 위치 기준정보 계층 트리·선택 상세 편집

- 기준: [Issue #191](https://github.com/planner77/layoutManager/issues/191), [#24](Issue24.md), AGENTS.md, [Requirements](Requirements.md), [Architecture](Architecture.md), [Decisions](Decisions.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).
- 구현 브랜치: feat/issue-191-master-tree-20261101, 기준 Main 327ac0c13534d240c2880eb293c77e5cf44736a4.
- 루트 DESIGN.md는 없음. 이 문서와 Architecture/Decisions가 설계 기록이다.
- 범위: /masters 화면을 좌측 단일 트리·우측 선택 상세/편집/삭제 확인으로 교체. 업로드 5단계 선택, 도면 목록, 재분류, G7 인가 계약은 변경하지 않음.

## 설계 결정과 상태 모델

1. **Source of truth**: GET /api/masters?active=false|true의 중첩 DB tree, 서버 이름 오름차순/불변 UUID/Parent FK를 그대로 사용. Client master-tree.ts의 buildMasterTree가 각 노드에 type:id 키, 수준(0–4), 부모 키, 조상 키와 전체 표시 경로를 부여한다. DnD, 상위 소속 변경 없음.
2. **반응형 UI**: lg 이상 트리/상세 2열, 좁은 화면 1열. 기존 5개 입력 열을 폐지한다.
3. **탐색**: 기본 사업부·제품 가지 확장. 확장과 선택은 별도 클릭 표면이다. role=tree/treeitem/group, aria-level/expanded/selected와 roving tabIndex. Arrow Up/Down/Home/End로 가시 노드 포커스, Right/Left로 확장·자식·상위, Enter/Space로 선택; Tab으로 상세 작업 이동.
4. **검색**: 이름에 전체 계층 매칭, 일치 노드와 모든 조상 포함. 검색 중 조상을 임시 확장해 원래 expanded 상태 보존. 비활성 표시 OFF는 GET active=true를 따르며 사라진 선택·편집 컨텍스트를 해제한다.
5. **CRUD 상태**: view/create/edit/delete, draftName/draftKind/draftActive를 분리. 노드 선택은 서버 쓰기를 하지 않으며 저장/삭제 확인으로만 쓰기 수행. 최초 사업부와 선택 직계 하위만 생성. 성공 후 GET 재조회, 생성 ID 자동 선택·부모 확장, 삭제 후 부모 선택. 저장 중 중복 쓰기·오래된 GET 결과 차단.
6. **불변/안전 삭제**: isUnclassified 제품 이름 잠금 및 PATCH name 생략; id/parentId/isUnclassified 변경 없음; 사이트 종류는 SITE/LEGAL_ENTITY. 삭제 확인에 유형·전체 경로 표시. MASTER_REFERENCED/409에서는 비활성화 대안. 층은 Current 유무와 무관하게 /cad/locations/{id} 연결.
7. **비활성 경로**: UI의 전체 ancestor-active 검사 + 서버 MasterRepository.create 트랜잭션에서 직계·조상 active 검사. 직접 POST도 INVALID_PARENT/409 거부. 기존 이력 조회·Current/UUID/원본 bytes는 영향 없음.
8. **인가**: POST/PATCH/DELETE runtimeCadHeaders, Signed G7 Runtime/Session/Role/Site Grant, Origin/CSRF와 서버 Audit 게이트 그대로. UI disabled는 인가 근거 아님. 401/403/503/409 서버 메시지 전달·실패 시 Draft 보존.
9. **재조회 실패**: GET 오류에서 stale tree/상세 제거; 쓰기 성공-GET 실패에서는 재쓰기 금지, 별도 새로고침 안내. 성공/오류 메시지 분리.

## API·DB 변경 범위

| 대상 | 변경 |
|---|---|
| GET /api/masters | 없음. 기존 DTO/active 필터 |
| POST /api/masters | Payload 불변; Repository에 트랜잭션 내부 활성 조상 검증 추가 |
| PATCH /api/masters/{type}/{id} | 없음. name/kind/active, 불변 필드 제외 |
| DELETE /api/masters/{type}/{id} | 없음. 참조 FK 차단, cascade 없음 |
| Prisma schema/migration | **변경 없음** |
| CAD Version/Current/Source/SHA, 운영 DB·Volume/Auth 활성화 | **변경 없음** |

## 시험 매트릭스

| TC | 검증 | 파일 |
|---|---|---|
| TC-191-UNIT-01 | 5단계 키·부모·경로·Site 종류·미분류 | src/tests/unit/master-tree.test.ts |
| TC-191-UNIT-02 | 검색 조상 경로, 검색 중 임시 확장, 초기화/미검색 | 동일 |
| TC-191-UNIT-03 | 비활성 자기/조상 경로 | 동일 |
| TC-191-INTEGRATION-01 | 직접 POST 비활성 조상 차단, DB 원자성, 활성 복구 | src/tests/integration/master.test.ts |
| TC-191-E2E-01/02/04/05/06 | CRUD, 검색, 상태/삭제, 키보드, 이력, 좁은 화면 | src/tests/e2e/master.spec.ts |
| TC-191-E2E-03 | 빈 상태, 검색 0건, GET 503 stale 상태 차단·재조회 | 동일 |
| 기존 TC-MASTER/Greenfield/G7 | Upload dropdown, Current/History, Bootstrap Admin/권한/CSRF/Audit 회귀 | 기존 CI |

## 검증 및 후속 경계

- 이 문서 작성 시 로컬 TypeScript/ESLint/Vitest/Playwright/Build/Docker **NOT RUN**, 신규 PR CI **NOT VERIFIED**. 정확한 Run/Job/HEAD 증거 없이는 PASS로 기재하지 않는다.
- main 대상 PR 생성이 .github/workflows/pr-ci.yml pull_request.opened 이벤트로 Verify/Browser/G7/Greenfield/Docker CI를 시작한다. Owner 요청에 따라 CI의 완료 결과 모니터링은 생략한다.
- GHCR 게시·병합·Issue 종료·현장 수용은 별도 승인. 실제 CAD 반출, 운영 DB migration·Writer 활성화 없음. 실패가 확인되면 정확 Run/Job/HEAD·원인·수정을 FailureLedger에 누적 기록한다.
