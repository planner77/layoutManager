# CAD Web Viewer P.O.C. — 개발 진입 문서

DXF/DWG 공장·설비 도면을 등록·검색·버전 관리하고 세 CAD 기술의 실제 적용 가능성을 검증한다. 문서와 테스트 근거를 코드와 함께 유지한다.

## 현재 단계와 작업 위치

- 최신 관리 기능은 등록·목록·검색·Location 상세·Current 변경이다. GitHub #1 조치 결과는 TestReport의 U3-20260908을 참조한다. Unit 4 dxf-viewer를 연결했다. 현재 결과는 TestReport의 U4-20260908을 참조한다. 다음 구현은 Unit 5 three-dxf-viewer이다.

- 2026-09-07 사용자가 계획 실행을 승인했다. **DXF 우선 릴리스: 0B→1→2→3→4→5→6→8A→9A**, 이후 별도 MINOR 버전에서 **7A→7B→8B→9B(libredwg-web)**를 진행한다. DWG 선행 실험은 DXF 구현의 선행 조건이 아니다. 승인 범위 내 반복 승인은 요구하지 않는다.
- 프로젝트 Root 아래 `src/`가 애플리케이션 루트이다. 모든 코드·설정·테스트·migration·package/lock 파일은 `src/`에 둔다. `out/`은 Markdown 산출물, `data/`는 Git 제외 런타임 저장소이다.
- 기본 Stack: Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS, SQLite, Prisma 우선, Local Filesystem. 실제 설치 버전과 호환성은 Unit 0B에서 검증·고정한다.

## 반드시 지킬 규칙

- 사업부+사업장+동+층이 Location이다. 내부 ID와 네 필드 Unique를 사용하고 **Location별 Current는 최대 하나**이다. Current 교체는 트랜잭션으로 처리하고 다른 Location의 Version 참조를 DB에서도 차단한다.
- DXF는 `dxf-viewer` / `three-dxf-viewer` 선택, DWG는 `libredwg-web` Adapter만 허용한다. DWG→DXF 우회와 CAD 편집은 범위 밖이다.
- Viewer는 Manager/Adapter로 격리하고 Browser 전용 의존성을 SSR에서 실행하지 않는다. DWG 파서와 직접 렌더링 계층의 구분은 Architecture 및 ADR-004를 먼저 읽는다.
- UI에 DB 업무 규칙·파일 I/O를 넣지 않는다. 파일은 Version ID로 조회하며 임의 filesystem 경로를 받지 않는다.
- `.env`의 기존 `remote_repo_url`, `remote_repo_token` 변수명을 유지한다. 값·인증 헤더·credential URL을 응답, 로그, 문서, 코드, 커밋에 출력하지 않는다. 앱 프로세스에는 Git Credential을 전달하지 않는다.
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
