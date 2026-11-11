# Issue #283 — 로컬 복구점·격리 복원 계약

2026-11-11 Manager 설계·로컬 구현 수용. 상태: 독립 QA의 기존 high-risk 17/17 및 후속 저장소 경계 회귀 Node 5/5·격리 Docker 1/1 보고를 검토하여 로컬 도구를 제한부 수용했다. 후속 Root 실제 운영 capture·새 격리 restore/verify/probe·설정 roundtrip도 PASS다. 실제 증거는 IssueEvidence/283·TestReport를 따른다. 외부 보관·실제 사용자 auth NOT RUN, host writer 부재 NOT PROVEN, READY 자료 없음의 한계가 남아 전체 DR/Issue 종료 수용과 구분한다. 상위 #279 정책에 따라 PR/Actions 호출0. #281 검증 뒤 #282 출고의 복구 선행조건이며 실제 운영 rollback/upgrade/삭제/flags 변경은 범위 밖이다. 본 문서는 요구·설계·AC 정본, 실제 결과는 TestReport 및 IssueEvidence/283에 구분 기록한다.

## 요구와 현재 관측

- R283-1: App/Migrator/Worker image ID와 가능한 immutable digest·role/version/source, named volume/bind mount, G7 identity/registry, DB 및 WAL/SHM, CAD/Scene/업무·인증·감사·Job, 설정 파일을 실제 inventory로 결합한다. Config.Env 전체나 비밀 값을 출력하지 않는다. digest 미확인은 image ID로 대신 성공 선언하지 않는다.
- Root의 초기 관측: `cad-layout-viewer-cpu-worker-1`만 실행 중, App 컨테이너 없음. Worker image ID `sha256:7b9a799f0b7e4df6c2f85a49d5b8668806bb4e14efe77db743e2ae390aa5e7cf`, RW volume `cad-layout-viewer-g7`, Compose `/home/planner/Dev/layoutManager-issue225-completion/src/docker-compose.yml`. 이는 실행 직전 재확인이 필요한 관측이며 앱 건강 상태를 주장하지 않는다.
- R283-2: 검토 가능한 정확 plan에 결합한 일관 capture. 이전 실행 상태 보존: 처음 running인 알려진 writer만 정지하고 동일 ID만 재개, stopped/missing App 시작 금지. 알 수 없는 writer/관련 mount 변화는 중단한다.
- R283-3: sealed private archive를 새 nonce-owned 빈 volume으로만 복원하고 SQLite integrity/FK/전체 논리 지문·CAD/Scene 파일 SHA·G7 설치/등록 schema/migration identity를 비교한다. 인증 hash/행·CAD 원문은 공개 receipt에 넣지 않는다.
- R283-4: 정확 snapshot과 호환하는 기존 3-role image 복원 절차를 clone에서 검증한다. 0.61 DB에 0.58 App 연결 금지, registry의 정방향 edge를 역방향 허가로 사용하지 않는다. 운영 신규 데이터 손실 판단과 실제 rollback은 별도 Owner 결정이다.

## 최소 구조와 실행 계약

새 `recovery-local` CLI는 inventory/plan → capture → restore → verify/compatibility 단계의 얇은 orchestration이다. 기존 G7 schema/registry 검사, OR58의 archive/member/SQLite 비교 및 RR2 snapshot·owned-resource 보호를 재사용한다. legacy 전체 복사·0.58 고정 값·CI run/Owner GO 문자열·수동 PASS receipt를 새 신뢰 근거로 가져오지 않는다. 업무 schema 변경 없음(Database 정본 유지).

Plan은 source commit/tree 및 변경 fingerprint, nonce, 정확 container IDs/image IDs/상태/mounts, 설정 경로·hash, source volume identity, destination policy, helper image, schema 검사 입력, 시간 예산을 canonical hash로 결합한다. capture는 digest만 맞는 임의 JSON을 신뢰하지 않고 엄격 schema와 실제 inventory를 다시 검사한다. 공개 receipt에는 비밀 없는 요약·hash·상태·시간·한계만 둔다. hash는 승인/서명 증거가 아니다.

