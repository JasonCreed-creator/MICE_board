# 6턴 착수 지시문 — 부채 정리 · 운영 UX · CI·clasp 자동화 (SPEC v1.4)

> 발행 2026-09-15 · Code 세션(클라우드, GitHub `claude/laughing-bohr-qgj6rf`)
> 1턴 기획 승인 기준: UX **C1·C2·C3** · 본인 식별 **이메일 자동 + 이름 선택 폴백** · **clasp + GitHub Actions 자동 배포**
> 정본 갱신 대상: `docs/SPEC-v1.md` v1.3 → **v1.4** · `docs/DATA-CONTRACT.md` · `guide/설치-운영-가이드.md` · `CLAUDE.md` §2

---

## 0. 왜 이 턴인가 (실시트 진단 · 2026-09-15)

| # | 사실 | 이 턴의 대응 |
|---|---|---|
| 1 | `공수기록` **0행** — 버전 4에 주간 입력이 배포돼 있는데도 한 건도 없다 | **C1 내 주간 공수** |
| 2 | `설정` 역할 **8종**(운영총괄·운영 Sub 팀이 추가) ↔ 기본 블럭 카탈로그는 **6파트**뿐 | **D22 카탈로그 파생** |
| 3 | `세부항목`·`주석`·`업무블럭` 탭 없음 = **버전 5 미배포** | **clasp 자동 배포**(축 D) |
| 4 | 배정 저장 09-14 12:49 에 JLL 4행 → 1행(3행 소실, 백업엔 남음) | **C3 저장 가드 + 되돌리기** |
| 5 | 마일스톤 담당 공란 44/61 · **지연 12건** 방치 | **C2 일괄 처리** |
| 6 | 검수 3턴분(3.1·4·5) 미실시 | 축 A — jc-redteam 일괄 감수 |

## 1. 결정 (D17~D22 · 기획자님 1턴 승인)

| # | 결정 | 근거 |
|---|---|---|
| **D17** | `팀원` 탭에 **`이메일`(F열)** 추가 — 선택 입력. 로그인 계정 ↔ 팀원 자동 매칭용. 비어 있으면 화면에서 이름 선택(브라우저 기억). **회사 업무 계정만**, 개인 휴대폰·개인 메일은 여전히 금지 | 기획자님 "둘 다" 선택. 같은 계정이 `변경이력` 사용자 열에 이미 기록 중 |
| **D18** | **내 주간 공수** — 내 배정 프로젝트를 행으로 자동 제시 · 지난주 값 복사 · 합계/초과 경고 · 한 번에 저장. 서버 API 는 기존 `saveEffortWeek` 재사용 | 공수기록 0행 |
| **D19** | **변경이력 되돌리기** — 백업이 있는 이력 행을 1클릭 복원. 복원도 이력에 `되돌림` 으로 남긴다(되돌리기의 되돌리기 가능). **프로젝트 삭제(연쇄)는 미지원** — 사유를 화면에 표시 | 배정 3행 소실 |
| **D20** | **배정 저장 가드** — 저장으로 사라지는 행이 1개 이상이면 인라인 경고 + 2단계 확인 | 같음 |
| **D21** | **마일스톤 일괄 처리** — 지연 목록에서 다중 선택 → ① 완료 처리(완료일 지정) ② 예정일 조정(+N일 또는 지정일). 2단계 확인 · 변경이력 **묶음 1건**(백업 배열) | 지연 12건 |
| **D22** | **업무 블럭 카탈로그 파생** — `설정` 역할 목록에 있는데 블럭이 0개인 파트는 공통 블럭 5종을 파트명으로 파생. 운영총괄·운영 Sub 는 전용 블럭을 기본 카탈로그에 추가 | 역할 8 ↔ 파트 6 |
| **D23** | **CI 게이트** — GitHub Actions 가 빌드 재현성·테스트·실렌더·정적 검사를 push/PR 마다 실행 | 붙여넣을 파일이 최신인지 사람이 안 따지게 |
| **D24** | **clasp 배포** — 로컬 `npm run deploy` + `main` 병합 시 GitHub Actions 자동 배포. 배포 ID 고정(`clasp deploy -i`)으로 **웹앱 주소 유지**. 자격증명은 저장소에 두지 않고 **GitHub Secret** | 기획자님 선택 |

