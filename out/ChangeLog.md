# ChangeLog

애플리케이션 버전의 단일 기준은 생성 후 `src/package.json`이다. 아직 앱 버전/Release Tag가 없으므로 이번 문서 작업을 기능 Release로 표기하지 않는다.

## Unreleased — 2026-09-07 문서 Bootstrap

### Added

- 간결한 AGENTS 진입 규칙과 요구·Architecture·Database·TestPlan·TestReport·Operation·Decisions 초기 문서.
- 요구 ID와 Acceptance Criteria/예정 구현/Test Case의 추적 관계.
- README 프로젝트/설정/실행 안내 초안 및 기존 변수명을 유지한 .env.example.
- 실제 구현을 시작하지 않는 src directory placeholder.

### Changed

- 기존 .gitignore를 확장해 env·Runtime DB·CAD 원본·Build/cache·임시 파일을 제외.
- 기본 Unit 0을 0A/0B로 분리하고 DWG 실험 7A를 0B 직후에 배치한 구현 계획.

### Tests

- 실제 실행 결과와 범위는 [TestReport](TestReport.md)의 BOOT-20260907-01을 참조한다.
- 애플리케이션 Build/Type Check/Lint/DB/Viewer/E2E 테스트는 구현 전이라 미실행이다.

### Known Issues

- libredwg-web 파싱 후 직접 렌더링 설계 및 전체 구현 계획 확인 대기.
- Git author 미설정 문제는 사용자 제공 정보의 repository-local 설정으로 해결했다. 문서 Commit/Push 결과는 TestReport 참조.
- 실도면/업무 성능 목표 미제공, 앱/library 설치 및 실행 호환성 미검증.

## 향후 버전 정책

Unit 0B 첫 앱 버전은 0.1.0 제안이다. 이후 의미 있는 기능 추가 MINOR, 호환 Bug Fix PATCH, 구조/Contract 근본 변경은 사용자와 협의한다. 실제 버전 변경 시 Added/Changed/Fixed/Tests/Known Issues와 검증한 Commit을 기록하고 README와 대조한다.
