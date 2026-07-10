import { mkdirSync, rmSync } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path';
import type { AssetVersion } from 'carrier-contracts';

import { MapRepositoryError, getMapRepository } from './repository';

const DEFAULT_STORAGE_ROOT = resolve(import.meta.dir, '../../../.data/assets');
const PROCESSING_DIAGNOSTIC = 'Normalization pipeline completed';
const REVIEW_DIAGNOSTIC = 'Candidate metadata auto-derived from uploaded asset';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const getStorageRoot = () =>
  resolve(process.env.API_ASSET_STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT);

const toRelativeStoragePath = (...segments: string[]) => segments.join('/');

const hasWindowsDrivePrefix = (path: string) => /^[a-zA-Z]:/.test(path);

const hasControlCharacter = (path: string) =>
  /[\u0000-\u001f\u007f]/.test(path);

const isPathLikeFileName = (fileName: string | undefined) =>
  typeof fileName !== 'string' ||
  fileName.length === 0 ||
  fileName === '.' ||
  fileName === '..' ||
  fileName.includes('/') ||
  fileName.includes('\\') ||
  hasWindowsDrivePrefix(fileName) ||
  hasControlCharacter(fileName);

const ensureParentDirectory = (path: string) => {
  mkdirSync(dirname(path), { recursive: true });
};

const deriveCandidateMetadata = (sizeBytes: number) => {
  const sizeKilobytes = Math.max(1, Math.ceil(sizeBytes / 1024));
  const footprintEdgeMeters = Math.min(
    48,
    Math.max(4, Math.round(Math.sqrt(sizeKilobytes)) * 2)
  );
  const heightMeters = Math.max(6, Math.round(footprintEdgeMeters * 1.5));

  return {
    collisionBox: {
      depthMeters: footprintEdgeMeters,
      heightMeters,
      widthMeters: footprintEdgeMeters
    },
    collisionClass: 'building-solid',
    footprint: {
      depthMeters: footprintEdgeMeters,
      widthMeters: footprintEdgeMeters
    },
    groundingPolicy: 'terrain-average-footprint',
    instancingEligible: sizeBytes <= 5_000_000,
    maxHeightDeltaMeters: Number(
      Math.max(0.5, footprintEdgeMeters / 16).toFixed(2)
    )
  } satisfies Pick<
    AssetVersion,
    | 'collisionBox'
    | 'collisionClass'
    | 'footprint'
    | 'groundingPolicy'
    | 'instancingEligible'
    | 'maxHeightDeltaMeters'
  >;
};

const validateGlb = (bytes: Uint8Array) => {
  if (bytes.byteLength < 12) {
    throw new Error('Uploaded asset is too small to be a valid GLB');
  }

  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);

  if (magic !== 'glTF') {
    throw new Error('Uploaded asset must be a GLB with a valid glTF header');
  }
};

class AssetPipeline {
  private readonly inFlight = new Set<string>();

  private nextAssetVersionId(fileName: string) {
    const stem = basename(fileName, extname(fileName));
    const baseSlug = slugify(stem) || 'asset';
    const prefix = `${baseSlug}-v`;
    const existingIds = getMapRepository().listAssetVersionIdsByPrefix(prefix);
    let version = existingIds.length + 1;

    while (existingIds.includes(`${prefix}${version}`)) {
      version += 1;
    }

    return `${prefix}${version}`;
  }

  private originalAssetPath(id: string) {
    return toRelativeStoragePath('originals', `${id}.glb`);
  }

  private runtimeAssetPath(id: string) {
    return toRelativeStoragePath('runtime', `${id}.glb`);
  }

  private absoluteStoragePath(relativePath: string) {
    const storageRoot = getStorageRoot();
    const absolutePath = resolve(storageRoot, relativePath);
    const containment = relative(storageRoot, absolutePath);

    if (
      containment.length === 0 ||
      containment === '..' ||
      containment.startsWith(`..${sep}`) ||
      isAbsolute(containment)
    ) {
      throw new MapRepositoryError(
        'CONFLICT',
        `Asset storage path ${relativePath} is not contained within the asset storage root`
      );
    }

    return absolutePath;
  }

  private schedule(id: string) {
    if (this.inFlight.has(id)) {
      return;
    }

    this.inFlight.add(id);
    queueMicrotask(() => {
      void this.process(id).finally(() => {
        this.inFlight.delete(id);
      });
    });
  }

