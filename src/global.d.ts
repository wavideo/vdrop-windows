export {};

declare global {
  interface Window {
    vdrop: {
      getBootstrap: () => Promise<{
        outputDirectory: string;
        dlpPath: string | null;
        ffmpegPath: string | null;
        appVersion: string;
        platform: string;
      }>;
      selectOutputDirectory: (currentPath: string) => Promise<string | null>;
      listFolders: (dirPath: string) => Promise<string[]>;
      openExternal: (url: string) => Promise<boolean>;
      revealItem: (itemPath: string) => Promise<boolean>;
      startDownload: (payload: DownloadRequest) => Promise<{ jobId: string }>;
      cancelDownload: (jobId: string) => Promise<boolean>;
      installDependency: (target: InstallTarget) => Promise<{ target: InstallTarget; path: string }>;
      onDownloadEvent: (callback: (event: DownloadEvent) => void) => () => void;
      onInstallEvent: (callback: (event: InstallEvent) => void) => () => void;
    };
  }

  type MediaType = "video" | "audio";
  type QualityPreset = "best" | "compatibleBest" | "p2160" | "p1440" | "p1080" | "p720" | "p480";
  type InstallTarget = "yt-dlp" | "ffmpeg";

  interface DownloadRequest {
    jobId: string;
    url: string;
    mediaType: MediaType;
    qualityPreset: QualityPreset;
    fileBaseName: string;
    folderName: string;
    outputDirectory: string;
  }

  type DownloadEvent =
    | { jobId: string; kind: "progress"; line: string; percentage: number; size: string; speed: string; eta: string }
    | { jobId: string; kind: "phase"; phase: "merging"; line: string }
    | { jobId: string; kind: "destination"; line: string; destination: string }
    | { jobId: string; kind: "stdout" | "stderr"; line: string }
    | { jobId: string; kind: "complete"; exitCode: number; outputPath: string }
    | { jobId: string; kind: "failed"; exitCode: number; message: string }
    | { jobId: string; kind: "error"; message: string };

  type InstallEvent = {
    kind: "install-progress" | "install-complete" | "install-error";
    target: InstallTarget;
    stage: "download" | "extract" | "verify" | "complete" | "error";
    percentage: number;
    message: string;
    path?: string;
  };
}
