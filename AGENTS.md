# CAD Web Viewer P.O.C. — 개발 진입 문서

DXF/DWG 공장·설비 도면을 등록·검색·버전 관리하고 세 CAD 기술의 실제 적용 가능성을 검증한다. 문서와 테스트 근거를 코드와 함께 유지한다.

## 현재 단계와 작업 위치

- 최신 관리 기능은 등록·목록·검색·Location 상세·Current 변경이다. GitHub #1 조치 결과는 TestReport의 U3-20260908을 참조한다. Unit 4 dxf-viewer를 연결했다. 현재 결과는 TestReport의 U4-20260908을 참조한다. Unit 5에서 three-dxf-viewer와 한글 기본 글꼴을 연결했다. 최신 결과는 U5-20260908을 참조한다. Unit 6에서 새로고침 없는 전환과 원본 공유를 연결했다. 최신 결과는 U6-20260908을 참조한다. Unit 8A에서 측정 UI/JSON 및 반복 비교를 추가했다. U9A-20260908에서 DXF 전체 흐름 및 20회 전환 회귀를 검증했다. Unit 7A에서 libredwg-web의 실제 DWG LINE parse/render/free 독립 실험을 검증했다(U7A-20260908). Unit 7B에서 등록 DWG Viewer 통합과 기본 탐색/오류/재진입을 검증했다(U7B-20260908). 사용자 요청 Unit S3에서 선택적 S3 호환 저장소를 추가했다(U-S3-20260908). 앱 버전은 0.13.0, 사용자 요청 Unit LINK의 특정 Version 직접 링크를 추가했다(U-LINK-20260908). 사용자 요청 Unit DEPLOY에서 Docker 배포/host IP 접속 구현·실행 검증을 완료했다. GHCR 게시 결과는 U-DEPLOY-20260908의 별도 게시 기록을 확인한다. 다음 승인 Unit은 8B DWG 계측 및 평가이다. DWG는 현재 평면 LINE/20 MiB 범위이며 제외 Entity는 partial로 기록한다. 실도면 평가는 미완료이며 원격 이슈 #2 등록 메모는 별도 후속 요청이다.

- 2026-09-07 사용자가 계획 실행을 승인했다. **DXF 우선 릴리스: 0B→1→2→3→4→5→6→8A→9A**, 이후 별도 MINOR 버전에서 **7A→7B→8B→9B(libredwg-web)**를 진행한다. DWG 선행 실험은 DXF 구현의 선행 조건이 아니다. 승인 범위 내 반복 승인은 요구하지 않는다.
- 팀 역할 매핑: gpt-6-astra Manager가 범위·승인을 조정하고, gpt-5.6-sol Developer가 구현하며, gpt-5.6-luna QA가 검증·문서화 후 Manager에게 결과를 보고한다. Manager가 재작업 여부를 결정하고 root가 최종 release commit/push를 담당한다.
- 이 팀 운영은 새 스레드·새 세션에도 적용한다. Manager는 먼저 요구사항/설계/AC를 기록하고 Developer에게 구현을 지시한다. Developer 완료 보고를 검토한 후 QA에 테스트·문서화를 지시한다. QA 보고를 근거로 Manager가 완료 또는 재작업을 결정한다. 모델 사용량 제한 등으로 지정 역할을 실행할 수 없으면 이를 보고하고 실제 대행 주체와 검증 근거를 TestReport에 남긴다. 역할을 실행하지 않고 실행한 것처럼 기록하지 않는다.
- Docker 배포 파일은 `src/Dockerfile`, `src/docker-compose.yml`이다. Root build context의 Secret 차단에 필요한 `.dockerignore`만 Root에 둔다. 이미지에는 `.env`/Git 인증/사용자 CAD/DB를 넣지 않고 앱 설정만 런타임에 전달한다. 단일 SQLite 인스턴스이며 여러 replica를 같은 DB에 붙이지 않는다.
- 프로젝트 Root 아래 `src/`가 애플리케이션 루트이다. 모든 코드·설정·테스트·migration·package/lock 파일은 `src/`에 둔다. `out/`은 Markdown 산출물, `data/`는 Git 제외 런타임 저장소이다.
- 기본 Stack: Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS, SQLite, Prisma 우선, Local Filesystem(default)/선택적 S3 호환 저장소. 실제 설치 버전과 호환성은 Unit 0B에서 검증·고정한다.

## 반드시 지킬 규칙

