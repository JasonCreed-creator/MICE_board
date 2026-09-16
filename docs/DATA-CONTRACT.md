# DATA-CONTRACT.md — 팀 프로젝트 보드 데이터 계약 (동결본)

- 동결: 2026-09-10 · Code 2턴 착수 시 · 기준 문서 `docs/SPEC-v1.md` §3·§4·§6.1
- 개정: 2026-09-11 · 3.1 패치(§4.4·§4.5·§4.7 변경 — 각 절에 [3.1 변경] 표시) · 기준 문서 `docs/SPEC-v1.md` **v1.1**
- 개정: 2026-09-13 · 4턴 대시보드 편집(§2.1 `meta.user` · §2.9 `history` · §3.9 `변경이력` · §5 쓰기 API 3종 · §8 헬퍼 · **§9 편집 계약 신설** — `src/schema.js`) · 기준 문서 `docs/SPEC-v1.md` **v1.2**
- 개정: 2026-09-14 · 5턴 마일스톤 업무 블럭·주석(§2.1 `meta.blocksSource` · **§2.10~2.12 `items`·`notes`·`blocks`** · §3.8 ID 규칙 `W-`·`N-` · **§3.10~3.12 `세부항목`·`주석`·`업무블럭` 탭** · §5 `addItems`·`saveRow('items'|'notes')`·`deleteRow('items')`·**배정 동기화 규칙** · §8 헬퍼 · **§9.9~9.14 편집 계약 확장**(검증·삭제·롤업·배정 동기화·주석 집계·기본 카탈로그) · 충돌 검사는 §9.9 → **§9.15**, 검산 목록은 §9.10 → **§9.16** 으로 이동) · 기준 문서 `docs/SPEC-v1.md` **v1.3**
- 개정: 2026-09-15 · 6턴 부채 정리·운영 UX·자동화(§2.1 `meta.userMember` · §2.3·§3.4 `팀원` **이메일**(F열) · §2.9·§3.9 동작 **`되돌림`** · §5 **서버 API 3종 자리**(되돌리기·마일스톤 일괄 처리·카탈로그 파생) · §9.1 팀원 6열·동작 5종 · §9.14 기본 카탈로그 **44** · **§9.17~9.22 편집 계약 확장**(본인 매칭·저장 가드·되돌리기·일괄 처리·카탈로그 파생·주간 공수 행)) · 기준 문서 `docs/SPEC-v1.md` **v1.4**
- 목적: `getBootstrap()`(gas 모드)과 `mock/sample-data.json`(mock 모드)이 **완전히 같은 JSON 구조**를 내놓게 하고, 시트 열 ↔ JSON 필드 ↔ 산식 ↔ 쓰기 API를 한 문서로 고정한다.
- 모든 서브에이전트(① 시트·스키마 / ② 대시보드 / ③ 연동·가이드)는 이 문서만 보고 작업한다. 이 문서와 어긋나는 구현은 병합 시 이 문서 기준으로 고친다.

---

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 날짜 | 전부 `"YYYY-MM-DD"` 문자열. Code.gs는 `Utilities.formatDate(d, "Asia/Seoul", "yyyy-MM-dd")` 로 변환. **Date 객체를 그대로 반환하지 않는다** |
| 일시 | `"YYYY-MM-DD HH:mm"` 문자열 (`effortLogs[].loggedAt`) · `history[].at` · **(v1.3)** `notes[].at` 은 초 포함 `"YYYY-MM-DD HH:mm:ss"` · `meta.generatedAt` 만 ISO 8601(`2026-09-10T09:00:00+09:00`) |
| 숫자 | JSON 숫자형. 시트에서 문자열로 들어온 숫자는 `Number()` 변환. 변환 실패는 `null` |
| 빈 값 | 문자열 필드 → `""`, 숫자·날짜 선택 필드 → `null`. 예외: `projects[].contractAmount` 는 빈 값 → `0` |
| 열거값 | `settings` 의 목록 문자열과 **완전 일치**(공백·특수문자 포함). 예: `"디자인·제작"`(가운뎃점 U+00B7), `"① 리멤버 MICE 솔루션"` |
| `[자동]` 열 | 시트의 수식 열(실마진·실마진율·쇼업률·게런티 달성률·마일스톤 상태)은 **읽지 않는다**. 프런트가 `src/metrics.js` 로 원시값에서 재계산 |
| 정렬 | 배열 순서는 시트 행 순서 그대로. 프런트가 필요 시 정렬 |
| 헤더 행 | 모든 탭 1행은 헤더. 데이터는 2행부터. 헤더 행이 빈 시트는 빈 배열로 반환 |
| 필수값 누락 행 | 첫 열(ID·주차·이름·프로젝트ID)이 비어 있는 행은 건너뛴다 |
| 금지 필드 | 단가·급여·인건비·원가율 필드는 어느 탭·어느 JSON에도 두지 않는다(결정 D3). 개인 연락처도 두지 않는다 — **(v1.4 · D17)** 예외는 `팀원` 탭의 **회사 업무 계정 이메일** 하나뿐이고, 개인 휴대폰·개인 메일은 계속 금지. `scripts/static-check.js` 가 이 규칙을 자동으로 검사한다 |

---

## 2. 최상위 JSON 구조

```json
{
  "meta": {},
  "settings": {},
  "members": [],
  "projects": [],
  "assignments": [],
  "effortLogs": [],
  "milestones": [],
  "settlements": [],
  "history": [],
  "items": [],
  "notes": [],
  "blocks": []
}
```

**(v1.3)** `items`·`notes`·`blocks` 세 키는 탭이 없어도 **항상 있다** — `items`·`notes` 는 `[]`, `blocks` 는 코드 기본 카탈로그(§2.12). 최상위 키는 12개로 고정(`tests/sample-data.test.js` 가 검사).

### 2.1 `meta`
| 필드 | 형식 | 설명 |
|---|---|---|
| `generatedAt` | ISO 8601 | 생성 시각. gas: 서버 현재 시각(Asia/Seoul) · mock: 고정값 |
| `mode` | `"mock"` \| `"gas"` | 데이터 출처. 프런트 화면 코드는 이 값으로 분기하지 않는다(표시용) |
| `sheetUrl` | 문자열 | gas: `SpreadsheetApp.getActiveSpreadsheet().getUrl()` · mock: `""` → "시트 열기" 링크 비활성 |
| `today` | `YYYY-MM-DD` | **기준일**. gas: 서버 오늘(Asia/Seoul) · mock: `"2026-09-10"` 고정. 프런트·산식의 "오늘"은 반드시 이 값을 쓴다(실렌더·테스트 재현성). 값이 없으면 브라우저 현재 날짜로 대체 |
| `user` | 문자열 | **(v1.2)** 웹앱을 연 사용자. gas: `Session.getActiveUser().getEmail()`(실패·빈 값이면 `""`) · mock: `"미리보기 사용자"`. 화면 표시와 `변경이력` 사용자 열에만 쓴다(D6b — SPEC §1.1). 권한 판단에 쓰지 않는다. **(v1.3)** 주석 `author` 와 "본인만 수정" 판정에도 같은 값을 쓴다 |
| `userMember` | 문자열 | **(v1.4 · D17)** `meta.user`(로그인 이메일)를 `팀원` 탭 이메일 열과 맞춰 찾은 **팀원 이름**. 못 찾으면 `""` — 화면이 이름 선택(브라우저 기억)으로 넘어간다. 판정은 `Schema.matchMember`(§9.17) 하나로 서버·mock 이 공유한다. `퇴사` 팀원은 매칭하지 않는다. mock: `"팀원1"`. **권한 판단에 쓰지 않는다**(D6b) — 내 주간 공수·주석 작성자 기본값 같은 편의용 |
| `blocksSource` | `"default"` \| `"sheet"` \| **(v1.4)** `"default+derived"` \| `"sheet+derived"` | **(v1.3)** `blocks[]` 의 출처. gas: `업무블럭` 탭이 있으면 `"sheet"`, 없으면 코드 기본 카탈로그(`Schema.DEFAULT_BLOCKS`)를 돌려주며 `"default"` · mock: `"default"`. 화면은 `"default"` 일 때 [블럭 추가] 안에 "기본 카탈로그 사용 중 — 시트 메뉴 [팀 보드 → 드롭다운 목록 새로고침] 이 `업무블럭` 탭을 만듭니다" 한 줄만 안내한다 |

### 2.2 `settings`
| 필드 | 형식 | 기본값 | 시트 위치(§3.7) |
|---|---|---|---|
| `statuses` | string[] | `["견적","계약","준비","진행","완료","정산완료","드롭"]` | 설정!A |
| `types` | string[] | `["① 리멤버 MICE 솔루션","② 일반 행사(게런티 없음)","③ DMS·주최형","④ 커스터마이즈"]` | 설정!B |
| `roles` | string[] | `["영업","모객","운영 PM","현장 운영","디자인·제작","정산·리포트"]` | 설정!C |
| `commonCodes` | string[] | `["G-내부","G-영업","G-휴가"]` | 설정!D |
| `capacityMdPerMonth` | number | `20` | 설정!K:L "월 가용 M/D" |
| `margin.external` | number | `0.25` | "마진 외부노출" |
| `margin.markup` | number | `0.10` | "마진 비노출 마크업" |
| `margin.target` | number | `0.35` | "마진 목표" |
| `thresholds.utilWarn` | number | `0.85` | "가동률 주의" |
| `thresholds.utilOver` | number | `1.0` | "가동률 과부하" |
| `thresholds.missingLogWeeks` | number | `1` | "미기록 허용 주" |
| `timelineOffsets.kickoffDays` | number | `-90` | "착수일 오프셋" |
| `timelineOffsets.settlementDays` | number | `30` | "정산일 오프셋" |
| `milestoneTemplate` | object[] | 아래 표 | 설정!F:I |

**표준 마일스톤 템플릿(9종, SPEC §3.5 D-오프셋)** — 순서 고정

| # | `name` | `offsetDays` | `role` | `skipForHost` |
|---|---|---|---|---|
| 1 | 계약 체결 | -90 | 영업 | true |
| 2 | 발주처 기초자료 수령 | -50 | 운영 PM | true |
| 3 | 답사 | -45 | 운영 PM | false |
| 4 | 랜딩페이지 컨펌 | -35 | 모객 | false |
| 5 | 운영계획서 확정 | -14 | 운영 PM | false |
| 6 | 행사 7일 전 점검 | -7 | 운영 PM | false |
| 7 | 행사 당일 | 0 | 현장 운영 | false |
| 8 | 정산보고 제출 | 5 | 정산·리포트 | false |
| 9 | 정산 승인 | 30 | 정산·리포트 | false |

- 오프셋 기준일: `offsetDays <= 0` → **행사 시작일**, `offsetDays > 0` → **행사 종료일** (정산 예정일 = 종료일 +30 규칙과 일치).
- `skipForHost`: 프로젝트 `type` 이 `"③"` 으로 시작(주최형)하면 생성하지 않는다.
- 답사는 SPEC의 D-60~D-30 구간 중앙값 D-45 로 고정. 시트 설정 탭에서 바꿀 수 있다.

**고정 열거값(설정 탭에 두지 않음, 코드·검증에 하드코딩)**
- 배정 상태: `예정` / `진행` / `종료`
- 팀원 상태: `재직` / `휴직` / `퇴사` / `지원` — `지원` = 타 팀·외부 지원 인력(배정·칩에는 나오지만 히트맵·팀 계획 가동률·과부하·미기록·투입 구성·주간 기록에서는 제외). 2026-09-11 실기 중 추가
- 정산 상태: `미착수` / `진행` / `완료`

### 2.3 `members[]` ← 탭 `팀원`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `name` | string | A 이름 | 유일키. 다른 탭의 "팀원"·"담당PM"·"담당" 은 이 값을 참조 |
| `role` | string | B 주역할 | `settings.roles` 중 1 |
| `capacityMd` | number | C 월 가용 M/D | 빈 값 → `settings.capacityMdPerMonth` |
| `status` | string | D 상태 | 재직/휴직/퇴사/지원. 빈 값 → `"재직"`. `지원` 은 가동률·경고 대상에서 제외 |
| `color` | string | E 색상 | HEX(`#RRGGBB`) 또는 `""`(프런트가 자동 배색) |
| `email` | string | F 이메일 | **(v1.4 · D17)** 선택 입력 · 빈 값은 `""`. **회사 업무 계정만**(개인 메일·휴대폰 금지). 값이 있으면 형식 검증(`@` 앞뒤 + 점 있는 도메인)과 **팀원 간 유일**(대소문자 무시). 로그인 이메일과 맞으면 `meta.userMember` 가 된다(§9.17 `matchMember`). 시트 F1 헤더가 없으면 서버가 헤더만 만들어 기존 데이터를 보존한다 |

### 2.4 `projects[]` ← 탭 `프로젝트`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `id` | string | A 프로젝트ID | `P-YYYY-NNN`. `[자동]` 이지만 **값 자체는 읽는다**(수식이 아닌 스크립트가 채운 값) |
| `name` | string | B 행사명 | |
| `client` | string | C 발주처 | 주최형은 `"리멤버(자체)"` |
| `type` | string | D 유형 | `settings.types` 중 1 |
| `status` | string | E 상태 | `settings.statuses` 중 1 |
| `pm` | string | F 담당PM | `members[].name` 중 1 |
| `eventStart` | date | G 행사 시작일 | 필수 |
| `eventEnd` | date | H 행사 종료일 | 필수. 1일 행사는 시작일과 동일 |
| `kickoff` | date \| `""` | I 착수일 | 비어 있으면 프런트가 `eventStart + kickoffDays` 로 표시 |
| `settlementDue` | date \| `""` | J 정산 예정일 | 비어 있으면 `eventEnd + settlementDays` |
| `venue` | string | K 베뉴 | |
| `guarantee` | number \| null | L 게런티(명) | ②·③은 null 허용 |
| `expectedAttendees` | number \| null | M 예상 참가(명) | |
| `contractAmount` | number | N 계약금액(원) | 부가세 별도. 빈 값 → `0` |
| `note` | string | O 비고 | |
| `createdAt` | date \| `""` | P 등록일 | `onEdit` 이 채움 |

### 2.5 `assignments[]` ← 탭 `배정`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `id` | string | A 배정ID | `A-NNNN`. 스크립트가 채움 |
| `projectId` | string | B 프로젝트ID | |
| `member` | string | C 팀원 | |
| `role` | string | D 역할 | `settings.roles` 중 1 |
| `plannedMd` | number | E 계획 M/D | 0.5 단위. 배정 기간 전체 계획 공수 |
| `start` | date | F 배정 시작 | |
| `end` | date | G 배정 종료 | `start <= end` |
| `status` | string | H 상태 | 예정/진행/종료. 빈 값 → `"예정"` |
| `note` | string | I 비고 | |

### 2.6 `effortLogs[]` ← 탭 `공수기록`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `week` | date | A 주차 | 해당 주 **월요일**. 월요일이 아닌 날짜가 들어오면 프런트가 그 주 월요일로 정규화 |
| `member` | string | B 팀원 | |
| `projectId` | string | C 프로젝트ID | 프로젝트 ID 또는 공통코드 `G-내부`/`G-영업`/`G-휴가` |
| `md` | number | D 실투입 M/D | 0.5 단위 |
| `memo` | string | E 메모 | |
| `loggedAt` | datetime \| `""` | F 기록일시 | `onEdit` 이 채움 |

### 2.7 `milestones[]` ← 탭 `마일스톤`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `projectId` | string | A 프로젝트ID | |
| `name` | string | B 마일스톤 | 같은 프로젝트 안에서 유일(중복 방지 키 = `projectId + name`) |
| `due` | date | C 예정일 | |
| `done` | date \| `""` | D 완료일 | |
| `owner` | string | E 담당 | `members[].name` 또는 `""` |
| (읽지 않음) | 수식 | F 상태 `[자동]` | 프런트 `milestoneStatus()` 로 재계산 |

### 2.8 `settlements[]` ← 탭 `정산`
| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `projectId` | string | A 프로젝트ID | 프로젝트당 1행 |
| `revenue` | number \| null | B 매출(원) | 원시값 그대로. 값이 있으면 그 자체로 "정산 확정" 신호다(§4.4). null 일 때 `projects[].contractAmount` 로 대체하는 것은 **정산 확정 프로젝트에 한한다** |
| `directCost` | number \| null | C 직접비 집행(원) | |
| (읽지 않음) | 수식 | D 실마진(원) · E 실마진율 | |
| `preReg` | number \| null | F 사전 등록(명) | |
| `attended` | number \| null | G 현장 참석(명) | |
| (읽지 않음) | 수식 | H 쇼업률 · I 게런티 달성률 | |
| `status` | string | J 정산 상태 | 미착수/진행/완료. 빈 값 → `"미착수"` |

### 2.9 `history[]` ← 탭 `변경이력` (v1.2 · D7)

대시보드 쓰기의 최근 기록. `getBootstrap()` 이 `변경이력` 탭의 **마지막 30행을 최신 먼저** 정렬해 내보낸다. 탭이 없거나 비어 있으면 `[]`. mock 은 `[]` 로 시작하고, 대시보드 쓰기가 성공할 때마다 프런트가 응답을 배열 **앞에 끼워 넣는다**(30건 유지, 전체 재로드 없음).

| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `at` | `YYYY-MM-DD HH:mm:ss` | A 일시 | 서버 시각(Asia/Seoul), 초 단위. Date 로 저장돼 있어도 문자열로 변환해 내보낸다 |
| `user` | string | B 사용자 | 기록 당시 `meta.user` 와 같은 값(이메일 또는 `""`) |
| `sheet` | string | C 탭 | 바뀐 탭 이름 = `Schema.TABLES[table].sheet`(`프로젝트`·`팀원`·`공수기록`·`마일스톤`·`정산`·`배정`) |
| `key` | string | D 키 | `Schema.keyLabel(table, row)` 결과(§9.6). 예 `P-2026-003` · `P-2026-003 · 답사` · `2026-09-07 · 팀원1 · P-2026-001` |
| `action` | `"추가"` \| `"수정"` \| `"삭제"` \| `"저장"` \| **(v1.4)** `"되돌림"` | E 동작 | `저장` = 묶음 저장(배정 저장 · 주간 공수 저장 · 표준 마일스톤 생성 · 완료 처리 · **(v1.4)** 마일스톤 일괄 처리). `되돌림` = 이력 한 줄 복원(§9.19 · D19). 목록의 단일 원천은 `Schema.HISTORY.actions` 5종 |
| `summary` | string | F 변경 내용 | `Schema.summarize(...)` 결과(§9.7). 줄바꿈(`\n`) 포함 가능 |
| `backup` | 값 \| `null` \| 문구 | G 이전 행(백업) | **(v1.4 개정)** 삭제·수정 전 행의 JSON 을 **푼 값**. v1.3 까지는 내보내지 않았으나, 화면이 `Schema.restoreCheck`(§9.19)로 [되돌리기] 가능 여부를 그 자리에서 판정해야 해 내보낸다. 빈 칸은 `null`, 읽을 수 없으면 `'(백업을 읽을 수 없음)'` |

**(v1.4 · D19) 되돌리기용 추가 필드** — 화면은 이 두 필드로 [되돌리기] 버튼과 사유를 그린다.

| 필드 | 형식 | 설명 |
|---|---|---|
| `row` | 정수 | 그 이력이 있는 **시트 행 번호** — 되돌리기 호출 때 인덱스와 함께 보내 서버가 대조한다(불일치 = 목록이 바뀜) |
| `backup` | 위 표 참조 | 백업이 `null` 이면 화면이 버튼 대신 사유를 보여준다. 최종 판정은 서버가 한 번 더 한다 |

> 화면·서버가 **같은 `Schema.restoreCheck`** 를 쓰므로 문구가 어긋나지 않는다. 백업은 셀당 최대 약 4.9만 자 × 최근 이력 건수까지 실릴 수 있다 — 실제로는 행 1~수십 건이라 수 KB 수준이고, 커지면 이력 보관 건수를 줄이거나 백업만 별도 호출로 떼는 선택지가 남아 있다.

---

### 2.10 `items[]` ← 탭 `세부항목` (v1.3 · D11 · D13 · D14 · D15)

마일스톤 아래 **파트별 업무 블럭** 한 줄 = 한 행. 화면 라벨은 "세부 항목"·"업무 블럭"("R&R"·"WBS" 는 화면에 쓰지 않는다). 계획 M/D 합계가 §9.11 `itemRollup` 으로 프로젝트 합계(M/M 환산 병기 — D12)가 되고, §9.12 `assignmentsFromItems` 로 `배정` 자동 행이 된다(D13). 탭이 없으면 `[]`.

| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `id` | string | A 세부ID | `W-NNNNNN`(6자리, §3.8). 유일키. 서버가 채움 |
| `projectId` | string | B 프로젝트ID | 수정 불가(immutable) — 항목을 다른 프로젝트로 옮기지 않는다 |
| `milestone` | string | C 마일스톤 | 같은 프로젝트의 `milestones[].name` 중 1(검증 §9.9). 마일스톤 이름이 바뀌면 서버가 연쇄 갱신(§5) |
| `part` | string | D 파트 | `settings.roles` 중 1(D14 — 파트 = 역할 6종 그대로) |
| `block` | string | E 블럭 | 업무 블럭 이름. 카탈로그(§2.12)에서 고르거나 직접 입력. 유일키 = `projectId + milestone + block` |
| `owner` | string | F 담당 | `members[].name` 또는 `""`(파트만 정한 상태 — 파트 합계로만 집계, 배정에 반영 안 됨) |
| `impact` | string | G 임팩트 | 상/중/하. 빈 값 → `"중"`. 표시만 하고 배정 담당자가 판단(D15 — 등급·경고 없음) |
| `difficulty` | string | H 난이도 | 상/중/하. 빈 값 → `"중"` |
| `plannedMd` | number | I 계획 M/D | 0.5 단위 ≥ 0. 빈 값 → `0`. 저장·산식 단위는 M/D(D3·D12) |
| `due` | date \| `""` | J 예정일 | 비우면 마일스톤 예정일을 따른다(§9.13 `itemDate`) |
| `status` | string | K 상태 | 예정/진행/완료. 빈 값 → `"예정"` |
| `note` | string | L 비고 | |
| (읽지 않음) | 수식 | M 행사명(자동) | 마일스톤 G열과 같은 1행 배열 수식(§3.10). 시트를 직접 보는 사람을 위한 표시용 |

- 임팩트 또는 난이도가 `"상"` 인 항목 = **핵심 항목**(`Schema.isKeyItem`). 담당이 비면 E 화면 "핵심 항목 미배정" 에 오른다(§9.11 `keyUnassigned`).

### 2.11 `notes[]` ← 탭 `주석` (v1.3 · D16)

세부 항목(또는 마일스톤 전체)에 파트가 남기는 판단 근거·요청·질문·결정. 탭이 없으면 `[]`.

| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `id` | string | A 주석ID | `N-NNNNNN`(§3.8). 유일키. 서버가 채움 |
| `projectId` | string | B 프로젝트ID | 수정 불가 |
| `milestone` | string | C 마일스톤 | 같은 프로젝트의 마일스톤(검증). 이름 변경 시 연쇄 갱신 |
| `itemId` | string | D 세부ID | `items[].id` 또는 `""`(마일스톤 전체 주석). 값이 있으면 실제 항목이어야 한다(검증 §9.9) |
| `part` | string | E 파트 | 어느 파트의 의견인지. `settings.roles` 중 1 |
| `author` | string | F 작성자 | 접속 계정 이메일(`meta.user` 와 같은 값). **서버가 채움**(`userEmail_()`). 폼에서 읽기 전용 |
| `authorName` | string | G 작성자 이름 | `members[].name` 또는 `""`(선택 — 이메일↔이름 대응표가 없어 폼에서 고른다) |
| `at` | `YYYY-MM-DD HH:mm:ss` | H 일시 | 서버가 채움(`nowStrApi_(true)`). 초 포함 |
| `type` | string | I 유형 | 판단 근거 / 요청 / 질문 / 결정. 빈 값 → `"요청"` |
| `content` | string | J 내용 | 필수(공백만은 불가). 줄바꿈 허용 |
| `resolved` | `"예"` \| `""` | K 해결 | `"예"` = 해결. 그 외 빈 값 = 미해결(§9.13 `noteCounts.open`) |

- 수정은 **작성자 본인만**(서버: 현재 이메일 ≠ `author` 면 거부). 단 `resolved` 만 바꾸는 요청(해결 체크)은 누구나. 삭제는 시트에서만(`deleteRow('notes')` 는 §9.10 사유로 거부).
- 블럭을 카탈로그에서 넣을 때 카탈로그의 "판단에 필요한 내용" 이 **첫 주석**(유형 `요청` · 파트 = 블럭 파트 · 세부ID = 그 항목)으로 자동 생성된다(`addItems` · `saveRow('items', …, { firstNote })`).

### 2.12 `blocks[]` ← 탭 `업무블럭` (v1.3 · D14 · 카탈로그)

파트별 업무 블럭 카탈로그. **시트에서만 편집**하고 대시보드는 읽기만 한다(`saveRow`·`deleteRow` 대상 아님). 탭이 없으면 `getBootstrap` 이 코드 기본 카탈로그 `Schema.DEFAULT_BLOCKS`(**v1.4** 44건 · §9.14)를 그대로 돌려주고 `meta.blocksSource = "default"`. `setupSheets`·`setupSheetsEmpty` 와 메뉴 [팀 보드 → 드롭다운 목록 새로고침] 이 탭을 만들어 기본값을 채운다(이미 있으면 건드리지 않음). mock 은 기본 카탈로그 중 **그 시트 역할 목록에 해당하는 블럭 전부**와 같다(현재 mock 은 역할 6종 → 33건).

**(v1.4 · D22) 카탈로그 파생** — 내보내기 직전에 `Schema.blocksWithFallback(blocks, settings)`(§9.21)를 거친다. `settings.roles` 에 있는데 블럭이 0개인 파트에는 **공통 블럭 5종**을 그 파트 이름으로 파생해 `blocks[]` **뒤에 덧붙인다**. 파생분은 시트에 쓰지 않는다(화면에서 고를 수만 있고, 고른 순간 `세부항목` 행이 된다). 파생이 하나라도 섞이면 `meta.blocksSource` 에 `+derived` 가 붙는다.

| 필드 | 형식 | 열 | 설명 |
|---|---|---|---|
| `part` | string | A 파트 | `settings.roles` 중 1. 유일키 = `part + block`. **(v1.4)** 파생분도 같은 모양이라 화면은 원본과 파생을 구분하지 않고 쓴다 |
| `block` | string | B 블럭 | 블럭 이름(화면 [블럭 추가] 의 체크 칩) |
| `milestone` | string | C 기본 마일스톤 | 표준 마일스톤 9종 중 1(§2.2). 화면은 펼친 마일스톤과 같은 블럭을 먼저 보여준다 |
| `md` | number | D 기본 M/D | 0.5 단위 ≥ 0. 항목을 만들 때 `plannedMd` 초기값 |
| `impact` | string | E 기본 임팩트 | 상/중/하. 빈 값 → `"중"` |
| `difficulty` | string | F 기본 난이도 | 상/중/하. 빈 값 → `"중"` |
| `judge` | string | G 판단에 필요한 내용 | 항목을 만들 때 첫 주석(유형 요청) 내용. 비어 있으면 첫 주석 없음 |
| `skipForHost` | boolean | H 주최형 제외 | 시트 `예` → `true`, 그 외 `false`. 프로젝트 유형이 `③` 으로 시작하면 [블럭 추가] 목록에서 숨긴다. 기본값은 영업 4건만 `true` |

---

## 3. 시트 레이아웃 (탭 11개 = 데이터 6 + 설정 + 변경이력 + v1.3 세부항목·주석·업무블럭 · `setupSheets()` 와 `getBootstrap()` 이 공유)

헤더는 아래 문자열과 **완전 일치**. 열 순서 고정. 열 추가는 맨 오른쪽에만(기존 인덱스 보존).

### 3.1 `프로젝트` (A:P)
`프로젝트ID | 행사명 | 발주처 | 유형 | 상태 | 담당PM | 행사 시작일 | 행사 종료일 | 착수일 | 정산 예정일 | 베뉴 | 게런티(명) | 예상 참가(명) | 계약금액(원) | 비고 | 등록일`
- 드롭다운: 유형 → `설정!B2:B50` · 상태 → `설정!A2:A50` · 담당PM → `팀원!A2:A100`
- 날짜 열(G~J, P) 서식 `yyyy-mm-dd`

### 3.2 `배정` (A:I)
`배정ID | 프로젝트ID | 팀원 | 역할 | 계획 M/D | 배정 시작 | 배정 종료 | 상태 | 비고`
- 드롭다운: 프로젝트ID → `프로젝트!A2:A500` · 팀원 → `팀원!A2:A100` · 역할 → `설정!C2:C50` · 상태 → 리스트 `예정,진행,종료`

### 3.3 `공수기록` (A:F)
`주차 | 팀원 | 프로젝트ID | 실투입 M/D | 메모 | 기록일시`
- 드롭다운: 팀원 → `팀원!A2:A100` · 프로젝트ID → `설정!E2:E600`(공통코드 + 프로젝트ID 합본, 아래 3.7)
- 실투입 M/D: 5 초과 시 경고(데이터 검증 "경고 표시", 입력 거부 아님)

### 3.4 `팀원` (A:F) — v1.4 이메일 추가
`이름 | 주역할 | 월 가용 M/D | 상태 | 색상 | 이메일`
- 드롭다운: 주역할 → `설정!C2:C50` · 상태 → 리스트 `재직,휴직,퇴사,지원`
- **F 이메일(v1.4 · D17)**: 선택 입력 · 회사 업무 계정만 · 드롭다운·수식 없음. 기존 시트는 **F1 헤더가 비어 있으면 헤더만** 써 넣는다(`ensureMemberEmailColumn_` — `setupSheets` 와 메뉴 [드롭다운 목록 새로고침] 에서 호출). 데이터는 건드리지 않는다. `Schema.TABLES.members.width` 는 **6**

### 3.5 `마일스톤` (A:G)
`프로젝트ID | 마일스톤 | 예정일 | 완료일 | 담당 | 상태`
- 드롭다운: 프로젝트ID → `프로젝트!A2:A500` · 담당 → `팀원!A2:A100`
- F열 `[자동]` 수식(행별): `=IF(A2="","",IF(D2<>"","완료",IF(C2<TODAY(),"지연","예정")))`
- G열 `[자동]` 행사명(2026-09-14 추가): **G1 에 배열 수식 하나** `=ARRAYFORMULA(IF(ROW(A1:A)=1,"행사명(자동)",IF(A1:A="","",IFERROR(VLOOKUP(A1:A,프로젝트!A:B,2,FALSE),""))))` — 헤더까지 수식이 만든다. **읽지 않음**(표시용). `Schema.TABLES.milestones.width` 는 6 그대로(대시보드가 쓰는 범위는 A:F). `HEADERS` 는 7열, 행 삭제·추가에 영향받지 않음. 없는 시트는 `ensureMilestoneNameColumn_`(setupSheets · 드롭다운 목록 새로고침 메뉴)이 만든다

### 3.6 `정산` (A:J)
`프로젝트ID | 매출(원) | 직접비 집행(원) | 실마진(원) | 실마진율 | 사전 등록(명) | 현장 참석(명) | 쇼업률 | 게런티 달성률 | 정산 상태`
- `[자동]` 수식(행별): D `=IF(OR(B2="",C2=""),"",B2-C2)` · E `=IF(OR(B2="",C2="",B2=0),"",(B2-C2)/B2)` · H `=IF(OR(F2="",G2="",F2=0),"",G2/F2)` · I `=IFERROR(IF(G2="","",G2/INDEX(프로젝트!L:L,MATCH(A2,프로젝트!A:A,0))),"")`
- 드롭다운: 프로젝트ID → `프로젝트!A2:A500` · 정산 상태 → 리스트 `미착수,진행,완료`

### 3.7 `설정` (열 단위 목록 + 기준값 표)
| 열 | 헤더(1행) | 내용(2행~) |
|---|---|---|
| A | 상태 목록 | `settings.statuses` 한 줄에 하나 |
| B | 유형 목록 | `settings.types` |
| C | 역할 목록 | `settings.roles` |
| D | 공통코드 | `settings.commonCodes` |
| E | 공수기록 코드(자동) | E2 수식 `={D2:D20;프로젝트!A2:A500}` — 읽지 않음, 드롭다운 전용 |
| F | 마일스톤 | 템플릿 `name` |
| G | D-오프셋(일) | 템플릿 `offsetDays` |
| H | 기본 담당역할 | 템플릿 `role` |
| I | 주최형 제외 | `예` 또는 빈 값 → `skipForHost` (`예` = true) |
| K | 기준값 항목 | 아래 9개 키 문자열(완전 일치) |
| L | 값 | 숫자 |

기준값 키(K열) ↔ JSON: `월 가용 M/D`→`capacityMdPerMonth` · `마진 외부노출`→`margin.external` · `마진 비노출 마크업`→`margin.markup` · `마진 목표`→`margin.target` · `가동률 주의`→`thresholds.utilWarn` · `가동률 과부하`→`thresholds.utilOver` · `미기록 허용 주`→`thresholds.missingLogWeeks` · `착수일 오프셋`→`timelineOffsets.kickoffDays` · `정산일 오프셋`→`timelineOffsets.settlementDays`

`getBootstrap()` 은 A~D·F~I·K~L 을 읽어 `settings` 를 만든다. 키가 없으면 §2.2 기본값을 쓴다.

### 3.8 ID 규칙
- 프로젝트ID `P-YYYY-NNN`: YYYY = 행사 시작일 연도(없으면 등록 연도), NNN = 그 연도 내 최대 번호 + 1 (3자리 0 채움)
- 배정ID `A-NNNN`: 탭 전체 최대 번호 + 1 (4자리 0 채움)
- `onEdit`: `프로젝트` 탭 B열(행사명)에 값이 입력되고 A열이 비어 있으면 ID·등록일(P열) 자동 채움. `공수기록` 탭 A~D열 편집 시 F열 기록일시 채움
- **(v1.2)** 대시보드 `saveRow('projects', …)` 신규도 같은 규칙으로 서버가 ID(`nextProjectId_(sheet, 행사 시작일 연도)`)·등록일(오늘)을 채운다. 폼의 ID 칸은 읽기 전용
- **(v1.3)** 세부ID `W-NNNNNN` · 주석ID `N-NNNNNN`: 탭 전체 최대 번호 + 1 (6자리 0 채움). 서버 `nextSeqIdApi_(sheet, 'W' | 'N', usedIds)` 가 발급하며 한 호출에서 여러 개를 만들 때(`addItems` — 항목 n개 + 첫 주석 n개)도 중복이 없어야 한다. mock 은 같은 규칙으로 흉내 낸다(`state.data.items` 최대 + 1). 시트에서 직접 붙여 넣은 행에는 `onEdit` 이 ID 를 채우지 않는다 — 세부 항목·주석은 대시보드에서 추가하는 것을 전제

