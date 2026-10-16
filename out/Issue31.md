# Issue #31 — DXF 복수 선택과 볼록·정밀 외곽선 (0.27.0)

### PR #35 P1/P2 리뷰 보완 (2026-10-16)

- 기존 부분 BLOCK 감지에 추가하여 INSERT group code 66 또는 실제 이어진 ATTRIB/SEQEND를 루트에 귀속하며, 지원하지 않는 ATTRIB가 존재하면 루트 INSERT를 stable로 인정하지 않는다. group 66이 누락된 입력도 연속된 속성이 있으면 fail-closed한다.
- P4 canonical 재계산 tolerance는 **server-owned 0.02 Drawing Unit**. Client JSON에 더 큰 값이 있으면 409 거부하고 서버가 그 값을 Geometry 계산에 사용하지 않는다.
- Private 실제 DXF Browser 5회 반복 검사에서 매회 최소 선택 객체 1개(또는 `CAD_OUTLINE_ACCEPTANCE_MIN_SELECTED`의 운영자 기준)가 없으면 테스트 **FAIL**. 도면 렌더 표시 성공만으로 수용하지 않는다.
- 수정 후 PR CI 통과/실도면 운영 수용/IdP 승인 등은 여전히 미확인.


## v0.28.3 잔여 수용 개발 및 미충족 조건 (2026-10-16, 신규 CI 전)

### P0 데이터 충실도 fail-closed
- `outline-geometry.ts`의 BLOCK/INSERT 재귀는 미지원 HATCH/3D 등의 자식이 포함될 때 일부 경로를 계산해도 해당 INSERT를 **unstable**로 표시한다. 렌더↔원본 매핑의 `render-coverage`는 stable=false를 선택 불가로 판단한다. 외곽선이 눈에 보이는 일부분의 잘못된 기하만 대표하는 문제를 방지한다.
- 아주 큰 CIRCLE/ARC의 허용오차 0.02 Drawing Unit을 512 샘플로 만족할 수 없으면 거부·경고한다. 이전 코드의 silent cap은 허용오차를 지키지 못하면서 정상 경계를 반환할 위험이 있었다. `TC-OUT-ID-PARTIAL-BLOCK` 및 `TC-OUT-GEO1-LARGE-CURVE` Unit 추가.

### P4 코드 수준의 원본 무결성 검증 (DB/Write API 미승인)
- `server/outline/attestation.ts`: 향후 권한이 부여된 저장 서비스는 최종 등록된 도면 bytes를 읽고 **실제 SHA-256 일치 확인** → 기존 `parseOutlineExport`의 Version/SHA/Stable Handle/Polygon 검증 → 서버가 원본으로 Source Geometry Index 생성 → SELECT된 고유 Handle의 canonical Convex/Precise geometry 재계산 → client JSON과 symmetric-difference 면적 비교 → **클라이언트 JSON을 믿지 않고 재계산한 서버 Geometry만 사용**.
- SHA, Version, 단위, 존재하지 않는 Handle, 변조된 좌표, 미지원 도형은 각각 오류로 거부하며 Unit `TC-OUT-CANON-001..004`을 추가. 이 함수는 **인증/인가·Storage·Migration/API를 수행하지 않는다**. 안전 정책 승인 없이 Server Write API를 열지 않는다.

### P5 현장 브라우저 반복 검증
- CI synthetic 1k 단일 smoke를 **1k/10k/100k** source parse/index/query/Convex benchmark로 확대. 결과는 실제 CI Run 로그로 확인한 뒤만 PASS 기록.
- `src/playwright.outline-acceptance.config.ts`/ `tests/e2e/outline.acceptance.ts`: 별도 *사내 전용* 테스트에서 승인된 `CAD_OUTLINE_ACCEPTANCE_DXF`(공개 CI에는 미제공) 한 건을 격리된 DB에 업로드, 실제 three-dxf-viewer 로드·렌더 매핑·선택 및 오류를 다섯 번 반복 관측하여 p50/p95, Browser heap(지원 시), 인덱스·감사 시간·선택/제외 건수를 출력 없이 승인된 JSON 파일 경로에만 저장. `--report`/환경변수 값에는 파일 경로/레이어명/원본 포함 금지. 기본 E2E에는 자동 포함되지 않는다.
- 실설비 도면 **최소 3종**, 원본 CAD 기준점/기하 면적, BLOCK·OCS·곡선, 실제 사용자 환경의 GPU/Worker·메모리·선택 정확도, 1k/10k/100k 실측/목표치가 사용자에게서 제공되지 않았으므로 **최종 P0/P5 운영 수용 불가**.

