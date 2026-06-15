import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, FolderOpen, Link2, Play, Plus, Search, Square, X } from "lucide-react";
import { deriveHint, makeDisplayTitle, parseInput, type LinkEntry } from "./lib/parser";
import { vdropApi, type AppBootstrap, type DownloadRequest, type MediaType, type QualityPreset } from "./lib/ipc";
import { adSlotStyle, defaultAdPackage, loadRemoteAdPackage, trackAdEvent, type AdItem, type AdPackage } from "./lib/ads";
import type { InstallTarget } from "./lib/ipc";
type DownloadStatus = "queued" | "starting" | "running" | "merging" | "complete" | "failed" | "canceled";

interface QueueItem {
  id: string;
  url: string;
  folderName: string;
  fileBaseName: string;
  mediaType: MediaType;
  qualityPreset: QualityPreset;
  status: DownloadStatus;
  progress: number;
  size: string;
  speed: string;
  eta: string;
  error: string;
  outputPath: string;
  isAmbiguous: boolean;
  title: string;
}

interface DependencyState {
  status: "ready" | "missing" | "installing" | "error";
  path: string;
  progress: number;
  message: string;
}

const qualityOptions: Array<{ value: QualityPreset; label: string }> = [
  { value: "best", label: "최고화질" },
  { value: "compatibleBest", label: "호환성 최고화질" },
  { value: "p2160", label: "2160p" },
  { value: "p1440", label: "1440p" },
  { value: "p1080", label: "1080p" },
  { value: "p720", label: "720p" },
  { value: "p480", label: "480p" },
];

function createQueueItem(entry: LinkEntry, mediaType: MediaType, qualityPreset: QualityPreset): QueueItem {
  return {
    id: crypto.randomUUID(),
    url: entry.url,
    folderName: entry.folderName,
    fileBaseName: entry.fileBaseName,
    mediaType,
    qualityPreset,
    status: "queued",
    progress: 0,
    size: "",
    speed: "",
    eta: "",
    error: "",
    outputPath: "",
    isAmbiguous: entry.isAmbiguous,
    title: makeDisplayTitle(entry),
  };
}

function statusLabel(status: DownloadStatus) {
  switch (status) {
    case "queued":
      return "대기";
    case "starting":
      return "준비";
    case "running":
      return "다운로드";
    case "merging":
      return "병합";
    case "complete":
      return "완료";
    case "failed":
      return "실패";
    case "canceled":
      return "취소";
  }
}

function statusTone(status: DownloadStatus) {
  switch (status) {
    case "complete":
      return "success";
    case "failed":
      return "danger";
    case "running":
    case "starting":
    case "merging":
      return "accent";
    case "canceled":
      return "muted";
    default:
      return "neutral";
  }
}

function mediaLabel(mediaType: MediaType) {
  return mediaType === "video" ? "비디오" : "오디오";
}

