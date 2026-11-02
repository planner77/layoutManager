## 0.57.0 — #202 / #204 구현 후보 (2026-11-02)

- Added: 기본 도면 목록의 권한 기반 메모 제목·본문 검색, Version 단위 결과·일치 개수/최대3 미리보기 및 정확한 메모 링크. 빈 조건의 기존 조회·Current/전체 버전 계약을 유지한다.
- Fixed: 기준정보 이름만 저장할 때 다른 세션에서 변경한 상태·Site 종류를 덮어쓰지 않도록 변경 필드만 PATCH한다. UUID·부모·참조 데이터 불변 정책의 회귀를 보강한다.
- Tests: 전체924 Unit, 독립 General27/signed3 Browser, 이름·G7/감사·메모/구역/원본 보존 및1k/10k/100k SQL 계측을 검증했다. 실제 범위/실패/재시험은 TestReport/FailureLedger를 따른다. 로컬 코드·합성 후보를 수용했으며 새 PR CI 결과·릴리스는 미확인이다.

---

## 0.56.0 — Issue #196 의미론적 구역 (Main 병합, GHCR 게시 기동)


- Added: 층별 구역 ID·업무 메타데이터·부모 계층, Site 카테고리, Version/SHA/Scene별 Polygon mapping과 G7 권한·CAS·멱등 생성·감사·논리 삭제.
- Added: Viewer 구역 생성/목록, 기존 객체 Snap과 자유 WCS 입력, 계층 트리·상세·검색·표시·Bounds focus 및 공통 이동 패널 연계.
- Fixed (PR #200 CI/review): G7 OFF 구역 조회 생략, 일시적 조회 실패 후 수동 재시도 접근, 수동 Viewer 전환 중 진행 원본 공유. 실패 원장/재시험을 보존하며 버전0.56.0을 유지한다.
- Schema: 신규 빈 Greenfield 전용 baseline, 과거 설치 fingerprint 보존. 기존 운영 Volume 자동 이전 없음.
- 검증·제약: 단순 Polygon, 교차점 Snap 미지원, V2 자동 경계 이관 없음. 실제 결과는 TestReport/FailureLedger의 #196 기록을 따른다. PR #200 최종 CI 8/8 SUCCESS·Main ae928b4 병합·#196 종료 완료. Main CI 41339438989의 GHCR App/Migrator 게시 시작; 실제 게시 완료·digest·배포·현장 #113/#193 수용은 미확인.

---

## 2026-11-01 — PR #194 CI 시험 보완 (0.55.3 후보 유지)

- `TC-E2-E2E-001`이 메뉴 종료의 지연 포커스 복원과 경합해 Ctrl+Z를 input으로 보내지 못한 시험 순서를 보완한다. trigger 복원→input 포커스 확정 후 native 이벤트·전역 기본동작 비차단·Undo 불변을 검사한다.
- 실패 Run `41293959571`과 실제 재현/로컬 검증·새 CI 경계를 [FailureLedger](FailureLedger.md)/[TestReport](TestReport.md)에 누적한다. 제품 코드·Schema·API·배포 변경 없음.

---

## 2026-11-01 — #191 위치 기준정보 트리/상세 편집 (PR CI 후보)

- /masters 5열 카드 CRUD→반응형 계층 트리+선택 상세, 검색/비활성 필터/키보드/명시적 저장·확인·이력 링크.
- MasterRepository 신규 자식 생성 시 비활성 조상 검증 강화. API payload/DB schema/Version/Current/원본/Auth/Audit 미변경. Unit/Integration/Browser 테스트 갱신.
- 신규 검증 및 원격 PR CI 결과 NOT VERIFIED; GHCR 게시/병합·배포 아님. [설계/수용](Issue191.md).

---

## 0.55.2 — #81/#160 Owner Managed 코드 병합·릴리스 기동 (2026-11-01)

- PR #192 HEAD `3da74d76134e69924018e519ff4ce458e96c7487`, [PR CI 41281582636](https://github.com/planner77/layoutManager/actions/runs/41281582636) Verify/Docker 둘 다 SUCCESS, [Squash Main `b3fcf3eda19177f52e00c0191d5ffb9f333bb0e8`](https://github.com/planner77/layoutManager/commit/b3fcf3eda19177f52e00c0191d5ffb9f333bb0e8) 성공.
- [Main CI 41283558627](https://github.com/planner77/layoutManager/actions/runs/41283558627) 시작 확인, App 0.55.2/Migrator 0.55.2-migrate GHCR 실제 게시/OCI digest 결과 NOT VERIFIED. Epic #81/#160 코드 범위 closed/completed; S7 필드 #193 OPEN 및 #96/#113/#190 기존 미수용 유지. 사후 문서 업데이트는 GHCR 재게시 대상 아님.

---

## 0.55.2 후보 — Epic #81/#160 교차 무결성 (2026-11-01)

- 동일 Origin+Scene ID가 중복되면 Memo Session Snap 선택·이동·projection을 차단, 연결 메모 마지막 WCS 유지. S6 reset DB 조회 행의 ID 유일성 강화.
- 회귀 Unit 2개·설계/ADR/요구/시험/실패 원장 갱신. `src/package.json` / `src/package-lock.json` 0.55.2 일치, 기존 v0.55.1 GHCR tag 이동 금지. [세부](Epics81-160.md).

---

## 0.55.1 코드/합성 검증 완료 — PR #189 Owner Managed Squash Main (2026-11-01)

- PR CI [41278134690](https://github.com/planner77/layoutManager/actions/runs/41278134690) Verify/Docker 성공, Main Squash `19167bc3274ac7955ecb2935602f0404cd0a82bf` 및 [Main CI 41280051780](https://github.com/planner77/layoutManager/actions/runs/41280051780) 기동 확인. `v0.55.1`/GHCR App·Migrator 게시·OCI digest는 확인 전 NOT VERIFIED.
- #186 코드·합성 범위 `closed/completed`; 실제 DXF/GPU·frame/Heap·2PC 현장 AC는 #190 `OPEN/BLOCKED` 이관, #96/#113 유지. 이전 성능 수치로 개선이나 장기 leak-free 증명 불가.

---

## 0.55.1 PR-C 후보 — #186 Memo projection 및 Heap 진단 강화 (2026-11-01)

- 100-pin WCS 투영을 한 번의 CSS canvas rect 읽기와 단일 Three.Vector3 재사용으로 처리. 기존 단건 projection/legacy fallback 유지, React 동일 screen snapshot no-op.
- Three adapter dispose 시 Render controls 'change' listener와 큰 source/renderIndex/SceneAsset 참조를 명시 해제. 기존 Browser source·Scene·CAS·audit·작성자 정책 그대로.
- 0 Memo/100 Visible/100 Hidden pan frame p50/p95와 3회 Dispose GC heap/DOM/Worker/listener를 나눠 측정하는 Browser test 보완; pure 100 pin+candidate batch unit 추가.
- 실제 개선 수치, 이전 16.8MB Heap의 앱 누수 여부, GPU/VRAM/2PC Owner 수용은 **NOT VERIFIED**. #186은 필드 수용 전 Open 유지, #96/#113과 구분. 기존 v0.55.0 이미지는 변경하지 않음.

---

## 0.55.0 후보 — #172 Memo 동일 Site Editor 공동 수정 (2026-11-01)

- Site/Version/Role/Session/G7 서명 권한을 확인한 Editor는 다른 작성자의 영속 Memo 내용·좌표·일정/완료·표시/그룹·Anchor 수정 가능. Memo 논리 삭제는 작성자 또는 동일 Site Grant 가진 Admin으로 제한.
- SOURCE_ONLY의 타인 메모 Anchor 해제 EDIT 허용, ALL에서 타인 소유 Memo 일괄 삭제는 Site Admin에게만 허용. Group 작성자 자체 권한 유지, 그룹 제거 시 타인 메모 미분류 처리.
- Memo GET actor/canDeleteAny 표시 힌트, Viewer 삭제 버튼 비활성화·문구 정비, Signed G7 단위/Greenfield 두 브라우저 회귀 추가. 신규 DB Schema·원본 CAD·Renderer·release gate 변경 없음.
- **실행 증거:** 실제 새 PR CI/Owner Managed QA 완료 전 기능 수용 미확정. 기존 GHCR 0.54.x 태그 재사용/변경 금지, 2PC 현장 수용 별도(#96/#172/#113).

---

## 0.54.1 후보 — #37/#49/#50 Viewer/Logs 통합 신뢰성 (2026-11-01)

- Fixed: Viewer 실행 메뉴에서 비활성화된 링크 항목에 실제 이동·다운로드 href가 남지 않도록 fail-closed 처리. 활성 URL 명령과 기존 패널·원본/생성 선택을 유지한다.
- Fixed: 서버 로그 요청/작업 타임라인의 확인된 cursor 만료·영속 로그 저장소 오류에서 실패한 단계는 제거하되 별도 인가된 메인 목록은 유지. 인가 실패·알 수 없는 오류는 전체 로그 Row 폐기.
- Added: #37/#49 통합 합성 DXF·Generated Rotate/Undo/Redo·원본 SHA E2E, #50 Timeline 저장소 오류 Greenfield E2E, Viewer 메뉴 Unit, [통합 인수 문서](Epics37-49-50.md).
- Scope: 기존 Auth/Audit, CAD 원본/DB/Volume, #63 원시 컨테이너 로그 수집 제외. 새 CI·현장 검증은 NOT VERIFIED. 이 항목은 게시/Release 완료 기록이 아니다.

---

## 0.54.0 후보 — #91 R5b 보이는 메모 교환 파일 (2026-11-01)

- Added: 선택한 local/server Memo의 전체 한글 제목·본문을 GLB/embedded glTF의 PNG plane·핀·연결선으로 표현한다. 숨김과 포함을 분리하고 Memo-only 및 DXF/Generated 혼합, AUTO/수동 미터 글자 높이를 제공한다.
- Added: 같은 revision의 세션 projection 또는 canonical/BROKEN WCS 증명, 읽기 전용 snapshot, 서버 Memo GET의 호환 actor/Version/SHA/Scene envelope와 전후 선택 row 검증. 권한 실패 후 private 선택을 제거하고 local 선택을 보존한다.
- Fixed: 실제 Browser에서 발견한 메모 글자 수직 반전을 수정했다. 원본 정밀도 복구 불가 고지와 Version/SHA를 실제 artifact에 포함하고, 비가역 snap target은 마지막 WCS의 BROKEN으로 처리한다.
- Validation: BUILD2·typecheck PASS, whole lint0 errors/기존9 warnings, 전체unit131 files/883 PASS, 독립 QA General146 PASS, Greenfield21 PASS, Auth/Legacy 각1 PASS. 1k/10k LINE+10Memo 실제 load 계측을 포함해 LOCAL CODE+SYNTHETIC ACCEPT/Draft PR GO이며 게시·새 CI는 후속이다. 실패와 재시험, font/PNG 취소 및 heap 한계는 [TestReport](TestReport.md)를 따른다. 기존 Schema/DDL/운영 DB·원본·Current는 변경하지 않는다.

## 0.53.0 후보 — #91 R5a GLB / glTF 교환 파일 (2026-11-01)

- Added: DXF three-dxf-viewer의 렌더 레이어 및 확정 local/권한 있는 server Outline을 선택해 GLB 또는 embedded glTF로 내보내는 읽기 전용 기능. 원본 배치 baseline과 현재 Generated 기하를 구분한다.
- Added: 단위→미터·오른손계 XZ·중심/지정 원점, Layer별 제외 및 스타일 손실 사전 안내, 부분 산출 동의, 현재 actor/서버 내용 재검사, 취소 후 결과 폐기와 owned 자원 정리.
- Fixed during development: material-group 확장 정점의 사전 한도 누락을 독립 QA로 발견하고 복사 전 검증으로 보완. 실제 r171 exporter의 Lines/Points unlit 표시는 export-only material로 유지한다. 공개 로컬 내보내기는 보호된 Outline/Site 권한에 종속시키지 않는다.
- Validation: foreign Three guard 회귀31 PASS, 최종 전체unit127 files/858 PASS, 독립 QA 일반Browser128 PASS, Greenfield17 PASS, Auth/Legacy 각1 PASS, type/lint/build PASS(기존lint9 warnings). LOCAL R5a ACCEPT 후 Draft PR184 게시 및 정확9accf8b의 Verify/Docker CI SUCCESS를 확인했다. 실제 결과는 [TestReport](TestReport.md)를 따른다. 단일 Node 합성 계측을 Browser/GPU/실 CAD 성능으로 해석하지 않는다. Memo는 R5b 후속이며 #91 종료·병합·GHCR/배포는 아직 하지 않았다. 서버/API/DB/영속 Scene 형식 변경 없음.

## 0.52.0 후보 — #174 메모 스냅 선택·연결 유지 이동 (2026-11-01)

- Added:12 CSS px 안의 Endpoint/Vertex/Center 후보 선택과 명시 OFF, 키보드/터치용 목록,44px 핀 hit target. raw WCS와 선택 후보를 분리하고 동일 key/context를 다시 검증한다.
- Added: 세션 연결의 동일 target inverse 유지 이동 및 서버 anchor KEEP/DETACH reposition. 기존 Memo owner/Scene·Memo·target CAS/Audit를 유지하며 새 Schema는 없다.
- Fixed during development: 준비한 메모 의도의 Actor와 확정 Actor가 다른 client lifecycle 결함을 실제 RED로 확인했다. 직접 Session actor 증명 및 비동기 조회 generation 무효화로 보완하고 Root/독립 QA 집중 GREEN을 확인했다.
- Fixed: BLOCK renderer의 singleton Material을 유효한 전체 group coverage 조건에서 projection에 포함해 서로 다른 INSERT 후보를 유지한다. 외부 라이브러리/Source 권한은 변경하지 않는다. 개발 Auth 양성 시험은 owned disposable fixture의 opt-in clock으로 역행 환경을 통제하며 production guard를 유지한다.
- 후속 원격 검증: 정확 R4 `458d3da`의 CI41233433577 Verify/Docker SUCCESS. 아래 로컬 결과와 별도로 TestReport에 최종 CI815개 unit 및 Browser gate를 기록했으며 현장·배포 완료를 뜻하지 않는다.
- Validation: 기능/계측 로컬 수용 및 Draft PR GO. 최종 전체unit123/814, 일반Browser124, Greenfield13, Auth/Legacy 각1 및 집중/독립 QA 결과는 [TestReport](TestReport.md), 실패는 [FailureLedger](FailureLedger.md)를 따른다. Frame budget 초과와 두 번째dispose heap 증가 원인은OPEN이며 성능/장기누수·실 CAD/2PC·PR CI·GHCR/배포 수용은 아직 미완료다. 단일Viewer10k Memo 지원을 주장하지 않는다.

## 0.51.0 후보 — #71/#73 타입 지정 영속 외곽선 (2026-11-01)

- Added: 해당 Version/Site 권한으로 전역 활성 타입 카탈로그와 저장 외곽선을 조회한다. Reader는 조회, Editor 이상은 타입 지정 저장·수정·논리 삭제를 수행한다. 동일 사용자·Version·Idempotency-Key와 동일 정규화 요청의 재시도는 기존 결과를 반환하고 다른 내용은 409로 차단한다.
- Added: 서버 Snapshot을 참조하는 Viewer 타입별 트리·Overlay·선택·표시·내보내기. 서버 항목은 브라우저 GeneratedDocument Undo에 넣지 않으며 Scene pointer 변경에도 저장 기록과 WCS 연결을 유지한다. 모바일 도구는 좁은 화면에서 간결하게 표시한다.
- Export: 검증된 원본 기반 행은 Source-v2, 앱 WCS 행은 APPGenerated-v2 snapshot으로 분리한다. 교환용 APP ID는 새 UUID이고 서버 저장/Source 인증의 증명이 아니다.
- Schema: 새 빈 Greenfield baseline `202611010001`에 영속 타입/receipt 계약을 포함한다. 기존 운영 DB/볼륨 자동 migration은 없다. 현재 개발 후보 검증 범위와 전체 PR CI·현장 수용 잔여는 TestReport를 따른다.

## 0.50.0 기록 — #65 전역 외곽선 타입 관리 (2026-11-01)

- Added: Global OutlineType 목록·등록·수정·비활성화·복구 API와 기존 Viewer 이동 패널을 재사용하는 관리 화면. 서버 Admin/CSRF/활성 쓰기 권한, Unicode 이름 key·Unique, revision CAS 및 전용 append-only 감사를 적용한다.
- Schema: 당시 빈 Greenfield 신규 baseline에 OutlineType/OutlineTypeAudit와 실제 CadOutline 타입 FK를 추가했다. 과거 baseline/DDL/운영 볼륨은 보존하며 자동 migration은 제공하지 않았다. 당시 후속이던 타입 확정·영속 트리 사용은 위 0.51.0 후보에 구현했다.
- Validation: 전체 Vitest114files/760tests PASS, Production Build/Typecheck/Lint PASS(기존 경고11개), Greenfield 브라우저4/4 및 수정한 기존 Gate2files/4tests PASS. 일반 CAD 초기115PASS/2FAIL의 구404기대 수정 이력은 보존하며 별도 실행을 새 전체117PASS로 합산하지 않는다. 독립 QA26PASS와 실제 Migrator build·tmpfs 신규설치/재시작/FK PASS. 원격 CI·현장·배포는 별도이며 역할별 근거는 TestReport/FailureLedger를 따른다.

## 0.49.0 후보 — #60/#61/#62 운영 로그 조회 (2026-10-31)

- Added: 기존 G7 세션·Admin+logs:read·감사를 재사용하는 전역 로그 읽기 인가, 고정 private JSONL 조건 조회 API, bounded snapshot cursor와 정제 DTO.
- Added: 별도 운영 화면의 기간/레벨/출처/작업/상관 ID 검색, 최신순 목록·상세·시간순 타임라인, 명시 페이지 조회와 비활성/일부/만료/오류 안내.
- Docs: 잔여 18개 이슈를 의존 순서대로 PR 단위와 정책/현장/관리자 작업으로 매핑. 실제 DB/운영 권한·Compose/Volume/원시 로그 수집 변경 없음.
- Validation: 전체 Vitest 731/731 PASS 후 새 Proxy 보안6/6 PASS, 일반 CAD E2E117/117 및 통제 합성 시계 Greenfield3/3 PASS, 최신 Production Build/Typecheck/Lint PASS(기존 경고11개). 서로 다른 실행을 전체737회 단일 실행으로 합산하지 않는다. 실제 시계 역행 실패·fixture 조치·독립 QA와 PR CI/현장 잔여는 TestReport/FailureLedger에서 분리한다.

## [0.48.0 후보] Issue #55 / #56 브라우저 GENERATED 편집 (2026-10-31)

- #55: 기존 WCS XY GeneratedDocument Rotate 명령을 그룹 Pivot 계산, 수치 편집(+ = CCW), Canvas ↻ Ghost/ESC/PointerUp 확정, Undo 1단계에 연결. 기존 SOURCE/RENDER/mixed fail-closed, Hole/MultiPolygon 및 immutable base 보존.
- #56: `cad-generated-objects` 브라우저 JSON v2 Export/Import. Version/SHA/INSUNITS/UUID/Origin/Provenance/허용 rigid operations/Geometry/크기 검증, 전체 성공 시 atomic replace; 기존 #31 v1/typed v2 Legacy와 다운로드 호환 유지. 서버 업로드/자동 DB 저장 없음.
- 메뉴 위치는 #127 `도면` 그룹과 #138 기존 `작업 → 선택·편집 도구` 이동 패널을 재사용. `src/package.json` + `src/package-lock.json` 버전 0.48.0 후보. 회귀 및 구현 상세 [Issues55-56](Issues55-56.md). PR CI/현장 수용 결과 미확인.

---

## 0.47.5 — PR #177 Owner Managed 병합·GHCR Main 실행 인계 (2026-10-31)

- #139(UTF-8 vs stale ANSI_949 text index), #138(공통 Viewer movable Layer/Outline/Tools/TEXT Panel), #137(전체 도면 목록 Link + 미저장 Confirm) 구현·합성 회귀 및 [PR CI 41166539969](https://github.com/planner77/layoutManager/actions/runs/41166539969) Verify/Docker SUCCESS.
- 3 Codex P1 리뷰 답변/Resolved, Main 충돌 0. [Squash `82ebb4c8`](https://github.com/planner77/layoutManager/commit/82ebb4c8b953b96497e7b287d600d8f6a9f59af4), 관련 Issues #139/#138/#137 `closed/completed` (합성 코드 범위).
- Main [CI 41167762237](https://github.com/planner77/layoutManager/actions/runs/41167762237) release-scope SUCCESS / GHCR job 시작. **App/Migrator 0.47.5 이미지 게시 성공·정식 digest는 아직 미확인**. 기존 v0.47.4 및 실운영 Auth/DB/볼륨/현장 원본 변경 없음. 이 항목은 post-merge docs-only 증거 기록.

---

## 0.47.5 — PR candidate #139 → #138 → #137 (2026-10-31)

- #139 DXF $ACADVER/legacy ANSI_949 정확 판정 및 UTF-8/CP949 strict 한글 검색 회귀.
- #138 공용 MovableViewerPanel을 레이어/외곽선/도구/텍스트 검색으로 확대, M4 메모 호환 및 Canvas/검색 상태 보존.
- #137 Viewer 좌측 맨 앞 전체 목록 이동 앵커와 미저장 작업 확인. 서버/DB/Source/Auth 불변. PR CI 및 GHCR 미수행.
- 설계/테스트 [Issues137-139](Issues137-139.md).

---

## 0.47.4 — verified GHCR App/Migrator paired release (2026-10-31)

- [PR #176](https://github.com/planner77/layoutManager/pull/176) delivers #88 M6 persisted Memo share link and #90 M7 secure cross-drawing search. Release source Main `328bbdc0ca02649cc551a61962cec9e76816ccde` from successful [PR CI #349](https://github.com/planner77/layoutManager/actions/runs/41158289254).
- [Main CI #100](https://github.com/planner77/layoutManager/actions/runs/41159460418) **SUCCESS** with `v0.47.4` tag at release source; App `ghcr.io/planner77/layoutmanager:0.47.4`/`:latest` `sha256:fb608774450146144c0f47f0aa651df8d9b38d9166b005a366448dd9e9ea3140`; Migrator `:0.47.4-migrate`/`:latest-migrate` `sha256:aa9ed793289654b78ea39907e5145e810813956ad1c41669f6bfa81107c161e5`. The old `v0.47.3` release remains immutable.
- #88/#90 closed/completed (code/CI implementation scope only). No physical field G7/2-PC/100k search performance acceptance or production deployment included. These notes are docs-only post-release evidence, not a new GHCR image source.

---

## 0.47.4 — #88/#90 Release candidate (2026-10-31)

- Persisted Memo M6 URL/share/validated WCS focus and M7 G7 Site-scoped global DB search (see the earlier Unreleased section for details).
- Preserve published `v0.47.3` pair from PR #175. Advance `src/package.json` and `src/package-lock.json` to `0.47.4`; release eligibility requires new exact-head PR CI and post-merge Main GHCR evidence. **Not published by this candidate commit.**

---

## Unreleased — #88/#90 Memo URL + cross-drawing Search (2026-10-31)

- M6 #88: authenticated Version/SHA-pinned persisted Memo deep link, WCS camera focus and Tree highlight, hidden temporary display, Clipboard/direct-link fallback, bad UUID/renderer/Anchor fail-closed; reused existing Viewer grouped menu.
- M7 #90: Current-only-by-default dedicated CAD home Memo search, optional historical Version, location/group/author/status/due filter, Site/role/revocation-limited parameterized SQLite search endpoint, safe snippet and result → M6 focus link. No CAD raw Source fetch or new DB migration.
- Regression tests and design/operations notes added. **PR CI/Chrome/Typecheck/Build NOT RUN at this writing**, GHCR/Merge/Issue closure not performed; see [Issues88-90](Issues88-90.md) and [TestReport](TestReport.md).

---

## 0.47.3 — PR #175 merged Owner Managed, GHCR release pending (2026-10-31)

- [PR #175](https://github.com/planner77/layoutManager/pull/175) #85 M4 Memo Tree + #86 M5 optional schedule/completion merged from successful [PR CI #341](https://github.com/planner77/layoutManager/actions/runs/41142161238) (two successful jobs, exact head a6d3bdef). The earlier TS18047 and WebGL PNG exact-match regressions are repaired and documented in FailureLedger.
- Main Squash `c3e55a95ed2c7a61413e5b0577004252994fe988`; both implementation issues closed Owner Managed with deferred memo-parent hierarchy, existing-volume migration and site acceptance explicitly excluded.
- [Main CI #41145893248](https://github.com/planner77/layoutManager/actions/runs/41145893248) initiated expected App/Migrator v0.47.3 paired GHCR publication. Images/digests and CI success NOT YET VERIFIED; a later docs-only Main push does not change the runtime release SHA.

---

## 0.47.3 PR #175 — E2E WebGL layer restoration regression correction (2026-10-31)

- 2차 PR CI #41139632431: Docker/TypeScript/Lint/Unit/Next Build success, Playwright 101 passed / 2 failed due byte-exact Canvas PNG comparison after layer/fullscreen restoration. Added test-only normalized source-stroke similarity helper, retaining CSS fullscreen/Layer selection/Canvas identity/source request invariants. Related AGENTS, Decisions, TestPlan/TestReport and FailureLedger updated. New HEAD CI not yet verified; Main merge/GHCR/Issue close not done.

---

## 0.47.3 PR #175 corrective changes (2026-10-31)

- Correct strict TypeScript TS18047 x5 from first PR CI #41137913177 (and dependent Docker Next baseline failure); shared desktop movable Memo Tree with pointer/keyboard/reset and modal fallback (#138 P1).
- Fix local group assignment/deletion synchronization with MemoSession and search completion filtering (Codex P2 x2). Preserve old v0.47.2 one-row Anchor baseline for read-only runtime compatibility while maintaining exact schema checks.
- Three review threads replied/resolved; Unit/E2E/Greenfield compatibility tests and failure ledger updated. New PR CI will run on final HEAD; no GHCR or issue closure.

---

## v0.47.2 정식 GHCR Release 발행 확인 (2026-10-31)

- [#173](https://github.com/planner77/layoutManager/pull/173) Issue #84 Memo M3 자동 Session Snap·서버 영속 Attachment, #167 SOURCE_ONLY/ALL Origin Reset 코어 구현. [PR CI #332](https://github.com/planner77/layoutManager/actions/runs/41127321736) SUCCESS 및 [Main `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`](https://github.com/planner77/layoutManager/commit/59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7) Squash 완료.
- `v0.47.2` 태그 및 App `ghcr.io/planner77/layoutmanager:0.47.2`/`:latest` `sha256:45d6df2cdb2100d2cf6b20264f0a39bc407938902b1490492c4c5a29036a5c06`, Migrator `:0.47.2-migrate`/`:latest-migrate` `sha256:77841b57e0e44b80b914beacedb02e4ce81bef2d0acb4524c545a19d6e47d6ad` 동시 후보 검증·정식 pair promotion SUCCESS. [Main CI #95](https://github.com/planner77/layoutManager/actions/runs/41131717206) 최종 SUCCESS, [docs-only Main CI #96](https://github.com/planner77/layoutManager/actions/runs/41132397577) SUCCESS/GHCR SKIPPED.
- Issue #84/#167 코어 코드/합성 CI 종료, 잔여 UI/성능 #174, 정책 #172, Site/Auth/DXF/2PC #96/#113, Epic #160 S7 OPEN. 기존 운영 DB/Volume 이관 또는 실 CAD 현장 수용 미진행.

---

## 0.47.2 — PR #173 M3/S6 (2026-10-31)

- [PR #173](https://github.com/planner77/layoutManager/pull/173)에서 #84 Memo WCS 자동 Endpoint/Vertex/Center 12px 스냅, 임시 GENERATED/RENDER 세션 변환·Undo/Redo/삭제 복원, 영속 CadMemoAnchor 생성·권한·CAS·감사, 삭제된 Memo의 dangling Anchor 회귀 보완을 구현.
- #167 Source-only·ALL 초기화 메뉴/명시 확인 및 현재 Version 정확 ID·Revision 검증·단일 거래 soft delete+Audit, 원본 DXF/READY Scene/Current 불변. 신규 Greenfield `G7-GREENFIELD-ANCHOR-20261031-1` 별도 초기 스키마. 패키지·lock `0.47.2`.
- [PR CI #332](https://github.com/planner77/layoutManager/actions/runs/41127321736) 성공·Squash [`59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`](https://github.com/planner77/layoutManager/commit/59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7). [Main CI #95](https://github.com/planner77/layoutManager/actions/runs/41131717206) release-scope Job `124324008108` SUCCESS, GHCR Build/push Job `124324087630` **in_progress/PENDING**. 릴리스 태그 `v0.47.2`는 merge commit `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`에 생성 확인. App/Migrator 실제 pair 게시 성공/OCI Digest는 이 문서 기록 당시 **NOT VERIFIED**, 이후 실제 CI/Registry 로그 확인 전 SUCCESS라고 주장하지 않는다.
- 잔여 #174 UI·성능, #172 Memo 작성자 정책, #96/#113 현장, #160 S7 별도. 기존 DB 이관 및 실제 운영 배포 미실시.

---

## v0.47.2 PR #173 M3 추가 보완 (2026-10-31)

- #84 임시 GENERATED / DXF_IMPORTED WCS 후보 ENDPOINT·VERTEX·CENTER 12px 자동 스냅을 구현하고, 브라우저 세션의 Target local anchor와 생성·렌더 Transform/Undo/Redo를 연결. Delete→BROKEN_ANCHOR(last WCS)·동일 ID Undo→복귀, SOURCE_ONLY 강제 해제, 명시적 WCS 확정, 임시 관계 저장/공유 불가 안내.
- #84/#167 Codex P1 수정: 개별 Memo DELETE 및 전체 초기화 시 dependent Anchor cleanup을 동일 SQLite transaction 내에서 실행해 이후 Outline/CAD 작업 불필요한 충돌 차단.
- 신규 Unit/Chromium E2E 작성; 실제 최신 HEAD CI 성공은 실행 결과 확인 전 보장하지 않음. 운영 DB/Volume Migration, 서버에 저장되지 않은 SceneWork 영속 전환, Field Approval은 제외.

---

## v0.47.2 구현 후보 — Issue #84 M3 / #167 S6 (2026-10-31)

- 업무 메모 FREE/ATTACHED/BROKEN_ANCHOR, 서버 영속 APP_CREATED UUID 및 인증된 SOURCE Ref 연결; Outline move/rotate/delete 시 종속 Memo world WCS/revision/audit 동기화.
- DXF_IMPORTED 기준 SceneWork만 복구하는 SOURCE_ONLY와 명시 확인 후 Current Version의 APP_CREATED/Memo를 한 서버 거래에서 soft delete 하는 ALL 초기화. 임시/영속 객체의 범위 분리, 원본 Scene/DXF/Current 불변.
- 별도 CadMemoAnchor 스키마 + 새 빈 Greenfield marker, 이전 business baseline 보존, 0.47.2 package/lock. 실제 CI/GHCR/현장 acceptance는 미확인. #172 타 작성자 Memo 편집 정책 미변경.

---

## v0.47.1 공식 GHCR 발행 — Issue #98/#83 (2026-10-30)

- 최종 PR #171 CI #316 SUCCESS, Squash Main [e1984e26](https://github.com/planner77/layoutManager/commit/e1984e26a8649f0ac2bce3b0cb74ce69b163441e); [Main CI #93](https://github.com/planner77/layoutManager/actions/runs/41064962451) SUCCESS.
- 신규 `v0.47.1` 및 `ghcr.io/planner77/layoutmanager:0.47.1`+`:0.47.1-migrate`·latest pair 게시 성공. 정확 SHA-256은 [FailureLedger](FailureLedger.md)에서 확인. 기존 `v0.47.0` 유지.
- Issue #98/#83 코어 구현 종료, #172·#65/#71/#73·#84·#96/#109/#113 후속 수용 별도. 현장 설치·기존 볼륨 이전·복구·Auth 활성화 미실행.

---

## 0.47.1 — #98/#83 CadOutline·CadMemo 별도 업무 영속 Release 후보 (2026-10-30)

- 기존 0.47.0 GHCR App/Migrator 정식 쌍을 덮어쓰지 않도록 `src/package.json`과 lockfile을 함께 0.47.1로 승격.
- 신규 빈 Greenfield에 CadOutline, CadMemo 및 불변 감사 테이블. 사이트/세션 검증, WCS 좌표, SOURCE SHA/Handle 확인, Revision CAS, 논리 삭제, 별도 영속 Overlay 및 메모 재접속 복원.
- PR #171 Codex P1/P2 세 건 보완, #311 strict TypeScript·#314 Vitest server-only import 실패 회귀를 보완하고 #315 두 Job 성공 확인. 버전 bump 이후 최신 CI 성공/병합/Main CI/GHCR 게시 사실은 각각 실제 관측하기 전 미확인.
- #65, #84, Editor 공동 편집 및 실 현장 이전/수용은 별도이며 운영 데이터/볼륨/DRM/S3 무단 변경 없음.

---

## #98/#83 업무 외곽선·메모 별도 영속 PR 후보 (2026-10-30)

- 신규 빈 Greenfield DDL에 CadOutline/CadMemo/CadBusinessAudit, 불변·append-only SQLite trigger와 Prisma 모델 추가. 기존 Scene·구 baseline fingerprint·서버 G7 인증 정책 유지.
- G7 ACTIVE Version-Site 읽기/쓰기, Memo 작성자-only 수정/삭제, Outline Site Editor 협업, Revision CAS/Soft Delete/감사. APP_CREATED 독립 WCS 기하와 서버 소유 SOURCE SHA/Handle canonical 검증을 분리.
- Memo Viewer: ACTIVE 재접속 서버 복원과 분리된 text/move 작업; OFF 기존 임시 M1 동작. Outline Viewer: 명시적 서버 저장, 개별 WCS Overlay, 이름/위치/회전/논리 삭제와 세션 Show/Hide.
- 타입 #65, 연결 Memo #84, 기존 볼륨 전환, QA/CI 결과 확인, 병합/GHCR/배포/이슈 종료는 별도.

---

## 0.47.0 후보 — #166 Scene S5 일반 객체 작업

- 원본 Handle 매핑과 독립적인 Three.js Stable ObjectRef 선택, 지원 WCS 2D 렌더 기하의 임시 APP_CREATED 외곽선 생성 및 기존 목록·편집·메모 소비 경로를 연결한다.
- DXF_IMPORTED 이동·회전·표시 차분과 전용 Undo/Redo를 immutable 기준 Scene·원본 DXF에서 분리한다. 혼합 Origin 변경은 전체 거절한다. 정밀 원본 SHA/Handle/canonical 검증은 명시 모드에서 유지한다.
- 렌더 기반 외곽선 provenance는 선택적이며 strict 원본 JSON 계약과 구분한다. 새로운 DB/서버 업무 API·운영 migration·배포는 없다. 실제 검증과 미실행 범위는 TestReport, 누적 실패는 FailureLedger를 따른다. PR CI 결과 확인 전 릴리스/수용 완료를 주장하지 않는다.

---

## 0.46.0 후보 — #164/#165 Scene Asset 영속화·Scene-first Viewer

- #168 Scene domain/custom DTO를 재사용하고, typed array·geometry·Origin/ID·Version/source SHA·문자 검색 sidecar를 서버/브라우저에서 검증한다. Local/S3 immutable bytes와 SQLite SceneAsset/CurrentScene CAS·Audit, 실패 후보 추적을 추가한다.
- 신규 Greenfield exact baseline과 별도 격리 SQL 후보를 추가한다. 기존 7-migration 경로 및 기존 exact baseline은 유지하며 실제 운영 DB에 적용하지 않는다.
- READY 재진입은 저장 Scene을 복원하고 원본 GET/converter/outline parser를 시작하지 않는다. 명시 변환·저장은 기존 도면 메뉴에 연결하고 missing/corrupt/incompatible 및 기존 레거시 경로를 구분한다.
- 기존 G7 권한·Site·CSRF·Audit를 재사용한다. APP_CREATED/#98/#83 독립 영속 API, S6 reset, 현장/운영 수용은 포함하지 않는다. 실제 실행 결과·실패 이력은 [TestReport](TestReport.md)/[FailureLedger](FailureLedger.md)를 기준으로 하며 CI 성공 관측 전 AC 완료 처리하지 않는다.

---

## 0.45.0 후보 — PR #168 Codex P2 Custom DTO 복원 보완

- `scene-custom-dto.ts`에서 정규화된 정수형 BufferAttribute의 원시 저장 타입과 normalized flag를 보존하고 타입·범위·오버플로·지원되지 않는 특수 Attribute를 명시 거부하도록 변경했다. 미기재 type의 구 PoC Custom DTO는 잘못된 결과를 만들지 않고 거부한다.
- `SC-08` Vitest 정상/음성 회귀와 TestPlan/TestReport/Decisions/FailureLedger를 갱신했다. 이전 PR CI 성공과 수정 HEAD CI 미검증 상태를 구분한다. 운영 API/DB·CAD·GHCR/배포는 변경하지 않는다.

---

## 0.45.0 후보 — #161–#163 CAD Scene S0/S1/S2

- 순수 SceneAsset/SceneObject/AppObject·manifest 계약과 검증기를 추가하고 Version/source SHA·schema/builder/renderer/frame·불변 생성 Origin/ID를 구분했다. 실제 adapter 렌더 트리와 GeneratedDocument에 연결하며 기존 SOURCE/GENERATED·Undo/Redo·메모/JSON 동작을 유지한다.
- 실제 `three-dxf-viewer@1.0.44` 합성 DXF에서 Three JSON·GLB·전용 DTO bytes를 생성하고 새 Browser 컨텍스트에서 복원하는 기본 Playwright 실험을 추가했다. 손상·scope·metadata·format·외부 자원·overlay 혼입 검증과 포맷별 충실도/크기/시간을 기록한다.
- 신규 DB/API·Scene 저장/cutover·S5 선택/편집 활성화·원본 변경·배포는 포함하지 않는다. 실제 시험과 실패/수정 이력은 [TestReport](TestReport.md), [FailureLedger](FailureLedger.md)를 기준으로 한다. 현재 PR 후보이며 CI/GHCR/현장 수용 완료 기록이 아니다.

---

## 0.44.2 후보 — #109 표준 Compose 신규 설치 및 최초 관리자 웹 설정

- 일반 Compose의 빈 볼륨에 최종 Schema를 생성하고 호스트 일회용 코드로 웹 최초 Admin 설정; 기존 권한·세션·감사를 유지하는 신규 설치 후보. 기존 DB 자동 삭제/이관은 하지 않는다.
- PR #159의 2차 CI 실패(`40946304142`): 익명 CRUD smoke를 기대하던 테스트를 현행 인증 Greenfield 설치/CAD/재시작 계약에 맞췄다. Native SQLite·레이어 감사 검증은 보존했다.
- 독립 로컬 QA에서 발견한 최초 Setup E2E의 전역 alert 모호성을 설정 폼 범위로 제한해 검증한다. API·보안 정책은 변경하지 않는다.
- 설치·개발 문서의 순서를 사업장 생성 → 본인 명시 Site Grant → 동·층 생성으로 정정했다. 상세 실제 검증은 [TestReport](TestReport.md), 누적 실패는 [FailureLedger](FailureLedger.md) 참조. PR 후보 유지; GHCR 게시·병합·현장 수용 완료 기록이 아니다.

---

## 0.44.1 후보 — #153 Greenfield 신규 설치

- 빈 독립 DB/새 CAD 볼륨에 최종 Schema와 G7 Auth/Role/Site/Audit 기능 구축, 예전 DB 데이터·HOLD·Migration 사용 안 함.
- 단발 Site seed/Owner 신규 서명/초기 Admin, 별도 보관 DXF를 수동 업로드.
- PR 후보 상태; CI·GHCR·현장 설치 완료 주장이 아님.

# ChangeLog

## 0.44.0 후보 — Issue #153 G7 운영 통합

기존 Auth/Session/Role/Site/Audit를 실제 Runtime API·관리 UI·CAD 거래에 연결하고 별도 서명 Runtime Gate와 격리 Migration/Restore 실행 경로를 추가한다. 실제 운영 활성화·정식 이미지/태그·병합·배포는 이번 작업에서 수행하지 않는다. 검증 결과는 TestReport의 #153 절을 따른다.

- PR #156 P2 보완: Site 비활성화의 영향을 해당 Site CAD 쓰기로 한정하고 다른 Site·로그인·Admin 재활성화 경로를 유지한다. Migration/Restore 강제 종료 후 실행 잠금과 HOLD를 통한 명시 복구 회귀를 추가한다. 미릴리스 0.44.0 후보 내 보완이며 실제 결과는 TestReport의 PR #156 절을 따른다.

## v0.43.0 후보 — Issue #82 세션 WCS 메모 및 Renderer UX (2026-10-28)

- MINOR 신규 기능. `three-dxf-viewer`에 session-local MemoDraft WCS XY 앵커·핀·레이블, 위치 drag/좌표 명시 확정·텍스트만 저장/ESC rollback·Version/SHA 격리, Source/Generated Tool 상호배타와 비지원 Renderer fail-closed 적용. #127 `작업 > 메모 추가/편집`과 하단 Drawer 재사용. 메모 영속, 사용자인증 및 공유는 #83 등 후속 비범위.
- `v0.42.1`은 기존 릴리스 태그이므로 앱/lock root를 `0.43.0`으로 정렬. 기존 App/Migrator Tag/Digest 이동 금지. Main CI를 통한 새로운 Pair digest·릴리스 게이트 및 실제 게시 결과 검증 필요.
- 버전 정렬 전 [PR #111 CI 40580691233](https://github.com/planner77/layoutManager/actions/runs/40580691233) Verify/Chromium/Legacy/Docker SUCCESS. 정렬된 **최종 HEAD PR CI는 미실행/미검증**, 그 결과와 최신 리뷰·Main 충돌 확인 전 병합 금지. 현장 CAD/GPU/운영 DB·Prisma/G7 Auth/Writer/Owner GO OFF.

## v0.42.1 후보 — Issue #57 공통 Logger·UploadDiagnostics 단일화 (2026-10-27)

- 기존 #18 구조화 Logger 재사용 및 업로드 별도 console JSON emitter 제거. Versioned Schema v1, 안전한 필드 allowlist/정적 Error code·category 재정제, `LOG_LEVEL`/`LOG_FORMAT` 단일 필터 적용. 공개 진단/첫 실패/요청 ID 계약 유지, 반복 성공 Health 200 debug-only.
- 일부 수동 CLI의 원시 Error 메시지 출력 제거; 단위 회귀 테스트 및 운영/개발 가이드 동기화. 최초 PR CI의 Migrator Logger→Catalog 누락에 따른 Docker smoke 실패를 COPY closure/Node import 사전검사/TC-LOG-MIG-001로 보완했으며 수정 HEAD CI 결과는 미검증. 기존 API 응답/DB Migration·Viewer·G7 Auth 활성화 및 로그 보관/조회 API/UI는 변경/추가 없음.
- 소스·PR CI 후보이며 CI PASS, GHCR 이미지 게시, 병합 또는 사내 운영 적용 완료가 아니다. [Issue57](Issue57.md), [TestReport](TestReport.md) 참고.


## v0.42.0 — #124/#126/#127 목록 고정·DXF 복구·Viewer 메뉴/Drawer (2026-10-27)

- 홈에만 앱 내비게이션·제목/작업·검색/Current·요약을 sticky로 적용하고 desktop 밀도·mobile 추가 필터와 동적 anchor/focus offset을 조정. 기존 #93 검색/URL/Current 의미 보존.
- DXF 기본 renderer를 three-dxf-viewer로 정렬, 유효한 explicit dxf 및 DWG LibreDWG 유지. 실제 renderer init/load 오류만 자동 dxf 대체 최대 1회, source/취소 오류 구분, 지역 loading UI에서 수동 탈출·동일 bytes 재사용·임시 작업 손실 확인.
- Viewer 두 정보 헤더·접근 가능한 설명, 도면/보기/작업 그룹 명령, Canvas와 독립적인 좌/우/하단 Drawer. 원본/Generated/Undo/레이어 상태와 수명주기 경계 보존.
- Release: PR #132 Squash main `f2c04bf`·v0.42.0, 최신 PR CI 40352404675/전체 Unit352·E2E86·legacy1/Docker 및 Main CI 40354233607 PASS. GHCR 앱·migrator 0.42.0 pair 게시·registry inspect, #124/#126/#127 completed 종료. DWG 고정 진단/실험 probe 보완, 독립 DWG4·focused13 및 실제 브라우저 200% 확대 검증을 포함한다. 상세 수치/digest·초기 실패는 TestReport U-ISSUES124-126-127-20261027/FailureLedger, 설계는 [단위 가이드](Issues124-126-127.md)·ADR-053을 따른다. #113 현장 수용과 운영 배포는 별도.


## Unreleased — Issue #108 G6 증거 매트릭스·합성 복원 검증 준비 (2026-10-26)

- Offline src/scripts/g6-evidence.mjs와 전체 NOT_RUN 예제, Unit TC-P4-G6-001~006 추가. 합성 SQLite(운영 CAD 기존 6개 schema migration)+local CAD/mock-S3 두 버전으로 backup→별도 G1 fixture migration dry-run→손상 주입→실복원 Integration TC-P4-G6-007 작성. 현장 Runbook/AC·TC/ADR/설계·시험 문서를 Issue108에 동기화.
- 새 HEAD 자동 Test/PR CI 완료는 아직 확인 전 NOT VERIFIED. 사내 Windows/WSL2 Nginx·PC 2대 실 E2E·실 S3/DB/CAD Backup/Restore, Owner G6 수용과 별도 #109 G7 Go/No-Go는 **NOT RUN/PENDING**. 운영 Auth/API/Prisma/DDL/Compose/Nginx/.env/실 DB/CAD/S3/GHCR 변경 0, 기존 익명 CAD GET 유지. [Issue108](Issue108.md).


## v0.41.1 후보 — Issue #106 G4 격리 Auth Grant/Audit Pair 이미지 (2026-10-26)

- G4 코드/테스트는 [PR #120](https://github.com/planner77/layoutManager/pull/120) 최종 HEAD `d4afaf0ae3cee51a172dad9305533d941daa5706`의 [PR CI 40253887969](https://github.com/planner77/layoutManager/actions/runs/40253887969) Verify·Docker 2개 Job `completed/success`, P1 2건 답변·Resolved 및 behind=0 후 squash 병합됐다. [Main CI 40254890094](https://github.com/planner77/layoutManager/actions/runs/40254890094) **시작 확인**; GHCR 실제 게시 완료와 구분한다.
- 기존 `v0.41.0`와 `0.41.0`/`0.41.0-migrate` GHCR Pair는 이미 게시된 불변 릴리스다. 본 후속 릴리스 PR은 신규 `0.41.1` 버전을 `src/package.json`·lock root에 맞춘다. 새 PR CI 성공 및 승인 후 Main에서 App/Migrator candidate digest 검증·paired version/latest 승격이 수행되어야 실제 게시로 판정한다. 새 CI 시작 전후 이미지 게시 성공을 선행 주장하지 않는다.
- 격리 Auth G4 외 운영 기능 활성화 0. 기존 익명 CAD GET/Viewer/파일·Current/Version/삭제 암호/실 DB·S3 불변, G7 #109 별도 Owner 승인 전 OFF. [Issue106](Issue106.md), [FailureLedger](FailureLedger.md).


## 2026-10-26 — #106 G4 격리 Role/Site/Version·Grant·Audit

G1~G3 기반 G4 비라우팅 서버 인가, Admin Grant/disable, 안전 append-only Audit, 테스트용 ShadowOutline CAS 및 TC-P4-G4-001~009 추가. 기존 익명 CAD GET/Viewer, 운영 Prisma/API·Compose/Nginx/원본·Version/Current·삭제 암호 및 GHCR 불변. 자동 시험 PASS/배포가 아니며 실제 운영 활성화 #109 G7 전 OFF. [Issue106](Issue106.md).


## 0.41.0 — Issue #105 G3 격리 세션 (후보, 2026-10-26)

- 비운영 로그인/초기 및 일반 암호 변경/logout, DB-backed 32 byte/hash-only 세션·8h/30m/최대 3개 원자 발급/회수, 현재 DB Actor와 정상 cookie/Origin/CSRF 검증을 추가했다. 상세 [Issue105](Issue105.md), 실제 구현·시험 상태는 TestReport를 기준으로 한다.
- 기존 G1/G2 fixture 계약을 재사용하며 운영 Auth Route/UI·Prisma/migrations/Compose/Nginx/DB·CAD 원본/Current/삭제 비밀번호 변경·활성화 없음. 기존 CAD GET는 익명 유지한다.
- 내부 기능 추가 MINOR 후보로 package/lock/README 버전을 정렬한다. PR CI 시작은 성공/병합/게시가 아니며 이번 요청에서 GHCR 게시·배포를 수행하지 않는다.

## v0.40.5 후보 — #104 G2 격리 Admin 최초 생성·복구 (2026-10-26)

- 이전 G2 코드 HEAD `f5f7ea2e`의 [PR CI 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320) Verify·Docker Job 모두 **completed/success**. 이 성공은 아래 버전 정렬 전 HEAD의 증거일 뿐 새 HEAD의 PR CI 통과가 아니다.
- GHCR App/Migrator Pair는 기존 `v0.40.4` tag·digest를 재사용하지 않는다. 신규 `src/package.json`과 lockfile 루트 버전을 **0.40.5**로 정렬하여 새 Pair를 정식 Main CI가 게시하도록 준비한다. 격리 G2 서비스는 운영 Route에 연결하지 않았으므로 PATCH 릴리스 후보로 간주하고 **실 운영 인증/Admin/Prisma 활성화는 G7 #109 승인 전 OFF**.
- 새 HEAD PR CI Verify·Docker 성공/리뷰 0/main 무충돌 후 squash merge→Main CI의 `release-scope`와 candidate digest·Pair 승격이 시작된다. GHCR 배포/실제 게시 성공은 Main CI 시작만으로 보장되지 않는다. 승인된 현장 G6·G7 이후 운영 활성화 별도.

#103 G1 일회용 SQLite 계약을 활용한 명시 최초 Admin 단발 생성·복구/nonce·Session revoke, Linux Secret 권한 검증, 9개 Integration TC와 지정 운영 담당자용 비공개 SOP 템플릿 추가. **운영 API/Prisma/Compose의 인증 기능 활성화 없음.** 신규 GHCR v0.40.5 후보 package/lock 변경 외 운영 설정은 불변. 실제 GHCR 공개 게시 여부는 Main CI 결과 확인 전까지 NOT VERIFIED. [Issue104](Issue104.md).


## v0.40.4 — Issue #107 G5 경량 Preview 및 Viewer 정합성 (2026-10-26)

- PROD Nginx→App/DEV App 직결 **비운영** Preview, 독립 SQLite/CAD·네트워크, 정상 Health/CAD 목록·Viewer/content Read-Only Smoke 및 Unit·CI Compose config-only 검증 추가. 추가 침입·탈취 방어는 Owner 정책상 비범위.
- PR #115 구 HEAD d771d553 CI 40201366001 Verify/Docker 성공 이후 Codex P2 리뷰 4371142398에 따라 관리 화면을 Viewer로 오인할 수 있는 검증을 실제 /cad/versions/ID/viewer 요청으로 교정하고 Unit TC-P4-G5-007 추가.
- 기존 v0.40.3 GHCR pair를 재사용하지 않고 src/package.json/lock root 0.40.4로 정렬. 수정 HEAD PR CI [40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075), Main CI/GHCR App·Migrator Pair 게시 [40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) 모두 성공, 태그 v0.40.4 확인. 실제 LAN 기능 E2E는 #108에서 NOT RUN.
- 기존 운영 Nginx/Compose/Auth/API/Prisma/DB/CAD/S3/원본 SHA·Current 불변. G6 현장 수용과 G7 별도 Owner 운영 승인 유지.


### #82 PR #111 — #99 Main 코드·정책 통합, ADR-053 재번호화 (2026-10-25)

- #99 실 DXF Private evidence gate/CLI, symlink path 보호, 테스트와 npm `verify:outline-acceptance` script를 최신 main에서 모두 유지. #99 실DXF ADR-052는 불변, #82 WCS Memo ADR은 중복 방지 위해 ADR-053으로 이동. 0.41.0(app/lock root)과 현 0.40.3 main 패치 이력을 구분하며 재게시·태그 이동·GHCR 승격 없음.
- 새 통합 HEAD CI에서 U1 shared Memo Dock 정정과 #99 Unit/Build/E2E 회귀를 다시 검증해야 한다. CI 시작은 PASS와 다름.


### Issue #82 / PR #111 — 2차 CI 77/78 E2E 회귀 U1/M1 계약 수정 (2026-10-25)

- 최초 lint 실패 교정 뒤 PR CI [40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153)에서 Typecheck/Lint/Unit/Benchmark/Build/Docker PASS, Chromium E2E 77 PASS/1 FAIL (U1 기존 dock 부재 assertion). Legacy SKIPPED.
- Memo M1 FREE WCS가 Source stable Handle 없이도 지원되는 현행 설계를 유지하며, U1 test assertion을 Memo status Dock과 Source/Outline 도구 미노출 개별 검사로 전환. dxf-viewer·DWG에서는 Memo disabled 검증, 무Handle DXF의 WCS 메모 생성 신규 TC-M1-E2E-006 추가. 원본 U1 기능/스크롤·ESC·레이어 테스트 유지.
- 제품 코드·앱 버전 0.41.0·API/DB/Prisma/Auth/원본 SHA/Current/GeneratedDocument/배포 정책 불변. 새 HEAD CI 미확인; 기존 실패 원장 보존.


### Issue #82 / PR #111 — 최초 CI ESLint 차단 및 편집 리뷰 보완 (2026-10-25)

- 기존 `1515eca` [Run 40196496297](https://github.com/planner77/layoutManager/actions/runs/40196496297) Verify Typecheck PASS/ESLint 2 errors FAIL, 나머지 Verify SKIPPED, Docker Job PASS. React ref/render 규칙 위반, E2E let→const, 불필요 lint suppression 제거.
- [P1 4370961641](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961641) 기존 memo pin/list 접근 도구 독점, [P2 4370961642](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961642) Drag click이 편집 폼 미저장 텍스트를 덮어쓰는 결함 수정. `TC-M1-E2E-004/005` 추가, 실패 원장 누적. 최신 CI 결과 전 NOT VERIFIED, 버전 0.41.0 및 기존 Source/DB/Auth/Current 불변.


## v0.41.0 — Issue #82 CAD 메모 M1 WCS 세션 Overlay (2026-10-25 / PR CI 검증 전)

- `MemoSession` 도메인(Version UUIDv4+SHA64/UUIDv4 local, NFC 제목·본문 유효성, WCS finite ±1e12, 100건 상한), `CadMemoOverlay` WCS 고정 pin+plain-text label, 클릭 자유 배치/위치 드래그 Ghost 취소·확정, 수치 이동과 텍스트만 별도 수정/삭제.
- `ViewerManager/ThreeDxfViewerAdapter` CSS px↔WCS Orthographic 변환과 카메라/Resize 갱신; M1 메뉴/툴을 Viewer shell에 연결하고 #40 Outline 생성/Generated 선택·Source hit-test와 분리. 메모는 Reload/Version/Renderer 전환에서 소멸하고 Auth/영속 저장이 없음을 명시.
- Unit 6/E2E 3 및 opt-in Benchmark 2(1k/10k synthetic DXF) 작성, [Issue82](Issue82.md)/ADR-053·Requirements/Architecture/TestPlan/TestReport/README/AGENTS 동기화. Native/실 CAD/GPU/100 Memo 성능 미실측. Typecheck/Lint/Unit/E2E/Build/Docker/PR CI 결과 **NOT RUN/NOT VERIFIED**(실제 완료 뒤 판단).
- `src/package.json`/`src/package-lock.json` root 0.41.0 정렬. DB/API/Prisma/Auth/Docker/Version·SHA/Current/원본·Generated edit·#2 설명 기능 불변, 영속 #83 별도 차단.


## Unreleased — Issue #99 PR #110 P1 보안 리뷰 보완 / GHCR v0.40.3 후보 (2026-10-25)

- 원 HEAD `6377426` [PR CI 40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561) Verify/Docker 모두 SUCCESS. 이후 P1 리뷰에서 실제 repo 외부 경로가 Symlink를 통해 repo 내부를 가리킬 수 있는 개인 정보/도면 SHA 기록 위험 지적.
- `private-acceptance-paths.ts`의 canonical 실제 경로 비교, 기존 별도 사내 출력 디렉터리 필수, 기존 Report/symlink 덮어쓰기 금지 및 `wx/0600`·쓰기 직전 부모 재검사로 보완. TC-P0P5-PATH-001~006 Unit 추가, Private E2E 연계. 2차 Run은 원본 성능/정확도 현장 수용과 분리.
- 기존 `v0.40.2` tag와 immutable 이미지를 재사용하지 않도록 신규 paired GHCR 발행 **준비 버전 `0.40.3`**으로 package/lock 정렬. 최신 HEAD CI, Main CI/GHCR 게시 및 현장 수용 여부는 별도 증거 확보 전 NOT VERIFIED. 영속 운영 Auth/API/Prisma/Viewer/원본 DXF/Current 기능 OFF 유지.


## Unreleased — Issue #99 실 DXF P0/P5 Evidence Readiness (2026-10-25)

- 승인 real DXF 3종/1k·10k·100k, Source audit SHA + Browser report Schema v2/5회, CAD WCS·면적 및 Source↔Render·BLOCK/OCS·지원 Matrix, 외부 GPU telemetry와 8개 조작/Owner SLA를 **비공개** manifest로 검증하는 fail-closed pure gate/CLI + TC-P0P5-001~008 Unit 작성.
- `test:outline-acceptance`는 승인 SHA·Repo 외부 report path 필수. 로컬 Three Browser의 box interaction 시간·rAF frame p95·WebGL identity를 계측하나 GPU 이용률/VRAM은 외부 장비 검사. 기존 `audit:outline` source-only와 공개 synthetic benchmark 분리 유지.
- Owner 현장 샘플/SLA/실측/서명 **NOT RUN/BLOCKED**, `READY_FOR_OWNER_REVIEW`는 합격 아님. 기존 CAD 원본/SHA/Current/Version, DB/API/Prisma/Viewer Adapter/GHCR/Docker/인증 런타임 불변, 앱 버전 0.40.2 유지. [Issue99](Issue99.md), ADR-052, TestPlan/TestReport.


## Unreleased — Issue #96 비활성 인증·Scope·세션·감사 도메인 (2026-10-25)

- D1~D6 Owner 세부 정책/ADR-051 반영. UserAccess/Version↔Site deny-first 권한, .env 단발 Admin 계획, local scrypt password, 8h/30m/3개 session, 세션 귀속 CSRF/로그인 시도 제한, Audit allowlist/365일 cutoff, Unit TC-P4-D1-003~012 코드 추가.
- 인증/영속 API·DB/Prisma/Migration·Docker/Compose·Viewer/원본/Current·GHCR **변경 없음**. 사용자 기능이 아직 비활성이므로 package 0.40.2 유지. 실제 Typecheck/Unit/PR CI/사내 LAN·복구 검증 성공 여부는 증거 확보 전 NOT VERIFIED.



## v0.40.2 — Issue #97 / P4-D2 DXF 서버 Canonical·강체 이동/회전 오프라인 검증기 (2026-10-25)

- 새 `server/outline/transform-attestation.ts`: 기존 v1/v2 canonical JSON과 편집 D2 확장(baseGeometry/ordered Translate·Rotate/pivot/최종 geometry/선택적 affine claim)을 **독립적으로** 검증. 불변 DXF bytes SHA/Version/INSUNITS·Stable Root Handle·0.02 tolerance·CONVEX/PRECISE Polygon/Multi/Hole은 서버 재계산, scale/shear/reflect/Z/nonfinite/oversize/미지원 child instancePath·BLOCK/OCS fail-closed.
- 1e9 WCS 인근 작은 Polygon의 면적 상쇄를 줄이기 위해 서버 canonical attestation과 순수 Geometry 계산의 링 면적을 상대좌표 삼각형 방식으로 변경. Unit TC-P4-D2-001~009 추가. [ADR-050](Decisions.md), [Issue97](Issue97.md), TestPlan/TestReport.
- 신규 게시용 앱 버전 **0.40.2**로 정렬(이전 GHCR v0.40.1 앱·마이그레이터 Pair 이미 게시되어 동일 버전 태그 재사용 금지; 기존 서버 Route/DB/Prisma/Viewer 기능 활성화 없음). D1 #96·D3 #98 및 실DXF #99 현장 게이트 불변. 실제 CI/로컬 시험 결과 확인 전 **NOT RUN**, 이미지 게시/운영 적용 아님.

## v0.40.1 — Issue #93 도면 목록 Current 기본 유지·이전 Version 검색 복원 (2026-10-25)

- #45의 '홈 항상 Current-only/토글 없음' UX를 조정. 기본 조회는 **Current-only**, 검색 영역에 **현재 버전만 표시** 단일 버튼(기본 ON) 복원, OFF에서 이전/현재·Current 미지정 Location 도면까지 목록에 표시·검색. 기존 #16 Current 드롭다운 복원 없음.
- `versions=all`을 홈 전용 검색 모드로 도입하고 기존 `/?current=false`는 홈에서 전체로 정규화. `/api/cad-files?current=false`는 이전 버전만 조회하는 기존 API 계약 그대로 유지. 중복/모드 충돌 조회 거부. 토글/검색/페이지 링크/뒤로/새로고침에서 검색 조건과 `pageSize`·모드 지속, 기본 Current 초기화.
- 도메인 `drawingListParams/drawingListUrl`, UI `ListFilters` GET forms, Unit/Integration/Chromium E2E(검색·페이지네이션·Current 교체·API 분리) 보강. DB Schema/원본 bytes/SHA·Current 0~1/Renderer·인증·외부 API 변경 없음.
- 검증: 코드·시험 작성, 실 실행 **NOT RUN** (원격 Github Connector 및 로컬 checkout/DNS 제한); PR CI 성공 및 릴리스/게시 추정 금지. [Issue93](Issue93.md), [ADR-034-R1](Decisions.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).

## v0.40.0 — Issue #54 E4 GENERATED WCS 이동·그룹 이동 (2026-10-25)

- DXF three-dxf-viewer에 이미 선택된 확정 외곽선의 WCS 수치 입력(ΔX/ΔY) 및 경계 Drag Ghost Preview→pointerup 단일 Translate·Undo/Redo 추가. 다중 동일 Delta, Polygon/MultiPolygon/Hole, WCS bounds/hit/Tree/JSON 동기화. `$INSUNITS` 0/누락은 단위 미상 표시.
- SOURCE/혼합·숨김·중복·stale·NaN/Infinity/과도한 이동 fail-closed. ESC/Space Pan/2차 Touch/PointerCancel/LostCapture/Blur/Zoom/Fit/Resize/Renderer 전환에서는 Preview/Stage/GPU 해제. Area Selection/Source/Worker/기존 트리·삭제를 보존.
- 신규 TC-E4 Unit 4건/E2E 3건 작성, `out/Issue54.md` 및 Requirements/Architecture/ADR-047/TestPlan/TestReport/README/AGENTS 갱신. CI/실도면 검증 전 NOT RUN. 원본 DXF bytes/SHA/Layer/Current·Server API/Prisma/권한/DB/배포 계약 불변.

## v0.39.0 — Issue #53 E3 생성 개체 안전 삭제·다중 삭제 (2026-10-25)

- 생성 확정 Polygon/MultiPolygon/Hole의 단일·다중 삭제를 Toolbar·Tree 행·선택 Canvas 우클릭·Canvas 초점 Delete/Backspace로 제공. 명칭/개수 모달로 Confirm/Cancel, ESC/modal 취소 무변경, 원본·혼합 선택 거부 및 E2 Version/SHA/UUID·동일 선택 재검증 유지.
- U6 레거시 이력 없는 `deleteSavedOutline/discardLegacy` 제거: 모든 삭제가 E2 원자 `Delete(ids)`와 Undo/Redo로 통과. Deleted GPU group dispose, Tree/Canvas/JSON 동기화, selected stale ID 제거, 생성 ON/OFF 별도 모드 정책 유지. Source/Preview/DB/API·DXF bytes/SHA/Layer/Current 불변.
- Unit TC-E3-UNIT-001~005·Chromium E2E TC-E3-E2E-001~003 작성, #43/Manager 회귀 갱신. 실행기 checkout 실패로 로컬 타입 검사·Unit/Build/E2E/실 CAD/GPU **NOT RUN**. 새 PR CI/릴리스 성공과 혼동 금지. [Issue53](Issue53.md)/[TestPlan](TestPlan.md)/[TestReport](TestReport.md).


### v0.38.1 / PR #80 — 이미 최적화된 이미지에서 CI false failure 방지 (P1 리뷰, 2026-10-25)

- 최초 [PR CI 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369) 최초 HEAD `6a35660`의 Verify/Docker PASS. 후속 [P1 리뷰 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432)에서 모든 PR에 이전 중복/positive saving을 요구하면 정상 후속 PR도 막는 결함을 발견.
- Docker layer audit는 baseline에 duplicate가 있던 transition에서는 SHA/positive size saving 필수, 이미 없던 PR에서는 package SHA/native/no-dup을 계속 확인하고 delta는 참고로만 보고한다. Python 미래 PR regression fixture를 추가. 새 HEAD PR CI 성공 전 결과를 PASS로 재사용하지 않는다.


### v0.38.1 — Issue #67 웹 Standalone better-sqlite3 중복 COPY 계층 안전 제거·계측 (2026-10-25)

- Docker `runtime`에서 `.next/standalone` 이후 별도 `node_modules/better-sqlite3` COPY 제거, Prisma/native dynamic trace 유지. Native `.node` 유무와 `better-sqlite3` 메모리 DB 사용 가능 여부가 image build-time gate. Database schema/API/Viewer 및 #66 migrator/Compose/GHCR paired release 계약 불변.
- Python Docker 실제 `docker save` TAR layer package path/SHA-256 identity/중복 bytes + negative synthetic fixture, 비압축 `docker inspect .Size`, history/du, 원본 TTF·파생 한글 typeface·LibreDWG JS/WASM raw/gzip proxy 및 top20 server traced files. gzip TAR는 GHCR OCI 압축 층 크기가 아님.
- PR Docker CI disposable `/data` master 등록/DXF API 업로드→migrator 재실행/app 재시작→health/Current/content 조회/삭제 후 404. 기존 Typecheck/Lint/Unit/Build/Chromium E2E/Legacy migration/정적 자산 검사 유지. Package/lock 0.38.1 동기. **작업 시점 신규 image 절감·PR CI 성공·GHCR OCI compressed 수치 및 현장 수용은 미측정/NOT VERIFIED**. [Issue67](Issue67.md), [TestPlan](TestPlan.md).


### v0.38.0 / Issue #52 QA 보완 (2026-10-25)

- 테스트 helper의 공유 Polygon 참조가 deep-copy mutation으로 후속 fixture를 오염시키던 원인을 `structuredClone` 격리와 fresh fixture assertion으로 수정. 제품 validator/Ring closure 검증, 앱 버전 및 기능 동작은 변경하지 않음.
- 독립 로컬 gate Unit 202/202, Typecheck/Lint/Build, Chromium E2E 65/65, Legacy migration 1/1 PASS. PR CI 성공·로컬 Docker·실 CAD/GPU/배포를 주장하지 않음. 상세 [TestReport](TestReport.md) / [Issue52](Issue52.md).

### v0.38.0 / PR #79 Typecheck 차단·P2 무결성 보완 (2026-10-25)

- 첫 CI `40168296155`의 E2E 테스트 Event TS2339 2건을 input keyboard type 좁히기로 보완. 뒤 Verify 단계 SKIPPED, 별도 Docker SUCCESS 보존.
- 고 WCS 면적 계산, Undo 복원 용량 정책, staged command 최신 선택 검증 및 TC-E2-UNIT-006~008 추가. 새 CI/실도면 검증 전 성공 미주장.


## v0.38.0 — Issue #52 E2 생성 개체 Document/Undo·Redo 기반 (2026-10-25)

- `GeneratedDocument`를 Version·SHA 기반 브라우저 메모리 단일 상태로 도입: E1 UUID, legacy local-N, 기준 WCS Geometry·provenance, transform/visible/edit flag 유지. Overlay Scene/Hit/Tree/기존 임시 JSON은 Document에서 투영하며 GPU 그룹 증분 갱신/dispose.
- Generated-only/전체 선택 검증과 원자적 Delete/Translate/Rotate 도메인 명령(후속 E3~E5 UI 미구현), preview-independent stage/commit/cancel, Undo/Redo 최대 100단계·추정 16MiB 및 Redo 분기 무효화.
- Viewer Undo/Redo 버튼과 Ctrl/⌘+Z·Ctrl/⌘+Shift+Z·Ctrl+Y(입력 native 우선), Session 작업 소멸 안내. 원본 DXF/DB/서버 API·Source 인덱스 변경 없음; #31 P4 보안 Gate 유지. 
- Unit/Chromium E2E 시나리오·[Issue52](Issue52.md)/ADR-044/Requirements/Architecture/TestPlan/TestReport/README/AGENTS 문서 갱신. 로컬/현장 검증 NOT RUN, PR CI 성공은 확인 전 주장하지 않음.


### PR #78 / 최초 CI 보완 — v0.37.1 버전 유지 (2026-10-25)

- [Run 40167191799](https://github.com/planner77/layoutManager/actions/runs/40167191799): TypeScript/ESLint PASS, Vitest **187 PASS/1 FAIL** (`TC-IMAGE-003` 이전 `node scripts/run.mjs deploy` 기대와 새 migrator `tsx scripts/deploy.ts` 불일치); Unit 실패로 이후 Build/E2E/Legacy SKIPPED. 기존 테스트를 실제 분리된 migrator entrypoint와 Compose 생명주기 계약으로 개정, `TC-IMG66-010` Migration→Backfill 순서 회귀 추가.
- Docker Job 별도 SUCCESS: linux/amd64 **1,336,572,597→578,862,325 bytes**, 비압축 **56.69% 감소**, gzip tar proxy **462,720,650→212,574,989 bytes**. OCI GHCR 계층 및 실제 운영 복구 실측은 미완. 기능 Dockerfile/DB/API/버전 변경 없음, 최신 HEAD CI 결과 전 전체 PASS 주장 금지.

## v0.37.1 — Issue #66 독립 migrator 경량화 (2026-10-25)

- Build: 원 `src/package-lock.json` 고정 전체 의존성에서 migrator 전용 runtime manifest를 생성하고 오프라인 prune해 단 한 번 실행하는 `migrator` 타깃에 필요한 CLI/native 및 DB/backfill source만 복사. 웹 `runtime`/schema/Viewer/API·원본은 변경하지 않는다.
- CI: PR base migrator와 신규 migrator의 linux/amd64 비압축 이미지 크기, history, `du`, gzip proxy 비교 및 강제 실패·Compose smoke 강화. 30%는 soft target. Main GHCR version pair가 실제 게시된 후 linux/amd64 OCI 압축 layer 중복/공유 digest를 측정한다.
- 기존 `migrate` Compose 성공 의존, /data, UID 10001, Debian glibc/OpenSSL/CA, tag/digest pair와 candidate→public 순서, 업그레이드/롤백 절차 유지. **실제 Docker/PR CI/OCI 계측 결과는 실행 전 NOT VERIFIED.** [Issue66](Issue66.md), [TestPlan](TestPlan.md), [Operation](Operation.md).
## v0.37.0 — Issue #51 E1 원본/생성 통합 선택 (2026-10-25)

- 생성 Overlay의 CSPRNG UUIDv4 세션 참조/Origin·Version·SHA 계약과 전용 Generated 객체 조회 추가. v1/v2 다운로드의 local-N은 그대로 유지.
- #31 SOURCE SpatialIndex/Layer/Renderer 검증을 유지하면서 GENERATED Polygon/MultiPolygon/Hole의 화면 hit, 왼→오른쪽 포함/오른→왼쪽 교차, Ctrl/⌘ 토글을 SelectionController로 통합. 트리 선택/표시·숨김과 강조/카운트 동기화.
- Pan/원본·생성/생성 전용/#40 외곽선 소스 선택 모드 분리. SOURCE/혼합 선택은 readonly, GENERATED-only는 향후 로컬 편집 대상; 실제 명령은 #52~#55. Server/DB/Source DXF 불변.
- Unit/E2E 코드 및 Issue51/Architecture/Requirements/ADR-042/TestPlan/TestReport/README/AGENTS 동기화. 로컬 시험 NOT RUN, PR CI 성공 미확인.


## v0.36.1 — Issue #74 Main CI 실행명 안정화 및 명시적 GHCR 릴리스 (2026-10-25)

- 한 줄 Squash commit은 `MAIN CI | #Issue | 요약`, 커밋 본문이 있으면 긴 문자열 대신 `SUBJECT-ONLY-REQUIRED | run N`을 표시한다. #34 정상 표기 유지, #35/#36의 불필요한 본문 노출 회귀 방지.
- 사용자의 **GHCR 게시 지시**로 패치 버전 `0.36.0 → 0.36.1`을 `src/package.json`과 lockfile 루트에 동기화한다. 기존 `v0.36.0` 태그는 움직이지 않고 main `release-scope`의 정상 runtime change 판정 → 신규 `v0.36.1` 태그 및 앱/마이그레이터 쌍의 digest 검증·게시 경로를 사용한다. 실제 게시 성공은 Main Job 확인 전 **NOT VERIFIED**.
- 관리자 Squash 기본 메시지 변경(`PR_TITLE/BLANK`)은 [#76](https://github.com/planner77/layoutManager/issues/76)에서 별도 추적한다. 실제 app/DB/원본/런타임 의존성/배포 파이프라인 작업 단계는 불변. 이전 [PR CI 40163919324](https://github.com/planner77/layoutManager/actions/runs/40163919324) 성공은 **버전 변경 전 HEAD만** 검증함. [Issue74](Issue74.md), [FailureLedger](FailureLedger.md).

## v0.36.0 — Issue #43 U6 브라우저 세션 외곽선 목록 (2026-10-25)

- DXF three-dxf-viewer 상단 외곽선 목록 토글·우측 도킹 트리/legacy grouping, 임시·개수·종류 표시, 키보드 접근성, compact 320px, 메뉴 포커스 복귀.
- SavedOutline Overlay 개별/그룹 표시·숨김, 선택 및 WCS Polygon/MultiPolygon Envelope 확대·독립 강조; CAD Source Layer/Worker/기하 불변, ON 도구에서만 개별 임시 삭제. Adapter local ID 단조 증가, Session 100건 제한, Reload/Version 폐기.
- Unit/E2E 코드·Issue43/AGENTS/README/Requirements/Architecture/ADR-040/TestPlan/Report 동기화. #65/#31 P4의 Admin/Server API/영속 저장 미승인 유지. PR CI 전 실행 결과 NOT RUN.


## 2026-10-25 — Issue #68 GitHub Actions 실행명 개선 / 메타데이터 GHCR 게시 제외

- Added: PR CI, Main CI, Release의 최상위 `run-name`; 수동 PR CI `issue_ref` / `run_description` 입력. 신규 PR/squash 제목은 `#Issue | 설명`, 이슈 없는 경우 `NO-ISSUE | 설명`, 비정형은 `ISSUE-UNKNOWN`으로 표기한다.
- Release safety: 신규 `release-scope` Job이 main의 Markdown/Workflow YAML만 포함하는 변경을 감지하면 GHCR Publish Job을 skip한다. Tag push 및 런타임 변경은 기존 GHCR 이미지 pair 계약을 유지하며, 확인 불가능한 비교 기준은 게시 전에 실패 처리한다.
- Compatibility: 기존 workflow trigger/권한/concurrency/이미지 페어 빌드/게시 Step은 불변, 단 조건부 게이트 Job 추가. 앱 version 및 database 변경 없음. 새 Run에서만 적용되고 CI/게시 성공을 의미하지 않는다. [Issue68](Issue68.md), ADR-038, [Operation](Operation.md).


### v0.35.0 / PR #70 — 첫 Chromium E2E 회귀 보완 (2026-10-25)

- 초기 [Run 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271)은 Unit/Lint/Build/Docker PASS, Chromium 57 PASS/1 FAIL, legacy migration SKIPPED. 원인: #31 기존 테스트의 두 번째 Canvas drag가 U5 확장 도크 사용 후 스크롤된 페이지의 **음수 Y**에서 시작.
- [test `a5d9f843`](https://github.com/planner77/layoutManager/commit/a5d9f8430e06fe3b223dc97157c917ac6e793394): 두 Canvas 실제 드래그 전 `scrollIntoViewIfNeeded` / viewport 확인, selection/geometry assertions 유지. 런타임/DB/API 변경 없음.
- 실패 로그·Artifact 보존: [FailureLedger](FailureLedger.md). 수정 HEAD의 CI 성공/운영 배포는 확인 전 미확정; SemVer `0.35.0` 유지(아직 병합되지 않은 PR 테스트 교정).


## 0.35.0 — 2026-10-25 / Issue #42 U5 타입 연계 안전 선행 (PR CI 미검증)

- `outline-assignment.ts`: 현재 DXF Version/SHA/scope 바인딩, active 타입 검증·이름 NFC/기본 이름·ID 독립 계약 추가.
- `SavedOutline`, ViewerManager/Three adapter, Viewer UI에 타입 지정 메타데이터 및 이름 입력 경로 추가. **#65 실 서버 타입 카탈로그 미구현으로 U5 typed 확정 disabled**, #41 lab 타입은 연결하지 않음. U3 구형 미분류 브라우저 임시 확정은 유지.
- JSON v1 legacy export/parser 보존 및 typed/mixed v2 추가; source Handle·geometry·kind 독립 유지. Unit/E2E gate 시험 코드·AGENTS/README/Issue42/Requirements/Architecture/Decisions/Database/TestPlan/Report 동기화.
- 영구 저장/API/Prisma/DDL/IdP/RBAC/Audit·트리뷰 없음. 실제 사용 가능 판정과 Test PASS는 #65/#31 P4 승인 및 PR CI/현장 검증 전 보류. 상세 [Issue42](Issue42.md).


## v0.34.0 PR #64 검증·병합 및 릴리스 시작 근거 (2026-10-25)

- [PR CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) SUCCESS: Typecheck/Lint/Unit·Integration/Synthetic Benchmark/Build/Chromium E2E/Legacy Migration E2E/Docker. 직전 실패 [40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566)는 원장에 보존; 시안 alert locator 및 HTTP UUID P2 수정 검증.
- PR #64 → main [squash merge 7da613d1](https://github.com/planner77/layoutManager/commit/7da613d1ed9e2893849a3c3a7f0931d4f32ff850), 변경 버전 v0.34.0. [Main/GHCR workflow 40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554) **시작 확인**, 완료·digest·태그 게시 실증은 미확정.
- 원 이슈 #41은 범위 분할로 닫되, 실제 Admin 영속 API/DB/RBAC/Scope/감사/외곽선 typeId 연계는 미구현·Owner 승인 대기하여 [#65](https://github.com/planner77/layoutManager/issues/65)에 이관. 운영 Admin 기능 완료로 표현하지 않음.


### v0.34.0 / PR #64 — 첫 CI E2E 실패·HTTP UUID 리뷰 교정 (2026-10-25)

- [Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) Chromium E2E **55 PASS/1 FAIL**(프로토타입 error alert + Next route announcer 중복 locator), Legacy migration SKIPPED; TypeScript/Lint/Unit/Benchmark/Build/Docker PASS. [FailureLedger](FailureLedger.md).
- Corrected: `TC-U4-E2E-PREVIEW-001` alert locator를 prototype scope로 한정, 일반 사내 HTTP의 `crypto.randomUUID` 부재는 CSPRNG `getRandomValues`→UUIDv4 fallback으로 해결. [P2 review](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797) 및 `TC-U4-UNIT-005/006`, `TC-U4-E2E-HTTP-003` 신규 회귀. 코드 [`b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a).
- No change: v0.34.0 버전, Renderer/Source/Viewer/DB/관리자 권한 게이트. 수정 HEAD의 새 PR CI **결과 확인 전 NOT VERIFIED**.


## 0.34.0 — 2026-10-25 / Issue #41 관리자 최상위 외곽선 타입 비영속 안전 시안

- Added: 타입 계약 및 순수 NFC/trim·중복·길이·sortOrder·UUID·revision CAS 시뮬레이션·비활성/복구 도메인, `/lab/outline-types` **비영속 React UI 시안**, UNIT/E2E 회귀 스위트. 브라우저 reload 시 데이터 삭제.
- Blocked intentionally: **실 Viewer 관리자 메뉴 disabled 유지**, 계정/Admin RBAC·Scope·Audit 결정 전 `/api/outline-types` CRUD, DB migration, 영속 저장, 외곽선 typeId FK, 트리/분류 기능 미구현. 단순 시안을 관리자 기능 완료로 표시하지 않는다.
- Compatibility: Viewer/Renderer/Canvas/레이어/기하 #31·#40, CadFileVersion/원본/Storage 불변. `src/package.json`/lockfile 루트 버전 0.33.0→0.34.0. [Issue41](Issue41.md), ADR-037 및 관련 기준 문서 갱신.
- QA: 신규 TC-U4-UNIT-001~004, TC-U4-E2E-PREVIEW-001/GATE-002는 **코드 작성됨, 로컬 NOT RUN**, PR CI 결과 모니터링 전 NOT VERIFIED.


## 0.33.0 — 2026-10-25 / Issue #40 외곽선 생성 메뉴 ON/OFF U3 (PR CI 검증 전)

- Added: `ViewerMenuBar` 외곽선 토글 ON/OFF + 접근성 상태/지원 사유. 정상 DXF+three-dxf-viewer+검증된 Source↔Render 매핑/64-hex Version SHA에서 ON→select/하단 도구, OFF→Pan/Worker·미확정 Preview·Selection 취소 및 안내. 기존 확정 Overlay·JSON 다운로드 유지(OFF 읽기 도크).
- Safety/Compatibility: #31 Geometry/Worker/source audit/hidden layer/ESC 우선순위·#38/#39 앱셸·Canvas/Zoom/Source 유지, reload/Renderer/Version 간 격리, stale Promise guard. Overlay visibility/영구 DB API/권한/관리타입/트리 구현 제외. Version `0.32.0 → 0.33.0`, `src/package-lock.json` 동기화.
- Tests/Docs: TC-U3-UNIT-001~003, TC-U3-E2E-001~003, 기존 #31/private/#38 테스트 조건 갱신, [Issue40](Issue40.md), [ADR-036](Decisions.md), Requirements/Architecture/TestPlan/TestReport/README/AGENTS/Issue31 갱신. **typecheck/lint/unit/build/Chromium/실 CAD는 새 PR CI 증거 전 NOT RUN**, 성공 판정하지 않는다.


### PR #48 첫 CI 실패 및 P2 리뷰 보완 (2026-10-25)

- 실패 Run [40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671): TypeScript PASS, ESLint `react-hooks/refs` FAIL(+ `exhaustive-deps` warning), Unit/Build/E2E SKIPPED, Docker runtime PASS. [FailureLedger](FailureLedger.md).
- 수정: Ref 접근이 렌더 과정으로 전파되지 않도록 `useCallback`/정적 Renderer JSX 및 안정적인 load effect dependency. Space Pan은 캔버스에만 적용, 버튼 포커스에서는 Space 클릭을 허용(#48 P2 리뷰). E2E Enter ON → Space OFF → Space ON 및 Space+drag 회귀 추가.
- 수정 후 PR CI는 새 HEAD에 대한 **검증 전**, 처음의 성공 단계를 이 HEAD의 PASS로 재사용하지 않는다.

### PR #48 2차 CI Chromium E2E 실패 및 Fixture/기대 수정 (2026-10-25)

- [Run 40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136): TypeScript/ESLint/Unit/Benchmark/Build PASS; Chromium E2E 52/54 PASS (2 FAIL); Legacy migration E2E SKIPPED; Docker runtime PASS.
- #31 E2E가 reload 후 기본 OFF인 상태에서 선택 도구 렌더를 기대하는 회귀 테스트 불일치를 수정하여, OFF/도구 부재를 먼저 확인하고 다시 ON 뒤 선택 개수 0을 검증.
- #40 E2E용 합성 `LWPOLYLINE`에 필수 group `90=4`가 없어 dxf-viewer parser `n must be greater than 0 vertices` 실패. Autodesk DXF Reference 기준으로 두 Square Fixtures의 vertex count를 추가. 실제 앱/Geometry/Worker 변경 없음. [Issue40](Issue40.md), [FailureLedger](FailureLedger.md) 참조.
- 코드 [`fd1f4613`](https://github.com/planner77/layoutManager/commit/fd1f4613c1cc69b2f383c7cc4129a8d95d70ec39) 이후 새 PR CI 결과는 **NOT VERIFIED**. 이전 성공 체크를 수정 HEAD 성공으로 오인하지 않는다.

## 0.32.0 — 2026-10-25 / Issue #39 레이어 메뉴·도크 U2 (PR CI 검증 전)

- UI: U1의 단일 `layerPanelOpen` 상태를 메뉴/내부 접기에 연결. 가능한 경우 레이어 도크 host를 유지하고 숨김 시 내부 panel만 닫아 `aria-controls` 대상으로 유효하게 유지. 접기 버튼 삭제 후 메뉴에 포커스 복귀 및 키보드 Enter/Space 재열기.
- Compatibility: 기존 체크박스/전체 선택·해제의 실제 `ViewerManager.showLayer` 및 Canvas/Source/줌 상태, #25 CSS/native 진입, 모바일 도킹/검색/외곽선 도구 유지. 미지원 Renderer/DWG/0 layer/로딩/오류에서 메뉴 disabled 및 aria-controls 제거. DB/API/migration/원본/의존성 변경 없음.
- Tests: Vitest `TC-U2-UNIT-001` 강화 + Chromium `TC-U2-E2E-001~003`(패널·레이어 독립/포커스/320px/Renderer/reload/모의 native/zero drawable) 신규 작성. **로컬 CI/실 CAD 검증 NOT RUN**. PR CI는 생성 이벤트에서 시작하며 통과 판정 전까지 결과 미검증. [Issue39](Issue39.md).

## 0.31.0 — 2026-10-25 / Issue #45 Current-only 도면 목록 (PR CI 결과 확인 전)

- Changed: `/` 목록은 Current Version만 서버에서 조회. 초기·검색·초기화·검색 필터·페이지네이션·과거 `current=false` URL에서도 Current-only 결과/count 유지. 최신 버전이 Current가 아니라면 표시하지 않음.
- UI: #8의 `현재 버전만 표시` 토글/전용 컴포넌트 제거. Current-only 요약/빈 상태 문구, `위치별 버전 관리` 링크 및 기준정보 층별 `버전 이력` 진입 추가.
- Compatibility: `GET /api/cad-files?current=false` 기존 API와 Location 상세 전체 버전/Current 변경·삭제·직접 Viewer/원본 다운로드 유지. Location Current 0~1개 및 DB schema·원본 불변.
- Test: TC-LIST-045-001~003, Workflow/Link/Name 회귀 갱신, 관련 요구·설계·운영 문서/ADR 추가. **최초 PR CI #40142618328: Typecheck PASS, ESLint FAIL(신규 JSX apostrophe 2건), Unit/Build/E2E SKIPPED, Docker PASS**. `69e6b175`에서 escape 처리 및 리뷰가 지적한 `TC-ISSUE-001/LIST`의 비Current 홈 선택 회귀 보완. 새 HEAD 결과 미검증. [FailureLedger](FailureLedger.md), [Issue45](Issue45.md), [TestReport](TestReport.md).


## 0.30.0 — 2026-10-24 / Issue #38 앱형 Viewer 메뉴바·도킹 셸 (PR CI 시작 전)

- Added: `ViewerAppShell`(CSS/native 공통 shell, left/center/right docking host, mobile compact panel, 하단 도구, status), `ViewerMenuBar`, 독립 `ViewerAppState` reducer, U2/U3/U6 확장 계약.
- Changed: 기존 #17 fullscreen layer panel을 controlled dock으로 전환. 상단 레이어 메뉴에서 보이기/숨기기를 제어하되 실제 layer visibility·Canvas/zoom·원본 다운로드 상태는 보존. 검색 패널의 controlled 열기/ESC 처리, selection→search→native→CSS ESC 우선순위 명시.
- Compatibility: 기존 Renderer(dxf-viewer/three-dxf-viewer/libredwg-web), version URL, #31 브라우저 임시 결과/JSON, #25 native 사용자 활성화/immersive policy 및 DB/API/schema/CAD bytes 유지. Outline ON/OFF·tree·Admin 관리는 후속 이슈까지 메뉴 비활성.
- Tests: U1 state Unit + 2 DXF Renderer/손상 DWG/모바일/레이어/ESC Playwright 신규 작성, #31 회귀 수정. **실제 검증 NOT RUN**. 상세 [Issue38](Issue38.md), [FailureLedger](FailureLedger.md), [TestReport](TestReport.md).


## 0.29.0 — 2026-10-17 / Issue #25 도면 Viewer 기본 immersive 진입 (PR CI 전)

- PR #36 E2E 회귀 보완: Run `38974687861`에서 40 PASS/4 FAIL (도면 원본명 중복, 설명 a11y label 누락, FONT 2 Renderer 일반 모드 버튼 기대). 원본명 중복 제거, 설명의 표시 및 접근성 계약 복원, FONT E2E의 fullscreen→normal 전환 절차 추가. TypeScript/ESLint/Unit/Build/Docker 성공은 이전 HEAD에 한정하고 수정된 HEAD의 검증은 새 PR CI 대기.

- PR #36 보완: 최초 CI `38963238965`의 ESLint `react/no-unescaped-entities` 2건을 JSX escape로 해결. P2 native fullscreen top-layer에서 global loading spinner가 숨겨지는 구조적 문제를 같은 Viewer shell 자손 spinner로 방지. 지연 reload/native 상태 합성 E2E (`TC-ISSUE25-002`) 추가. **보완 후 PR CI 검증 전**.

- Added: 목록·Location·공유/직접 Version URL·새 탭·재로딩의 CSS fixed `100dvh` viewport 전체 화면 기본 진입; 모든 Viewer DXF 2종/DWG 1종 공통 적용.
- Added: immersive shell 안에 파일명/Version·원본명/위치, DXF Renderer, zoom/fit, 레이어/텍스트 검색/외곽선, 원본 다운로드, 링크 복사, 상태·오류·재시도, 일반 Viewer 종료/목록 복귀 표시.
- Changed: 브라우저 native Fullscreen API는 명시적 버튼 클릭 시에만 시도. native 해제/ESC와 앱 CSS immersive 종료를 별개로 관리. HTML/Body scroll lock, app header inert/focus cleanup, 모바일 dvh 대응.
- Compatibility: 기존 링크 Renderer query·Version UUID/원본 API, DB/마이그레이션·Viewer Adapter 기능 호환. Renderer 변경/Resize/원본 요청/cleanup은 기존 계약 유지.
- Tests: TC-ISSUE25-001 2종 DXF E2E 및 기존 Viewer/Layer/Search/Outline/Link/Metric/DWG regression 코드를 변경. **PR CI 및 실제 현장 수용은 아직 미확인**, PASS로 기록하지 않음.
- Details: [Issue25](Issue25.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).



## 0.28.3 — 2026-10-16 / Issue #31 P0/P5 보완과 P4 원본 검증 사전 계약 (PR CI 전)

- Fix: 미지원 BLOCK 내부 자식이 있어도 root INSERT가 stable=true가 되는 오매핑을 차단, 512-샘플 상한을 초과한 대형 ARC/CIRCLE의 chord tolerance 위반을 거부.
- P4 trust boundary: immutable DXF SHA/Version/Unit/고유 Handle 검증과 서버 재계산 Polygon symmetric-difference 검증 모듈, 변조 방지 Unit 추가. **실제 API/DB/인증/영구 저장은 Owner 정책 미승인으로 미구현**.
- P5: PR CI의 synthetic 1k/10k/100k 벤치마크 확대, private real-DXF Playwright 5회 Browse/Select/Mapping/load p50·p95/Heap test config, 결과 파일 Git/Docker 제외.
- Tests/Docs: P0 fail-closed·P4 canonical attestation Unit, 재현 프로토콜/운영 체크리스트 및 요구·설계·테스트 문서 갱신. CI/실 DXF 수용은 미확정.


## 0.28.2 — 2026-10-16 / Issue #31 Production PRECISE Worker import 수정 (PR CI 전)

- Fix: `polygon-clipping@0.15.7`의 Webpack ESM default export로 `union` 호출하여 v0.28.1의 named-export warning을 해결하도록 수정.
- Build/Release: `scripts/run.mjs`에서 unresolved import/export 경고는 Next Build exit 0이어도 fail-closed; PR·Docker 공통 안전장치.
- Test: default import/Union 면적/빌드 warning Unit, Production E2E PRECISE Worker 계산→확정→JSON 좌표·면적·SHA 확인, PR CI synthetic 1k benchmark smoke.
- P0/P5: 100MiB 이하 UTF-8 ASCII 현장 DXF의 read-only private source audit 명령(원본·경로 미출력). 현장 정확도/100k GPU는 여전히 별도 수용.
- P4: 영속 DB/API/인증 변경 없음 (Owner 정책 승인 전). 신규 PR CI/실도면 운영 수용은 미확정.


## 0.28.1 — 2026-10-16 / Issue #31 후속 P0/P5와 P4 기초 (PR CI 전)

- Fixed: top-level DXF Source Handle/type/layer/WCS box와 THREE rendered Object3D 1:N bbox 합산 대조. 미렌더·불일치 도형 선택을 제외하고 UI에 진단 수를 표시.
- Performance: bounded spatial tile index, giant Entity overflow 및 광역 선택 fallback, Worker source-index/render audit/spatial build 시간 표시. 1k/10k/100k synthetic CPU DXF benchmark CLI 추가.
- P4 foundation: Version/SHA/정상 Handle/Polygon JSON의 검증 함수·Unit 추가. **Server outline DB/API 및 별도 인증은 미구현**, Owner 승인 대기.
- QA: mapping/spatial/JSON validator Unit 및 DXF Viewer mapping E2E 추가. PR CI/실도면·GPU 성능 PASS 미확인.



### 0.28.0 / PR #30 CI #55 Workflow E2E 회귀 보완 (2026-10-16)

- Typecheck/ESLint, 136 Unit·Integration, production Build, Docker smoke 및 신규 TEXT/MTEXT 검색 두 Browser E2E가 PASS. 기존 Workflow E2E 1건은 44개 도면/25개 기본 페이지네이션에서 과거 등록일(2026-09-08) Version을 첫 페이지에서 찾는 기대가 잘못되어 실패.
- 등록 이후 원본 파일명 UI 검색과 업로드 Version ID 기반 Current 검증으로 테스트 안정화. 앱/DB/API 구현 변화 없음. 전체 CI 및 독립 QA는 신규 Run 검증 전 미확정.


## 0.28.0 — main 0.27.0(#31) 정렬 + GitHub #26 DXF 텍스트 검색 통합 (PR CI 대기)

- 기존 main의 DXF 객체 선택·볼록/정밀 외곽선 생성 및 관련 라이브러리와 테스트를 보존하고 DXF TEXT/MTEXT 검색, 위치 Pan/Zoom, Worker 인덱스를 결합.
- PR #30 CI #54: TypeScript/ESLint/126 Unit·Integration/Build/Docker PASS; Renderer 전환 시 캐시 검색의 working 플래그가 남는 E2E 2건 FAIL. Effect 결과·오류 분기에서 로딩 상태를 직접 종료하는 수정 및 추적 문서 반영.
- DB/API/migration 및 추가 npm dependency 없음 (polygon-clipping은 기존 main #31 의존성). 0.28.0은 미게시/PR CI 검증 전 후보 버전.



### 0.27.0 / PR #30 / CI #52 Browser Fixture regression repair

- CI #52: TypeScript/ESLint, Unit/Integration 125/125, production Build and Docker smoke PASS. Browser E2E 38/40 PASS; newly added TEXT/MTEXT search variants failed because the E2E's literal \n in a // comment suppressed the entire MTEXT insertion statement.
- Extracted shared DXF fixture (group-code array + LF join) and added Unit TC-TEXT-FIXTURE-001 checking three TEXT and one MTEXT with normalized Korean text. Browser tests now import the shared fixture. Viewer production code unchanged.
- Final result, real CAD and QA remain pending until follow-up CI.



### 0.27.0 / PR #30 CI #49 E2E fixture 수정 (2026-10-16)

- Typecheck/ESLint/125 Unit·Integration/Build/Docker PASS; Browser E2E 38 PASS / 신규 2 FAIL.
- 공식 DXF에 따라 MTEXT 테스트 파일에 group 41(width), 71=1(top-left), 72=1(left-to-right)을 명시하고 TEXT handle을 유효한 hex로 갱신. CI trace의 RenderMText "Unhandled alignment" 원인 해결을 목표로 한 테스트 데이터 보완.
- 운영 소스 변경 없음. 최종 Browser E2E 및 독립 QA 결과 재검증 대기.



### 0.27.0 / PR #30 보완 (2026-10-16)

- Fixed: JSX 렌더링 중 ViewerManager ref 읽기로 발생한 ESLint react-hooks/refs 실패를 stable getter로 변경.
- Fixed: DXF Unicode escape가 바로 뒤의 영문 16진 문자까지 잘못 소비하던 문제를 정해진 4자리 코드로 제한하고 회귀 테스트 추가.
- Verification: PR CI #42 (38865738285)는 TypeScript/Docker success, ESLint failure, Unit/Browser skipped. 후속 PR CI 및 QA 판정 대기.



## 0.27.0 — 2026-10-16 / GitHub #26 (PR CI 전)

- Added: 현재 DXF 내 TEXT/MTEXT 문자열 부분검색, 한글/영문/숫자, 정규화된 MTEXT, 결과 선택·이전/다음 및 world XY Pan/Zoom. 2D BLOCK/INSERT 좌표 해석과 미지원 Entity 집계.
- Added: 재사용 가능한 브라우저 Worker text index, ViewerSource 캐시, 두 DXF Adapter의 focusBounds, 전체 화면 Viewer shell의 접이식 검색 패널.
- Compatibility: DB/API/migration/새 npm dependency 없음. DWG 텍스트 검색은 미지원. 기존 #25 기본 fullscreen 진입은 별도 작업.
- Tests: TC-TEXT-001~006 Unit, TC-TEXT-E2E-001 브라우저 테스트 소스 추가. 이 시점 정적/실행/CI PASS 및 실제 업무 도면 수용은 **미확인**.


## 0.27.0 — 2026-10-16 / GitHub #31 (PR CI 재검증 전, 범위 제한)

- Feature: three-dxf-viewer의 DXF 객체 클릭/다중·방향별 영역 선택, 레이어 동기화, 독립적인 Convex 및 실제 폐곡선 Polygon Union(+MultiPolygon/Holes), Worker 취소 및 Preview/임시 확정·JSON 내보내기.
- Design: Version SHA + Entity Handle, 기본 2D WCS/INSERT 변환·INSUNITS, 오류가 있는 Entity의 명시적 제외; polygon-clipping@0.15.7(MIT) 도입. 브라우저 임시 결과만 지원, 서버 DB/API/원본 변경 없음.
- Validation: 최초 PR #32 CI #38868848174 TypeScript/Docker PASS, ESLint prefer-const 실패로 Unit/E2E 미실행. Fullscreen ESC/Preview stale/오목 Hole P2 리뷰 3건 보완 및 회귀 테스트 추가. 신규 CI·독립 QA·실도면 검증 전. 범위·미지원과 P4 정책 대기는 [Issue31](Issue31.md).


## 0.26.0 — 2026-10-16 / GitHub #28 (CI 전)

- Web: Next standalone 및 native SQLite 기반 Docker 운영 이미지로 축소; 비교용 phase1 타깃 추가.
- DB: migration/backfill은 별도 일회성 migrator 타깃으로 분리. Compose는 성공 종료 이후 웹을 시작한다. UID10001, 단일 /data, DXF/DWG font/JS/WASM/스토리지 계약 유지.
- Release: 앱·마이그레이터를 SHA 기반 후보로 각각 빌드·검증한 후에만 동일 릴리스의 공개 태그를 승격하도록 변경. 태그 없는 `GHCR_IMAGE`를 `:latest`/`:latest-migrate` 쌍으로 정규화하는 `scripts/compose.sh` 추가. GHCR 다중 태그 승격의 비원자성을 고려해 운영은 버전/digest pair 고정·백업·구 앱 중단·migration 성공 후 시작 필수.
- Test: 최초 PR #29 CI #30 run `38858349603`의 정적/Unit/Browser/Legacy migration, Docker 빌드·측정, migrate/backfill 정상. **Docker smoke 실패**는 컨테이너 기동 직후 curl exit 56 재시도 누락으로 확인해 보완함. 비압축 크기 baseline 2,054,848,814 → runtime 376,228,092 bytes, **81.69% 절감**(동일 linux/amd64); 최종 smoke/재CI, 독립 QA, GHCR 게시 상태는 재검증 대기. TC-IMAGE-010~012 추가.


## 0.25.0 — 2026-10-15

- 사업부→제품→사업장/법인→동→층 기준정보 CRUD, 활성/비활성 및 SITE/LEGAL_ENTITY 종류를 추가했다.
- 등록을 완전한 활성 ID chain으로 제한하고 모든 위치 조회를 master join으로 전환했다. 기본 도면 이름 네 부분 형식은 유지하고 제품을 별도로 표시한다.
- 기존 Location ID와 Version/Current/순번/metadata를 보존하는 `미분류` 이관과 충돌을 거부하는 층 전체 이력 재분류를 추가했다.
- 검증: 독립 QA에서 정적 검사·빌드, Unit/Integration 109개, Browser 38개, 실제 legacy migration 1개, S3 6개, DWG 4개를 통과하고 Manager가 수용했다.
- 게시: source `e8189b4`를 지정 저장소의 기능 브랜치에 게시했다. PR CI는 일반 E2E와 실제 legacy migration E2E를 실행하도록 구성했다. Tag/GHCR 게시·운영 migration·배포는 수행하지 않았다.

# 0.24.0 — GitHub #17

- Added: 전체 화면 `three-dxf-viewer`에 접이식 레이어 패널을 추가했다. 현재 DXF 레이어의 개별 표시/숨김, 전체 선택/전체 해제, 내부 스크롤을 지원하며 일반 화면 `LayerDropdown`과 선택 상태를 공유한다.
- Changed: 레이어 조작은 기존 `ViewerManager.showLayer()`를 재사용해 Viewer/Adapter/Canvas 재생성과 원본 재다운로드 없이 즉시 반영한다. 현재 Zoom/Pan 상태를 유지하고 `dxf-viewer` 등 다른 Viewer에는 전체 화면 레이어 UI를 표시하지 않는다.
- Tests: PR #21 최종 CI run `35278486135`에서 TypeScript, ESLint, 23 files/105 Unit·Integration, Production build, Chromium E2E 35/35가 모두 통과했다. `TC-ISSUE17-001`은 복수 레이어, 개별/일괄 토글, 동일 Canvas 유지, 추가 content GET 없음, 전체 화면 종료 후 view state 복원, 일반 드롭다운 동기화, 다른 Viewer 미표시를 검증한다.
- Version: 신규 UI 기능이므로 SemVer MINOR `0.23.0` → `0.24.0`. DB schema/migration, API contract, 외부 dependency 변경 없음.
- Release: PR #21을 squash merge한 commit `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`에서 `v0.24.0`을 생성하고 `ghcr.io/planner77/layoutmanager:0.24.0` 및 `latest`를 digest `sha256:bfd80f24e43b5e108c480b3a51913daa66d47331c880855f340233468616993c`로 게시했다. 상세 근거는 `Issue17.md`와 `Release-0.24.0.md`를 따른다.
- Limitation: 매우 많은 레이어를 가진 실제 업무 DXF의 현장 사용성·성능은 CI 범위 밖이며 운영 smoke test 대상으로 남긴다.

# 0.21.1 — GitHub #14

- Fixed: 사설 IP HTTP 등 비-Secure Context에서 전역 로딩 작업 ID 생성이 `crypto.randomUUID()`에 의존해 Viewer 콘텐츠 요청 전에 중단될 수 있던 회귀를 수정했다. Provider-local sequence 기반 ID로 변경해 Secure Context 의존성을 제거했다.
- Tests: PR #15의 GitHub Actions run `35231047884`에서 TypeScript, ESLint, 22 files/100 Unit·Integration, Production build, Chromium E2E 34/34가 모두 통과했다. `TC-ISSUE14-001`은 `crypto.randomUUID` 부재 조건에서 콘텐츠 요청, dxf-viewer/three-dxf-viewer 표시 완료, global overlay 해제를 검증한다.
- Version: 기존 기능 회귀 수정이므로 SemVer PATCH `0.21.0` → `0.21.1`. DB schema, API contract, 외부 dependency 변경 없음.
- Release: PR #15를 squash merge한 commit `642bde71f9d9c0e1205df66c3828489ff2d4078f`에서 `v0.21.1`을 생성하고 `ghcr.io/planner77/layoutmanager:0.21.1` 및 `latest`를 digest `sha256:fbb7b21ab81250a3d0a47fa963683895f57e8c02a9f4ceac57f37170469be451`로 게시했다. 상세 근거는 `Release-0.21.1.md`를 따른다.
- Limitation: 실제 사설 IP HTTP + 기존 0.19.2 named volume 조합의 현장 smoke test는 GitHub Actions 범위 밖이며 운영 배포 시 별도 확인한다.

# 0.21.0 — GitHub #10

- Added: 도면 Viewer에 전체 화면 진입/종료를 추가했다. 표준 Fullscreen API를 우선 사용하고 제한되는 환경에서는 CSS fixed viewport fallback으로 화면 가용 영역을 최대화한다.
- Added: 전체 화면 안에서 확대·축소·화면 맞춤·이동과 명시적인 종료 버튼을 제공한다. `Escape`는 native/fallback 모두 종료하며 `fullscreenchange`로 브라우저 자체 해제와 상태를 동기화한다.
- Changed: 전체 화면 전환은 Viewer/Canvas를 재생성하지 않고 같은 DOM의 크기만 바꾸므로 현재 확대/이동 상태를 불필요하게 초기화하지 않는다. 기존 dxf-viewer `autoResize`와 three-dxf-viewer/DWG `ResizeObserver` 경계를 유지한다.
- Tests: PR #13의 최초 run `35210713169`은 Playwright 합성 ESC와 native fullscreen 해제 차이로 Viewer E2E 2건이 실패했다(31/33). ESC를 명시적 종료 경로로 보강한 최종 기능 head `9eff6d438ec86fffd6acdc99ea4d046c028f6690`의 run `35211193682`에서 TypeScript, ESLint, 22 files/100 Unit·Integration, Production build, Chromium E2E 33/33이 모두 통과했다.
- Version: 신규 UI 기능이므로 SemVer MINOR `0.20.0` → `0.21.0`. DB schema 및 외부 의존성 변경 없음.
- Release: PR #13 병합 후 `Build and publish Docker image` workflow가 `v0.21.0`, `ghcr.io/planner77/layoutmanager:0.21.0`, `latest`를 관리한다. 실제 merge SHA, workflow run, digest는 `Release-0.21.0.md`를 기준으로 한다.

# Unreleased — GitHub #8

- Added: 도면 목록에 `현재 버전만 표시` 빠른 토글을 추가했다. ON은 기존 `current=true` 조회를 재사용하고 OFF는 Current 조건을 제거한다.
- Changed: 토글 전환 시 파일명·도면 설명·사업부·사업장·동·층·형식·페이지당 표시 조건을 유지하면서 `page=1`로 초기화한다. `aria-pressed`와 활성/비활성 시각 상태를 제공하며 기존 `current=false`(이전 버전만) 필터는 그대로 유지한다.
- Tests: `TC-LIST-008/009`로 URL 상태 보존·페이지 초기화·기존 조건 AND 결합·Current 미지정 Location 제외를 검증하고, Playwright에서 OFF→ON→OFF와 검색조건·`aria-pressed`·표시 행 변화를 검증했다.
- CI: PR #11의 최초 실행은 기존 `TC-NAME-003` fixture가 현재 도면 이름 안내 UI와 불일치해 30/31 E2E로 실패했다. fixture를 요구사항에 맞게 갱신한 두 번째 실행에서 typecheck, lint, 22 files/100 unit·integration tests, production build, 31 E2E가 모두 통과했다.
- Scope: DB schema, Current 지정/교체 transaction, Location별 Current 최대 1개 규칙 및 API contract는 변경하지 않는다.

# 0.19.1 — GitHub #7

- Changed: 공통 header 좌측 제목의 CAD 접두어와 P.O.C. 배지를 제거해 Layout Manager로 표시한다. 실제 검증·배포 기록은 TestReport U-ISSUE7-20260911을 따른다.

- Release: 소스 `83b8e53` push, GHCR0.19.1 게시/pull, 실제 이미지 제목·홈 링크 검증과 기존 볼륨 백업/배포·healthy·데이터 보존 확인. GitHub #7 완료 종료.

# 0.19.0 — GitHub #6

- Added: 위치·버전 기반 기본 도면 이름과 등록 시 사용자 이름 선택 입력. 원본 파일명과 별도로 목록·Location·Viewer에 표시한다.
- Database: 사용자 이름의 nullable column 추가로 기존 도면을 기본 이름으로 표시한다. 실제 migration·시험·게시/배포 결과는 TestReport U-ISSUE6-20260911을 따른다.

- Release: 소스 `0b1c620` push, GHCR 0.19.0 게시/pull 및 이미지 Browser·db:deploy 재실행 검증 완료. 기존 볼륨 백업 후 migration/배포·healthy·기존 데이터/원본 보존과 기본 이름 표시를 확인하고 GitHub #6을 완료 종료했다.

# 0.18.0 — GitHub #5

- Added: three-dxf-viewer 레이어 다중 선택 드롭다운과 전체 선택·전체 해제, 선택 개수 표시. 현재 Viewer에서 선택을 유지하며 새 load와 Renderer/Version 전환 시 초기화한다.
- Tests: 여러 레이어의 실제 canvas 표시·숨김/복원, 메뉴/키보드·일괄 조작·수명주기 회귀를 보강하고 검증했다. 실제 결과와 배포 기록은 TestReport U-ISSUE5-20260911을 따른다.

- Release: 소스 `543423d` push, GHCR 0.18.0 게시/pull 및 이미지 Browser 검증 완료. 기존 볼륨 백업 후 배포/healthy·원본/전체 메타데이터 보존을 확인하고 GitHub #5를 완료 종료했다.

# 0.17.2 — GitHub #4

- Fixed: 삭제 대화창을 표와 분리해 긴 파일명·위치·경고 문구의 줄바꿈과 좁은 화면의 버튼 접근을 보장한다. 키보드 포커스 및 닫기 동작을 modal Dialog로 관리한다.
- Tests: 목록/Location·화면 크기·긴 텍스트·오류/정리대기 상태의 Browser 레이아웃 회귀를 보강한다. 실제 시험·게시·배포 결과는 TestReport U-ISSUE4-20260911을 따른다.

- Release: 소스 `56fb1c4` push, GHCR 0.17.2 게시/pull 및 기존 볼륨 백업·재배포/healthy·원본/메타데이터 보존 확인. GitHub #4에 검증 요약 댓글을 남기고 완료 종료했다.

# 0.17.1 — GitHub #2 / #3

- Fixed: 파일 선택과 제출 시 서버 설정의 최대 MiB를 기준으로 사전 검증해 초과 파일의 전송을 차단한다. 서버 413 검증을 유지한다.
- Tests: 기존 도면 설명의 UI 메모 등록·저장·조회 회귀와 100 MiB 경계/설정 변경/전송 차단 시험을 보강한다. 실제 결과는 TestReport의 이슈 조치 기록을 기준으로 한다.
- Fixed: 미게시 DELETE 구현의 서버 비밀번호 검증 누락과 제한/정리 경계에 대한 게시 전 보완. 실제 검증·배포 결과는 TestReport에 기록했다.

- Release: 소스 `27a132f` push, GHCR 0.17.1 게시·pull 및 기존 볼륨 재배포/healthy 확인. 기존 도면 2건의 원본·메타데이터를 보존하고 삭제 비밀번호1234 적용을 읽기 전용 검증했다. GitHub #2/#3 댓글·완료 종료. 상세 근거는 TestReport U-ISSUES-20260911.

# 0.17.0 — 2026-09-11 Unit DELETE

- Added: 신규 등록 삭제 비밀번호, 비밀번호 확인 후 선택 Version 삭제, 기존 Version 비밀번호 1234의 salt hash 초기화.
- Added: 삭제 Current 해제, 순번 재사용 방지, DB 승인 기록 기반 local/S3 원본 정리와 실패 재시도.
- Compatibility: 신규 업로드 API의 비밀번호는 필수이며 미입력400. DB migration/backfill 필요. 0.17.0 커밋 당시 원격 게시·운영 DB 적용·배포는 미완료였다.
- Tests: 당시 자동 시험은17 files/74 tests였다. TC-DELETE 전체 수용 결과는 아니며 게시 전 보완과 실제 DB 적용 결과를 TestReport에서 확인한다.

# 0.16.0 — 2026-09-09 Unit OBS

### Added

- 업로드 실패 화면의 안전한 진단 상세, 직접 선택·Clipboard 복사·JSON 저장과 공개 진단 Console 보조 출력을 추가했다.
- HTTP/비JSON/빈 응답/연결 실패/잘못된 성공 응답을 구분하고 결과 불확실 시 목록 확인을 안내한다.
- 서버 생성 요청 ID와 단계별 한 줄 JSON 로그로 수신·저장·DB 등록·정리·응답을 연결하며 S3 원인 chain을 정제해 보존한다.
- Docker Compose에 `local` 로그 드라이버의 10 MiB × 5개 순환 보관을 지정했다.

### Fixed

- 임시파일·보상 정리 실패가 최초 업로드 오류 또는 확정된 등록 성공을 덮지 않도록 처리했다.

### Tests

- 실제 결과와 배포 image/digest는 TestReport `U-OBS-20260909`를 기준으로 한다. 실제 폐쇄망 장애 재현은 별도이다.

# 0.15.0 — 2026-09-09 Unit 8B

### Added

- libredwg-web DWG Viewer의 WASM 초기화·DWG 파싱 단계 계측을 공통 Metrics JSON에 연결했다.
- 등록 폼 설명 입력 영역을 넓은 강조 섹션으로 재배치하고 홈 목록에서 Current를 직접 지정할 수 있게 했다.

### Tests

- Unit 53개, DWG E2E 4개, typecheck/lint/build 통과. 실제 업무 도면·장기 메모리·GPU/WASM 메모리는 미검증이다.
- 0.15.0 linux/amd64 이미지를 GHCR에 게시하고 인증된 pull 및 digest 일치를 확인했다.
- DWG 통합·기존 회귀 16개와 20회 Viewer 전환 검증을 통과했다.

## 0.14.0 — 2026-09-09 Unit DESC

### Added

- Version별 도면 설명 입력·목록/Viewer 표시와 설명 literal 부분 검색.
- 기존 행을 빈 설명으로 보존하는 SQLite additive migration.

### Tests

- Unit 테스트 52개 통과. 설명 UI E2E는 후속 실행 대상으로 기록한다.
- 최신 Dockerfile로 GHCR `0.14.0` 이미지를 재빌드하고 push/pull digest 일치를 확인했다.

애플리케이션 버전의 단일 기준은 `src/package.json`이다. 아래 Bootstrap 기록은 당시 상태이다.

## 0.13.0 — 2026-09-08 Unit DEPLOY

### Added

- 한국어 주석과 명시 이름을 갖춘 Dockerfile/Compose, named volume, 비root 실행, DB readiness endpoint.
- localhost/host IP 접속을 위한 기본 수신 주소, GHCR image/host port 환경 예제와 README build/pull 절차.

### Tests

- 최종 실행 검증일2026-09-09: 자동51개·local E2E16개·typecheck/lint/build, Docker localhost/hostIP, 세 renderer, 재생성 후 Version/Current/원본 영속성 통과. Secret검사121건/위반0. GHCR0.13.0 push 및 인증된 pull의 digest 일치 확인. 실제 digest/소스 commit은 TestReport U-DEPLOY-20260908에 기록했다.

### Known Issues

- 기존 host data 자동 이전 및 여러 app replica를 지원하지 않는다. DB/임시 CAD 디스크는 S3모드에서도 필요하다.
