## 2026-11-03 — Manager 최종 판정: fidelity 보완 PR 수용, A2/P1-B NO-GO

**구현 보완 PR은 ACCEPT다.** Manager는 동결 소스 검토, 독립 QA 보고 및 정확 packaged-image 증거를 검토했으며 추가 재작업 요구는 없다. 후보 제품0.59.0의 CUSTOM_DTO v2는 material side 손실4개·ShapeGeometry 클래스 손실2개를 제거하고, 실제 ShapeGeometry/clone·전체 raw buffers/재질/변환/문자 동등성과 원본 선택 snapshot 복원을 검증했다. 동일 합성 원본의 live/fresh source index는 READY·mapped3/render10, text4이며 실제 Canvas 선택/PRECISE 외곽선, Layer, Translate/Rotate 중 source 차단·Undo/reset, fresh source GET/parser/font/index Worker0도 통과했다. **원본 전체 Entity 매핑은 여전히 PARTIAL**이며3/10을 전체 source 지원으로 해석하지 않는다. Legacy v1은 immutable bytes/Scene identity를 유지하며 fidelity UNKNOWN·재생성 필요로 구분한다.

독립 QA의 typecheck/build/lint(0errors·기존8warnings), focused20·process/profile5·parity2가 통과했고 root 전체151files/988tests 및 G7 호환24tests도 통과했다. 최초 QA parity의 동시 Build/font rewrite 경합 실패와 순차 재시험 성공은 [FailureLedger](FailureLedger.md)에 보존한다. 실제 Dockerfile 최종 이미지 `sha256:848e905bdeb5a851310950c8a6f66f0ff110dfb3ab36eaf39fe1e55353d732dd`는 변경 소스31개 hash 일치, 독립 새 컨테이너 P05/A24/parity2 총11시험 PASS(exit0/OOMfalse/PID0)다. Manager가 최종 process JSON을 직접 확인했다: timeout/SIGKILL/OOM/Node uncaught·unhandled/browser late error6종과 각 fresh recovery6종 PASS, OOM만 OOMKilled=true·exit137·supervisorKilled=false, 모든 recovery는 v2 full validator/readback/raw fresh restore/quiet·정상 종료를 완료했다(24nodes/21506vertices/1998797bytes). 원본 불변과 종료 후PID0를 확인했으며 이는 기존 합성 실험 launch 설정의 프로세스 증거다. 상세 실측 정본은 [TestReport](TestReport.md)다.

**운영 A2 GO 및 P1-B 착수는 NO-GO/BLOCKED다.** 최종 strict targeted-profile 보고는 실제 renderer user/PID namespace 분리·seccomp2filters/NNP1/CapEff0·no-no-sandbox/no-unsafe-SwiftShader와 v2 변환/validator/readback 성공을 확인했으나, fresh live restore는 `WEBGL_CONTEXT_UNAVAILABLE`로 실패했다. 보고서의 `RESEARCH_ONLY_NO_GO` 및 컨테이너 exit0는 **예상된 실패 경계의 검증 성공**이며 안전한 변환기 전체 성공이 아니다. 이 strict profile에서6fault/recovery는 NOT RUN이고, SwiftShader 위험·완전한 license/SBOM/공급망·고객/2PC/현장 #113/#193·source PARTIAL의 필요한 수용 및 신규 정확 PR HEAD CI가 미완료다. 회사/Owner 승인을 대신하지 않으며 원래 A2-01~06 조건을 완화하지 않는다. **#218 OPEN, P1-B/C/D 미착수·금지 유지**. Root의 후속 commit/PR 검토 범위만 수용하며 신규 CI 성공·병합·GHCR 게시·운영 배포를 이 판정으로 주장하지 않는다.

---

## 2026-11-03 — PR #222 병합 후 Scene fidelity 보완·보안 재평가 설계 (구현 전)

**상태: 설계/AC 확정, 구현·독립 QA 미실행, P1-A2 GO BLOCKED.** 사용자 승인 범위는 (1) 검증 전용 PR #222 병합 및 #218 OPEN 유지, (2) 저장/복원의 material side·실제 Geometry 의미·원본 Entity 선택 인덱스 보완, (3) Chromium 격리 개선 또는 공식 Node DXF parser 대안 평가, (4) 기존 보안/fidelity GO 조건을 충족한 뒤에만 P1-B 영속 Worker 착수다. Root가 보고한 PR #222 exact `0ade` HEAD CI #543 9/9 및 review0/conflict0, squash `2efae7631b175d25b9c4f961cc1fd0fdc23010f5` tree 동일·Issue OPEN 확인을 이 브랜치의 출발점으로 삼는다. 이 절은 기존 test-only 설계보다 최신인 **제품 계약 보완 설계**이며 아래 과거 실패/PARTIAL 결과는 역사적 증거로 보존한다. 작업 브랜치는 `feat/218-a2-fidelity-security`, 기존 source package는 0.58.1이다.

### 요구·확인된 원인과 구현 경계

- R-218-FX01: 실제 Adapter의 MeshBasicMaterial 네 slot `side=2`가 serializer의 필드 누락으로 restore 기본값 `0`이 되는 손실을 제거한다. source/candidate/fresh restore 모두 비교하며 기존 알려진 손실 보정 clone으로 새 성공을 만들지 않는다.
- R-218-FX02: 현재 CUSTOM_DTO가 geometry의 numeric buffers만 기록하고 모든 geometry를 `new BufferGeometry()`로 만들기 때문에 ShapeGeometry 두 개의 클래스/parameters가 사라진다. 실제 `ShapeGeometry`와 검증된 Shape/Path/Curve 의미를 보존한다. `geometry.type='ShapeGeometry'` 대입, prototype 교체, 클래스명만 비교하는 시험은 해결로 인정하지 않는다.
- R-218-FX03: 원본 로드의 Worker `DxfOutlineIndex`와 보수적 source↔render 대응은 현재 메모리에만 있고 직렬화 시 parser `userData.entity`가 제거된다. 범위가 제한된 명시 JSON snapshot으로 필요한 파생 정보만 저장하고 fresh `loadScene`에서 재검증한다. 원본 DXF GET/재파싱/원본 Worker 호출 없이 이전에 검증된 선택을 복구한다.
- R-218-FX04: legacy payload의 알 수 없는 fidelity를 새 계약 성공으로 승격하지 않는다. 기존 immutable Scene bytes/row/Current, 원본, APP_CREATED/Memo/Zone/Outline 참조 및 기존 source 정밀 선택의 보수적 제외 규칙을 보존한다. 인덱스 검증은 canonical source attestation이나 쓰기 인가를 대체하지 않는다.

수정 위치는 `domain/scene-payload.ts`, `scene-viewer-data.ts` 및 필요한 pure DTO validator 모듈, `viewers/three-dxf-viewer/scene-custom-dto.ts`, `scene-serialization.ts`, Adapter·render-coverage의 명시 snapshot bridge, 관련 unit/integration/browser/A2 시험이다. UI 신규 메뉴/버튼은 만들지 않고 기존 경고/선택 capability를 사용한다. DB DDL/Prisma/migration/S3 locator/SceneRepository 게시 규칙/G7 권한/업로드 Hook/영속 Worker는 이 단계에서 추가하지 않는다. Root가 package/Release registry 및 공통 추적 문서를 통합한다.

### 결정: CUSTOM_DTO payload v2, Scene identity는 보존

선택은 **CUSTOM_DTO envelope `schema:2`**의 명시 신규 계약이다. 기존 `schema:1`의 material/geometry/index 누락을 선택적 필드의 기본값으로 채워 full fidelity로 오판하는 방법은 채택하지 않는다. `CAD_SCENE_SCHEMA=1`, `SceneScope`/`sceneIdentity`/`importedId`, 기존 builder·renderer는 유지한다. 동일 parser/render 알고리즘의 직렬화 의미를 복구하는 변경이며 Scope 버전을 무조건 올리면 기존 DXF_IMPORTED id와 이를 참조하는 APP_CREATED/Memo가 달라지는 부작용이 있다. 향후 Node 대안의 실제 renderer/생성 의미가 달라지면 별도 builder/identity 변경 분석을 먼저 수행한다. 향후 P1-B의 build idempotency/cache key는 Scene identity와 별개인 CUSTOM_DTO payload 계약 버전도 포함해야 하며 scope.schema=1만 보고 legacy v1을 v2 fidelity 충족으로 재사용하지 않는다. 이는 후속 설계 요구이며 지금 Job/Worker를 구현한다는 뜻은 아니다.