## 2. 계약 변경 (`src/schema.js` — 메인이 먼저 확정, 세 실행 환경 공용)

### 2.1 `members` 표 — 폭 5 → **6**
```
f('email', 5, '이메일', 'text')   // 선택 입력 · '@' 포함 · 팀원 간 중복 금지(대소문자 무시)
```
- `팀원` 탭 헤더: `이름 · 주역할 · 월 가용 M/D · 상태 · 색상 · 이메일`
- **기존 시트 마이그레이션**: F1 이 비어 있으면 헤더만 써 넣는다(데이터 보존). `setupSheets` 와 시트 메뉴 [드롭다운 목록 새로고침] 양쪽에서 호출

### 2.2 신규 순수 함수 (전부 `src/schema.js`)

| 함수 | 시그니처 | 규칙 |
|---|---|---|
| `matchMember` | `(email, members)` → 팀원 이름 or `''` | 대소문자·앞뒤 공백 무시. `퇴사` 팀원은 매칭하지 않음 |
| `assignmentSaveGuard` | `(before, after)` → `{removed, removedRows, added, changed, warn}` | `removed` = before 에 있고 after 에 없는 배정ID. `warn` = `removed > 0` |
| `restoreCheck` | `(entry, data)` → `{ok, reason, table, rows, mode}` | `mode` = `replace`(배정 저장처럼 키 묶음 교체) \| `row`(단일 행) \| `delete`(추가의 되돌리기 = 그 행 삭제). 백업이 비었고 동작이 `추가` 면 `delete`. 프로젝트 `삭제` 이력은 `ok:false`(연쇄 미복원) |
| `validateBulkMilestone` | `(action, rows, payload, ctx)` → `{ok, errors, warnings, values}` | `action` = `complete`(payload.done 날짜, 기본 오늘) \| `shift`(payload.days 정수 또는 payload.due 날짜). 완료일이 예정일보다 1년 이상 빠르면 경고 |
| `blocksWithFallback` | `(blocks, settings)` → 카탈로그 배열 | 역할 목록 순회 → 블럭 0개인 파트에 `GENERIC_BLOCKS` 를 파트만 바꿔 복제. 원본 순서 유지, 파생분은 뒤에 |
| `weekEffortRows` | `(member, week, data)` → 행 배열 | 그 주차와 겹치는 내 배정 프로젝트 + 공통코드 3종 + 이미 기록된 행. 중복 없이, 기록값이 있으면 채워서 |

### 2.3 상수 추가
- `HISTORY.actions` 에 **`되돌림`** 추가
- `GENERIC_BLOCKS` 5종 — 업무 범위 정리 / 담당자 배정·일정 합의 / 진행 상황 점검 / 행사 당일 대응 / 결과 정리·인수인계
- `DEFAULT_BLOCKS` 33 → **44** (운영총괄 6 · 운영 Sub 5 추가)

> 이 계약은 메인이 먼저 커밋한다. 세 에이전트는 **`src/schema.js` 를 고치지 않는다** — 필요하면 메인에게 올린다.

## 3. 분담 (파일이 겹치지 않는다)

| 에이전트 | 파일 | 할 일 |
|---|---|---|
| **① 서버** | `apps-script/Code.gs` (마커 블록 밖) | §4 |
| **② 화면** | `src/app.js` · `src/styles.css` · `scripts/render-check.js` | §5 |
| **③ 문서·검증** | `docs/SPEC-v1.md` · `docs/DATA-CONTRACT.md` · `guide/설치-운영-가이드.md` · `tests/*.js` · `scripts/static-check.js` · `.github/workflows/*` · `package.json` · `.clasp.json` · `.claspignore` | §6·§7 |