### 3.9 `변경이력` (A:G) — v1.2 · D7
`일시 | 사용자 | 탭 | 키 | 동작 | 변경 내용 | 이전 행(백업)`
- 탭 이름·헤더의 단일 원천은 `Schema.HISTORY`(`src/schema.js`): `{ sheet:'변경이력', headers:[위 7개], actions:['추가','수정','삭제','저장','되돌림'] }` — **(v1.4)** `되돌림` 추가(D19)
- `setupSheets()`·`setupSheetsEmpty()` 가 만든다. **탭이 없으면 첫 쓰기 때 `ensureHistorySheet_()` 가 자동 생성**한다(2턴에 만든 기존 시트도 재설정 없이 대응). `clearSampleData` 는 이 탭을 **비우지 않는다**
- A 일시: 문자열 `YYYY-MM-DD HH:mm:ss`(서버 시각, TZ). B 사용자: `userEmail_()` = `Session.getActiveUser().getEmail()`, 실패·빈 값이면 `""`. C 탭: `Schema.TABLES[table].sheet`. D 키: `Schema.keyLabel`. E 동작: `Schema.HISTORY.actions` 중 1. F 변경 내용: `Schema.summarize` 결과(여러 줄 가능)
- G 이전 행(백업): **삭제** = 지운 행 전체를 JSON 문자열로 — 프로젝트 연쇄 삭제는 `{ project, assignments:[], milestones:[], settlements:[] }` 처럼 함께 지운 행을 모두 담는다. **수정** = 수정 전 행 JSON. **추가** = 빈 값. **저장**(묶음) = 교체 전 행 배열 JSON(배정 저장 · 주간 공수 저장), 표준 마일스톤 생성·완료 처리는 빈 값 또는 이전 행
- 행 추가(append)만 한다. 스크립트만 쓰고 사람은 손으로 고치지 않는다(가이드 §9.4). 드롭다운·수식·데이터 검증 없음. 열 추가는 맨 오른쪽에만
- `getBootstrap()` 은 마지막 30행을 읽어 최신 먼저 정렬해 `history[]`(§2.9)로 내보내고 **G 열은 내보내지 않는다**(용량·민감도)
- 시트에서 직접 고친 값은 여기에 남지 않는다(구글 시트 "버전 기록"이 담당). 대시보드 쓰기 경로(SPEC §5.2 1~6 · v1.3 8 · **v1.4 9·10**)만 기록한다. **(v1.3)** 탭 열에 `세부항목`·`주석`·`배정`(동기화) 이 추가로 등장한다
- **(v1.4)** 되돌리기는 **한 줄을 더 쌓는다**(지우지 않는다) — 동작 `되돌림`, 키는 되돌린 대상의 키, 백업(G)에는 **복원 직전 상태**. 마일스톤 일괄 처리는 대상이 n건이어도 **1줄**(동작 `저장`, 키는 대상 수를 알 수 있는 요약, 백업은 이전 행 **배열**)

### 3.10 `세부항목` (A:M) — v1.3
`세부ID | 프로젝트ID | 마일스톤 | 파트 | 블럭 | 담당 | 임팩트 | 난이도 | 계획 M/D | 예정일 | 상태 | 비고`
- 드롭다운: 프로젝트ID → `프로젝트!A2:A500` · 파트 → `설정!C2:C50` · 담당 → `팀원!A2:A100` · 임팩트·난이도 → 리스트 `상,중,하` · 상태 → 리스트 `예정,진행,완료`
- 예정일(J) 서식 `yyyy-mm-dd` · 계획 M/D(I) 는 0.5 단위 경고(데이터 검증 "경고 표시", 입력 거부 아님)
- M열 `[자동]` 행사명: 마일스톤 G열과 같은 방식 — **M1 에 배열 수식 하나** `=ARRAYFORMULA(IF(ROW(B1:B)=1,"행사명(자동)",IF(B1:B="","",IFERROR(VLOOKUP(B1:B,프로젝트!A:B,2,FALSE),""))))`. 헤더까지 수식이 만든다. **읽지 않음**(표시용). `Schema.TABLES.items.width` 는 13, `formulaCols` 는 `[12]` — 대시보드가 쓰는 범위는 A:L 이고 신규 행의 M 은 비워 둔다(배열 수식이 채움). 없는 시트는 `ensureNameColumnApi_(sheet, 2)`(setupSheets · 드롭다운 목록 새로고침 메뉴 · 첫 쓰기)가 만든다
- 첫 열(세부ID)이 비어 있는 행은 건너뛴다(§1). `setupSheets`(샘플 포함)는 이 탭에 샘플을 넣지 않는다 — 실기에서는 대시보드 [블럭 추가] 로 시작

### 3.11 `주석` (A:K) — v1.3
`주석ID | 프로젝트ID | 마일스톤 | 세부ID | 파트 | 작성자 | 작성자 이름 | 일시 | 유형 | 내용 | 해결`
- 드롭다운: 프로젝트ID → `프로젝트!A2:A500` · 파트 → `설정!C2:C50` · 작성자 이름 → `팀원!A2:A100` · 유형 → 리스트 `판단 근거,요청,질문,결정` · 해결 → 리스트 `예`(빈 값 허용)
- 작성자(F)·일시(H)는 서버가 채운다(문자열 `YYYY-MM-DD HH:mm:ss` — Date 로 저장돼 있어도 문자열로 변환해 내보낸다). 내용(J)은 셀 줄바꿈 허용
- 사람은 이 탭에서 **삭제만** 한다(대시보드는 삭제를 거부 — §9.10). 시트에서 지운 것은 변경이력에 남지 않는다(파일 → 버전 기록)

### 3.12 `업무블럭` (A:H) — v1.3 · 카탈로그
`파트 | 블럭 | 기본 마일스톤 | 기본 M/D | 기본 임팩트 | 기본 난이도 | 판단에 필요한 내용 | 주최형 제외`
- 드롭다운: 파트 → `설정!C2:C50` · 기본 마일스톤 → `설정!F2:F50` · 기본 임팩트·난이도 → 리스트 `상,중,하` · 주최형 제외 → 리스트 `예`(빈 값 허용)
- `setupSheets`·`setupSheetsEmpty`·메뉴 [팀 보드 → 드롭다운 목록 새로고침] 이 **없을 때만** 만들고 `Schema.DEFAULT_BLOCKS` 33행을 채운다(`ensureBlocksSheetApi_`). 이미 있으면 내용을 건드리지 않는다. 기획자님이 이 탭에서 블럭·M/D·판단 내용을 다듬는다 — 대시보드는 읽기만. `clearSampleData` 도 이 탭은 비우지 않는다
- `getBootstrap` 은 탭이 있으면 읽어 `blocks[]`(`meta.blocksSource:"sheet"`), 없으면 기본 카탈로그(`"default"`). 첫 열(파트)이 비어 있는 행은 건너뛰고, H열은 `예` 만 `true`

---

## 4. 산식 계약 (`src/metrics.js` — 순수 함수, DOM 접근 없음)

SPEC §4 산식을 아래 규칙으로 고정한다. 모든 함수는 `settings` 와 `today` 를 인자로 받고 전역 상태를 읽지 않는다. Node(`module.exports`)와 브라우저(`window.Metrics`) 양쪽 로드 가능.

### 4.1 날짜·기간
- 달력일 계산은 UTC 정오 기준(`Date.UTC(y, m, d)`)으로 하여 시간대·서머타임 영향 제거
- `mondayOf(dateStr)`: 그 날짜가 속한 주의 월요일
- `monthKey(dateStr)` → `"YYYY-MM"`
- **주차의 소속 월 = 주차(월요일)의 월**. 예: 2026-08-31 주차는 8월
- `effectiveKickoff(project, settings)` = `kickoff || eventStart + kickoffDays` · `effectiveSettlementDue` = `settlementDue || eventEnd + settlementDays`

### 4.2 배정 월 배분 `allocateByMonth(assignment)` → `{ "YYYY-MM": md }`
- 기간 = `start`~`end` **양끝 포함** 달력일 수 N. 각 월에 속한 일수 n_m 만큼 `plannedMd × n_m / N` 배분(반올림 없이 실수, 표시 시 소수 1자리)
- `start` 와 `end` 가 같은 월이면 전량 그 월
- `start > end` 또는 날짜 누락이면 `{}` (경고 없이 무시)

### 4.3 가동률
- 계획 가동률(팀원, 월) = Σ `allocateByMonth` 의 해당 월 값 ÷ `capacityMd` — 대상 배정: **프로젝트 상태가 `드롭` 이 아닌** 모든 배정(배정 상태 무관)
- 실가동률(팀원, 월) = Σ 공수기록 `md`(해당 월 주차, `G-휴가` **제외**, `G-내부`·`G-영업` 포함) ÷ `capacityMd`
- 단계 `level`: `ratio > utilOver` → `"over"`(적) · `ratio >= utilWarn` → `"warn"`(황) · 그 외 `"ok"`(녹). `capacityMd` 0 이면 `ratio = null`, `level = "ok"`
- 프로젝트 비중(팀원, 월) = 프로젝트 코드 md ÷ 전체 기록 md(`G-*` 포함)

### 4.4 프로젝트 지표 `projectOutput(data, projectId)`

**[3.1 변경]** — 미확정 금액을 성과로 표시하지 않기 위해 "정산 확정(`realized`)" 판정을 먼저 두고, 성과 값은 realized 일 때만 채운다. 정산 전 프로젝트는 계약금액만 보이고 나머지는 `null`(화면 "—").

- **[3.1 변경]** `realized` (boolean): 프로젝트 상태가 `완료`·`정산완료` 이거나, 정산 탭 `revenue` 가 입력(`null` 이 아님)되면 `true`. 상태 `견적`·`드롭` 은 **항상 `false`**
- **[3.1 변경]** `contractAmount` (number): 프로젝트 계약금액 — realized 와 무관하게 **항상 값**(빈 값은 §1 규칙에 따라 `0`)
- **[3.1 변경]** `revenue`: realized 일 때만 `settlement.revenue ?? project.contractAmount`, 아니면 `null`
- **[3.1 변경]** `directCost`: 정산 탭 원시값 그대로(`null` 허용). realized 여부로 가공하지 않는다
- **[3.1 변경]** `margin`: realized 이고 `directCost` 가 `null` 이 아닐 때 `revenue − directCost`, 아니면 `null`
- **[3.1 변경]** `marginRate` = `margin ÷ revenue` — `margin` 이 `null` 이거나 `revenue` 가 0 이면 `null`
- **[3.1 변경]** `revenuePerMd` = `revenue ÷ Σ 실투입 md` · `marginPerMd` = `margin ÷ Σ 실투입 md` — **realized 이고 실투입 > 0 일 때만** 값, 아니면 `null`
- 소진율 = Σ 실투입 md(해당 프로젝트ID) ÷ Σ 계획 md(해당 프로젝트 배정). 계획 0 이면 `null` (realized 와 무관)
- `showUpRate` = `attended ÷ preReg` — 둘 중 하나 null 또는 preReg 0 이면 `null`. **realized 와 무관**(정산 탭 입력값 기반)
- `guaranteeRate` = `attended ÷ project.guarantee` — 게런티 null/0 또는 attended null 이면 `null`. **realized 와 무관**
- 마진 기준선: `marginRate` 를 `margin.external`(25%)·`margin.target`(35%)과 대조 — `< external` 적 · `external ≤ r < target` 황 · `≥ target` 녹. `marginRate` 가 `null` 이면 기준선 판정 없음
- 라벨: `margin` 계열은 문서·화면에서 **"실마진(직접비 차감)"** 으로 표기한다(SPEC §3.6 가정 A 유지 — 직접비 집행만 차감)

### 4.5 팀 월별 `teamOutputByMonth(data)`

**[3.1 변경]** — 반환 구조를 실적/예정 2층으로 바꾼다.

- 팀 Input(월) = Σ 전 팀원 공수기록 md — **프로젝트 코드만**(`G-*` 전부 제외) *(변경 없음)*
- **[3.1 변경]** 반환 `{ "YYYY-MM": { actualRevenue, actualMargin, plannedRevenue } }` — 귀속 월 = **행사 종료월**(`eventEnd` 의 `monthKey`)
- **[3.1 변경]** `actualRevenue` · `actualMargin` = 그 달의 **realized 프로젝트**의 `revenue` 합 · `margin` 합 (`margin` 이 `null` 인 프로젝트는 마진 합에서 제외)
- **[3.1 변경]** `plannedRevenue` = 그 달의 프로젝트 중 **realized 가 아니면서** 상태가 `계약`·`준비`·`진행` 인 건의 `contractAmount` 합
- **[3.1 변경]** 상태 `견적`·`드롭` 은 **두 층 모두에서 제외**
- **[3.1 변경]** 화면 D 의 팀 월별 복합 차트는 막대=투입 공수, 선 3개 = **실적 매출(실선) · 예정 매출(점선) · 실마진(직접비 차감)(실선)**. 범례 각주 "예정 = 계약~진행 단계 계약금액"

### 4.6 마일스톤 상태 `milestoneStatus(m, today)`
`done` 있음 → `"완료"` · `due < today` → `"지연"` · 그 외 → `"예정"`

### 4.7 경고 5종 `warnings(data, today)` → `{ overload, unassigned, delayed, missingLog, burnOver }`
| 키 | 판정 | 항목 필드 |
|---|---|---|
| `overload` | 오늘이 속한 월부터 **6개월**(당월 포함) 중 계획 가동률 `level === "over"` 인 (팀원, 월). 참고로 `"warn"` 은 히트맵 색으로만 표시하고 경고 목록에는 넣지 않는다 | `{ member, month, ratio, plannedMd, capacityMd }` |
| `unassigned` | 프로젝트 상태 ∈ {`계약`,`준비`,`진행`} 이고, 배정 행이 0건이거나 **모든 배정 행의 팀원이 `pm` 과 같은** 프로젝트 | `{ projectId, name, status, pm, assignmentCount }` |
| `delayed` | `milestoneStatus === "지연"` 인 마일스톤(`드롭` 프로젝트 제외) | `{ projectId, name, due, owner, daysLate }` |
| `missingLog` | **[3.1 변경]** 기준 주차 **R = 오늘이 속한 주의 월요일 − 7일**(= 지난주 월요일) 고정. 상태 `재직` 팀원 중, 자기 최신 기록 주차가 R 보다 `missingLogWeeks` 주 이상 뒤처진(또는 기록이 전혀 없는) 팀원 | `{ member, week: R, lastWeek }` |
| `burnOver` | 소진율 > 1.0 인 프로젝트. `today <= eventEnd` 면 `severity: "over"`(적), 지나면 `"past"`(회색) | `{ projectId, name, ratio, severity }` |

> **[3.1 변경] `missingLog` 기준 주차 되돌림** — 2턴 구현의 `max(팀 전체 최신 기록 주차, 이번 주 월요일 − 7일)` 규칙은 3턴에서 **불승인**됐다(팀 전원이 기록을 밀면 R 이 함께 내려가 경고가 사라짐). SPEC v1.0 원문대로 R 은 달력 기준 **지난주 월요일 고정**이다. `src/metrics.js` 의 `baseWeek()`·`Code.gs` 주석·테스트를 이 규칙에 맞춘다.

mock 기준일 2026-09-10 에서 §5 가상 데이터는 과부하(팀원2 · 2026-11) · 미배정(계약 프로젝트) · 지연(진행 프로젝트 1건) · 미기록(팀원5)이 각각 정확히 1건 이상 나와야 한다. 미기록 재현 조건: 기준 주차 R = 2026-08-31(오늘이 속한 주의 월요일 2026-09-07 − 7일)이고, **팀원5 는 2026-08-24 주차가 마지막 기록(08-31·09-07 없음)** 이므로 R 보다 1주 뒤처져 경고 1건이 잡힌다.

### 4.8 표준 마일스톤 생성 `standardMilestones(project, template, assignments, existing)`
프런트(mock)와 `Code.gs`(gas)가 **같은 결과**를 내야 한다.
1. 템플릿을 순서대로 순회. `skipForHost && project.type.startsWith("③")` 이면 건너뜀
2. `due` = (`offsetDays <= 0` ? `eventStart` : `eventEnd`) + `offsetDays`
3. `owner` = 그 프로젝트 배정 중 `role` 이 템플릿 `role` 과 같은 첫 팀원 → 없고 템플릿 `role === "운영 PM"` 이면 `project.pm` → 그 외 `""`
4. `existing` 에 같은 `projectId + name` 이 있으면 `skipped` 에 이름만 넣고 건너뜀
5. 반환 `{ created: [{projectId,name,due,done:"",owner}], skipped: [name] }`

### 4.9 핵심 지표 (상단 KPI 스트립)
- **[3.1 변경]** `kpis.eventsThisMonth`("이달 행사") = 행사 기간(`eventStart`~`eventEnd`)이 기준일의 달과 겹치는 프로젝트 수 — **상태 `견적`·`드롭` 제외**
- `kpis.plannedUtilization`("팀 계획 가동률") = 당월 계획 M/D 합 ÷ 팀 가용 M/D 합. 대상 배정은 §4.3 규칙(프로젝트 상태 `드롭` 제외, 배정 상태 무관)을 그대로 따른다
- 핵심 지표의 필터 적용 여부는 SPEC §5.1 "필터 적용 범위" 표를 따른다 — "팀 계획 가동률"만 전체 데이터 고정, 나머지 3개는 필터 적용

