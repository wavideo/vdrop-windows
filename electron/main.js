import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const activeJobs = new Map();
const lineBuffers = new Map();

const toolRootName = "vdrop-tools";
const ytDlpInstallUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const ffmpegInstallUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

function resolveExecutable(names, candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  const shellCmd = process.platform === "win32" ? "where" : "which";
  for (const name of names) {
    const result = spawnSync(shellCmd, [name], { encoding: "utf8" });
    if (result.status === 0) {
      const resolved = result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function homeDownloads() {
  return path.join(os.homedir(), "Downloads", "vDrop");
}

function toolRoot() {
  return path.join(app.getPath("userData"), toolRootName);
}

function ytDlpToolPath() {
  return path.join(toolRoot(), "yt-dlp", "yt-dlp.exe");
}

function ffmpegToolPath() {
  return path.join(toolRoot(), "ffmpeg", "current", "bin", "ffmpeg.exe");
}

function ffprobeToolPath() {
  return path.join(toolRoot(), "ffmpeg", "current", "bin", "ffprobe.exe");
}

function bootstrapState() {
  const dlpPath = resolveExecutable(
    ["yt-dlp", "yt-dlp.exe"],
    [
      process.env.VDROP_YTDLP_PATH,
      ytDlpToolPath(),
      "C:\\Program Files\\yt-dlp\\yt-dlp.exe",
      "C:\\Program Files (x86)\\yt-dlp\\yt-dlp.exe",
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "yt-dlp", "yt-dlp.exe"),
    ],
  );

  const ffmpegPath = resolveExecutable(
    ["ffmpeg", "ffmpeg.exe"],
    [
      process.env.VDROP_FFMPEG_PATH,
      ffmpegToolPath(),
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
    ],
  );

  return {
    outputDirectory: homeDownloads(),
    dlpPath,
    ffmpegPath,
    appVersion: app.getVersion(),
    platform: process.platform,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#eef2f7",
    title: "vDrop Windows",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  return win;
}

function sendJobEvent(jobId, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("vdrop:download-event", { jobId, ...payload });
    }
  }
}

function sendInstallEvent(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("vdrop:install-event", payload);
    }
  }
}

function normalizeLine(line) {
  return line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").trimEnd();
}

function parseProgressLine(line) {
  const clean = normalizeLine(line);
  const templateIndex = clean.indexOf("AIW_PROGRESS|");
  if (templateIndex >= 0) {
    const parts = clean.slice(templateIndex).split("|");
    if (parts.length >= 5) {
      return {
        type: "progress",
        percentage: Number.parseFloat(parts[1]) || 0,
        size: parts[2] === "NA" ? "" : parts[2],
        speed: parts[3] === "NA" ? "" : parts[3],
        eta: parts[4] === "NA" ? "" : parts[4],
      };
    }
  }

  const percentMatch = clean.match(/\[download\]\s+([\d.]+)%/);
  if (percentMatch) {
    return {
      type: "progress",
      percentage: Number.parseFloat(percentMatch[1]) || 0,
      size: (clean.match(/\sof\s+~?\s*(.+?)(?:\s+at\s+|\s+ETA\s+|$)/) ?? [])[1] ?? "",
      speed: (clean.match(/\sat\s+(.+?)\s+ETA\s+/) ?? [])[1] ?? "",
      eta: (clean.match(/\sETA\s+([^\s)]+)/) ?? [])[1] ?? "",
    };
  }

  return null;
}

