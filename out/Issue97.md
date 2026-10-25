# Issue #97 — P4-D2 서버 DXF Canonical + Translate/Rotate 검증기

## 배경과 범위

- 상위 #31 P4 D0 Owner 확정 7개 정책 중 P4-POL-04 및 ADR-049/050 적용. [Architecture](Architecture.md), [Requirements](Requirements.md), [Database](Database.md) 참조.
- #96(D1)은 로컬 인증·권한·Scope·Audit 기반(BLOCKED), #98(D3)은 CadOutline DB/CRUD/CAS·논리 삭제, #99는 실제 DXF P0/P5 현장 실증으로 분리한다. #56 브라우저 편집 JSON에는 영속 권한이 없다.
- 루트 DESIGN.md 없음: Architecture.md 및 ADR-048/049/050을 기준으로 한다.

## 서버 전용 검증 인터페이스

- 파일: src/server/outline/transform-attestation.ts. 함수: attestTransformedOutlineDraftAgainstImmutableDxf(input, versionId, sourceSha256, sourceBytes).
- Server가 정한 불변 DXF Version/bytes/SHA를 인자로 받는 동기 순수 검증기로, 자체 원본 fetch/계정/권한/인증/Server GET·Write Route/DB/감사를 수행하지 않는다. caller가 원본 파일 소유와 Version 범위를 인증해야 한다.
- 기존 browser JSON v1/v2의 coordinateSystem=DXF_WCS_XY, persistence=BROWSER_EXPORT_ONLY, outlines 배열을 유지. 각 result의 kind/algorithm/sourceEntityIds/tolerance/geometry를 기존 서버 canonical attestation으로 검증한다. v2 outlineTypeId/Name/name은 문법적 검증만 의미한다. 기존 canonical-only 함수는 변경 없이 사용 가능하다.
- 편집 확장: result.baseGeometry(미신뢰 원본 추정값), result.transformOperations(최대 64개 순서 배열), result.geometry(미신뢰 최종 좌표)를 제공한다. 연산은 Translate {type:"Translate",dx,dy} 또는 Rotate {type:"Rotate",angleDegrees,pivot:[x,y]}만 허용. result.transform 6개 원소는 **연산에서 계산한 서버 affine과 대조**하기 위한 선택적 claim이며, 단독 raw affine은 거부한다. result.algorithmVersion은 재계산 알고리즘과 같아야 한다.
- SHA-256/size 100MiB/UTF-8/Version/INSUNITS/Unique Stable Handle 및 sourceEntityIds를 서버가 재검증한다. 선택적 result.sourceEntityRefs는 versionId/sourceSha256/handle/instancePath:[]를 정확히 검사한다. 기존 파서는 root INSERT Handle을 WCS로 전개하고 child nested instancePath를 발급하지 않아, 비어 있지 않은 경로는 임의 무시하지 않고 거부한다. partial BLOCK/OCS/ATTRIB/missing·duplicate Handle은 stable 참조가 아니다.
- CONVEX monotone-chain-v1 / PRECISE polygon-clipping-union-v1, fixed tolerance=0.02 Drawing Unit. Client baseGeometry는 서버 원본에서 재계산한 canonical과 XOR 동등성 검사, 적용할 baseGeometry는 **서버 산출값**만 사용한다.
- Transform은 WCS XY [a,b,c,d,e,f]로 x'=ax+cy+e, y'=bx+dy+f. 왼쪽 합성, 양의 Degree는 CCW, pivot을 고정하는 Rotate translation을 계산한다. scale/shear/mirror/Z/nonfinite/각도 또는 좌표 범위(절댓값 1e12)/64 step 초과를 거부한다.
- 최종 Polygon/MultiPolygon/Hole의 링/정점 구조, 닫힘, 면적 부호·크기, 좌표 범위를 서버가 확인하고 Client result.geometry와 정점별 비교한다. 순정 v1/v2에 대해서는 기존 XOR 동일성과 ring 순서 무관 정책을 보존한다. 큰 WCS 좌표에서의 면적 상쇄를 줄이기 위해 면적을 링 첫 좌표에 상대하여 계산한다.
- 반환값의 clientLocalId는 브라우저 임시 ID로 DB UUID가 아니다. 서버 재계산 baseGeometry/transform/effectiveGeometry만 후속 D3에 전달할 수 있다. D3는 추가로 D1 Role·Site/Version Scope/Global Type FK/revision CAS 409/atomic Audit를 반드시 수행해야 한다.
- Source bytes/Version/SHA/Current, Adapter/GeneratedDocument, Prisma Schema/마이그레이션, HTTP Route, GHCR workflow는 수정하지 않았다. #56 미래 objects[] 편집 JSON은 명시적 adapter 및 연산 이력 연결 전까지 자동 D2 입력으로 인정하지 않는다.

