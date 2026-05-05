import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import {
  type AnimalSubjectConfig,
  ANIMAL_SUBJECTS,
  findAnimalSubject,
  inferAnimalFromText,
} from "./animal-subjects.config";

export type VisualAssetKind = "character" | "background" | "overlay";

export type VisualAssetLicense = {
  license: string;
  licenseUrl?: string;
  creator?: string;
  sourceUrl?: string;
  landingUrl?: string;
};

export type VisualAsset = VisualAssetLicense & {
  id: string;
  kind: VisualAssetKind;
  role: string;
  staticPath: string;
  provider: "local" | "openverse" | "wikimedia" | "kenney" | "svgFallback";
  width?: number;
  height?: number;
  qualityScore: number;
};

export type SceneVisualAssetPlan = {
  mainCharacter?: VisualAsset;
  background?: VisualAsset;
  overlays: VisualAsset[];
  sourceProvider: string;
  licenseInfo?: VisualAssetLicense;
  qualityScore: number;
};

type ResolveSceneInput = {
  id?: string;
  title?: string;
  narration?: string;
  visualDescription?: string;
  assetKey?: string;
  assetTags?: string[];
  action?: string;
  habitat?: string;
};

type LocalManifest = {
  version?: number;
  assets?: VisualAsset[];
};

type AssetRequest = {
  kind: VisualAssetKind;
  role: string;
  query: string;
  tags: string[];
  minWidth: number;
  minHeight: number;
};

type AnimalSubject = string;

@Injectable()
export class VisualAssetService {
  private readonly logger = new Logger(VisualAssetService.name);
  private readonly publicDir = path.resolve(
    __dirname,
    "../../../../video-remotion/public",
  );
  private readonly localManifestPath = path.join(
    this.publicDir,
    "assets",
    "lesson",
    "manifest.json",
  );
  private readonly generatedAssetDir = path.join(
    this.publicDir,
    ".generated",
    "assets",
  );
  private localManifestCache: LocalManifest | null | undefined;

  async resolveSceneVisualAssets(
    scene: ResolveSceneInput,
    topic: string,
  ): Promise<SceneVisualAssetPlan> {
    const requests = this.buildAssetRequests(scene, topic);
    const resolved = await Promise.all(
      requests.map((request) => this.resolveAsset(request)),
    );
    const assets = resolved.filter(Boolean) as VisualAsset[];
    const mainCharacter = assets.find((asset) => asset.kind === "character");
    const background = assets.find((asset) => asset.kind === "background");
    const overlays = assets.filter((asset) => asset.kind === "overlay");
    const requiresCharacter = requests.some(
      (request) => request.kind === "character",
    );
    const primary =
      mainCharacter ||
      (!requiresCharacter ? background : undefined) ||
      overlays[0];
    const provider = primary?.provider || "svgFallback";
    const resolvedQualityScore = Math.max(
      ...assets.map((asset) => asset.qualityScore),
      provider === "svgFallback" ? 35 : 0,
    );
    const qualityScore =
      requiresCharacter && !mainCharacter ? 35 : resolvedQualityScore;

    return {
      mainCharacter,
      background,
      overlays,
      sourceProvider: provider,
      licenseInfo: primary
        ? {
            license: primary.license,
            licenseUrl: primary.licenseUrl,
            creator: primary.creator,
            sourceUrl: primary.sourceUrl,
            landingUrl: primary.landingUrl,
          }
        : undefined,
      qualityScore,
    };
  }

  private buildAssetRequests(
    scene: ResolveSceneInput,
    topic: string,
  ): AssetRequest[] {
    const source = `${topic} ${scene.title || ""} ${scene.narration || ""} ${
      scene.visualDescription || ""
    } ${(scene.assetTags || []).join(" ")}`;
    const animal = this.inferAnimalSubject(source, scene.assetKey);
    const action = scene.action || "explore";
    const habitat = scene.habitat || "forest";
    const requests: AssetRequest[] = [];

    if (animal) {
      const role = this.roleForAnimalAction(animal, action);
      requests.push({
        kind: "character",
        role,
        query: this.queryForRole(role),
        tags: [animal, role, action, "animal"],
        minWidth: 256,
        minHeight: 200,
      });
    }

    const backgroundRole =
      habitat === "river" || action === "swim"
        ? "river"
        : habitat === "night"
          ? "forest-night"
          : habitat === "grassland"
            ? "grassland"
            : "forest-day";
    requests.push({
      kind: "background",
      role: backgroundRole,
      query: this.queryForRole(backgroundRole),
      tags: [backgroundRole, "forest", "nature", habitat],
      minWidth: 1280,
      minHeight: 720,
    });

    if (action === "swim") {
      requests.push({
        kind: "overlay",
        role: "water-splash",
        query: "water splash transparent cc0",
        tags: ["water", "splash", "overlay"],
        minWidth: 256,
        minHeight: 128,
      });
    }

    return requests;
  }

