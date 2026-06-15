export interface AppBootstrap {
  outputDirectory: string;
  dlpPath: string | null;
  ffmpegPath: string | null;
  appVersion: string;
  platform: string;
}

export type MediaType = "video" | "audio";
export type QualityPreset = "best" | "compatibleBest" | "p2160" | "p1440" | "p1080" | "p720" | "p480";

export interface DownloadRequest {
  jobId: string;
  url: string;
  mediaType: MediaType;
  qualityPreset: QualityPreset;
  fileBaseName: string;
  folderName: string;
  outputDirectory: string;
}

export type InstallTarget = "yt-dlp" | "ffmpeg";

export interface InstallEvent {
  kind: "install-progress" | "install-complete" | "install-error";
  target: InstallTarget;
  stage: "download" | "extract" | "verify" | "complete" | "error";
  percentage: number;
  message: string;
  path?: string;
}

export type DownloadEvent =
  | { jobId: string; kind: "progress"; line: string; percentage: number; size: string; speed: string; eta: string }
  | { jobId: string; kind: "phase"; phase: "merging"; line: string }
  | { jobId: string; kind: "destination"; line: string; destination: string }
  | { jobId: string; kind: "stdout" | "stderr"; line: string }
  | { jobId: string; kind: "complete"; exitCode: number; outputPath: string }
  | { jobId: string; kind: "failed"; exitCode: number; message: string }
  | { jobId: string; kind: "error"; message: string };

interface VDropApi {
  getBootstrap: () => Promise<AppBootstrap>;
  selectOutputDirectory: (currentPath: string) => Promise<string | null>;
  listFolders: (dirPath: string) => Promise<string[]>;
  openExternal: (url: string) => Promise<boolean>;
  revealItem: (itemPath: string) => Promise<boolean>;
  startDownload: (payload: DownloadRequest) => Promise<{ jobId: string }>;
  cancelDownload: (jobId: string) => Promise<boolean>;
  onDownloadEvent: (callback: (event: DownloadEvent) => void) => () => void;
  installDependency: (target: InstallTarget) => Promise<{ target: InstallTarget; path: string }>;
  onInstallEvent: (callback: (event: InstallEvent) => void) => () => void;
}

function createBrowserMock(): VDropApi {
  const listeners = new Set<(event: DownloadEvent) => void>();
  const installListeners = new Set<(event: InstallEvent) => void>();
  const emit = (event: DownloadEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    async getBootstrap() {
      return {
        outputDirectory: "/Users/Shared/vDrop",
        dlpPath: "/usr/local/bin/yt-dlp",
        ffmpegPath: "/usr/local/bin/ffmpeg",
        appVersion: "dev",
        platform: "browser",
      };
    },
    async selectOutputDirectory() {
      return null;
    },
    async listFolders() {
      return ["봄", "여름", "가을", "겨울"];
    },
    async openExternal() {
      return true;
    },
    async revealItem() {
      return true;
    },
    async startDownload(payload) {
      const jobId = payload.jobId;
      emit({
        jobId,
        kind: "stdout",
        line: `[download] Destination: ${payload.outputDirectory}/${payload.fileBaseName || "sample"}.mp4`,
      });

      let progress = 0;
      const timer = window.setInterval(() => {
        progress += 11 + Math.random() * 16;
        if (progress >= 100) {
          window.clearInterval(timer);
          emit({ jobId, kind: "progress", line: "[download] 100%", percentage: 100, size: "52.4MiB", speed: "7.2MiB/s", eta: "00:00" });
          emit({ jobId, kind: "complete", exitCode: 0, outputPath: `${payload.outputDirectory}/${payload.fileBaseName || "sample"}.mp4` });
          return;
        }

        emit({
          jobId,
          kind: "progress",
          line: `[download] ${progress.toFixed(1)}%`,
          percentage: progress,
          size: `${(52.4 - progress * 0.3).toFixed(1)}MiB`,
          speed: "6.9MiB/s",
          eta: "00:12",
        });
      }, 420);

      return { jobId };
    },
    async cancelDownload(jobId) {
      emit({ jobId, kind: "failed", exitCode: 0, message: "canceled in browser mock" });
      return true;
    },
    onDownloadEvent(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async installDependency(target) {
      const pathValue = target === "yt-dlp" ? "/usr/local/bin/yt-dlp" : "/usr/local/bin/ffmpeg";
      installListeners.forEach(listener => listener({
        kind: "install-progress",
        target,
        stage: "download",
        percentage: 10,
        message: "browser mock",
      }));
      installListeners.forEach(listener => listener({
        kind: "install-progress",
        target,
        stage: "extract",
        percentage: 70,
        message: "browser mock",
      }));
      installListeners.forEach(listener => listener({
        kind: "install-complete",
        target,
        stage: "complete",
        percentage: 100,
        message: pathValue,
        path: pathValue,
      }));
      return { target, path: pathValue };
    },
    onInstallEvent(callback) {
      installListeners.add(callback);
      return () => installListeners.delete(callback);
    },
  };
}

export const vdropApi: VDropApi =
  typeof window !== "undefined" && typeof window.vdrop !== "undefined"
    ? window.vdrop
    : createBrowserMock();