- 새 serializer는 v2만 생성하며 v2에 필요한 material/geometry 계약 필드 누락·unknown key·unknown enum은 거절한다. 도메인 full validator와 Three 복원기가 같은 버전 분기를 사용하고 임의 JSON/ObjectLoader dispatch나 외부 URL을 허용하지 않는다.
- 기존 v1은 기존 strict 규칙으로 읽을 수 있다. v1은 `LEGACY_FIDELITY_UNKNOWN`/명시 재생성 필요 capability와 source 선택 불가를 반환하며 v2/full-fidelity/원본 index READY로 보고하지 않는다. 기존 서버 저장 상태 READY는 historical immutable storage 상태로 남고 **fidelity 합격과 구별**한다. v1 복원만으로 자동 재저장/Current 교체/원본 GET/재생성을 하지 않는다. 복원 제한을 기존 Viewer 경고/진단으로 표시하고 명시적인 기존 재생성 명령만 사용한다.
- v2에서 원본 Worker가 실패하면 snapshot은 명시 `UNAVAILABLE` 및 allowlisted reason이다. 렌더/텍스트 Scene 복원은 가능하지만 source-index fidelity 수용은 실패/미확인으로 남는다. snapshot 자체를 생략하고 READY처럼 보이는 방식은 금지한다. pure serializer 시험 등 원본 index가 없는 경로도 명시적인 unavailable 입력/기본 상태를 만든다.
- 제품 범위가 원본 선택 인덱스의 저장·복원 기능을 추가하므로 후보 SemVer는 **0.59.0**이다. `package.json`/lock/README/ChangeLog 일치 및 0.58.1→0.59.0 G7 `COMPATIBLE` edge를 추가하되 DB schema/baseline/checksum/data/runtime contract 동일성을 회귀 확인한다. 이는 G7 데이터 DDL 호환성 선언이지 Scene v2가 구버전 앱으로 읽힌다는 선언은 아니다. **0.58.1 앱은 v2를 거부**하므로 이전 앱으로의 임의 downgrade를 보장하지 않으며 기존 backup/restore·release 승인 규칙을 유지한다. 운영 upgrade/배포/GHCR 게시나 기존 0.58.1 tag 이동은 수행하지 않는다.

### v2 Material·Geometry 구체 계약

1. Material은 기존 type/color/opacity/transparent/linewidth/dashSize/gapSize 외에 `side`(0/1/2), `depthTest`, `depthWrite`, `alphaTest`(finite 0..1), `blending`을 필수로 기록·복원한다. blending은 지원되는 built-in enum만 허용하고 CustomBlending을 보존할 전체 방정식/인자 계약이 없으면 명시 거절한다. 새 값 없이 Three 기본값으로 조용히 대체하지 않는다. 모든 slot별 source/candidate/restore exact; side 변경을 raycast/양면 삼각형 실제 동작으로도 확인한다.
2. Geometry는 closed discriminated union `BufferGeometry | ShapeGeometry`다. 양쪽 모두 기존 typed attributes/index/groups와 `drawRange`를 보존하며 index storage의 Uint16/Uint32 의미도 검증한다. Infinity draw count는 JSON의 명시 null sentinel 하나로만 encode/decode하고 NaN/negative/fractional/out-of-range 시작/수량은 거절한다. 허용 외 geometry class는 실패한다.
3. ShapeGeometry는 실제 constructor parameters(정규화한 Shape 배열 및 holes/curveSegments)를 추가 저장한다. Shape/Path/Curve는 허용된 필요한 2D curve type의 수치 필드만 가진 closed DTO로 만들며 arbitrary `type` 문자열을 Three class lookup으로 dispatch하지 않는다. Line/QuadraticBezier/CubicBezier 등 실제 글꼴이 사용하는 유형을 명시하고 미지원은 거절한다. UUID·cached arc lengths·parser 객체·함수·원본 font/URL은 저장하지 않는다. autoClose/currentPoint 등 재구성 의미에 필요한 값은 명시 검증한다.
4. 복원은 실제 `THREE.Shape`/`Path`/허용 curve 객체와 `new THREE.ShapeGeometry(shapes,curveSegments)`로 구성한다. 검증된 원래 attributes/index/groups/drawRange를 복원하여 버퍼가 바뀌지 않게 하되 constructor identity/parameters는 실제로 유지한다. `instanceof THREE.ShapeGeometry`, clone/toJSON에 필요한 parameters, 구멍·Bezier 곡선의 재구성 및 버퍼/BB/변환 동등성을 확인한다.
5. 기존 32MiB/nodes100k/attributeScalars2M/depth128은 유지한다. Curve control-point 및 source-index 좌표의 추가 비용은 별도 숨은 무제한 배열이 되지 않게 같은 총 scalar budget에 합산한다. shape/curve/hole 개수와 curveSegments는 검증 후 constructor를 호출하며 tessellation 예상 비용도 2M 한도 내인지 사전 계산한다. 예: curveSegments는 positive safe integer 최대256, 총 예상 curve samples/생성 scalar 비용을 제한한다. 상한 안에서도 잘못된 수치/타입/외부 resource/unknown key는 거절한다.

### 원본 선택 snapshot 및 fresh restore

`viewerData.textIndex`는 보존한다. v2의 `viewerData.sourceIndex`는 `READY | UNAVAILABLE` discriminant를 갖는다. READY는 완전한 SceneScope와 정규화한 DxfOutlineIndex(`versionId/sourceSha256/unitCode/entities/warnings`), 그리고 source↔render 관측을 재구성할 mapping 목록을 갖는다. `UNAVAILABLE`는 허용된 reason code만 갖는다. 여기의 READY는 **유효한 파생 snapshot 존재**이며 모든 원본 Entity 지원/매핑 또는 서버 canonical source 보증이 아니다.

- Snapshot은 실제 source Adapter가 원본 Worker/index를 완료하고 audit한 뒤, serializer가 parser userData를 제거하기 **전에** 만든다. 후보도 같은 원본과 실제 index 추출/정규화 계약을 사용한다. `OutlineEntity`는 id/handle/entityType/layer/instancePath/stable/paths/bounds만 허용한다. 버전/SHA/전체 Scope 불일치, 중복 id, invalid boolean/enum, 비유한·과대 좌표, 뒤집힌 bounds, paths와 bounds 불일치, unknown key, 초과 개수는 거절한다. 중복/모호한 handle이 있는 기존 index는 stable:false 및 선택 제외로 보존하며 안정성을 허위 주장하는 항목을 거절한다. 기존 안정성 없는 entity의 `stable:false`를 true로 승격하지 않는다. text/index 문자열도 길이를 제한하며 경고는 제한된 안전 텍스트/코드만 저장한다.
- Mapping은 실제 source audit의 각 관측과 동일한 `sceneObjectId/handle/entityType/layer`를 담는다. Scene object ref는 같은 asset의 DXF_IMPORTED에 실제 존재해야 하며 중복/foreign id를 거절한다. stored bounds·mappedCount·selectable boolean을 권위로 신뢰하지 않는다. 필요한 layer 부재는 명시 null로만 표현하고 기존 불일치 제외 정책을 유지한다. raw `userData.entity`나 DXF BLOCK 객체를 복원하지 않는다.
- Fresh restore는 full validator→실 geometry 복원→stable scene ref로 mapping object resolve→실제 object의 world bounds 재계산→기존 `reconcileRenderCoverage`를 다시 수행한다. 새로운 parser 내부 메타데이터 대신 검증된 bridge로 audit을 수행하며 source 선택은 다시 검증된 selectable subset만 설정한다. mapping이 없는 Entity, source unstable, type/layer/WCS 불일치, merged/nested 지원 제한은 기존대로 제외한다.
- Live에서 mapped source3/render index10인 합성 기준은 restore에서도 **동일한3/10 및 제외 사유**를 보존해야 한다. 이 보완을 source semantic instances11개 전체가 매핑됐다는 주장으로 바꾸지 않는다. Source 선택/정밀 외곽선/선택 해제/Layer off-on, SceneWork 이동·회전 중 source 선택 차단 및 Undo/reset 복구, dispose/re-entry를 검증한다.
- Source snapshot은 source-derived Viewer capability이지 canonical 저장·수정의 권한 증거가 아니다. 기존 서버 source attestation/G7 Actor·Site·Session/Revision CAS는 그대로 적용한다. restore에서 source/file/font 네트워크 요청과 DXF parse/outline index Worker 호출이 각각0인지 계측한다(렌더 UI가 원래 쓰는 자산과 구별).

### 수용 기준·시험 (모두 신규 실행 전)