## 오류 계약

| 코드 | 성격 | Status(D3에서 매핑 시) |
| --- | --- | --- |
| OUTLINE_INVALID_EXPORT, OUTLINE_BASE_REQUIRED, OUTLINE_TRANSFORM_INVALID | 포맷/필수 자료/연산 속성 오류 | 400 |
| OUTLINE_SOURCE_CHANGED, OUTLINE_UNITS_MISMATCH, OUTLINE_UNKNOWN_ENTITY, OUTLINE_GEOMETRY_MISMATCH, OUTLINE_AFFINE_MISMATCH, OUTLINE_ALGORITHM_MISMATCH, OUTLINE_TOLERANCE_UNSUPPORTED | 원본/claim 불일치·위조 | 409 |
| OUTLINE_TRANSFORM_UNSUPPORTED, OUTLINE_AFFINE_UNSUPPORTED, OUTLINE_INSTANCE_PATH_UNSUPPORTED, OUTLINE_TRANSFORM_RANGE, OUTLINE_GEOMETRY_INVALID | 금지 연산, 불안정 경로, 범위 초과 | 422 |
| OUTLINE_GEOMETRY_LIMIT | 전체 외곽선 정점 100k 초과 | 413 |

기존 attestation의 Source size/encoding/unsupported source 코드는 유지한다. 서버 Route는 추가하지 않으므로 이 Status는 실제 HTTP 응답이 아니라 후속 D3 표준화 계약이다. CAD 원본 bytes, 비공개 도면 경로, 개인정보와 인증 토큰은 진단 로그에 기록하지 않는다.

## 자동 시험 계획 및 현재 결과

| TC | 기대 | 현 상태 |
| --- | --- | --- |
| TC-P4-D2-001 | 순정 v1 및 typed v2 canonical 호환 | CODED / NOT RUN |
| TC-P4-D2-002 | root INSERT WCS+고유 Handle, empty instancePath 성공·nonempty 거부 | CODED / NOT RUN |
| TC-P4-D2-003 | SHA/Version/INSUNITS/tolerance, forged·중복 Handle 거부 | CODED / NOT RUN |
| TC-P4-D2-004 | OCS·partial BLOCK 불안정 참조 거부 | CODED / NOT RUN |
| TC-P4-D2-005 | Translate/Rotate/pivot 합성, 별도 browser GeneratedDocument 결과 비교 | CODED / NOT RUN |
| TC-P4-D2-006 | PRECISE MultiPolygon+Hole 구조/면적/방향 불변 | CODED / NOT RUN |
| TC-P4-D2-007 | raw affine/scale/shear/mirror/Z/unknown operation 차단 | CODED / NOT RUN |
| TC-P4-D2-008 | base/effective 위조·NaN/Infinity·65 단계·좌표 overflow 거부 | CODED / NOT RUN |
| TC-P4-D2-009 | 큰 WCS 원점에서 유효 geometry·회전 | CODED / NOT RUN |

Typecheck/Lint/Vitest/Build/Playwright/Docker/실 DXF/GPU는 이 GitHub connector 환경에서 실행하지 않음(NOT RUN). PR CI 시작을 PASS라고 쓰지 않는다. 불변 Storage 실제 재조회, 권한/CAS/감사, DB backup/restore, real CAD 3종·GPU/성능 최종 수용은 각각 #98/#99에서 진행한다.