공통 금지: 저장소 전체 git 명령(stash·reset·checkout) · `apps-script/index.html`·`preview/*` 직접 편집(빌드 산출물) · `Code.gs` 의 `__SCHEMA_BEGIN__/__SCHEMA_END__` 블록 손질 · 외부 라이브러리 · 브라우저 대화상자 · 화면 라벨에 업계 약어.

## 4. 서버 (`apps-script/Code.gs`)

1. **`ensureMemberEmailColumn_()`** — `팀원` 탭 F1 헤더 보장. `HEADERS['팀원']` 에 `이메일` 추가. `setupSheets`·`refreshValidations` 에서 호출
2. **부트스트랩** — `meta.userMember` 추가: 로그인 이메일을 `Schema.matchMember` 로 팀원 이름에 매칭(없으면 `''`). `meta.user`(문자열 이메일)는 그대로 둔다(하위호환)
3. **`restoreHistoryApi_(index, expected)`** — 잠금 → 이력 행 읽기 → `Schema.restoreCheck` → 복원 → 복원 직전 상태를 백업에 넣어 `되돌림` 이력 1건. `index` 는 부트스트랩이 내려준 `history` 배열의 인덱스(시트 행 번호를 함께 보내 대조)
4. **`bulkMilestoneApi_(action, keys, payload, expected)`** — 잠금 → `Schema.validateBulkMilestone` → 행 단위 부분 쓰기(수식 열 F 보존) → 변경이력 **1건**(백업 = 이전 행 배열) → 완료 처리 후 해당 프로젝트 자동 배정 재동기화
5. **카탈로그** — `업무블럭` 탭 로드 후 `Schema.blocksWithFallback(blocks, settings)` 를 거쳐 내려보낸다. `meta.blocksSource` 는 `sheet` \| `default` 에 더해 파생이 섞이면 `sheet+derived` / `default+derived`
6. **A3 알려진 이슈** — `saveRow('milestones')` 로 예정일이 바뀌면 그 프로젝트의 `syncAssignmentsFromItemsApi_` 를 이어서 실행(자동 배정 기간 갱신)
7. 모든 쓰기 경로는 기존 규약 유지: **잠금 → 검증 → `expected` 충돌 검사 → 행 단위 부분 쓰기 → 변경이력**

## 5. 화면 (`src/app.js` · `styles.css` · `render-check.js`)

### 5.1 C1 내 주간 공수 (C 화면 최상단 카드 + 모든 화면 헤더에 바로가기)
- 주차 선택: 기본 = 기준 주차(지난주 월요일), 이번 주도 선택 가능
- 팀원: `meta.userMember` 있으면 고정 표시("내 기록: 홍길동"), 없으면 select + `localStorage` 기억(키 `tb.myMember`)
- 행 = `Schema.weekEffortRows` 결과. M/D 는 0.5 스텝, 메모 1줄. [행 추가]로 다른 프로젝트 선택
- [지난주 값 복사] · 합계 표시(5.0 초과 시 경고 문구) · [저장] → `saveEffortWeek`
- 저장 후: 해당 주 기록 배지 갱신 · E 미기록 목록 반영

### 5.2 C2 지연 마일스톤 일괄 처리 (E 화면)
- 지연 카드 각 행에 체크박스 + [전체 선택]. 선택 시 하단 액션 바 노출
- [완료 처리] → 완료일(기본 오늘) → 2단계 인라인 확인 → 실행
- [예정일 조정] → `+N일` 또는 지정일 → 2단계 확인 → 실행

### 5.3 C3 배정 가드 + 되돌리기 (B 화면 · 최근 변경)
- 배정 편집기 저장 직전 `Schema.assignmentSaveGuard` → 사라지는 행이 있으면 경고 박스(이름·역할·M/D 나열) + 2단계 확인
- "최근 변경" 목록의 각 항목에 [되돌리기] — `Schema.restoreCheck` 가 `ok:false` 면 버튼 대신 사유 표시. 실행은 2단계 확인
- mock 어댑터에도 같은 동작을 구현(더블클릭 미리보기에서 전 경로가 돌아야 한다)

