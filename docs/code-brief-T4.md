# Code 착수 지시문 — 4턴 · 대시보드 편집(쓰기 경로 확장) · SPEC v1.2

- 발행: 2026-09-13 · Code 세션(Fable 5.1) · 기획자님 지시 "대시보드에서 수정·삭제·추가가 가능해야 하고 시트와 연동돼야 한다"
- 정본: `docs/SPEC-v1.md` **v1.2**(이 턴에서 개정) · 계약 `docs/DATA-CONTRACT.md` §9(이 턴에서 신설)
- 원칙 유지: 시트가 유일한 저장소(SoT). 대시보드는 시트를 직접 읽고 쓴다 — **별도 동기화 없음**. 쓰기 창구가 3개에서 늘어나는 것이지 저장소가 둘이 되는 것이 아니다.

## 0. 한 줄 목표
프로젝트·팀원·공수기록·마일스톤·정산을 **대시보드에서 추가·수정·삭제**할 수 있게 하고, 모든 대시보드 쓰기를 `변경이력` 탭에 남긴다. 배정은 기존 편집기(B)를 유지한다. 설정 탭은 시트에서만 고친다.

## 1. 결정 (기획자님 확인 요청 — 기본값으로 착수)
| # | 결정 | 근거 |
|---|---|---|
| D6 | 편집 대상 = 프로젝트 · 팀원 · 공수기록 · 마일스톤 · 정산 (+ 배정은 기존 경로). 설정은 시트 전용 | 설정은 목록·기준값의 단일 원천, 실수 시 파급이 큼 |
| D7 | `변경이력` 탭(8번째) 신설 — 대시보드 쓰기 전부 기록(일시·사용자·탭·키·동작·변경 내용·이전 행 백업). 기존 3경로도 기록 | "누가 언제 무엇을" 없이 다인 편집 불가. 삭제 복구 근거 |
| D8 | 삭제 규칙 — 프로젝트: 공수기록이 있거나 정산 매출이 입력된 건은 삭제 불가(상태 `드롭` 으로 안내). 가능하면 배정·마일스톤·정산 행을 함께 삭제(연쇄, 건수 표시). 팀원: 담당PM·배정·공수기록·마일스톤 담당으로 참조되면 삭제 불가(상태 `퇴사` 안내). 마일스톤: 자유. 배정·공수기록: 편집기에서 행 제거 후 저장. 정산: 행 삭제 없음(값 비우기) | 투입 실적(공수)·정산 실적은 지우면 Output 이 깨진다 |
| D9 | 동시 편집 — 서버 잠금(`withLock_`) + **편집 시작 시점 스냅샷(`expected`) 대조**. 시트 값이 그 사이 바뀌었으면 저장 거부("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도") | 열 추가 없이 충돌을 잡는 가장 단순한 방법 |
| D10 | 팀원 **이름 변경은 대시보드에서 불가**(5탭이 이름을 키로 참조). 시트에서 직접 + 참조 일괄 수정 | 연쇄 갱신은 다음 턴 |
| D11 | 모든 삭제·연쇄 작업은 기존 **2단계 인라인 확인**(`confirmable`) 사용. 브라우저 대화상자 금지 유지 | SPEC §5 E |
| D12 | 권한 = 배포 설정 그대로(도메인 사용자 + 시트 편집자 → 전원 편집 가능). 사용자 식별은 `Session.getActiveUser().getEmail()` 을 이력에만 기록 | 별도 권한 표는 다음 턴 |

## 2. 공유 편집 계약 — `src/schema.js` (메인이 작성 완료 · 세 곳에서 같은 파일 실행)
- 브라우저 `window.Schema` · Node 테스트 `require('../src/schema.js')` · Apps Script: `scripts/build.js` 가 `apps-script/Code.gs` 의 마커 블록에 원문을 채워 넣음(전역 `Schema`)
  ```
  /* __SCHEMA_BEGIN__ — 아래 블록은 scripts/build.js 가 src/schema.js 로 채운다. 직접 고치지 말 것 */
  /* __SCHEMA_END__ */
  ```
  Code.gs 안에서 이 두 줄 사이는 빌드 산출물이다. Code.gs 의 **다른 부분은 손으로 유지**한다(빌드가 그 부분을 건드리지 않음).
