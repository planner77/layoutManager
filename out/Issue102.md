# Issue #102 — 사내 업무망 경량 운영 정책 (G0 · Owner R1)

작성/Owner 정책 결정: 2026-10-25. 상위 [Issue #96](https://github.com/planner77/layoutManager/issues/96), 하위 [#102](https://github.com/planner77/layoutManager/issues/102). 기준 [ADR-051-R1](Decisions.md). **Owner 업무 정책 6개 승인 / 세부 운영 SOP 후속 / 실제 운영 미활성화**.

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

## 3. 기존 CAD API — Owner 승인 6개 업무 정책 (G7 전 실제 Route 불변)

2026-10-25 Owner 후속 의사결정은 아래의 과거 조회 Reader 필수·삭제 Admin 전용 제안보다 **우선**한다. **기존 공개 CAD Read vs 인증된 쓰기**를 분리한다.

| 화면/API | G7 이후 업무 계약 | Owner 상태 |
| --- | --- | --- |
| 홈 도면 목록·검색, 위치/Current/Version 상세, 기존 Viewer | **사내 LAN 익명 조회 허용**. 로그인·Reader·SiteGrant 요구 없음 | APPROVED |
| `GET /api/cad-files`, `GET /api/cad-locations/:id`, `GET /api/cad-files/:versionId/content` 및 기존 공개 도면 다운로드 | **기존 공개 GET 보존**, 익명 호출 가능. 익명은 특정 사용자/Reader Actor로 가장하지 않고 **모든 기존 공개 Site 도면을 조회 가능**(업무상 Site별 읽기 기밀성 제어 제공 안 됨) | APPROVED |
| `PUT /api/cad-locations/:id/current` | **로그인한 Editor 또는 Admin + 서버가 확인한 담당 Site/Version Grant**. Admin이라도 Site 자동 전체 부여 아님 | APPROVED |
| `DELETE /api/cad-files/:versionId` | **로그인한 Editor 또는 Admin + 담당 Site/Version Grant + 기존 삭제 비밀번호**를 모두 만족(AND). 비밀번호만으로 인증·Scope 대체 불가. 삭제 시 actor·revision 감사 | APPROVED |
| `POST /api/cad-files` | **Owner 승인: 로그인 Editor/Admin + 담당 Site Grant**. 익명 CAD 조회는 업로드 쓰기 권한을 포함하지 않는다. 업무 등록은 Actor·Site/Version 정합성 및 감사 검증 후 G7 활성화 | APPROVED · G0-BIZ-06 |
| `GET /api/health` | 기존 내부 Health Probe 최소 상태 응답 그대로 | EXISTING CONTRACT |
| 신규 Outline/Memo/Type 영속 조회·로그/Audit/관리 API | **익명 CAD 조회 승인 범위 밖**. 각 #98/#83/#65/#60 권한·DB·릴리스 승인 후 별도 계약 | BLOCKED / NOT GRANTED |

**정합성:** 익명 CAD 읽기는 계정/Site Grant로 제한되지 않으므로 사용자별 도면 읽기 기밀성이 필요할 경우 향후 별도 Owner 정책을 결정해야 한다. Reader Role과 Site Grant는 **미래 보호 대상 리소스·업무 쓰기/관리 등 승인된 기능**에만 적용하고, 익명 Actor를 만들어 변경 감사의 주체로 사용하지 않는다. G7 이전에는 기존 공개 조회·등록/Current/삭제 Route, 비밀번호 검증 동작 및 URL/기존 이용자·스크립트 계약을 **변경하지 않는다**.

**전환 계획:** G3/G4에서 로그인된 사용자 Actor/Scope 체크 → G6에서 익명 GET 성공·미로그인 Write 차단·Editor 타 Site 차단·삭제 비밀번호 AND와 기존 CAD/Viewer/Current 회귀·외부 Script 영향 검증 → G7 별도 Owner 활성화 및 실패 시 rollback. 기존 API의 단계별 cutover 일정과 삭제 시 UI 입력 유지 방식은 G7에서 확정한다.

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
| RISK-96-SCOPE | OPEN_FUNCTIONAL | **인증된 Current·삭제 등 쓰기**의 담당 Site/Version 접근 정확성. 익명 공개 CAD GET는 SiteGrant에 의해 제한되지 않음 |
| RISK-96-AUDIT | OPEN_FUNCTIONAL | 365일 보존 후 만료 기록 정리 **방향 승인**, 실행 주기·백업/복원·예외 세칙 미확정 |
| RISK-96-LEGACY | OPEN_FUNCTIONAL | 인증 전환으로 기존 CAD 조회·업로드/Current/삭제 중단 위험 |

`OWNER_ACCEPTED_SCOPE`는 2026-10-25 Owner가 공격 대비·탈취 방어를 비범위로 지정한 **범위 결정 증거**다. 테스트/현장 검증이 실제 없으면 `NOT RUN`으로 표시한다. `OPEN_FUNCTIONAL`과 `OPEN_OPERATIONAL`은 수용되지 않았으며 담당·기일과 시험을 별도 관리한다.

## 5. Owner 6개 승인 업무 정책과 후속 세칙 (2026-10-26)

| 정책 | 승인 내용 | 후속 이관/미확정 |
| --- | --- | --- |
| G0-BIZ-01 | 기존 사내망 CAD 목록·Viewer·파일 읽기 **익명 허용** | 신규 영속 리소스에는 적용 금지; 실제 익명 GET E2E #108 |
| G0-BIZ-02 | Current 지정 **Editor 이상 + 담당 Site** | G4 권한 구현 #106, 실접속 시험 #108 |
| G0-BIZ-03 | 도면 삭제 **Editor 이상 + 담당 Site + 기존 삭제 비밀번호 유지** | 비밀번호 입력/기존 삭제 API·Audit 정상 작동 시험 #108 |
| G0-BIZ-04 | 지정 운영 담당자가 Admin 최초 생성·단발 복구 실행, **Owner가 운영 책임** | 담당자 실명/비밀 파일 공급·회수·단발 SOP 사내 비공개 및 #104 |
| G0-BIZ-05 | 감사 **365일 보존 이후 만료 기록 정리** 방향 승인 | 정리 주기·자동/수동·기록 예외 및 백업 사본 보존/복구는 #106/#108/#109에서 별도 확정, 지금 자동 파기 금지 |
| G0-BIZ-06 | **도면 등록 POST = 로그인 Editor 이상 + 담당 Site** Owner 추가 승인 | #106 서버 업무권한·Audit, #108 실증, #109 별도 운영 활성화 Go/No-Go; 기존 POST 동작 G7 전 불변 |

**G0 업무 정책 확정:** 기존 공개 CAD GET는 사내망 익명, 도면 등록 POST와 Current PUT은 Editor 이상+담당 Site, Version DELETE는 Editor 이상+담당 Site+기존 삭제 비밀번호. 미정은 신규 보안 정책이 아닌 **운영 실행 세칙**: Nginx/DEV 실제 바인딩(#107/#108), Admin 실수행자/Secret SOP(#104), Audit 만료 정리·백업/Restore(#106/#108/#109), API cutover/rollback(#109). 각 후속 이슈에 명시적으로 이관한다.

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

- **G0 AC-1:** G0-BIZ-01~06 Owner 업무 정책 승인 및 PROD/DEV 범위 문서화. 운영 세칙은 #104/#106/#107/#108/#109에 위임하고 실행·현장 검증 완료라고 주장하지 않는다.
- **G0 AC-2:** 공격·탈취 위험의 범위 수용 상태 및 안전성 미검증이 명시됨. 모의 공격·추가 보안 서명은 불요.
- **G0 AC-3:** 서버 API/Prisma/DDL/Nginx/Compose/.env/운영 데이터 **변경 0**; #96 OPEN/BLOCKED.
- **G0 AC-4:** ADR-051-R1·AGENTS·Architecture·Operation·Requirements·TestPlan·#96~#109 일치 및 **본 Owner 추가 승인 전용 docs-only PR 최신 HEAD의 CI/리뷰/병합 결과**를 별도 확인 후 완료 판정.

**증거 등급:** `OWNER_CONFIRMED` = 정책 결정, `PROPOSED` = 미승인 권장안, `PENDING` = 업무·운영 결정 필요, `NOT RUN` = 테스트 미실행, `PASS` = 실제 해당 HEAD/환경 실행 확인에 한함. 본 문서만으로 G0 완료/운영 활성화/G7 승인 또는 테스트 PASS로 기록하지 않는다.
