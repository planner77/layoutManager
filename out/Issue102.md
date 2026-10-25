# Issue #102 — 사내 업무망 경량 운영 정책 (G0 · Owner R1)

작성/Owner 정책 결정: 2026-10-25. 상위 [Issue #96](https://github.com/planner77/layoutManager/issues/96), 하위 [#102](https://github.com/planner77/layoutManager/issues/102). 기준 [ADR-051-R1](Decisions.md). **문서 초안/운영 미활성화**.

## 1. 적용 전제 및 범위

| 항목 | 결정 | 상태 |
| --- | --- | --- |
| 사용자 | 공개망으로부터 인바운드가 제한된 내부 네트워크의 내부 사용자 | OWNER CONFIRMED |
| 운영 접속 | 내부 사용자 PC → Nginx 단일 사용자 진입점(HTTP) → App → SQLite/CAD/S3 | OWNER CONFIRMED |
| 개발 접속 | 개발 PC → 별도 개발 App에 직접 접속, Nginx 불필요 | OWNER CONFIRMED |
| 공격·탈취 대비 | 별도 보안 강화·침투시험·자격증명/세션 탈취 방어 E2E는 기능 개발/운영 승인 필수조건이 아님 | OWNER ACCEPTED SCOPE |
| 운영 활성화 | G0~G6 설계·격리 테스트와 G7 별도 Owner Go/No-Go 완료 전 OFF | BLOCKED |
| 운영 상세 | 실제 IP/CIDR/포트, Secret, 내부 방화벽 룰은 비공개 내부 운영자료로 관리 | PENDING OPERATIONS |

- **정책상의 위험 수용**: HTTP는 비암호화이므로 동일 망에서 비밀번호·세션 쿠키가 노출/변조될 수 있다. 외부 인바운드 제한이 이 위험을 제거하거나 TLS 수준의 보호를 보장하지 않음을 알면서 **추가 공격·탈취 대응을 이번 범위에서 제외**한다. 여기서 OWNER_ACCEPTED_SCOPE는 위험 수용 **결정**이지 보안성 검증 PASS, 기능/운영 Go-Live 승인 또는 규제상 준수 판정이 아니다.
- **보안 강화 비범위**: TLS/HTTPS 인증서, OIDC/SSO/MFA, WAF/IDS, 모의침투, 패킷 도청/탈취 실험, 헤더 위조/CSRF/브루트포스 공격 시뮬레이션, 내부 사용자별 상세 CIDR·ACL 강제 구축 및 고도화된 KDF/쿠키 강화 게이트.
- **기존 코드 유지**: 이미 작성된 비활성 scrypt/Session/Origin/CSRF 헬퍼를 제거하거나 취약하도록 변경하라는 결정이 아니다. 과도한 적대적 위협 시험을 추가하지 않을 뿐, 정상 동작·장애 회귀 시험은 계속한다.
- **업무 기능 필수**: 기존 승인 D1~D5의 계정별 식별·Admin 단발 초기화/복구·비밀번호 최소 8자+scrypt·세션 8h/30m/3개·Reader/Editor/Admin 및 Site/Version 검증·Audit 365일, 서버 데이터 정합성/원자성, 로그 비밀값 제외, PROD/DEV 환경 분리, 배포/복구는 유지한다.

## 2. G0 신뢰 경계 (운영 환경 안전성 주장 아님)

```text
PROD: 내부 PC ── HTTP ──> Nginx ── HTTP/upstream ──> App ──> SQLite/CAD/S3
DEV:  개발 PC ── HTTP ────────────────────────> 개발 App ──> 개발 DB/데이터
```

- 현행 `src/docker-compose.yml`은 `host_ip: 0.0.0.0`, 기본 publish 3000이다. 이 설정만으로 PROD의 'Nginx 단일 사용자 진입'이 보장됐다고 주장할 수 없다. #107 G5에서 배포 경로·호스트·포트·Proxy upstream·환경변수·정상 Viewer/업로드/Health 동작을 **격리 환경**에서 점검하고, 실제 설정은 G7 승인 후에만 반영한다.
- 운영에서는 일반 사용자 브라우저에 App direct URL을 안내하지 않으며 개발 직결 설정을 운영 환경에 복제하지 않는다. 이 점검은 **배포 정합성 및 실수 방지**이며 침입방어 보안인증이 아니다.
- 실제 사내 IP/CIDR/포트·계정명·Secret/토큰·CAD 데이터는 공개 GitHub/CI에 넣지 않는다.

## 3. 기존 CAD API의 로그인 전환 (G7 전 변경 금지)

| API/화면 | G7 이후 권장안 | 결정 |
| --- | --- | --- |
| 목록·검색·Viewer·원본 내려받기, GET /api/cad-files, GET /api/cad-locations/:id, GET /api/cad-files/:versionId/content | Reader 이상 + 업무상 허용 Site/Version | PROPOSED |
| POST /api/cad-files | Editor 이상 + 담당 Site | PROPOSED |
| PUT /api/cad-locations/:id/current | Editor 이상 + 담당 Site, Current 관리 권한 분리 여부 | PENDING |
| DELETE /api/cad-files/:versionId | Admin + 담당 Site, 기존 삭제 비밀번호 병행 여부 | PENDING |
| GET /api/health | 내부 Health Probe의 최소 상태 응답 | PROPOSED |

전환 전 기존 외부 스크립트/북마크/API 소비자의 호환성, 401/403 및 변경자 귀속을 확인한다. 도면 원본 bytes/SHA, CadFileVersion/Current, Viewer, 기존 삭제 비밀번호 및 현재 API 동작을 G0에서 바꾸지 않는다. #98/#60/#65/#83의 영속 API는 자체 독립 운영 승인이 필요하다.

## 4. 위험등록부 — 완료 기준으로 사용하지 않는 보안 위험

| 위험 ID | 결정 상태 | 남는 위험 / G7과의 관계 |
| --- | --- | --- |
| RISK-96-HTTP | OWNER_ACCEPTED_SCOPE | HTTP 비암호화·도청/변조 가능; 별도 완화·보안실증 필수 아님 |
| RISK-96-PASSWORD | OWNER_ACCEPTED_SCOPE | 최소 8자 추측/재사용 위험; 기존 최소 8자 기능 구현은 유지 |
| RISK-96-SESSION | OWNER_ACCEPTED_SCOPE (탈취 부문) | HTTP 쿠키 탈취 위험. 반면 세션 8h/30m/3개/회수의 **기능**은 필수 |
| RISK-96-ORIGIN | OWNER_ACCEPTED_SCOPE (공격 부문) | Header/Origin/CSRF 위조 침투시험은 필수 아님. 정상 Proxy/API/쿠키 동작 검증은 필수 |
| RISK-96-PORT | OPEN_OPERATIONAL | PROD Nginx 경유, DEV 직접 접속의 실제 배포 경로 확인 필요 |
| RISK-96-DEV | OPEN_OPERATIONAL | 개발·운영 DB/설정 혼용 없이 운영 기능 정확성 보장 |
| RISK-96-ADMIN | OPEN_FUNCTIONAL | 초기화 재실행·복구 nonce·역할 변경이 잘못 수행되지 않음 |
| RISK-96-SCOPE | OPEN_FUNCTIONAL | 업무상 다른 Site/Version 접근 허용/거부의 정확성 |
| RISK-96-AUDIT | OPEN_FUNCTIONAL | 감사 365일·조회권한·만료 후 파기/백업 정책 미확정 |
| RISK-96-LEGACY | OPEN_FUNCTIONAL | 인증 전환으로 기존 CAD 조회·업로드/Current/삭제 중단 위험 |

`OWNER_ACCEPTED_SCOPE`는 2026-10-25 Owner가 공격 대비·탈취 방어를 비범위로 지정한 **범위 결정 증거**다. 테스트/현장 검증이 실제 없으면 `NOT RUN`으로 표시한다. `OPEN_FUNCTIONAL`과 `OPEN_OPERATIONAL`은 수용되지 않았으며 담당·기일과 시험을 별도 관리한다.

## 5. 업무·운영 미확정 항목

1. 운영 Nginx/upstream 경로 및 개발 App/DB 분리 실행 방법, 설정·배포 담당자(구체 주소는 비공개).
2. 기존 조회/등록/Current/삭제 API의 Reader/Editor/Admin 권한 매트릭스 및 기존 삭제 비밀번호 병행 처리.
3. 초기 Admin·복구 절차의 실행 책임자, Secret 파일 공급/경로와 작업 기록. 새로운 침해 대응 승인체계는 필수 아님.
4. Audit 365일 만료 시 파기·백업 보존/복원·예외 처리 방법.
5. 기존 API 사용자/스크립트 호환성과 G7 단계별 활성화·롤백.

## 6. G0~G7 인계 및 검증

| 단계 | 필수 기능·운영 수용 | 공격 방어 별도 시험 |
| --- | --- | --- |
| G0 #102 | 범위·위험의 정책상 수용·접속 경로·미확정 업무 결정·문서/AC 정렬 | 비범위 |
| G1 #103 | User/Session/Grant/Audit/RecoveryNonce DB 모델·원자성·격리 migration | 비범위 |
| G2 #104 | Admin 단발 초기화/복구·재시작 무변경·기본 Secret 처리 | 비범위 |
| G3 #105 | 로그인/로그아웃·세션 TTL/3개·회수·정상 Cookie·API | 공격/탈취 시뮬레이션 비범위 |
| G4 #106 | Role/Site/Version·Grant·감사·동시성/권한 기능 | 모의침투 비범위 |
| G5 #107 | PROD Nginx/DEV direct의 배포 경로·일반 요청·Viewer/Health 동작 | Header/Origin 위조·침투 비범위 |
| G6 #108 | 실제 사내 PC 정상 업무 E2E, DB/CAD/S3 Backup→격리 dry-run→Restore, 회귀·실패 원장 | 보안 공격 E2E 비범위 |
| G7 #109 | 별도 Owner 운영 Go/No-Go, 정식 배포·Migration·롤백 및 승인 범위 | 추가 보안 서명 필요 없음 |

- **G0 AC-1:** 네트워크와 개발/운영 경로가 구분돼 있고 업무 권한 전환안/미확정 결정이 문서화됨.
- **G0 AC-2:** 공격·탈취 위험의 범위 수용 상태 및 안전성 미검증이 명시됨. 모의 공격·추가 보안 서명은 불요.
- **G0 AC-3:** 서버 API/Prisma/DDL/Nginx/Compose/.env/운영 데이터 **변경 0**; #96 OPEN/BLOCKED.
- **G0 AC-4:** ADR-051-R1·AGENTS·Architecture·Operation·Requirements·TestPlan·#96~#109 일치 및 docs-only PR/CI 결과 별도 추적.

**증거 등급:** `OWNER_CONFIRMED` = 정책 결정, `PROPOSED` = 미승인 권장안, `PENDING` = 업무·운영 결정 필요, `NOT RUN` = 테스트 미실행, `PASS` = 실제 해당 HEAD/환경 실행 확인에 한함. 본 문서만으로 G0 완료/운영 활성화/G7 승인 또는 테스트 PASS로 기록하지 않는다.