  async upload(file: File) {
    // Input hygiene only: the stored path is derived from the internal id
    // (`originals/${id}.glb`), so filesystem safety is enforced by slugify +
    // absoluteStoragePath containment, not this guard. It exists to return a
    // clean 400 rather than silently slugifying a path-like filename.
    if (isPathLikeFileName(file.name)) {
      throw new MapRepositoryError(
        'BAD_REQUEST',
        'Uploaded asset filename must be a plain filename, not a path'
      );
    }

    const id = this.nextAssetVersionId(file.name);
    const originalRelativePath = this.originalAssetPath(id);
    const originalAbsolutePath = this.absoluteStoragePath(originalRelativePath);
    const bytes = new Uint8Array(await file.arrayBuffer());

    ensureParentDirectory(originalAbsolutePath);
    await Bun.write(originalAbsolutePath, bytes);

    const assetVersion = getMapRepository().createAssetVersion({
      ...deriveCandidateMetadata(bytes.byteLength),
      diagnostics: [REVIEW_DIAGNOSTIC],
      id,
      originalFile: {
        contentType: file.type || null,
        path: originalRelativePath,
        sizeBytes: bytes.byteLength
      },
      runtimeFile: null,
      status: 'uploaded'
    });

    this.schedule(id);
    return assetVersion;
  }

  list(status?: AssetVersion['status']) {
    return getMapRepository().listAssetVersionItems(status);
  }

  getDiagnostics() {
    return {
      cwd: process.cwd(),
      repository: getMapRepository().getAssetDiagnostics(),
      storageRoot: getStorageRoot()
    };
  }

  get(id: string) {
    return getMapRepository().getAssetVersion(id);
  }

  archive(id: string) {
    return getMapRepository().archiveAssetVersion(id);
  }

  delete(id: string) {
    const repository = getMapRepository();
    const assetVersion = repository.getAssetVersion(id);

    if (!assetVersion) {
      throw new MapRepositoryError(
        'NOT_FOUND',
        `Asset version ${id} was not found`
      );
    }

    const originalAbsolutePath = this.absoluteStoragePath(
      assetVersion.originalFile.path
    );
    const runtimeAbsolutePath = assetVersion.runtimeFile
      ? this.absoluteStoragePath(assetVersion.runtimeFile.path)
      : null;

    repository.deleteAssetVersion(id);

    rmSync(originalAbsolutePath, {
      force: true
    });

    if (runtimeAbsolutePath) {
      rmSync(runtimeAbsolutePath, {
        force: true
      });
    }

    return assetVersion;
  }

  async runtimeResponse(id: string) {
    const assetVersion = getMapRepository().getAssetVersion(id);

    if (!assetVersion || assetVersion.runtimeFile === null) {
      return null;
    }

    const absolutePath = this.absoluteStoragePath(
      assetVersion.runtimeFile.path
    );
    const runtimeFile = Bun.file(absolutePath);

    return new Response(runtimeFile, {
      headers: {
        'Content-Length': `${assetVersion.runtimeFile.sizeBytes}`,
        'Content-Type':
          assetVersion.runtimeFile.contentType ?? 'model/gltf-binary'
      }
    });
  }

  private async process(id: string) {
    const repository = getMapRepository();
    const assetVersion = repository.getAssetVersion(id);

    if (!assetVersion) {
      return;
    }

    repository.updateAssetVersion({
      diagnostics: [REVIEW_DIAGNOSTIC],
      id,
      status: 'processing'
    });

    try {
      const originalAbsolutePath = this.absoluteStoragePath(
        assetVersion.originalFile.path
      );
      const bytes = new Uint8Array(
        await Bun.file(originalAbsolutePath).arrayBuffer()
      );

      validateGlb(bytes);

      const runtimeRelativePath = this.runtimeAssetPath(id);
      const runtimeAbsolutePath = this.absoluteStoragePath(runtimeRelativePath);
      ensureParentDirectory(runtimeAbsolutePath);
      await Bun.write(runtimeAbsolutePath, bytes);

      repository.updateAssetVersion({
        diagnostics: [REVIEW_DIAGNOSTIC, PROCESSING_DIAGNOSTIC],
        id,
        runtimeFile: {
          contentType: 'model/gltf-binary',
          path: runtimeRelativePath,
          sizeBytes: bytes.byteLength
        },
        status: 'review'
      });
    } catch (error) {
      repository.updateAssetVersion({
        diagnostics: [
          REVIEW_DIAGNOSTIC,
          error instanceof Error ? error.message : 'Asset processing failed'
        ],
        id,
        runtimeFile: null,
        status: 'failed'
      });
    }
  }
}

let assetPipeline: AssetPipeline | null = null;

export const getAssetPipeline = () => {
  assetPipeline ??= new AssetPipeline();
  return assetPipeline;
};

export const resetAssetPipeline = () => {
  assetPipeline = null;
};