---

## 5. 쓰기 API 계약 (`DataProvider` 인터페이스 = `Code.gs` 함수 시그니처)

프런트는 `DataProvider` 메서드(v1.1 까지 4개 + v1.2 `saveRow`·`deleteRow`·`saveEffortWeek` + v1.3 `addItems` = 8개 · **v1.4 되돌리기·마일스톤 일괄 처리 2개 추가 → §5.1**)만 호출한다. gas 어댑터는 `google.script.run.withSuccessHandler(...).withFailureHandler(...)` 를 Promise 로 감싼다. mock 어댑터는 메모리 상태를 갱신하고 `console.info("[mock write] <함수명>", payload)` 를 남긴다. **응답 구조는 두 모드가 동일**하며, 프런트는 응답을 로컬 상태에 반영한 뒤 재렌더한다(전체 재로드 없음).

| 메서드 | 인자 | 반환(성공) | 실패 |
|---|---|---|---|
| `getBootstrap()` | 없음 | §2 전체 JSON — **(v1.3)** `items`·`notes`·`blocks`·`meta.blocksSource` 포함(탭이 없으면 `items`·`notes` 는 `[]`, `blocks` 는 기본 카탈로그) | `Error(한국어 메시지)` |
| `saveAssignments(projectId, rows)` | `rows: [{ id: "" \| "A-NNNN", member, role, plannedMd, start, end, status, note }]` | `{ ok: true, projectId, assignments: [저장된 행(ID 부여됨)] }` | 검증 실패 시 `Error("…")` — 팀원·역할이 목록에 없음 / `plannedMd` 숫자 아님·음수 / `start > end` |
| `completeMilestone(projectId, name, date)` | `date` 는 `YYYY-MM-DD` 또는 `""`(→ 오늘) | `{ ok: true, projectId, name, done }` | 해당 마일스톤 없음 |
| `createStandardMilestones(projectId)` | | `{ ok: true, projectId, created: [...], skipped: [...] }` (§4.8) | 프로젝트 없음 / 행사일 없음 |
| **(v1.2)** `saveRow(table, row, expected, options)` | `table` ∈ `projects`·`members`·`effortLogs`·`milestones`·`settlements` · **(v1.3)** `items`·`notes` · `row` = 폼 값(문자열 가능, 서버가 `Schema.normalizeRow`) · `expected` = 편집 시작 시점 행(신규는 `null`). 복합키 표(공수기록·마일스톤)는 `expected` 의 키로 행을 찾는다(이름·주차를 바꾸는 수정 허용) · `options.createStandardMilestones`(projects 신규만) · **(v1.3)** `options.firstNote`(items 신규만, 문자열 — 있으면 유형 `요청` · 파트 = 항목 파트 · 세부ID = 새 항목의 주석을 같은 잠금 안에서 함께 생성) | `{ ok:true, table, created:boolean, row:<저장된 행 JSON>, milestones?:{created,skipped} }` — 프로젝트 신규는 `row.id`·`row.createdAt` 이 채워져 돌아온다. **(v1.3)** `items`: + `assignments:[그 프로젝트의 배정 행 전체(자동+수동)]` · `overlaps:[{ member, role, itemsMd, manualMd }]` · 신규이고 `firstNote` 가 있으면 `firstNote:<주석 행>` — `notes`: 신규는 `row.author`·`row.at` 이 채워져 돌아온다 — `milestones` 수정으로 이름이 바뀌면 + `renamed:{ items:n, notes:n }` | 검증 실패(첫 오류 메시지, 필드 라벨 포함) / 충돌(D9) / 행 없음 / **(v1.3)** `notes` 수정에서 현재 이메일 ≠ `expected.author`(단 바뀐 필드가 `해결` 하나뿐이면 허용) → `Error("주석은 작성자 본인만 수정할 수 있습니다. 해결 표시만 바꿀 수 있습니다.")` |
| **(v1.2)** `deleteRow(table, key)` | `key` = `Schema.keyOf(table, row)` 결과. `table` ∈ `projects`·`members`·`milestones` · **(v1.3)** `items` | `{ ok:true, table, key, removed:{assignments,milestones,settlements,items,notes} }` — 프로젝트 외에는 전부 0. **(v1.3)** `items` 는 `removed.notes`(그 세부ID 의 주석 연쇄) + `assignments:[그 프로젝트의 배정 행 전체]` · `overlaps` · `milestones` 는 `removed.notes`(마일스톤 전체 주석) · `projects` 는 `removed.items`·`removed.notes` 추가 | `Schema.deleteCheck` 불가 사유 그대로(§9.5 · **§9.10** — 마일스톤에 세부 항목이 있으면 불가, `notes`·`blocks` 는 항상 불가) / 행 없음 |
| **(v1.2)** `saveEffortWeek(member, week, rows, expected)` | `rows:[{projectId, md, memo}]` · `expected` = 그 팀원·주차의 현재 행 배열(`null` 이면 검사 생략) | `{ ok:true, member, week, effortLogs:[저장 행(loggedAt 채워짐)] }` | 검증(`Schema.validateEffortWeek`) · 충돌 |
| **(v1.3)** `addItems(projectId, milestone, part, blockNames)` | 카탈로그 블럭 여러 개를 한 번에. `blockNames: string[]` = 그 파트의 `blocks[].block`(화면 [블럭 추가] 의 체크 칩) | `{ ok:true, projectId, milestone, part, items:[생성 행], notes:[첫 주석들], skipped:[이미 있는 블럭 이름], assignments:[그 프로젝트의 배정 행 전체], overlaps:[…] }` — 기본 M/D·임팩트·난이도는 카탈로그에서, 예정일·담당은 비움(예정일은 마일스톤 예정일을 따름), 상태 `예정`. 카탈로그 "판단에 필요한 내용" 이 있으면 항목마다 첫 주석(유형 `요청` · 파트 = `part` · 작성자 = 현재 이메일) 생성. 잠금 1회 안에서 처리 · 이력은 항목마다 `추가` 1줄(+ 주석 `추가` 1줄) | 프로젝트·마일스톤 없음 / 파트가 역할 목록에 없음 / 블럭 이름이 그 파트 카탈로그에 없음 / 전부 이미 있으면 오류가 아니라 `items:[]`·`skipped` 전부 |

`saveAssignments` 서버 규칙: `LockService.getScriptLock()` 획득(최대 10초) → `배정` 탭에서 **해당 `projectId` 행만 삭제** → `rows` 를 뒤에 추가(기존 `id` 는 유지, 빈 `id` 는 §3.8 규칙으로 발급) → 다른 프로젝트 행은 순서·내용 보존 → 저장된 행 반환. `completeMilestone`·`createStandardMilestones` 도 같은 잠금을 쓴다.

**v1.2 서버 규칙(`saveRow`·`deleteRow`·`saveEffortWeek` 공통)**
- 모든 쓰기 = `withLock_` 안에서 **검증(`Schema.validateRow`/`validateEffortWeek`/`deleteCheck`) → 충돌 검사(§9.15) → 시트 쓰기 → 이력 기록(`logHistory_`) → `SpreadsheetApp.flush()`**. 검증 전에는 시트를 건드리지 않는다. 검증 오류는 첫 오류의 `message`(필드 라벨 포함)를 한국어 `Error` 로 throw
- **행 단위 부분 쓰기**: 수정은 `Schema.diff` 로 바뀐 필드만 `setValue`(수식 열·다른 열 보존). 신규는 마지막 내용 행 다음에 `Schema.toValues` 한 줄을 `setValues`(수식 열은 `''` 로 두고 그 행에 수식을 채움 — 마일스톤 F: `fillStatusFormulaIfEmptyApi_`, 정산 D·E·H·I: `fillSettlementFormulasApi_(sheet, row)`; 수식 문자열은 §3.5·§3.6 = `setupSheets` 와 동일). 삭제는 `sheet.deleteRow(행)` — 여러 행이면 큰 번호부터
- 프로젝트 신규: ID = `nextProjectId_(sheet, 행사 시작일 연도)`, `createdAt` = 오늘, **정산 탭에 같은 ID 의 빈 행을 자동 추가**(수식 포함). `options.createStandardMilestones` 면 `createStandardMilestonesApi_`(잠금 없는 내부 함수)를 이어서 호출 — 잠금 중첩 금지
- 프로젝트 삭제(연쇄): 배정·마일스톤·정산 행을 함께 삭제. 삭제 전 대상 행 전체를 이력 G 열에 JSON 백업. 공수기록·정산 매출이 있으면 `deleteCheck` 가 막는다(§9.5)
- 공수기록 `saveEffortWeek`: 그 팀원·주차 행을 삭제(큰 번호부터)한 뒤 새 행을 끝에 추가. `loggedAt` = 지금. 배정 탭은 기존 "프로젝트 행 교체" 방식 유지
- 충돌 검사(D9): `expected` 의 각 필드(자동 필드 제외 = `Schema.diff` 가 보는 범위)를 현재 시트 행(같은 `…FromRowApi_` 변환)과 비교. 하나라도 다르면 `Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.')`. `expected` 가 `null` 이면 생략. 행을 찾지 못하면(그 사이 삭제됨) 별도 "찾을 수 없습니다" 오류
- **기존 3경로(`saveAssignments`·`completeMilestone`·`createStandardMilestones`)도 이력을 기록**한다(동작 `저장`, 키 = 프로젝트ID 또는 `프로젝트ID · 마일스톤`)
- 반환은 전부 `finalizeApi_` 경유(Date 잔존 금지). 응답 구조는 mock 어댑터와 동일(§9.8)

**v1.3 서버 규칙 — 세부 항목 · 주석 · 배정 동기화(D13 · D16)**
- `saveRow('items')`·`addItems`·`deleteRow('items')` 는 시트 쓰기 뒤 **같은 잠금 안에서** `syncAssignmentsFromItemsApi_(projectId)` 를 실행하고 응답에 그 프로젝트의 배정 행 전체(자동+수동)와 `overlaps` 를 싣는다. 프런트는 `assignments` 를 **그 프로젝트 행만 교체**(다른 프로젝트 행 보존)한 뒤 재렌더한다 — 가동률·히트맵·소진율은 기존 산식(§4)이 자동 행을 보통 배정 행으로 계산한다
- **배정 동기화 규칙** — `syncAssignmentsFromItemsApi_(projectId)`. 판정은 `Schema.assignmentsFromItems`(§9.12)가 하고 서버·mock 이 **같은 결과**를 내야 한다
  1. 그 프로젝트의 세부 항목 중 **담당이 있는** 것을 (담당, 파트) 로 묶어 계획 M/D 합산. 담당 없는 항목은 배정에 반영하지 않는다(파트 합계로만 표시)
  2. 기간: 항목 날짜 = 예정일 ‖ 마일스톤 예정일(`Schema.itemDate`). `start = min(날짜) − 14일`, `end = max(날짜)`. 프로젝트 착수일(비면 행사 시작 + `kickoffDays`)~정산 예정일(비면 행사 종료 + `settlementDays`) 안으로 자르고, 시작 > 종료면 시작 = 종료. 날짜가 하나도 없으면 착수일~행사 종료일
  3. 기존 배정 행 중 비고가 `자동(세부항목)`(`Schema.AUTO_ASSIGN_NOTE`)인 행 = **자동 행**. 자동 행은 전부 지우고 다시 만든다(같은 (담당, 파트)가 있으면 ID 유지 · 상태 `예정`). 비고가 다른 행 = **수동 행**, 그대로 둔다
  4. **같은 (담당, 파트)에 수동 행이 있으면 자동 행을 만들지 않고 `overlaps[{ member, role, itemsMd, manualMd }]` 로만 알린다**(이중 집계 방지 — 겹침 생략 규칙). 수동 행을 지우면(B 편집기에서 행 제거 → 저장) 다음 동기화 때 자동 행이 생긴다
  5. 쓰기는 `writeProjectAssignmentsApi_(projectId, rows)` — `saveAssignments` 와 같은 방식(그 프로젝트 행 교체, 다른 프로젝트 행·원시값 보존, 빈 ID 는 §3.8 발급). `changed` 가 거짓이면 시트를 건드리지 않고 이력도 남기지 않는다. 참이면 이력 1줄 `배정 / 저장 / "세부항목 동기화: n행"`(키 = 프로젝트ID, 백업 = 교체 전 그 프로젝트 행 배열)
- `saveAssignments`(B 편집기)는 자동 행을 **원본 그대로 돌려받는다** — 프런트가 자동 행을 잠그고(회색 + "자동" 배지, 입력 불가) `rows` 에 그대로 포함한다. 자동 행을 편집기에서 지우고 저장하면 지워지지만 다음 동기화 때 다시 생긴다(세부 항목이 원천)
- `addItems`: 잠금 1회 → 프로젝트·마일스톤(그 프로젝트에 존재)·파트(역할 목록) 검증 → 카탈로그(탭 또는 기본값)에서 블럭 찾기(없는 이름은 오류) → 이미 있는 (프로젝트·마일스톤·블럭)은 `skipped` → 세부ID 발급(`nextSeqIdApi_`) · 행 추가(`Schema.toValues('items')`, M 은 비움) · `judge` 가 있으면 첫 주석 추가(주석ID 발급 · 작성자 = 현재 이메일 · 일시 = 지금 · 유형 `요청`) → 이력(항목마다 `추가`, 주석마다 `추가`) → 배정 동기화 → flush
- `saveRow('items')` 신규: ID 발급 + `options.firstNote` 처리(위와 같음). 수정: 부분 쓰기(`Schema.diff`) → 동기화. 담당·계획 M/D·예정일이 안 바뀌었으면 동기화 결과 `changed` 는 거짓이다
- `saveRow('notes')`: 신규는 `author = userEmail_()`, `at = nowStrApi_(true)` 를 서버가 채운다(폼 값 무시). 수정은 `expected.author` ≠ 현재 이메일이면 거부하되, `Schema.diff(expected, values)` 가 `resolved` 하나뿐이면 누구나 허용(해결 체크). 수정해도 `author`·`at` 은 바꾸지 않는다. `deleteRow('notes')` 는 `deleteCheck` 사유로 거부
- `saveRow('milestones')` 로 이름이 바뀌면(`expected.name` ≠ `values.name`) 같은 프로젝트의 `세부항목` C열·`주석` C열을 새 이름으로 갱신하고 응답 `renamed:{ items, notes }` 를 싣는다(이력 요약 마지막 줄 `세부 항목 n · 주석 n 이름 갱신`). `deleteRow('milestones')` 는 `deleteCheck` 가 세부 항목이 있으면 막고, 없으면 마일스톤 전체 주석(`cascade.notes`)을 백업(`{ milestone, notes:[] }`)한 뒤 함께 지운다
- `deleteRow('items')`: 그 세부ID 의 주석을 백업(`{ item, notes:[] }`)한 뒤 함께 지우고 배정 동기화. `deleteRow('projects')` 연쇄에 `items`·`notes` 를 추가(백업 JSON `{ project, assignments, milestones, settlements, items, notes }`, 응답 `removed.items`·`removed.notes`). 자동 배정 행은 배정 연쇄에 포함된다
- 탭이 없을 때: `세부항목`·`주석` 탭은 **첫 쓰기 때 자동 생성**(`ensureHistorySheet_` 와 같은 방식 — §3.10·§3.11 헤더·드롭다운·M 수식), `업무블럭` 탭은 만들지 않는다(기본 카탈로그 폴백 유지 — 탭 생성은 `setupSheets`·메뉴만)

### 5.1 v1.4 서버 API — 되돌리기 · 마일스톤 일괄 처리 · 카탈로그 파생 (D19·D21·D22)

> 판정 규칙은 전부 `src/schema.js` 순수 함수(§9.19~§9.21)라 브라우저·Node·Apps Script 세 곳에서 같은 결과를 낸다. 화면·mock 어댑터는 **쌍으로** 같은 동작을 구현한다(§6). 클라이언트가 부르는 이름은 `restoreHistory`·`bulkMilestone` 이다(`…Api_` 접미사가 붙은 내부 함수는 Apps Script 가 클라이언트에 노출하지 않는다). 두 API 모두 **객체 인자 하나**를 권장하고 위치 인자도 받는다.

**(1) 되돌리기 — `restoreHistory(…)` (D19)**

