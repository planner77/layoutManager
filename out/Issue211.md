# Issue #211 — G7 Greenfield 통합 Docker 호스트 배포 CLI (2026-11-02)

## 요구·권한·범위

Owner 확정: **호스트 CLI(A)**, **상태 자동 판별 + 계획·위험 표시 + 정확한 지문 수동 승인(A)**, **.env 수동 수정/CLI 자동 수정 금지(A)**. 신규 빈 설치·동일 릴리스 확인/재기동·지원 release chain 업그레이드·Schema 승인·RESTORE_REQUIRED의 **단일 권장 진입점**은 `src/scripts/g7-deploy.py`다. 기존 `g7-upgrade.py`와 `greenfield-upgrade-engine.ts`는 하위 검증/백업/잠금/복구 정본으로 재사용한다. 별도 웹 UI, SQL/DDL 재구현, 레거시6→7 채택, S3/Expert 자동 이관, downgrade, 자동 .env 수정은 구현하지 않는다.

### 책임 및 호출 흐름

```text
호스트 운영자(.env에서 이미지 쌍+40hex Source Commit 수동 지정)
  → g7-deploy.py status/inspect
    → docker compose config --format json (shell source 아님)
    → docker image inspect + #209 inspect_pair (실제 local image ID)
    → docker volume inspect (미존재=ABSENT; 임의 생성 금지)
    → project app/container/network/volume 충돌 검사
    → 기존 볼륨이면 readonly,node volume-nocopy empty probe
    → 비어 있지 않은 정상 Greenfield면 #209 g7-upgrade.py status→plan
      → 고정 Migrator Image ID, readonly source → engine registry/DB/CAD 검증
  → plan [--operation start] (safe snapshot / SHA-256 지문)
  → execute --approve-plan <통합 planId>
    → 실행 전 동일 검사 및 계획 지문 재계산
    ├─ FRESH_INSTALL: 기존 #109 Compose migrate→App(볼륨/네트워크/port 생성 포함)
    ├─ RESTART_SAME_RELEASE: 기동 중이면 명시 NOOP, 아니면 검증 App만 기동
    ├─ UPGRADE_COMPATIBLE: #209 helper auto → App stop + writer0 + recovery + postcheck
    ├─ UPGRADE_MIGRATION_REQUIRED: #209 helper apply --approve-plan <enginePlanId>
    └─ RESTORE_REQUIRED: 명시 차단·격리 restore Runbook 안내
  → #209 업그레이드 후 App STOPPED 및 재검사, 별도 plan --operation start
  → start --approve-plan <새 통합 planId>
  → health + Session/Grant/Reader 차단/CAD/Current/SHA/Scene/Memo/Outline/Zone/Audit 현장 확인
```

## 상태 계약과 계획 승인

- 모든 조회는 **read-only**. Compose config는 메모리에서만 파싱한다. 미존재 볼륨을 mount하거나 Docker volume create하지 않는다. 기존 빈 볼륨의 독립 probe는 `readonly,volume-nocopy`로 copy-up을 억제하고 내용은 `empty:true|false`만 반환한다. 조회 과정에서 임시 검사 컨테이너는 생성/삭제될 수 있지만 업무 DB/CAD/Volume/manifest/.env를 수정하지 않는다.
- `state/decision`: FRESH_INSTALL, RESTART_SAME_RELEASE, UPGRADE_COMPATIBLE, UPGRADE_MIGRATION_REQUIRED, RESTORE_REQUIRED 및 BLOCKED. `installedVersion`은 검증된 기존 engine 결과만, `targetVersion`은 호스트 검사 이미지 label, `runningAppVersion`은 현재 컨테이너 Image ID의 label. 불명은 `UNKNOWN`; 단순 Manifest=목표 일치를 배포 완료로 해석하지 않는다.
- 운영자 식별: `projectKey/volumeKey`는 비밀이 아닌 이름의 해시 앞 16자리이고 실제 경로/자격증명은 출력하지 않는다. `appState/health`는 컨테이너 관측값이며 `businessAcceptance`는 항상 `NOT_VERIFIED`. Schema/chain은 #209 registry 결과 외의 추측을 하지 않는다.
- `planId`는 동작 종류(`execute|start`), .env SHA, Compose 구성 SHA, Project/Volume, Volume identity, engine planId/결정, 대상 App/Migrator의 local image ID, 현재 App container ID·image ID·status·health, 공개되는 수행 효과를 정규 JSON으로 결합한 SHA-256이다. 타 작업 승인·오래된 승인·Source/tag/.env 변경·컨테이너 상태 변화 시 재확인 전 실행하지 않는다.
- 상위 통합 planId는 **#209 Schema SQL plan 승인 대체가 아님**. MIGRATION 분기만 engine planId를 추출해 정확하게 `g7-upgrade.py apply --approve-plan`에 전달한다. 승인하지 않았거나 hash가 바뀌면 prewrite 차단한다.
- `effects`는 신규 Volume/Schema/first-admin code/Compose 네트워크·포트, 재시작/no-op, App stop·SQLite WAL-aware recovery·업그레이드·App 정지 유지, 별도 start를 구분한다. 포괄적 `--yes` 옵션이 없다.

## 안전성·보존 경계