| AC / TC | 필수 확인 | 실패/경계 |
| --- | --- | --- |
| FX01 / TC-218-FX01 | 기존 같은 source·전체 글꼴·Scope의 live/candidate/write-read/fresh Adapter 전체 비교; 네 side slot과 두 ShapeGeometry까지 손실0 | class/side 보정 clone 제거; raw 비교 실패를 정상화 금지; 모든 기존 ID·buffer·matrix·text·layer 단언 유지 |
| FX02 / TC-218-FX02 | side0/1/2, 비기본 depth/alpha/blending 및 두 방향 raycast; 실제 ShapeGeometry instanceof/parameters/clone, hole·Bezier, typed buffers/groups/drawRange | invalid/누락 enum·unknown geometry/curve·NaN·분수 index·범위초과·외부 resource 실패; type spoof는 PASS 불가 |
| FX03 / TC-218-FX03 | 실제 Worker snapshot roundtrip, 동일 source3/render10·원본 선택·정밀 외곽선·Layer 동작; fresh process sourceGET0/parse0/indexWorker0 | renderer ID를 source handle로 대체 금지; nested/unmapped source를 임의 지원 처리 금지 |
| FX04 / TC-218-FX04 | source SHA/Version/Scope/scene ref/instancePath/좌표/bounds/mapping을 개별 변조하여 full validator 또는 restore audit 거절 | SHA만 재계산해도 구조·Scope·mapping·bounds 불변식을 위반한 변조는 거절; 완전히 일관된 임의 source 의미의 진위를 원본 없이 증명한다고 주장하지 않음; stored mapped count에 의존 금지; 새 권한/attestation 부여0 |
| FX05 / TC-218-FX05 | v1 bytes/manifest 불변 read + legacy fidelity UNKNOWN·source unavailable, v2 unavailable의 안전 복원, v2 필수 필드 누락 실패 | legacy를 full READY로 오표시0, 자동 원본GET/재생성/DBwrite/Current교체0; 기존 v1 선택 실패가 회귀라고 위장되지 않게 명시 |
| FX06 / TC-218-FX06 | 32MiB/100k/2M/depth128 및 source paths/shape/control samples 개수 경계의 사전 실패, source risk preflight 유지 | 한도 상향·샘플 축소·새 hidden allocation 무제한·필수 시험 skip 금지 |
| FX07 / TC-218-FX07 | 기존 Scene API/persistence/Auth/CAS/APP_CREATED/Memo/Zone/Outline·G7 upgrade chain 회귀 및 0.59.0 package/lock 정합 | DB/원본/immutable Scene 변형0, 0.58.1 immutable release 변화0; backward-app reader 지원을 허위 선언 금지 |
| FX08 / TC-218-FX08 | 실제 CLI discovery 기존 P0 5+A2 4+parity 및 신규 시험 유지; 독립 QA typecheck/lint/build/full unit·관련 browser/G7, 정확 packaged CPU image/fault+fresh recovery | fault 후 복원도 신규 class/side/index 단언을 사용; 과거 합성 PASS를 신규 payload 성공으로 승계 금지 |

### 보안 연구 및 GO 계약

공식 자료와 실제 격리 시험은 별도 [Issue218Sandbox](Issue218Sandbox.md)에 기록한다. Chromium user namespace/seccomp 개선은 현재 UID10001/read-only/network-none/cap-drop/no-new-privileges/CPU2/RAM1536MiB/swap1536MiB/SHM256MiB/PID256 및 기한 상한을 보존한다. `--privileged`, host Docker socket/운영 volume/secret mount, seccomp unconfined, host sysctl 임의 변경이나 sandbox off를 보안 성공으로 처리하는 방안은 승인 범위가 아니다. 좁은 검토된 seccomp syscall 허용의 효과는 실제 sandbox 상태와 동일 DXF 변환·fresh restore/fault 경계에서 증명해야 한다. launch 성공 하나는 A2-05 PASS가 아니다. SwiftShader의 공식 untrusted-content 경고는 컨테이너 개시 성공으로 해소되지 않는다.

공식 Node parser 지원을 조사하는 것은 허용되지만 parser API/Node 실행 성공만으로 Scene 생성 동등성·license/SBOM/보안 수용을 선언하지 않는다. 새로운 parser의 실제 source→render·한글 glyph·TEXT/MTEXT·BLOCK/nested INSERT·WCS·material·geometry·선택 snapshot 및 동일 fault/resource 시험이 모두 필요하다. 기존 `three-dxf-viewer` 직접 Node NO-GO/late rejection 증거는 유지한다. untrusted 파일은 실제 외부 공격 가능 입력으로 다루고 합성 fixture 성공을 보안 검토 대신 사용하지 않는다.

**P1-B 착수 판정은 아직 NO-GO/BLOCKED다.** 이 fidelity 보완·보안 조사 PR의 구현 수용과 **A2 GO**는 별개다. 기존 A2-01~06, source fidelity의 미지원/PARTIAL 처리에 대한 필요한 명시 수용, 정확 HEAD 필수 CI·리뷰, sandbox/SwiftShader·라이선스/SBOM·공급망 및 기존 실제 고객/2PC/현장 #113/#193 조건을 그대로 평가한다. 현장 수용을 구현 GO에서 몰래 빼거나 새 이름의 더 약한 GO를 만들지 않는다. 기술 증거가 모두 통과해도 남은 회사/Owner 판단은 에이전트가 대신 승인하지 않는다. 보안 또는 fidelity가 UNKNOWN이면 Worker 착수하지 않는다. 모두 충족되고 Manager가 근거별 GO를 기록한 뒤에만 사용자 요청의 조건부 P1-B를 실행한다.

진행 순서는 Manager 본 설계→gpt-6-sol Developer 구현→Manager 구현 검토→gpt-6-luna 독립 QA/문서→Manager 수용·GO 재평가→root 최종 통합/commit/PR이다. Manager는 이 문서만 소유하고 root가 공통 요구/Architecture/ADR/Database/TestPlan/README/ChangeLog/실측 보고를 동기화한다. 이 절 작성 시 구현 시험 및 신규 보안 결과는 **NOT RUN/NOT VERIFIED**이며 실 결과는 TestReport에 기록한다. #218 OPEN, P1-B/C/D 미착수.

---

## 2026-11-03 — 후속 단일 PR: 실제 Viewer Adapter 동등성 및 프로세스 안전성 검증 설계

**최신 판정: 구현·독립 QA·정확 최종 이미지 검증 완료, Manager가 검증 전용 PR을 수용했다. 운영 GO는 BLOCKED, F03/F04 전체 복원은 PARTIAL/UNMET이며 새 원격 HEAD CI 결과는 미확인이다. 아래 설계/AC는 구현 전에 기록했으며 실제 결과 정본은 [TestReport](TestReport.md) 상단이다.** 사용자 승인 범위는 #218 P1-A2의 두 미완료 증거를 하나의 후속 PR에서 검증하는 것이다. 기준 Main `0c7ab5f`(앞선 #221 squash `dc80f88` 및 CI #541 성공 기록 포함), branch `feat/218-a2-adapter-safety`, package **0.58.1 유지**. 아래 AC/TC는 기존 R-218-A2-02/03/04 및 A2-02/04의 추가 시험이며 기존 성공·실패 이력을 덮어쓰지 않는다.

**범위:** `src/tests/a2`, 필요한 test-only browser entrypoint/CI 및 추적 문서. 실제 `ThreeDxfViewerAdapter`를 수정 없이 시험에 import한다. production Worker/Job/lease/fencing, G7/권한, DB/SceneRepository/Current 게시, App/Compose/GHCR 배포는 구현하지 않는다. `도면/보기/작업` 메뉴·Role/Drawer/접근성 동작 변경이 없으므로 새 UI 항목은 불필요하다. Chromium+SwiftShader 격리 실험은 운영 sandbox 승인이나 P1-B 장애 복구의 대체가 아니다.

### 발견된 기준 차이와 구현 지시

실제 Adapter는 생성자 옵션 `prepareScene:true`와 `load(bytes)` 경로에서 원본 SHA 확인, explicit elevation, 실제 DXFViewer, preflight, material 복제 및 black→white 표시 보정, tag, render/선택 초기화, optional outline Worker, `extractDxfText`를 포함한 CUSTOM_DTO를 만든다. `getSceneArtifact()`가 그 결과이다. 기존 `scene-poc-browser.ts`는 첫 Line을 의도적으로 hidden/dashed로 바꾸고 `serializeSourceScene`에 textIndex를 전달하지 않는다. 따라서 기존 PoC 성공을 live parity라고 명명하거나 두 결과를 같게 만들기 위해 비교에서 material/visibility/text를 제거하면 안 된다.

Developer는 test-only 독립 후보 경로를 기존 full font/decoder/serializer와 실제 Adapter 계약에 맞추되, 기존 ALL/DTO_ONLY PoC 시험은 보존한다. 같은 합성 원본 bytes, source SHA, Version ID, INSUNITS, builder/schema/package 및 폰트 bytes를 두 독립 Browser process에 전달한다. 실제 Adapter에서 `load`→`getSceneArtifact`, 후보에서 실제 DXF parse→CUSTOM_DTO를 수행하고 둘 다 full validator를 통과한 뒤 파일 write/read 및 fresh Adapter `loadScene`을 거친다. Worker URL은 test bundling/virtual route로 실제 outline-worker를 실행하도록 연결한다. 공유 시험 인터페이스는 `window.a2Candidate.build({dxf, versionId, sourceSha256})`로 두고 artifact(완전한 bytes/manifest)와 inventory를 JSON 문자열로 전달하여 scalar별 Playwright transport/report 비용을 피한다. Worker failure를 조용히 성공으로 처리하지 않고 정상 index와 명시적 unavailable 경우를 구분한다. 시험용 fake Adapter·DXF parser·수동 DTO/geometry 작성으로 대체하지 않는다.

### 동등성 matrix 및 수용 기준