| 항목 | 내용 |
|---|---|
| 인자 | `{ index, row, expected }` — `index` 는 부트스트랩 `history[]` 인덱스(0 = 최신) · `row` 는 그 항목의 **시트 행 번호**(대조용, 필수) · `expected` 는 선택(`{ at, sheet, key, action }`, 빈 필드는 건너뜀). `row` 가 어긋나면 `목록이 바뀌었습니다. 새로고침 후 다시 시도하세요.` |
| 판정 | `Schema.restoreCheck(entry, data)`(§9.19) → `{ ok, reason, table, rows, mode }`. `ok:false` 면 `reason` 을 그대로 한국어 `Error` 로 |
| 쓰기 | `mode` 별 — `replace`(그 키의 행 묶음 교체) · `row`(단일 행 되돌리기) · `delete`(추가의 되돌리기 = 그 행 삭제). 잠금 → 판정 → 충돌 검사 → 행 단위 부분 쓰기(수식 열 보존) |
| 이력 | **1건 추가**(지우지 않는다) — 동작 `되돌림` · 탭·키는 되돌린 대상 · 백업(G)은 **복원 직전 상태** → 되돌리기의 되돌리기가 가능 |
| 응답 | `{ ok, table, sheet, mode, key, restored, removed, rows, removedKeys, history, historyExtra }` + 대상별 추가 — 배정·세부항목이면 `projectId`·`assignments`(그 프로젝트 배정 **전체**, 동기화 후)·`overlaps`, 공수기록 묶음이면 `member`·`week`·`effortLogs`(그 주차 **전체**) |
| 탭별 실제 동작 | `배정` = 백업이 있으면 언제나 그 프로젝트 배정 행 **전체 교체** · `공수기록`(키가 `주차 · 팀원`) = 그 팀원·주차 행 전체 교체 · 그 밖(마일스톤 일괄 처리 포함) = 백업 배열의 **행마다 키로 찾아** 되돌리고 없으면 다시 만든다 · `mode:'delete'` = 그 행 삭제(`세부항목`이면 딸린 주석도) |
| 거부 | 프로젝트 `삭제`(연쇄) · **프로젝트 `추가`**(정산·마일스톤이 함께 생겨 서버가 막음 — 프로젝트 상세의 [삭제]를 쓰라고 안내) · 표준 마일스톤 생성·`addItems` 처럼 **한 번에 여러 행을 추가한 기록**(백업이 없고 키가 한 행으로 안 좁혀짐) · `변경이력` 탭 자체 · 백업 없음/깨짐 · 여러 탭이 함께 바뀐 기록 · 되돌리기를 지원하지 않는 탭(§9.19) |

**(2) 마일스톤 일괄 처리 — `bulkMilestone(…)` (D21)**

| 항목 | 내용 |
|---|---|
| 인자 | `{ action, keys, payload, expected }` — `action` = `complete` \| `shift` · `keys` = `[{ projectId, name }]`(중복은 한 번만) · `payload` = `{ done }`(비우면 서버가 오늘) 또는 `{ days }`(정수, 0 불가) / `{ due }` · `expected` = 충돌 검사용 현재 행 배열(선택, 키로 짝지어 비교) |
| 판정 | `Schema.validateBulkMilestone(action, rows, payload, ctx)`(§9.20) → `{ ok, errors, warnings, values }`. `errors` 는 저장을 막고 `warnings`(완료일이 예정일보다 1년 이상 빠름)는 2단계 확인 문구에 싣는다 |
| 쓰기 | 잠금 1회 → 행 단위 부분 쓰기(**F 상태 수식 보존**) → 완료 처리면 그 프로젝트들의 배정 자동 행 재동기화 |
| 이력 | **묶음 1건** — 동작 `저장` · 백업(G)은 **이전 행 배열** JSON · 요약에 대상 건수와 무엇을 바꿨는지 |
| 응답 | `{ ok, action, count, changed, milestones, warnings, syncs, history, historyExtra }` — `milestones` = 저장된 행 배열 · `syncs[]` = `{ projectId, assignments, overlaps, changed }`. 바뀐 값이 하나도 없으면 시트·이력을 건드리지 않고 `changed: 0, unchanged: true` |
| 이력 키 | `일괄 N건` — 이 항목을 되돌리면 백업 배열의 행마다 키로 찾아 원래 값으로 돌아간다 |
| 없는 키 | 하나라도 찾지 못하면 **시트를 건드리기 전에 중단**하고 `마일스톤 "P-… · 이름" 을(를) 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.` |
| 재동기화 | `complete` 와 `shift` **둘 다** — 예정일이 바뀌면 `Schema.itemDate` 기준 자동 배정 기간이 낡기 때문(A3 와 같은 이유) |

**(3) 카탈로그 파생 — `getBootstrap` 안 (D22)**

| 항목 | 내용 |
|---|---|
| 규칙 | `업무블럭` 탭(없으면 `Schema.DEFAULT_BLOCKS` 44건)을 읽은 뒤 **`Schema.blocksWithFallback(blocks, settings)`**(§9.21)를 거쳐 `blocks[]` 로 내보낸다 |
| 출처 표기 | `meta.blocksSource` = `sheet` \| `default` 에 더해, 파생이 섞이면 `sheet+derived` \| `default+derived`. **`업무블럭` 탭이 있어도 쓸 행이 0이면 `default`** |
| 파생 목록 | `meta.derivedParts` = 공통 블럭으로 채운 파트 이름 배열(없으면 `[]`) |
| 쓰기 | **없음** — 파생분은 시트에 쓰지 않는다(`업무블럭` 탭은 여전히 시트 전용 · D14). 블럭 추가(`addItems`)도 같은 목록을 보므로 **파생 파트에서도 블럭을 고를 수 있다** |

**(4) 모든 쓰기 응답의 이력 필드 (v1.4)**

되돌리기가 화면 인덱스와 시트 행 번호를 맞추려면, 쓰기 직후 화면이 **서버가 실제로 남긴 이력 항목**을 그대로 받아야 한다. 그래서 v1.4 부터 모든 쓰기 응답에:

| 필드 | 내용 |
|---|---|
| `history` | 방금 남긴 이력 항목(`{ at, user, sheet, key, action, summary, row, backup }`) · 기록 실패 시 `null` |
| `historyExtra` | 자동 배정 동기화·표준 마일스톤 생성처럼 **따라붙은 이력**의 배열(순서대로) |

> 화면은 로컬에서 이력 항목을 지어내지 말고 `history`·`historyExtra` 를 순서대로 쌓는다. 지어낸 항목에는 `row` 가 없어 되돌리기가 "목록이 바뀌었습니다" 로 막힌다. mock 어댑터도 같은 모양(`row`·`backup` 포함)을 돌려줘야 `Schema.restoreCheck` 가 양쪽에서 같은 판정을 낸다.
| 이력 | 없음(읽기 경로) |
| 화면 | 파생 파트의 블럭 목록 위에 "기본 블럭에서 자동으로 만든 목록입니다 — `업무블럭` 탭에서 다듬을 수 있습니다" 한 줄 |

**(4) 본인 매칭 · 내 주간 공수 (D17·D18)** — 새 서버 API 없음. `getBootstrap` 이 `meta.userMember`(§2.1)를 더해 주고, 저장은 기존 `saveEffortWeek`(§5) 를 그대로 쓴다. 화면이 채울 행은 `Schema.weekEffortRows`(§9.22)가 만든다.

---

## 6. 모드 판별·DataProvider 구현 규칙 (프런트)

```js
const isGas = !!(window.google && window.google.script && window.google.script.run);
const provider = isGas ? GasProvider : MockProvider;   // 이 한 줄만 분기. 화면 코드는 provider 만 본다
```
- mock 데이터 위치: `<script id="mock-data" type="application/json">…</script>` (빌드가 `mock/sample-data.json` 을 인라인). gas 빌드(`apps-script/index.html`)에는 이 블록을 넣지 않는다 — gas 모드에서 mock 데이터가 섞이지 않게
- `meta.today` 를 산식의 기준일로 전달. 없으면 브라우저 현재 날짜
- **(v1.2)** 스크립트 로드 순서: `Schema`(`src/schema.js`) 는 `Metrics`(`src/metrics.js`) 보다 **먼저** 로드한다 — 화면 코드(`src/app.js`)가 폼 생성·선검증에 `window.Schema` 를 쓰고, mock 어댑터도 같은 객체로 검증·충돌 검사를 흉내 낸다. 두 어댑터는 `saveRow`·`deleteRow`·`saveEffortWeek` · **(v1.3)** `addItems` 를 **쌍으로** 갖는다(§9.8)
- **(v1.3)** mock 어댑터는 `saveRow('items')`·`addItems`·`deleteRow('items')` 뒤 `Schema.assignmentsFromItems` 로 같은 동기화를 하고(`state.data.assignments` 의 그 프로젝트 자동 행 교체, 빈 ID 는 `A-NNNN` 최대 + 1), 응답에 `assignments`·`overlaps` 를 싣고 `[mock write]` 로그 + 이력(`배정 / 저장 / 세부항목 동기화: n행`, `changed` 일 때만)을 남긴다. `saveRow('notes')` 신규의 `author` 는 mock 접속 이메일 대체값(`mock@example.com` — 샘플 주석과 같은 값이라 "본인만 수정" 이 샘플에도 적용된다), `at` 은 기준일 `meta.today` + 현재 시각. 화면은 `meta.blocksSource === 'default'` 안내를 mock 에서도 보여준다

---

## 7. 가상 데이터 규격 요약 (`mock/sample-data.json`, 지시문 §5)
- 팀원 5(`팀원1`~`팀원5`, 역할 순서 운영 PM / 모객 / 현장 운영 / 디자인·제작 / 정산·리포트, 가용 20, 재직)
- 프로젝트 5(가상 명칭, 4유형 전부 포함, 상태 견적·계약·준비·진행·완료 각 1, 행사일 2026-09~2027-02, 계약금액 2천만~1억 5천만)
- 배정: 프로젝트당 2~4행, 팀원2 2026-11 계획 가동률 110%, `계약` 프로젝트는 PM만 배정
- 공수기록: 2026-07-20 ~ 2026-09-07 월요일 8주, `G-내부` 주 0.5~1.0, **[3.1 변경]** 팀원5 는 2026-08-31·2026-09-07 주차 없음(마지막 기록 2026-08-24 → §4.7 미기록 경고 재현)
- 마일스톤: §2.2 템플릿으로 생성, `진행` 프로젝트에 예정일 지난 미완료 1개
- 정산: `완료` 프로젝트 1건 — 실마진율 28~32%, 쇼업률 60~75%, 게런티 값 있음
- `meta`: `{ "generatedAt": "2026-09-10T09:00:00+09:00", "mode": "mock", "sheetUrl": "", "today": "2026-09-10", "user": "미리보기 사용자", "blocksSource": "default" }` · **(v1.2)** 최상위 `"history": []`(빈 배열로 시작, 대시보드 쓰기가 앞에 끼워 넣음)
- **(v1.3 · v1.4 갱신)** `blocks`: 기본 카탈로그 중 **그 시트 역할 목록(현재 6종)에 해당하는 블럭 전부**와 같음(`Schema.DEFAULT_BLOCKS` 44건 중 33건 — 테스트가 deepEqual). `meta.userMember` 는 `"팀원1"`, `members[].email` 은 5명 중 3명만 채워 둔다(자동 매칭 화면과 이름 선택 화면을 둘 다 미리보기에서 볼 수 있게 · 도메인은 `example.com`) · `items` 6건: `진행` 프로젝트(P-2026-002)에 5 — 담당 팀원1 ×2(답사 · 운영계획서 확정, 운영 PM) · 팀원4(랜딩페이지 컨펌, 디자인·제작) · 팀원2(랜딩페이지 컨펌, 모객) · 담당 없음 1(행사 당일 등록 파트) → 합계 10 M/D = 0.5 M/M / `준비` 프로젝트(P-2026-003)에 핵심 미배정 1(운영계획서 확정 · 연사·패널 섭외 · 상·상 · 담당 없음 → E "핵심 항목 미배정" 재현) · 배정 탭에는 자동 행이 없다 — P-2026-002 의 (담당, 파트) 3묶음이 전부 수동 행(A-0005 · A-0008 · A-0006)과 겹쳐 `overlaps` 3 이 B 화면 배지로 재현된다 · `notes` 4건: 유형 4종 각 1, 미해결 2(E "미해결 질문·요청"), 마일스톤 전체 주석 1, 작성자 `mock@example.com`

---

## 8. Code.gs 공용 헬퍼 계약 (① 작성 · ③ 사용)

파일 분담: ① `apps-script/parts/01-core-setup.gs` · ③ `apps-script/parts/02-api.gs` → 메인이 `apps-script/Code.gs` 로 병합(01 → 02 순서로 이어 붙임). 두 파트는 같은 전역 스코프다. **이름 충돌 금지**: ①은 아래 목록 + `setupSheets` / `onOpen` / `onEdit` / `fillProjectIds` / `createMilestonesForSelection` 만 정의하고, ③은 `doGet` / `getBootstrap` / `saveAssignments` / `completeMilestone` / `createStandardMilestones` + 자기 전용 헬퍼(이름 끝에 `Api_`, 예 `validateRowsApi_`)만 정의한다. `createMilestonesForSelection`(①)은 `createStandardMilestones(projectId)`(③)를 호출한다.

**(v1.2)** 공개 함수 3개 추가: `saveRow(table, row, expected, options)` · `deleteRow(table, key)` · `saveEffortWeek(member, week, rows, expected)` (§5). 전역 `Schema` 는 `Code.gs` 의 마커 블록(`/* __SCHEMA_BEGIN__ … */` ~ `/* __SCHEMA_END__ */`)에 `scripts/build.js` 가 `src/schema.js` 원문을 채워 만든다 — 그 블록은 손으로 고치지 않는다(§9.1). v1.2 헬퍼:

```js
function userEmail_()                          // Session.getActiveUser().getEmail() | ''  (실패 시 '')
function ensureHistorySheet_()                 // '변경이력' 탭 반환. 없으면 Schema.HISTORY.headers 로 생성(§3.9)
function logHistory_(sheet, key, action, summary, backup)
                                               // 변경이력 탭에 1행 append: [now 'YYYY-MM-DD HH:mm:ss', userEmail_(), sheet(탭 이름), key, action, summary, backup(JSON 문자열 | '')]
function readAllApi_()                         // getBootstrap 의 읽기 부분 — settings·members·projects·assignments·effortLogs·milestones·settlements (v1.3: + items·notes·blocks·meta.blocksSource) 를 §2 형태로. saveRow 검증 ctx.data 로도 쓴다
function fillSettlementFormulasApi_(sheet, row)     // 정산 탭 row 행의 D·E·H·I 에 §3.6 수식 채움(새 행 · 프로젝트 신규 시 자동 정산 행)
function createStandardMilestonesApi_(projectId)    // createStandardMilestones 의 잠금 없는 본체 → { created, skipped }. saveRow(projects, 신규, options.createStandardMilestones) 가 잠금 안에서 호출
```

**(v1.3)** 공개 함수 1개 추가: `addItems(projectId, milestone, part, blockNames)` (§5). v1.3 헬퍼:

```js
function nextSeqIdApi_(sheet, prefix, usedIds)     // 'W' | 'N' → 'W-000001' 형식(탭 A열 최대 번호 + 1, 6자리). usedIds: Set — 한 호출에서 여러 개 발급 시 중복 방지(addItems)
function ensureBlocksSheetApi_()                   // '업무블럭' 탭 반환. 없으면 §3.12 헤더 + Schema.DEFAULT_BLOCKS 33행(H열 '예'/'') + 드롭다운으로 생성. 있으면 건드리지 않음. setupSheets · setupSheetsEmpty · refreshValidations 가 호출(대시보드 쓰기는 호출하지 않는다)
function ensureNameColumnApi_(sheet, keyCol)       // 행사명(자동) 배열 수식 — 마일스톤 G열(keyCol 1) · 세부항목 M열(keyCol 2). 기존 ensureMilestoneNameColumn_ 을 일반화(기존 이름은 그대로 두고 위임해도 된다)
function ensureItemsSheetApi_() / ensureNotesSheetApi_()
                                                   // '세부항목' · '주석' 탭 반환. 없으면 §3.10·§3.11 헤더·드롭다운·M 수식으로 생성(첫 쓰기 때 — ensureHistorySheet_ 와 같은 방식)
function readBlocksApi_()                          // → { blocks:[], source:'sheet'|'default' } — 탭이 없거나 데이터 행이 0이면 Schema.DEFAULT_BLOCKS · 'default'
function itemFromRowApi_(values) / noteFromRowApi_(values) / blockFromRowApi_(values)
                                                   // §2.10~2.12 변환(날짜·숫자 · 주최형 제외 '예' → true). readAllApi_ 와 충돌 검사(§9.15)가 같은 변환을 쓴다
function syncAssignmentsFromItemsApi_(projectId)   // §5 배정 동기화 5단계. Schema.assignmentsFromItems(project, items, milestones, assignments, settings) 결과가 changed 면 writeProjectAssignmentsApi_ + 이력 1줄. → { assignments:[그 프로젝트 전체], overlaps:[], changed }
function writeProjectAssignmentsApi_(projectId, rows)
                                                   // saveAssignments 의 잠금 없는 본체 — 그 프로젝트 행 삭제 후 rows 추가(빈 ID 는 nextAssignmentId_ · 원시값 보존 · 다른 프로젝트 행 순서 유지). saveAssignments 와 syncAssignmentsFromItemsApi_ 가 공유
function renameMilestoneRefsApi_(projectId, oldName, newName)
                                                   // 세부항목 C열 · 주석 C열 연쇄 갱신 → { items:n, notes:n }. saveRow('milestones') 수정에서 이름이 바뀔 때만
```

- `SHEETS` 에 변경이력 탭을 넣지 않아도 된다 — 탭 이름·헤더는 `Schema.HISTORY` 를 읽는다. `HEADERS` 도 마찬가지
- `getBootstrap()` 은 `readAllApi_()` 결과에 `meta.user = userEmail_()` 와 `history`(§2.9, 최근 30건)를 붙인다

