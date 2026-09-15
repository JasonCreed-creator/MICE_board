# Claude Code 착수 지시문 — 팀 프로젝트 보드 · 2턴(빌드)

발행: 2026-09-10 · Cowork 1턴 → Code 2턴 인계 · 검수(3턴)는 Cowork 챗에서 수행

## 세션 설정
- 작업 폴더: `C:\.Claude\Code\Team Board` (이 폴더가 곧 세션. 다른 폴더에 쓰지 말 것)
- 권장 모델: **Fable 계열(현재 5.1)** · 사고 수준(Effort) **표준**. 단, 서브에이전트 ③(Apps Script 연동·배포 가이드)은 **엑스트라**
- 언어: 모든 산출물·UI 텍스트·주석·보고는 한국어. 영어는 코드 문법·변수명·고유명사만

## 0. 체크인 (가장 먼저)
1. 폴더에 `CLAUDE.md` · `PROGRESS.md` · `docs/SPEC-v1.md` 가 있는지 확인한다.
2. **없으면** 이 지시문의 부록 A·B·C 내용을 그대로 각 경로에 생성한다(한 글자도 바꾸지 않음). 이 지시문 자체도 `docs/code-brief-T2.md` 로 저장한다.
3. 세 파일을 읽는다. `CLAUDE.md` §2 결정 D1~D5와 §3 작업 규칙은 **변경 불가 계약**이다. `docs/SPEC-v1.md` 가 설계 정본이다 — 이 지시문과 SPEC이 어긋나면 SPEC을 따르고 보고에 기록한다.
4. `PROGRESS.md` "2턴 착수 조건" 3건은 모두 **미충족 상태로 착수**한다 → SPEC §8의 대체안 적용: 가상 팀원 5명 / 웹앱 배포 미확인(폴백 설계 유지) / 가상 프로젝트 5건.

## 1. 목표
SPEC §0 한 줄 정의를 구현한다: 구글 시트(기록) + Apps Script 웹앱 대시보드(화면 A~E, 쓰기 경로 3개). **Apps Script 없이도** `preview/dashboard-preview.html` 더블클릭으로 전 화면을 확인할 수 있어야 한다.

## 2. 산출물과 경로 (전부 생성)
| 경로 | 내용 |
|---|---|
| `docs/DATA-CONTRACT.md` | §3 데이터 계약 동결본 (빌드 전 작성) |
| `src/metrics.js` | SPEC §4 지표 산식 — 순수 함수만, DOM 접근 없음. Node(`require`)와 브라우저 양쪽에서 로드 가능 |
| `src/app.js` · `src/styles.css` · `src/index.template.html` | 화면 A~E, DataProvider(mock·gas), 공통 필터, SVG 차트 |
| `scripts/build.js` | 의존성 없는 Node 스크립트. src → `apps-script/index.html`(단일 파일) 및 `preview/dashboard-preview.html`(mock JSON 인라인) 생성 |
| `apps-script/Code.gs` | SPEC §6.1 API 6종 + `onOpen` 커스텀 메뉴 + `onEdit` ID 자동 채움 |
| `apps-script/index.html` | 빌드 산출물(수정은 src에서) |
| `apps-script/appsscript.json` | `timeZone: Asia/Seoul`, `runtimeVersion: V8`, webapp `executeAs: USER_ACCESSING`, `access: DOMAIN` |
| `mock/sample-data.json` | 가상 데이터(아래 §5) |
| `preview/dashboard-preview.html` | 빌드 산출물 |
| `tests/metrics.test.js` | `node --test` 로 실행되는 산식 단위 테스트 |
| `guide/설치-운영-가이드.md` | 비개발자 기준 클릭 단위 가이드(아래 §7) |
| `PROGRESS.md` | 체크아웃 갱신(아래 §9) |

## 3. 데이터 계약 — 빌드 전에 동결
`getBootstrap()`(gas)과 `mock/sample-data.json`(mock)은 **동일한 JSON 구조**를 반환한다. 아래를 `docs/DATA-CONTRACT.md` 에 필드 설명과 함께 기록하고, 모든 서브에이전트는 이 파일만 보고 작업한다.

