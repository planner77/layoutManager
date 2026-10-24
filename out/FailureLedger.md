# PR/Main CI 실패 원장

실패를 관측한 경우 아래 템플릿에 **실제 Run URL, job/step, log 증거, 원인/수정 Commit, 재실행 Run, 결과**를 누적 기록한다. 취소된 실행은 실패와 구분해 보존한다. 미실행 테스트는 성공으로 표기하지 않는다. 이 파일은 #38부터 사용하는 신규 공통 원장으로, 기존 이슈별 실패 기록은 역사적 `out/TestReport.md`와 개별 Issue 문서를 참조한다.

| 날짜(KST) | Issue / PR / Run | 실패·취소 또는 현재 상태 | 근거와 원인 | 조치·커밋 | 새 CI / 검증 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-24 | #38 / PR 미생성 시점 | **CI 착수 전, 실패 관측 없음** | 신규 U1 코드·문서, 로컬 test 미실행. 첫 CI 로그 미확보 | 기능 브랜치 `feat/issue-38-viewer-app-shell`; unit/E2E 회귀 추가 | PR 생성 시 `pull_request.opened`로 PR CI 자동 시작; 결과 모니터링/성공 판정하지 않음 |

## 기록 템플릿

- Issue/PR/Head SHA/Run URL/Attempt:
- 상태: FAIL / CANCELLED / SKIPPED / BLOCKED / NOT RUN
- 실패 Job·Step / 원문 Error / 로그·Artifact 출처:
- 근본 원인 / 재현 / 영향·다른 원인 배제 근거:
- 수정 내용·Commit / Reviewer Thread / 충돌:
- 실행한 로컬 시험과 결과 / 미실행 사유:
- 다시 시작한 CI Run / 종료 판정:
