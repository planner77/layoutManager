## #84 추가 구현 — 세션 스냅 후보·임시 객체/원본 차분 동기화 (2026-10-31)

- 이전 PR #173의 의도적 축소를 정정한다. M3 **브라우저 세션 내 자동 스냅**은 실제 지원 범위다. `MemoSessionSnapStore`는 현재 Version/SHA와 Viewer 인스턴스에만 연결되고 메모 ID→GENERATED 또는 RENDER Stable ID와 local WCS, 마지막 world WCS를 메모리로 관리한다. Canonical CadMemo DTO/서버의 `CadMemoAnchor`에는 임시 객체 Ref·작업 차분이 전달되지 않는다.
- `ThreeDxfViewerAdapter.getMemoSnapTargets()`는 현재 보이는 WCS 2D 생성 Polygon/MultiPolygon의 꼭짓점·Bounding Center, DXF_IMPORTED 2D 렌더 Path의 Endpoint·Vertex·Center를 반환한다. 기본 오차는 **12 CSS px**, 근접·동일 거리일 때 ENDPOINT→VERTEX→CENTER 우선, 후보 총 정점 20,000개 한도, 잘못된/비평면/타 Scope·비가역 Affine·미표시 항목은 제외한다. Source Handle 정밀 검증이 불가능해도 일반 RENDER 세션 스냅은 가능하지만 이를 서버 SOURCE_CANONICAL 증명으로 사용하지 않는다.
- 메모 신규 배치와 명시적 WCS 이동/핀 드래그 완료 시 최신 Viewer와 좌표를 다시 검증하여 스냅 선택. 같은 local WCS에 대상 현재 Affine을 투영하므로 Generated/SceneWork Translate·Rotate/Undo·Redo/숨김 후에도 memo World WCS가 따라간다. 임시 Generated 삭제→마지막 WCS의 BROKEN_ANCHOR; **동일 immutable ID** 복구 Undo→원래 연결 재계산. 제3 객체에 자동 재바인딩하지 않는다.
- 서버 영속 Memo를 임시 객체에 세션 스냅해도 서버에는 *스냅 좌표를 가진 FREE WCS만* 저장되며 객체 관계는 세션 한정이다. 명시적 '현재 WCS로 연결 해제'는 서버 Memo 작성자·CAS/Origin/CSRF가 허용할 때 현재 표시 좌표를 PATCH move로 확정하고 관계를 정리한다. 임시 M1 Memo는 로컬 상태만 갱신. 서버 요청 실패 시 세션 관계를 유지한다. Editor에는 '세션 한정/재접속 시 해제' 표시 및 명시 해제 버튼을 제공.
- SOURCE_ONLY는 RENDER 세션 바인딩을 **강제 BROKEN**으로 바꾸고 마지막 world WCS만 유지, APP_CREATED는 그대로. FULL 초기화는 세션 관계를 전부 정리한다. Reload/Renderer/Version 전환의 변경·관계 소멸은 기존 M1 계약대로 사용자에게 알린다. **저장되지 않은 원본 SceneWork를 영속 변환처럼 재접속 후 복원하는 것은 금지**하며, 원본 영속 앵커가 필요하면 검증된 서버 자산을 별도로 저장해야 한다.
- Codex P1 [메모 삭제 후 dangling Anchor](https://github.com/planner77/layoutManager/pull/173#discussion_r4428206096): Memo 개별 soft-delete 및 S6 ALL reset은 DB 트랜잭션 안에서 먼저 종속 CadMemoAnchor 행을 정리한다. 후속 Outline 변경이 삭제된 Memo의 앵커 때문에 실패하지 않는다. 리뷰 스레드에 보완 근거를 회신해 Resolved 처리.
- 검증 증거: `tests/unit/memo-session-snap.test.ts`(후보/Scope/visibility/클라이언트 비영속/Generated·RENDER 이동·회전·Undo/Redo·삭제/복구/S6), `tests/e2e/issue82-cad-memo.spec.ts`의 M3 E2E 신규 항목(실 Viewer WCS 좌표 지정→스냅 상태→명시 해제), `tests/unit/memo-anchor-origin-reset.test.ts` P1 회귀 가드. 최신 HEAD CI PASS 전까지 **NOT VERIFIED**.

---

# #84 Memo M3 + #167 Scene S6 — 설계·구현 계약 (2026-10-31)

## 근거 및 개발 순서
AGENTS.md, out/{Architecture,Decisions,Database,Operation,TestPlan,TestReport,FailureLedger}.md, #160/#84/#167/#96/#98/#83/#172. 루트 DESIGN.md는 실제로 없으므로 Architecture/Decisions를 공식 설계 출처로 사용한다. 동일 PR에서 **#84를 먼저, #167을 다음**에 구현한다. v0.47.2 후보이며 운영 DB·CAD·S3/Volume·GHCR 조작은 하지 않는다.

## M3 자유 메모 → 객체 연결
- 기존 CadMemo는 Version/SHA/UUID/작성자/World WCS와 CAS를 유지한다. 별도 CadMemoAnchor(메모 FK, Version/SHA, ATTACHED/BROKEN_ANCHOR, targetOrigin+targetId, local X/Y)가 신설되고, 없는 행은 FREE다.
- G7 ACTIVE+Site grant+작성자 본인만 attach/detach한다(미승인 #172 교차 수정 우회 금지). 대상 APP_CREATED는 서버 CadOutline UUID + 같은 Version/SHA/현재 Scene Revision. SOURCE는 과거 서버가 원본 DXF/Handle/canonical 검증한 SOURCE_CANONICAL 외곽선의 sourceRef 목록과 일치해야 한다. 브라우저 임시 local-N·무검증 렌더ID·위조 sourceRef는 차단한다.
- APP_CREATED 연결 시 현재 World WCS에 target inverse-affine을 적용하여 LOCAL WCS를 계산, 대상 이동/회전 시 **같은 local**에 새 affine을 적용하여 World를 재계산한다(누적 drift 방지). 기존 CadOutline PATCH/DELETE+종속 Memo world 수정/Anchor BROKEN+Audit는 단일 SQLite transaction. 대상 삭제 때 마지막 World는 보존하고 연결만 끊는다. Client GET은 Memo 안에 자유/연결/파손 상태를 포함한다.
- 자유 위치 입력은 명시적 이동으로 간주해 붙은 타깃을 트랜잭션 안에서 detach한다. 메모 제목/본문 수정은 앵커를 변경하지 않는다. 임시 Generated에 대한 스냅은 서버 영속으로 속이지 않는다.
- 연결 UI는 기존 MemoEditor 패널(#138), 해당 Version 서버 Outline 목록에서 명시 대상 선택. SOURCE 렌더러 세션 이동은 **서버 영속 Scene 변환이 아니므로** 원격 Anchor 자동 업데이트를 보장하지 않는다. 이전 초기 구현 시 자동 세션 스냅과 임시 Generated 동기화는 누락됐으나, 위 후속 보완으로 브라우저 내 자동 스냅·연동을 구현했다. 실 현장 2PC·비영속 Scene 서버 복원은 별개다.

## S6 두 Origin별 초기화
- 작업 메뉴(#127): (A) 'DXF 기반 객체만 초기화 (자체 생성 유지)'와 (B) '전체 객체 초기화 (자체 생성 포함)'. 두 명령 모두 Version, 원본 작업/영속 외곽선/메모 개수, 데이터 영향 안내를 포함한 사용자의 명시 확인 후 실행. 지원 Renderer=READY three-dxf-viewer.
- **A Source-only:** immutable READY Scene Asset은 수정하지 않는다. SceneWorkDocument의 DXF_IMPORTED delta/visibility/Undo/Redo/선택을 제거하고 최초 Scene 기준으로 복원. APP_CREATED의 브라우저 GeneratedDocument 및 영속 CadOutline과 FREE Memo는 보존한다. G7 ACTIVE에서는 SOURCE에 연결된 Memo를 BROKEN_ANCHOR로 바꾸되 마지막 WCS를 보존하고 각 Memo revision/Audit 기록. Owner 아닌 Memo가 포함되면 전체 거절.
- **B All:** G7 ACTIVE에서 서버가 expectedSceneRevision, 정확한 모든 live Outline/Memo ID+revision snapshot, Version/SHA/Role/Site/Memo owner를 검증하고 한 writeTransaction에서 **soft delete만** 수행한다. 각 행의 revision과 immutable CadBusinessAudit 기록. 일부만 삭제, 다른 Version/Site 삭제, 대상 Memo 작성자 권한 우회, 전체 초기화 중 원본 DXF/Current/SceneAsset 삭제는 불가. stale/충돌은 409, 재시도 중복 변경 불허. DB 성공 이후 클라이언트 SceneWork 및 Generated/Memo 작업을 초기화한다. 브라우저+SQLite의 분산 원자성은 주장하지 않으며 DB 완료 후 클라이언트 갱신 실패 시 재조회를 안내한다.
- G7 OFF는 공유 서버 쓰기 없이 현재 **세션 임시 데이터만** 초기화한다. G7 ACTIVE의 영속 초기화는 서버 재검증이 선행되어야 한다.

## 신규 설치와 보안
- 새로운 빈 Greenfield marker `202610310001_greenfield_anchor_baseline`, schema `G7-GREENFIELD-ANCHOR-20261031-1`에서만 CadMemoAnchor/target index/immutable trigger를 설치. 기존 business marker `202610300002_greenfield_business_baseline`과 기존 SQL fingerprint는 유지한다. 이전 볼륨 자동 Schema ALTER/Adopt/Erase, 실 운영 데이터 이관을 하지 않는다. 구 설치에서 M3 table 미존재 시 attach 503.
- App Router POST/PATCH는 기존 G7 Cookie/Origin/CSRF/Site/Memo Owner, 권한 거부 및 감사 실패 시 fail-closed. 원본은 별도 immutable. DRM H0~H3는 S8 선택적 후순위.

## 검증
- 신규 Unit: WCS 평행이동/회전/역변환, 범위/특이행렬 거절, SceneWork reset 및 불변 import ID, Reset snapshots(중복·누락·stale 거절), SQLite Anchor FK/immutable trigger. 기존 Greenfield 통합시험에서 신규 Anchor 테이블 생성 확인.
- PR CI에서 Prisma Generate/Typecheck/Lint/Unit/Integration/Next build/E2E/Docker를 실행해야 한다. 현재 코드만 작성됐으며 해당 실행 결과/현장 DXF 2PC 실증은 **NOT VERIFIED**. PR CI 시작과 성공은 다르다. 리뷰 스레드 및 Main 충돌을 확인하고 실패 원장을 유지한다.
- 잔여 #84 AC: 영속 저장되지 않은 Renderer 작업을 **영속 서버 데이터로 간주하거나** 재접속 후 자동 복원하지 않는 계약과 실제 다중 사용자/현장 수용을 별도 검증한다. 세션 한정 자동 스냅/동기화는 위에서 구현했다. #96/#113/#172, #65/#71/#73은 이 PR에서 완료 처리하지 않는다.
