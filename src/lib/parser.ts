const urlPattern = /((?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:music\.)?(?:youtube\.com\/(?:watch\?[^ \n]*v=[^\s]+|shorts\/[^\s]+|live\/[^\s]+|embed\/[^\s]+)|youtu\.be\/[^\s]+|youtube\.com\/[^\s]+))/gi;

export interface LinkEntry {
  url: string;
  fileBaseName: string;
  folderName: string;
  isAmbiguous: boolean;
}

export interface FolderDeclaration {
  name: string;
  lineIndex: number;
}

export interface InputAnnotation {
  number: number;
  lineIndex: number;
  url: string;
  title: string;
  isInvalid: boolean;
}

export interface ParseResult {
  entries: LinkEntry[];
  annotations: InputAnnotation[];
  folderDeclarations: FolderDeclaration[];
  shouldWarn: boolean;
  isSearchOnly: boolean;
}

export interface EditorHint {
  type: "empty" | "linkOnly" | "newline" | "folder" | "search";
  message: string;
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n");
}

function cleanName(value: string) {
  return value.replace(/[\/\\:*?"<>|]/g, "_").trim().slice(0, 80);
}

function stripKnownExtension(value: string) {
  const extensions = new Set(["mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "aac", "wav", "flac", "opus"]);
  const trimmed = value.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) {
    return trimmed;
  }

  const ext = trimmed.slice(lastDot + 1).toLowerCase();
  return extensions.has(ext) ? trimmed.slice(0, lastDot) : trimmed;
}

function displayName(fromDownloadedFileName: string) {
  const baseName = stripKnownExtension(fromDownloadedFileName);
  return baseName.replace(/\s+\[[^\[\]]+\]$/, "").trim();
}

function normalizeYoutubeUrl(rawUrl: string) {
  const value = rawUrl.trim();
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (host === "youtube.be") {
      url.hostname = "youtu.be";
    }
    if (host.endsWith("youtube.com") || host === "youtu.be") {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return null;
}

function isSupportedVideoUrl(url: string) {
  return Boolean(normalizeYoutubeUrl(url));
}

function folderDeclarationName(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("http://") || trimmed.includes("https://")) {
    return null;
  }

  if (/^\[\[.*\]\]$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (/^\[[^\[\]]+\]$/.test(trimmed)) {
    return trimmed.slice(1, -1).trim();
  }
  if (/^#+\s+.+$/.test(trimmed)) {
    return trimmed.replace(/^#+\s+/, "").trim();
  }
  if (/^@.+$/.test(trimmed)) {
    return trimmed.slice(1).trim();
  }
  return null;
}

function splitBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) {
    blocks.push(current);
  }
  return blocks;
}

function inferDirection(lines: string[]) {
  let prefix = 0;
  let suffix = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const index = trimmed.search(urlPattern);
    if (index > 0) {
      prefix += 1;
    }
    if (index >= 0) {
      const match = trimmed.match(urlPattern);
      if (match && trimmed.slice(index + match[0].length).trim()) {
        suffix += 1;
      }
    }
  }
  return prefix >= suffix ? "prefix" : "suffix";
}

function extractEntriesFromBlock(block: string[], folderName: string) {
  const entries: LinkEntry[] = [];
  let shouldWarn = false;
  const direction = inferDirection(block);

  for (const line of block) {
    const normalizedLine = line.replace(/\t/g, " ");
    const matches = [...normalizedLine.matchAll(urlPattern)];
    if (matches.length === 0) {
      continue;
    }

    for (const match of matches) {
      const raw = match[0];
      const normalized = normalizeYoutubeUrl(raw);
      if (!normalized) {
        shouldWarn = true;
        continue;
      }

      const before = normalizedLine.slice(0, match.index ?? 0).trim();
      const after = normalizedLine.slice((match.index ?? 0) + raw.length).trim();
      let selected = "";
      let ambiguous = false;

      if (before && after) {
        selected = cleanName(before);
        ambiguous = true;
      } else if (direction === "prefix") {
        if (before) {
          selected = cleanName(before);
        } else if (after) {
          selected = cleanName(after);
          ambiguous = true;
        }
      } else if (after) {
        selected = cleanName(after);
      }

      if (!selected) {
        ambiguous = true;
      }

      entries.push({
        url: normalized,
        fileBaseName: selected,
        folderName,
        isAmbiguous: ambiguous,
      });
      shouldWarn = shouldWarn || ambiguous;
    }
  }

  return { entries, shouldWarn };
}

function dedupeEntries(entries: LinkEntry[]) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = `${entry.url}\u001f${entry.fileBaseName}\u001f${entry.folderName}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function parseInput(text: string): ParseResult {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const entries: LinkEntry[] = [];
  const annotations: InputAnnotation[] = [];
  const folderDeclarations: FolderDeclaration[] = [];
  let folderName = "";
  let sawAnySupportedLink = false;
  let nextNumber = 1;

  const blocks: Array<{ lines: string[]; lineIndices: number[] }> = [];
  let currentLines: string[] = [];
  let currentIndices: number[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      if (currentLines.length) {
        blocks.push({ lines: currentLines, lineIndices: currentIndices });
        currentLines = [];
        currentIndices = [];
      }
      continue;
    }
    currentLines.push(line);
    currentIndices.push(lineIndex);
  }
  if (currentLines.length) {
    blocks.push({ lines: currentLines, lineIndices: currentIndices });
  }

  for (const block of blocks) {
    const parsedBlockLines: string[] = [];
    const parsedBlockIndices: number[] = [];

    block.lines.forEach((line, index) => {
      const declaration = folderDeclarationName(line);
      if (declaration) {
        folderName = declaration;
        folderDeclarations.push({ name: declaration, lineIndex: block.lineIndices[index] });
        return;
      }
      parsedBlockLines.push(line);
      parsedBlockIndices.push(block.lineIndices[index]);
    });

    const parsed = extractEntriesFromBlock(parsedBlockLines, folderName);
    entries.push(...parsed.entries);
    sawAnySupportedLink = sawAnySupportedLink || parsed.entries.length > 0 || parsed.shouldWarn;

    parsedBlockLines.forEach((line, index) => {
      const matches = [...line.matchAll(urlPattern)];
      for (const match of matches) {
        const normalized = normalizeYoutubeUrl(match[0]);
        annotations.push({
          number: nextNumber++,
          lineIndex: parsedBlockIndices[index],
          url: normalized ?? match[0],
          title: cleanName(line.slice(0, match.index ?? 0).trim() || line.slice((match.index ?? 0) + match[0].length).trim()),
          isInvalid: !normalized,
        });
      }
    });
  }

  const uniqueEntries = dedupeEntries(entries);
  return {
    entries: uniqueEntries,
    annotations,
    folderDeclarations,
    shouldWarn: sawAnySupportedLink && uniqueEntries.length === 0,
    isSearchOnly: uniqueEntries.length === 0 && !sawAnySupportedLink,
  };
}

export function deriveHint(text: string, emptyCycleStep: number): EditorHint | null {
  const trimmed = text.trim();
  if (!trimmed) {
    if (emptyCycleStep === 1) {
      return { type: "empty", message: "youtu.be/링크 입력하면 다운로드" };
    }
    if (emptyCycleStep === 2) {
      return { type: "empty", message: "vdrop: 검색어 또는 링크로 빠른 입력" };
    }
    return { type: "empty", message: "글자만 입력하면 YouTube 검색" };
  }

  const parsed = parseInput(text);
  const hasNewline = text.includes("\n");
  if (!parsed.folderDeclarations.length && parsed.entries.length === 1 && parsed.annotations.length === 1) {
    if (!parsed.annotations[0].title && !hasNewline) {
      return { type: "linkOnly", message: "파일명을 함께 입력할 수 있음" };
    }
    if (!hasNewline) {
      return { type: "newline", message: "Shift+Enter로 줄바꿈" };
    }
    return { type: "folder", message: "# 폴더명 입력하면 아래 항목부터 폴더에 저장" };
  }

  if (parsed.isSearchOnly && !hasNewline) {
    return { type: "search", message: "검색어 모드" };
  }

  return null;
}

export function makeDisplayTitle(entry: LinkEntry) {
  if (entry.fileBaseName) {
    return entry.fileBaseName;
  }
  return displayName(entry.url);
}