```js
const TZ = 'Asia/Seoul';
const SHEETS = { PROJECTS: '프로젝트', ASSIGNMENTS: '배정', LOGS: '공수기록', MEMBERS: '팀원',
                 MILESTONES: '마일스톤', SETTLEMENTS: '정산', SETTINGS: '설정' };
// HEADERS[탭이름] = §3 헤더 문자열 배열(순서·문구 완전 일치). 설정 탭은 12개(J열은 '' 빈 헤더)
const HEADERS = { /* §3.1~3.7 */ };
const DEFAULT_SETTINGS = { /* §2.2 기본값 전체 (milestoneTemplate 9종 포함) */ };

function getSheet_(name)            // Sheet. 없으면 throw Error('"<name>" 탭이 없습니다. 시트 메뉴 [팀 보드 → 초기 설정 실행]을 먼저 실행하세요.')
function toDateStr_(v)              // Date|string|'' → 'YYYY-MM-DD' | ''  (Date는 Utilities.formatDate(v, TZ, 'yyyy-MM-dd'))
function toDateTimeStr_(v)          // → 'YYYY-MM-DD HH:mm' | ''
function toNum_(v)                  // → number | null  ('' 또는 숫자 변환 실패 → null)
function todayStr_()                // 오늘 'YYYY-MM-DD' (TZ)
function nowIso_()                  // ISO 8601, 예 '2026-09-10T09:00:00+09:00'
function parseDate_(dateStr)        // 'YYYY-MM-DD' → Date(현지 정오) | null
function addDays_(dateStr, n)       // → 'YYYY-MM-DD'
function readRows_(sheetName)       // → [{ row: <시트 행번호>, values: [...] }]  2행~마지막 행, 첫 열 빈 행 제외, values 길이 = HEADERS[name].length
function readSettings_()            // → settings 객체(§2.2). 설정 탭 없음·키 없음 → DEFAULT_SETTINGS 폴백. I열 '예' → skipForHost true
function nextProjectId_(sheet, year)        // → 'P-YYYY-NNN' (해당 연도 최대 번호 + 1)
function nextAssignmentId_(sheet, usedIds)  // → 'A-NNNN' (탭 최대 번호 + 1, usedIds: Set — 한 호출에서 여러 개 발급 시 중복 방지)
function withLock_(fn)              // LockService.getScriptLock().waitLock(10000) → fn() → finally releaseLock. 실패 시 throw Error('다른 사용자가 저장 중입니다. 잠시 후 다시 시도하세요.')
```

- 모든 외부 반환값(`getBootstrap` 등)은 `toDateStr_`·`toDateTimeStr_`·`toNum_` 를 거친다. **Date 객체가 클라이언트로 직렬화되는 경로가 하나도 없어야 한다.**
- 오류는 한국어 메시지의 `Error` 로 throw → 프런트 `withFailureHandler` 가 화면에 표시.

---

## 9. 편집 계약 (`src/schema.js` · v1.2 신설)

SPEC v1.2 §5.2 쓰기 경로의 규칙을 코드 한 벌로 고정한다. 검증·삭제 규칙·이력 요약·셀 값 변환은 전부 `src/schema.js` 의 **순수 함수**이고, 프런트(선검증)·서버(최종 검증)·Node 테스트가 같은 파일을 실행한다. 이 절과 어긋나는 구현은 이 절 기준으로 고친다. 검산: `tests/schema.test.js`(70건 — v1.2 42 + v1.3 28, 테스트 이름이 이 절 번호로 시작). **v1.3** 은 표 3개(`items`·`notes`·`blocks`)와 롤업·배정 동기화·주석 집계 함수를 같은 파일에 더했다(§9.9~9.14) — 서버·mock 이 같은 결과를 내야 하는 산식이 처음으로 `schema.js` 에 들어간 것이며, `Metrics` 가 아니라 여기 두는 이유는 배정 행 생성이 "산식" 이 아니라 "쓰기 규칙" 이기 때문이다.

### 9.1 실행 환경 · 표 정의 — 같은 파일, 세 곳
| 환경 | 로드 방법 | 전역 이름 |
|---|---|---|
| 브라우저 | `scripts/build.js` 가 `src/index.template.html` 에 원문 인라인(`Metrics` 보다 먼저, §6) | `window.Schema` |
| Node 테스트 | `require('../src/schema.js')` | 모듈 반환값 |
| Apps Script | `scripts/build.js` 가 `apps-script/Code.gs` 의 `/* __SCHEMA_BEGIN__ … */` ~ `/* __SCHEMA_END__ */` 마커 블록에 원문을 채움 | `Schema` |

- `Code.gs` 의 마커 블록 사이는 **빌드 산출물**이다 — 직접 고치지 않는다. Code.gs 의 나머지는 손으로 유지하며 빌드가 건드리지 않는다.
- `schema.js` 는 DOM·시트·현재 시각을 읽지 않는다("오늘"이 필요하면 `ctx` 로 받는다). 검증 메시지는 한국어, 필드 라벨은 시트 헤더(§3)와 같은 문구.
- 공개 API: `TABLES` · `FIXED_ENUMS` · `HISTORY` · `field` · `isDateStr` · `isMonday` · `emptyRow` · `normalizeRow` · `validateRow` · `validateEffortWeek` · `deleteCheck` · `keyOf` · `keyLabel` · `findRow` · `diff` · `summarize` · `toValues` · **(v1.3)** `AUTO_ASSIGN_NOTE` · `DEFAULT_BLOCKS` · `addDaysStr` · `isKeyItem` · `itemDate` · `itemRollup` · `assignmentsFromItems` · `noteCounts` · **(v1.4)** `GENERIC_BLOCKS` · `RESTORE_TABLES` · `matchMember` · `assignmentSaveGuard` · `restoreCheck` · `restoreLabel` · `validateBulkMilestone` · `blocksWithFallback` · `weekEffortRows`
- `ctx = { settings, data, mode:'new'|'edit', expected }` — `data` 는 §2 부트스트랩 형태(`members`·`projects`·`effortLogs`·`milestones`·`settlements` · **(v1.3)** `items`·`notes` 만 있으면 됨). `mode:'edit'` 이면 `expected`(편집 시작 시점 행)가 있어야 immutable·자기 제외 검사가 동작한다.
- **(v1.3)** 고정 열거 4종 추가: `level`(상·중·하 — 임팩트·난이도) · `itemStatus`(예정·진행·완료) · `noteType`(판단 근거·요청·질문·결정) · `resolved`(`예` 하나 — 빈 값이 미해결). `AUTO_ASSIGN_NOTE = '자동(세부항목)'` 은 배정 탭 비고 열의 자동 행 표식(§9.12).
- **(v1.4)** `HISTORY.actions` 는 **5종**(`추가`·`수정`·`삭제`·`저장`·**`되돌림`**). `GENERIC_BLOCKS` 5종은 파트가 빈 채로 정의돼 있고 `blocksWithFallback`(§9.21)이 파트 이름만 채워 복제한다.

**표 정의 `Schema.TABLES[table]` — 표별 키·필드 규칙.** `{ sheet, label, key[], width, formulaCols[], fields[] }`. `fields[].col` 은 §3 열 순서와 완전히 같고(0 기반), 필드 `col` + `formulaCols` 가 `0..width-1` 을 빠짐없이 덮는다. 필드 속성: `required` · `type`(`text`·`textarea`·`id`·`enum`·`member`·`project`·`projectCode`·`date`·`datetime`·`number`·`color`) · `enumFrom`(settings 목록 이름) · `enumFixed`(§2.2 고정 열거) · `nullable` · `emptyAs` · `auto` · `immutable` · `integer` · `step` · `min`(기본 0) · `monday`.

| 표 | 탭 · 열 수 | 키 | 필수 | 형식·범위 | 열거 | 참조 | 유일키 | 수정 불가(immutable) | 자동(auto) |
|---|---|---|---|---|---|---|---|---|---|
| `projects` | 프로젝트 · 16 | `id` | 행사명 · 유형 · 상태 · 행사 시작일 · 행사 종료일 | 날짜는 `YYYY-MM-DD` 실제 달력 날짜 · **종료일 ≥ 시작일** · 게런티·예상 참가 = 정수 ≥ 0, 빈 값 `null` · 계약금액 = 정수 ≥ 0, 빈 값 `0` (`"50,000,000"` 처럼 쉼표 허용) | 유형 ← `settings.types` · 상태 ← `settings.statuses` | 담당PM → 팀원 탭(빈 값 허용) | 신규에 ID 를 넣으면 기존 ID 와 중복 검사. 수정 모드는 ID 가 `P-YYYY-NNN` 형식이어야 함 | 프로젝트ID | 프로젝트ID · 등록일 |
| `members` | 팀원 · **6**(v1.4) | `name` | 이름 · 주역할 | 월 가용 M/D = 0.5 단위 ≥ 0, 빈 값 → `settings.capacityMdPerMonth`(기본 20) · 색상 = `#RRGGBB` 또는 빈 값 · **(v1.4)** 이메일 = 빈 값 허용, 넣으면 `이름@도메인.끝` 형식 | 주역할 ← `settings.roles` · 상태 = 고정(재직·휴직·퇴사·지원), 빈 값 → `재직` | — | 이름(앞뒤 공백 제거 후 비교) · **(v1.4)** 이메일(대소문자 무시 · 빈 값은 중복 검사 제외) | **이름**(D10 — 오류 문구 "대시보드에서 바꿀 수 없습니다. 시트에서 직접 수정하세요.") | — |
| `effortLogs` | 공수기록 · 6 | `week` + `member` + `projectId` | 주차 · 팀원 · 프로젝트ID | 주차 = 실제 날짜이면서 **월요일** · 실투입 M/D = 0.5 단위 ≥ 0, 빈 값 `0` | — | 팀원 → 팀원 탭 · 프로젝트ID → 프로젝트 탭 **또는** `settings.commonCodes`(없으면 `G-내부`·`G-영업`·`G-휴가`) | (주차·팀원·프로젝트ID) — 수정 모드에서 자기 자신 제외 | — | 기록일시 |
| `milestones` | 마일스톤 · 6 (F 수식) | `projectId` + `name` | 프로젝트ID · 마일스톤 · 예정일 | 예정일·완료일 = `YYYY-MM-DD`(완료일은 빈 값 허용, 예정일보다 앞서도 허용) | — | 프로젝트ID → 프로젝트 탭 · 담당 → 팀원 탭 또는 빈 값 | (프로젝트ID·마일스톤) — 수정 모드 자기 제외 · 다른 프로젝트의 같은 이름은 허용 | — | (F 상태는 수식 — 필드 아님) |
| `settlements` | 정산 · 10 (D·E·H·I 수식) | `projectId` | 프로젝트ID | 매출·직접비 집행·사전 등록·현장 참석 = 정수 ≥ 0, 빈 값 `null` | 정산 상태 = 고정(미착수·진행·완료), 빈 값 → `미착수` | 프로젝트ID → 프로젝트 탭 | — ("프로젝트당 1행"은 서버가 보장: 프로젝트 신규 시 자동 추가, 행 삭제 없음, 화면은 수정만) | 프로젝트ID | (수식 열) |
| `assignments` | 배정 · 9 | `id` | 프로젝트ID · 팀원 · 역할 · 배정 시작 · 배정 종료 | 계획 M/D = 0.5 단위, 빈 값 `0` · 종료 ≥ 시작 | 역할 ← `settings.roles` · 상태 = 고정(예정·진행·종료), 빈 값 → `예정` | 프로젝트ID → 프로젝트 탭 · 팀원 → 팀원 탭 | — | 배정ID | 배정ID |
| **(v1.3)** `items` | 세부항목 · 13 (M 수식) | `id` | 프로젝트ID · 마일스톤 · 파트 · 블럭 | 계획 M/D = 0.5 단위 ≥ 0, 빈 값 `0` · 예정일 = `YYYY-MM-DD` 또는 빈 값 | 파트 ← `settings.roles` · 임팩트·난이도 = 고정(상·중·하), 빈 값 → `중` · 상태 = 고정(예정·진행·완료), 빈 값 → `예정` | 프로젝트ID → 프로젝트 탭 · **마일스톤 → 그 프로젝트의 마일스톤 탭**(`ctx.data.milestones`) · 담당 → 팀원 탭 또는 빈 값 | (프로젝트ID·마일스톤·블럭) — 수정 모드 자기 제외. 파트가 달라도 같은 블럭이면 중복(§9.9) | 세부ID · **프로젝트ID** | 세부ID |
| **(v1.3)** `notes` | 주석 · 11 | `id` | 프로젝트ID · 마일스톤 · 파트 · 유형 · 내용 | 내용 = 공백만은 불가 | 파트 ← `settings.roles` · 유형 = 고정(판단 근거·요청·질문·결정), 빈 값 → `요청` · 해결 = `예` 또는 빈 값 | 프로젝트ID → 프로젝트 탭 · 마일스톤 → 그 프로젝트의 마일스톤 탭 · **세부ID → `ctx.data.items`**(빈 값 허용) · 작성자 이름 → 팀원 탭 또는 빈 값 | — | 주석ID · 프로젝트ID | 주석ID · **작성자 · 일시** |
| **(v1.3)** `blocks` | 업무블럭 · 8 | `part` + `block` | 파트 · 블럭 | 기본 M/D = 0.5 단위 ≥ 0, 빈 값 `0` | 파트 ← `settings.roles` · 기본 임팩트·난이도 = 고정(상·중·하), 빈 값 → `중` | — | — (시트 전용 — 검증은 `DEFAULT_BLOCKS` 검산에만 쓴다) | — | — |

- `assignments` 는 **정의만** 공유한다(`toValues`·`diff`·이력 요약용). 검증은 기존 `saveAssignments` 의 `validateAssignmentRowApi_` 가 맡는다. **(v1.3)** 자동 행(비고 `자동(세부항목)`)도 같은 정의를 쓴다.
- **(v1.3)** `blocks` 도 **정의만** 공유한다(읽기 변환 · `DEFAULT_BLOCKS` 시드·검산 · `keyOf`). 대시보드 쓰기 경로가 없고 `deleteCheck` 는 항상 불가(§9.10). `skipForHost` 필드는 정의상 `text`(시트 `예`/빈 값)이지만 JSON 에서는 boolean 이다 — `toValues('blocks')` 는 시드용으로만 쓰고, 그때 `true` 를 `예` 로 바꿔 넣는다.

### 9.2 정규화 `normalizeRow` · 새 행 `emptyRow` · 날짜 도우미
- `normalizeRow(table, row, ctx)` → 계약 타입 행. 검증하지 않는다. 숫자: 쉼표 제거 후 `Number()`(`"1,000"` → `1000`), 빈 값은 `emptyAs` → `nullable` 이면 `null` → 팀원 가용은 `settings.capacityMdPerMonth` → 그 외 `0`; 숫자가 아니면 **원문 유지**(검증이 잡는다). enum 빈 값은 `emptyAs`(`재직`·`미착수`·`예정`). 나머지는 `String(v).trim()`(`null`·`undefined` → `""`).
- `emptyRow(table, ctx)` 새 행 기본값: 숫자는 `emptyAs` → 없으면 `nullable ? null : 0` · enum 은 `emptyAs` · 프로젝트 상태 = `settings.statuses[0]`(견적), 유형 = `types[0]` · 팀원 가용 = `capacityMdPerMonth`, 주역할 = `roles[0]`.
- `isDateStr(s)` = `YYYY-MM-DD` 이면서 실제 달력 날짜(2026-02-29 는 거짓) · `isMonday(s)` = 실제 날짜이면서 월요일(UTC 기준 계산 — 시간대 영향 없음).

### 9.3 행 검증 `validateRow(table, row, ctx)`
- → `{ ok, errors:[{ field, label, message }], values }`. 순서: 필드별(필수 → 형식 → 열거 → 참조) → 수정 모드 immutable(`expected` 와 비교) → 표별 규칙(날짜 순서, 수정 모드 ID 형식) → 유일키(§9.1 표, 자기 자신 제외). `values` 는 `normalizeRow` 결과(오류가 있어도 채워진다). 자동 필드(등록일·기록일시)는 검사하지 않고, `id` 는 수정 모드에서만 비어 있으면 오류.
- 오류 메시지 형식: `라벨 + 한국어 문장`(예 `행사 종료일은 시작일보다 앞설 수 없습니다.` · `팀원 "○○" 이(가) 팀원 탭에 없습니다.` · `실투입 M/D 은(는) 0.5 단위로 입력합니다.`). 서버는 첫 오류의 `message` 를 그대로 throw 하고, 프런트는 카드 안 `.tb-form-error` 에 라벨과 함께 보여준다. 가이드 §7.2 표는 이 문구를 그대로 쓴다.

### 9.4 주간 공수 검증 `validateEffortWeek(member, week, rows, ctx)`
- → `{ ok, errors, warnings:[문자열], values:[정규화 행(week·member 포함)], total }`. 팀원(팀원 탭에 있어야 함)·주차(실제 날짜 + 월요일)·`rows`(배열) 검사 후 행별로 프로젝트ID·M/D·메모를 검사하고 메시지 앞에 `"N번째 행: "` 을 붙인다(`errors[].row` = 0 기반 인덱스).
- **같은 프로젝트 코드가 두 번이면 오류**(`"2번째 행: P-… 이(가) 같은 주차에 두 번 있습니다. 한 행으로 합치세요."`), **합계 > 5.0 은 `warnings` 에만**(`"이번 주 합계 5.5 M/D 가 주 5.0 을 넘습니다. 맞는지 확인하세요."` — 저장은 허용, 정확히 5.0 은 경고 없음). `total` = M/D 합.
- 기존 공수기록과의 중복은 검사하지 않는다(그 팀원·주차 행을 통째로 교체하므로). `values[].loggedAt` 은 `""` — 서버가 채운다.