````json
{
  "meta": { "generatedAt": "2026-09-10T09:00:00+09:00", "mode": "mock|gas", "sheetUrl": "" },
  "settings": {
    "statuses": ["견적","계약","준비","진행","완료","정산완료","드롭"],
    "types": ["① 리멤버 MICE 솔루션","② 일반 행사(게런티 없음)","③ DMS·주최형","④ 커스터마이즈"],
    "roles": ["영업","모객","운영 PM","현장 운영","디자인·제작","정산·리포트"],
    "commonCodes": ["G-내부","G-영업","G-휴가"],
    "capacityMdPerMonth": 20,
    "margin": { "external": 0.25, "markup": 0.10, "target": 0.35 },
    "thresholds": { "utilWarn": 0.85, "utilOver": 1.0, "missingLogWeeks": 1 },
    "timelineOffsets": { "kickoffDays": -90, "settlementDays": 30 },
    "milestoneTemplate": [ { "name": "계약 체결", "offsetDays": -90, "role": "영업", "skipForHost": true } ]
  },
  "members":     [ { "name": "", "role": "", "capacityMd": 20, "status": "재직", "color": "" } ],
  "projects":    [ { "id": "P-2026-001", "name": "", "client": "", "type": "", "status": "", "pm": "",
                     "eventStart": "YYYY-MM-DD", "eventEnd": "YYYY-MM-DD", "kickoff": "", "settlementDue": "",
                     "venue": "", "guarantee": null, "expectedAttendees": null, "contractAmount": 0, "note": "", "createdAt": "" } ],
  "assignments": [ { "id": "A-0001", "projectId": "", "member": "", "role": "", "plannedMd": 0, "start": "", "end": "", "status": "예정", "note": "" } ],
  "effortLogs":  [ { "week": "YYYY-MM-DD(월요일)", "member": "", "projectId": "", "md": 0, "memo": "", "loggedAt": "" } ],
  "milestones":  [ { "projectId": "", "name": "", "due": "", "done": "", "owner": "" } ],
  "settlements": [ { "projectId": "", "revenue": null, "directCost": null, "preReg": null, "attended": null, "status": "미착수" } ]
}
````
규칙: 날짜는 전부 `YYYY-MM-DD` 문자열(Code.gs에서 `Utilities.formatDate` 로 변환, Date 객체 직렬화 금지) · 숫자는 숫자형 · 빈 값은 `""` 또는 `null` · 열거값은 `settings` 목록 문자열과 **정확히 일치** · 시트의 `[자동]` 수식 열(실마진·쇼업률·마일스톤 상태 등)은 **읽지 않고** 프런트가 원시값에서 재계산한다(이중 원천 방지).

## 4. 실행 구조 — 서브에이전트 3 병렬 + 메인 병합
데이터 계약 동결 후 병렬 착수. 각 에이전트에는 `CLAUDE.md` §3 규칙과 `docs/DATA-CONTRACT.md` 를 컨텍스트로 넘긴다.

| 에이전트 | 범위 | 모델 권장 |
|---|---|---|
| ① 시트·스키마 | `Code.gs`의 `setupSheets()`(탭 7·헤더·드롭다운 검증·설정 시드·샘플 5건, **재실행 안전** — 있는 탭은 건너뜀), `onOpen` 메뉴("팀 보드": 초기 설정 실행 / 프로젝트 ID 채우기 / 선택 프로젝트 표준 마일스톤 생성), `onEdit`(행사명 입력 시 빈 ID·등록일 자동 채움), `mock/sample-data.json` | Opus 계열 |
| ② 대시보드 | `src/*`, `scripts/build.js`, `tests/metrics.test.js`, 화면 A~E, DataProvider, SVG 차트, 웜 페이퍼 룩 | Opus 계열 |
| ③ 연동·가이드 | `Code.gs`의 `doGet`·`getBootstrap`·`saveAssignments`·`completeMilestone`·`createStandardMilestones`, `appsscript.json`, `guide/설치-운영-가이드.md` | Fable 계열 · 엑스트라 |

메인(이 세션)은 병합 후 §8 품질 게이트를 직접 실행한다. **병렬 에이전트는 저장소 전체 git 명령(stash·reset·checkout) 금지** — git 사용 자체는 선택이며, 쓰면 메인만 커밋한다.

