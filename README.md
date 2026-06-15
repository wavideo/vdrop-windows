# vDrop Windows

Windows에서 여러 링크를 한 번에 등록해 `yt-dlp`로 비디오 또는 오디오를 일괄 다운로드하는 앱이다.

## Rules

AI 작업자는 먼저 다음 파일을 읽는다.

1. `../../AGENTS.md`
2. `AGENTS.md`
3. `PROJECT_RULES.md`
4. `PROJECT_OVERVIEW.md`
5. `README.md`
6. 필요한 경우 `../../shared-rules/AGENTS.md`

## 준비

```bash
npm install
```

## 개발

```bash
npm run dev
```

브라우저 UI 확인:

```bash
npm run dev:web
```

## 실행

```bash
npm start
```

기본 개발 포트:

```text
http://127.0.0.1:4173
```

미리보기 포트:

```text
http://127.0.0.1:4174
```

## 빌드

```bash
npm run build
```

## 설계 기준

- 기본 재질은 Mica 계열 감성을 따른다.
- 주 UI는 Fluent 기반의 정돈된 표면을 사용한다.
- 입력창은 구조화 편집기처럼 보이게 만든다.
- 상태, 진행률, 속도, ETA는 같은 위치에 유지한다.