### 5.4 렌더 게이트 추가 (`scripts/render-check.js`)
`3-20` 내 주간 공수 저장(행 자동 제시 → 값 입력 → 저장 → 미기록 −1) · `3-21` 지난주 값 복사 · `3-22` 배정 가드 경고 노출 후 취소 → 행 유지 · `3-23` 되돌리기(배정 저장 1건 복원 → 행 수 원복) · `3-24` 마일스톤 일괄 완료(지연 −N) · `3-25` 예정일 일괄 조정 · `3-26` 파생 카탈로그 파트(운영총괄)에서 블럭 추가. 기존 검사는 전부 유지.

## 6. 테스트·정적 검사 (에이전트 ③)

- `tests/schema.test.js` — 신규 함수 6종 + 이메일 열 검증/중복 + `DEFAULT_BLOCKS` 44 + 파생 결과
- `tests/sample-data.test.js` — mock 의 `members[].email`·`meta.userMember`·파생 카탈로그 반영
- `scripts/static-check.js` **신설** — 지금까지 손으로 하던 검사를 코드로: ① 금지 필드(단가·급여·원가율) ② `window.confirm/alert/prompt` ③ 외부 주소 ④ 화면 라벨 약어(R&R·WBS) ⑤ 빌드 산출물과 `src` 동기(해시). 실패 시 종료 코드 1

## 7. CI·clasp (에이전트 ③)

### 7.1 `.github/workflows/gate.yml`
`push`·`pull_request`·`workflow_dispatch` → node 22 → `node scripts/build.js` → **`git diff --exit-code`(재현성)** → `node --test tests/*.js` → `node scripts/render-check.js`(러너 Chrome 경로를 `CHROME_PATH` 로) → `node scripts/static-check.js` → 스크린샷·리포트 아티팩트 업로드

### 7.2 `.github/workflows/deploy.yml`
`workflow_dispatch` + `main` 의 `apps-script/**` 변경 → Secret `CLASPRC_JSON`·`CLASP_SCRIPT_ID`·`CLASP_DEPLOYMENT_ID` → `~/.clasprc.json` 생성 → `clasp push -f` → `clasp deploy -i $CLASP_DEPLOYMENT_ID -d "<커밋 요약>"`. **게이트 성공이 선행 조건**. Secret 이 없으면 명확한 안내와 함께 건너뛴다(실패로 끝내지 않는다)

### 7.3 `package.json`
`gate`(build+test+render+static) · `build` · `test` · `push` · `deploy` · `pull`. 의존성은 `devDependencies` 의 `@google/clasp` 하나 — **앱 런타임 의존성은 여전히 0**

### 7.4 가이드 (`guide/설치-운영-가이드.md` §10 신설)
비개발자 기준 클릭 단위로: Node LTS 설치 → `npm install` → Apps Script API 켜기 → `npx clasp login` → 배포 ID 확인 → `npm run deploy` → GitHub Secret 3개 등록 화면. **배포 ID 를 고정해야 주소가 안 바뀐다**는 점을 굵게.

## 8. 검수 게이트 (3턴)

| # | 게이트 | 통과 기준 |
|---|---|---|
| 1 | 빌드 | 성공 · 외부 주소 0 · `git diff` 0(재현성) |
| 2 | 테스트 | `node --test` 전건 통과(132 + 신규) |
| 3 | 실렌더 | 콘솔 오류 0 · 실패 0 · 대화상자 0 · 신규 3-20~3-26 포함 |
| 4 | 정적 검사 | `scripts/static-check.js` 통과 |
| 5 | jc-redteam | 3.1·4턴·5턴 미실시분 일괄 감수 → Major 이상 이 턴에서 처리 |

## 9. 산출물 이후

`PROGRESS.md` 체크아웃 갱신 → 커밋 → `claude/laughing-bohr-qgj6rf` 푸시 → 드래프트 PR → 기획자님 할 일(Node LTS · clasp 로그인 · Secret 3개 · 버전 6 배포)을 한 장으로.