function downloadArgs(payload) {
  const outputRoot = payload.outputDirectory || homeDownloads();
  const safeBase = payload.fileBaseName ? `${payload.fileBaseName}` : "%(title)s";
  const outputTemplate = payload.folderName
    ? path.join(outputRoot, payload.folderName, `${safeBase}.%(ext)s`)
    : path.join(outputRoot, `${safeBase}.%(ext)s`);

  const common = [
    "--newline",
    "--no-playlist",
    "--windows-filenames",
    "--restrict-filenames",
    "--progress-template",
    "download:AIW_PROGRESS|%(progress._percent_str)s|%(progress._eta_str)s|%(progress._speed_str)s|%(progress._percent_str)s",
    "-o",
    outputTemplate,
    payload.url,
  ];

  if (payload.mediaType === "audio") {
    return [
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      ...common,
    ];
  }

  const formatMap = {
    best: "bv*+ba/b",
    compatibleBest: "bv*[vcodec~='^(avc1|h264|hvc1|hev1)$']+ba/b[ext=mp4]/b",
    p2160: "bv*[height<=2160]+ba/b[height<=2160]/b",
    p1440: "bv*[height<=1440]+ba/b[height<=1440]/b",
    p1080: "bv*[height<=1080]+ba/b[height<=1080]/b",
    p720: "bv*[height<=720]+ba/b[height<=720]/b",
    p480: "bv*[height<=480]+ba/b[height<=480]/b",
  };

  return [
    "--merge-output-format",
    "mp4",
    "-f",
    formatMap[payload.qualityPreset] ?? formatMap.best,
    ...common,
  ];
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function downloadFile(url, filePath, progressMeta) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status}`);
  }

  await ensureDir(path.dirname(filePath));
  const total = Number.parseInt(response.headers.get("content-length") || "0", 10) || 0;
  const reader = response.body.getReader();
  const stream = createWriteStream(filePath);
  const pump = async () => {
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      received += value.byteLength;
      stream.write(Buffer.from(value));
      if (progressMeta) {
        progressMeta.onProgress?.(received, total);
      }
    }
    await new Promise((resolve, reject) => {
      stream.end(err => (err ? reject(err) : resolve()));
    });
  };

  try {
    await pump();
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

async function extractZipWithPowerShell(zipPath, outputDir) {
  const command = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -Path '${zipPath.replaceAll("'", "''")}' -DestinationPath '${outputDir.replaceAll("'", "''")}' -Force`,
  ];

  const result = spawnSync("powershell.exe", command, {
    windowsHide: true,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ffmpeg extraction failed");
  }
}

async function installYtDlp() {
  if (process.platform !== "win32") {
    throw new Error("Windows only");
  }

  const targetPath = ytDlpToolPath();
  const targetDir = path.dirname(targetPath);
  await ensureDir(targetDir);
  const tempPath = path.join(targetDir, "yt-dlp.tmp.exe");
  sendInstallEvent({ kind: "install-progress", target: "yt-dlp", stage: "download", percentage: 0, message: "downloading" });
  await downloadFile(ytDlpInstallUrl, tempPath, {
    onProgress(received, total) {
      sendInstallEvent({
        kind: "install-progress",
        target: "yt-dlp",
        stage: "download",
        percentage: total ? Math.min(99, Math.round((received / total) * 100)) : 0,
        message: "downloading",
      });
    },
  });
  await rm(targetPath, { force: true });
  await rename(tempPath, targetPath);
  sendInstallEvent({ kind: "install-progress", target: "yt-dlp", stage: "complete", percentage: 100, message: targetPath });
  return targetPath;
}

async function installFfmpeg() {
  if (process.platform !== "win32") {
    throw new Error("Windows only");
  }

  const installDir = path.join(toolRoot(), "ffmpeg");
  const currentDir = path.join(installDir, "current");
  const cacheDir = path.join(installDir, "cache");
  const extractDir = path.join(installDir, `extract-${Date.now()}`);
  await ensureDir(cacheDir);
  await ensureDir(installDir);

  const zipPath = path.join(cacheDir, "ffmpeg-release.zip");
  sendInstallEvent({ kind: "install-progress", target: "ffmpeg", stage: "download", percentage: 0, message: "downloading" });
  await downloadFile(ffmpegInstallUrl, zipPath, {
    onProgress(received, total) {
      sendInstallEvent({
        kind: "install-progress",
        target: "ffmpeg",
        stage: "download",
        percentage: total ? Math.min(95, Math.round((received / total) * 100)) : 0,
        message: "downloading",
      });
    },
  });

  sendInstallEvent({ kind: "install-progress", target: "ffmpeg", stage: "extract", percentage: 96, message: "extracting" });
  await ensureDir(extractDir);
  await extractZipWithPowerShell(zipPath, extractDir);

  const extractedEntries = readdirSync(extractDir, { withFileTypes: true }).filter(entry => entry.isDirectory());
  const rootFolder = extractedEntries[0]?.name;
  if (!rootFolder) {
    throw new Error("ffmpeg archive layout not found");
  }

  await rm(currentDir, { recursive: true, force: true });
  await rename(path.join(extractDir, rootFolder), currentDir);
  await rm(extractDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });

  const ffmpegPath = ffmpegToolPath();
  if (!existsSync(ffmpegPath) || !existsSync(ffprobeToolPath())) {
    throw new Error("ffmpeg install incomplete");
  }

  sendInstallEvent({ kind: "install-progress", target: "ffmpeg", stage: "complete", percentage: 100, message: ffmpegPath });
  return ffmpegPath;
}

