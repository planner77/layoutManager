# GitHub #24 — 기준정보 계층 및 층별 Current

## Manager 요구사항·설계·수용 기준 (2026-10-15, 구현 전)

목표 버전 0.25.0. 작업은 격리 worktree 및 임시 DB/원본에서 수행한다. 운영 DB migration·배포는 범위 밖이다. 사용자 지정 역할은 Manager gpt-6-astra → Developer gpt-5.6-sol → 독립 QA gpt-5.6-luna이며 지정 모델 실행 실패 시 실제 대행/근거를 TestReport에 기록한다. root만 commit/push/PR를 수행한다.

### 범위와 모델 결정

- 사업부 → 제품 → 사업장/법인 → 동 → 층의 다섯 단계 기준정보를 내부 불변 ID로 관리한다. 이름은 trim/NFC, 부모별 중복 금지, FK로 존재·소속을 강제하며 층은 B2/1F/M 등 문자열이다.
- 기존 CadLocation은 최종 층의 식별자로 보존한다. 신규 상위 master와 연결하되 기존 Location/Version UUID, 순번/nextVersion, Current, 원본 filename/bytes/hash/storage locator, 등록일, 설명, 사용자 이름, 비밀번호 hash는 유지한다. 상세 schema 단일 기준은 Database.md이다.
- 동일한 사업장/동 명칭이 여러 제품에서 재사용되어도 이번 단위에서는 제품별 운영 계층으로 구분한다. 공통 물리 자산 식별자가 없는 기존 문자열을 전사 공통 site로 추정 병합하지 않는다. 제품이 다르면 층/버전/Current도 독립이다. 이후 실제 공통 자산 요구가 생기면 별도 물리 Site master+제품 연결 테이블로 확장한다.
- 사업장/법인 노드는 명시적인 kind(SITE 또는 LEGAL_ENTITY)로 구분하고 UI에서 종류를 표시/편집한다. 법인 이름이 물리 주소를 뜻한다고 간주하지 않는다. 기존 site 문자열은 SITE로 이관하고 운영자가 확인·수정한다. 주소/법인 소유 관계 추정은 하지 않는다.
- 기준정보 생성/조회/이름·종류 편집/비활성화·재활성화 UI/API를 제공한다. 이력 참조가 있는 master는 물리 삭제하지 않는다. 안전한 삭제는 참조·자식 없는 항목에만 허용하거나 삭제를 비활성화로 명확히 정의한다. 부모 이동은 일반 편집에 포함하지 않는다. 미분류 층 재분류는 별도 명시 동작으로 한 층과 그 전체 이력을 새 유효 계층으로 재연결하며 UUID/Current/순번을 보존하고 충돌은 거부한다.
- 이관 시 사업부별 명시적인 미분류 제품을 생성한다. 제품을 이름/파일명으로 추정하지 않는다. 미분류를 UI에 표시하고 관리자가 실제 제품·사업장·동을 준비해 층 전체를 재분류하는 절차를 제공한다.

### 동작·호환성

- 등록은 다섯 개 연동 dropdown이다. 부모 변경 시 모든 자식 선택을 지우며 빈 목록/로딩/오류를 설명한다. 서버는 존재하고 활성인 완전한 ID chain만 허용한다. 클라이언트 label이나 과거 자유 문자열로 master를 자동 생성하지 않는다. transaction 안에서 chain을 재검증한다.
- 비활성 자신/조상을 포함한 chain의 신규 등록은 거부한다. 기존 목록/상세/원본/Viewer/직접 링크와 이력은 읽을 수 있다. 기준정보 이름 변경은 조회에 반영하되 file metadata와 UUID는 유지한다.
- 층별 Current는 0/1, 선택 교체는 transaction, 소속은 기존 (locationId, versionId) 복합 FK로 강제한다. 다른 층/제품 Current는 API와 직접 SQL 모두 거부한다. 동시 변경은 직렬화된 마지막 성공 commit, 실패는 이전 상태 유지이다.
- 목록·검색·필터·상세·Viewer·삭제·공유 위치 표시에는 제품을 포함하고 master 이름을 사용한다. #6 기본 이름 형식 `[사업부][사업장][동][층]_V번호`는 호환성을 위해 유지하며 제품은 별도 위치 metadata로 명확히 표시한다. 사용자 입력 drawingName 우선순위·원본 파일명 보존은 동일하다. 기존 `filename` 검색 계약은 원본 파일명 부분 일치만 유지하며 기본/사용자 표시 이름 검색으로 확장하지 않는다.
- 기존 global loading, same-origin, 요청 ID/안전한 구조화 로그, 제한된 body 읽기와 비밀번호/원본 정리 계약을 유지한다. 인증 체계나 Viewer 변경은 범위 밖이다.