function formatPath(pathValue: string) {
  return pathValue.replaceAll("\\", "/");
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [inputText, setInputText] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("best");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(3);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [emptyCycle, setEmptyCycle] = useState(0);
  const [folderSuggestions, setFolderSuggestions] = useState<string[]>([]);
  const [searchRequest, setSearchRequest] = useState<string>("");
  const [adPackage, setAdPackage] = useState<AdPackage>(defaultAdPackage);
  const [adIndex, setAdIndex] = useState(0);
  const [dependencyState, setDependencyState] = useState<Record<InstallTarget, DependencyState>>({
    "yt-dlp": { status: "missing", path: "", progress: 0, message: "" },
    ffmpeg: { status: "missing", path: "", progress: 0, message: "" },
  });
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const itemsRef = useRef(items);
  const dependencyInstallStartedRef = useRef<Record<InstallTarget, boolean>>({
    "yt-dlp": false,
    ffmpeg: false,
  });
  const adImpressionRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    vdropApi.getBootstrap().then(state => {
      setBootstrap(state);
      setOutputDirectory(state.outputDirectory);
      setDependencyState({
        "yt-dlp": state.dlpPath
          ? { status: "ready", path: state.dlpPath, progress: 100, message: "detected" }
          : { status: "missing", path: "", progress: 0, message: "not found" },
        ffmpeg: state.ffmpegPath
          ? { status: "ready", path: state.ffmpegPath, progress: 100, message: "detected" }
          : { status: "missing", path: "", progress: 0, message: "not found" },
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRemoteAdPackage(defaultAdPackage.source.ads_json_url)
      .then(packageValue => {
        if (!cancelled) {
          setAdPackage(packageValue);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdPackage(defaultAdPackage);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!adPackage.ads.length) {
      return;
    }

    const interval = window.setInterval(() => {
      setAdIndex(index => (index + 1) % adPackage.ads.length);
    }, Math.max(2400, adPackage.slot?.roll_interval_ms ?? adPackage.roll_interval_ms));

    return () => window.clearInterval(interval);
  }, [adPackage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEmptyCycle(step => (step + 1) % 3);
    }, 3800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!outputDirectory) {
      return;
    }
    vdropApi.listFolders(outputDirectory).then(setFolderNames).catch(() => setFolderNames([]));
  }, [outputDirectory]);

  useEffect(() => {
    return vdropApi.onDownloadEvent(event => {
      setItems(prev => prev.map(item => {
        if (item.id !== event.jobId) {
          return item;
        }

        if (event.kind === "progress") {
          return {
            ...item,
            status: item.status === "starting" ? "running" : item.status,
            progress: Math.max(item.progress, event.percentage || 0),
            size: event.size || item.size,
            speed: event.speed || item.speed,
            eta: event.eta || item.eta,
          };
        }

        if (event.kind === "phase") {
          return { ...item, status: "merging" };
        }

        if (event.kind === "destination") {
          return { ...item, outputPath: event.destination };
        }

        if (event.kind === "complete") {
          return { ...item, status: "complete", progress: 100, error: "", outputPath: event.outputPath || item.outputPath };
        }

        if (event.kind === "failed") {
          return { ...item, status: "failed", error: event.message };
        }

        if (event.kind === "error") {
          return { ...item, status: "failed", error: event.message };
        }

        return item;
      }));

      if (event.kind === "complete" || event.kind === "failed" || event.kind === "error") {
        window.setTimeout(() => {
          void pumpQueue();
        }, 0);
      }
    });
  }, [maxConcurrentDownloads, outputDirectory, qualityPreset, mediaType]);

  useEffect(() => {
    return vdropApi.onInstallEvent(event => {
      setDependencyState(prev => ({
        ...prev,
        [event.target]: {
          status: event.kind === "install-error" ? "error" : event.stage === "complete" ? "ready" : "installing",
          path: event.path ?? prev[event.target].path,
          progress: event.percentage,
          message: event.message,
        },
      }));
    });
  }, []);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    const missingTargets: InstallTarget[] = [];
    if (!bootstrap.dlpPath && !dependencyInstallStartedRef.current["yt-dlp"]) {
      missingTargets.push("yt-dlp");
    }
    if (!bootstrap.ffmpegPath && !dependencyInstallStartedRef.current.ffmpeg) {
      missingTargets.push("ffmpeg");
    }

    if (!missingTargets.length) {
      return;
    }

    for (const target of missingTargets) {
      dependencyInstallStartedRef.current[target] = true;
      void handleInstallDependency(target);
    }
  }, [bootstrap]);

  const parseResult = useMemo(() => parseInput(inputText), [inputText]);
  const hint = useMemo(() => deriveHint(inputText, emptyCycle), [inputText, emptyCycle]);
  const hasRunnable = parseResult.entries.length > 0 || parseResult.isSearchOnly;
  const activeCount = items.filter(item => item.status === "starting" || item.status === "running" || item.status === "merging").length;
  const queuedCount = items.filter(item => item.status === "queued").length;
  const selectedItem = items.find(item => item.id === selectedId) ?? items[0] ?? null;
  const isSearchMode = parseResult.isSearchOnly && parseResult.entries.length === 0;
  const activeAd = adPackage.ads.length ? adPackage.ads[adIndex % adPackage.ads.length] : null;

  useEffect(() => {
    if (!activeAd) {
      return;
    }

    const impressionKey = `${adPackage.package_id}:${adPackage.version}:${activeAd.id}`;
    if (adImpressionRef.current === impressionKey) {
      return;
    }
    adImpressionRef.current = impressionKey;
    void trackAdEvent(adPackage.source, adPackage, activeAd, "impression");
  }, [activeAd, adPackage]);

  useEffect(() => {
    if (!selectedId && items[0]) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  useEffect(() => {
    const q = inputText.trim();
    if (!q || q.includes("\n")) {
      setSearchRequest("");
      return;
    }
    if (isSearchMode) {
      setSearchRequest(q);
    } else {
      setSearchRequest("");
    }
  }, [inputText, isSearchMode]);

  useEffect(() => {
    const current = inputText;
    const lineIndex = current.lastIndexOf("\n");
    const line = current.slice(lineIndex + 1);
    const markerMatch = line.match(/^(\s*(?:\[[^\]]*$|@[^ \n]*$|#+\s*[^ \n]*$))/);
    if (!markerMatch) {
      setFolderSuggestions([]);
      return;
    }
    const partial = line
      .replace(/^\s*\[+/, "")
      .replace(/^\s*@/, "")
      .replace(/^\s*#+\s*/, "")
      .trim();
    const source = folderNames.filter(name => !partial || name.toLowerCase().includes(partial.toLowerCase())).slice(0, 8);
    setFolderSuggestions(source);
  }, [inputText, folderNames]);

  const addEntries = async (entries: LinkEntry[]) => {
    const newItems = entries.map(entry => createQueueItem(entry, mediaType, qualityPreset));
    setItems(prev => [...prev, ...newItems]);
    setSelectedId(newItems[0]?.id ?? selectedId);
    await pumpQueue([...itemsRef.current, ...newItems]);
    setInputText("");
  };

  const pumpQueue = async (snapshot: QueueItem[] = itemsRef.current) => {
    const active = snapshot.filter(item => item.status === "starting" || item.status === "running" || item.status === "merging").length;
    let slots = Math.max(0, maxConcurrentDownloads - active);
    if (slots === 0) {
      return;
    }

    const candidates = snapshot.filter(item => item.status === "queued").slice(0, slots);
    for (const item of candidates) {
      slots -= 1;
      setItems(prev => prev.map(row => row.id === item.id ? { ...row, status: "starting" } : row));
      try {
        const request: DownloadRequest = {
          jobId: item.id,
          url: item.url,
          mediaType: item.mediaType,
          qualityPreset: item.qualityPreset,
          fileBaseName: item.fileBaseName,
          folderName: item.folderName,
          outputDirectory,
        };
        await vdropApi.startDownload(request);
        setItems(prev => prev.map(row => row.id === item.id ? { ...row, status: "running" } : row));
      } catch (error) {
        const message = error instanceof Error ? error.message : "시작 실패";
        setItems(prev => prev.map(row => row.id === item.id ? { ...row, status: "failed", error: message } : row));
      }
    }
  };

  const handleSubmit = async () => {
    const parsed = parseResult;
    if (parsed.isSearchOnly && searchRequest) {
      await vdropApi.openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchRequest)}`);
      setInputText("");
      return;
    }
    if (!parsed.entries.length) {
      return;
    }
    await addEntries(parsed.entries);
  };

  const handleAddOnly = async () => {
    if (parseResult.entries.length > 0) {
      await addEntries(parseResult.entries);
    }
  };

  const handleClearFinished = () => {
    setItems(prev => prev.filter(item => item.status === "queued" || item.status === "starting" || item.status === "running" || item.status === "merging"));
  };

  const handleCancel = async (item: QueueItem) => {
    if (item.status === "queued") {
      setItems(prev => prev.filter(row => row.id !== item.id));
      return;
    }
    await vdropApi.cancelDownload(item.id);
    setItems(prev => prev.map(row => row.id === item.id ? { ...row, status: "canceled" } : row));
  };

  const handleSelectOutputDirectory = async () => {
    const chosen = await vdropApi.selectOutputDirectory(outputDirectory);
    if (chosen) {
      setOutputDirectory(chosen);
    }
  };

  const handleInstallDependency = async (target: InstallTarget) => {
    setDependencyState(prev => ({
      ...prev,
      [target]: {
        ...prev[target],
        status: "installing",
        progress: 0,
        message: "preparing",
      },
    }));

    try {
      const result = await vdropApi.installDependency(target);
      const refreshed = await vdropApi.getBootstrap();
      setBootstrap(refreshed);
      setDependencyState(prev => ({
        ...prev,
        [target]: {
          status: "ready",
          path: result.path,
          progress: 100,
          message: "installed",
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "install failed";
      setDependencyState(prev => ({
        ...prev,
        [target]: {
          ...prev[target],
          status: "error",
          message,
        },
      }));
    }
  };

  const focusTextArea = () => textAreaRef.current?.focus();

  return (
    <div className="appShell">
      <div className="backdrop backdropA" />
      <div className="backdrop backdropB" />

      <header className="topBar">
        <div className="brandMark">
          <div className="brandIcon">vD</div>
          <div>
            <div className="brandTitle">vDrop Windows</div>
            <div className="brandMeta">
              {bootstrap ? `${bootstrap.platform.toUpperCase()} · ${bootstrap.appVersion}` : "booting"}
            </div>
          </div>
        </div>

        <div className="topBarStats">
          <Chip tone={bootstrap?.dlpPath ? "success" : "danger"}>{bootstrap?.dlpPath ? "yt-dlp ready" : "yt-dlp missing"}</Chip>
          <Chip tone={bootstrap?.ffmpegPath ? "success" : "neutral"}>{bootstrap?.ffmpegPath ? "ffmpeg ready" : "ffmpeg missing"}</Chip>
          <Chip tone="neutral">{activeCount} active</Chip>
        </div>
      </header>

      <main className="layout">
        <section className="mainColumn">
          <section className="panel inputPanel">
            <div className="panelHeader">
              <div>
                <h1>링크 입력</h1>
                <p>여러 링크를 붙여넣고, 파일명과 폴더 규칙을 텍스트로 같이 적는다.</p>
              </div>
              <div className="panelHeaderActions">
                <Chip tone={isSearchMode ? "accent" : "neutral"}>{isSearchMode ? "검색 모드" : "다운로드 모드"}</Chip>
              </div>
            </div>

            <div className="composerGrid">
              <div className="editorShell">
                <div className="editorChrome">
                  <button className="ghostButton" onClick={focusTextArea} type="button">
                    <Search size={14} />
                    입력 포커스
                  </button>
                  <div className="editorChromeRight">
                    <span>{parseResult.entries.length} links</span>
                    <span>{parseResult.folderDeclarations.length} folders</span>
                  </div>
                </div>

                <textarea
                  ref={textAreaRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="composerText"
                  placeholder="예:\n이름 https://youtu.be/xxxxx\n[봄]\n다음 링크 https://www.youtube.com/watch?v=yyyyy"
                  spellCheck={false}
                />

                {hint ? (
                  <div className={`hintBar hint-${hint.type}`}>
                    {hint.type === "search" ? <Search size={15} /> : <Link2 size={15} />}
                    <span>{hint.message}</span>
                  </div>
                ) : null}
              </div>

              <div className="composerSide">
                <div className="miniCard">
                  <div className="miniCardTitle">구조 해석</div>
                  <div className="structureList">
                    <StructureLine label="링크" value={`${parseResult.entries.length}`} />
                    <StructureLine label="경고" value={parseResult.shouldWarn ? "있음" : "없음"} />
                    <StructureLine label="검색" value={parseResult.isSearchOnly ? "가능" : "아님"} />
                  </div>
                </div>

                <div className="miniCard">
                  <div className="miniCardTitle">폴더 자동완성</div>
                  <div className="folderSuggestionList">
                    {folderSuggestions.length ? folderSuggestions.map(name => (
                      <button key={name} className="folderSuggestion" type="button" onClick={() => setInputText(prev => `${prev}${prev.endsWith("\n") || !prev ? "" : "\n"}[${name}]\n`)}>
                        <FolderOpen size={14} />
                        {name}
                      </button>
                    )) : <div className="muted">출력 폴더 안의 하위 폴더를 자동으로 제안한다.</div>}
                  </div>
                </div>

                <div className="miniCard">
                  <div className="miniCardTitle">작업 설정</div>
                  <div className="stack">
                    <label className="field">
                      <span>형식</span>
                      <div className="segmented">
                        {(["video", "audio"] as MediaType[]).map(option => (
                          <button
                            key={option}
                            type="button"
                            className={mediaType === option ? "segmentedButton active" : "segmentedButton"}
                            onClick={() => setMediaType(option)}
                          >
                            {mediaLabel(option)}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="field">
                      <span>품질</span>
                      <select value={qualityPreset} onChange={e => setQualityPreset(e.target.value as QualityPreset)} className="select">
                        {qualityOptions.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>동시 다운로드</span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={maxConcurrentDownloads}
                        onChange={e => setMaxConcurrentDownloads(Number(e.target.value))}
                      />
                      <div className="fieldMeta">{maxConcurrentDownloads}개</div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="composerFooter">
              <div className="primaryActions">
                <button className="primaryButton" type="button" onClick={handleSubmit} disabled={!hasRunnable}>
                  <Play size={16} />
                  {isSearchMode ? "YouTube 검색" : "다운로드 시작"}
                </button>
                <button className="secondaryButton" type="button" onClick={handleAddOnly} disabled={!parseResult.entries.length}>
                  <Plus size={16} />
                  목록에 추가
                </button>
                <button className="secondaryButton" type="button" onClick={() => setInputText("")}>
                  <X size={16} />
                  지우기
                </button>
              </div>
              <div className="secondaryActions">
                <button className="ghostButton" type="button" onClick={handleSelectOutputDirectory}>
                  <FolderOpen size={14} />
                  폴더 변경
                </button>
                <button className="ghostButton" type="button" onClick={handleClearFinished}>
                  <Square size={14} />
                  완료 항목 정리
                </button>
              </div>
            </div>
          </section>

          <section className="splitGrid">
            <div className="panel queuePanel">
              <div className="panelHeader compact">
                <div>
                  <h2>큐</h2>
                  <p>{items.length} items · {queuedCount} queued</p>
                </div>
                <Chip tone="neutral">{activeCount} active</Chip>
              </div>

              <div className="itemList">
                {items.length ? items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedId === item.id ? "itemRow selected" : "itemRow"}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="itemRowTop">
                      <div className="itemTitle">{item.title || item.url}</div>
                      <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
                    </div>
                    <div className="itemSub">
                      <span>{mediaLabel(item.mediaType)}</span>
                      <span>{item.folderName || "root"}</span>
                      <span>{item.isAmbiguous ? "ambiguous" : "clear"}</span>
                    </div>
                    <div className="progressBar">
                      <div className="progressFill" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
                    </div>
                  </button>
                )) : <EmptyState title="대기열이 비어 있음" description="입력창에 링크를 넣으면 여기에 누적된다." icon={<ArrowDownToLine size={22} />} />}
              </div>
            </div>

            <div className="panel savedPanel">
              <div className="panelHeader compact">
                <div>
                  <h2>선택 항목</h2>
                  <p>진행률, 속도, ETA, 경로를 고정 위치에서 본다.</p>
                </div>
              </div>

              {selectedItem ? (
                <div className="detailView">
                  <div className="detailHero">
                    <div>
                      <div className="detailTitle">{selectedItem.title || selectedItem.url}</div>
                      <div className="detailMeta">
                        <span>{mediaLabel(selectedItem.mediaType)}</span>
                        <span>{selectedItem.folderName || "root"}</span>
                        <span>{selectedItem.qualityPreset}</span>
                      </div>
                    </div>
                    <Chip tone={statusTone(selectedItem.status)}>{statusLabel(selectedItem.status)}</Chip>
                  </div>

                  <div className="detailGrid">
                    <Metric label="Progress" value={`${selectedItem.progress.toFixed(1)}%`} />
                    <Metric label="Speed" value={selectedItem.speed || "—"} />
                    <Metric label="ETA" value={selectedItem.eta || "—"} />
                    <Metric label="Size" value={selectedItem.size || "—"} />
                  </div>

                  <div className="detailBlock">
                    <div className="detailBlockLabel">URL</div>
                    <div className="monoBlock">{selectedItem.url}</div>
                  </div>
                  <div className="detailBlock">
                    <div className="detailBlockLabel">Output</div>
                    <div className="monoBlock">{selectedItem.outputPath ? formatPath(selectedItem.outputPath) : formatPath(outputDirectory)}</div>
                  </div>
                  {selectedItem.error ? (
                    <div className="errorBox">{selectedItem.error}</div>
                  ) : null}

                  <div className="detailActions">
                    <button className="secondaryButton" type="button" onClick={() => handleCancel(selectedItem)}>
                      <Square size={16} />
                      {selectedItem.status === "queued" ? "제거" : "취소"}
                    </button>
                    <button className="ghostButton" type="button" onClick={() => vdropApi.revealItem(selectedItem.outputPath || outputDirectory)}>
                      <FolderOpen size={14} />
                      폴더 열기
                    </button>
                    {selectedItem.mediaType === "video" && selectedItem.status === "complete" ? (
                      <button className="ghostButton" type="button" onClick={() => vdropApi.openExternal(selectedItem.url)}>
                        <Link2 size={14} />
                        원문 열기
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState title="선택된 항목 없음" description="큐에서 항목을 선택하면 상세가 열린다." icon={<Link2 size={22} />} />
              )}
            </div>
          </section>
        </section>

        <aside className="sideRail">
          <section className="panel railPanel">
            <div className="panelHeader compact">
              <div>
                <h2>광고 슬롯</h2>
                <p>계약 버전과 슬롯 규칙을 따라 순환 표시한다.</p>
              </div>
              <Chip tone="neutral">{adPackage.version}</Chip>
            </div>

            {activeAd ? (
              <AdBanner
                ad={activeAd}
                slot={adPackage.slot}
                slotName={adPackage.slot?.name ?? "sidebar_primary"}
                onClick={async () => {
                  void trackAdEvent(adPackage.source, adPackage, activeAd, "click");
                  if (activeAd.click_url) {
                    await vdropApi.openExternal(activeAd.click_url);
                  }
                }}
              />
            ) : (
              <EmptyState title="광고 없음" description="현재 슬롯에 표시할 광고 패키지가 없다." icon={<Link2 size={22} />} />
            )}
          </section>

          <section className="panel railPanel">
            <div className="panelHeader compact">
              <div>
                <h2>상태</h2>
                <p>장비와 작업의 현재 상태를 보여준다.</p>
              </div>
            </div>

            <div className="statusStack">
              <StatusRow label="Output folder" value={formatPath(outputDirectory || "—")} />
              <StatusRow label="yt-dlp" value={bootstrap?.dlpPath ?? "not found"} />
              <StatusRow label="ffmpeg" value={bootstrap?.ffmpegPath ?? "not found"} />
              <StatusRow label="Search" value={searchRequest || "none"} />
            </div>
          </section>

          <section className="panel railPanel">
            <div className="panelHeader compact">
              <div>
                <h2>도구 설치</h2>
                <p>없으면 확인하고, 필요하면 바로 내려받는다.</p>
              </div>
            </div>

            <div className="statusStack">
              <DependencyRow
                label="yt-dlp"
                state={dependencyState["yt-dlp"]}
                onInstall={() => handleInstallDependency("yt-dlp")}
              />
              <DependencyRow
                label="ffmpeg"
                state={dependencyState.ffmpeg}
                onInstall={() => handleInstallDependency("ffmpeg")}
              />
            </div>
          </section>

          <section className="panel railPanel">
            <div className="panelHeader compact">
              <div>
                <h2>입력 규칙</h2>
                <p>Windows 버전도 이 규칙 그대로 유지한다.</p>
              </div>
            </div>

            <ul className="rulesList">
              <li>링크 앞뒤 텍스트를 파일명으로 읽는다.</li>
              <li><code>[폴더명]</code>, <code># 폴더명</code>, <code>@폴더명</code>은 단독 줄만 인정한다.</li>
              <li>Enter는 제출, Shift+Enter는 줄바꿈이다.</li>
              <li>URL이 없고 줄바꿈이 없으면 검색어 모드다.</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Chip({ tone, children }: { tone: "accent" | "success" | "danger" | "neutral"; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

function StructureLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="structureLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="statusRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DependencyRow({
  label,
  state,
  onInstall,
}: {
  label: string;
  state: DependencyState;
  onInstall: () => Promise<void>;
}) {
  const ready = state.status === "ready";
  const canInstall = state.status !== "installing";

  return (
    <div className="dependencyRow">
      <div className="dependencyTop">
        <div>
          <div className="dependencyLabel">{label}</div>
          <div className="dependencyPath">{state.path || state.message || "not found"}</div>
        </div>
        <Chip tone={ready ? "success" : state.status === "installing" ? "accent" : "danger"}>
          {ready ? "ready" : state.status === "installing" ? "installing" : state.status === "error" ? "error" : "missing"}
        </Chip>
      </div>

      <div className="dependencyProgress">
        <div className="dependencyFill" style={{ width: `${Math.max(0, Math.min(100, state.progress))}%` }} />
      </div>

      <div className="dependencyFooter">
        <span>{state.message || (ready ? "detected" : "pending")}</span>
        <button className="ghostButton" type="button" onClick={() => void onInstall()} disabled={!canInstall}>
          {ready ? "재설치" : "설치"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="emptyState">
      <div className="emptyIcon">{icon}</div>
      <div className="emptyTitle">{title}</div>
      <div className="emptyText">{description}</div>
    </div>
  );
}

function AdBanner({ ad, slot, slotName, onClick }: { ad: AdItem; slot: AdPackage["slot"]; slotName: string; onClick: () => Promise<void> }) {
  return (
    <button className="adBanner" type="button" onClick={onClick} aria-label={`${ad.name} 광고 열기`}>
      <div className="adBannerMeta">
        <span className="adSlotName">{slotName}</span>
        <span className="adType">{ad.display_type}</span>
      </div>
      <div className="adFrame" style={ad.display_type === "image" ? adSlotStyle(slot) : undefined}>
        {ad.display_type === "image" && ad.image_url ? (
          <img src={ad.image_url} alt={ad.name} className="adImage" />
        ) : null}
        {ad.display_type === "code" && ad.ad_code ? (
          <iframe
            title={ad.name}
            className="adCodeFrame"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            srcDoc={ad.ad_code}
          />
        ) : null}
      </div>
    </button>
  );
}