## 5. 가상 데이터 규격 (`mock/sample-data.json`)
- 팀원 5: 이름 `팀원1`~`팀원5`, 역할 각각 운영 PM / 모객 / 현장 운영 / 디자인·제작 / 정산·리포트, 월 가용 20, 전원 재직
- 프로젝트 5: 가상 명칭(실제 고객사·행사명 사용 금지, 예: "가상 테크 컨퍼런스 2026"). 4유형 모두 1건 이상, 상태는 견적·계약·준비·진행·완료 각 1. 행사일은 2026-09 ~ 2027-02 분포, 계약금액은 2천만~1억 5천만 원 범위
- 배정: 프로젝트당 2~4행. **팀원2는 2026-11에 계획 가동률 110% 과부하**가 되도록 구성(경고 검증용). 상태 '계약' 프로젝트 1건은 PM만 배정(미배정 경고 검증용)
- 공수기록: 2026-07-20 ~ 2026-09-07 월요일 8주. `G-내부` 주당 0.5~1.0 포함. **팀원5는 2026-09-07 주차 미기록**(미기록 경고 검증용)
- 마일스톤: 템플릿 기준 생성. 진행 중 프로젝트 1건에 **예정일 지난 미완료 1개**(지연 경고 검증용)
- 정산: 완료 1건 채움 — 매출·직접비(실마진율 28~32%로 25%·35% 기준선 사이에 오게), 사전 등록·현장 참석(쇼업률 60~75%), 게런티 달성률 계산 가능하게

## 6. 기술 규칙 (CLAUDE.md §3 보충)
- 외부 라이브러리·CDN·웹폰트 **금지**. 차트는 SVG 직접 렌더. 폰트는 `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
- `index.html` 은 빌드 결과 단일 파일. Apps Script의 HtmlService 제약(스크립트 태그 인라인, 상대 경로 불가) 준수
- DataProvider: `window.google?.script?.run` 존재 → gas 모드, 아니면 `<script id="mock-data" type="application/json">` 인라인 → mock 모드. 두 모드에서 **화면 코드는 한 줄도 분기하지 않는다**
- 쓰기 3경로(배정 저장·마일스톤 완료·표준 마일스톤 생성)는 mock 모드에서 메모리 상태만 갱신하고 콘솔에 `[mock write]` 로그를 남긴다
- 산식은 `src/metrics.js` 에만 둔다. 배정 월 배분은 달력일 비례(SPEC §4). 경고 5종 판정도 여기서
- 룩: `jc-remember-html` 스킬이 로컬에 있으면 그 토큰을 쓴다. 없으면 **가정값** — 캔버스 `#F6F1E8`, 잉크 `#1F1B16`, 보조 텍스트 `#6B6257`, 액센트 오렌지 1색 `#E8652B`, 경고 3단(녹 `#2F8F5B` / 황 `#D39A1F` / 적 `#C83A2A`), 카드 테두리 `#E3DACB`. 다크 모드는 `prefers-color-scheme` 로 최소 대응
- 반응형: 1280·1920 폭 기준, 1024 미만은 가로 스크롤 허용(모바일 전용 레이아웃은 범위 밖)
- 라벨: 업계 약어 금지. "M/D"는 첫 등장에 "M/D(1인 1일 공수)" 설명 툴팁

## 7. 가이드 규격 (`guide/설치-운영-가이드.md`)
기획자님은 개발자가 아니다. 각 단계는 "어느 화면 → 어느 메뉴 → 무엇을 클릭 → 무엇이 보여야 정상"으로 쓴다.
1. 구글 드라이브에서 새 스프레드시트 만들기, 이름 "마이스 비즈 팀 보드"
2. 확장 프로그램 → Apps Script → `Code.gs` 내용 전체 교체 → 파일 추가(+) → HTML → 이름 `index` → 내용 붙이기 → 프로젝트 설정에서 매니페스트 표시 → `appsscript.json` 교체
3. 함수 선택 `setupSheets` → 실행 → 권한 검토 → 허용 → 시트에 탭 7개가 생기면 정상
4. 배포 → 새 배포 → 유형 선택 "웹 앱" → 실행 주체 "웹 앱에 액세스하는 사용자" → 액세스 권한 "조직 내 모든 사용자" → 배포 → URL 복사
5. 시트 공유: 팀원 전원 편집자 / 웹앱 URL 공유
6. 주간 운영 루틴: 월요일 오전 `공수기록` 탭 입력(5분), 프로젝트 신규 시 `프로젝트` 탭 행 추가 → 메뉴 "팀 보드 → 표준 마일스톤 생성"
7. 문제 해결: 권한 팝업이 안 뜰 때 / "배포" 메뉴가 없을 때(→ 워크스페이스 정책, SPEC §6.3 폴백 안내) / 데이터가 안 보일 때(설정 목록 불일치 확인)
8. 업데이트 방법: `index.html` 교체 → 배포 관리 → 새 버전