  private async resolveAsset(
    request: AssetRequest,
  ): Promise<VisualAsset | null> {
    const local = await this.findLocalAsset(request);
    if (local) {
      this.logger.log(
        `[resolveAsset] role="${request.role}" resolved via local: ${local.staticPath}`,
      );
      return local;
    }

    this.logger.debug(
      `[resolveAsset] role="${request.role}" not found locally, trying Openverse`,
    );

    const openverse = await this.resolveOpenverseAsset(request);
    if (openverse) return openverse;

    const wikimedia = await this.resolveWikimediaAsset(request);
    if (wikimedia) return wikimedia;

    const kenney = await this.resolveKenneyAsset(request);
    if (kenney) return kenney;

    this.logger.warn(
      `[resolveAsset] role="${request.role}" unresolved: all providers returned null`,
    );
    return null;
  }

  private async findLocalAsset(
    request: AssetRequest,
  ): Promise<VisualAsset | null> {
    const manifest = await this.loadLocalManifest();
    const assets = manifest?.assets || [];

    const matchCriteria = (asset: VisualAsset) =>
      asset.kind === request.kind &&
      (!asset.provider || asset.provider === "local") &&
      this.isAllowedLicense(asset.license) &&
      this.meetsMinimumSize(asset, request);

    const exactMatch = assets.find(
      (asset) => matchCriteria(asset) && asset.role === request.role,
    );
    if (exactMatch) {
      return {
        ...exactMatch,
        provider: exactMatch.provider || "local",
        qualityScore: exactMatch.qualityScore || 88,
      };
    }

    const animalPrefix = request.role.split("-")[0];
    if (animalPrefix && animalPrefix !== request.role) {
      const prefixMatch = assets.find(
        (asset) =>
          matchCriteria(asset) && asset.role.startsWith(animalPrefix + "-"),
      );
      if (prefixMatch) {
        this.logger.log(
          `[findLocalAsset] 请求 "${request.role}" 未精确匹配，使用前缀兜底 "${prefixMatch.role}"`,
        );
        return {
          ...prefixMatch,
          provider: prefixMatch.provider || "local",
          qualityScore: (prefixMatch.qualityScore || 88) - 2,
        };
      }
    }

    return null;
  }

  private async resolveKenneyAsset(
    request: AssetRequest,
  ): Promise<VisualAsset | null> {
    const manifest = await this.loadLocalManifest();
    const assets = manifest?.assets || [];
    const match = assets.find(
      (asset) =>
        asset.kind === request.kind &&
        asset.role === request.role &&
        asset.provider === "kenney" &&
        this.isAllowedLicense(asset.license) &&
        this.meetsMinimumSize(asset, request),
    );
    if (!match) return null;
    return {
      ...match,
      provider: "kenney",
      qualityScore: match.qualityScore || 74,
    };
  }

  private async loadLocalManifest(): Promise<LocalManifest | null> {
    if (this.localManifestCache !== undefined) return this.localManifestCache;
    try {
      const raw = await fs.readFile(this.localManifestPath, "utf-8");
      const parsed = JSON.parse(raw) as LocalManifest;
      this.localManifestCache = parsed;
      return parsed;
    } catch {
      this.localManifestCache = null;
      return null;
    }
  }