Capture 전 실행 프로세스와 Docker mount writer를 확인한다. source volume이 host에도 접근 가능하므로 Docker inventory만으로 host writer 부재를 증명하지 않는다. 검사 불가/unknown은 일관 capture를 차단하거나 명확한 제한으로 남기며 PASS로 꾸미지 않는다. 정지 후 source read-only helper로 raw DB+WAL+SHM 및 CAD/Scene/install 자료를 함께 캡처하고 전후 전체 지문을 비교한다. SQLite 회복/backup은 disposable copy에서만 수행한다. source DB checkpoint/임시 파일 정리/upgrade engine 호출 금지. timeout/중간 실패에도 원래 running writer 재개를 우선하며 failed/incomplete archive를 accepted로 봉인하지 않는다. restart 실패는 HALT, 자동 교체/restore 없음.

Archive는 source volume 밖의 새0700 private directory/0600 파일로 보관하고 exclusive 생성·fsync·최종 SHA로 seal한다. restore는 bounded archive의 절대/상위 경로·중복·symlink/hardlink/device·부정 mode/uid·member 크기를 거부하고, 새 volume의 nonce/plan labels 및 비어 있음 확인 뒤 추출한다. 입력 archive/hash/plan/source drift 또는 기존 목적지 발견 시 쓰기 전에 중단한다. clone에는 source RW mount/운영 port/외부 network/Git credential을 전달하지 않는다. cleanup은 정확 소유 CID/volume/network만 대상으로 별도 실행하며 backup은 자동 삭제하지 않는다.

설정 secret은 승인된 파일만 별도 암호화 보관한다. AES-256-GCM 또는 동등 authenticated encryption을 사용하고 무작위 key는 backup과 다른 private0700/0600 위치에 exclusive 생성한다. plaintext 임시 파일/CLI argv/log 금지, ciphertext/key 쓰기·readback/decrypt 검증 실패 시 성공 금지. 공개 증거에는 key 값/secret path 내용 대신 key ID·cipher SHA와 검증 결과만 기록한다. 현장 Root는 key custody 위치·소유자·복제·복원 방법을 private 운영 기록으로 남긴다. 동일 호스트 key 보관은 임시 로컬 증거이며 장애 도메인 분리/재해 복구 수용을 대신하지 않는다. Owner 지정 외부 보관 전에는 해당 AC를 미완료로 유지한다.

호환 검증은 snapshot의 registered G7 release/schema/manifest identity와 실제 읽은 image role/version/source를 대조한다. clone App health 및 읽기 경로, Worker 제한/동작은 단계별 결과다. 승인된 사용자 credential 없으면 실제 사용자 로그인은 NOT RUN이다. 필요 시 **별도 private clone**에 합성 계정을 정상 bootstrap/admin 경로로 만들고 synthetic login/권한 경계를 검증하되 원본 전체 동등성 검사 이후 별도 결과로 표시한다. 운영 password/session hash/token 추출 금지. READY Scene이 없으면 그 사실을 기록하고 READY 보존 성공을 만들지 않는다.

## AC와 필수 시험