### P4 운영 정책에 필요한 Owner 선택
- 기본 권장 **사내 OIDC 서명 JWT + Viewer/Editor/Admin RBAC + Site/Version Scope + HTTPS Secure/HttpOnly 세션 + Origin/CSRF·감사**; 내부 IdP가 없으면 별도 로컬 로그인/세션. **Identity Provider/계정/역할·scope·감사 보존 기간 등 Owner 결정 부재**.
- 권한 정책 승인 후 별도 변경으로 additive DB `CadOutline`, Server 원본 DXF 재계산 기반 CRUD, revision CAS/409, Version Delete FK, 로그인/권한 테스트, 재진입 Overlay 복원/운영 수용을 적용한다. 기존 삭제용 비밀번호를 외곽선 편집 인증에 사용하지 않는다.
- 현재 `Issue #31`은 OPEN 유지. 이 단계의 순수 검증/오프라인 시험 코드가 완료돼도 영구 저장/실도면 수용은 미완료.


## 2026-10-16 후속 0.28.2 — Production ESM·실도면 수용 작업 (CI 대기)

- **발견**: Main CI [#38894507390](https://github.com/planner77/layoutManager/actions/runs/38894507390) Docker Build에 `Attempted import error: 'union' is not exported from 'polygon-clipping'` 경고가 있었으나 exit 0으로 GHCR `0.28.1`/migrate를 게시. `polygon-clipping@0.15.7`의 TypeScript `d.ts`는 named `union`이지만 ESM dist는 `export {index as default}`, CJS는 `module.exports = index`이다.
- **조치**: `outline-compute.ts`에서 default import의 `.union` 호출. `scripts/build-diagnostics.mjs`와 `scripts/run.mjs`는 import/export 불일치 Webpack 경고가 있으면 Next build exit 0이라도 실패 처리한다. stdout/stderr의 마지막 chunk까지 수집하고 PR/Docker 빌드에 모두 적용.
- **증거 추가**: default ESM export/실제 Union 면적/오류 분류 Unit `TC-OUT-EXPORT-001~003`; Production Playwright는 PRECISE Worker 임시 확정 후 JSON 다운로드로 닫힌 좌표·면적 10,000 WCS²·SHA·Version/Handle을 검증. PR CI synthetic 1k Parser/Spatial/Convex smoke 추가. **해당 신규 PR CI가 완료되기 전 PASS 주장 금지**.
- **P0/P5 도구**: `npm run audit:outline -- --file /private/sample.dxf`는 현장 로컬 UTF-8 ASCII DXF를 서버 업로드 없이 분석하여 source hash, INSUNITS, Entity/Handle 수·미지원 오류 범주, Parse/Spatial Build/100회 동일 범위 조회 CPU p50/p95 및 heap/RSS 차이를 로컬 JSON으로 생성한다. 파일 경로/Layer 이름/원본은 출력하지 않는다. 하지만 실제 CAD 원본은 대화에 제공되지 않았으므로 실행 실측값, Three.js 1:N Renderer mapping, Worker/GPU·클릭 지연 **미검증**.
- **P4 보류**: 인증/역할/Version Scope·감사 정책 Owner 확정 필요. 신규 CadOutline 쓰기 API/Prisma migration은 구현하지 않았고 기존 삭제용 비밀번호를 인증으로 사용하지 않는다. 승인 후 server canonical reparse+recompute, revision CAS 409, Server CRUD·재진입·삭제 정합성을 구현해야 한다.
- **이슈 상태**: 이번 PR은 `Refs #31`만 연결하며 원 이슈는 계속 OPEN. Main CI/GHCR 성공과 실서비스 배포·현장 수용은 별개.


### PR #33 P2 리뷰 후속 보완

동일 Handle의 일부 Three render fragment가 Layer 정보가 없거나 Type/Layer 정보가 서로 다르면 정상 조각만 골라 허용하지 않고 **Handle 전체를 불일치로 판정**한다. 누락 Layer/혼합 Type을 다루는 `TC-OUT-MAP-005` 회귀 Unit을 추가했다. 브라우저 실도면 평가 전 안전한 제외 정책을 유지한다.



## 2026-10-16 — 잔여 P0/P5·P4 안전 선행 개발 (0.28.1 / PR CI 전)

### P0: 원본 ↔ 렌더 객체 정합성 강화
- `render-coverage.ts`: 원본 DXF의 top-level Handle/Entity type/Layer/WCS XY Bounds와 실제 `Object3D.userData.entity`의 world bounds를 대조. 한 Entity가 여러 객체로 분할된 경우(1:N)는 Bounds를 Union한 뒤 비교한다. Render object와 일치하지 않거나 Handle이 없으면 객체를 **선택 대상에서 제외**하고 제외 수를 UI에 표시한다. BLOCK 내부 Child와 개별 renderer element를 영속 EntityRef로 추정하지 않는다.
- `selection-spatial-index.ts`: 2D 균일 grid 기반 범위 후보 필터(최대 128²), 커다란 도형은 별도 overflow(최대 64 tiles/Entity)를 사용한다. 넓은 영역은 bounded linear fallback. 실제 선택 여부는 기존 선분 거리 및 완전 포함/교차 판정에서 결정한다.
- 원본 Worker index / Render 대조 / SpatialIndex 생성 경과 시간(ms)을 Viewer에 표시한다. 합성 DXF E2E는 선택 가능한 1개 도형의 매핑 제외 0을 확인한다.
- upstream `three-dxf-viewer@1.0.44`는 Block 내부 geometry를 merge할 수 있고 `userData.entity` 또는 grouped child를 제공한다. Source/Renderer의 직접 ID 재사용은 검증되지 않았으므로 직접 Map 기반 정합성 검사를 유지한다. 실제 공장 도면의 복합 BLOCK/비표준 OCS·3D WCS/단위 정확도는 여전히 **미검증**.

### P5: 실행 가능한 계측 수단
- `cd src && npm run test:outline-benchmark`: 합성 DXF LINE **1k/10k/100k**를 생성하여 Source parser, 공간 인덱스 구성, 범위 선택 후보, Convex subset 계산 시간·대략적 JS heap 변화·원본 byte 수·환경을 **JSON stdout**으로 출력. `npm run test:outline-benchmark -- --quick`: 1k만. 기본 PR CI에는 무거운 벤치를 추가하지 않고 명시적 수동 성능시험으로 분리한다.
- `src/tests/unit/outline-mapping-spatial.test.ts`: 1:N render mapping, mismatch 차단, 1k brute force 검색 동등성, 큰 도형 Overflow 검증. **실측 수치를 만들었다거나 100k 실제 도면의 원활한 렌더링이 입증되었다고 주장하지 않는다.**
- 최종 수용은 사용 권한을 가진 DXF 3종 이상에서 전체 로딩·Worker 전달·GPU/브라우저 heap·선택 p50/p95, 정확한 면적/거리/WCS 좌표/INSERT instance, 1k/10k/100k 부하를 여러 차례 반복·기록해야 한다. 실제 CAD 원본 및 경로를 Git에 올리지 않는다.

### P4: Owner 권한 정책 결정 대기
- `domain/outline-draft.ts`는 브라우저 JSON의 versionId, sourceSha256, coordinateSystem, 안정적 Handle, kind, algorithm, 유한·폐합 Polygon 좌표 및 한도를 **읽기 전용 순수 함수**로 검증한다. 다른 Version·TEMP EntityRef·중복/불안정 좌표는 거부. 단, JSON 검증이 성공하더라도 **Server가 원본 파일과 canonical geometry를 재검증하지 않으면 서버 저장 데이터로 신뢰할 수 없다.**
- 권장안: **OIDC 서명 검증(JWT issuer/audience/JWKS)+Reader/Editor/Admin RBAC+Version/사업장 Scope+CSRF/감사**. 사내 IdP가 없다면 **별도 App 로컬 로그인·HTTP-only 세션** 방식이 대안. 공유 비밀번호, 도면 삭제 비밀번호, IP 제한, 서명 없는 프록시 `X-User` 헤더는 영속 편집 권한 수단으로 선택하지 않는다.
- 정책 승인 후 `CadOutline` DB additive migration, Version+SHA FK, CRUD, 수정 충돌 409/revision, 감사·인증 실패, Source 재계산, Version 삭제 정합성과 재진입 복원을 구현한다. 현재는 **쓰기 API와 DB migration을 만들지 않음**.
- 구체 Schema 제안: `out/Database.md`. P4 권한 방식·적용 범위에 대한 Owner 결정이 남아 있다.

**상태:** 코드/Unit/E2E·성능 도구 작성, 새 PR CI·독립 QA·실제 CAD 평가 전. Issue #31 Open 유지; P0/P5 실증과 P4 인증·영구 저장 수용 전 종료 불가.



상태: **구현 브랜치의 실험적 P0~P3 부분 구현, 새 CI/독립 QA/실도면 검증 전**. 이 문서는 적용 범위와 미구현 조건을 명시한다. P4 서버 영속화는 Owner의 권한 정책 결정 전 **구현하지 않는다**. P5 실제 대형 도면 수용도 아직 수행하지 않았다.

## 범위/사용 절차

- `three-dxf-viewer` 및 **ASCII DXF**에서만 도구가 표시된다. 탐색/선택 모드를 명시적으로 전환한다. 선택 모드에서 클릭 1개, Ctrl/⌘+클릭 토글, 왼쪽→오른쪽 드래그 완전 포함, 오른쪽→왼쪽 드래그 교차, Space+드래그 일시 Pan, 휠 Zoom, Esc 드래그·선택 취소를 지원한다.
- 선택 객체 수·레이어 및 안정 Handle 여부를 표시하고 숨김 레이어의 선택을 거부하며 이미 선택한 객체도 제거한다. 원본 geometry와 분리된 Scene Overlay: 노랑 선택 / 청록 미리보기 / 주황 임시 확정. 외곽선은 레이어 필터와 무관한 독립 결과다. 미리보기는 선택이 바뀌면 이전 Worker를 종료하고 재계산한다.
- `볼록 외곽선 미리보기`는 비유한·중복 점을 제거한 Monotone Chain을 사용한다. `정밀 외곽선 미리보기`는 면적이 있는 2D 폐곡선 및 실제 연결된 LINE/ARC에서만 polygon-clipping의 Union을 사용한다. 중첩 고리는 even-odd로 Hole/Island를 해석하고 외부 중첩 도형은 Polygon Union, 분리된 도형은 MultiPolygon이다. 스스로 교차하거나 열린 선분은 경고하거나 계산을 거부하며 볼록 경계로 몰래 대체하지 않는다.
- 결과를 명시적으로 `임시 확정`한 후 `JSON 내보내기`로 내려받는다. JSON에는 schemaVersion, versionId, sourceSha256, DXF WCS XY, INSUNITS, kind, algorithm, geometry 및 sourceEntityIds와 `persistable` 플래그를 남긴다. **서버 저장/불러오기/복원/CRUD/수정/undo는 없다**. Renderer 변경·reload·Version 변경 시 임시 확정 결과와 Selection이 소멸한다. JSON을 운영 DB에 자동 Import하지 않는다.

## P0 계약과 실제 검증 한계

| 대상 | 이번 단계 처리/한계 |
| --- | --- |
| Source binding | DB의 CadFileVersion.sha256을 버전 Viewer에 전달; EntityRef=`versionId:sourceSha256:handle`(유일/정상 handle인 경우에만 stable). Handle 중복/누락·SHA 부재는 선택 시 TEMP id이며 `persistable=false`. 다른 Version에 참조 재바인딩하지 않음 |
| 원본 좌표 | 직접 읽은 ASCII DXF 그룹 코드 10/20, 11/21 등에서 WCS XY 생성. LINE/LWPOLYLINE/2D POLYLINE/CIRCLE/ARC 샘플링, 평면 기본 OCS만 지원. $INSUNITS 0/누락 시 단위 미상 |
| BLOCK | BLOCK base, 재귀적 일반 INSERT의 이동·회전·비균일 Scale을 합성. INSERT는 기본 인스턴스 한 개로 선택. 배열 INSERT, 순환, 비표준 Extrusion 등은 제외/경고 |
| 라이브러리 매핑 | `three-dxf-viewer.lastDXF` 및 Object3D userData가 제공하는 렌더 결과를 그대로 사용하면서 원본을 별도로 Geometry Index한다. Material/Screen Bound는 영속 ID로 사용하지 않음. **실제 설비 DXF에서 Render Object↔Source Entity 1:N/N:1·복합 BLOCK/OCS 정확도는 검증되지 않음** |
| 미지원 | LWPOLYLINE Bulge, 미검증 SPLINE/HATCH/ELLIPSE/DIMENSION, TEXT/MTEXT, 3D SOLID 및 3D/비표준 OCS, MINSERT, DWG·dxf-viewer 객체 선택. 임의 Gap/Concave Hull 추정 연결도 미구현 |
| 오차/계측 | 커브 샘플링 chord sagitta 목표 0.02 drawing unit, 원·원호당 최대 512 분할. 기하 연결 허용 오차 0.02 drawing unit, 선택 판정 7 screen px 및 드래그 임계값 5 px. 단위 미상 도면에서 0.02는 검증된 물리 오차가 아님. 30초 Worker 제한, 10k 선택/100k 좌표 제한 |
| 원본 무결성 | DXF 원본/Prisma Schema/DB/API 쓰기는 변경하지 않음. Source SHA 및 버전 정보는 읽기만 수행. 브라우저 임시 결과만 생성 |

**기술적 후속 검증:** 원본 DXF 재파싱을 최소화하려면 `lastDXF`의 엔터티 배열과 Three Object.userData의 Handle/Instance 계보, OCS/WCS 이동 규칙을 실제 버전별로 대조해야 한다. 정확한 1:N/N:1 매핑이 입증될 때 Source 인덱스를 Viewer parse result와 공유할 수 있다. 현재 직접 인덱스는 P0 검증을 시작하기 위한 방어적 구현이며 전체 도형 지원이 아니다.

## 추적 표

| 요구/AC | 코드 | 테스트 / 아직 필요한 항목 |
| --- | --- | --- |
| SEL-001~004, AC-SEL-001~002 | `viewers/three-dxf-viewer/selection-controller.ts`, adapter, `features/cad-viewer/viewer.tsx` | `tests/e2e/issue31-outlines.spec.ts` 합성 선택/미리보기/Fullscreen/Reload; Ctrl/⌘·교차/레イヤ/ESC 추가 자동 및 실도면 확인 필요 |
| ID-001, AC-ID-001 | `viewers/core/outline-geometry.ts`, Version.sha256 | `tests/unit/outline-geometry.test.ts` 핸들 누락·중복 및 INSERT transform; 렌더링 객체 매핑 실측 필요 |
| GEO-001~005, AC-GEO-001~003 | `viewers/core/outline-geometry.ts`, `outline-compute.ts`, `outline-worker.ts` | Unit hull/오목 L/중첩/홀/분리/열린 선분/자기교차; real DXF/경계 허용 오차 성능 별도 |
| DATA-001~003, AC-DATA-001~002 | 브라우저 메모리 + JSON export만 | DB migration/API 부재 (의도적). 정책 승인 후 AC 수행 |
| PERF-001, AC-PERF-001 | `OutlineResult.durationMs` | 1k/10k/100k 실데이터, 메모리/응답·장시간 Worker 부하 측정 **미실행** |
| REG-001, AC-REG-001 | 기존 Viewer manager/Fullscreen/Layer Adapter 경계 유지 | PR CI에서 기존 Unit/Integration/E2E/Build 동작 확인 예정 |

## 데이터 권한/후속 단계

서버 영속 `CadOutline`은 Issue #31의 P4 제안 `id,versionId,name,kind,algorithm,sourceEntities,geometry,parameters,sourceSha256,revision,timestamps`와 DB FK/CAS revision을 따른다. **삭제용 비밀번호는 다른 편집 권한을 부여하지 않는다.** 인가 주체·범위·감사·권한 모델이 Owner 승인될 때까지 API/테이블을 배포하지 않는다. P4 착수 시 `out/Database.md` 단일 근거로 schema/migration을 작성하고 보안·동시성·삭제 회귀를 필수로 한다. P5 실도면·성능·정확도 PASS 전에는 운영 수용/릴리스 완료로 판정하지 않는다.

## 2026-10-16 PR #32 CI 실패·P2 리뷰 보완

- run `38868848174`: TypeScript와 Docker smoke 성공, ESLint `prefer-const` 실패로 Unit/Build/E2E 미실행. timeout `const` 교정.
- 리뷰: 선택 중 Escape 전체화면 해제 전파, 새 Worker 전에 이전 Preview 동기 무효화, 오목 외곽선 경계 교차 후에만 Hole 판정. 기존 ESC 정책은 *선택 취소와 fullscreen 종료 동시*로 정의하고 CSS fallback E2E로 검증한다.
- 회귀: concave overlap Unit, preview invalidation·CSS fullscreen fallback Esc E2E 추가. **새 CI 결과는 아직 미확정**.

## 외부 라이브러리 선택 근거

- `polygon-clipping@0.15.7` (MIT): 공식 [Repository](https://github.com/mfogel/polygon-clipping), [API/Geometry 제한](https://github.com/mfogel/polygon-clipping#readme). Union 결과는 MultiPolygon, hole ring 포함. 유효하지 않은 DXF input은 Worker 이전/Worker 내부에서 막으며 결과 실패를 가리지 않는다. 수치적으로 매우 복잡한 폴리곤 및 중첩 수치 불안정은 실도면 검증 대상이다.
- `three-dxf-viewer@1.0.44`의 DXFViewer/lastDXF와 THREE Scene을 재사용하며 외부 소스는 수정하지 않는다. 단순 geometry index와 GPU Overlay만 Adapter에 추가한다.
