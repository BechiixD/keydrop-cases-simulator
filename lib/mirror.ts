import fs from "node:fs/promises";
import path from "node:path";
import { readCache, writeCache } from "./scraper/cache";

export interface MirrorResult {
  total: number;
  skipped: number;
  downloaded: number;
  failed: number;
  failedUrls: string[];
}

const IMG_ROOT = path.resolve(process.cwd(), "public/img");
const CASES_DIR = path.join(IMG_ROOT, "cases");
const SKINS_DIR = path.join(IMG_ROOT, "skins");
const MANIFEST_PATH = path.join(IMG_ROOT, "manifest.json");

const LOCAL_PREFIX = "/img/";

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    const m = base.match(/\.(png|jpe?g|webp|gif|svg)(?:\?|$)/i);
    if (m) return `.${m[1].toLowerCase()}`;
  } catch {
    /* not a valid URL */
  }
  try {
    const m = url.match(/\.(png|jpe?g|webp|gif|svg)(?:\?|$)/i);
    if (m) return `.${m[1].toLowerCase()}`;
  } catch {
    /* noop */
  }
  return ".png";
}

function isRemote(url: string): boolean {
  return !url.startsWith(LOCAL_PREFIX) && !url.startsWith("data:");
}

function isLocal(url: string): boolean {
  return url.startsWith(LOCAL_PREFIX);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(
  url: string,
  dest: string,
): Promise<{ bytes: number; ext: string }> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; keydrop-sim-mirror/1.0; +https://github.com)",
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = resp.headers.get("content-type") ?? "";
  let ext = extFromUrl(url);
  if (ct.includes("jpeg") || ct.includes("jpg")) ext = ".jpg";
  else if (ct.includes("webp")) ext = ".webp";
  else if (ct.includes("gif")) ext = ".gif";
  else if (ct.includes("svg")) ext = ".svg";
  if (!dest.endsWith(ext)) {
    const dir = path.dirname(dest);
    const base = path.basename(dest, path.extname(dest));
    dest = path.join(dir, `${base}${ext}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return { bytes: buf.length, ext };
}

async function mirrorOne(
  url: string,
  localDir: string,
  localName: string,
  result: MirrorResult,
): Promise<{ localUrl: string } | null> {
  if (!isRemote(url)) {
    result.skipped++;
    return null;
  }
  const ext = extFromUrl(url);
  const dest = path.join(localDir, `${localName}${ext}`);
  if (await fileExists(dest)) {
    result.skipped++;
    const relative = path.relative(IMG_ROOT, dest);
    return { localUrl: `${LOCAL_PREFIX}${relative}` };
  }
  try {
    const { ext: actualExt } = await downloadImage(url, dest);
    const finalDest = dest.replace(/\.[^.]+$/, actualExt);
    const relative = path.relative(IMG_ROOT, finalDest);
    result.downloaded++;
    return { localUrl: `${LOCAL_PREFIX}${relative}` };
  } catch (err) {
    result.failed++;
    result.failedUrls.push(url);
    console.warn(`  mirror: failed ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function runMirror(): Promise<MirrorResult> {
  const result: MirrorResult = {
    total: 0,
    skipped: 0,
    downloaded: 0,
    failed: 0,
    failedUrls: [],
  };

  await fs.mkdir(CASES_DIR, { recursive: true });
  await fs.mkdir(SKINS_DIR, { recursive: true });

  const cache = await readCache();

  for (const c of cache.cases) {
    result.total++;
    const mirrorRes = await mirrorOne(c.imageUrl, CASES_DIR, c.slug, result);
    if (mirrorRes) {
      c.imageUrlRemote = c.imageUrl;
      c.imageUrl = mirrorRes.localUrl;
    }

    for (const skin of c.items) {
      result.total++;
      const mRes = await mirrorOne(skin.imageUrl, SKINS_DIR, skin.id, result);
      if (mRes) {
        skin.imageUrlRemote = skin.imageUrl;
        skin.imageUrl = mRes.localUrl;
      }
    }
  }

  await writeCache(cache);

  const manifest: {
    downloadedAt: number;
    updated: number;
    skipped: number;
    cases: Record<string, { local: string; remote: string }>;
    skins: Record<string, { local: string; remote: string }>;
  } = {
    downloadedAt: Date.now(),
    updated: 0,
    skipped: result.skipped,
    cases: {},
    skins: {},
  };

  for (const c of cache.cases) {
    if (isLocal(c.imageUrl)) {
      manifest.cases[c.slug] = {
        local: c.imageUrl,
        remote: c.imageUrlRemote ?? c.imageUrl,
      };
      manifest.updated++;
    }
    for (const skin of c.items) {
      if (isLocal(skin.imageUrl)) {
        manifest.skins[skin.id] = {
          local: skin.imageUrl,
          remote: skin.imageUrlRemote ?? skin.imageUrl,
        };
        manifest.updated++;
      }
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");

  return result;
}