- App/Migrator는 **#209 inspect_pair**의 동일 repository/version/revision/source/role/linux-amd64 및 실제 Image ID 검증을 재사용한다. 사전 pull은 운영자가 수행하며 CLI는 pull/tag/재태깅/서명 검증을 하지 않는다. OCI label은 독립 cryptographic provenance 증명이 아니다.
- source Volume/Project/Compose app+migrate의 /data 일치, 다른 프로젝트의 컨테이너·network 및 동시 writer 차단. 기존 설치의 다른 Project·지정 외 Volume 정지·채택 금지. 기존 사라지거나 손상된 marker와 nonempty 소스는 신규 설치로 취급하지 않는다.
- 현재 릴리스에서 `RESTART_SAME_RELEASE`은 manifest와 target이 검증되었다는 **결정**이다. 실행 중 App, 실제 image ID, health, 운영 업무 수용과 별도다. 구 .env 상태에서는 이전 target을 보고 판단하므로 운영자가 먼저 **미리 pull → 실제 세 항목 수동 설정 → 새 상태·계획**을 진행한다.
- #209 자동 업그레이드가 중지한 App은 **그대로 STOPPED**. `start`는 새 상태·지문에 대한 별도 승인으로만 작동한다. 실제 이미지 기동 전/후 확인을 수행하고 불일치 등 사후 검증 실패 시 App을 다시 정지한다. Host 외 writer/동시 Docker 관리자 기동은 운영 절차에서 반드시 정지/조율한다.
- RESTORE_REQUIRED 시 자동 retry·잠금/hold 삭제·manifest 패치·기존 DB/Volume reset·직접 SQL 실행 금지. 복원은 기존 `g7-upgrade.py restore --backup <UUID> --restore-volume <신규 빈 격리 Volume>`만 별도 명시 실행한다.
- 현장 업무 확인은 로그인·권한/Site Grant·Reader 차단·CRUD/Current·원본 SHA·Scene/Memo/Outline/Zone/Audit·휴먼 검토가 필요하다. 코드/합성 CI PASS만으로 운영 환경 성공을 선언하지 않는다.

## 실행 예시

```bash
# Docker 호스트에서 repository root 기준. Python3.9+ / Docker Compose v2.
# 1) 신뢰하는 동일 Version App/Migrator를 별도 docker pull 후 검증
# 2) .env의 GHCR_IMAGE / GHCR_MIGRATION_IMAGE /
#    G7_RELEASE_SOURCE_COMMIT(이미지 revision과 동일한 40자리 소문자 SHA) 직접 수정.
#    CAD_DATA_VOLUME_NAME은 새 설치에만 고유한 빈 이름, 업그레이드에는 기존 이름 유지.
python3 src/scripts/g7-deploy.py .env status --json
python3 src/scripts/g7-deploy.py .env plan --json
# 위 planId 전체 SHA 64자를 검토 후 수동 복사
python3 src/scripts/g7-deploy.py .env execute --approve-plan <통합-planId> --json
# 업그레이드는 성공해도 App STOPPED
python3 src/scripts/g7-deploy.py .env plan --operation start --json
python3 src/scripts/g7-deploy.py .env start --approve-plan <새-start-planId> --json
python3 src/scripts/g7-deploy.py .env status --json
```

## 추적성·검증 게이트

| 요구 | 구현 | 검증 |
|---|---|---|
| AC01 상태 일관 | 통합 status/plan/build_plan/execute/start | Python 단위 + Docker Compose 신규/동일 버전 smoke |
| AC02 read-only | Volume inspect→nocopy readonly probe, #209 read-only engine | Python mock 및 #209 WAL read-only Docker smoke; 실제 Volume 변경은 CI 확인 필요 |
| AC03 최초 설치 | FRESH→Compose 기존 #109 migrator, 기존 볼륨 미초기화 | 기존 Greenfield Admin/CAD Browser/Compose + 신규 CI |
| AC04 동일 릴리스 | RESTART_SAME_RELEASE vs running/image/health, NOOP | Python unit + Compose stop→별도 승인 start |
| AC05 compatible upgrade | #209 host auto/registry/backup/stop | 기존 #209 실제 0.56.0→0.58.0 Docker smoke 연계 |
| AC06 Schema 승인 | 상위 지문 + #209 정확 engine planId | Python delegation + #209 합성 MIGRATION/DDL 시험 |
| AC07 차단 | Source/pair/mount/name/network/lock/hold/stale | Python error matrix 및 기존 #209 통합·Docker |
| AC08 postcheck | 업그레이드 STOPPED→별도 plan-start | 상태 분리/자동 재검사, 업무 현장 별도 |
| AC09 비밀정보 | 출력 allowlist + 해시 식별 + .env shell source 없음 | Python 정책 검증, 실제 CI 로그 검토 전 NOT VERIFIED |
| AC10 배포 | PR CI Python py_compile+unit / Docker existing smoke | CI 실행 결과는 모니터링하지 않음, PASS는 별도 근거 |

## 미실행·잔여 위험

- 이 작업에서 운영 Volume/DB/CAD/.env/포트, GHCR, release image, 병합, Issue 종료는 **대상 아님**.
- Docker daemon에 동시 관리자/writer가 있다면 단일 호스트 도구만으로 외부 host writer를 강제 정지하지 못한다. 작업 시간 독점 운영이 필요하다.
- Compose App 시작은 사전·사후 이미지 ID를 검사하지만 Docker의 별도 관리자 태그 변경/재기동 경쟁은 호스트 잠금 없이 완전한 atomicity를 보장하지 않는다. 계획/실행 재검사 및 실패 시 App 정지로 대응하고, 실제 운영에서는 immutable digest·exclusive 배포 창을 사용한다.
- 지원된 Schema migration edge는 현재 registry에 실제 운영용으로 등록되어 있지 않다. 임의 DDL 경로를 새 CLI에 추가하지 않는다.
- Docker 통합 CI 결과, 전체 Test 수, 현장 수용 및 신규 리뷰 승인/병합 상태는 정확 Run 확인 전 **NOT VERIFIED**로 유지한다.