| AC / TC | 관측·비교 | 통과 조건 / 부정 시험 |
| --- | --- | --- |
| A2-F01 / TC-218-A2-F01 | 동일 입력 provenance 및 실제 경로 | 두 실제 process에서 source bytes/SHA·Version·전체 Nanum font bytes·builder/schema/package 일치. source SHA mismatch 거절, resource/font 실패는 FAIL. 동일 구현 결과를 자기 자신과 비교하지 않음 |
| A2-F02 / TC-218-A2-F02 | 전체 Object3D/DTO 구조, WCS 및 source coverage | 동일 stable ID/Origin/Scope/parent·kind·layer·unit·visibility·name, 모든 geometry attribute/index/group/drawRange와 local/world transform·BBox 비교. 모든 finite scalar ±1e-5 drawing unit; ID/수량/자료형은 exact. 맨 끝 좌표·ID·layer·transform 변조도 탐지. CPU2/RAM1536MiB 내 bounded 비교 유지 |
| A2-F03 / TC-218-A2-F03 | material 및 TEXT/MTEXT glyph | material 종류/색/opacity/line style와 glyph geometry·placement를 live baseline과 비교. 한글 글꼴 존재/호스트 문자열 검색만으로 glyph fidelity PASS 금지. black→white는 live 계약이며 인위적 PoC hidden/dashed probe는 별도 기존 회귀에 유지 |
| A2-F04 / TC-218-A2-F04 | persisted viewerData·fresh live restore | 실제 DTO의 textIndex 전체 내용/좌표 및 Korean TEXT/MTEXT/nested INSERT 검색 결과가 live와 동일; 저장 bytes/SHA/manifest/full validator/readback 후 새 Adapter.loadScene에서 getSceneTextIndex/getLayers와 geometry 재확인. textIndex 삭제·변조를 검출 |
| A2-F05 / TC-218-A2-F05 | outline 및 Layer 동작의 정확한 경계 | source Adapter의 실제 outline Worker index/원본 선택 가용성, restored Adapter의 render outline/레이어 정보 비교. 현재 loadScene은 원본 Entity index를 저장·복구하지 않고 unavailable을 명시하므로 이 차이를 matrix에 PARTIAL로 기록; persisted source outline 지원 PASS 금지. Layer off/on 후 표시 및 dispose/re-entry 확인 |

원본 coverage 정본은 `a2SyntheticDxf`: 직접 LINE 1 + nested 반복 LINE 2, CIRCLE 1 + 반복 BLOCK CIRCLE 2, 닫힌 LWPOLYLINE 1, TEXT 1 + nested 한국어 TEXT 2, MTEXT 1, OUTER INSERT 2와 각각 INNER INSERT 1, mm/$INSUNITS=4 및 비영점 WCS. 각 행에 source 의미 인스턴스 수, 실제 drawable/merged geometry 수, live/candidate/restore 보존 여부를 별도 기록한다. Node 수를 source entity 수라고 간주하지 않는다. 벤더가 합치거나 누락한 경우 구체적으로 PARTIAL/FAIL을 남기며 두 경로가 똑같이 누락해도 source fidelity PASS는 아니다. OCS/CP949/HATCH/SPLINE/DIMENSION·대형 현장 입력은 이 fixture가 검증하지 않는다.

### 실제 재질 손실 관측과 시험 판정 경계

추가 raw material inventory(side/depthTest/depthWrite/alphaTest/blending) 비교에서 source/candidate는 exact였으나 fresh restore의 `nodes[7].materials[0].side`가 먼저 실패했다. 정확히 네 MeshBasicMaterial slot(7:0,8:0,15:0,22:0)에서 side2→0이 관측되었고 다른 네 속성은 일치했다. 이는 **F03 전체 재질 복원 미충족/PARTIAL**이다. 원래 full fidelity 수용 기준을 낮추거나 production DTO를 변경하지 않는다.

검증 helper는 raw source/restore를 보존하고 같은 stable ref/path·material type/slot에 대한 정확한 class loss2개(slot7/8)와 side loss4개만 먼저 assert한다. 이 알려진 손실을 명시한 clone으로 나머지 모든 buffers/행렬/재질/문자를 비교한다. 예상 외 값·개수·위치·depthWrite·class 변화는 실패하며, 이는 전체 복원 PASS의 대체가 아니다. source/class/material identity와 index/path/enum은 exact, 기하 finite scalar만1e-5 허용 오차를 적용한다.

### 실제 프로세스 안전성 AC/TC

Node supervisor는 변환 subprocess 및 Chromium descendants와 분리한다. 각 fault는 실제 converter/browser를 시작하고 확인 가능한 안전 phase 이후 주입한다. 예외를 던지는 unit mock 또는 page.close만으로 아래 gates를 충족하지 않는다. candidate는 전체 검증 및 bounded late-error observation·정상 child exit 확인 전 최종 시험 accepted 파일/marker가 될 수 없다. 임시 디렉터리만 사용하고 source read-only/hash 불변을 검증한다.

| AC / TC | 실제 주입 | 필수 관측 및 수용 조건 |
| --- | --- | --- |
| A2-S01 / TC-218-A2-S01 | 실제 변환 자식의 응답 정지·기한 초과 | supervisor deadline 작동, process group/container kill 후 exit 확인, descendants 잔류0, incomplete candidate/accepted marker0, 원본 불변. Promise.race reject만으로 PASS 불가 |
| A2-S02 / TC-218-A2-S02 | 살아 있는 converter subprocess에 SIGKILL | 실제 pid/signal/exit 증거와 process-tree 정리; 부모 supervisor 생존 및 실패 분류. finally 실행에 의존한 정리 금지 |
| A2-S03 / TC-218-A2-S03 | 실제 converter가 실행 중인 별도 cgroup/container의 메모리 소진 | 기존 RAM1536MiB/swap1536MiB cap 안에서 실제 pages touch/retain. 외부 supervisor가 종료 전후 Docker OOMKilled 또는 memory.events oom_kill 증가를 확보. exit137/SIGKILL만으로 OOM 주장 금지. 증거 불가 환경은 NOT VERIFIED이며 required gate의 skip/pass 불가 |
| A2-S04 / TC-218-A2-S04 | candidate 생성 이후 지연 uncaught exception 및 unhandled rejection 각각 주입 | Node child 및 browser late-error 경계를 명시하고 각각 탐지. 초기 변환 resolve만으로 성공 금지, nonzero/allowlisted 실패/accepted0. 실제 upstream 지연 오류를 숨기는 catch·error-handler 성공 처리 금지 |
| A2-S05 / TC-218-A2-S05 | 각 fault 종료 후 독립 새 process/container로 같은 DXF 재변환 | PID/Browser context 새 생성, 이전 candidate 재사용 없이 parse→DTO→full validator→file readback→fresh restore 실제 성공. 종료 상태·정리·새 결과의 source/Scope/bytes 무결성 확인. 단순 health/ping/start 로그는 restart 성공 증거가 아님 |
| A2-S06 / TC-218-A2-S06 | CI discovery·격리·증거 fail closed | 기존 P0 5+P1-A2 4 전체 시험 유지하며 추가 suite도 실제 discovery·mandatory Verify에 포함. CPU2/RAM1536MiB/SHM256MiB/PID256/UID10001/read-only/network-none/cap-drop/no-new-privileges 및 기존 deadline 상한 보존. fault별 독립 bounded container 허용, 운영 mount·secret 금지 |

OOM 자식과 supervisor가 같은 cgroup에서 함께 죽는 경우에는 외부 Docker supervisor가 검사·cleanup·fresh conversion까지 수행해야 한다. 예상 fault의 nonzero exit는 **음성시험 통과 여부**와 구분하고 정상 경로 nonzero는 필수 CI 실패다. 로그는 phase/분류/exit/signal/자원/카운터만 allowlist로 남기고 arbitrary exception·CAD·credential·전체 DTO는 게시하지 않는다. 실제 cgroup peak가 읽히지 않으면 sampled maximum만 기록한다.

### 보안 문서 근거와 실제 시험의 구분 (2026-11-03 조회)