| AC | 시험 | 수용 기준 |
| --- | --- | --- |
| AC283-1 | T01 inventory/plan | missing/stopped App·running Worker 정확 표현, plan read-only, secret 출력0 |
| AC283-2 | T02 identity/drift | 변조 plan, container/image/state/mount/config 변경, unknown writer 거부 |
| AC283-3 | T03 capture/failure | 일관 seal 및 source 불변, timeout/부분 copy/restart 실패 HALT, 원래 running writer만 재개 |
| AC283-4 | T04 archive/ownership | traversal/link/duplicate/oversize/mode 위반·existing/foreign/nonempty destination 거부 |
| AC283-5 | T05 actual restore | fresh owned volume에 실제 복원, SQLite integrity/FK/논리·파일 SHA/G7 동일성 |
| AC283-6 | T06 compatibility | 실제 등록 release와 3-role identity 호환 확인, 다른 schema/0.58 mismatch 차단; clone startup/읽기·Worker·auth 결과 구분 |
| AC283-7 | T07 confidentiality | 암호화 설정 roundtrip, wrong key/tamper 거부, receipt/log secret0, key 분리 정책과 미완료 외부 보관 명시 |
| AC283-8 | T08 integration | #281 관련 정적/Unit/build/격리 Docker 및 이전 WAL/OR58/RR2 실패 회귀, PR/Actions0; 실제 proof와 synthetic 구분 |

실제 운영 capture/restore는 Developer 완료→Manager 검토→QA 후 Root만 수행한다. 구현·합성 성공만으로 AC283-2/3/5의 운영 실증을 완료하지 않는다. #282 출고는 별도 승인·정확 digest readback, #279 설정 변경은 별도 cutover이다.

## 운영 판단

코드 결함은 정확 source/image로 clone 재현; migration 실패는 journal/새 쓰기 보존 후 STOP; 일부 OCI 게시는 PARTIAL/UNKNOWN STOP; Scene/Worker 불일치는 writer 상태·Job/asset 지문 수집; 저장소 손상은 source 수정 없이 복제 검사; 인증/설정 문제는 비밀 추출 대신 private 설정/정상 로그인 경로를 점검한다. rollback 전에 현재 신규 쓰기 보존과 손실 범위를 Owner가 결정한다. 배포/migration 직전 백업 필수, 일1회 백업·월1회 복원 연습을 제안하며 자동 스케줄/보존 삭제는 이번 범위 밖이다. RPO/RTO는 실제 측정값만 기록한다.

## Manager 로컬 수용 및 운영 실행 경계 (2026-11-11)

Developer 구현과 독립 QA 보고 이후 Manager가 최종 guard를 읽기 전용으로 확인했다. restart 전후 exact container/image/name/mount 검사, restore/probe timeout 및 소유 helper 정리, manifest role ref/source와 실제 image 결합, source-independent restore, 원래 writer 재개 후 비원본 암호 검증을 수용한다. 후속 guard는 config/runtime의 비local backend 및 DB의 원격 CAD/Scene/deletion/orphan locator를 거부한다. local CadFileVersion/SceneAsset의 실제 파일 크기·SHA 및 안전 경로를 검증하며 READY/CurrentScene이 없으면 `NOT_EXERCISED`로 기록한다. S3 동기화·복원은 미지원이다. Archive 구현은 tar 대신 bounded JSON header+파일 bytes의 전용 형식을 AES-256-GCM으로 봉인하며 symlink/device를 source 단계에서 거부한다.

Root는 사용자에게 이미 승인받은 다음 작업 범위에서 정확한 운영 plan을 검토한 뒤 알려진 기존 running Worker만 일시 정지→비파괴 capture→같은 Worker 재개→새 소유 volume 복원/검사/probe를 수행할 수 있다. missing App은 운영에 시작하지 않는다. clone probe는 baseline 동등성 검증 뒤 clone만 변경하며 운영 rollback/upgrade/flags 변경을 허가하지 않는다. 암호화 archive/settings의 plan AAD·key·receipt 결합을 유지한다.

잔여: 실제 운영 capture/새 복원본 실증은 아직 NOT RUN, host writer 독립 배제는 NOT_PROVEN, 실제 사용자 인증과 외부 장애 도메인 backup/key custody는 NOT RUN이다. 로컬 수용은 전체 #283 완료나 재해 복구 수용이 아니다. 이전 prototype 실패와 17/17 이전-source 결과는 후속 회귀로 덮어쓰지 않고 TestReport/IssueEvidence에 구분 보존한다. #282의 현재 후보 호환·실제 release 증거 결합은 별도 후속 구현이다.