## 8. 품질 게이트 (메인이 직접 실행, 결과를 보고에 수치로)
1. `node scripts/build.js` 성공 → 두 산출 HTML 생성, `apps-script/index.html` 에 외부 URL 참조 0건(`grep -c "https://"` 로 증명, `sheetUrl` 표시용 문자열 제외)
2. `node --test tests/` 전부 통과 — 최소 포함: 월 일할 배분(월 경계 걸친 배정) / 계획·실 가동률 / 소진율 / M/D당 매출·실마진 / 실마진율·쇼업률·게런티 달성률(게런티 없음 → null) / 경고 5종 각 1 케이스
3. 실렌더: Playwright(또는 설치 가능하면 `npx playwright install chromium`)로 `preview/dashboard-preview.html` 탭 5개 전수 스크린샷 → `preview/screenshots/A~E.png`. 콘솔 에러 0건. 설치 불가 시 **그 사실을 보고에 명시**하고 DOM 검증(각 탭 KPI·차트 노드 존재)으로 대체
4. 경고 검증: 가상 데이터가 의도한 경고 4종(과부하·미배정·지연·미기록)이 화면 E와 B에 실제로 표시되는지 확인
5. 쓰기 3경로: mock 모드에서 각 1회 실행 → `[mock write]` 로그 확인, 화면 갱신 확인
6. 정적 검사: 단가·급여·원가율 관련 열·필드·문자열이 어디에도 없음(`grep -i "단가\|급여\|원가율"` 0건)
7. `Code.gs` 코드 리뷰: Date 직렬화 경로, `setupSheets` 재실행 안전성, `saveAssignments` 의 "해당 프로젝트 행 교체" 로직(다른 프로젝트 행 보존), 동시 편집 시 `LockService` 사용

## 9. 체크아웃 (종료 시 필수)
1. `PROGRESS.md` 갱신: 현재 상태 → "2턴 빌드 완료 → 3턴 검수 대기", 턴 로그 1행, 미결·이탈 목록, 게이트 결과 수치
2. 아래 블록을 채워 **채팅에 그대로 출력**한다(기획자님이 Cowork 챗에 붙여 3턴 검수를 시작한다):

````
[팀 프로젝트 보드 · 2턴 체크아웃 보고]
- 산출 파일: (경로별 1줄, 줄 수 또는 바이트)
- 빌드: scripts/build.js 결과 / 외부 URL 참조 건수
- 테스트: node --test 통과/전체
- 실렌더: 방식(Playwright|DOM 대체) / 탭 5 스크린샷 경로 / 콘솔 에러 건수
- 경고 검증: 과부하·미배정·지연·미기록 표시 여부
- 쓰기 3경로: 각 동작 결과
- SPEC 이탈: (항목·사유) 없으면 "없음"
- 미결·질문: (기획자님 결정 필요 항목)
- 다음 액션: 3턴 검수 요청
````

## 10. 금지
- 단가·급여·인건비 금액 환산(D3) · 태스크 단위 WBS · Slack/커뮤니케이터 연동 · 실제 고객사·행사명을 샘플에 사용 · SPEC 무단 변경(필요하면 보고에 "개정 제안"으로만) · 외부 라이브러리 · 파일을 폴더 밖에 생성

---
# 부록 — 폴더에 없을 때 생성할 파일 3종 (내용 그대로)

> 착수 시점(2026-09-10, Code 세션)에 부록 A·B·C의 대상 파일이 폴더에 이미 존재했으므로, 이 저장본에서는 부록 원문을 반복 수록하지 않고 각 파일을 정본으로 가리킨다.

- 부록 A → `CLAUDE.md` — 착수 시 존재, 부록과 동일
- 부록 B → `PROGRESS.md` — 착수 시 존재. 부록 B 대비 "실행 환경 Claude Code(로컬), 지시문 `docs/code-brief-T2.md`" 문구와 두 번째 턴 로그 행(Code 전환 기록)이 없는 이전 판이었음 → 2턴 체크아웃 시 반영
- 부록 C → `docs/SPEC-v1.md` — 착수 시 폴더 루트 `SPEC-v1.md` 로 있던 것을 `docs/` 로 이동(내용 변경 없음)