### 9.5 삭제 규칙 `deleteCheck(table, row, data)` — D8
→ `{ ok, reason, cascade:{ assignments, milestones, settlements, effortLogs, items, notes } }` — **(v1.3)** `items`·`notes` 키 추가(데이터에 없으면 0). `cascade` 는 그 행을 참조하는 건수(프로젝트 · **(v1.3)** 마일스톤(`items`·`notes`) · 세부 항목(`notes`)만 의미 있음, 나머지 표는 전부 0). v1.3 확장 규칙(마일스톤·세부 항목·주석·업무 블럭)은 **§9.10**.

| 표 | 불가 조건 → `reason` | 가능할 때 |
|---|---|---|
| `projects` | 공수기록 ≥ 1건 → `"공수기록 N건이 이 프로젝트를 참조해 삭제할 수 없습니다. 상태를 "드롭" 으로 바꾸세요."` · 정산 `revenue` 가 `null`·빈 값이 아님(0 포함) → `"정산 매출이 입력된 프로젝트는 삭제할 수 없습니다. 상태를 "드롭" 으로 바꾸거나 정산 값을 먼저 비우세요."` | `ok:true`, 서버가 `cascade` 건수만큼 배정·마일스톤·정산 · **(v1.3)** 세부 항목·주석 행을 **함께 삭제**(D8 연쇄). 화면은 확인 문구에 건수를 보여준다 |
| `members` | 담당PM · 배정 · 공수기록 · 마일스톤 담당 중 하나라도 참조 → `"○○ 을(를) 담당PM N건 · 배정 N건 · 공수기록 N건 · 마일스톤 담당 N건 이(가) 참조해 삭제할 수 없습니다. 상태를 "퇴사" 로 바꾸세요."`(0건인 항목은 생략) | `ok:true`, 연쇄 없음 |
| `milestones` | **(v1.3)** 세부 항목 ≥ 1건 → §9.10 | `ok:true`, `cascade.notes` = 마일스톤 전체 주석 건수(서버가 백업 후 함께 삭제) |
| `assignments` · `effortLogs` | 없음 | `ok:true`(편집기에서 행 제거 후 저장 — 행 단위 `deleteRow` 대상 아님) |
| `settlements` | 항상 → `"정산 행은 지우지 않습니다. 값을 비워서 저장하세요."` | — |
| 그 외 | `"알 수 없는 표입니다: …"` | — |

서버 `deleteRow` 는 이 결과가 `ok:false` 면 `reason` 을 그대로 throw 하고 시트를 건드리지 않는다. 프런트도 삭제 버튼을 누르기 전에 같은 함수로 확인 문구를 만든다.

### 9.6 키 `keyOf` · `keyLabel` · `findRow`
- `keyOf(table, row)` → 키 필드만 담은 객체(값은 `trim` 된 문자열). 예 `keyOf('effortLogs', row)` = `{ week, member, projectId }`.
- `keyLabel(table, row)` → 이력 D 열·확인 문구용 문자열: 공수기록 `"2026-09-07 · 팀원1 · P-2026-001"` · 마일스톤 `"P-2026-001 · 답사"` · 그 외 단일키 값(`"P-2026-001"`, 팀원 이름).
- `findRow(table, list, key)` → 배열 인덱스, 없으면 `-1`. 프런트 로컬 상태 갱신과 mock 어댑터가 쓴다.

### 9.7 변경 필드 `diff` · 이력 요약 `summarize`
- `diff(table, before, after)` → `[{ field, label, before, after }]` — 자동 필드 제외, 값을 문자열로 비교(`null`·`undefined` → `""`), 바뀐 것만.
- `summarize(table, action, before, after, extra)` → 변경이력 F 열 문자열(줄바꿈 `\n` 으로 연결):
  | 동작 | 형식 | 예 |
  |---|---|---|
  | `추가` · `저장` | 자동 필드를 뺀 필드 중 **빈 값이 아닌 것**만 `라벨: 값` | `이름: 팀원3\n주역할: 영업\n월 가용 M/D: 20\n상태: 재직` |
  | `수정` | `diff` 결과를 `라벨: 이전 → 새`(빈 값은 `(빈 값)`). 바뀐 것이 없으면 `변경 없음` | `베뉴: (빈 값) → 코엑스\n계약금액(원): 50000000 → 60000000` |
  | `삭제` | `<표 라벨> 행 삭제: <keyLabel>` | `마일스톤 행 삭제: P-2026-001 · 답사` |
  - `extra` 가 있으면 마지막 줄에 덧붙인다(연쇄 삭제 건수 `함께 삭제: 배정 1 · 마일스톤 2 · 정산 1`, 표준 마일스톤 생성 결과 등).
- 서버 `logHistory_` 와 mock 어댑터가 같은 함수로 F 열을 만든다. 금액은 원 단위 정수 그대로(천 단위 구분 없음).

### 9.8 셀 값 변환 `toValues` · mock 어댑터
- `toValues(table, row)` → 길이 `width` 의 배열. 각 필드는 `col` 자리에, **수식 열은 `null`**(서버는 그 칸을 쓰지 않는다 — 신규 행은 `''` 로 둔 뒤 §5 규칙으로 수식을 채움), `null`·`undefined` 값은 `''`, 날짜는 `YYYY-MM-DD` 문자열 그대로(서버가 `parseDate_` 로 Date 로 바꿔 쓴다). 예 정산: `['P-2026-001', 68000000, '', null, null, 420, 290, null, null, '완료']`.
- mock 어댑터(`MockProvider`)의 `saveRow`·`deleteRow`·`saveEffortWeek` 는 `Schema` 로 검증·삭제 규칙·충돌 검사까지 흉내 낸 뒤 `state.data` 를 갱신하고 `console.info('[mock write] saveRow', payload)` 를 남긴다. `meta.user` = `"미리보기 사용자"`, `history` 에는 `{ at, user:'미리보기 사용자', sheet, key, action, summary }` 를 앞에 끼워 넣는다(30건 유지). 응답 구조는 gas 와 동일(§5).
- 프로젝트 신규(mock)는 ID 를 §3.8 규칙으로 흉내 내고(`P-YYYY-NNN`, 그 연도 최대 + 1) 정산 행 push · 옵션이 켜져 있으면 `Metrics.standardMilestones` 로 마일스톤 push.

### 9.9 세부 항목·주석 검증 — v1.3 (`validateRow('items' | 'notes')`)
§9.3 의 순서(필드별 → immutable → 표별 규칙 → 유일키)를 그대로 따르고, 표별 규칙 두 가지가 더 있다.
- **마일스톤 존재**(`items`·`notes` 공통): `projectId`·`milestone` 이 모두 있으면 `ctx.data.milestones` 에 같은 (프로젝트ID·이름)이 있어야 한다. 없으면 `프로젝트 P-2026-001 에 마일스톤 "○○" 이(가) 없습니다.`(필드 `milestone`). 다른 프로젝트의 같은 이름은 통과하지 않는다. 프로젝트ID 가 프로젝트 탭에 없으면 참조 오류와 이 오류가 함께 난다
- **세부ID 존재**(`notes`): `itemId` 가 비어 있지 않으면 `ctx.data.items` 에 있어야 한다. 없으면 `세부 항목 "W-…" 이(가) 없습니다.`(필드 `itemId`). 비어 있으면 마일스톤 전체 주석
- 유일키(`items`): (프로젝트ID·마일스톤·블럭). 오류 `마일스톤 "○○" 에 같은 블럭이 이미 있습니다: ○○`(필드 `block`). 수정 모드는 `expected` 의 세부ID 와 같은 행을 제외한다. **파트는 키가 아니다** — 같은 마일스톤에 같은 블럭 이름을 두 파트가 나눠 갖지 않는다(블럭 이름을 달리 한다). `notes` 는 유일키 없음
- 빈 값 기본: 임팩트·난이도 `중` · 상태 `예정` · 계획 M/D `0` · 주석 유형 `요청` · 해결 `""`. `emptyRow('items')`·`emptyRow('notes')` 도 같은 값
- 자동 필드: 세부ID · 주석ID · 작성자 · 일시는 검사하지 않는다(서버가 채움 · `diff`·`summarize` 에서도 제외). 수정 모드에서 ID 가 비어 있으면 오류. 프로젝트ID 는 두 표 모두 immutable(`프로젝트ID 은(는) 대시보드에서 바꿀 수 없습니다. 시트에서 직접 수정하세요.`)
- 필드 오류 문구(가이드 §7.2 가 그대로 쓴다): `파트 값 "○○" 이(가) 목록에 없습니다. (영업 / 모객 / …)` · `임팩트 값 "○○" 이(가) 목록에 없습니다. (상 / 중 / 하)` · `계획 M/D 은(는) 0.5 단위로 입력합니다.` · `담당 "○○" 이(가) 팀원 탭에 없습니다.` · `내용 은(는) 필수입니다.` · `유형 값 "○○" 이(가) 목록에 없습니다. (판단 근거 / 요청 / 질문 / 결정)` · `작성자 이름 "○○" 이(가) 팀원 탭에 없습니다.`
- 주석의 "작성자 본인만 수정" 은 `schema.js` 가 아니라 **서버**(현재 이메일 ↔ `expected.author`)가 판정한다(§5). `blocks` 는 `validateRow` 로 검사할 수 있지만 대시보드 쓰기 경로가 없다

### 9.10 삭제 규칙 확장 — v1.3 (`deleteCheck`)
| 표 | 불가 조건 → `reason` | 가능할 때 |
|---|---|---|
| `milestones` | 그 (프로젝트ID·마일스톤)의 세부 항목 ≥ 1건 → `"세부 항목 N건이 있어 삭제할 수 없습니다. 항목을 먼저 지우세요."` | `ok:true`, `cascade.notes` = 마일스톤 전체 주석(세부ID 없는 것 포함, 그 마일스톤의 주석 전부) 건수 — 서버가 백업 후 함께 지운다 |
| `items` | 없음 | `ok:true`, `cascade.notes` = 그 세부ID 의 주석 건수 — 서버가 백업(`{ item, notes }`) 후 함께 지우고 배정 동기화. 화면 확인 문구 "주석 N건도 함께 지워집니다" |
| `notes` | 항상 → `"주석은 대시보드에서 지우지 않습니다. 해결로 표시하거나 시트에서 지우세요."` | — |
| `blocks` | 항상 → `"업무 블럭 카탈로그는 시트의 업무블럭 탭에서 고칩니다."` | — |
| `projects` | §9.5 그대로 | `cascade` 에 `items`·`notes`(그 프로젝트 전체) 추가 — 연쇄 삭제·백업 대상. 자동 배정 행은 `assignments` 건수에 포함 |
| `members` | §9.5 그대로(담당PM · 배정 · 공수기록 · 마일스톤 담당) | **세부 항목 담당·주석 작성자 이름은 세지 않는다**(현재 구현). 담당이 있는 항목은 동기화가 배정 행을 만들어 실무상 "배정 N건" 에 걸리지만, 수동 행과 겹쳐 자동 행이 생략된 경우·작성자 이름만 있는 경우는 잡히지 않는다 — 다음 턴 후보(§9.16 미결) |

서버 `deleteRow` 는 §9.5 와 같이 `ok:false` 면 `reason` 을 그대로 throw 하고 시트를 건드리지 않는다. 프런트도 삭제 버튼을 누르기 전에 같은 함수로 확인 문구를 만든다(세부 항목 삭제 = "정말 처리할까요? 주석 N건도 함께 지워지고 배정 자동 행이 다시 계산됩니다").

### 9.11 세부 항목 합계 `itemRollup(data, projectId, settings)` — v1.3 · D12
→ `{ count, totalMd, mm, capacityMd, byPart:{파트: M/D}, byMember:{담당: M/D}, byMilestone:{마일스톤: M/D}, unassignedMd, keyUnassigned:[항목] }`
- 대상 = `data.items` 중 `projectId` 가 같은 행. `plannedMd` 가 비어 있거나 숫자가 아니면 0. `data`·`data.items` 가 없어도 0
- `totalMd` = 계획 M/D 합(소수 1자리) · `capacityMd` = `settings.capacityMdPerMonth`(없거나 0 이하·숫자 아님 → 20) · **`mm` = `totalMd ÷ capacityMd`(소수 2자리)** — A 상세 패널 카드 "계획 공수 합계 12.5 M/D (0.63 M/M)" 의 두 숫자. 저장·산식 단위는 M/D 그대로(D3·D12), M/M 은 표시 전용 환산
- `byPart`·`byMilestone` 은 빈 값을 `(파트 없음)`·`(마일스톤 없음)` 으로 묶는다(정상 데이터에서는 나오지 않음). `byMember` 는 담당 있는 항목만. `unassignedMd` = 담당 없는 항목의 합(파트 합계로만 보이는 몫 — D13 "담당이 빈 항목은 파트 합계로만 표시")
- `keyUnassigned` = 담당이 비어 있고 `isKeyItem`(임팩트 `상` 또는 난이도 `상`)인 항목 — E 화면 "핵심 항목 미배정" 카드(프로젝트·마일스톤·블럭·파트)
- 순수 함수. 서버는 쓰지 않고(화면 계산), 테스트가 mock 값(P-2026-002 = 10 M/D · 0.5 M/M · 미배정 2 · P-2026-003 핵심 미배정 1 = W-000005)을 고정한다

### 9.12 배정 자동 행 `assignmentsFromItems(project, items, milestones, assignments, settings)` — v1.3 · D13(A안)
→ `{ projectId, auto:[배정 행], manual:[그 프로젝트의 수동 행], overlaps:[{ member, role, itemsMd, manualMd }], changed }`. 서버 `syncAssignmentsFromItemsApi_` 와 mock 어댑터가 **이 함수 결과를 그대로 쓴다**(§5 "배정 동기화 규칙" 의 판정부). 인자는 프로젝트 행 하나 · 전체 세부 항목 · 전체 마일스톤 · 전체 배정 · 설정(`timelineOffsets`).
- `auto[]` 행: `{ id, projectId, member:담당, role:파트, plannedMd:합계(소수 1자리), start, end, status:'예정', note:'자동(세부항목)' }`. `id` 는 기존 자동 행 중 같은 (담당, 파트)가 있으면 그 ID, 없으면 `''`(서버·mock 이 발급)
- 묶음 순서 = 항목 배열에서 (담당, 파트)가 처음 나온 순서. 담당 없는 항목·다른 프로젝트 항목은 제외. 같은 사람이 두 파트면 자동 행 두 개
- 기간: 항목 날짜(`itemDate` = 예정일 ‖ 마일스톤 예정일)가 하나라도 있으면 `min − 14일 ~ max`, 착수일(`kickoff` ‖ `eventStart + kickoffDays`, 기본 −90)~정산 예정일(`settlementDue` ‖ `eventEnd + settlementDays`, 기본 +30) 안으로 자른 뒤 시작 > 종료면 시작 = 종료. 날짜가 없으면 착수일 ~ 행사 종료일
- 자동 행 판정 = 비고가 정확히 `Schema.AUTO_ASSIGN_NOTE`(`자동(세부항목)`). 그 외는 전부 수동 행(`manual` — 이 프로젝트 행만). 다른 프로젝트의 행은 건드리지 않는다
- **겹침 생략**: 같은 (담당, 파트)에 수동 행이 하나라도 있으면 그 자동 행은 `auto` 에서 빼고 `overlaps` 에 `{ itemsMd: 세부 합계, manualMd: 수동 행 M/D 합 }` 로 넣는다. B 화면은 그 수동 행 옆에 "세부 합계 4 M/D · 수동 5 M/D — 수동 행을 지우면 자동으로 바뀜" 배지. 자동 행이 있던 (담당, 파트)에 수동 행이 새로 생기면 자동 행은 다음 동기화 때 사라진다(`changed` 참)
- `changed` = 기존 자동 행 집합과 새 `auto` 집합의 (담당·파트·M/D·시작·종료) 서명이 다르면 참(ID·상태·비고는 비교하지 않음). 거짓이면 서버는 쓰지 않고 이력도 남기지 않는다. 항목이 전부 사라져 `auto` 가 빈 배열이 되면 기존 자동 행이 있는 한 참(자동 행 삭제)
- 반영 뒤 가동률·히트맵·소진율·과부하 경고는 기존 산식(§4)이 자동 행을 보통 배정 행으로 계산한다 — 산식 변경 없음. 자동 행의 상태는 늘 `예정`(종료 처리가 필요하면 세부 항목 상태로 관리)