### 수용 기준 및 시험 추적

| ID | 수용 기준 | 검증 |
| --- | --- | --- |
| TC-MASTER-001 | 다섯 계층 생성/조회/중복 거부/편집/비활성화/재활성화, 부모 FK 및 불변 ID | Domain/DB/API |
| TC-MASTER-002 | 연동 dropdown 부모 변경 reset, 빈 목록/필수/활성 chain 검증, 변조·다른 부모·비활성 ancestor 거부 | API + Browser |
| TC-MASTER-003 | 한 층 3개 이상 Version/Current 교체·동시 경쟁·rollback, 다른 층/제품 거부 | DB integration + API |
| TC-MASTER-004 | 제품 표시/검색/filter, 기본·사용자 이름, detail/Viewer/delete/share 회귀, 비활성 이력 읽기 | Browser + integration |
| TC-MASTER-005 | legacy populated DB→migration→미분류→명시 재분류, UUID/행 수/순번/Current/metadata/hash/password/원본 bytes 보존, FK/중복 검사 | isolated migration integration |
| TC-MASTER-006 | 기준정보 삭제 정책/이름 변경 영향/재분류 충돌/활성 ancestor 검증, 오래된 client로 신규 문자열 업로드 차단 | API + Browser |
| TC-MASTER-007 | build/typecheck/lint/전체 unit integration 및 전체 기존 E2E 통과 | QA 재실행 |

Migration은 새 master 생성→legacy dedup/backfill→연결 제약/검증 단계로 검토 가능하게 작성한다. SQLite 변경이 기존 table 재구성을 필요로 하면 정확한 보존 검증을 먼저 구현한다. production 적용 절차는 쓰기 중지→DB와 local/S3 원본 일관 백업→복제본 dry run→행 수/FK/중복/Current/UUID·metadata·hash 비교→새 이미지 migration→readiness/업무 smoke 순서다. 실패 시 새 앱 중지 후 DB와 원본의 같은 시점 백업 복구 및 이전 이미지로 복귀한다. 새 schema에 이전 이미지만 붙이는 rollback은 금지한다. 구버전의 문자열 신규 등록으로 미연결 층을 만들지 못하도록 DB 제약도 둔다.

## Developer 구현·자체 검증 (독립 QA 전)

- `202610150001_master_hierarchy`와 Prisma 모델에 다섯 master, SITE/LEGAL_ENTITY, 명시적 `is_unclassified`, 층 FK를 구현했다. CadLocation UUID/Current/nextVersion/timestamps와 Version 행을 복사하고 행 수·연결·FK guard를 commit 전에 검사한다.
- `/api/masters`, master 수정/삭제, 층 재분류 API 및 `/masters` 관리 UI, 등록 연동 dropdown을 추가했다. ID/부모/미분류 표식은 변경할 수 없고 참조 항목 삭제는 거부하며 미분류 층만 활성 실제 제품으로 전체 이력을 옮길 수 있다.
- 목록·필터·Location·Viewer·삭제 표시를 master join으로 전환했다. 제품과 사업장/법인 종류를 별도 표시하고 기본 이름 네 부분 형식은 유지한다. `filename` 검색은 기존 계약대로 원본 파일명 부분 일치이며 표시 이름 검색으로 확장하지 않았다.
- Developer 자체 실행: `db:generate`, `typecheck`, `lint`, 25 files/109 Vitest, production build, 빈 임시 DB `db:deploy`, local Browser 38개가 통과했다. 보강 후 master Browser 3개, 실제 pre-0.25 DB→`db:deploy`→Browser 재분류 1개, SeaweedFS S3 6개, 고정 실제 DWG 4개도 통과했다. 이관 검증은 실제 scrypt와 migrated-row password 검증, 원본 bytes/SHA-256, 두 사업부의 동일 명칭 분리, UUID/Current/순번/metadata 및 재분류 후 전체 이력을 확인한다.
- commit/push/운영 DB 적용/배포는 수행하지 않았다. 독립 QA 전 상태는 IN_PROGRESS다.