- 공개 API (전부 순수 함수)
  | 함수 | 역할 |
  |---|---|
  | `Schema.TABLES[table]` | 표 정의: `sheet`(탭 이름) · `label` · `key`(키 필드 배열) · `width`(열 수) · `formulaCols`(수식 열 인덱스) · `fields[]`(`key,col,label,type,required,enumFrom,enumFixed,nullable,emptyAs,auto,immutable,integer,step,monday`) |
  | `Schema.FIXED_ENUMS` · `Schema.HISTORY` | 고정 열거값 3종 · 변경이력 탭 이름·헤더 |
  | `Schema.emptyRow(table, ctx)` | 새 행 기본값 |
  | `Schema.normalizeRow(table, row, ctx)` | 폼 문자열 → 계약 타입(숫자·null·'' ) 변환. 검증하지 않음 |
  | `Schema.validateRow(table, row, ctx)` | `{ ok, errors:[{field,label,message}], values }` — 필수·형식·열거값·참조(팀원·프로젝트)·날짜 순서·0.5 단위·유일키 검사 |
  | `Schema.validateEffortWeek(member, week, rows, ctx)` | 주간 공수 묶음 검증(같은 프로젝트 중복 금지, 주 5.0 초과는 `warnings` 로만) |
  | `Schema.deleteCheck(table, row, data)` | `{ ok, reason, cascade:{assignments,milestones,settlements,effortLogs} }` — D8 규칙 |
  | `Schema.keyOf(table,row)` · `Schema.keyLabel(table,row)` | 키 객체 · 이력용 키 문자열 |
  | `Schema.diff(table, before, after)` · `Schema.summarize(table, action, before, after, extra)` | 변경 필드 목록 · 이력 "변경 내용" 문자열 |
  | `Schema.toValues(table, row)` | 열 순서대로 셀 값 배열(수식 열은 `null` — 서버는 그 칸을 쓰지 않는다) |
  | `Schema.findRow(table, list, key)` | 키로 행 찾기(배열 인덱스 반환) |
- `ctx` = `{ settings, data, mode: 'new'|'edit', expected }` — `data` 는 부트스트랩 JSON 형태(members·projects·effortLogs·milestones·settlements 만 있으면 됨)
- `table` 값: `projects` · `members` · `effortLogs` · `milestones` · `settlements` · `assignments`(정의만, 검증은 기존 `validateAssignmentRowApi_`)

## 3. 서버 API 계약 (계약 §5 확장 · `Code.gs`)
기존 4개(`getBootstrap` · `saveAssignments` · `completeMilestone` · `createStandardMilestones`)는 시그니처 유지. **기존 3개 쓰기도 이력 기록을 추가**한다.

| 함수 | 인자 | 반환(성공) | 실패(한국어 Error) |
|---|---|---|---|
| `getBootstrap()` | — | 기존 JSON + `meta.user`(이메일 또는 `""`) + `history[]`(최근 30건, 최신 먼저: `{at, user, sheet, key, action, summary}`) | 기존과 같음 |
| `saveRow(table, row, expected, options)` | `expected` = 편집 시작 시점 행(신규는 `null`). 복합키 표(공수기록·마일스톤)는 `expected` 의 키로 행을 찾는다(이름·주차를 바꾸는 수정 허용). `options.createStandardMilestones`(projects 신규만) | `{ ok:true, table, created:boolean, row:<저장된 행 JSON>, milestones?:{created,skipped} }` | 검증 실패(첫 오류 메시지 앞에 필드 라벨) / 충돌 / 행 없음 |
| `deleteRow(table, key)` | `key` = `Schema.keyOf` 결과 | `{ ok:true, table, key, removed:{assignments,milestones,settlements} }` | `deleteCheck` 불가 사유 그대로 |
| `saveEffortWeek(member, week, rows, expected)` | `rows:[{projectId, md, memo}]` · `expected` = 그 팀원·주차의 현재 행 배열(`null` 이면 검사 생략) | `{ ok:true, member, week, effortLogs:[저장 행] }` | 검증·충돌 |

