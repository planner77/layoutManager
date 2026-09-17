# Issue #14 — 사설 IP HTTP 환경 Viewer 회귀 수정

기준일: 2026-09-18

## 요구사항 명확화

Issue #14의 핵심 요구사항은 `crypto.randomUUID()` 자체를 대체하는 것이 아니라, 전역 로딩 기능이 Secure Context 여부에 의존하지 않도록 하여 기존 Viewer 및 전역 로딩 사용 기능을 계속 동작시키는 것이다.

전역 로딩의 작업 ID는 외부에 노출되는 보안 토큰이 아니며 `GlobalLoadingProvider` 수명 안에서 활성 작업을 구분하는 내부 식별자다. 따라서 암호학적 난수나 전역 UUID는 필요하지 않고 Provider 로컬의 단조 증가 sequence로 충분하다.

### 확정 Acceptance Criteria

- `GlobalLoadingProvider.beginLoading()`이 `crypto.randomUUID()` 또는 Secure Context 전용 API를 호출하지 않는다.
- 동시에 여러 로딩 작업이 존재해도 작업별 ID가 Provider 수명 안에서 충돌하지 않는다.
- 기존 최신 작업 message 선택과 `endLoading(taskId)` 동작을 유지한다.
- `crypto.randomUUID`가 없는 조건에서도 Viewer 진입 시 `/api/cad-files/{versionId}/content` 요청이 시작된다.
- 같은 조건에서 `dxf-viewer`, `three-dxf-viewer`가 모두 표시 완료 상태에 도달한다.
- 로딩 Overlay는 로딩 중 표시되고 성공/실패 후 제거되는 기존 contract를 유지한다.
- DB schema, CAD 원본 저장 구조, Viewer Adapter/API contract는 변경하지 않는다.

## 원인 분석

`0.20.0`에서 추가된 전역 로딩의 `beginLoading()`은 다음 순서로 실행되고 있었다.

1. `crypto.randomUUID()` 호출
2. sequence 증가
3. loading task 등록
4. task ID 반환

`CadViewer`는 `ViewerManager`의 `/content` 로드를 시작하기 전에 `beginLoading('도면을 여는 중입니다...')`을 호출한다. 따라서 비-Secure Context에서 `crypto.randomUUID`가 없으면 `beginLoading()`에서 동기 예외가 발생하고 실제 도면 요청까지 도달하지 못한다.

동일 Docker volume에서 0.19.2는 정상이고 0.21.0에서만 실패하며 0.19.2 복구 시 다시 정상이라는 관찰과도 일치한다. 이 변경은 DB/파일 volume을 읽기 전에 브라우저에서 실패하므로 데이터 손상이나 migration 문제를 우선 원인으로 볼 근거가 약하다.

## 구현 설계

기존 `sequenceRef`를 ID와 최신 작업 순서 판단에 함께 사용한다.

```ts
const sequence = ++sequenceRef.current;
const id = `global-loading-${sequence}`;
```

이 방식의 근거는 다음과 같다.

- Provider 단위 내부 ID이므로 프로세스/브라우저 전체 UUID가 필요하지 않다.
- React ref는 렌더링 사이에 값을 유지하고 증가 시 재렌더링을 유발하지 않는다.
- 동일 sequence를 `LoadingTask.sequence`에도 사용하므로 별도 난수 생성 의존성이 사라진다.
- 현재 task 종료는 반환된 ID의 문자열 동등성만 사용하므로 외부 contract 변경이 없다.

`CadViewer` 자체에는 수정이 필요하지 않다. 원인은 Viewer보다 앞단의 공통 loading provider에 있고, 공통 위치를 수정하면 등록/삭제/Current 변경 등 동일 provider를 사용하는 기능도 함께 호환된다.

## 회귀 테스트

Playwright의 localhost는 일반적인 Secure Context 취급을 받을 수 있으므로 운영 사설 IP HTTP 조건을 그대로 재현하는 것만으로는 회귀 검출이 안정적이지 않다. 자동 테스트에서는 페이지 초기화 시 `crypto.randomUUID`를 의도적으로 제거하여 실패 조건을 결정적으로 모사한다.

`TC-ISSUE14-001`:

1. 테스트 DXF 등록
2. 페이지 초기화 전에 `crypto.randomUUID = undefined` 조건 구성
3. Viewer 진입
4. `/api/cad-files/{id}/content` 요청이 실제 발생하는지 확인
5. dxf-viewer 표시 완료 확인
6. three-dxf-viewer로 전환 후 표시 완료 확인
7. 각 로딩 종료 후 global overlay가 제거되는지 확인

기존 `TC-ISSUE9-001/002/003`은 전역 로딩의 등록 실패, 중복 제출 차단, Viewer loading lifecycle 회귀를 계속 담당한다.

### 별도 운영 회귀

자동 CI와 별개로 실제 배포 검증 시에는 기존 0.19.2 데이터 volume을 보존한 상태에서 최신 이미지를 연결하고 `http://<사설 IP>:<port>`로 접속하여 기존 DXF가 표시되는지 확인한다. 이 검증은 GitHub Actions의 localhost 회귀와 별개인 운영 smoke test다.

## 버저닝

이번 변경은 기존 기능의 HTTP 환경 호환성 회귀를 수정하며 공개 기능/API를 추가하지 않으므로 SemVer PATCH인 `0.21.1`로 변경했다.

- `0.21.0` → `0.21.1`
- 버전 단일 기준: `src/package.json`
- DB migration 없음
- 외부 dependency 변경 없음
- API contract 변경 없음

## 구현 범위

- `src/components/global-loading.tsx`: `crypto.randomUUID()` 제거 및 sequence 기반 ID 사용
- `src/tests/e2e/global-loading.spec.ts`: randomUUID 부재 Viewer 회귀 추가
- `src/package.json`: 0.21.1 PATCH 버전 반영

## 검증 및 릴리스 결과

### PR / CI

- PR: #15 `fix: 사설 IP HTTP 환경의 Viewer 로딩 회귀 수정`
- 작업 branch: `fix/issue-14-insecure-randomuuid`
- PR CI run: `35231047884`
- TypeScript: PASS
- ESLint: PASS
- Unit / Integration: **22 files / 100 tests PASS**
- Production build: PASS
- Playwright Chromium E2E: **34 / 34 PASS**
- 신규 `TC-ISSUE14-001`: PASS

### 병합 / 이슈 / 브랜치

- 병합 방식: squash merge
- `main` merge commit: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- Issue #14: `completed` 종료 확인
- 작업 branch: merge 후 자동 삭제 확인

### 태그 / GHCR

- Release tag: `v0.21.1`
- Annotated tag object: `fb5eca8c9b9e70cca870ed37a2b2ab88093da336`
- Tag 대상 commit: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- Docker publish workflow run: `35263308541` — SUCCESS
- `ghcr.io/planner77/layoutmanager:0.21.1`
- `ghcr.io/planner77/layoutmanager:latest`
- Digest: `sha256:fbb7b21ab81250a3d0a47fa963683895f57e8c02a9f4ceac57f37170469be451`
- OCI revision: `642bde71f9d9c0e1205df66c3828489ff2d4078f`
- OCI version: `0.21.1`

## 남은 운영 확인

GitHub Actions 자동 검증은 `crypto.randomUUID` 부재를 주입하여 문제의 직접 원인을 검증했으며, 실제 사설 IP HTTP 접속과 기존 0.19.2 named volume을 0.21.1 이미지에 연결하는 현장 smoke test는 수행하지 않았다. 운영 배포 시 해당 항목을 별도 확인한다.