### 9.13 주석 집계 · 날짜 도우미 · 핵심 항목 · 키·이력 요약 — v1.3
- `noteCounts(notes, target)` → `{ total, open }`. `target.itemId` 가 있으면 그 세부ID 의 주석, 없으면 `target.projectId`(+ `milestone` 이 있으면 그 마일스톤)의 주석 전체(항목 주석 포함). `open` = `resolved !== '예'`. `target` 이 없으면 0. 배지 "주석 n · 미해결 n" 과 E 화면 "미해결 질문·요청" 이 쓴다
- `itemDate(item, milestones)` → 항목 예정일(실제 날짜일 때) ‖ 같은 (프로젝트ID·마일스톤)의 예정일 ‖ `''`. 형식이 틀린 예정일은 무시
- `addDaysStr('YYYY-MM-DD', n)` → n일 뒤 문자열(UTC 달력 · 윤년 처리). 형식이 아니면 `''`. `n` 생략 = 0
- `isKeyItem(item)` = 임팩트 `상` 또는 난이도 `상`
- `keyLabel('items', row)` = `프로젝트ID · 마일스톤 · 블럭 (세부ID)`(신규는 괄호 없음) · `keyLabel('notes', row)` = `주석ID · 세부ID`(마일스톤 전체 주석은 주석ID 만) · `keyLabel('blocks', row)` = `파트 · 블럭`. 변경이력 D 열·확인 문구용
- `summarize`·`diff` 는 세부ID·작성자·일시(auto)를 제외한다. 예 삭제 = `세부 항목 행 삭제: P-2026-001 · 답사 · 베뉴 서칭·계약 (W-000001)\n함께 삭제: 주석 2` · 동기화 = 표 `assignments`, 동작 `저장`, `extra` = `세부항목 동기화: n행`

### 9.14 기본 업무 블럭 카탈로그 `DEFAULT_BLOCKS` — v1.3 · D14 (v1.4 · D22 확장)
- **44건**(v1.4) = 영업 4 · 모객 5 · 운영 PM 8 · 현장 운영 6 · 디자인·제작 6 · 정산·리포트 4 · **운영총괄 6 · 운영 Sub 5**(설정 역할 순서 — 실시트 역할 8종). 각 행 `{ part, block, milestone, md, impact, difficulty, judge, skipForHost }` — §2.12 와 같은 필드·같은 타입(`skipForHost` boolean)
- (파트·블럭) 유일 · 기본 마일스톤은 표준 9종 중 하나 · 기본 M/D 는 0.5 단위 > 0(**합계 64.5**) · `judge`(판단에 필요한 내용) 비어 있지 않음 · `skipForHost` 는 영업 4건만 `true`(③ 주최형은 발주처가 없음)
- 단일 원천은 `src/schema.js`. 서버(`ensureBlocksSheetApi_` 의 시드 · 탭 없을 때 `getBootstrap` 폴백)와 mock(`sample-data.json` 의 `blocks` — 테스트가 **그 시트 역할 목록에 해당하는 블럭과의 완전 일치**를 검사)이 같은 목록을 쓴다. 시트에서 다듬은 뒤에는 시트가 원천(`meta.blocksSource:"sheet"`) — 코드 목록을 고쳐도 이미 만든 탭에는 반영되지 않는다(탭을 지우고 메뉴로 다시 만들거나 시트에서 직접)

### 9.15 충돌 검사 — D9 (`expected` 스냅샷 대조)
- 프런트는 폼을 열 때 그 행의 현재 값을 `state.form.expected` 에 복사해 두고, 저장 시 그대로 서버에 보낸다(신규는 `null`).
- 서버는 잠금 안에서 `expected` 의 키(`Schema.keyOf`)로 현재 시트 행을 찾아 같은 `…FromRowApi_` 변환을 거친 뒤, **자동 필드를 뺀 모든 필드**(= `Schema.diff(table, expected, current)` 가 보는 범위, `null` 과 `""` 는 같은 값)를 비교한다. 하나라도 다르면 `Error('다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.')` — 시트는 바뀌지 않는다.
- 복합키 표(공수기록·마일스톤)는 `expected` 의 키로 행을 찾으므로 이름·주차를 바꾸는 수정이 가능하다. 행을 찾지 못하면(그 사이 삭제됨) 충돌이 아니라 "찾을 수 없습니다" 오류.
- `saveEffortWeek` 의 `expected` 는 그 팀원·주차의 행 배열 — 건수와 각 행(프로젝트ID 순)을 비교. `null` 이면 생략.
- 열 추가 없이 충돌을 잡는 가장 단순한 방법이다. 사용자 안내는 가이드 §6.10(새로고침 → 다시).
- mock 어댑터도 같은 규칙으로 `state.data` 의 현재 행과 `expected` 를 대조해 같은 오류를 낸다(실렌더 게이트에서 재현 가능).
- **(v1.3)** `items`·`notes` 도 같은 규칙(키 = 세부ID·주석ID). `notes` 는 충돌 검사 뒤 작성자 본인 검사(§5)를 한다. `addItems` 는 `expected` 가 없다(신규만) — 대신 이미 있는 블럭을 `skipped` 로 돌려준다

### 9.16 검산 목록 (`tests/schema.test.js`)
§9.1 표 정의 5(v1.3 `field()` 5턴 표 1 포함) · §9.2 정규화·기본값·날짜 5 · §9.3 검증(프로젝트 5 · 팀원 4 · 공수기록 3 · 마일스톤 2 · 정산 2) · §9.4 주간 공수 4 · §9.5 삭제 규칙 6 · §9.6 키 2 · §9.7 diff·summarize 3 · §9.8 toValues 2 = **43건** · **v1.3** §9.9 세부 항목 5 · 주석 3 · §9.10 삭제 3 · §9.11 롤업 3 · §9.12 배정 동기화 7 · §9.13 집계·도우미·키 4 · §9.14 카탈로그 2 = **27건** → 70건 · **v1.4** §9.17 본인 매칭·이메일 3 · §9.18 저장 가드 2 · §9.19 되돌리기 4 · §9.20 일괄 처리 4 · §9.21 카탈로그 파생 3 · §9.22 주간 공수 행 3 = **19건** → **89건**. `tests/sample-data.test.js` **27건**(v1.3: 최상위 키 12 · `meta.blocksSource` · §2.10~2.12 · §9.11~9.12 mock 값 · **v1.4**: `meta.userMember` · `members[].email` · 카탈로그 파생) · `tests/metrics.test.js` 38건 = 전체 **154건**. 실행: `node --test tests/metrics.test.js tests/sample-data.test.js tests/schema.test.js`(디렉터리 인자 금지 — 파일 경로 나열) 또는 `npm test`.

미결(v1.3 검산에서 드러난 것, 다음 턴 후보): ① `deleteCheck('members')` 가 세부 항목 담당·주석 작성자 이름 참조를 세지 않음(§9.10) ② `deleteCheck('milestones')` 가 세부 항목이 없을 때 마일스톤 전체 주석을 `cascade.notes` 로만 알림 — 서버 연쇄 삭제 구현이 이 계약(백업 후 삭제)을 따라야 함 ③ `blocks.skipForHost` 의 정의 타입(`text`)과 JSON 타입(boolean) 불일치는 시드 변환으로만 흡수(§9.1).

---

### 9.17 본인 매칭 `matchMember(email, members)` — v1.4 · D17
- 로그인 이메일 → **팀원 이름** 또는 `''`. `getBootstrap` 이 `meta.userMember`(§2.1)에 싣고, 화면은 값이 있으면 "내 기록: ○○○" 로 고정, 없으면 이름 선택(브라우저 `localStorage` 기억)으로 넘어간다.
- 비교는 **앞뒤 공백 제거 + 소문자**. 빈 이메일·목록 없음은 `''`(오류를 던지지 않는다).
- **`퇴사` 팀원은 매칭하지 않는다** — 퇴사자 계정으로 열어도 본인으로 잡히지 않는다. `휴직`·`지원` 은 매칭한다(기록을 남길 수 있어야 한다).
- 이메일이 여럿 같으면 **앞선 행**이 이긴다. 애초에 `validateRow('members')` 가 팀원 간 중복을 막는다(§9.3 · 아래).
- **이메일 검증**(`validateRow('members')` 확장) — 빈 값 허용 · 넣으면 `이름@도메인.끝` 형식(도메인 제한 없음, 오류 문구는 `이메일 형식이 아닙니다: "…" (예: hong@company.com)`) · 팀원 간 중복이면 `같은 이메일이 이미 있습니다: ○○○`(수정 모드는 자기 자신 제외). 회사 업무 계정만 쓴다는 규칙(D17)은 **사람이 지키는 규칙**이라 코드가 도메인을 강제하지 않는다.

### 9.18 배정 저장 가드 `assignmentSaveGuard(before, after)` — v1.4 · D20
- 배정 묶음 저장 **직전에** 무엇이 사라지는지 센다. → `{ removed, removedRows, added, changed, warn }`
- `removedRows` = `before` 에 있고 `after` 에 없는 **배정ID** 의 행 전체(경고 박스에 팀원·역할·계획 M/D 를 나열하기 위해 행째로 준다) · `removed` = 그 개수
- `added` = `after` 에서 ID 가 빈 행 수(새 행) · `changed` = 같은 ID 인데 `Schema.diff('assignments', …)` 가 비지 않은 행 수
- **`warn = removed > 0`** — 참이면 저장하지 않고 2단계 확인을 받는다. 값만 고치거나 추가만 하는 저장은 경고 없이 지나간다.
- ID 가 없던 행(새 행을 만들었다가 지움)은 "사라진 행" 으로 세지 않는다. 인자가 배열이 아니어도 0 으로 답한다(오류 없음).
- 자동 행(비고 `자동(세부항목)`)도 같은 규칙으로 센다 — 편집기에서 지우면 경고에 뜨고, 저장 뒤 다음 동기화 때 다시 생긴다(§9.12).

### 9.19 되돌리기 판정 `restoreCheck(entry, data)` · 안내 `restoreLabel(entry)` — v1.4 · D19
- `entry` = 변경이력 한 줄(`{ sheet, key, action, backup }` — `backup` 은 G열 원문 JSON 문자열 또는 이미 파싱된 배열·객체) → `{ ok, reason, table, rows, mode }`
- `table` 은 시트 이름 → 표 이름(`RESTORE_TABLES`): `프로젝트`·`배정`·`공수기록`·`팀원`·`마일스톤`·`정산`·`세부항목`·`주석`. 그 밖의 탭(`설정`·`업무블럭` 등)은 거부.

| `action` | 백업 | `mode` | 뜻 |
|---|---|---|---|
| `저장` | 행 배열 | `replace` | 그 키의 행 묶음을 백업으로 **교체**(배정 저장·주간 공수 저장·일괄 처리) |
| `추가` | 있든 없든 | `delete` | 추가의 되돌리기 = **그 행을 지운다** |
| `수정`·`삭제`·`되돌림` | 1행 | `row` | 그 행을 이전 내용으로 |
| `수정`·`삭제`·`되돌림` | 2행 이상 | `replace` | 묶음 교체(연쇄 백업) |

- 거부(`ok:false`)와 사유 문구(화면이 버튼 대신 그대로 보여준다):
  - 프로젝트 `삭제` → `프로젝트 삭제는 배정·마일스톤·정산이 함께 지워져 되돌릴 수 없습니다. 새 프로젝트로 다시 등록하세요.`
  - `변경이력` 탭 자체 → `변경이력 자체는 되돌릴 수 없습니다.`
  - 모르는 탭 → `"○○" 탭은 되돌리기를 지원하지 않습니다. 시트에서 직접 고치세요.`
  - 백업이 JSON 이 아님 → `백업 내용을 읽을 수 없어 되돌릴 수 없습니다. 시트에서 직접 고치세요.`
  - 백업이 비었는데 `추가` 가 아님 → `되돌릴 이전 내용이 없습니다.`
- `restoreLabel(entry)` = 버튼 옆 한 줄. `delete` → `이 추가를 취소하고 행을 지웁니다.` · `replace` → `<탭> <키> 을(를) 저장 전 n행으로 되돌립니다.` · `row` → `<탭> <키> 을(를) 이전 내용으로 되돌립니다.` · 거부면 위 사유 그대로.
- **되돌리기의 되돌리기**: 동작 `되돌림` 인 이력도 같은 규칙으로 되돌릴 수 있다(서버가 복원 직전 상태를 백업에 넣기 때문 — §3.9).
- 화면은 백업 원문을 받지 않으므로 목록에서는 1차 판정만 하고, **최종 판정·복원은 서버**가 한다(§5.1 · §2.9).

### 9.20 마일스톤 일괄 처리 검증 `validateBulkMilestone(action, rows, payload, ctx)` — v1.4 · D21
- `action` = `complete` \| `shift` · `rows` = 대상 마일스톤 **현재 행** 배열 · `payload` = `{ done }` 또는 `{ days }`/`{ due }` · `ctx` = §9.1 과 같은 형태 → `{ ok, errors, warnings, values }`
- `values` = `normalizeRow('milestones', …)` 를 거친 **바뀐 행 배열**(필드는 `projectId·name·due·done·owner` 5개 — F 상태 수식은 건드리지 않는다). `errors` 가 있으면 아무것도 쓰지 않는다.

| 검사 | 규칙 | 오류 문구 |
|---|---|---|
| 동작 | `complete` \| `shift` 만 | `완료 처리 또는 예정일 조정만 할 수 있습니다.` |
| 대상 | 1건 이상 | `처리할 마일스톤을 하나 이상 고르세요.` |
| `complete` 완료일 | 필수 · `YYYY-MM-DD` 실제 날짜 | `완료일을 고르세요.` / `완료일은 YYYY-MM-DD 형식의 날짜여야 합니다.` |
| `shift` 조정값 | `days` 정수 **또는** `due` 날짜 중 하나 | `며칠 미룰지(정수) 또는 새 예정일을 넣으세요.` |
| `shift` 0일 | `days = 0` 거부 | `0일은 바뀌는 것이 없습니다.` |
| `shift` 지정일 형식 | `YYYY-MM-DD` 실제 날짜 | `예정일은 YYYY-MM-DD 형식의 날짜여야 합니다.` |

- `warnings`(막지 않음, 2단계 확인 문구에 싣는다): 완료일이 **예정일보다 1년 이상 빠르면** `<마일스톤>: 완료일이 예정일보다 1년 이상 빠릅니다. 날짜를 확인하세요.` — 연도를 잘못 고른 실수를 잡기 위한 것이고, 앞당겨 끝낸 정상 처리는 걸리지 않는다.
- `shift` 규칙: `due` 가 있으면 **전부 그 날짜로**, 없으면 각 행의 예정일에 `days` 를 더한다(문자열 숫자 허용, 음수 = 당기기). **예정일이 빈 행은 그대로 둔다**(기준이 없다). 완료일은 건드리지 않는다.

### 9.21 카탈로그 파생 `blocksWithFallback(blocks, settings)` — v1.4 · D22
- → `{ list, derivedParts, usedDefault }`. `list` = 화면에 내려보낼 카탈로그(원본 **순서 유지** + 파생분을 뒤에), `derivedParts` = 파생한 파트 이름 배열(설정 역할 순서), `usedDefault` = 시트 카탈로그가 비어 코드 기본값을 썼는지.
- 기준(base)은 **시트 카탈로그가 있으면 그것**, 비어 있으면 `DEFAULT_BLOCKS`(§9.14). 파트나 블럭 이름이 빈 행은 카탈로그로 세지 않는다(그 파트는 파생 대상이 된다).
- `settings.roles` 를 순회해 **블럭이 0개인 파트**에 `GENERIC_BLOCKS` 5종을 파트 이름만 바꿔 복제한다 — 업무 범위 정리(발주처 기초자료 수령 · 0.5) / 담당자 배정·일정 합의(운영계획서 확정 · 0.5) / 진행 상황 점검(행사 7일 전 점검 · 0.5) / 행사 당일 대응(행사 당일 · 1) / 결과 정리·인수인계(정산보고 제출 · 0.5). 임팩트·난이도는 중·하(당일 대응만 중·중), `skipForHost` 는 전부 `false`.
- **역할 목록에 없는 파트의 블럭도 목록에서 빼지 않는다** — 카탈로그(시트·코드)가 단일 원천이고, 역할을 임시로 지웠다고 기존 블럭이 사라지면 안 되기 때문이다. 화면의 파트 선택은 `settings.roles` 를 따른다.
- 파생분은 **시트에 쓰지 않는다**. 고른 순간 `세부항목` 행이 되고, 그 행의 파트는 역할 목록 값이므로 `validateRow('items')` 를 통과한다.

### 9.22 내 주간 공수 행 `weekEffortRows(member, week, data)` — v1.4 · D18
- 그 사람·그 주차의 입력 카드에 **미리 깔아 줄 행**을 만든다. → `[{ projectId, label, md, memo, source, logged }]`
- 순서: ① 그 주와 **겹치는 내 배정 프로젝트**(`source:'배정'`) ② `settings.commonCodes` 3종(`source:'공통'`) ③ 그 주에 **이미 기록된** 코드 중 앞에서 안 나온 것(`source:'기록'`). 같은 코드는 한 번만 나온다.
- 겹침 판정: 배정 기간이 `week`(월요일) ~ `week+6일` 과 하루라도 겹치면 포함. 배정 시작·종료가 비어 있거나 날짜 형식이 아니면 **포함**(판단할 근거가 없으므로 보여준다).
- `label` = 프로젝트 행사명(못 찾으면 코드 그대로) · 공통코드는 코드 자체.
- 기록이 있으면 `md`·`memo` 를 채우고 `logged:true`. 없으면 `md:null`(0 을 미리 채우지 않는다 — "안 적었다" 와 "0 이다" 를 구분).
- 저장은 기존 `saveEffortWeek`(§5) 그대로 — 화면은 `md` 가 있는 행만 `{ projectId, md, memo }` 로 추려 보내고, 서버·mock 이 `validateEffortWeek`(§9.4)로 같은 검증(중복 코드·월요일·합계 5.0 초과 경고)을 한다.
- "지난주 값 복사" 는 화면 기능이다 — `weekEffortRows(member, 지난주, data)` 의 `md`·`memo` 를 이번 주 행에 옮겨 담을 뿐 서버 호출이 아니다.