서버 규칙
- 모든 쓰기 = `withLock_` 안에서 **검증 → 충돌 검사 → 시트 쓰기 → 이력 기록 → flush**. 검증 전에는 시트를 건드리지 않는다.
- **행 단위 부분 쓰기**: 수정은 `Schema.diff` 로 바뀐 필드만 `setValue`(수식 열 보존). 신규는 마지막 내용 행 다음에 한 줄 `setValues`(수식 열은 `''` 로 두고 그 행에 수식을 채움 — 마일스톤 F: `fillStatusFormulaIfEmptyApi_`, 정산 D·E·H·I: 새 헬퍼 `fillSettlementFormulasApi_(sheet,row)`; `setupSheets` 의 수식 문자열과 동일). 삭제는 `sheet.deleteRow(hit.row)` — 여러 행이면 큰 번호부터.
- 배정 탭은 기존 "프로젝트 행 교체" 방식 유지. 공수기록 `saveEffortWeek` 는 그 팀원·주차 행을 삭제(큰 번호부터)한 뒤 새 행을 끝에 추가. `loggedAt` = 지금.
- 프로젝트 신규: `nextProjectId_(sheet, 행사 시작일 연도)` 로 ID, `createdAt` = 오늘, **정산 탭에 ID 행 자동 추가**(수식 포함), `options.createStandardMilestones` 면 기존 `createStandardMilestones` 로직 호출(잠금 중첩 금지 — 내부 함수로 분리해 재사용).
- 프로젝트 삭제(연쇄): 배정·마일스톤·정산 행 삭제. 삭제 전 대상 행 전체를 이력 G열에 JSON 백업. 공수기록·정산 매출이 있으면 `deleteCheck` 가 막는다.
- 충돌 검사: `expected` 의 각 필드를 현재 시트 행(같은 `…FromRowApi_` 변환)과 비교. 하나라도 다르면 Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.').
- 이력 기록 `logHistory_(sheet, key, action, summary, backup)`: `변경이력` 탭이 없으면 만든다(`ensureHistorySheet_`, 기존 시트 대응). 열 = 일시(`YYYY-MM-DD HH:mm:ss`) · 사용자 · 탭 · 키 · 동작(추가/수정/삭제/저장) · 변경 내용 · 이전 행(백업 JSON). 사용자 = `Session.getActiveUser().getEmail()` (실패 시 `""`). `setupSheets` 도 이 탭을 만든다. `clearSampleData` 는 이 탭을 비우지 않는다.
- 반환은 전부 `finalizeApi_` 경유(Date 잔존 금지).

## 4. 화면 (`src/app.js` · `src/styles.css`)
- 한 번에 폼 하나: `state.form = { table, mode, values, expected, error, options, anchor }`. 입력은 `input`/`change` 위임으로 `state.form.values` 에 역기록(재렌더 없음 — 배정 편집기와 같은 방식). 열기·닫기·저장·오류 시에만 `render()`.
- 공통 폼 카드 `formCard(table, form, view)`: `Schema.TABLES[table].fields` 로 필드를 자동 생성(type → text/number/date/select/textarea, `auto`·`immutable` 필드는 읽기 전용 표시). 버튼: **저장** · **취소** · (수정 모드) **삭제**(confirmable, 연쇄 건수 문구). 오류는 카드 안 `.tb-form-error` 에 필드 라벨과 함께.
- 저장 전 클라이언트 선검증 = `Schema.validateRow`. 서버 오류 메시지는 토스트 + 카드 안 표시.
- 배치
  | 화면 | 추가 UI |
  |---|---|
  | 머리말 | **새로고침** 버튼(`getBootstrap` 재호출, 필터·탭 유지) |
  | A 포트폴리오 | 툴바 **새 프로젝트**(폼: 표준 마일스톤 함께 생성 체크 기본 켬). 상세 패널: **수정** · **삭제** 버튼, 마일스톤 표 각 행 **수정/삭제** + **마일스톤 추가**, 정산 요약 옆 **정산 입력** |
  | B 배정 보드 | 히트맵 아래 **팀원 관리** 카드: 표(이름·주역할·가용·상태·색상) + 행별 수정/삭제 + **팀원 추가** |
  | C 공수 관리 | **공수 입력** 카드: 팀원 선택 + 주차 선택(이번 주 월요일부터 8주 뒤로) → 그 팀원·주차의 행 편집(프로젝트 코드·M/D·메모, 행 추가/제거) → **저장**(`saveEffortWeek`). 주간 기록 매트릭스 셀 클릭 → 그 팀원·주차로 열기 |
  | E 이번 주 | 맨 아래 **최근 변경** 목록(`history` 30건: 일시·사용자·탭·키·동작·요약) |
