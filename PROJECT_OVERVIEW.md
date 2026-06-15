# Project Overview

## Concept

Windows에서 실행되는 `vDrop` 배치 다운로드 앱이다. 여러 링크를 붙여넣고 비디오/오디오 형식을 선택한 뒤 `yt-dlp`로 일괄 다운로드한다.

## Product Summary

사용자는 입력창에 여러 링크를 넣고, 파일명과 폴더 규칙을 텍스트로 적고, 비디오 또는 오디오 모드를 선택한 다음 다운로드를 시작한다. 앱은 구조화된 입력을 해석해 목록으로 바꾸고, 진행률과 상태를 보여준다.

## Implementation Stack

- Electron main process
- React + TypeScript renderer
- Vite build pipeline
- Node.js `child_process` subprocess execution
- Local filesystem output

## Main Features

- 여러 HTTP(S) 링크 붙여넣기
- 링크 앞뒤 텍스트에서 파일명 추정
- `[폴더명]`, `# 폴더명`, `@폴더명` 단독 줄 폴더 선언
- 비디오 / 오디오 모드 전환
- 다운로드 큐, 진행률, 속도, ETA 표시
- 취소, 재시작, 실패 처리
- 출력 폴더 선택 및 Finder/Explorer 열기

## Structure

- `electron/`: 브라우저 창 생성, IPC, subprocess 제어
- `src/`: React UI와 입력 파서, 다운로드 상태 관리
- `scripts/`: 개발용 프로세스 런처

## Key Flows

- 입력 텍스트를 파싱해 링크, 파일명 후보, 폴더 선언을 추출한다.
- `yt-dlp` 실행 시 진행률 라인을 읽어 UI 상태를 갱신한다.
- 큐는 동시 다운로드 수를 지키며 다음 항목을 자동 시작한다.
- 완료된 항목은 저장 위치와 결과 상태를 보여준다.

## Current State

초기 구현 단계다. Windows 앱 구조, 입력 파서, 다운로드 큐, 기본 UI, Electron IPC를 새로 작성했다. macOS 전용 코드와는 별도 프로젝트로 분리했다.

## Update Notes

- Date: 2026-06-16
- Reason: Windows용 vDrop 첫 구현

