# Issues #98 / #83 — CAD Business Persistence (PR Candidate, 2026-10-30)

## 설계 기준

루트 DESIGN.md는 존재하지 않는다. AGENTS.md, out/Architecture.md, out/Decisions.md, out/Database.md, out/Operation.md, #160/#97/#98/#83/#65/#84와 기존 #164/#166 Scene 계약을 기준으로 한다. 아래는 #98/#83 신규 후보의 요구·설계이며 과거 성공한 #166의 범위를 소급 변경하지 않는다.

## 기술 계약

- G7 ACTIVE에서만 VERSION 기반 Outlines/Memos GET·POST, 개별 PATCH·DELETE. Session, Version→Site, Role/Grant, Host/Origin, CSRF는 기존 G7 guard 재사용. 신규 GET은 공개 CAD 읽기 모드로 우회하지 않는다. OFF에서는 기존 #82 임시 메모만 동작.
- Outline은 APP_CREATED, WCS 독립 Polygon/MultiPolygon을 서버에서 제한 검사한다. SOURCE_CANONICAL은 서버 원본 DXF 바이트 SHA·Entity Handle·canonical 검증(#97) 통과 후 저장. browser 원본 claim만으로 출처 인증 불가. baseGeometry 불변·Translate/Rotate op 이력부터 서버 effective geometry 재산출. Scene revision 변경 시 변형/삭제 409.
- Memo는 FREE/WCS anchor, 일반 텍스트, 서버 UUID/작성자 기록. text PATCH는 앵커 불변, move만 위치 수정, 작성자만 PATCH/DELETE. Editor의 타 작성자 수정 허용은 Owner 미승인이라 차단. Reader/Editor/Admin은 Site grant 내 조회, Editor/Admin은 저장, Admin도 Site 우회 불가.
- Object revision CAS, soft delete, actor/requestId/version/timestamp 성공 감사가 단일 DB transaction. 보안 실패는 기존 G7 AuditEvent 실패 기록. Show/Hide는 세션만, Scene snapshot 및 DXF bytes 불변.
- 신설 CadOutline/CadMemo/CadBusinessAudit와 인덱스·immutability/audit 트리거는 **신규 빈 Greenfield**에만 포함. 202610300002_greenfield_business_baseline / G7-GREENFIELD-BUSINESS-20261030-1. 이전 G7 Scene 및 Old baseline DDL fingerprint를 변경하지 않고 신규 객체 SQL까지 정합성 검증. 기존 볼륨 자동 Migration/Adoption 없음; 기존 볼륨 업무 CRUD 503. Version 물리 삭제 시 연결된 business row 존재하면 409.
- Viewer는 Memo ACTIVE에서 서버 목록으로 재접속 복원하고 OFF에서는 M1 임시 상태. Outline은 임시 항목을 명시적으로 서버 저장하며 재접속 때 원본 WCS read-only overlay를 별도로 구성, 별도 서버 rename/Translate/Rotate/soft-delete. 로컬 GeneratedDocument/Undo와 서버 버전 편집을 혼합하지 않는다.
- 미결정: #65 OutlineType FK/관리, #84 연결 Memo 및 BROKEN_ANCHOR, 업무 타입 데이터, 물리 삭제/보관·구 DB 이관, Memo 교차 Editor 수정정책, 현장 Owner Acceptance. 이 PR에서 운영 전환·GHCR 게시·병합·이슈 종료 없음.

## 검증 계획 / 상태

신규 src/tests/unit/cad-business-contract.test.ts: WCS geometry/operation 위조 거절, Memo scope restore, SQLite 불변/append-only DDL 트리거. PR에서 db:generate, Typecheck, lint, Unit/Integration, Next production build, Greenfield installer/Scene, Browser E2E, foreign Site/Reader/CSRF/expired grant/409 race/source SHA mismatch 전부 실행하여 검증해야 한다. 테스트 코드 작성만 했으며 현재 **NOT RUN**, CI 결과 **NOT VERIFIED**; #166의 기존 통과 기록으로 소급 PASS 주장 금지.