- 응답 반영은 기존 방식(로컬 `state.data` 부분 갱신 → `render()`). 신규 프로젝트는 `projects` push + 정산 행 push + 마일스톤 push. 삭제는 해당 배열에서 제거(연쇄 포함). `history` 는 앞에 끼워 넣는다(30건 유지).
- `DataProvider` 두 어댑터에 `saveRow` · `deleteRow` · `saveEffortWeek` 를 **쌍으로** 추가. mock 은 `Schema` 로 검증·충돌 검사까지 흉내 내고 `console.info('[mock write] …')` 를 남긴다. mock 의 `meta.user` = `"미리보기 사용자"`.
- 라벨은 전부 한국어·약어 금지. 룩은 기존 토큰(`.tb-card`·`.btn`·`.tb-confirm`·`.tb-edit-row`)을 재사용, 신규 클래스는 `.tb-form`·`.tb-form-grid`·`.tb-form-error`·`.tb-form-actions`·`.tb-history` 정도로 최소화.

## 5. 게이트 (메인이 실행 · 전부 통과해야 체크아웃)
1. 빌드 `node scripts/build.js` — Code.gs 마커 블록 채움 · 외부 주소 0
2. 테스트 `node --test tests/metrics.test.js tests/sample-data.test.js tests/schema.test.js` — 기존 55 + 신규(검증·삭제 규칙·diff·주간 공수·충돌 스냅샷)
3. 실렌더 `node scripts/render-check.js` — 기존 [1]~[4] 유지 + **[3] 쓰기 게이트 확장**: 3-4 프로젝트 추가(표준 마일스톤 옵션 → 마일스톤 +9·정산 +1) · 3-5 프로젝트 수정(계약금액 변경 → A 카드 금액 반영) · 3-6 마일스톤 추가/수정/삭제 · 3-7 정산 입력(완료 프로젝트에 매출·직접비 → D 성과표 값 변화) · 3-8 팀원 추가 → 참조 없는 팀원 삭제 성공 / 참조 있는 팀원 삭제 거부 오류 표시 · 3-9 공수 주간 입력(팀원5 · 기준 주차 → E 미기록 경고 −1) · 3-10 프로젝트 삭제(견적·공수 0 → 마일스톤 연쇄 삭제, 카드 −1) · 3-11 최근 변경 목록에 위 동작이 쌓임 · 대화상자 호출 0 · `[mock write]` 로그 ≥ 10
4. 정적 검사 — 단가·급여·인건비·원가율 0건(가이드 안내문 1건 제외) · `window.confirm/alert/prompt` 0
5. 문서 — SPEC v1.2(§3.8 변경이력 탭 · §5 쓰기 경로 절 · §5.2 편집 규칙 · §6.1 API 표 · §11 개정 이력) · 계약(§2.1 `meta.user` · §2.9 `history` · §3.9 변경이력 레이아웃 · §5 API 표 · §9 편집 계약) · 가이드(§6.1·§6.2·§6.5 를 "대시보드에서" 로 갱신, §6.8 변경 이력 보기, §9.4 표)

## 6. 병렬 분담 (파일 단위 · 서로 겹치지 않음)
| 에이전트 | 파일 | 범위 |
|---|---|---|
| ① 서버 | `apps-script/Code.gs`(마커 블록 · 변경이력 탭 · `logHistory_` · `saveRow` · `deleteRow` · `saveEffortWeek` · `getBootstrap` 확장 · 기존 3경로 이력 · `setupSheets` 변경이력 탭) | §3 |
| ② 화면 | `src/app.js` · `src/styles.css` · `mock/sample-data.json`(`meta.user`·`history:[]`) · `scripts/render-check.js`(게이트 3-4~3-11) | §4 · §5-3 |
| ③ 문서·테스트 | `docs/SPEC-v1.md` · `docs/DATA-CONTRACT.md` · `guide/설치-운영-가이드.md` · `tests/schema.test.js` · `tests/sample-data.test.js`(최상위 키에 `history` 추가) | §5-2 · §5-5 |
- 메인: `src/schema.js` · `scripts/build.js` · `src/index.template.html` (작성 완료) → 병합 · 게이트 · Apps Script 반영(file_upload + monaco) · PROGRESS.md
- 금지: 저장소 전체 git 명령 · 다른 에이전트 파일 수정 · 외부 라이브러리 · 브라우저 대화상자 · 단가/급여 필드