## 독립 QA 결과 (2026-10-15)

gpt-5.6-luna가 source frozen 상태에서 `db:generate`, typecheck, lint, build, 25 files/109 Vitest, 전체 E2E 38개, legacy migration 1개, S3 6개, DWG 4개를 독립 실행해 모두 통과시켰다. migration rollback/count/FK guard와 UUID·Current·순번·metadata·scrypt hash·원본 bytes/SHA 보존, active ID-chain·Current 복합 FK·재분류 collision guard를 source/test로 검토했다. `/masters`, upload, reclassification UI는 1440px/390px 캡처와 DOM overflow 확인을 완료했다. Benchmark는 Developer의 별도 결과를 인용하고 QA에서 재실행하지 않았다. 판정은 FR-MASTER-001~007 및 TC-MASTER-001~007 PASS/VERIFIED이며 운영 DB/배포와 root publication은 별도 범위다.

## Manager 최종 수용

2026-10-15: 지정 Developer와 독립 QA의 실제 결과 및 source/시각 검토를 근거로 FR-MASTER-001~007 구현을 수용한다. 0.25.0 source는 root의 최종 commit/push/PR·CI 시작 단계로 인계한다. 운영 migration·배포는 수행하지 않았다. 상세 근거는 TestReport U-ISSUE24-QA-20261015 및 Manager 판정을 따른다.

## Root 원격 게시

2026-10-15: source `e8189b4543ce53b00a6c2feb02e0eae3f125263b`를 지정 저장소의 `feat/issue-24-master-hierarchy`에 게시했다. stage 67개 파일의 Secret/런타임 검사 위반은 0건이며 원격 Git tree와 검증한 local index가 일치했다. 최신 main은 작업 브랜치의 조상이므로 병합 충돌이 없다. 기존 열린 PR은 없으며 새 PR의 opened 이벤트로 PR CI를 시작한다. CI 결과 모니터링·병합·운영 migration·배포는 이번 작업에서 수행하지 않는다.

## PR #27 리뷰 보완 (2026-10-16)

- Code Review의 P2 지적을 반영해 미분류 층 재분류 기준정보 GET에서 HTTP 오류와 잘못된 `items` 구조를 예외 처리하며, 오류 시 빈 초기 트리와 안내를 유지하도록 개선한다.
- TC-MASTER-008로 503 JSON 오류 재현, 오류 안내·도면 버전/폼 유지, 복구 후 기존 정상 재분류를 검증할 Browser 시나리오를 추가한다.
- 0.25.0 병합 전 오류 보완으로 별도 버전 증가 없음. 기존 독립 QA 통과를 신규 커밋 테스트 PASS로 소급 적용하지 않으며 새 PR CI에서 검증한다. 운영 DB migration·배포는 수행하지 않는다.

### PR CI #28 실패 원인 및 보완 (2026-10-16)

- Run `38852895275`에서 정적 검사·단위/통합·빌드는 성공, E2E 37 PASS/1 FAIL, legacy migration E2E SKIPPED. 신규 TC-MASTER-008의 전역 `getByRole("alert")`가 재분류 오류 안내와 Next.js `__next-route-announcer__`의 두 `role=alert`를 동시에 선택해 strict mode violation이 발생한 것이 직접 원인이다.
- 재분류 `form` 범위에 한정한 오류 안내 locator로 수정하고 성공/실패 응답에 대한 기존 검증 의도를 유지한다. 서비스 코드와 데이터 모델은 변경하지 않으며, 수정 후 실제 CI 성공 여부는 새 PR CI에서 확인한다.