[Chromium SwiftShader 문서](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)는 GPU process의 JIT 위험 및 비신뢰 콘텐츠에 대한 사용 목적의 한계를 설명한다. [Playwright Docker 문서](https://playwright.dev/docs/docker#run-the-image)는 비루트 사용자·seccomp를 통한 sandbox 환경 구성을 설명한다. 이는 이 저장소의 현재 무권한 컨테이너에서 sandbox가 실제 작동한다는 증거가 아니다. 이 PR은 host 보안 완화 없이 strict launch capability를 별도 시험해 BLOCKED 또는 관측 범위만 기록하며, runtime/현장 보안 승인은 여전히 별도다.

### 완료 판정 및 남은 GO 조건

Developer 완료 후 독립 QA가 frozen source의 위 TC, 기존 A2/Scene PoC 및 관련 자동 회귀, typecheck/lint/build를 실행·문서화한다. Manager는 positive fidelity, 명시적 PARTIAL/실패, fault/cleanup/restart 증거를 구분해 이 **검증 PR**만 수용 또는 재작업 판정하고 root가 최종 통합·commit/PR을 담당한다. 신규 TC의 실제 실행 결과는 TestReport 상단에 기록했고 아래 과거 CI541 결과를 신규 TC PASS로 재사용하지 않았다.

선택적 `chromiumSandbox:true` 별도 probe는 기존 비특권·seccomp 설정 그대로 실행하고 실제 성공/환경 차단을 기록할 수 있다. 이를 위해 privileged·보안 프로필 완화는 금지하며 성공하더라도 untrusted DXF 보안 수용의 충분조건이 아니다.

모든 신규 합성 TC가 성공해도 운영 P1-A2 GO는 **BLOCKED**다. A2-05 untrusted-input Chromium/SwiftShader sandbox·보안/라이선스/SBOM, 실제 고객 DXF·2PC/현장 #113/#193 수용, source fidelity의 PARTIAL/미지원 범위 해결 또는 명시 승인, 정확 PR HEAD required CI 결과가 별도 필요하다. #218 AC01–AC09 OPEN, P1-B/C/D 미착수. 검증 실패나 persisted outline 제한을 숨기거나 운영 GO 조건을 약화시키는 승인은 이 요청에 포함되지 않는다.

---

## 2026-11-03 — PR #221 CI #541 성공 및 검증 장치 Main 병합; 운영 GO 보류

- Source HEAD `1e3f22c0547c96fd260d022770755c4008bf0a61`의 [PR CI #541 / Run41611978658](https://github.com/planner77/layoutManager/actions/runs/41611978658) 9/9 SUCCESS(독립 A2 CPU/Required Verify 포함). Review thread0, Main behind0/mergeable true; Squash Main `dc80f88bc367e5735dc6878a609ab3089b6a4abc`, 원본/병합 tree 동일. [Main CI #140](https://github.com/planner77/layoutManager/actions/runs/41615434676)는 push 시작만 확인, 완료 미모니터링.
- 이번 병합은 **test-only 합성 proof·CI 실험 장치 승인**이며 기술 A2-01/03 일부의 추가 증거다. A2-02 실제 #212 Adapter 동일조건 충실도, A2-04 Worker kill/OOM/late async/복구, A2-05 untrusted-input sandbox/라이선스·공급망 및 #113/#193 현장 검증은 여전히 미완료. A2-06 CI는 충족하였으나 **P1-A2 운영 GO는 BLOCKED**, 후속 B/C/D 금지.
- #218 AC01–AC09 전체 영속 Job/Worker/G7 게시/상태 UI/배포 조건은 미완료이므로 **Issue OPEN 유지**. Production/Version/DB/Volume/OCI 불변이며 GHCR 신규 게시 없음. 정확 실패 이력/증거는 [FailureLedger](FailureLedger.md)/[TestReport](TestReport.md) 참조.

---

## 2026-11-03 — CI #540 comprehensive repair contract (implemented and locally verified)

Manager scope: repair PR #221 P1-A2 test discovery and investigate unresolved #539 OOM before a single final branch push. Latest failed Run41579326423, source `2ff920a47897472fc78fe801602ae3c261bdf81e`, A2 Job125730647664: both fresh containers exited1 with `No tests found`, OOMKilled=false; other independent jobs SUCCESS, Verify125734431179 dependent FAILURE. Local exact CLI reproduced both zero-test failures; unfiltered discovery lists9. This run did not exercise conversion and cannot establish that container separation fixes #539 OOM.

AC/TC-218-A2-R09: execute actual Playwright discovery using the workflow selectors, require exactly five P0 and four acceptance/auxiliary tests, disjoint union of all9, fail on missing/renamed/unselected tests (never pass-with-no-tests). Keep required Verify and both original restricted containers. Add executable discovery regression using Playwright itself, not merely matching workflow text.

AC/TC-218-A2-R10: compare original single fresh-container full proof against corrected implementation at CPU2/RAM1536MiB/SHM256MiB/PID256/read-only/UID10001/network-none. Record original failure/last phase/exit/OOM and actual repaired result. Investigate per-scalar Playwright transport of DTO bytes plus duplicated full geometry inventories versus test carry-over; do not assert allocation cause without comparative evidence. Any transport correction must preserve actual DXF/TTF, all byte/SHA/full validation, every geometry scalar/ID/Layer/WCS check, immutable file readback, fresh-process restore, late-error check and time limits. No limits raised, no fixture reduction or assertion removal. Existing ALL-mode Scene PoC must regress successfully if shared test code changes.

Root acts as Manager using the active model; branch AGENTS requests gpt-6-sol Developer and gpt-6-luna QA for implementation then independent validation. These are substitutes for the supplied older gpt-5.6 role mapping (unavailable tool models); record actual agents/results in TestReport. No production feature/version bump: package remains0.58.1, immutable #216 unchanged, #218 OPEN/A2 GO BLOCKED and P1-B/C/D prohibited. New CI start only; completion deliberately not monitored.

Final implementation and exact packaged proof/independent QA passed; evidence is [TestReport](TestReport.md) and [FailureLedger](FailureLedger.md). This accepts the CI repair, while P1-A2 GO and operational #218 AC remain blocked.

### R10 refined design after actual probes

A fresh single-test baseline still OOMs (original source, unchanged runtime cgroup; initial diagnostic image skipped only recursive chmod; exact Dockerfile image also built and repeated separately). Isolated existing `prepareFonts()` peak RSS963092KiB,1.38s, generated25MiB JSON. Font-only probe reaches restore but Node RSS838MiB/heap641MiB; identical packet via JSON string reaches same restore at RSS325MiB/heap153MiB. After both, per-coordinate Playwright `expect` loops monopolize comparison and allocate test-report steps. Preserve all coordinate comparisons with a finite/tolerance-check loop and a bounded number of assertions; add late-array mutation/nonfinite/length regression. Precompute the exact existing Nanum font with existing `prepareFonts()` during proof-image build, verify required glyphs at runtime, never subset/replace it. JSON transport is test-only and must not alter DTO bytes/manifest; no shared Scene PoC/production change is required. Keep safe milestone/RSS diagnostics and numerical comparison indices, without dumping fixture bytes, IDs, hashes or arbitrary exceptions.

---

## 2026-11-03 — CI #539 measured OOM after successful independent converter proofs

[A2 CPU proof #539](https://github.com/planner77/layoutManager/actions/runs/41578400956) HEAD 883be4504496bed0e0555bb21dfaff48cc468e06: P0-1 WebGL-only, P0-2 minimal real DXF DTO, P0-3 real Korean/nested INSERT DTO, P0-4 DTO/ALL cost and P0-5 fail-closed browser abort ALL PASS (8/9 combined). The final full A2 produced/custom DTO but Playwright worker was SIGKILL, Docker inspect oomKilled=true. An 1.024GiB max 2s memory sample is NOT proof of peak; memory.events last read before OOM reported zeros, Docker postmortem explicitly OOMKilled=true. Root cause class OOM now supported, but exact process/allocation source unknown.

To eliminate memory carry-over from the diagnostic suite, the mandatory CPU job now runs P0 and full A2 in distinct fresh containers under the SAME strict 1536MiB, CPU2, SHM256MiB, UID10001, read-only, offline, PID/timeout controls. Both fail closed and separately archive ExitCode/OOMKilled/1s stats. No tests skipped, no limit increases. If fresh A2 still OOMs, investigate TTF/GLB/DTO copies and isolate actual Worker memory under original cap. #218 OPEN, P1-A2 GO BLOCKED, no P1-B/C/D or GHCR/G7/DB deployment.

---

## 2026-11-03 — P0 diagnosis after repeated PR CI failures, no GO

Across #221 CI #479–#538: 60 runs, seven failures and 53 cancelled intermediate SHA runs. Quality/Docker/General Chromium/G7 all pass by #538, while required A2 CPU-only job alone fails. [CI #538](https://github.com/planner77/layoutManager/actions/runs/41570387391) HEAD 3b1c8c1ff9b1e42bde12af57cfeaf09ead3fa2a0 shows REFERENCE_READY → REAL_DXF_PRODUCE_START → page.evaluate: Target crashed. Original wrapper combined WebGL2 creation and DXF produce; direct cause unknown and no OOM/exit metrics.

Remediation is test-only: original Scene PoC default ALL unchanged, optional DTO_ONLY to avoid unrelated GLB/THREE_JSON allocations; P0-1 isolated WebGL2, P0-2 minimal LINE DXF/DTO-only, P0-3 Korean/nested DXF/DTO-only, P0-4 format-cost comparison, P0-5 browser close rejection. A2 full source SHA/manifest/validator/persist/restore remains required. Docker CI captures ExitCode/OOMKilled/docker stats/cgroup memory.events for seven days with original resource/security limits. Commit as one branch update instead of many per-file pushes. New tests not yet executed, do not claim OOM fixed or CPU Builder GO. P1-B/C/D not started and no GHCR/production data changes. #218 OPEN.

---

## 2026-11-03 — #221 CI #525 CPU Chromium153에도 RegExp 동일 실패; P1-A2 proof 구현 통합

- [PR CI #525 Run41567538237](https://github.com/planner77/layoutManager/actions/runs/41567538237) exact HEAD `8042b1cd0c0ed6913666f93d91ed95f42c9b9b96`: scope/Quality/Docker/General Chromium 2/G7 전부 SUCCESS, A2 `BROWSER_MAJOR_153→HARNESS_SCRIPT_REQUESTED→PAGEERROR_SYNTAX_INVALID_REGEXP`로 필수 변환 시험 실패. 다른 3개 보조 PASS. Browser 153 동기화가 문제를 해결하지 못했으므로 Chrome 156 전용 원인 가설은 부정. 실제 regex pattern/caller는 문서화 가능한 로그가 없어 UNKNOWN. DXF parser/Scene/DTO/full validator/restore는 미호출.
- **구현 변경:** 검증 전용 `src/tests/a2/headless-browser.ts`의 중복 브라우저 초기화·변환 구현은 제거. 이미 General Chromium E2E `SC-05/06/07`에서 합성 DXF→3D→Scene 직렬화·복원이 성공하는 `src/tests/e2e/scene-poc-browser.ts`를 A2 CPU proof에서 **직접** import-free bundle entrypoint로 사용한다. A2 host harness가 소스 바이트 SHA, 한글/중첩 BLOCK DXF source preflight, 실제 Korean TTF, `CUSTOM_DTO` manifest bytes/SHA/full validator, temp file write/read, per ID WCS geometry/Layer/Node inventory, 독립 CPU Browser process fresh restore 검증을 추가. 패키지/Prod Builder/G7/API/DB/Prisma/Compose를 변경하지 않고 Required CI도 동일하게 유지한다.
- **한계·판정:** 기존 성공 Scene PoC E2E는 한국어·대규모 도면/실 사용자 Viewer Adapter Fidelity, server worker sandbox, OOM/kill/restart, G7 Session·Actor 권한 재검증/비파괴 CAS, 업로드→Scene READY 실증의 대체가 아니다. A2 test의 한글 host text-index 검사는 Persisted viewerData의 한글 텍스트 기능을 직접 증명하지 않는다. 새 CI 결과 관측 전 A2 GO **BLOCKED**, #218 OPEN, P1-B/C/D 금지. 해당 PR 병합/GHCR 운영 게시 없음. [원장](FailureLedger.md), [TestReport](TestReport.md), [TestPlan](TestPlan.md).

---

## 2026-11-03 — PR #221 CI #514 정규식 오류, CPU browser 고정 버전 정합 검증

CI [#514 Run41564217739](https://github.com/planner77/layoutManager/actions/runs/41564217739) HEAD `ea3145c5b2fa2d55a6b631d45ffbed201937baf3`: Scope/Quality/Docker/G7/일반 Chromium 통과, A2 CPU Browser `PAGEERROR_SYNTAX_INVALID_REGEXP`로 actual DXF 변환 미실행, 3/4 tests PASS. Node `vm.Script` 구문 PASS와 브라우저 런타임 정규식 생성의 성공은 별개.

**검증된 차이와 선택:** #514 A2 Debian apt browser Chromium156.0.8078.73, 같은 CI 일반 Chromium Browser scene-poc E2E PASS는 Playwright Chromium153.0.8010.12. 초기화 버그의 정확한 regexp/패키지는 미확인이고 version mismatch는 가설이다. `src/tests/a2/Dockerfile`을 lockfile-pinned Playwright browser로 대체하고 major=153 확인/strict `chrome153` bundle target으로 실험한다. 이미 설치한 npm dependencies와 OS 기반 CPU runtime은 동일, 빌드 때 Browser를 획득하고 실행은 offline(`--network none`), rootless UID10001/read-only/CPU-RAM 제한 유지한다. 이는 **검증 가능한 실행환경 정렬**, 운영 Worker/Scene 완료 판정 아님.

GO 잔여: 실제 synthetic 변환/전체 Validator/Browser parity, sandbox/OOM/late async/필드 DXF/한글 BLOCK fidelity, 브라우저 패키지/SBOM/폐쇄망 공급망. #218 OPEN, P1-B/C/D 금지, #216 OCI GHCR/G7 인증/DB·Volume 불변.

---

## 2026-11-03 — PR #221 CI #506 A2 Script SyntaxError 및 Bundle 정합성 검증 수리

[PR CI #506 Run41561632191](https://github.com/planner77/layoutManager/actions/runs/41561632191) HEAD `06d6bda224e74b30e40548184902ec44f518dd6e`, Quality/Docker/General Chromium 2/G7 E2E 성공. CPU proof `125673426531`에서 bundle/TTF/Chromium 준비 및 localhost virtual `HARNESS_SCRIPT_REQUESTED`까지 성공, 직후 `PAGEERROR_SYNTAX`로 `window.sceneA2`가 등록되지 않아 실제 DXF→Object3D/Validator/Restore 미실행. 4개 시험 중 3 PASS, 1 FAIL. 이전 nonsecure-Origin 가설은 localhost 후에도 재현되므로 root cause로 확인되지 않음.

**진단과 수정:** 기존 default `esbuild` JavaScript target이 명시되지 않았으므로 Test 전용 IIFE bundle을 `chrome115`로 고정, 정확 bundle bytes를 Node `vm.Script`로 compile-only 검사, Runtime Browser `SyntaxError`의 허용 lexical category와 synthetic JS line/column만 안전 기록. 이 변경은 실제 오류의 토큰을 찾아 수정했다는 뜻이 아니라 추가 격리/호환 검증이며, 다시 실패하면 그 결과를 fail-closed로 남긴다. 기존 SourceSHA/SceneScope/DTO/full validator/Restore, 32MiB/100k/2M/depth128, read-only Debian UID10001/network none/CPU2/RAM1536MiB/전체 CI Gate 불변.

P1-A2 기술 GO **차단**, #218 OPEN AC01–09, P1-B/C/D 미착수, #216 GHCR immutable 및 운영 DB/Volume/Auth/Current/SceneRepository 무변경. [원장](FailureLedger.md), [시험](TestPlan.md).

---
## 2026-11-03 — PR #221 CI #495 HARNESS_READY timeout 및 localhost·오류 분류 보완

[CI #495 Run41558698574](https://github.com/planner77/layoutManager/actions/runs/41558698574), exact HEAD `91509d1dce9522acb2b8a0f934c9b08fa63fa4b8`: Scope/Quality/Docker/Chromium 2/G7 성공. A2 CPU proof 전용 Job `125664254542`에서 Debian 이미지·UID10001 성공, 3 시험 중 watchdog/위험 preflight 2 PASS, 실제 변환 1 FAIL(`BUNDLE_DONE → FONT_PREPARE_DONE → SWIFT_CHROMIUM_STARTED → HARNESS_NAVIGATE_START → PAGEERROR_OTHER → A2_TIMEOUT:HARNESS_READY:LAST_PHASE=UNOBSERVED`). DXF parser·DTO/validator 호출 전 실패하였으므로 Headless 기술 GO는 여전히 불가. 원본 JS 에러는 allowlisted OTHER만 출력되어 root cause UNKNOWN.

**수정 방향 및 근거:** `http://p1-a2.invalid`는 일반 비신뢰 HTTP Origin이고 `http://localhost`는 MDN/W3C에서 potentially trustworthy secure context다. Three/WebGL 번들에서 `Crypto.randomUUID` 같은 secure-only API가 필요할 가능성을 우선 확인할 가설로 채택하고, 합성 페이지 Origin만 localhost로 변경(실제 network `--network none`/local route 유지). `HARNESS_SCRIPT_REQUESTED`/script actually served, `window.isSecureContext`/`crypto.randomUUID` 즉시 assert; JS pageerror를 safe category/즉시 fail로 표면화해 다음 근본 원인 식별 가능. 해당 API가 실패 원인인지 CI #495 증거만으로 확정하지 않는다. Test/CPU/timeout/G7/Required Gate 완화 없으며 합성 Scene 검증 결과 미확인. [원장](FailureLedger.md), [TestPlan](TestPlan.md).

P1-A2 GO BLOCKED, #218 OPEN/AC01–09 미완료, P1-B/C/D 미착수. #216 OCI immutable tags/digests·production DB/Volume/APP_CREATED/Memo/Zone/Outline/SceneRepository/G7 Auth 불변.

---

## 2026-11-03 — PR #221 CI #485 실제 Timeout·관측 불가 및 진단 보완

[PR CI #485 Run41555129727](https://github.com/planner77/layoutManager/actions/runs/41555129727) HEAD `23d4b8df0948e4ee1d6b3a34dba9673e56136440`: Scope/Quality/General Chromium(2)/G7 Greenfield/G7 Signed-Legacy/Docker SUCCESS. 독립 Debian CPU proof `125652599400`에서 image build/UID10001 성공, 위험 preflight test PASS, **실 synthetic DXF→Scene test가 180000ms timeout**. 이 실행에서 구체적인 장기 대기 단계는 기록되지 않았으므로 원인은 UNKNOWN. Required Verify는 mandatory CPU 실패로 FAILURE. DXF 변환/validator/restore/SwiftShader GO 판정 불가.

보완: `headless-browser.ts`의 SOURCE/WEBGL/DXF_PARSE/SCENE_PREFLIGHT/TAG/TEXT_INDEX/CUSTOM_DTO/FULL_VALIDATOR/RESTORE/RENDER 안전 단계 마커; `headless.spec.ts`의 실행 Host/폰트/브라우저/Resource/오류 단계 및 25s Chromium launch·20s navigation·60s evaluate 독립 timeout(마지막 phase 보고), 정지 Promise fail-closed 회귀. 전체 시험 180s, Docker 15m·UID10001/read-only/network none/cgroup, 실제 renderer/DTO/all validation과 기존 PR CI Gate를 변경 없이 보존. 시간 연장/가짜 READY·skip 없음.

재실행 뒤에도 `#212` 실제 Viewer와의 동등성, 한글/BLOCK fidelity·async-late/OOM/강제 종료/sandbox·현장 #113/#193 **미검증**. P1-A2 GO BLOCKED, 후속 P1-B/C/D·GHCR·G7 게시 금지. [원장](FailureLedger.md), [시험 계획](TestPlan.md), [결과](TestReport.md).

---

## 2026-11-03 — P1-A2 PR #221 CI #479 1차 실행 실패 및 보완

[Run41551357571](https://github.com/planner77/layoutManager/actions/runs/41551357571) PR HEAD `f40ba4a0dcc6ebe4c5598cf6962e847e81bdfbe3`: Quality Typecheck `TS2322`(TTFLoader metadata string vs nested language map), 독립 A2 CPU Run Playwright output 폴더 `/app/src/test-results` mkdir `ENOENT` (read-only container). Docker/UID10001 및 기존 Runtime smoke 성공, **실 DXF 변환 시험은 미실행**. TypeScript는 `Record<string,unknown>` metadata guard, Playwright 결과 경로는 `/tmp/a2-playwright-results` tmpfs로 수정. 후속 exact HEAD CI 결과 관찰 전 PASS/GO 금지. 기존 required CI·rootfs RO·cgroup·G7 승인 불변. [FailureLedger](FailureLedger.md) 및 [TestReport](TestReport.md).

---

## 6. 벤더 공식 문서 확인 및 A 후보 보안 보류 사유

- [Chromium: Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md): CPU software implementation 및 `--use-gl=angle --use-angle=swiftshader` 실험 모드, `--enable-unsafe-swiftshader` 안전 경고. **Chromium은 SwiftShader를 신뢰하지 않는 콘텐츠 처리에 사용하도록 설계된 안전한 프로덕션 격리로 보장하지 않는다.** 별도 sandbox+격리/허용 입력과 취약성 관리 없이 신규 DXF 파일을 production 자동 게시할 수 없으므로 보안 검증을 추가 GO 필수 조건으로 둔다.
- [gdsestimating/dxf-parser README](https://github.com/gdsestimating/dxf-parser): Node `parseSync` 예제/Node sample, Header/2D Entity/Layer/BLOCK/INSERT/TEXT·일부 MTEXT 지원, 3DSolid·leader 등 미지원, MIT. 이는 **파싱 API 보유 증거**이지 기존 Three.js 변환·Scene Fidelity·운영 안전성 PASS가 아니다.
- [저장소 font OFL.txt](https://github.com/planner77/layoutManager/blob/main/src/public/fonts/OFL.txt) 추적 파일 존재 확인. 시스템 패키지 Chromium/그 의존성 및 새로운 Node 파서 license inventory/SBOM 검사는 아직 별도 실행 필요. 회사 보안·라이선스 수용 전 worker release 금지.


---

# Issue #218 — P1-A2 CPU-only DXF→Scene 변환기 검증 설계·Gate 원장

> 2026-11-03 기준 Main: `55b82cdf35f6d9f606dcab16830cd61ce0098082`; Branch: `feat/218-a2-headless-cpu-gate`.
> **판정: GO 보류(BLOCKED / 기술 검증 증거 미완성).** 본 PR은 P1-A2 **실험 장치 및 자동 시험을 추가**할 뿐 서버 Scene 자동 생성·G7 게시·실 배포 기능을 제공하지 않는다. CI/실 도면/현장 수용 전 PASS 선언 금지. #218 AC01~AC09 미완료, Issue OPEN.

## 1. 증거 및 의존성

- 정본: [#218](https://github.com/planner77/layoutManager/issues/218), 원 요구·이력 [#208](https://github.com/planner77/layoutManager/issues/208), [Issue208.md](Issue208.md), [AGENTS](../AGENTS.md), Architecture/Decisions/Requirements/Database/Logging/Operation/TestPlan/TestReport/FailureLedger.
- [#217](https://github.com/planner77/layoutManager/pull/217) P1-A1 HEAD `5501770c6773980672b1e2c6f54ccaaaf21874d4`, [PR CI #472](https://github.com/planner77/layoutManager/actions/runs/41524840539) 8/8 성공은 **직접 Node 변환 NO-GO + 독립 Three DTO/Restore 부정·기본 검증**까지만 확인. [CI #457](https://github.com/planner77/layoutManager/actions/runs/41520729471)에서 Node `three-dxf-viewer@1.0.44` WMF/RTF 분기 `window is not defined` **4개 비동기 unhandled rejection** 발생. try/catch 혹은 성공한 DTO만으로 GO 간주할 수 없다.
- #212: 수동 브라우저 `ThreeDxfViewerAdapter.load → DXFViewer.getFromPath → preflightSceneRoot → tagImportedTree → extractDxfText → serializeSourceScene(CUSTOM_DTO) → full Validator` 기준. `getFromPath` 화면·렌더링 fallback 성공은 서버 READY가 아니다.
- #209/#211: Greenfield/OCI release Registry/명시 승인 Upgrade·Writer0/Volume/백업·복구를 #218에서 수정하지 않는다. #216: immutable v0.58.1 App/Migrator 게시·원본 릴리스 복구와 신규 Worker 이미지는 별개. v0.58.0/v0.58.1 태그나 digest 변경 금지.
- #113/#193: 승인된 3종 실 DXF 및 실제 PC/GPU/2PC/Memo/Outline/Zone 통합 수용은 공개 합성 코드·CI로 대체 불가. 실제 도면/해시·식별자 GitHub에 반출 금지.
- Main 조사 시 열린 PR 0건(조회 시점), 이후 Main 변화·PR 신규 발생 시 병합 충돌 재확인. 이번 작업은 AGENTS/설계 정본을 근거로 하며 루트 DESIGN.md는 생성하지 않는다.

## 2. 설계 옵션 비교 — 구현 선택 전 평가(실측 전, 추정과 증거 분리)

| 축 | A: 독립 Headless Chromium + software WebGL | B: Node 공식 DXF parser + 직접 Three 변환 |
|---|---|---|
| 실행 API/Node | Chromium/Playwright는 browser JS DXFViewer를 실행. **Node 내 DXFViewer 직접 호출 금지**. 브라우저는 서버 테스트 프로세스로 독립 실행 | Node 지원 DXF 파서(예: dxf-parser)는 DXF 객체 파싱에 사용 가능. **기존 Viewer Object3D/DTO 변환 API는 별도 구현 필요** |
| DXF Geometry/한글 | 기존 THREE Builder를 직접 재사용 가능하여 비교 비용 낮음. 실제 TEXT/MTEXT glyph/폰트는 테스트 필수 | LINE/CIRCLE/LWPOLYLINE/BLOCK/INSERT/OCS/MTEXT 등 변환 지원 범위·폰트 삼각화/문자 정렬/line style를 직접 증명해야 함 |
| 중첩 INSERT/좌표 | 기존 변환기 실행 전 별도 BLOCK DAG·확장량 제한, WCS/BBox/단위 검증 필요 | INSERT instance/transform 재귀 구현·스케일/회전/OCS·중첩 DAG 및 Stable ID 별도 구현 필요 |
| 자원/오류 | Chromium·SwiftShader가 CPU/RAM 크고 별도 브라우저 프로세스, sandbox·network·kill/timeout·late rejection 실증 필요 | CPU/RAM 비용 잠재적으로 작지만 장시간 순수 JS·파서 예외·기하 확대·폴백 누락 위험, 프로세스 격리 필수 |
| 라이선스/폐쇄망 | 현재 three/three-dxf-viewer·Chromium/의존 라이선스 및 글꼴 배포 조항을 이미지 SBOM에서 확인. Chromium 런타임 번들·수급 필요 | 실제 선택 파서의 LICENSE·의존성·글꼴 확인. dxf-parser MIT 후보이나 새 converter 작업·의존성 동결 전 채택 아님 |
| P1-A2 선택 | **우선 시험 후보**: 기존 #212 변환 정합성 입증의 출발점. software WebGL identity를 확인하지 못하면 실패 | **현재 대기**: 지원되는 Node parser 자체와 이후 full converter는 실제 변환/비교 시험 전 미검증; 시간·복잡도·fidelity 과제 |
| 실제 GO | **미확정**: 아래 A2 시험과 격리/현장 경계를 모두 통과해야 함 | **미확정**: 동등한 전체 시험 증거 없이 선택/운영 금지 |

`three-dxf-viewer@1.0.44` 직접 Node 호출은 옵션 B가 아니며 앞선 NO-GO를 보존한다. 새로운 Node parser 사용 시 기존 `sceneScope`의 `builder` 식별을 허위 재사용하거나 READY를 위조할 수 없으므로 schema/호환성 변경 분석·Migration/복원 판정이 선행되어야 한다.

## 3. P1-A2 첫 PR 구현 범위

- `src/tests/a2/headless-browser.ts`: 실제 원본 바이트 SHA 검증, 소프트웨어 WebGL renderer identity, `DXFViewer.getFromPath` 실제 DXF→Object3D, node/scalar preflight, `tagImportedTree`, UTF-8 텍스트 인덱스, `CUSTOM_DTO` serialize, manifest/SHA/full validator, `restoreSourceScene` 검증. 소스·CAD 전문/실 해시/임의 exception을 공개 로그에 내지 않는다.
- `src/tests/a2/headless.spec.ts`: 정확 동일 synthetic DXF+TTF를 독립 Headless SwiftShader와 별도 Chromium 브라우저 프로세스에서 실행해 노드/geometry/Layer/Stable ID/transform/WCS BBox를 비교. DTO byte digest 및 파일 저장·읽기·fresh process restore. **동일 browser test harness 비교이며 실제 #212 Viewer UI end-to-end 판정이 아님**.
- `src/tests/a2/fixtures.ts`: AC1024/한글 TEXT·MTEXT/Layer/INSUNITS/LINE·CIRCLE·LWPOLYLINE/BLOCK·중첩 INSERT/큰 좌표, 2^18 instance 폭증, cyclic BLOCK, 비지원 Entity. 전부 공개 합성 입력이며 실제 고객 도면 아님.
- `src/tests/a2/dxf-risk-preflight.ts`: parser 앞 단계에서 **보수적 합성 fixture 안전 경계** (UTF-8/16MiB, 알 수 없는 Entity, dangling/cycle BLOCK, expanded 100k 초과). 실제 범용 DXF 파서/운영 whitelist가 아니며 비지원 Entity를 조용히 누락하지 않는다. 기존 직렬화 하드 상한 32MiB, 100k nodes, 2M scalars, depth128 **불변**.
- `src/tests/unit/scene-a2-risk-preflight.test.ts`: 위험 검사 회귀. `src/tests/a2/Dockerfile` + `playwright.config.ts`: Debian Bookworm, apt Chromium, UID 10001, 사내 비밀·운영 volume 불필요 시험 이미지.
- `.github/workflows/pr-ci.yml`: 해당 A2 branch에만 신규 CPU 테스트 잡을 *기존 required Verify에 추가 필수* 의존. 네트워크 none/read-only, no-new-privileges, cap drop, CPU2/RAM1536MiB/pids256/shm256MiB, /tmp512MiB, 최대15분. 미완료/timeout/OOM/crash/비동기 pageerror 발생 시 success 금지. 기존 Quality/Chrome/G7/Docker gate는 유지. 테스트 이미지 GHCR 게시·운영 활성 없음.

### 범위 밖/잔존 설계 위험

1. 브라우저 하네스와 실제 `#212 ThreeDxfViewerAdapter` 동등성은 **추가 구현/통합 E2E 필요**: 기존 Viewer의 렌더 fallback, 선택 인덱스(선택적), TEXT glyph 실제 이미지, opaque/MText style 및 BLOCK 변환 경로 차이를 비교하지 않았다.
2. Chromium sandbox는 현재 임시 CI 컨테이너에서 `chromiumSandbox:false`; 실행 주체 분리를 검증하더라도 production sandbox/프로세스 격리 보장 아님. cgroups OOM/kill/restart/잠긴 subprocess/late async task/no network/filesystem secret redaction 복합 장애 주입 미실행.
3. 합성 한글 glyph count/텍스트 인덱스만으로 실제 글꼴 배치 fidelity가 입증되지 않는다. 5MiB/20MiB+ 실 DXF, nesting 214k 등 현장 위험 및 OCS/ANSI_949, HATCH/SPLINE/치수 비지원/entity coverage은 #113/#193와 별도.
4. 실제 browser `DOM`/WebGL 공급 필요, CPU-only에는 GPU API 없음(software renderer). Memory/CPU/elapsed 실제 수치는 CI 로그로만 수집한 뒤 평가. 같은 입력에서 WCS 허용오차 **합성 시험 1e-5 Drawing Unit**, **Owner 현장 SLA 대체 아님**. Stored Scene Validator은 원본 geometry semantic completeness를 확인하지 않으므로 소스 entity 대비 누락을 판별하는 커버리지 matrix가 추가 필요.
5. `SceneRepository.publish`, CurrentScene CAS/Revision, G7 Actor/Site/Session, Audit, S3 저장, upload hook/영속 Job, Prisma/Compose를 이 PR에서 변경하지 않았으며 운영 READY가 발생하지 않는다.

## 4. 단계별 Gate 및 후속 PR 설계(허가된 GO 전 실행 금지)

| Gate | 통과 증거 | 현재 |
|---|---|---|
| A2-01 실제 CPU-only source→DXF parser→Object3D→CUSTOM_DTO→Manifest/SHA→full validator→Restore | 정확 컨테이너 테스트 로그/PR HEAD 및 비동기 error0 | **NOT RUN** |
| A2-02 WCS/BB/Geometry/TEXT·MTEXT/BLOCK·nested INSERT/Layer/Unit/Origin/Stable ID | browser #212 실제 빌더와 **동일 입력** fidelity matrix, 허용오차·누락0 | **NOT VERIFIED** |
| A2-03 자원 경계 | Node<100k·2M·depth128, DTO<32MiB, 폭증 사전 거절, peak RSS/CPU/elapsed | 단순 테스트 코드 작성; **실 측정 NOT RUN** |
| A2-04 격리/오류 | UID10001 Debian, CPU-only, offline, timeout/OOM/kill/restart, late async errors0, crash 후 자원·비밀 보존 | 테스트 구성만 구현, 복합 주입 **NOT IMPLEMENTED/NOT RUN** |
| A2-05 라이선스/운영 안전 | Chromium/폰트·third-party licenses/SBOM, signed release 분리, CPU limit・security review | **NOT VERIFIED** |
| A2-06 PR 게이트 | 정확 HEAD typecheck/lint/unit/browser/G7/Docker/신규 A2 CPU job 전체 성공, review0/mergeable | **CI 시작 전 NOT VERIFIED** |

**A2 최종 판정: GO 불가/차단 (insufficient evidence).** 모든 A2-01~06가 확인되기 전 P1-B/C/D 시작, 자동 게시·GHCR release 금지. 기술적 실패는 A 후보 NO-GO로 분리하고 B를 별도 검증 PR로 검토한다. CI pass 하나도 실 고객/현장 수용이 아니다.

- **P1-B 후속**: 정확 A2 GO 후에만 `CadRepository.register`와 `SceneBuildJob` 동일 SQLite transaction, 영속 worker/lease/fencing/idempotency/heartbeat/retry/restart, 원본 SHA, 실 G7 Actor·Site·Session·Writer 및 권한 회수 재검증, SceneRepository 검증/비파괴 CAS+Audit. READY Scene/Current/원본/APP_CREATED/Memo/Zone/Outline 보존.
- **P1-C 후속**: 그 다음 홈/Location Version 상태 JOIN/batch, 검증된 CurrentScene READY와 job status 독립, 익명 민감정보 redaction, Editor 재시도/G7 Origin+CSRF, visible pending polling 및 #202 메모 검색/#165 Scene-first 회귀.
- **P1-D 후속**: 그 다음 별도 worker image/Compose/health, Greenfield·Schema/approved migration, #209/#211 release registry, 2 worker/SQLite busy/ACK loss/S3 503/복구/2PC. #216 immutable 릴리스와 별도 신규 SemVer/OCI provenance/Host plan 필요.

## 5. 실행·리뷰·CI 기록 규칙

- 이 문서를 작성한 시점에는 로컬 npm/tsc/Vitest/Playwright/Docker 실행 **NOT RUN**. 원격 GitHub 파일 저장은 실행 증거가 아니다. PR CI를 시작한 뒤에도 최종 작업 상태는 정확 HEAD/run/job 결과로만 판정.
- 검증 스크립트 실행: `docker build --platform linux/amd64 -f src/tests/a2/Dockerfile -t layoutmanager-a2-proof:ci .` 후 repository PR CI의 **isolated CPU job**을 사용. 사내망/현장에서는 Docker 바이너리/모델 폰트 라이선스 사전 승인 후 재현해야 하며 운영 volume이나 CAD 원본을 마운트하지 않는다.
- 리뷰 unresolved thread 0, base 최신·mergeable, exact SHA, 실패 원장 보완은 **검사 후** 기록. PR CI 성공만으로 A2 GO/전체 #218 AC 완료/운영 GHCR 게시라고 쓰지 않는다.
