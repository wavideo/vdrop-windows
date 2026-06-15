import type { CSSProperties } from "react";

export interface AdPackage {
  schema_version: string;
  package_type: string;
  package_id: string;
  entry_slot_id: string;
  generated_at: string;
  version: string;
  latest_updated_at: string;
  supported_platforms: string[];
  roll_interval_ms: number;
  source: Source;
  slot: Slot | null;
  ads: AdItem[];
}

export interface AdPackageManifest {
  version: string;
  latest_updated_at: string;
  active_count: number;
}

export interface Slot {
  slot_id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  roll_interval_ms: number;
  enabled: boolean;
  notes?: string | null;
}

export interface AdItem {
  id: string;
  name: string;
  slot_id: string;
  display_type: "image" | "code";
  image_url?: string | null;
  click_url?: string | null;
  ad_code?: string | null;
  weight: number;
  enabled: boolean;
  impression_count: number;
  click_count: number;
  created_at: string;
  updated_at: string;
}

export interface Source {
  dashboard_url: string;
  ads_json_url: string;
  track_url: string;
}

export interface AdTrackPayload {
  event: "impression" | "click";
  package_id: string;
  package_version: string;
  ad_id: string;
  slot_id: string;
  display_type: AdItem["display_type"];
}

const defaultAdsJsonUrl = "https://qgywdcbudszoymprzhmy.supabase.co/functions/v1/ads-json";
const cachePrefix = "vdrop.ads.package.";

const svgBanner = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="240" viewBox="0 0 1080 240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2d6cdf"/>
      <stop offset="100%" stop-color="#163a86"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="240" rx="28" fill="url(#g)"/>
  <circle cx="858" cy="88" r="132" fill="rgba(255,255,255,0.10)"/>
  <circle cx="942" cy="178" r="82" fill="rgba(255,255,255,0.08)"/>
  <text x="54" y="88" fill="white" font-size="32" font-family="Segoe UI, Arial" font-weight="700">vDrop Windows</text>
  <text x="54" y="126" fill="rgba(255,255,255,0.88)" font-size="18" font-family="Segoe UI, Arial">Clean Windows batch downloader</text>
  <text x="54" y="164" fill="rgba(255,255,255,0.84)" font-size="16" font-family="Segoe UI, Arial">Structured input, queue control, and polished Fluent-style surfaces.</text>
