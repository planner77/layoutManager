# Issue #212 — 수동 DXF Scene 생성 진단·직렬화 정합성

2026-11-02 · [GitHub #212](https://github.com/planner77/layoutManager/issues/212) · PR 후보 · **현장/CI 수용 아님**

## 기준 및 재현 근거
- 관찰된 현장 값: DXF 5MiB 미만 사례와 별도의 20MiB 이상 사례(동일 파일인지 미확인), AC1024 이상, 한글 TEXT/MTEXT, BLOCK/INSERT. UTF-8 strict valid로 보고되었으며, 이론적 BLOCK 확장 추정치는 20만 초과·순환 미발견으로 보고됨. 이 값은 소스 바이트·파서 객체 수 또는 Scene 인스턴스 수와 같지 않으며 실제 기하 직렬화 실패의 원인으로 확정할 수 없다. 원본/내부 SHA, Handle, 좌표/문자 내용은 저장소/CI에 올리지 않는다.
- 코드상 검증된 결함: `ThreeDxfViewerAdapter.load`가 원인을 일반 Error로 덮고 `ViewerManager`에서 `adapter-load:LOAD`가 되었음. 실패 후 레거시 `dxf-viewer` 표시 성공이 Scene 변환·저장 성공 안내와 혼동되었음.
- 코드상 위험: `serializeSourceScene(...,'CUSTOM_DTO')` 호출 전에 `root.toJSON→inspect`와 `toCustomDto`를 연속 수행해 두 개의 Scene 표현을 구성함. 이로 인한 실제 OOM/시간 초과는 실측되지 않았으므로 가설로 보존.

## 구현 계약/ADR-212
1. **브라우저 수동 Scene 전용 진단**: `SOURCE_VERIFY → DXF_DECODE_NORMALIZE → DXF_PARSE (폰트 로딩/파서/기하 결합) → THREE_SCENE_BUILD_TAG → OPTIONAL_OUTLINE_INDEX → TEXT_INDEX_EXTRACT → CUSTOM_DTO_SERIALIZE → PAYLOAD_VALIDATE → ARTIFACT_READY`. `SCENE_JSON_INSPECT`는 `THREE_JSON` 선택 경로에만 사용한다. 완료 단계가 `ARTIFACT_READY`인 것은 **검증된 브라우저 후보 바이트**이며 서버 `CurrentScene READY`와 다르다. 현장 이슈의 `adapter-load:LOAD`만으로 개별 파서/폰트 원인 확정 금지.
2. **분류/경계**: `SCENE_SOURCE_DIGEST_MISMATCH`는 Scene 경로 fail-closed, 잘못된 DXF 구조는 `SCENE_DXF_PARSE_FAILED`, 검증 불가한 upstream `getFromPath` 실패는 `SCENE_CONVERTER_UNAVAILABLE`, 텍스트 검색 생성 실패는 `SCENE_TEXT_INDEX_FAILED`, 지원하지 않는 DTO 도형/속성은 `SCENE_UNSUPPORTED_GEOMETRY`, 그 외 직렬화 실패 `SCENE_SERIALIZE_FAILED`, 저장 규약 불일치 `SCENE_VALIDATE_FAILED`, 크기/수량/깊이 제한은 `SCENE_ASSET_TOO_LARGE`. 확증 없는 Stage는 `UNKNOWN`; 준비 단계/제한시간을 실제로 관측하지 않은 경우 `SCENE_FONT_UNAVAILABLE` / `SCENE_BUILD_TIMEOUT`을 추측해 기록하지 않는다.
3. **자원·Fidelity**: 기존 CUSTOM_DTO 32MiB, Scene 노드 100k, attribute scalar 2M, 깊이128 정책을 공통화. 디코드 완료 후 실제 `Object3D` 트리를 iterative preflight하고, `CUSTOM_DTO`에서는 `root.toJSON` 전체 생성/검사를 생략하되 동일한 도메인 `validateStoredScenePayload`와 SceneManifest SHA256·길이·schema·ID·WCS·typed-buffer를 검증해야만 후보를 노출한다. `THREE_JSON` 경로의 기존 inspect는 유지. 기존 Source와 READY pointer, APP_CREATED, Memo, Zone, Outline와 G7 Permission/CAS/Audit, 서버 POST 검사는 그대로.
4. **UI/성공 판정**: 서버 READY 복원, 브라우저 후보 `THREE_SCENE_ARTIFACT_READY`, 단순 대체 표시 `FALLBACK_DXF_DISPLAYED_SCENE_FAILED`, 실패/미생성을 분리. 마지막 경우는 저장 명령 호출 불가. 대체 Renderer 성공으로 Scene 변환 성공을 표기하지 않는다. Renderer/Version 변경 및 재시도 시 오래된 실패 진단을 초기화. 최초 Source GET 재파싱 정책과 수동 `source=build` 액션은 그대로.
5. **개인/업무 데이터 보호**: 진단은 allowlist phase/code, 성공·경고·실패·ms 및 비민감 숫자 통계만 Viewer metric에 유지. Error.message/stack/내부 path/원본 DXF·SHA/Handle/세션·토큰/사용자 정보를 단계 진단에 복사하지 않는다. 내부 `cause`는 예외 체인으로만 전달하고 사용자가 다운로드하는 JSON에는 포함하지 않는다. Browser metric은 server Job이 아니므로 `jobId/requestId`를 생성·로그아웃 이후 진행됐다고 주장하지 않는다.
6. **#208과 구분**: #212는 기존 수동 브라우저 작업 진단/산출물 사전검증. #208 서버 CPU-only Worker/영속 큐, 최초 업로드 자동 변환·상태 UI 및 업로드 `requestId↔jobId`는 여기서 구현하지 않고 기존 #208 OPEN AC로 추적. #212의 단계 이름을 Worker 완료·배포 증거와 혼동하지 않는다.

## 검증 계획 및 판정
| Gate | 시험 | 현재 |
|---|---|---|
| TC-212-01 | fixture 소형 DXF + synthetic 중첩 BLOCK/INSERT·한글 텍스트; 후보 manifest/DTO Validation/restore, ID·Layer·WCS·기하 | 합성 Unit 코드 추가; 실제 실행 미확인 |
| TC-212-02 | CUSTOM_DTO 경로 `root.toJSON` 미호출, THREE_JSON 기존 검사 보존, 속성 타입/정수 정규화·미지원 형식 거절 | 합성 Unit 코드 추가; 실행 미확인 |
| TC-212-03 | source mismatch/Unicode parse/text index/serializer/validator/노드·속성·깊이 및 staged 오류/경고, 원본 메시지 비공개 | 합성 Unit 코드 추가; 구현 경로와 UI E2E는 PR CI 대기 |
| TC-212-04 | three failure + dxf fallback: 도면 표시 성공 ≠ Scene Artifact. Save/POST0, source/ready pointer 불변 | 상태 함수 Unit 추가; 브라우저 결합/POST0 현장 검증 미확인 |
| TC-212-05 | 동일 Version/다른 Renderer/재시도/취소·인덱스 30s warning, Actor/권한 회수 및 32MiB 제한 | 기존 관련 테스트+PR CI; 현장/장애 주입 별도 |
| TC-212-06 | `npm run typecheck`, `npm run lint`, 전체 Unit/Integration, Playwright General/Greenfield/G7/Legacy, Docker CI | 미실행, PR CI 시작 후 결과 모니터링 생략 |

**조건부/미수용:** 실제 20MiB+ 고객 도면 입력·GPU/2PC, peak heap, 변환 p95·정밀 선택의 정확 원인, 최종 배포/OCI digest·시스템/업무 사용자 수용은 NOT VERIFIED (#113/#193). 성능·결함 해소·현장 합격을 단정하지 않는다. 로컬 회귀가 도는 환경이 아닌 원격 GitHub 파일 편집 환경이라 별도 터미널 테스트 PASS를 주장하지 않는다.
