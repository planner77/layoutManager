# Issue #218 — 2D 사내 소규모 단일 Worker 정책 및 단계별 GO 기준

> **현행 Owner 정책 (2026-11-04).** 이전 #208/#218 A2-01~06, AC01~09 및 PR #221/#222/#223의 *GO 선행조건 해석*보다 이 문서를 우선 적용한다. 이전 요구·시험·실패 원장은 과거 증거로 보존하며 삭제하거나 성공으로 재분류하지 않는다. 이 정책은 **기존 CI YAML을 즉시 완화하거나 구현되지 않은 Worker가 이미 동작한다는 선언이 아니다**.

## 2026-11-08 — #225 종료 범위와 잔여 Gate

Owner [A안 결정](https://github.com/planner77/layoutManager/issues/225#issuecomment-6716368983)은 #225를 현재 검증된 좁은2D DXF subset의 단일 CPU Worker GO-PILOT으로 한정한다. BLOCK/INSERT FUP5-STATIC-XY는 별도 #268이며 #225 종료 선행조건이 아니다. 상위 #218의 독립 AC와 #231 정책 Gate는 유지한다.

B1/B2/B3·signed HTTP/OCI/Viewer·KILL/OOM 및 REGISTRY의 실제3-image 출고 근거와, OR58-ACTUAL/FUP1의 실제 backup/restore/old App·인증 조회를 재사용한다. 기존 OR58 검증기의 정확0.58 등록 스키마 검사 보완은 G1S01–06으로 추적한다. 독립 writer 배제·승인 RPO/RTO 및 제한된0.61 호환성/G2·명시적 Owner GO/G3는 미충족이면 NO-GO다. 이 절이 아래 역사적 미구현/미게시 문구보다 최신이며, 운영 flags OFF/자동 publisher HOLD·#225/#218 OPEN을 유지한다.

## 1. 적용 범위와 결정

- 대상: 사내망에서 승인된 사용자만 업로드하는 **2D 중심 DXF**, 소규모 동시 사용자, 단일 서버/단일 Worker(기본 동시 실행 1). DWG/레거시 Version 자동 변환 제외.
- 기존 확정 사용자 경험 유지: **신규 승인 DXF Version 업로드 후 브라우저와 독립적으로 자동 Scene 생성·저장**, 목록 상태·실패 사유·재시도 제공. 원본 DXF, 이전 READY, 메모/구역/외곽선/생성 객체와 기존 G7 권한·감사 보존.
- **서버 CPU 변환**은 DXF parser/실제 Three Object3D 생성 → CUSTOM_DTO(v2 후보) → manifest/source SHA/전체 validator → 임시 파일 readback → 안전한 저장 후보 확인까지. **서버에서 THREE.WebGLRenderer를 생성해 화면까지 복원하는 것은 필수 조건이 아니다.** 사용자 브라우저의 실제 Viewer Scene 복원·표시는 해당 UI 기능 통합 시험으로 분리한다.
- 원본 Entity→Render Entity **100% 매핑은 요구하지 않음**. 지원하는 Entity의 고유 handle/type/layer/WCS 및 stable binding이 확인된 경우만 원본 정밀 선택·PRECISE 외곽선 허용. 그 외 화면 표시/일반 스냅/구역 생성은 자체 Scene geometry 경로로 유지하며 원본 정밀 기능만 비활성·경고.
- 기존 시험의 성공·실패를 기능 요구와 연결한다. CI에서 단순히 존재하는 과거 실험이나 아직 구현하지 않은 다중 Worker/외부 현장 수용을 **P1-B 코드 착수 차단 조건으로 만들지 않는다**.

## 2. GO 계층 — 서로 다른 판정

| 단계 | 필수 증거/판정 | 차단하지 않는 항목 |
| --- | --- | --- |
| **GO-DEV** 개발 착수 | 현재 승인 정책, 독립 CPU 실제 DXF→CUSTOM_DTO→Validator/readback의 재현 가능한 성공 또는 그 경로를 구현하기 위한 명시된 검증 계획. 실패는 구현에서 해결한다. **P1-B 단일 Worker 설계·코딩을 즉시 허용** | 엄격 서버 Chromium 안에서 WebGL Viewer 렌더 생성 성공, 전체 원본 매핑, 3종 실 CAD, 2 Worker 경쟁, 외부 현장 수용 |
| **GO-INTEGRATE** PR 병합 | 해당 PR에서 **실제로 구현하거나 변경한 기능**의 유효한 양·음성 회귀, 현재 미해결되고 직접 연관된 실제 실패 수정, repository-required PR CI의 정확 HEAD 성공, 미해결 리뷰/충돌 해소. 문서/시험 전용 PR은 생산용 Worker 완성을 입증할 필요가 없음 | 아직 존재하지 않는 기능의 E2E, 무관한 과거 OOM/6 fault 전체를 매번 반복하기, 실제 고객 도면 전체 지원 |
| **GO-PILOT** 제한된 사내 배포 | 실제 분리 Worker의 DXF→DTO/검증→저장/조회 성공, 자동 enqueue, 단일 실행·멱등·재시작 복구, 인증/권한 재검사, 손상/중단 시 원본·기존 READY 불변, 제한된 2D 입력과 브라우저 재접속 1경로, 설치/복구 smoke, 비루트·자원/시간/네트워크/파일 접근 격리 확인. 통과하지 않은 기능은 제한/미제공으로 표시 | 3종 대형/20MiB+ 현장 DXF·2PC/GPU/모든 특수 Entity·다중 Worker·고급 감시·전체 SBOM 매 PR 반복 |
| **GO-EXPAND** 확장/정식 현장 | #113/#193 실제 도면·디바이스·2PC, 복잡 BLOCK/INSERT/한글·대형 성능, 다중 Worker/외부 파일 입력이 도입되는 경우 그 변경분만 추가 검증 | 초기 단일 사용자 Pilot의 시작 |

**현재 증거 경계:** PR #221/#222의 CPU 합성/동등성·Fault 시험과 PR #223 HEAD `b418d0d` CI #546 성공은 참조 근거다. PR #223의 v2는 아직 Main 미병합(확인 시점)이고 운영 Worker는 미구현. 연구용 엄격 Sandbox에서 **DTO 변환/검증/readback 성공**, **새 Headless Viewer WebGL 생성 `WEBGL_CONTEXT_UNAVAILABLE` 실패**는 별도 기록한다. 앞부분 성공을 생산용 Worker PASS로 과장하거나, 뒷부분 실패를 서버 데이터 변환 실패로 오인하지 않는다. 서버용 코드가 실제로 무-WebGL·제한 자원·비신뢰 입력 경계로 실행되는지는 GO-PILOT 전에 다시 확인한다.

## 3. P1-A2 CPU 변환 최소 지원 계약

1. 2D 우선: LINE, (LW)POLYLINE, ARC, CIRCLE, TEXT/MTEXT(한글 글꼴), BLOCK/INSERT, Layer, Unit, WCS. **기능별 필요한 지원 범위만 수용**하며 HATCH/SPLINE/DIMENSION/3D Solid/XREF/복잡 OCS는 우선순위·실 도면 사용 빈도에 따라 별도 확장한다.
2. 원본 Source SHA/Version/SceneScope, 수치·Geometry/Material 데이터, validator/manifest/immutable bytes를 검증한다. DTO 상한 32MiB, nodes 100k, attribute scalars 2M, depth128 및 실 메모리·CPU·경과시간 제한을 유지한다. 순환·폭증 BLOCK/파서 비지원 Entity는 **감지·명시 보고**, 조용한 누락·가짜 READY 금지.
3. **완전 READY = 수용한 지원 범위에서 누락 없이 검증된 Scene**이다. 미지원 Entity가 화면 형상이나 업무 의미에 영향을 줄 수 있으면 `PARTIAL/UNSUPPORTED/BLOCKED` 등 정확한 경고/상태로 분리한다. 부분 도면을 검증 없이 READY로 저장하지 않는다. 허용할 부분 표시와 승인 가능한 전체 Scene 게시 여부는 구별한다.
4. 서버는 화면이 아닌 DTO 생성 경로로 무-WebGL 실행한다. **기존 Chromium `--enable-unsafe-swiftshader`를 사용한 테스트 성공만으로 안전한 운영 경로를 승인하지 않는다.** Node 공식 parser는 옵션이며, Node `three-dxf-viewer` 직접 실행의 비동기 `window` 실패는 역사적 NO-GO로 보존한다.
5. 원본 매핑이 불완전해도 일반 렌더 표시·레이어·텍스트·좌표 기반 스냅·구역 기능은 가능한 범위에서 제공한다. 원본 정밀 선택/정확 Handle 연결이 필요한 기능에서만 안정 매핑을 필수로 하고, 안정하지 않으면 안전하게 비활성화한다.

## 4. P1-B 최소 영속 Worker — 개발 허용

- 신규 승인 DXF Version과 SceneBuildJob 생성은 정확한 트랜잭션/동등한 원자성·복구 가능한 enqueue 경계 사용. Version + 원본 SHA + 변환기/DTO 버전으로 멱등 보장. 원본 등록 응답은 QUEUED/Job ID를 반환하고 Worker 실패로 원본 업로드 성공을 번복하지 않음.
- 초기 Worker 동시 실행 **1**. 단일 claim/unique key, 재기동 시 RUNNING stale 복구, 유한 timeout·재시도/수동 재시도, 실패 안전 처리, 중복 publish 방지. **2개 Worker의 lease/fencing/heartbeat·ACK 유실·분산 장애 매트릭스는 초기 개발 및 Pilot 차단 조건에서 제외**하고 실제 다중 Worker 도입 시 요구.
- 기존 G7 Actor/Site/Session/RBAC/Origin/CSRF·writer 관리, 게시 직전 Site Editor 권한 재확인·Audit, SceneRepository full validator와 CurrentScene CAS·기존 READY 불변 유지. Session cookie/token/password를 Job에 저장하지 않음. Worker는 내부 승인 경계를 우회하지 않음.
- 실행 권한은 비루트, 읽기 전용 파일시스템(필요한 제한 임시 디렉터리만), 불필요한 네트워크 차단, CPU/RAM/PID/시간 한도·프로세스 정리. 신뢰된 사내 사용자 입력만 허용해 초기 노출면을 제한하지만 악성/손상 DXF 가능성을 제거했다고 가정하지 않음.
- 생산용 이미지/G7 업그레이드·기존 설치 데이터는 #209/#211/#216 정책과 정합. **PR #223 v2는 구버전0.58.1에서 읽지 못하는 단방향 Scene 호환**이며 downgrade 무조건 허용 불가. Release 시 실 게시 digest/rollback/백업은 별도 GO-PILOT 단계.

## 5. P1-C / P1-D 초기 최소 범위

- 목록 상태 최소 `QUEUED/RUNNING/READY/FAILED`; 필요한 경우 `RETRY_WAIT/BLOCKED/UNSUPPORTED`를 안전하게 구분. Server verified READY와 Browser-only artifact/Fallback을 구별하고 사용자 재시도·사유 표시는 유지. 페이지별 batch 조회, visible pending polling만.
- 앱·Worker 구성과 영속 파일/DB 연결, migration/compatibility 확인, 실제 설치·재시작·실패 후 기존 READY 보존 Smoke를 배포 Gate에 연결. 2PC/다지역/다중 Worker/고급 운영 대시보드는 후속.
- 재접속 시 지원 브라우저 1종 이상에서 원본 GET/재파싱 없이 검증된 Scene Viewer 표시·기본 스냅/메모·구역 회귀를 수행한다. **서버 Headless WebGL 재복원은 요구하지 않음**.

## 6. 필수 검증 범위: 현재 구현분과 실제 실패만

| 단계 | 새 변경이 있을 때 필수 | 부가/후속 증거 |
| --- | --- | --- |
| 현재 정책·문서만 | 링크·정합성·우선순위·변경 경로 점검. 저장소의 현행 required CI는 **YAML 변경 전까지 그대로 실행** | 기존 6 fault/전체 2D fidelity/현장 재실행 |
| Scene DTO/Adapter 코드 PR | 영향 있는 schema v1/v2, Geometry/Material/Index, validator, 실제 지원 브라우저 표시·저장/복원 관련 회귀 + 기존 repository-required CI | 100% Entity 매핑, GPU 없는 서버 WebGL 재복원 |
| 단일 Worker PR | 실제 새 CPU 변환, 파일 검증/원본 불변, 1 Job 중복 방지/재기동·실패 처리, G7 권한·CAS, 목록 최소 상태, 실제 관련 실패 + 기존 repository-required CI | 2 Worker·분산 ACK·모든 고객 CAD |
| 배포/릴리스 | 실제 제품·Worker 이미지 역할/버전·정확 source, 스토리지/재시작 smoke, 백업·승인/운영 복구·관련 CI | 전체 독립 QA/광범위 부하를 매 PR 반복 |

- **현재 실제 이슈**: 연구용 strict `WEBGL_CONTEXT_UNAVAILABLE`은 *서버에 WebGL을 요구하지 않는 정책*에서는 GO-DEV/Worker GO-INTEGRATE 차단 요인이 아니다. 엄격 격리에서의 **실 CPU→DTO 변환 실패**, 실제 Worker validation/storage failure, 원본/권한/READY 손상은 각 경로 도입 시 필수 차단이다. 기존 PR #222의 로그-종료 Race P2는 시험 신뢰성 문제로 수정·회귀 추적하되, 그 자체가 CPU Worker 구현 착수 금지는 아님.
- 역사적 PR #545의 Greenfield 2 FAIL은 #546에서 정확 HEAD 9/9 SUCCESS로 수리되었다. 그 실패를 현재 진행 중인 장애로 남기지 않는다. 기존 CI 경로가 관련 변경으로 실제 실패하면 원인·범위를 수리하며, `skip`·timeout 증가·임의 assert 삭제로 GREEN을 만들지 않는다.
- 증거는 `PASS/PARTIAL/FAIL/NOT RUN`을 구분. 고급 6 fault 주입은 적절한 집중/릴리스 검증으로 유지하되 매번 모두 GO-DEV 차단하지 않는다. CI 작업 구성/branch protection 수정은 **별도 code/CI 변경**이며 이 문서는 실행 중인 required checks를 제거하지 않는다.

## 7. 완료 기준 및 이전 AC 추적

| 신규 AC | 해당 단계의 완료 조건 | 과거 AC |
| --- | --- | --- |
| **L-01** | 승인 2D DXF 1회 업로드→원본 immutable + Job 자동 QUEUED, 브라우저 종료와 무관 | AC01 |
| **L-02** | 독립 단일 CPU Worker가 실제 지원 DXF→DTO/manifest/validator/readback→서버 verified READY; 서버 WebGL 불필요 | AC02/AC04/AC08 |
| **L-03** | 멱등/중단 후 재시작/제한 시간·실패 복구; 중복 Worker 실행·기존 READY 손상 방지 | AC05(단일 Worker 범위) |
| **L-04** | G7 Site/Actor 권한·재검사/CSRF/Origin·감사, SourceSHA/Version/CAS 보존 | AC06 |
| **L-05** | 최소 목록 상태·안전 재시도, 실패/부분 지원 사유, 페이지 필터·메모 검색 회귀 | AC03 |
| **L-06** | 지원 브라우저에서 저장 Scene 표시·핵심 Layer/Text/좌표/기본 선택 복원; 원본 정밀 선택은 검증된 subset만 | AC08 |
| **L-07** | 단일 Worker 배포·버전/DB 호환/저장·백업·복구 smoke, 정확 GHCR 이미지가 필요하면 digest 확인 | AC07 |
| **L-08** | 관련 신규·실제 실패 테스트와 CI·문서 증거, 미지원/미검증 범위 표기 | AC04/AC09 |

**Issue #218은 L-01~L-08의 해당 기능 구현·GO-PILOT 증거 전까지 OPEN.** 위 기준의 단계적 개발을 허용하는 것이지 AC 완료를 선언하는 것이 아니다. #113/#193 실 도면·전체 현장 수용, 다중 Worker, 추가 Entity, 보안·라이선스 신규 의존성 확인은 독립 후속 추적이다. 확장 범위에 실제로 포함되지 않은 미실행 항목을 자동 Scene 기능의 코드 완료 차단 조건으로 사용하지 않는다.

## 8. 구현 순서와 승인 기록

1. **지금:** PR #223의 0.59.0 Scene v2 변경 검증·병합은 별도 유지. 새 정책은 코드 자동 병합/GO-PILOT 승인 아님.
2. **다음:** 브라우저 Renderer에 의존하지 않는 단일 CPU 변환 경로와 Job/Worker 설계·구현 착수(GO-DEV 허용). Parser·Three 데이터 생성만 재사용하고 서버 Canvas/WebGL 무필요를 실제 검증.
3. **이후:** 최소 목록 UI 및 배포/복구 smoke를 통합 후 GO-INTEGRATE·GO-PILOT 순차 판정.
4. 기존 리뷰(#222 process-safety logs final snapshot), CI 실패 이력(#545/546), 기존 v1/v2/릴리스 이슈(#216)는 원장 보존. 운영/보안 정책, 신뢰된 업로드 제약, 미지원 표시 정책을 변경하면 이 ADR/Issue를 같이 갱신한다.

관련: [Issue #218](https://github.com/planner77/layoutManager/issues/218), [PR #221](https://github.com/planner77/layoutManager/pull/221), [PR #222](https://github.com/planner77/layoutManager/pull/222), [PR #223](https://github.com/planner77/layoutManager/pull/223), [Architecture](Architecture.md), [Decisions](Decisions.md), [Requirements](Requirements.md), [TestPlan](TestPlan.md), [FailureLedger](FailureLedger.md).
