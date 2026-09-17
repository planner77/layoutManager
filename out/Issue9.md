# GitHub Issue #9 — 전역 로딩 스피너 및 사용자 입력 차단

기준일: 2026-09-17

## 요구사항 구체화

- 사용자의 추가 조작을 허용하면 안 되는 비동기 작업은 전역 로딩 상태에 등록한다.
- 전역 로딩 상태는 boolean 하나가 아니라 **작업 ID 기반 컬렉션**으로 관리한다. 둘 이상의 작업이 중첩되면 한 작업이 먼저 종료되더라도 나머지 작업이 존재하는 동안 오버레이를 유지한다.
- 현재 표시 문구는 가장 최근에 시작된 활성 작업의 메시지를 사용한다.
- 전체 화면 오버레이는 기존 Dialog보다 높은 stacking level을 사용하고 pointer 입력을 가로막는다.
- 전역 로딩 중 keyboard 입력도 capture 단계에서 차단하여 메뉴 단축키, Enter/Space 재실행 등의 추가 조작을 막는다.
- `body`에 `aria-busy=true`, 오버레이에 `role=status`, `aria-live=polite`를 적용한다.
- 모든 작업은 성공/실패/예외와 무관하게 `finally` 성격의 정리 경로에서 작업 ID를 제거한다.
- 변경 API는 React state 반영 전에 들어올 수 있는 빠른 연속 이벤트까지 막기 위해 ref 기반 즉시 실행 가드를 사용한다.
- 기존 화면의 오류 안내/진단 UI는 유지하며, 실패 후 오버레이를 제거한 다음 사용자가 오류 내용을 조작할 수 있어야 한다.

## 우선 적용 범위

1. 도면 Viewer 최초 로드 / renderer 전환 / 다시 불러오기
2. 도면 등록/업로드
3. 도면 삭제
4. Current 지정/변경
5. Viewer route 이동 중 Next.js route loading UI

목록 검색과 필터 변경은 현재 읽기 중심 URL 전환이며 중복 변경 API를 발생시키지 않으므로 이번 구현 범위에서 제외한다.

## 구현 설계

### `src/components/global-loading.tsx`

- `GlobalLoadingProvider`: 활성 작업 목록과 작업 sequence를 관리한다.
- `beginLoading(message)`: 고유 task ID를 생성하고 작업을 등록한다.
- `endLoading(taskId)`: 지정 작업만 제거한다. 이미 제거된 ID에 대해서도 안전하게 동작한다.
- `runWithLoading(message, action)`: action을 실행하고 `finally`에서 task ID를 제거한다.
- `GlobalLoadingOverlay`: 전체 viewport 입력 차단, spinner, 상태 문구, 접근성 속성을 담당한다.

### Root layout

`src/app/layout.tsx`에서 header/main 전체를 `GlobalLoadingProvider`로 감싸 어느 화면에서든 동일한 상태 계층을 사용한다.

### Viewer

- Viewer 실제 원본 로드가 시작될 때 `도면을 여는 중입니다...` task를 등록한다.
- Promise 완료/실패/cleanup 경로 모두에서 task를 해제한다.
- renderer 전환과 다시 불러오기는 local loading/ref guard로 중복 실행을 막는다.
- 이전 load Promise가 늦게 끝나 새 load의 local busy 상태를 해제하지 않도록 sequence를 비교한다.
- `src/app/cad/versions/[versionId]/viewer/loading.tsx`에서도 동일 오버레이 UI를 재사용하여 route 이동 단계부터 상태를 보인다.

### Upload / Delete / Current

- Upload: `도면을 등록하는 중입니다...`
- Delete: `도면을 삭제하는 중입니다...`
- Current: `현재 버전을 변경하는 중입니다...`
- 각 변경 작업은 ref 기반 즉시 guard와 기존 local busy 표시를 함께 사용한다.

## Acceptance Criteria 매핑

- AC1 Viewer 시작 즉시 전체 화면 표시 → route `loading.tsx` + Viewer effect
- AC2 Upload 시작 즉시 전체 화면 표시 → `runWithLoading`
- AC3 추가 조작 차단 → fixed overlay + keyboard capture
- AC4 중복 요청 방지 → ref guard + disabled control
- AC5 성공 시 제거 → common finally / Viewer finally
- AC6 오류 시 제거 → common finally / Viewer catch+finally
- AC7 오류 안내 유지 → 기존 error/diagnostic state 유지
- AC8 공통 구현 → Root `GlobalLoadingProvider`
- AC9 중첩 안전 → task ID collection
- AC10 검증 → `tests/e2e/global-loading.spec.ts`

## 테스트

### TC-ISSUE9-001

업로드 응답을 의도적으로 지연시키고 다음을 검증한다.

- 오버레이 표시
- `도면을 등록하는 중입니다...` 문구
- `body[aria-busy=true]`
- 등록 버튼 disabled

### TC-ISSUE9-002

동일 지연 업로드 중 form submit 이벤트를 추가 발생시켜 POST 요청이 1회뿐인지 확인한다. 이후 502 오류를 반환해 오버레이가 사라지고 기존 업로드 진단 UI가 표시되는지 확인한다.

### TC-ISSUE9-003

등록된 DXF의 content API 응답을 지연시키고 Viewer 화면에서 `도면을 여는 중입니다...` 오버레이가 응답 완료까지 유지되고, 완료 후 `도면 표시 완료` 상태로 전환되는지 확인한다.

## 범위 외

- API 서버 차원의 idempotency key
- 사용자 취소 버튼 / AbortController 기반 취소 UX
- 진행률(percent) 표시
- 목록 검색/정렬/페이지 이동 자체의 전역 로딩 처리
