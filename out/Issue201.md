# Issue #201 — 외곽선·구역 단일 트리와 Version별 분류

## 상태와 실행 책임 (2026-11-13)

원 요구: [GitHub #201](https://github.com/planner77/layoutManager/issues/201). 기준 Main `598265b`, 소스0.62.0. Manager가 아래 요구·ADR·AC·TC를 **구현 지시 전에** 기록했다. 상태: 구현 승인 / 시험 NOT RUN. 최신 #279/#281 정책에 따라 PR0·Actions0, root가 최종 commit/push 및 #282 출고를 맡는다. Manager→Developer→독립 QA→Manager 인수 순서다. 요청된 gpt-5.6-sol Developer/gpt-5.6-luna QA는 제공 모델에 없어 실제 실행은 상속된 사용 가능 모델이 대행하며, 실제 주체와 시험은 TestReport에 기록한다.

## 요구와 확정 ADR

- **ADR-T201-01 단일 합성 뷰**: Version 루트에 폴더 및 가상 미분류를 두고 개별 Outline과 최상위 Zone을 함께 표시한다. Zone child/grandchild는 항상 기존 parentZoneId 아래 표시한다. 도메인 객체 CRUD와 상세 편집의 기존 소유권은 유지하되 별도 Outline/Zone 트리를 동시에 마운트하지 않는다. 기존 목록 메뉴는 같은 패널의 초기 종류 필터/선택으로 연결하며 `작업 > 외곽선·구역`에서 전체 탐색을 제공한다. 메모는 독립이다.
- **ADR-T201-02 독립 분류**: 폴더는 기하 없는 Version 소유 조직 정보다. `OutlineType`, Site `ZoneCategory`, `CadZone.parentZoneId`, 위치 마스터 및 Scene을 수정하지 않는다. Outline membership은 해당 Version 객체만, Zone membership은 동일 Location의 live root Zone만 허용한다. 자식 Zone 직접 분류 금지; root 이동은 서브트리 표시 위치만 바꾼다. Zone가 기존 API로 reparent되면 child의 과거 membership은 조회에서 비활성 취급하고 root가 될 때 재활성하지 않도록 안전한 정리/정책을 구현·시험한다. V2로 folder/membership/geometry 자동 복사0.
- **ADR-T201-03 영속성과 CAS**: `TreeFolder`(UUID/version/parent/name/sort/revision/actor/time/tombstone), `TreeMembership`(Version+kind+object unique/folder nullable/revision), `TreeAudit` append-only sidecar를 추가한다. 정본 구조는 Database. 이름 trim+NFC, 유효 길이 제한; sibling live duplicate 차단. 폴더 self/cycle/cross-Version/deleted parent 거절. 각 mutation은 expectedRevision, parent/target-folder CAS를 포함하고 membership 최초 생성 expectedRevision=0이다. Folder move는 현재 그래프를 직렬 transaction 안에서 검사한다. 폴더/소속 정렬은 명시 sortOrder로 저장한다. DB FK/trigger도 교차 Scope와 immutable identity를 차단한다.
- **ADR-T201-04 삭제와 협업**: 동일 Site의 Editor/Admin은 폴더 생성/이름/부모/정렬과 분류 이동을 공동 편집한다. Folder 삭제는 creator 또는 해당 Site Admin만, live child 또는 live membership이 있으면409이다. 분류 해제/소속 이동 후에만 빈 폴더를 soft delete하며 원본 Outline/Zone 삭제나 cascade는 없다. 분류 편집은 기존 객체 삭제/수정 권한을 부여하지 않는다. 대상 객체가 기존 API에서 삭제되면 읽기에 노출/카운트하지 않고 해당 tombstone membership은 내용있는 폴더 판정에 포함하지 않는다.
- **ADR-T201-05 API 보안**: Version-derived Site, G7 ACTIVE signed session/current grant/Reader read 및 Editor/Admin write, Origin/CSRF, runtime write gate, schema assertion를 매 요청 검사한다. client actor/site는 신뢰하지 않는다. mutation과 안전 감사는 동일 transaction; 감사 실패 rollback, 불필요한 이름/검색/설명 전문 감사0. GET은 private no-store/Vary Cookie. OFF는 status로 정상 안내하며 tree API probe0. BLOCKED/구 schema/GET실패는 데이터 제거+안내+재시도. 승인된 데이터만 합성하여 검색 건수 누출0.
- **ADR-T201-06 UI 세션**: 공통 MovableViewerPanel 한 개, 기존 제목 handle/위치복원/320px 단일 Drawer/ESC 한단계/nested modal/fullscreen 계약을 사용한다. 종류 아이콘·텍스트, 이름/코드/타입/카테고리 검색과 조상 경로, 안정 sortOrder→name→id, 전체 펼침/접기, 건수/미분류/빈·로딩·오류·재시도를 제공한다. 단일 클릭 선택/상세/강조, 객체 dblclick/Enter는 유효 WCS bounds focus; 폴더는 펼침만. UNMAPPED Zone은 표시하되 focus금지. Arrow/Home/End/Enter 및 visible focus 제공. 폴더 CRUD/이동은 label 있는 명시 폼/메뉴로 제공하며 DnD는 불필요하다.
- **ADR-T201-07 격리와 수명**: object 및 folder subtree Show/Hide는 Viewer overlay 세션 state만 갱신한다. Source layer/Memo/Scene/원본 bytes/SHA/영속 visibility 불변. 현재 actor+Version+SHA+request generation으로 모든 read/write 완료를 검증하고 logout/revoke/401/403/BLOCKED에서는 이전 데이터·폼·선택·hidden·pending을 폐기한다. 이전 actor/version의 늦은 응답은 복원0. 패널 열기/닫기/검색/재분류에서 Canvas/Manager/Source GET/parse/worker 재생성0.
- **ADR-T201-08 호환 릴리스**: 기능 MINOR0.63.0. 과거 baseline DDL/checksum은 불변. 새 tree baseline과0.62→0.63 additive MIGRATION을 등록하고0.61→0.61.1→0.62→0.63 경로를 검증한다. Prisma generation, Installer/schema assertion/authority/Migrator Docker copies, package/lock/compatibility와 실제 upgrade proof를 함께 갱신한다. 기존 설치 자동 ALTER/운영 변경 없음. root의 #282 exact source/세 image digest/Owner GO와 게시 검증은 코드 수용 후 별도다.

## AC 및 실행할 TC

| AC | 필수 시험과 판정 |
| --- | --- |
| TREE-01 / TC-T201-01 | Outline3, root/child/grandchild Zone3, folder2단계, 미분류 혼합 트리의 부모·순서·type/category 보존; 단일 panel/tree만 존재. Pure unit+실제 Browser. |
| TREE-02 / TC-T201-02 | 폴더 CRUD/nest/sort, 개별 Outline 및 root Zone subtree move와 unclassify, reload persistence. 실제 SQLite FK/trigger/service에서 self/cycle/cross-Version/Site/deleted/missing parent·object·wrong kind 및 stale folder/parent/membership revision409, nonempty delete409/cascade0, creator/Admin 삭제. Audit failure rollback·append-only·동시 CAS. |
| TREE-03 / TC-T201-03 | 종류·통합 검색 조상 경로, expand/collapse/sort, single click no camera change, dblclick/Enter bounds, folder no pan, UNMAPPED no focus, subtree Show/Hide overlay-only. Layer/Memo/Scene 상태·source hash 유지. |
| TREE-04 / TC-T201-04 | 실제 signed Reader/Editor/Admin+Site grant/revoke, no grant/cross scope, Origin/CSRF/runtime off/read-only, audit, temporary GET failure/retry, actor/Version switch pending read/write isolation. 권한 밖 이름/검색건수0. |
| TREE-05 / TC-T201-05 | desktop move/reset/reopen,320px single Drawer, keyboard tree/ESC/focus restoration/nested modal/fullscreen/resize. open/close20회 Canvas identity/Manager/source GET/parse/worker delta0. 기존 outline/zone/memo/panel/search/snap 회귀. |
| TREE-06 / TC-T201-06 | V1/V2 분리된 폴더/소속, 동일 Location Zone metadata 유지, V2 geometry null·focus/overlay0. reload/new session restore와 stale Version response 무시. |
| RELEASE / TC-T201-07 | fresh new schema+old0.61/0.62 upgrade preservation, exact history/fingerprint, rollback/backup gate, typecheck/lint/full unit/build/related E2E; #281 high-risk 및 #282 release를 root가 실행. 필수 FAIL/NOT RUN은 차단. |

## 실패 원장과 결과

#196의 OFF 조회503/retry잠김, source 완료 경합 GET2회, Zone reset fixture402 autocommit 비용; #138 nested modal aria-modal 충돌; #215/#282 native clock 역행 인증 실패를 회귀 대상으로 유지한다. native clock과 disposable synthetic monotonic opt-in 결과를 분리하며 프로덕션 auth를 완화하지 않는다. 새 실패는 FailureLedger와 IssueEvidence/201에 append-only로 관측·원인·수정·재시험을 기록한다. 실제 AC 결과는 TestReport에 기록하고 미실행은 PASS로 대체하지 않는다.


## Manager 보완 ADR — 구현 중 독립 검토 (2026-11-13)

- **ADR-T201-09 기존 draft와 즉시 scope 폐기**: 기존 브라우저 임시 Outline은 임시/미분류 표식과 기존 저장/편집/내보내기를 보존한다. 서버 immutable object로 확정되기 전 membership 저장 금지. 공통 Session 상태의 actor/session epoch 변경 즉시 protected 목록/검색/폼/overlay를 mask하고 in-flight 완료를 무효화한다. 뒤늦은 GET이 actor 불일치를 감지할 때까지 이전 내용을 보여주는 방식은 불충족이다. 현 actor 확인 전 이전 actor의 객체·건수0. TC-T201-04에 pending GET/PATCH를 hold한 actor 전환과 draft regression 포함.
- **ADR-T201-10 격리 clone migration proof**: root는 `release_local_compat.py`와 해당 독립 테스트만 담당한다. 기존 같은-schema COMPATIBLE 경로는 엄격한 동등성 검사를 그대로 유지한다. 새 별도 분기는 정확히 bundled0.62→0.63 TREE sidecar migration 하나가 포함된 등록된0.61/0.61.1/0.62→0.63 전방 체인만 허용하며 임의 migration/schema/version/DDL을 허용하지 않는다. source frozen commit의 registry 및 schema/migration 상수에 결합한다. 소유 nonce/plan label이 검증된 새 격리 복원 volume에서만 candidate migrator `plan`의 UPGRADE_MIGRATION_REQUIRED/from/to/steps/requiresApproval=true/정확64hex planId를 검사하고 같은 planId를 `apply --approve-plan`으로 전달한다. 이 승인은 이미 승인된 disposable clone 검증에만 적용되며 운영 migration 또는 GHCR Owner GO를 뜻하지 않는다.
- pre/post check는 기존 업무/auth/audit/Scene/job 테이블 행·storage 집계·CAD path/size/SHA·installId를 정확 보존해야 한다. 변경 예외는 소스에 등록된 신규 TreeFolder/TreeMembership/TreeAudit **정확 빈 테이블**과 검증된 migration history 추가뿐이다. 기존 schemaId가 등록된 CPU schema여야 하고 신규 schemaId/fingerprint/history가 정확한 등록 tree schema여야 한다. unknown table/DDL/history/checksum/nonempty-new-table/기존 행 삭제·변조/CAD변경/다른 source image drift는 차단한다. migrator 자체 registry assertion 결과와 별도 논리 비교를 결합한다. source/app/migrator identity는 build record와 일치, 기존 backup/maintenance/restore-required gate는 유지한다.
- **TC-T201-08 출고 helper 음성 회귀**: 같은-schema 원래 경로 성공, 정확 tree migration 계획·planId 전달·기존 행/CAD 보존 성공; wrong from/to/schema, unexpected extra migration/step, approval false/missing/bad planId, 기존행/CAD 변경, 새table 비어있지 않음/예상table 누락/unknown table, history·checksum 변조 모두 거절. 실제 sealed0.61 baseline clone→0.63 App/Worker를 새 exact image로 실행 후 증거를 기록한다. 기존 baseline의 CAD1/READY0 한계와 synthetic READY 회귀를 구분한다.


## ADR-T201-11 — Zone 재분류의 CAS ABA 방지 (Manager/Root 검토, 2026-11-13)

초기 구현 중 root→child 전환 trigger가 membership을 물리 삭제하면, 다시 root가 된 뒤 새 membership revision1이 만들어져 과거 expectedRevision1 요청이 통과할 수 있다(실행 전 코드 검토 발견). 따라서 membership ID/revision을 삭제·초기화하지 않는다. 기존 Zone service의 동일 transaction에서 tree schema가 있는 경우 root→child parent 변경 **전** 모든 Version membership을 folderId=null·revision+1로 갱신하고 actor/request/site/Version에 묶인 TreeAudit MOVE를 기록한다. 이미 미분류인 membership도 개정하여 이전 요청을 무효화한다. 이후 Zone parent 변경 및 기존 Zone 감사까지 한 transaction으로 처리한다. old schema에는 이 기능을 호출하지 않는다. DB trigger는 분류된 membership이 남은 채 root를 child로 바꾸는 직접 변경을 거절하며 자동 DELETE/cascade하지 않는다. 외부 Tree API는 live root만 이동할 수 있고 root 복귀 시 미분류 revision tombstone을 유지한다. TC-T201-02/04는 root→child→root→재분류 동안 이전 expected0/oldrevision 요청 거절과 동일id·증가revision·Tree/Zone 감사 원자성을 검증한다.


## ADR-T201-12 — 출고 검증의 명시 시험 선택 결합 (2026-11-13)

Root 정적 검토에서 `verify:local --unit/--e2e`의 선택이 start/end metadata에 기록되지 않고 `release_local.verify_run`이 선택 없이 mandatory manifest를 재생성하여, #201 신규 domain/service에 필요한 정상 선택 시험도 VERIFY_CASE_DOWNGRADED/MISSING으로 거절되는 계약 불일치를 확인했다. base 범위 축소나 inferred gate 제거로 우회하지 않는다.

Root는 `verify_local.py`, `release_local.py`와 해당 테스트를 최소 수정한다. CLI의 기존 bounded in-repo test 검증을 공용화하고 시작/종료 metadata에 `selected_tests:{unit:[],e2e:[]}`를 동일하게 기록한다. 출고 readback은 두 선택이 정확히 같고 각 항목이 허용 prefix/suffix/문자/현재 실제 파일·repo내 정규 경로 조건을 만족하는지 재검증한 뒤 같은 선택으로 manifest를 구성한다. 임의 명령·외부경로·symlink escape·중복·형식위조·변경선택 및 추론된 필수 gate 누락은 차단한다. 과거 양쪽 metadata에 필드가 모두 없는 무선택 실행만 empty 선택으로 해석한다; 한쪽만 누락/변경은 거절한다. 기존 native/monotonic 구분·source/clean/log hash/필수 PASS gate는 유지한다.

**TC-T201-09:** 실제 tree domain/service 경로+명시 integration/unit/e2e 선택 manifest의 정확 readback 성공, 기존 무선택 호환 성공. 시작/종료 선택 불일치·누락·unsafe/missing test·선택만 기록하고 argv에서 제거·inferred 테스트 제거·선택 필수 결과 미실행/실패는 모두 거절한다. root 구현 보고 뒤 독립 QA가 확인하며 최종 frozen release에서 실제 실행한다. 임의 검증 제외 또는 GHCR 게시 승인을 뜻하지 않는다.


## ADR-T201-13 — 실제 패널 toolbar 포인터 가림 수리 (2026-11-13)

Root real G7 재시험2에서 폴더/소속 저장·선택/Enter 이동·하위Hide/Show·20회 수명·키보드 이동 후 `viewer-outlines-panel-reset` 클릭을 canvas top-right `cad-text-search-trigger`(z45)가 가로채는 실제 제품 결함을 재현했다. 공통 패널의 raised z36보다 standalone 검색 trigger가 높아 생긴 문제다. force click이나 키보드로 시험을 우회하지 않는다.

독립 검색 **trigger**를 Viewer panel layer보다 아래(예: z20)로 조정하고 메뉴/실제 검색 panel/modal의 기존 우선순위는 유지한다. 검색 trigger가 패널 toolbar의 이동/복원/닫기와 모바일 modal backdrop을 가로채지 않아야 한다. 검색은 trigger가 드러난 상태에서 계속 사용 가능하며 검색 panel 자체의 공통 MovableViewerPanel 동작은 바꾸지 않는다. **TC-T201-10:** 실제 pointer로 겹침 위치에서 reset/close 성공, 패널 재배치 뒤 검색 trigger 열기/검색 가능,320px modaltrap·backdrop 우선,Canvas/GET/parse/layer 상태 불변. 기존 root 실패 assertion을 그대로 재실행하고 #26/#138 패널/검색 회귀를 함께 확인한다.


## ADR-T201-14 — CPU Worker 승인 schema allowlist 보존 (2026-11-13)

0.63 Tree migration을 CPU Worker가 지원하도록 추가할 때 mutable latest `G7_GREENFIELD_SCHEMA_ID`를 allowlist 항목 자체로 사용하지 않는다. 이 방식은 future unknown schema도 항상 자기 자신과 같아 gate를 통과시키므로 기존 fail-closed release 계약을 약화한다(Root 정적 검토). 허용 CPU 및 Tree schema는 별도 **고정된 검토 상수/literal**로 명시하고 latest는 그 allowlist와 비교한다. flags 두 개·runtime/authority·Scene contract는 그대로 유지한다. **TC-T201-11:** currentTree+승인flags 허용, 구CPU 지원 유지, 구Job/unknownfuture schema·각flagOFF에서 CPU 실행거절 및 기존 enqueue계약 보존. mocked latest unknown을 반드시 음성검증한다. 실제 Worker 실패로 관측한 것이 아니라 구현 중 예방적 보완이며 적용 후 full 관련시험과 최종이미지gate가 필요하다.


## ADR-T201-15 — 알려진 권한 거절의 Viewer scope 전체 폐기 (2026-11-13)

Root TC-T201-G7-REVOKE는 동일 Admin의 두 실제 session을 사용해6객체를 표시한 뒤 다른 session에서 SiteGrant를 회수(200)했다. 대상 Viewer folder POST403 이후 Tree는 비었으나 persisted-outline-path3개가 남아 실제 FAIL했다. Zone0 assertion은 그 뒤에 있어 미도달이다. 이 알려진 서버 인가 거절 이후 protected overlay 잔존은 TREE-04 불충족이며 필수 수정한다.

**범위 결합 폐기:** 현재 actor+Version+SHA에 속한 Tree/Outline/Zone 요청에서 현재 generation의401/403을 받으면 공용 client scope invalidation을 발행한다. 구 actor/Version 또는 stale request는 새 scope를 지울 수 없다. 세 workspace hook은 일치 scope의 protected rows/geometry/selection/hidden/form/drawing/pending를 즉시 mask/폐기하고 generation을 증가시키며 pending read를 abort한다. runtime 권한을 부여하지 않는 단방향 폐기 event/state이며 원본 Source·Layer·Memo/Scene data와 Canvas/Manager lifetime은 건드리지 않는다. Viewer 단일 도면에 결합하며 다른 Version workspace를 임의 폐기하지 않는다.

폐기 자체가 자동 새 GET 또는 반복 session invalidation을 시작하지 않도록 한다. 거절된 scope는 안전한 오류/재시도 상태로 유지하고 사용자의 명시 retry 또는 실제 actor/Version 전환에서만 현재 auth/scope를 다시 조회한다. 같은 actor가 SiteGrant 없는 상태에서 `401/403→global session refresh→GET403→refresh` loop는 금지한다. 공통 session provider의 로그인 상태는 Site permission 거절과 별개로 정확히 유지한다. mutation success/error 및 category/old assertActor 후행 응답도 폐기된 scope를 복원하지 못한다.

**TC-T201-12:** Root 실제 revoke 회귀를 그대로 통과: grant revoke200→UI mutation403→Tree names/count/Outline paths/Zone paths/form0, currentactor session은 유효, 원본/Scene/Canvas 불변; 반복 GET 폭증0. grant restore 후 명시 retry에서 정상 복원. 동일actor late 실패 및 이전actor/Version late event가 새 scope를 지우지 않는 음성 회귀도 유지한다. Root시험과 독립 QA를 재실행하며 known denial 없이 추정으로 API인가를 바꾸지 않는다.


## ADR-T201-16 — 참조 중인 비활성 업무 타입 표식 보존 (2026-11-13)

Root 기존 typed-outlines 회귀 감사에서 기존 #71/#73의 참조 OutlineType 비활성 표식 요구를 확인했다. 새 Tree read DTO가 id/name만 투영하면 타입이 비활성화되어도 이름에 `(비활성)` 표식이 사라진다. 이는 아직 새 Browser 실행으로 관측한 FAIL이 아닌 기존 assertion과 소스 비교로 확인한 호환성 누락이다. 단일 트리에서는 기존 타입별 그룹 대신 객체 행의 타입 badge에 해당 표식을 유지한다.

서버는 현재 Version 객체가 실제 참조한 타입만 id/name/active로 반환하고, client DTO 및 pure projection은 active=false일 때에만 타입 이름 뒤에 `(비활성)`을 표시한다. 기존 타입 권한·활성 생성 제한·저장 geometry·분류는 바꾸지 않는다. **TC-T201-13:** 실제 Type rename/deactivate 후 참조 Outline 행의 갱신된 타입 이름과 비활성 표식을 유지하고, 비활성 타입 신규 생성은 기존 정책대로 차단한다. 통합 DTO는 active=false를 확인하고 pure/기존 Greenfield 회귀를 보존한다. 수정 후 새 build를 기준으로 관련 전체 회귀 및 독립 QA가 필요하다.


## ADR-T201-17 — 구역 메뉴 진입 후 단일 Drawer ESC 닫기 (2026-11-13)

Developer 기존 #196 모바일 회귀에서 구역 목록으로 단일 패널에 진입한 뒤 ESC를 누르면 Drawer가 남는 실제 실패를 확인했다. 공유 DOM 표식은 `data-drawer=outlines`지만 zonePanelOpen으로 열린 상태에서 handler가 toggle-outline-tree를 보내어 구역 상태를 닫지 않고 외곽선 상태를 켠다. 공통 패널의 상태 종료는 현재 활성 진입 경로를 기준으로 구역 또는 외곽선 상태를 닫도록 수정한다. 도면 생성 중 ESC의 첫 단계는 기존 Zone drawing 취소를 유지하고, 그 다음 ESC만 Drawer를 닫는다.

**TC-T201-14:**320px에서 외곽선·통합 메뉴와 구역 목록 메뉴 각각으로 동일 Drawer를 열어 ESC1회에 닫히고 작업 메뉴 trigger로 focus가 복귀한다. 구역 drawing 중에는 ESC1회가 drawing만 취소하고 Drawer는 유지하며 다음 ESC가 닫는다. 단일 modal·Canvas/SourceGET 수명 계약은 유지한다. Developer의 실제 FAIL 원장과 수리 후 동일 assertion 재실행을 보존한다.


## ADR-T201-18 — 임시 외곽선 이름·업무 타입 투영 보존 (2026-11-13)

Root 기존 임시 외곽선 회귀 감사에서 SavedOutline의 outlineTypeId/outlineTypeName/name을 새 draft 투영이 누락하고, 흔한 빈 name에 `??` fallback이 적용되지 않아 행 이름이 사라지는 호환성 결함을 정적으로 확인했다. 기존 geometry와 임시 Document는 변경하지 않는다. Viewer에서 draft의 선택적 업무 타입 필드와 의미 있는 이름을 전달하며, 빈 문자열 이름은 기존 `외곽선 + local ID` 규칙으로 대체한다. 업무 타입 표시·검색은 현재 참조 타입 이름(알려진 비활성 상태 포함)을 우선하고 없으면 저장된 typeName으로 복원한다. 둘 다 없는 경우에만 기하 kind/기존 미분류 표현을 사용한다. 폴더는 타입을 대체하지 않는다.

**TC-T201-15:** 빈 name 임시 외곽선의 local ID 포함 fallback, 타입 지정 임시 외곽선의 업무 타입 badge·검색, 현재 타입 rename/inactive 반영과 저장 typeName fallback, 무타입 draft의 기존 미분류·visibility/select/delete/export 동작을 보존한다. pure regression 및 기존 #43/타입 Greenfield 회귀를 수정 후 새 build에서 실행한다.


## ADR-T201-19 — 외곽선 추가 선택 계약 보존 (2026-11-13)

Developer 기존 #53 E3-002 및 #37-49 회귀에서 두 번째 임시 외곽선 행을 Ctrl-click한 뒤 생성 개체 선택 개수가2가 아니라1인 실제 실패를 확인했다. 새 VersionTreePanel이 modifier를 버리고 단일 선택만 전달한 원인이다. 기존 Ctrl/Meta 추가 선택은 임시 및 서버 Outline에 유지한다.

Tree의 click/Space와 Enter focus 경로에서 Ctrl/Meta 의도를 선택 callback에 전달한다. 임시 Outline의 Manager selectSavedOutline은 기존 단일 인수 호출 계약을 보존하면서 optional additive를 Adapter로 전달하고 단일 클릭의 camera 불변을 유지한다. 서버 Outline은 workspace.select의 기존 additive/toggle 규칙을 사용한다. 기본 클릭은 이전 선택을 교체하며 Zone은 기존 단일 상세 선택, Folder는 탐색/펼침으로 유지한다. aria-selected는 실제 Outline 선택 상태를 반영하고 최근 상세 행이라는 이유만으로 deselect된 객체를 선택 표시하지 않는다.

**TC-T201-16:** 임시2개 Ctrl/Meta click/Space 선택·toggle·기본 click교체와 선택 개수/ARIA, 기존 batch delete/undo 회귀, 서버 Outline 추가 선택, 단일 clickcamera불변 및 Enterfocus를 검증한다. 원본/source Layer/Memo·분류/geometry 변경0. 기존 실패 assertion을 약화하지 않고 새 build에서 재실행한다.


## ADR-T201-20 — Zone 상세 재조회 중 선택 readiness (2026-11-13)

Root 기존 semantic-zones 재시험에서 renderer 전환 후 Tree metadata는 표시되지만 Zone 상세 조회가 끝나기 전에 클릭한 행은 로컬 경로만 바뀌고 상세 선택이 버려지는 실제 경합을 trace로 확인했다. Zone GET 완료 전 약7.3ms에 클릭이 끝났고, 이후 조회 성공에도 선택이 복원되지 않았다. 이 경합은 테스트의 임의 대기로 감추지 않는다.

Manager 선택은 **상세 readiness를 명시적으로 표시하고 일시적으로 선택을 비활성화**하는 방식이다. VersionTreePanel은 Viewer의 현재 actor/Version/SHA와 일치하는 Zone snapshot readiness 및 안전한 loading/error 안내를 받는다. 미준비 Zone 행은 aria-disabled와 조회 안내를 표시하고 click/Space 선택·Enter/dblclick focus를 수락하지 않으며 최근 선택 경로도 새로 바꾸지 않는다. Tree metadata와 키보드 탐색은 유지한다. Zone를 포함한 subtree Show/Hide도 같은 readiness 전에는 비활성화하여 일부 객체만 바뀌지 않도록 한다. 조회 성공 후 같은 행이 자동으로 활성화되며 단일 클릭으로 상세를 선택한다. 오류는 명시 Tree 재시도 경로를 안내한다. unsupported renderer에서는 metadata 상세가 준비되면 선택 가능하지만 기존 focus/edit 금지는 유지한다. 새로운 pending intent queue는 추가하지 않는다.

**TC-T201-17:** 실제 Zone GET을 hold한 renderer 전환에서 Zone 행의 loading/aria-disabled 및 선택·focus·부분visibility 불변을 검증한다. GET 완료 후 enabled를 관찰하고1회 클릭으로 상세가 나타나며 unsupported renderer 편집/focus가 차단된다. actor/Version/denial scope가 다른 응답은 enable 또는 상세 복원0이다. 기존 semantic-zones는 명시 readiness 상태를 기다리며 고정 delay/force click으로 우회하지 않는다.


## Manager 재개 계획·수용 게이트 (2026-11-15)

Main `800429e`의 0.62.0 출고/배포 및 승인 parser 보완을 기존 미커밋 0.63.0 후보에 합쳤다. 과거 결과는 해당 소스의 이력으로 보존하며 새 소스 PASS로 승계하지 않는다. 사용자 승인 범위는 #201 구현·시험·append-only 실패 기록·정식 GHCR 게시·Issue 종료·해당 Issue가 만든 임시 컨테이너/볼륨/worktree 정리이다. 운영 0.62.0/8300 App·Worker·기존 데이터와 원 checkout 사용자 변경은 보존한다. PR0·Actions0 및 exact-source/Owner/세 digest 게이트를 유지한다.

1. **Developer 재개:** ADR01–20과 현재 diff를 확인하고, 마지막 Greenfield 14건 중 미해결 typed-outline-races interleaving 및 typed-outlines API ECONNRESET을 새 독립 fixture로 실행한다. 회귀 assertion의 의미나 권한/준비 gate를 약화하지 않는다. 필요한 최소 수정 후 최신 build와 Tree signed 2건, 관련 Greenfield 14건을 재검증한다. 실패·원인·수리·재시험을 FailureLedger에 append하고 고유 로그/Playwright output을 사용한다. 과거 native-clock 실패와 test-only monotonic 결과를 구분한다.
2. **독립 QA:** Developer 보고를 Manager가 먼저 검토한 뒤 별도 QA가 최신 소스 diff·TC-T201-01~17을 검토하고 typecheck/lint/full Vitest/build, release-helper Python contracts, 새 Tree API/DB 통합 및 관련 default/Greenfield Browser를 실행한다. 서명 세션/Scope 폐기·권한 회수/no-loop·readiness·Version 격리·migration 보존·고정 Worker allowlist를 필수 확인한다. 각 gate의 명령/실제 건수/exit/로그 SHA와 미실행 한계를 IssueEvidence201 및 TestReport에 기록한다.
3. **Manager 인수 및 Root 출고:** 필수 FAIL/NOT RUN이 없을 때 코드 수용을 기록하고 root에 넘긴다. root가 source freeze/비강제 Main push/최신 GitHub 보호 readback, 새 #281 high-risk 실행, #282 새 App/Migrator/Worker build 및 봉인 복제본 migration 검증, 구체 exact plan/Owner GO/세 final digest readback·pull smoke를 수행한다. Local QA를 publication으로 대체하지 않는다.
4. **종료·정리:** 최종 AC 증거·원장과 게시 digest를 Issue에 남기고 종료 readback 뒤 소유권이 확인된 #201 임시 자원만 정리한다. 로그/추적 근거를 영속 안전 위치에 보존한 뒤 worktree를 제거하며 운영/다른 Issue 자원은 삭제하지 않는다. root가 실제 정리 inventory를 기록한다.

기존 요청 gpt-5.6-sol/gpt-5.6-luna 모델은 현재 제공되지 않아 Developer/QA는 실제 사용 가능한 상속 모델로 대행한다. 실행하지 않은 모델이나 독립 QA를 기록하지 않는다. 이 재개 기록은 계획이며 실행 성공 또는 최종 출고 승인이 아니다.


## ADR-T201-21 — 실제 #201 출고 지시의 좁은 승인 문구 계약 (2026-11-15)

합쳐진 Main의 `affirmative_owner_reply`는 닫힌 affirmative set이며 오늘 실제 명시 지시를 아직 인식하지 않는다. 사용자의 정확 문구는 “Issue 201을 확인하고 내용을 참조하여 구현, 테스트, 실패 원장 기록, 정식 GHCR 게시, 이슈 종료를 진행하세요. 구현 간 발생한 임시 컨텡너, 볼륨, 워크 트리는 이슈 종료 시 삭제하세요.”다. 이 한 문구를 기존 공백/대소문자 정규화 후 닫힌 허용 집합에 추가하고 원문은 승인 파일에 그대로 보존한다. substring/키워드 추론·임의 GO 합성·부정 문구 허용은 금지한다. 기존 plan hash·source/version·세 역할 digest·candidate/final ref·conversation/operator·private-file gate는 동일하게 유지한다.

**TC-T201-18:** 위 원문 및 기존 허용 정규화는 true; 부정 추가/진행 금지로 변조·승인 질문·일부 키워드·다른 Issue·접두/접미 부정·부분 인용은 false. 이전 명시 출고 문구 회귀도 유지한다. helper 전체 계약과 독립 QA가 통과해야 하며 구체 source-bound plan/readback을 대체하지 않는다. 실제 사용자가 허가한 정식 게시 및 Issue 종료 범위 밖 운영 배포 권한을 이 문구로 추가하지 않는다.


## ADR-T201-22 — Version 삭제의 Tree 기록 보존 오류 계약 (2026-11-15)

Manager 정적 검토에서 `CadRepository.deleteVersion`은 기존 Outline/Memo 및 Zone 기록에 명시409를 반환하지만 신규 TreeFolder/TreeMembership/TreeAudit를 검사하지 않아 폴더만 있는 Version은 마지막 FK 오류로 종료하는 누락을 확인했다. 아직 실제 시험 FAIL로 관측한 것은 아니다. 기존 #98/#83의 승인 없는 업무/감사 이력 cascade 금지 정책을 신규 sidecar에도 적용한다.

Tree 세 테이블이 전부 없으면 기존 구 schema 삭제 경로를 유지하고, 일부만 있으면 `CAD_TREE_SCHEMA_DRIFT`503으로 차단한다. 세 테이블 중 해당 Version을 참조하는 행이 하나라도 있으면 `CAD_TREE_DATA_EXISTS`409와 안전한 안내를 반환한다. soft-deleted folder·미분류 membership·audit도 기록이므로 물리 삭제하지 않는다. 같은 transaction 내 앞서 수행된 Current/Scene/job 정리는 rollback되어야 한다. Tree 기록이 전혀 없는 Version의 기존 승인된 삭제는 유지한다. 이는 추가적인 삭제 기능 또는 사용자 데이터 제거 승인이 아니다.

**TC-T201-19:** 실제 DB에서 다른 업무 객체 없이 folder만 만든 Version의 삭제409 및 동일 Current/Version/Tree/audit/Scene 데이터 보존, 폴더 soft-delete 후에도409, tree 없는 Version 정상 삭제, 부분 Tree schema503·old schema 원래 경로를 검증한다. 신규 migration DDL/checksum은 변경하지 않는다.


## Manager fixture 보완 — typed race 패널 진입과 종료 (2026-11-15)

새 Browser 실행의 typed-outline-races에서 POST201·Tree GET200 뒤 행 확인 실패를 실제 trace로 확인했다. ADR20의 abort-first interleaving으로 바뀐 뒤에도 이전 refresh-control 확인을 위해 Tree를 미리 여는 코드가 남아, 성공 후 같은 메뉴의 toggle이 이미 열린 패널을 닫았다. 실패 종료의 pending route 처리 오류가 원래 assertion을 가리고 잔존 fixture 행이 후속 시험 건수에도 영향을 줬다.

Developer는 이제 사용하지 않는 사전 Tree 진입/refresh-control 확인 블록만 제거하고, gate release 후 `unrouteAll({behavior:'wait'})`로 handler 완료를 기다려 원래 정리를 실행한다. POST201·동일 idempotency key 두 시도/실제 server 전달1·old/fresh 응답·Tree row/overlay 불변 assertion은 유지한다. 실패 원장은 원래 panel assertion과 후행 cleanup 오류/연쇄 실패를 구별하며 최신 전체 관련 Browser를 다시 실행한다. 제품 pending 작업/menu/session 보안 gate는 변경하지 않는다.

같은 실행의 Tree session GET ECONNRESET은 별개 transport FAIL이다. 서버 PID·후속 session/health 정상과5초 Keep-Alive 주변 idle은 pooled socket 경합 가설을 지지하지만,18회 bounded health 대조는 모두200으로 재현하지 못했다. 원인 확정/PASS로 바꾸지 않고 원 로그를 보존한다. 이 증거만으로 production/auth 변경·포괄적 재시도는 허용하지 않는다.


## ADR-T201-23 — 알림 없는 계정 전환의 Tree intent·CSRF 결합 (2026-11-15)

Root·Manager·독립 QA의 정적 검토에서 Tree mutation은 화면 actor A를 캡처하지만 `runtimeCadHeaders`가 새 세션 B의 CSRF를 읽고도 actor를 비교하지 않는 경로를 확인했다. 같은 Browser cookie가 알림/focus 없이 같은 권한의 B로 바뀌면 A의 기존 폼을 B로 저장할 가능성이 있다. 기존 Reader 전환 시험은 명시 session-invalidated event 및403을 사용하여 이 경로를 검증하지 않았다. 서버 권한 우회가 아니라 **오래된 화면 작업의 actor 결합 누락**이며, 현재 수용을 보류하고 실제 Browser RED를 먼저 실행한다.

기존 header helper에 optional expectedActorId를 추가하여 CSRF를 제공하는 **동일 실제 session 응답**의 actor와 일치해야 header를 반환한다. 별도 actor GET 뒤 다시 CSRF를 얻는 경합은 허용하지 않는다. expectedActor가 있는 요청의 missing/mismatched actor 또는 OFF는 fail closed이며 기존 expectedActor 없는 OFF/active 호출은 유지한다. 다른 actor일 때 구별 가능한 `SESSION_ACTOR_CHANGED` 오류로 mutation fetch 이전에 중단한다. 검증 뒤 cookie가 바뀌는 경우는 기존 session-bound CSRF 서버 검사가 계속 담당한다.

Tree는 캡처된 actor를 helper에 전달한다. 현재 actor/Version/SHA/generation에 해당하는 mismatch일 때만 captured old scope의 Tree·Outline·Zone/form/pending을 즉시 폐기하고 공통 session identity를 한 번 재조회한다. 자동 mutation 재시도0. 알려진 권한 거절의 명시 retry/no-loop 계약은 유지한다. GET은 live generation 및 정확 Version/SHA를 먼저 검사하고 **같은 resource의 actor 불일치**에만 같은 폐기/identity 재조회를 적용한다. 구 generation·다른 Version/SHA 응답은 새 scope를 폐기하지 않는다.

**TC-T201-20:** 실제 Admin A의 입력된 folder intent를 유지하고 같은 Site 권한의 별도 Admin B로 page API cookie만 전환한다. 테스트가 focus/session-invalidated를 발행하지 않는다. 실제 B session 응답이 header 검사에 쓰인 뒤 이어지는 identity refresh 응답만 hold하여, 저장 click의 Tree mutation0·DB folder/audit 불변·이전 세 workspace/폼0을 먼저 확인한다. 기존 소스는 실제 POST201/변경1로 RED여야 한다. refresh를 release한 뒤 B의 새 명시 폼은 정상 저장되고 actor/audit B로 남는다. helper unit은 일치/mismatch/missing/empty expectedactor+OFF와 기존 unbound 계약을 검증한다. 기존 lateactor/Version/no-loop/Read-only 회귀도 유지한다.

QA phase1은 HEAD800429e+candidate fingerprint `f5d7c4e7d3abe61b53c73f2f757aa13126a86c2f0acfebe82f4caafcf1a2745a`의 full Vitest181파일/1145tests 및 build PASS를 완료했고 소스는 같았다. 이는 **이 보완 이전 소스**의 결과이며 최종 수용으로 승계하지 않는다. 실제 RED·수리·독립 QA·최종 source-bound release는 후속 기록을 따른다.


## Manager fixture 보완 — Version 지연 조회 시험의 준비 조건 (2026-11-15)

독립 QA phase2 기본 Browser19건은18PASS/1FAIL이었다. `delayed old Version tree GET`은 항상 Zone503인 fixture에서 Tree의 다시 시도를 눌렀지만 ADR20의 실제 계약은 Tree metadata가 있고 Zone 상세가 미준비이면 Zone만 재조회한다. Root/Manager/QA의 독립 trace 확인은 initial TreeGET200 **1회**, ZoneGET503 **2회**이며 두 번째 TreeGET·Version전환·held 응답 해제 단계에 도달하지 않았음을 보였다. `oldSeen` 대기의30초 timeout이며 제품 Version 경계 실패나 transport reset으로 해석하지 않는다.

Developer는 이 Version stale-response 전용 fixture에서 actor/Version/SHA가 정확한 빈 **ready Zone DTO**를 공급한다. retry 전 UI/응답 readiness를 명시적으로 확인하고 실제 두 번째 TreeGET hold를 bounded assertion으로 확인한 뒤 새 Version으로 이동한다. 기존 old/new folder 및 지연 응답 무시 assertion을 유지하고 finally에서 gate release·route handler 종료를 보장한다. 고정 sleep·timeout 확대·제품 retry 분기 변경으로 우회하지 않는다. Zone503/retry 동작은 별도 기존 PR200/Greenfield 회귀로 유지한다.

phase2 fingerprint `74117abfb2a0700afec9f2bac68eb5cb8a9cf22b05a86e32aa3943af25767c33`는 실패 전후 동일했다. full181파일/1151test·static/build/helper PASS 및 기본18PASS1FAIL은 원래 실행의 결과로 보존하며 signed17은 미실행이다. 최소 test-only 수리 뒤 같은 production bytes에서 해당2건을 먼저 확인하고 독립 QA의 기본19·signed17과 화면 검증을 마친다. 최종 frozen release source 검증은 root의 별도 단계다.


### Developer fixture 보완 검증 결과 (2026-11-15)

위 ready Zone DTO/실제 Zone panel 준비 조건과 bounded 둘째 Tree GET 확인, finally release/unroute wait를 구현했다. 기존 production build `k2QB82N0aRJ_WKenAr_a2`의 focused Tree Browser2건은2/2PASS(29.8s), typecheck/lint는exit0(기존12warnings)이다. 제품 코드를 변경하거나 full Vitest/build를 다시 실행하지 않았다. 원 실패와 집중 재시험 근거는 [IssueEvidence/201](IssueEvidence/201.md), [FailureLedger](FailureLedger.md), [TestReport](TestReport.md)에 append했다. 독립 QA default19/signed17/화면 검증을 기다리며 최종 수용·release 완료로 처리하지 않는다.


## ADR-T201-24 — 서명 Browser 시험의 직접 API 연결 격리 (2026-11-15)

QA phase3 기본19건은 PASS였지만 signed 시험의 typed-outlines 직접 GET에서 다시 ECONNRESET이 발생했다. 직전 같은 API 흐름의 POST201 완료와 GET 사이 idle은 약5.97초이고 서버는 직후 sessionGET200/logout200 및 다음 시험을 처리했다. 앞선 Tree reset도5초 Keep-Alive 주변 idle 패턴이었다. pooled idle socket 경합은 지지되는 **가설**이며, 이전18회 health 대조는 모두200으로 원인을 입증하지 못했다. signed 로그는15PASS/1FAIL/마지막1건 결과미기록이고 바깥 실행은143으로 끝났다. Root/QA 모두 종료 signal을 보내지 않았으며143의 원인은 별도 UNKNOWN이다. 이 실패와 중단을 성공으로 바꾸지 않는다.

최소 수리는 production/인증/Chromium transport를 바꾸지 않는 **테스트 소유 직접 API wrapper**다. `closeApi(APIRequestContext)`는 public method를 위임하는 WeakMap-cached wrapper로 동일 cookie jar를 유지하면서 get/post/put/patch/delete/head/fetch에 case-insensitive `Connection: close`와 `maxRetries: 0`을 적용한다. 그 외 public method는 원 context에 bind한다. `closeRouteFetch(Route, options?)`는 실제 request의 allHeaders와 명시 option headers를 병합한 뒤 같은 close/0을 적용하며 원 method/body/CSRF/cookie/idempotency key를 보존한다. signed9파일의 직접 API와 route.fetch 경로만 명시적으로 연결하고 기존 typed-outline-races의 GET maxRetries1도0으로 바꾼다. node_modules/private field/prototype/global browser header 변경이나 mutation 재시도는 하지 않는다.

**TC-T201-21:** 소유한 local HTTP 제어 서버가 실제 header/socket identity/method/body/합성 auth marker/attempt 수를 관측한다. standalone request, page.request, 독립 BrowserContext.request 및 route.fetch에서 연속·약6초 idle 요청이 close header와 별도 socket을 사용하고 cookie 공유/원 headers/body가 보존됨을 검사한다. 실제 Browser fetch에는 강제 close header가 없어야 한다. 합성 POST 수신 후 socket reset을1회 주입하면 client는 실패하고 server attempt는 정확1이어야 한다. 원래 환경의 reset 원인을 확정했다고 주장하지 않으며 원 실패는 보존한다. typecheck/lint 및 독립 signed17 전체로 동작을 검증한다. 제품 source/build bytes가 같으면 이 test-only 수리 때문에 전체 Vitest/build를 반복하지 않고 이전 실행 source와 새 test source를 구분한다.

긴 최종 시험은 새 고유 transient `systemd --user` unit에서 실행한다. 명시 nvm PATH·issue worktree cwd·합성 시험 환경만 전달하고 stdout/stderr를 private 파일에 보존한다. unit의 loaded/exited·ExecMainStatus·Result와 실제 Playwright 최종 summary를 함께 확인한 뒤 정리한다. 이는143 중단의 원인 수리 주장 또는 기존 실패의 자동 재시도가 아니라 별도 새 qualified run이다. Root가 정확 cwd/origin/소유 tmp fixture를 확인한 이전3394 listener만 종료하고 port-free를 확인했다. 운영 App/Worker·컨테이너·다른 작업 process는 변경하지 않는다.


### ADR24 Developer 구현·검증 결과 (2026-11-15)

closeApi/closeRouteFetch와 명시 local transport probe를 추가하고 signed9파일에 연결했다. 공유ready-scene/owned-sessions는wrapped API로호출하며7개route.fetch도모두포함했다. 제어시험PASS(30distinctclosed sockets,4reset POST각1회,쿠키/헤더/본문보존,Browser미변경), typecheck/lint/owned-session3건PASS, 기존productionbuild의signed17건이6.0m/exit0으로완료됐다. 실제Next partial trace553건모두close관측과raw45개private보존을추가했다.

초기probe기대오류·첫transientunit의fixture명guard거절·기존reset/143을별도로보존했다. 최종unit의summary/exited/ExecMainStatus0/Resultsuccess를확인한뒤정확소유unit정리/3396port-free를확인했다. 제품source/buildID동일및11test파일실행중동일;구체명령·hash·범위는 [IssueEvidence/201](IssueEvidence/201.md) 정본이다. 독립QA와Root frozenrelease는아직후속이며 원인확정/출고완료로해석하지않는다.


## ADR-T201-25 — 늦은 상세 도구와 키보드 행 가시성 (2026-11-15)

독립 QA phase4의 signed17은16PASS/1FAIL로 완료됐다. 200혼합행에서 End는 마지막 행 focus에 성공했지만 그 행의 viewport ratio가0으로 남았다. trace는 최초 End scroll 이후 OutlineActions footer가 추가되어 Tree 목록 높이가 줄어든 순서를 보인다. 정밀 검토상 실제 Outline GET200은 End 전에 끝났고 후행 actor session 확인은 End 뒤 완료됐다. 따라서 원인은 **늦은 인가된 workspace commit에 따른 viewport 축소**라는 가설이며 raw GET 도착 순서만으로 단정하지 않는다. 기존16PASS·transport 대조·이전 Developer17PASS는 이 실패를 대체하지 않는다.

Developer는 먼저 같은 실제 actor/cookie의 기존 session-invalidated refresh를 사용해 Outline workspace를 checking 상태로 만들고, 해당 Version의 실제 Outline GET을 closeRouteFetch로 전달하여 받은200 응답의 delivery만 gate로 보류한다. Tree metadata의200행과 footer 부재를 확인한 뒤 End 및 마지막 행 focus/완전 가시성을 확인한다. gate 해제 후 실제 임시100/서버100 footer와 목록 높이 감소를 관측하여, 마지막 행이 가려지는 기존 build의 deterministic RED를 기록한다. 임의 DTO·고정 sleep·timeout 확대·footer를 기다린 뒤 End 입력으로 우회하지 않는다. 기존 transport close/no-retry 및 finally gate release/route 종료를 유지한다.

제품 보완은 VersionTreePanel의 자기 Tree scrollport 안에서만 최소 scrollTop 보정이다. 키보드 focus 이동은 preventScroll로 유지하며 scrollIntoView의 ancestor 이동 대신 실제 행 header와 Tree clientbox의 rect 차이를 사용한다. branch treeitem 전체는 descendants를 포함하므로 첫 header 행만 reveal한다. Tree viewport ResizeObserver는 현재 실제 DOM focus가 그 Tree 행 안에 있을 때만 가려진 focused header를 보정하며 선택 상태만으로 이동하거나 focus를 옮기지 않는다. 스크롤 이벤트·주기 polling에는 반응하지 않아 사용자 수동 스크롤을 끌어당기지 않는다. observer/예약 callback을 unmount 시 해제하고 actor/Version scope 교체 후 detached/구 행에 쓰지 않는다. Canvas/Manager·source fetch/parse·원본/도메인 데이터는 변경하지 않는다.

**TC-T201-22:** 실제 held-response RED→새 production build GREEN, 동일 마지막 key/focus와 완전 가시성, Tree 높이 감소와 보정 scrollTop, window/외부 scrollable ancestor 위치·Canvas identity 불변을 계측한다. Home/End 및320px 기존 회귀를 보존하고, 검색 input 등 Tree 밖으로 focus를 옮긴 상태에서 viewport가 줄어도 focus를 훔치거나 이전 선택 행을 reveal하지 않는 대조를 추가한다(자연 max-scroll clamp는 구별). 필요 시 header branch도 첫 행 reveal을 검증한다. typecheck/lint/build와 집중 시험 후 독립 QA의 default19/signed17·화면 검증을 실행한다. 기존 full1151은 원 source 근거로 유지하며 이번 UI 변화만으로 unrelated full suite를 반복하지 않는다. 실패·미실행·실제 대행 모델을 append-only로 기록하고 Root의 최종 clean-source release와 구분한다.


### ADR25 Developer 구현·검증 결과 (2026-11-15)

TC22 실제heldOutline200 응답으로기존build의299→178px축소/scroll7743유지/동일focus행가려짐을RED로확인했다. VersionTreePanel의own-scrollTop/ResizeObserver최소수리뒤새productionbuild에서scroll7743→7864로동일focus/전체가시성을유지했다. window/ancestor/Canvas불변,외부buttonfocus중resize의no-steal/no-reveal,branchHome/320키보드회귀포함관련4파일10건PASS3.7m이다. typecheck/lint/build완료,unit정상종료및정확소유자원정리를확인했다.

상세실패·결과·sourcehash·재현argv는 [IssueEvidence/201](IssueEvidence/201.md) 정본이다. Root추가frozen수용은setup누락을막기위해first-install/outline-types/typed-outlines/issue201-unified-tree4전체파일10건을사용한다. 독립QA최신default19/signed17·화면및Root release는후속이며기존QAphase4실패를대체하지않는다.


## Manager fixture 보완 — 로그인 입력란의 정확한 역할 선택 (2026-11-15)

독립 QA phase5는 새 ADR25 제품 빌드에서 default19/19 PASS, signed15PASS/2FAIL을 실제 완료했고 시작/종료 source fingerprint가 동일했다. 첫 실패는 `outline-types.spec.ts:7`의 `getByLabel('계정')` 부분 일치가 header link의 `로그인 필요 · 계정 / 로그인`과 실제 login textbox의 `계정`을 함께 선택한 strict-mode 오류다. 로그인·catalogue 준비 이전이며 transport 또는 서버 인가 실패가 아니다. 후행 typed-outlines는 이 선행 시험이 생성해야 하는 `r2reader`가 없어 `.id` 읽기에서 실패했다. 독립적인 제품 결함으로 확대하지 않고 원 오류와 seed 의존 연쇄 실패를 함께 보존한다. 반면 ADR25 실제200행 case17은 PASS로 같은 focus/key와 clientHeight299→178, scrollTop7743→7864, 완전 가시성·외부scroll/Canvas 불변·no-steal/Home/320px을 검증했다.

선택된 signed9파일의 account locator를 읽기 전용 검사했으며 다른 login helper는 이미 exact:true다. Developer는 실패한 한 줄만 `getByRole('textbox', { name: '계정', exact: true })`로 바꾸고 입력 값·흐름·모든 업무 assertion을 유지한다. header가 나타날 때까지 기다리거나 숨기기, `.first()` 선택, retry·sleep 추가는 하지 않는다. typecheck/diff 및 제품 source/production build 불변을 확인하고 독립 QA가 동일 제품 bytes에서 signed17 전체를 새 실행한다. 새 제품 build·default19·unrelated full Vitest를 이 test-only 한 줄 때문에 반복하지 않는다. 과거 결과는 각 source에 귀속하며 전체 signed 수용은 새 실행 완료 전까지 보류한다.

**TC-T201-23:** 원 실제 strict2 trace 보존; 정확 textbox로 로그인 및 R2 catalogue/Reader 준비·기존 권한/Scene 보존 assertion 수행; 후행 typed Reader 회귀 및 나머지17건 완료. 최신 ADR25 focus case도 재실행한다. production deployment는 이 요청의 승인 범위 밖이며 남은 작업으로 추가하지 않는다.


## ADR-T201-26 — 모바일 패널 자체의 바깥 스크롤 경계 (2026-11-15)

독립 phase6 signed17/17은 기존 assertion 범위에서 PASS다. Manager 최종 PNG 검토 후 별도 실제320×800 probe에서 마지막 End 행이 Tree clientbox 안에 있어도 VersionTreePanel 자체의 바깥 overflow body에 일부 잘림을 확인했다. 행 y666.140625–714.140625(48px), body/dock clip bottom709.8125, 실제 노출43.671875px/하단4.328125px 잘림이며 중심 hit는 행, 아래쪽 y712.140625 hit는 shell이었다. End 직후 PNG도 일치한다. 같은 제품/build와 기존100서버+100브라우저임시 객체로 재현했고 business table fingerprint 불변, 외부 scroll/window0이었다. 이전 server-confirmation 상태 문구는 업무 mutation을 금지한 probe에 없었다. 원17PASS를 FAIL로 바꾸지 않고 검사 범위 누락과 새 실제 결함을 구분한다. raw 첫 aggregate가 fixed shell 밖 BODY 높이를 잘못 clip에 포함한 값은 무효로 보존하며, fixed shell/viewport까지의 교정 geometry와 실제 hit/PNG만 근거로 쓴다. 정본은 private `mobile-end-probe/probe-summary.json` SHA256 `db665095f4ba844f200780cbcfc88ca05720fa7bbe79dd3911e4a9428eae6981`이다.

VersionTreePanel 자신의 overflow body에 명시 ref를 추가한다. 현재 실제 focus가 연결된 해당 Tree 행 안에 있을 때만, 기존 leaf/branch header를 Tree scrollport 안에 먼저 reveal하고 rect를 다시 읽어 같은 panel body 안에 reveal한다. 변경 가능한 scrollTop은 **Tree와 이 panel body 두 곳뿐**이다. 문서·Canvas·다른 panel·임의 상위 ancestor를 스크롤하지 않는다. 기존 computed outline width/offset의 작은 양수 outset도 고려하여 가시 focus 표시를 경계 안에 남기고 필요한 delta는 바깥 방향 정수 반올림으로 처리한다. global CSS·drawer 높이·업무/세션 API 변경은 없다. ResizeObserver는 같은 Tree와 body의 크기를 관측하고 keyboard 이동과 같은 bounded helper를 사용하며, 실제 focus가 밖이면 no-op이다. scroll listener/polling·focus 이동은 없고 unmount 때 모두 disconnect한다. 기존 actor/Version/session key 격리를 유지한다.

**TC-T201-24:** 기존200행 시험의320px End 직후, Home 전에 실제 행/outline과 Tree→own body→wrapper→dock→workspace→fixed shell 및 viewport의 교정 교집합을 비교한다. fixed shell 밖 BODY rect를 clipping 근거로 사용하지 않는다. 중심·아래쪽 elementFromPoint가 같은 행/자손인지 검증하고 End PNG/geometry를 먼저 보존한다. Tree와 own body만 scroll 변경을 허용하며 나머지 ancestor/window·Canvas identity 불변을 확인한다. 기존 Tree-clientbox·desktop delayed-footer/외부 scroll0·no-steal·Home/320 회귀를 유지한다. 현재 build에서 강화 assertion RED 후 최소 제품 수리·typecheck/lint/build·의존4파일 GREEN10을 실행한다. 독립 QA는 새 build의 bounded 실제 mobile End probe와 필요한 집중 키보드 회귀로 변경 범위를 검증하며 전체17/default19를 자동 반복하지 않는다. Root final frozen release24+추가10은 별도 필수 단계다. 이전 결과·새 실패·실제 실행 범위는 append-only로 남긴다.


ADR26 추가 검증 경계: mobile End focus를 유지한 채 높이를800→740으로 줄여 Tree가 최소 높이에 머물러도 own body ResizeObserver가 행 가시성을 유지함을 확인한다. Tree 밖 control로 focus를 옮긴 같은 resize 대조에서는 focus를 훔치거나 이전 행을 다시 reveal하지 않아야 하며 자연 scroll clamp는 별도로 구분한다. 기존 범위 안 실제 viewport resize이며 sleep·전역 scroll 우회는 없다.


### ADR26 Developer 구현·집중 검증 결과 (2026-11-15)

강화 TC24의 기존build RED7건6PASS1FAIL 후 정확 own Tree/body scrollTop·한 ResizeObserver의 두 영역 관측 보완을 적용했다. 새build의 의존4전체파일 GREEN10/10 PASS3.5m/실제 terminal exit0. 320×800 End 및 focus 유지800→740에서 행/outline/hit 전체가시성, 외부ancestor/window/Canvas불변과 검색focus no-reveal 대조를 확인했다. typecheck exit0; lint log0errors12baseline 및 build route완료/newartifact는 있으나 두 terminal은 handle 소멸로 NOT_OBSERVED이며 PASS로 주장하지 않는다. 독립 bounded QA와 Root 정식 frozen qualification이 후속이다. 실제RED/GREEN·해시·PNG·한계는 [IssueEvidence/201](IssueEvidence/201.md) 정본이며 운영 배포는 승인 범위 밖이다.


## ADR-T201-27 — 출고 전 Next.js 보안 의존성 보완 (2026-11-15)

Root의 새 frozen source39f8c39c2c334f4fc1ae49de01ebac9bd4cd2511 build에서 npm audit21건(11moderate/9high/1critical), 별도 현재 audit에서20건(10moderate/9high/1critical)을 관측했다. 서로 다른 feed snapshot으로 보존한다. 0.62→0.63의 package/lock 변경은 앱 버전뿐으로 해당 pins는 기존 것이지만, 이를 안전 근거로 쓰지 않는다. 원 source는 로컬 commit이며 미push·미게시다. 원 증거를 보존하고 amend/history rewrite 없이 새 보완 commit으로 다시 정식 검증한다.

Manager는 공식 [Next OG advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Image Optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [use cache advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr)와 고정 graph를 조사했다. App standalone에 Next16.3.4/sharp0.35.4가 있고 glibc runtime이다. 앱에는 next/og/ImageResponse·use cache·Server Action 사용이 없고 action manifest node/edge가 비어 있으며, remotePatterns[] 및 dangerouslyAllowSVG=false다. 그러나 Image Optimization endpoint 자체는 기본 활성 상태여서 import 부재만으로 취약 코드가 실행 불가라고 단정하지 않는다. 현재 exploit을 실증한 것이 아니라 구체적인 runtime advisory에 대한 예방 보완이다.

Root가 승인한 최소 변경은 `next`와 `eslint-config-next`를 **16.4.6**으로 함께 정확 pin하고 같은 lock closure의 sharp를 **0.35.5 이상**으로 확인하는 것이다. npm registry metadata의 Next Node>=20.9.0/React19/ESLint>=9 peer는 기존 Node22.14/React19.2.8/ESLint9.39.4와 호환 범위다. 실제 기능 호환은 새 시험으로 검증한다. Next16.4.6은 route response compression 변경도 포함하므로 source/Scene/HTTP 회귀를 생략하지 않는다. React·Prisma·CAD 라이브러리·DB/schema/migration·보안 기능·런타임 배포 설정을 추가 변경하지 않고, `npm audit --force`나 무관한 graph 일괄 교체는 금지한다. 앱0.63.0은 아직 미게시이므로 유지한다.

이 결정은 npm audit 전체0건을 새 출고 조건으로 만드는 것이 아니다. 기존 ADR-051-R1의 별도 취약점 공격 실증 제외 정책과 구체 runtime 경고 보완을 구별한다. Prisma/config/deepmerge/mysql2는 SQLite/trusted CLI 경로이며 App standalone에는 없고, Worker full dependency copy에는 개발 패키지가 포함된다. Zod/Vite/brace-expansion은 개발 graph, source-map-js는 Next/PostCSS closure에 있으나 앱의 외부 source-map 입력 경로를 찾지 못했다. 이는 코드/closure 조사에 따른 노출 분석이며 모든 공격 가능성 배제 또는 경고 해소 PASS가 아니다. 남는 advisory는 정확 package/role/실행 경로와 함께 기록한다.

**TC-T201-25 / AC:** (1) package/lock pins·engine/peer·변경된 transitive closure를 검토하고 기존 React/Prisma/CAD pins 불변을 확인한다. 새 clean install의 audit JSON에서 Next critical 및 sharp advisory가 제거되었는지, 잔여 경고를 별도로 기록한다. (2) 관측 terminal이 있는 supervised 실행으로 Prisma generate/typecheck/lint/full unit/build 및 기본19/signed17 전체를 새 source에서 검증한다. 정식 Root release24/강화Greenfield10/transport probe·3-role archive build·clone 보존은 새 commit SHA에서 재실행한다. (3) 새 App standalone 및 최종 이미지의 실제 Next/sharp 버전을 확인하고 health/CAD source·Scene·login/권한/Tree·mobile·다운로드 바이트/응답 계약을 기존 회귀로 검증한다. 무해한 SVG/허용되지 않은 원격 image 요청 거절도 확인하되 exploit payload는 만들지 않는다. (4) 이전 source의 성공을 새 dependencies에 승계하지 않고 실패·미실행·잔여경고를 보존한다. Developer 보고→Manager 검토→독립 QA→Root 새 commit 순서이며 운영0.62/DB/볼륨 배포는 변경하지 않는다.


### ADR27 TC25 보완 — 다운로드의 실제 HTTP framing 계약

새 framework-boundary 집중 실행은1PASS/1FAIL/3NOTRUN, signed10NOTRUN으로 중단됐다. 새 시험이 identity 응답에 Content-Length 존재를 필수로 가정했지만 실제 값이 없었다. 원본11818bytes의 SHA와 다운로드·보안 헤더 검증은 통과했고, 기존 route는 여전히 Content-Length를 설정한다. 이 실패를 원본 손상이나 인증 실패로 해석하지 않는다.

Manager/Developer가 [Next16.4.6 공식 tagged send-response](https://raw.githubusercontent.com/vercel/next.js/v16.4.6/packages/next/src/server/send-response.ts)와 설치 코드를 대조했다. 이 버전은 decoded body의 잘못된 전송 framing을 막기 위해 Response의 content-length/content-encoding/transfer-encoding을 하위 Node 응답에 그대로 복사하지 않는다. 같은 실제 새 build·실패한 disposable DB에 대한 별도 raw Node HTTP 관측에서 identity 및 gzip,deflate,br 요청 모두 HTTP1.1/200, Transfer-Encoding:chunked, Content-Length/Content-Encoding 부재, complete=true와 정확11818bytes/SHA 일치를 확인했다. 이는 압축된 전송 성공을 뜻하지 않으며 두 협상 모두 실제 identity body였다. 원 probe는 Developer private framing-probe.json을 정본으로 보존한다.

기존 요구·다운로드 소비자에서 wire Content-Length 필수 계약을 찾지 못했으므로 새 fixture의 존재 강제를 과도한 가정으로 판정한다. 제품·외부 라이브러리·compression 설정은 변경하지 않고 시험을 유효한 HTTP1.1 framing 검사로 보완한다: Content-Length와 Transfer-Encoding 동시 존재 거부; 길이가 있으면 숫자이며 unencoded 실제 byte 길이와 일치; 길이가 없으면 chunked 전송 확인. 기존 정확 body SHA·Content-Type/Disposition·nosniff·private,no-store는 유지한다. 실제 FAIL/미실행은 보존하고 test-only 수정 뒤 typecheck/lint 및 새 focused5/10, 독립 기본19+새2/signed17을 실행한다. 직전 full1151/build는 같은 제품 bytes의 실행으로만 귀속하며 test-only 변경을 새 전체 실행으로 기록하지 않는다.

기록 순서: Developer는 위 raw 관측을 보고하며 제안된 test-only 조건을 먼저 반영했고 Manager의 기록 대기 메시지 직전에 수정이 끝났다. 이후 실행·수정은 중지했다. Manager가 근거와 판단을 기록·검토한 뒤 재시험을 지시하며, 이 보완 단락이 해당 한 줄 수정 전에 작성됐다고 소급 주장하지 않는다. ADR27/TC25 원 요구·시험 기준은 의존성 구현 전에 기록돼 있었다.
