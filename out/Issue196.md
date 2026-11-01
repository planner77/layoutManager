# Issue #196 — 의미론적 구역: 설계·구현 계약

- 원 요구: [GitHub #196](https://github.com/planner77/layoutManager/issues/196). 기준 Main `2bccf90`, 2026-11-01.
- 상태: **Z0–Z3 구현 및 Z4 로컬 코드·검증된 합성 범위 수용 / PR CI 시작 대상**. 이 문서는 구현 승인된 기본 정책과 수용 기준이며 실행 성공 기록이 아니다. 실제 결과는 [TestReport](TestReport.md), 실패·재시험은 [FailureLedger](FailureLedger.md)를 따른다.
- 실제 역할: gpt-6-astra Manager가 본 설계·AC를 작성하고 Root가 구현 분담·최종 commit/push를 조정한다. 구현 완료 이후 별도 QA의 실제 결과를 받아 수용 여부를 결정한다.
- 실제 설계 근거는 [Architecture](Architecture.md), [Database](Database.md), [Decisions](Decisions.md), [ViewerPanelPolicy](ViewerPanelPolicy.md)다. 루트 DESIGN.md는 없다.

## Z0 확정 결정

| 결정 | 정책과 이유 |
| --- | --- |
| ADR-Z196-01 분류 | `ZoneCategory`는 **Site 범위의 독립 카테고리**다. Global `OutlineType`을 재사용하거나 1:1 매핑하지 않는다. 승인된 Site Admin만 CRUD, Reader/Editor는 허가된 조회/선택. `categoryId=null`은 명시적 미분류이며 임의 문자열 카테고리를 받지 않는다. 초기 목록이 비어 있어도 미분류로 생성 가능하다. 이름은 trim+NFC, 비교 키는 NFC+소문자이며 Site 안에서 비활성 이름도 예약한다. 참조 중 삭제는 409, 비활성화는 기존 참조를 보존하고 신규 선택만 금지한다. |
| ADR-Z196-02 업무 식별 | `CadZone.id`는 서버 UUID, 업무 메타데이터·부모 관계는 `CadLocation.id`에 소속된다. 기존 5단계 위치 마스터에 구역을 6단계로 추가하지 않는다. 이름은 같은 층의 live Zone 전체에서 정규화 키로 유일하다. 코드·태그는 검색용이며 자동 식별자나 권한 기준이 아니다. |
| ADR-Z196-03 권한 | 같은 Site의 Editor/Admin은 타 작성자의 Zone도 공동 수정한다. 논리 삭제는 원 작성자 또는 **같은 Site Grant를 가진 Admin**에게만 허용한다. #172 Memo와 같은 명시 결정이며, 기존 Outline/Group 작성자 정책을 변경하지 않는다. 생성자·생성시각 불변, 수정자/삭제자는 실제 세션 actor다. 자식이 있는 부모 삭제는 409이며 자동 cascade/reparent는 없다. |
| ADR-Z196-04 경계 | 단일 외곽 ring의 명시적으로 닫힌 GeoJSON `Polygon`만 지원한다. Hole·MultiPolygon·자기교차·0면적·연속 중복점·비인접 반복점·3개 미만 유효 꼭짓점은 거절한다. 복합 외곽선을 첫 ring으로 조용히 줄이지 않는다. 최대 512개 유효 꼭짓점(+마지막 closure), 각 XY finite·절댓값 1e12 이하다. Bounds·면적은 서버가 다시 계산한다. |
| ADR-Z196-05 기하 오차·계층 | 부모는 사용자 지정이며 좌표 겹침으로 자동 생성하지 않는다. 포함 오차는 `ε=max(1e-7,32×Number.EPSILON×max(1,모든 비교 좌표 절댓값))` WCS 단위다. 단위가 불명확하면 mm라고 주장하지 않는다. 경계 접촉은 허용하지만 오목 부모를 가로질러 밖으로 나가는 자식 edge는 거절한다. 점만 검사하지 않고 전체 Polygon 포함을 검사한다. 형제의 양의 면적 겹침은 **경고이며 저장 허용**. 미매핑 부모/자식은 계층을 유지하되 공간 포함 미검증 표시. |
| ADR-Z196-06 버전 | `CadZoneGeometry`는 정확한 Zone+Version에 하나만 매핑하고 SHA·Scene revision을 기록한다. 새 V2에는 기존 V1 geometry를 복사하지 않는다. 메타데이터/계층은 동일 ID로 보존하고 V2는 미매핑이다. 이전 Version 매핑은 보존된다. 새 경계는 사용자 명시 저장으로만 매핑한다. |
| ADR-Z196-07 Scene | Zone은 APP_CREATED 업무 객체이나 기존 `CadOutline`이나 SceneAsset 내부 객체로 이중 영속화하지 않는다. Adapter의 Zone projection은 읽기 표현이다. Scene revision 불일치 또는 Reset으로 무효화된 geometry는 미매핑으로 표시하고 focus/overlay/Snap 대상에서 제외한다. **SOURCE_ONLY와 ALL 모두 Zone/카테고리/계층/과거 polygon을 보존하고 해당 Version의 geometry만 무효화**한다. Reset은 현재 CurrentScene revision을 증가시키지 않으므로 명시 상태 변경이 필수다. |
| ADR-Z196-08 G7/운영 | 새 API는 G7 ACTIVE에서만 제공하고 Reader 승인 조회·Editor/Admin 쓰기·Runtime Write Gate·Origin/CSRF·실 Site/Version을 매 요청 재검증한다. 기존 익명 CAD read mode를 Zone 공개 허가로 사용하지 않는다. 신규 empty Greenfield baseline만 추가하며 과거 DDL/체크섬과 기존 운영 Volume은 보존한다. 구 스키마의 Zone 기능 부재는 안전한 503이며 기존 CAD 조회는 유지한다. 운영 Auth/Writer 강제 활성화·자동 이관·실 CAD 반출은 하지 않는다. |

## 공유 DTO 및 API 계약

구현 정본은 `src/domain/cad-zone.ts`다. Root가 순수 DTO/검증기를 소유하며 Backend와 Viewer가 함께 import한다. Server-only 접근/인가를 domain 모듈에 넣지 않는다.

```ts
type ZonePoint = {x:number; y:number};
type ZonePolygon = {type:'Polygon'; coordinates:[number,number][][]};
type ZoneReference = {label:string; kind:'EQUIPMENT'|'PROCESS'|'SYSTEM'|'DOCUMENT'|'OTHER'; value:string; url?:string};
type ZoneMetadata = {name:string; categoryId:string|null; description:string; code:string;
  tags:string[]; sortOrder:number; parentZoneId:string|null; references:ZoneReference[]};
type ZoneGeometryDto = {versionId:string; sourceSha256:string; sceneRevision:number;
  polygon:ZonePolygon; state:'MAPPED'|'UNMAPPED'; revision:number;
  bounds:{minX:number;minY:number;maxX:number;maxY:number}; area:number; reason?:string};
type CadZoneDto = ZoneMetadata & {id:string; locationId:string; siteId:string; revision:number;
  createdById:string; updatedById:string; createdAt:string; updatedAt:string;
  geometry:ZoneGeometryDto|null};
type ZoneCategoryDto = {id:string; name:string; revision:number; active:boolean; sortOrder:number};
type ZoneListDto = {zones:CadZoneDto[]; categories:ZoneCategoryDto[];
  actorId:string; canEdit:boolean; canDeleteAny:boolean; canManageCategories:boolean;
  versionId:string; locationId:string; siteId:string; sourceSha256:string; sceneRevision:number|null};
```

`geometry=null`은 선택 Version에 매핑이 없음을 뜻한다. `UNMAPPED`의 polygon은 과거 기록일 뿐이며 표시·focus에 사용할 수 없다. 읽기 시 정확 Version/SHA/Scene과 저장된 유효 상태를 모두 만족해야 `MAPPED`다. `canEdit` 등은 UI 표시 힌트이며 서버 인가를 대신하지 않는다.

- `GET/POST /api/cad-files/[versionId]/zones`; `PATCH/DELETE /api/cad-files/[versionId]/zones/[zoneId]`.
- `GET/POST /api/cad-files/[versionId]/zone-categories`; `PATCH/DELETE .../zone-categories/[categoryId]`. Version으로 실제 Site를 resolve하며 client가 Site를 바꾸지 못한다.
- POST: 전체 `ZoneMetadata` + 선택 `geometry:{sourceSha256,sceneRevision,polygon}`, UUID `Idempotency-Key` header. Geometry 없는 업무 객체 생성도 허용하며 Viewer는 미매핑 상태를 분명히 표시한다.
- PATCH: `expectedRevision` + 전체 metadata + 선택 geometry. geometry 생략은 기존 mapping 보존이며 폐기/복사 명령이 아니다. DELETE: `expectedRevision`만. 카테고리 변경도 expectedRevision CAS.
- metadata-only 변경에는 Scene 준비를 요구하지 않지만 실제 G7/Version/층/카테고리/부모/Zone CAS를 재검증한다. Geometry 쓰기는 exact SHA+현재 Scene revision이 필수다.
- 같은 actor/Version/Idempotency-Key+정규화 payload 재시도는 같은 서버 Zone ID, 다른 payload는 409. receipt·Zone·geometry·Audit를 한 transaction으로 저장한다. 멱등 재시도에서도 현재 인가를 검사한다.
- Pure exports: `normalizeZoneMetadata`, `validateZonePolygon` → `{polygon,bounds,area}`, `zoneContainsPolygon`, `zonesOverlap`, `assertZoneParent`, `closeZonePoints`.
- 이름/코드/태그/참조는 plain text. 설명은 다중행 plain text. 참조 URL은 HTTP/HTTPS만, username/password 있는 credential URL·제어문자·스크립트 scheme 거절; 렌더는 React text + `rel="noopener noreferrer"`. 최초 정책은 URL query/fragment도 거절한다. URL의 token·fragment 비밀정보를 공유 참조에 저장하지 않기 위한 제한이며 해당 링크는 안전한 base URL과 별도 plain-text 참조값으로 입력한다. URL 서버 fetch/외부 전송은 없다. 사용자 참조/설명 전문을 Audit/오류 로그에 복제하지 않는다. 실제 입력 길이/개수 한도는 공유 검증기의 단일 상수로 제한하고 경계 Unit을 작성한다.

## 책임 분리와 쓰기 정합성

- Backend: Zone service/repository가 G7 guard→Version/Location/Site→Schema→CAS→검증→쓰기/Audit를 한 거래에서 처리한다. 계층 parent 변경은 현재 그래프 전체를 재검증해 self/cycle/삭제 부모/타 층·Site를 차단한다. SQLite 직렬 transaction 및 FK가 동시 A→B/B→A의 순환을 막는다.
- 부모 변경은 같은 Version에 양쪽 유효 geometry가 있는 모든 mapping을 검사한다. 부모 경계 축소는 기존 자식 모두, 자식 경계 변경은 기존 부모를 검증한다. 미매핑 때문에 건너뛴 포함 검사는 후속 명시 재매핑 시 다시 필수다.
- Zone revision은 metadata/geometry 변경·Reset 무효화 때 증가한다. geometry revision도 갱신해 stale 표시/쓰기를 차단한다. 실패는 Audit까지 rollback하며 soft-delete 이후 metadata/geometry 일반 수정은 거절한다. 참조 중 카테고리/부모의 물리 삭제·연쇄 삭제는 없다.
- `resetBusinessVersion`의 기존 Outline/Memo CAS·권한·Audit를 보존한다. Zone invalidation을 동일 거래에 넣고 실패 시 전부 rollback한다. Source SHA, CurrentScene pointer, Location Current, SceneAsset, 원본 bytes는 변경하지 않는다. Reset 뒤 과거 클라이언트 PATCH는 Zone revision 충돌이다.
- Geometry는 입력된 WCS 경계이며 Snap target/Source Handle을 영속 신뢰 관계로 저장하지 않는다. 클라이언트가 위조 target ID를 보내 geometry의 권위나 Source mutation 권한을 얻을 수 없다. source refs를 신뢰하는 별도 Anchor API를 만들지 않는다.
- 신규 Schema/DDL·FK/trigger/baseline 상세의 단일 기준은 [Database](Database.md)다.

## Viewer 입력·탐색 계약

- `작업 > 구역 생성`, `작업 > 구역 목록`과 기존 `MovableViewerPanel`을 사용한다. 생성은 DXF+three-dxf-viewer+source ready+Scene ready+실 `canEdit`에서만 가능하고 이유를 제공한다. dxf-viewer fallback/DWG/G7 OFF는 생성/수정 불가. 승인된 metadata 조회는 renderer와 독립이며 지원되지 않는 focus는 안내한다.
- 그리기는 자유 WCS 클릭·XY 수치 입력·ENDPOINT/VERTEX 후보 선택을 지원한다. `manager.getMemoSnapTargets`, `clientToWcs`, `projectWcsToCanvas` 및 기존 `collectMemoSnapCandidates`의 scope/visibility/중복 ID 배제를 재사용한다. **MemoSessionSnapStore/Anchor 권한·영속화는 재사용하지 않는다.**
- 후보는 12 CSS px 기본, 기존 20k scan/100 후보 상한과 limited 안내를 유지한다. INTERSECTION은 최초 버전에서 미지원으로 명시한다(신뢰 가능한 선분 교차 추출이 아직 없으며 근사 교차점을 사실로 저장하지 않음). 자유 입력은 항상 제공한다. 후보 선택 직후 현재 Scope/epoch/가시성/ID 유일성을 재확인한다.
- Preview·선택 꼭짓점 수치 이동(포인터 드래그 이동은 최초 버전 미지원)·마지막 점 취소·명시 close·저장·취소. 기존 검증된 단일 Polygon 외곽선 선택을 복사해 시작할 수 있고 이후 Zone ID·메타데이터는 독립이다. 모드 진입 시 Outline 선택/메모 placement와 포인터 소유권을 배타적으로 조정한다. Space Pan/Zoom·취소는 기존 메뉴/모달 우선순위를 유지한다.
- 트리는 층→root Zone→자식, parentId 기반으로 구성하며 정렬은 sortOrder→name→id. 검색은 이름/코드/참조 및 카테고리, 결과 조상을 포함한다. 전체 펼치기/접기·개별/하위 그룹 Show/Hide는 Viewer 세션 상태이며 DB write가 아니다.
- 단일 클릭은 상세 선택/강조만, 더블클릭 또는 Enter는 유효 geometry bounds를 `manager.focusBounds`에 전달한다. chevron은 확장만. Hidden 구역 focus는 명시적으로 표시 후 강조하되 형상이 미매핑/퇴화면 이동하지 않는다. 부모 focus는 부모 자신의 bounds다.
- ARIA tree·방향키/Home/End/Enter, 패널 닫기 후 메뉴 포커스 복귀. Desktop 이동/동일 세션 위치 복원, 320/375px 단일 Drawer/ESC/중첩 모달/Fullscreen 규칙은 공통 정책 그대로다. 패널 open/close/drag는 Canvas·Manager·Source GET/Parse/Worker lifetime을 바꾸지 않는다.
- fetch 응답은 요청 generation+Version/actor에 귀속하고 stale response를 버린다. 401/403/Scope 변경은 보호 Zone 데이터·선택·preview를 비운다. 409는 draft를 보존하고 재조회/사용자 재적용으로 해결하며 자동 덮어쓰기하지 않는다.

## 요구사항→AC→시험 추적

| 요구사항 | AC / 신규 시험 | 합성 수용 내용 |
| --- | --- | --- |
| FR-ZONE-01 | AC01 / TC-Z196-01 | Snap+자유점 혼합 2구역, 12px zoom/DPR/WCS, hidden/stale/duplicate/NaN 후보 배제, preview/edit/undo-last/close/cancel/Outline 초기값. Hole/Multi/open/self-intersection/0area/상한 거절. |
| FR-ZONE-02 | AC02 / TC-Z196-02 | 동일 ID·metadata·복수 참조·카테고리·polygon 재접속 복원, 공동 수정/작성자·Admin 삭제, CAS 409, 멱등 등록 및 실패 rollback/Audit. URL/XSS/credential 거절. |
| FR-ZONE-03 | AC03 / TC-Z196-03 | 3단계 root/child/grandchild, 카테고리·텍스트 검색/조상·정렬/Show-Hide, self/cycle/cross-floor/deleted parent, concave-parent edge 이탈·축소·정확 epsilon·형제 겹침 경고. 부모 삭제409·category 참조 보존. |
| FR-ZONE-03 | AC04 / TC-Z196-04 | click 무이동, doubleclick/Enter 정확 center/bounds, hidden 표시/focus, null/UNMAPPED 무이동, fallback/Renderer 전환 안전. |
| FR-ZONE-04 | AC05 / TC-Z196-05 | V1→V2 Current 변경, 같은 Zone ID/계층/메타데이터 보존·V2 미매핑·V1 보존·명시 V2 mapping. Scene revision 불일치 및 두 Reset mode의 geometry 무효화, stale PATCH409, 원본/Current 불변. |
| FR-ZONE-05 | AC06 / TC-Z196-06 | 실제 signed G7 Reader/Editor/Admin+Site, revoke/expire/OFF/CSRF/Origin, forged actor/Source/Scene, 타 Site read/write·Admin 무Grant 차단, 거래 audit 실패 rollback, FK/Unique/immutable/soft delete·historical baseline 호환. |
| FR-ZONE-03/05 | AC07 / TC-Z196-07 | panel 반복 open/close/drag·320/375/desktop/fullscreen·keyboard/ESC·Outline/Memo/Layer 회귀; Canvas identity·Source GET/parse 횟수 불변. |
| 전체 | AC08 / TC-Z196-08 | Typecheck/Lint/Unit·Integration/Build 및 필요한 General/G7/Greenfield/Legacy Browser·Docker 새 baseline 검증. 정확 HEAD/Run/Job별 실제 결과만 TestReport 기록. |

**현장 수용은 별도다.** 위 synthetic DXF/G7 disposable DB 테스트가 통과해도 #113/#193의 실제 현장 DXF/GPU/2PC·운영 backup/restore·SLA를 PASS로 바꾸지 않는다. PR CI는 요청에 따라 시작까지만 수행하고 완료 모니터링하지 않는다. 새 HEAD CI 성공·현장·GHCR·병합·Issue 종료는 관측/승인 없는 완료 주장 금지다.