  private async resolveOpenverseAsset(
    request: AssetRequest,
  ): Promise<VisualAsset | null> {
    const endpoint =
      process.env.OPENVERSE_IMAGE_API_URL ||
      "https://api.openverse.engineering/v1/images/";
    const url = new URL(endpoint);
    url.searchParams.set("q", request.query);
    url.searchParams.set("license", "cc0");
    url.searchParams.set("page_size", "12");
    url.searchParams.set("mature", "false");

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as any;
      const candidate = (payload?.results || []).find((item: any) => {
        const width = Number(item?.width) || 0;
        const height = Number(item?.height) || 0;
        return (
          this.isAllowedLicense(item?.license) &&
          item?.mature !== true &&
          width >= request.minWidth &&
          height >= request.minHeight &&
          typeof item?.url === "string"
        );
      });
      if (!candidate) return null;

      return await this.downloadAndCacheAsset(request, {
        provider: "openverse",
        url: candidate.url,
        landingUrl: candidate.foreign_landing_url,
        sourceUrl: candidate.url,
        license: candidate.license,
        licenseUrl: candidate.license_url,
        creator: candidate.creator,
        width: Number(candidate.width),
        height: Number(candidate.height),
      });
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] Openverse lookup failed for ${request.role}: ${
          error?.message || "unknown"
        }`,
      );
      return null;
    }
  }

  private async resolveWikimediaAsset(
    request: AssetRequest,
  ): Promise<VisualAsset | null> {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrsearch", request.query);
    url.searchParams.set("gsrlimit", "10");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|mime|size|extmetadata");

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as any;
      const pages = Object.values(payload?.query?.pages || {}) as any[];
      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        const metadata = info?.extmetadata || {};
        const license = String(
          metadata?.LicenseShortName?.value || metadata?.License?.value || "",
        );
        if (!this.isAllowedLicense(license)) continue;
        const width = Number(info?.width) || 0;
        const height = Number(info?.height) || 0;
        if (width < request.minWidth || height < request.minHeight) continue;
        if (!String(info?.mime || "").startsWith("image/")) continue;

        return await this.downloadAndCacheAsset(request, {
          provider: "wikimedia",
          url: info.url,
          landingUrl: metadata?.ObjectURL?.value,
          sourceUrl: info.url,
          license,
          licenseUrl: metadata?.LicenseUrl?.value,
          creator: metadata?.Artist?.value,
          width,
          height,
        });
      }
      return null;
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] Wikimedia lookup failed for ${request.role}: ${
          error?.message || "unknown"
        }`,
      );
      return null;
    }
  }

  private async downloadAndCacheAsset(
    request: AssetRequest,
    source: {
      provider: "openverse" | "wikimedia";
      url: string;
      landingUrl?: string;
      sourceUrl?: string;
      license: string;
      licenseUrl?: string;
      creator?: string;
      width?: number;
      height?: number;
    },
  ): Promise<VisualAsset | null> {
    if (!this.isAllowedLicense(source.license)) return null;

    const key = createHash("sha1")
      .update(`${source.provider}:${source.url}:${request.role}`)
      .digest("hex")
      .slice(0, 16);
    const extension = this.inferExtension(source.url);
    const relativePath = `.generated/assets/${key}/${request.role}${extension}`;
    const outputDir = path.join(this.generatedAssetDir, key);
    const outputPath = path.join(outputDir, `${request.role}${extension}`);

    try {
      await fs.access(outputPath);
      const existing = await this.readGeneratedManifestEntry(relativePath);
      if (existing) return existing;
    } catch {
      // download below
    }

    try {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`download status ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.startsWith("image/") &&
        !source.url.match(/\.(svg|png|jpe?g|webp)(\?|$)/i)
      ) {
        throw new Error(`non-image content type ${contentType || "unknown"}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 512) throw new Error("image payload too small");

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, buffer);

      const asset: VisualAsset = {
        id: `${source.provider}-${key}`,
        kind: request.kind,
        role: request.role,
        staticPath: relativePath,
        provider: source.provider,
        license: String(source.license).toLowerCase(),
        licenseUrl: source.licenseUrl,
        creator: this.stripHtml(source.creator),
        sourceUrl: source.sourceUrl || source.url,
        landingUrl: source.landingUrl,
        width: source.width,
        height: source.height,
        qualityScore: request.kind === "background" ? 78 : 82,
      };
      await this.appendGeneratedManifest(asset);
      this.logger.log(
        `[VisualAssetService] cached ${request.role} from ${source.provider}, license=${asset.license}, path=${asset.staticPath}`,
      );
      return asset;
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] asset download failed for ${request.role}: ${
          error?.message || "unknown"
        }`,
      );
      return null;
    }
  }

  private async readGeneratedManifestEntry(
    staticPath: string,
  ): Promise<VisualAsset | null> {
    try {
      const manifest = await this.readGeneratedManifest();
      return (
        manifest.assets.find((asset) => asset.staticPath === staticPath) || null
      );
    } catch {
      return null;
    }
  }

  private async appendGeneratedManifest(asset: VisualAsset): Promise<void> {
    const manifest = await this.readGeneratedManifest();
    const assets = manifest.assets.filter(
      (item) => item.staticPath !== asset.staticPath,
    );
    assets.push({ ...asset, downloadedAt: new Date().toISOString() } as any);
    await fs.mkdir(this.generatedAssetDir, { recursive: true });
    await fs.writeFile(
      path.join(this.generatedAssetDir, "asset-manifest.json"),
      JSON.stringify({ version: 1, assets }, null, 2),
      "utf-8",
    );
  }

  private async readGeneratedManifest(): Promise<{ assets: VisualAsset[] }> {
    try {
      const raw = await fs.readFile(
        path.join(this.generatedAssetDir, "asset-manifest.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw);
      return { assets: Array.isArray(parsed.assets) ? parsed.assets : [] };
    } catch {
      return { assets: [] };
    }
  }

  private queryForRole(role: string): string {
    const queries: Record<string, string> = {
      "tiger-standing": "tiger standing",
      "tiger-running": "tiger running",
      "tiger-swimming": "tiger swimming",
      "tiger-roaring": "tiger roaring",
      "rabbit-standing": "rabbit",
      "rabbit-eating": "rabbit eating",
      "rabbit-jumping": "rabbit jumping",
      "rabbit-listening": "rabbit",
      "forest-day": "sunlit forest landscape",
      "forest-night": "night forest",
      grassland: "grassland meadow",
      river: "forest river",
      "water-splash": "water splash",
    };
    if (queries[role]) return queries[role];
    // For animal roles not in the hardcoded map, build a better query
    const animalMatch = role.match(
      /^([a-z]+(?:-[a-z]+)?)-(standing|running|swimming|eating|jumping|exploring|roaring|climbing)/,
    );
    if (animalMatch) {
      const animal = animalMatch[1];
      const verb =
        animalMatch[2] === "standing" ? "illustration cartoon" : animalMatch[2];
      return `${animal} animal ${verb} educational`;
    }
    return role.replace(/-/g, " ");
  }

  private accentColorForAnimal(animalId: string): string | null {
    const config = ANIMAL_SUBJECTS.find((s) => s.id === animalId);
    return config?.accentColor ?? null;
  }

  private inferAnimalSubject(
    source: string,
    assetKey?: string,
  ): AnimalSubject | null {
    const result = inferAnimalFromText(source, assetKey);
    return result?.id ?? null;
  }

  private findAnimalConfig(animalId: string): AnimalSubjectConfig | undefined {
    return ANIMAL_SUBJECTS.find((s) => s.id === animalId);
  }

  private roleForAnimalAction(animal: AnimalSubject, action: string): string {
    const config = this.findAnimalConfig(animal);
    if (config) {
      return config.actionRoles[action] || config.defaultRole;
    }
    // Generic: "dolphin-jumping", "elephant-running", etc.
    return `${animal}-${action}`;
  }

  private meetsMinimumSize(asset: VisualAsset, request: AssetRequest): boolean {
    const width = Number(asset.width) || 0;
    const height = Number(asset.height) || 0;
    return width >= request.minWidth && height >= request.minHeight;
  }

  private inferExtension(url: string): string {
    const match = url.match(/\.(svg|png|jpe?g|webp)(?:\?|#|$)/i);
    if (!match) return ".jpg";
    const ext = match[1].toLowerCase();
    return ext === "jpeg" ? ".jpg" : `.${ext}`;
  }

  private isAllowedLicense(value: unknown): boolean {
    const license = String(value || "").toLowerCase();
    return (
      license === "cc0" ||
      license.includes("cc0") ||
      license.includes("public domain") ||
      license.includes("pdm") ||
      license.includes("cc by") ||
      license.includes("cc-by") ||
      license.includes("cc by-sa") ||
      license.includes("cc-by-sa") ||
      license.includes("attribution")
    );
  }

  private hasAny(source: string, terms: string[]): boolean {
    const lowered = source.toLowerCase();
    return terms.some((term) => lowered.includes(term.toLowerCase()));
  }

  private stripHtml(value?: string): string | undefined {
    if (!value) return undefined;
    return (
      String(value)
        .replace(/<[^>]+>/g, "")
        .trim() || undefined
    );
  }
}