async function installDependency(kind) {
  if (kind === "yt-dlp") {
    return installYtDlp();
  }

  if (kind === "ffmpeg") {
    return installFfmpeg();
  }

  throw new Error(`unknown dependency: ${kind}`);
}

function startDownload(payload) {
  const jobId = payload.jobId ?? crypto.randomUUID();
  const dlpPath = bootstrapState().dlpPath;
  if (!dlpPath) {
    throw new Error("yt-dlp not found");
  }

  const child = spawn(dlpPath, downloadArgs(payload), {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
    },
  });

  activeJobs.set(jobId, child);
  lineBuffers.set(jobId, "");

  const emitLine = (source, chunk) => {
    const previous = lineBuffers.get(jobId) ?? "";
    const buffer = previous + chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    lineBuffers.set(jobId, lines.pop() ?? "");

    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      if (!line) {
        continue;
      }

      const progress = parseProgressLine(line);
      if (progress) {
        sendJobEvent(jobId, { kind: "progress", line, ...progress });
        continue;
      }

      if (line.includes("[Merger]") || line.includes("[ffmpeg]") || line.includes("Merging formats")) {
        sendJobEvent(jobId, { kind: "phase", phase: "merging", line });
        continue;
      }

      if (line.startsWith("[download] Destination:")) {
        const destination = line.split(":").slice(1).join(":").trim();
        sendJobEvent(jobId, { kind: "destination", line, destination });
        continue;
      }

      sendJobEvent(jobId, { kind: source, line });
    }
  };

  child.stdout.on("data", chunk => emitLine("stdout", chunk));
  child.stderr.on("data", chunk => emitLine("stderr", chunk));
  child.on("error", error => {
    activeJobs.delete(jobId);
    sendJobEvent(jobId, { kind: "error", message: error.message });
  });
  child.on("close", code => {
    const remainder = lineBuffers.get(jobId) ?? "";
    if (remainder.trim()) {
      const line = normalizeLine(remainder);
      sendJobEvent(jobId, { kind: "stderr", line });
    }
    activeJobs.delete(jobId);
    lineBuffers.delete(jobId);
    if (code === 0) {
      sendJobEvent(jobId, { kind: "complete", exitCode: 0, outputPath: payload.outputPath ?? "" });
    } else {
      sendJobEvent(jobId, { kind: "failed", exitCode: code ?? -1, message: `yt-dlp exited with ${code}` });
    }
  });

  return { jobId };
}

ipcMain.handle("vdrop:get-bootstrap", () => bootstrapState());

ipcMain.handle("vdrop:select-output-directory", async (_event, currentPath) => {
  const result = await dialog.showOpenDialog({
    title: "다운로드 폴더 선택",
    defaultPath: currentPath || homeDownloads(),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("vdrop:list-folders", async (_event, dirPath) => {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  } catch {
    return [];
  }
});

ipcMain.handle("vdrop:open-external", async (_event, url) => {
  if (!url) {
    return false;
  }
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("vdrop:reveal-item", async (_event, itemPath) => {
  if (!itemPath) {
    return false;
  }
  shell.showItemInFolder(itemPath);
  return true;
});

ipcMain.handle("vdrop:start-download", async (_event, payload) => startDownload(payload));

ipcMain.handle("vdrop:install-dependency", async (_event, target) => {
  try {
    const installedPath = await installDependency(target);
    return { target, path: installedPath };
  } catch (error) {
    sendInstallEvent({
      kind: "install-error",
      target,
      stage: "error",
      percentage: 0,
      message: error instanceof Error ? error.message : "install failed",
    });
    throw error;
  }
});

ipcMain.handle("vdrop:cancel-download", async (_event, jobId) => {
  const child = activeJobs.get(jobId);
  if (!child) {
    return false;
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 1000);
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