- 사업부+사업장+동+층이 Location이다. 내부 ID와 네 필드 Unique를 사용하고 **Location별 Current는 최대 하나**이다. Current 교체는 트랜잭션으로 처리하고 다른 Location의 Version 참조를 DB에서도 차단한다.
- DXF는 `dxf-viewer` / `three-dxf-viewer` 선택, DWG는 `libredwg-web` Adapter만 허용한다. DWG→DXF 우회와 CAD 편집은 범위 밖이다.
- Viewer는 Manager/Adapter로 격리하고 Browser 전용 의존성을 SSR에서 실행하지 않는다. DWG 파서와 직접 렌더링 계층의 구분은 Architecture 및 ADR-004를 먼저 읽는다.
- UI에 DB 업무 규칙·파일 I/O를 넣지 않는다. 파일은 Version ID로 조회하며 임의 filesystem 경로를 받지 않는다.
- `.env`의 기존 `remote_repo_url`, `remote_repo_token` 변수명을 유지한다. 값·인증 헤더·credential URL을 응답, 로그, 문서, 코드, 커밋에 출력하지 않는다. 앱 프로세스에는 Git Credential을 전달하지 않는다.
- S3의 endpoint/bucket/credential은 서버 환경변수로만 관리한다. 저장 locator별 local/S3를 조회하며 기존 원본을 자동 이동하지 않는다. 원격 PUT은 DB transaction 전에 수행하고 불확실한 완료 응답을 이유로 원본을 삭제하지 않는다.
- Secret, Runtime DB, CAD 원본, 캐시, Build 결과, Debug dump는 커밋하지 않는다. 외부 라이브러리를 먼저 수정하지 말고 Wrapper 해결과 영향 분석을 우선한다.
- 지원 여부, 공식 문서의 주장, 실제 시험 결과, 추정을 구분한다. 미실행을 PASS로 기록하지 않는다.

## 작업 Workflow와 완료 기준

1. 재개 시 이 문서 → README → 안전하게 확인한 Git 상태/remote/branch/log → package version → ChangeLog → TestReport → 해당 상세 문서를 읽는다. 기존 변경을 보존한다.
2. 승인 범위 내 다음 최소 Unit의 요구사항·Acceptance Criteria·Test Case를 먼저 확인/갱신하고 구현한다. 중요한 업무 규칙·구조 변경·데이터 손실 위험만 확인하며 세부 구현은 자율 판단한다.
3. Build, Type Check, Lint, 관련 자동 테스트, 필요한 E2E/수동 시험을 통과시킨다. 실패를 해결하기 전 다음 Unit으로 넘어가지 않는다. Unit 0A는 코드 없는 문서 검사만 적용한다.
4. 관련 상세 문서, 추적 관계(요구사항→구현→TC→결과), README를 갱신한다. DB Schema의 단일 기준 문서는 `out/Database.md`이다.
5. `git status`, `git diff`, staged diff와 Secret/산출물 포함 여부를 검토한다. 작업 요약 후 Conventional Commit(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`)을 작성한다.
6. `.env`가 지정한 remote만 사용한다. Push 전 remote 정합성·비밀정보·CAD·DB 제외를 재확인한다. Force Push, History Rewrite, 기존 Commit/Branch 삭제는 사용자 승인 없이 금지한다. 작성자 설정이 없으면 임의 신원을 만들지 않는다.
7. 앱 버전 기준은 `src/package.json`의 SemVer `0.x.y`이다. 기능 추가 MINOR, 호환 Bug Fix PATCH, 근본 변경은 사용자와 협의한다. README/ChangeLog를 일치시키고 테스트·커밋 후 의미 있는 Release에만 Tag를 검토한다.
8. Unit 완료 보고에는 변경·테스트·문제·설계/문서 변경·Commit·Push·버전·다음 Unit을 포함한다. 완료 조건이 부족하면 진행 중/보류로 표시한다.

## 상세 문서와 필수 참조 시점

| 문서 | 목적 | 반드시 참조하는 상황 |
| --- | --- | --- |
| [Requirements](out/Requirements.md) | 상세 기능/비기능 요구사항, 범위 | 기능 추가·수정·삭제 전 |
| [Architecture](out/Architecture.md) | 구조와 Component 책임 | 구조 변경, 신규 Module, Viewer 변경 시 |
| [Database](out/Database.md) | Schema 및 변경 이력 | Table/Column/Index/Constraint 변경 전후 |
| [TestPlan](out/TestPlan.md) | Unit, Acceptance Criteria, Test Case | 구현 Unit 시작 전 |
| [TestReport](out/TestReport.md) | 실제 테스트 및 Viewer 평가 | Unit 완료 및 Release 전 |
| [Operation](out/Operation.md) | 설정·Build·실행·장애 대응 | 환경 또는 실행 방법 변경 시 |
| [Decisions](out/Decisions.md) | 주요 판단, 승인 상태, Trade-off | 중요한 선택 또는 기존 결정 변경 시 |
| [ChangeLog](out/ChangeLog.md) | 버전별 변경사항 | Version 변경 또는 Release 시 |
| [README](README.md) | 사용자/개발자 프로젝트 안내 | 기능·구조·설정·실행방법 변경 시 |

추가 Markdown 문서가 필요하면 이 표에 목적과 필수 참조 시점을 등록한다. 상세정보를 여러 문서에 독립적으로 복제하지 않는다.