</svg>
`);

export const defaultAdPackage: AdPackage = {
  schema_version: "1.0.0",
  package_type: "sidebar_banner",
  package_id: "vdrop-windows-default",
  entry_slot_id: "sidebar_primary",
  generated_at: "2026-06-16T00:00:00Z",
  version: "1.0.0",
  latest_updated_at: "2026-06-16T00:00:00Z",
  supported_platforms: ["windows"],
  roll_interval_ms: 4500,
  source: {
    dashboard_url: "https://qgywdcbudszoymprzhmy.supabase.co/functions/v1/ads-admin",
    ads_json_url: defaultAdsJsonUrl,
    track_url: defaultAdsJsonUrl,
  },
  slot: {
    slot_id: "sidebar_primary",
    name: "Sidebar Banner",
    canvas_width: 1080,
    canvas_height: 240,
    roll_interval_ms: 4500,
    enabled: true,
    notes: "Windows render rules: image stretch fill, code in sandboxed frame.",
  },
  ads: [
    {
      id: "ad-image-01",
      name: "vDrop Windows Intro",
      slot_id: "sidebar_primary",
      display_type: "image",
      image_url: `data:image/svg+xml;charset=UTF-8,${svgBanner}`,
      click_url: "https://example.com",
      weight: 60,
      enabled: true,
      impression_count: 0,
      click_count: 0,
      created_at: "2026-06-16T00:00:00Z",
      updated_at: "2026-06-16T00:00:00Z",
    },
    {
      id: "ad-code-01",
      name: "Support Message",
      slot_id: "sidebar_primary",
      display_type: "code",
      ad_code: `
        <div style="font-family: Segoe UI, Arial, sans-serif; width: 100%; height: 100%; box-sizing: border-box; padding: 18px 20px; color: #fff; background: linear-gradient(135deg, #0f172a, #1e3a8a); border-radius: 22px;">
          <div style="font-size: 13px; letter-spacing: .08em; text-transform: uppercase; opacity: .82;">Ad Slot</div>
          <div style="margin-top: 10px; font-size: 23px; font-weight: 700;">Sponsor / Support</div>
          <div style="margin-top: 8px; font-size: 15px; line-height: 1.5; opacity: .92;">HTML code creatives can render inline without leaving the app shell.</div>
          <div style="margin-top: 16px; display: inline-flex; gap: 8px; align-items: center; padding: 9px 13px; background: rgba(255,255,255,.14); border-radius: 999px; font-size: 13px;">Click-through support ready</div>
        </div>
      `,
      weight: 40,
      enabled: true,
      impression_count: 0,
      click_count: 0,
      created_at: "2026-06-16T00:00:00Z",
      updated_at: "2026-06-16T00:00:00Z",
    },
  ],
};

function storageKey(sourceUrl: string) {
  return `${cachePrefix}${encodeURIComponent(sourceUrl)}`;
}

function isBrowserStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadCachedAdPackage(sourceUrl: string): AdPackage | null {
  if (!isBrowserStorageAvailable()) {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey(sourceUrl));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AdPackage;
  } catch {
    return null;
  }
}

export function saveCachedAdPackage(sourceUrl: string, value: AdPackage) {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(storageKey(sourceUrl), JSON.stringify(value));
}

function isRemoteUrlSupported(value: string) {
  return value.startsWith("https://") || value.startsWith("http://") || value.startsWith("file://");
}

function resolveRemoteUrl(value?: string | null) {
  const candidate = value?.trim() || defaultAdsJsonUrl;
  return isRemoteUrlSupported(candidate) ? candidate : defaultAdsJsonUrl;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function normalizeAdItem(item: Partial<AdItem>, fallbackSlotId: string): AdItem {
  return {
    id: item.id ?? crypto.randomUUID(),
    name: item.name ?? "Ad",
    slot_id: item.slot_id ?? fallbackSlotId,
    display_type: item.display_type === "code" ? "code" : "image",
    image_url: item.image_url ?? null,
    click_url: item.click_url ?? null,
    ad_code: item.ad_code ?? null,
    weight: Number.isFinite(item.weight) ? Number(item.weight) : 1,
    enabled: item.enabled ?? true,
    impression_count: Number.isFinite(item.impression_count) ? Number(item.impression_count) : 0,
    click_count: Number.isFinite(item.click_count) ? Number(item.click_count) : 0,
    created_at: item.created_at ?? new Date().toISOString(),
    updated_at: item.updated_at ?? new Date().toISOString(),
  };
}

function buildRemotePackage(adsJsonUrl: string, manifest: AdPackageManifest | null, raw: unknown): AdPackage {
  const slot: Slot = {
    slot_id: "sidebar_primary",
    name: "Sidebar Banner",
    canvas_width: 1080,
    canvas_height: 240,
    roll_interval_ms: 4500,
    enabled: true,
    notes: "Remote inventory loaded from ads-json and adapted to the Windows contract.",
  };
  const source: Source = {
    dashboard_url: "https://qgywdcbudszoymprzhmy.supabase.co/functions/v1/ads-admin",
    ads_json_url: adsJsonUrl,
    track_url: adsJsonUrl,
  };

  if (raw && typeof raw === "object" && !Array.isArray(raw) && "ads" in raw) {
    const candidate = raw as Partial<AdPackage>;
    return {
      schema_version: candidate.schema_version ?? "1.0.0",
      package_type: candidate.package_type ?? "sidebar_banner",
      package_id: candidate.package_id ?? "vdrop-windows-remote",
      entry_slot_id: candidate.entry_slot_id ?? slot.slot_id,
      generated_at: candidate.generated_at ?? manifest?.latest_updated_at ?? new Date().toISOString(),
      version: candidate.version ?? manifest?.version ?? new Date().toISOString(),
      latest_updated_at: candidate.latest_updated_at ?? manifest?.latest_updated_at ?? new Date().toISOString(),
      supported_platforms: candidate.supported_platforms ?? ["windows"],
      roll_interval_ms: candidate.roll_interval_ms ?? slot.roll_interval_ms,
      source: candidate.source ?? source,
      slot: candidate.slot ?? slot,
      ads: (candidate.ads ?? []).map(ad => normalizeAdItem(ad, slot.slot_id)),
    };
  }

  const arrayAds = Array.isArray(raw) ? raw : [];
  return {
    schema_version: "1.0.0",
    package_type: "sidebar_banner",
    package_id: "vdrop-windows-remote",
    entry_slot_id: slot.slot_id,
    generated_at: manifest?.latest_updated_at ?? new Date().toISOString(),
    version: manifest?.version ?? new Date().toISOString(),
    latest_updated_at: manifest?.latest_updated_at ?? new Date().toISOString(),
    supported_platforms: ["windows"],
    roll_interval_ms: slot.roll_interval_ms,
    source,
    slot,
    ads: arrayAds.map(ad => normalizeAdItem(ad as Partial<AdItem>, slot.slot_id)),
  };
}

export async function loadRemoteAdPackage(remoteUrl?: string | null) {
  const adsJsonUrl = resolveRemoteUrl(remoteUrl);
  const cached = loadCachedAdPackage(adsJsonUrl);
  let manifest: AdPackageManifest | null = null;

  try {
    manifest = await fetchJson<AdPackageManifest>(`${adsJsonUrl}?manifest=1`);
    if (cached && cached.version === manifest.version) {
      return cached;
    }
  } catch {
    if (cached) {
      return cached;
    }
    return defaultAdPackage;
  }

  try {
    const raw = await fetchJson<unknown>(adsJsonUrl);
    const remotePackage = buildRemotePackage(adsJsonUrl, manifest, raw);
    saveCachedAdPackage(adsJsonUrl, remotePackage);
    return remotePackage;
  } catch {
    return cached ?? defaultAdPackage;
  }
}

export function resolveAdPackage(remotePackage?: AdPackage | null) {
  const candidate = remotePackage ?? defaultAdPackage;
  const cached = loadCachedAdPackage(candidate.source.ads_json_url);
  if (cached && cached.version === candidate.version) {
    return cached;
  }

  saveCachedAdPackage(candidate.source.ads_json_url, candidate);
  return candidate;
}

export async function trackAdEvent(source: Source, packageInfo: AdPackage, ad: AdItem, event: AdTrackPayload["event"]) {
  const payload = new URLSearchParams({
    event,
    package_id: packageInfo.package_id,
    package_version: packageInfo.version,
    ad_id: ad.id,
    slot_id: ad.slot_id,
    display_type: ad.display_type,
  });

  const url = `${source.track_url}${source.track_url.includes("?") ? "&" : "?"}${payload.toString()}`;
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const body = new Blob([payload.toString()], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
    navigator.sendBeacon(url, body);
    return;
  }

  await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(() => null);
}

export function adSlotStyle(slot: Slot | null): CSSProperties {
  const width = slot?.canvas_width ?? 1080;
  const height = slot?.canvas_height ?? 240;
  return {
    aspectRatio: `${width} / ${height}`,
  };
}
