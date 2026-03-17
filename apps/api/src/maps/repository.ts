import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Database } from 'bun:sqlite';
import type {
  CreateMapInput,
  MapChunk,
  MapMetadata
} from 'carrier-contracts';

import {
  HEIGHT_LAYER,
  buildGeneratedMapChunks,
  decodeFloat32Heights,
  deriveChunkMaterialIds,
  encodeFloat32Heights,
  encodeMaterialIds,
  getDefaultMapConfig,
  quantizeUint16Heights,
  toMapChunkResponse
} from './generation';

type MapRow = {
  chunkSizeTiles: number;
  createdAt: string;
  extentKind: string;
  generator: string | null;
  heightTiles: number | null;
  id: string;
  kind: string;
  metersPerTile: number;
  name: string | null;
  seed: string;
  updatedAt: string;
  widthTiles: number | null;
  wrapX: number;
  wrapZ: number;
};

type ChunkRow = {
  chunkX: number;
  chunkZ: number;
  heights: Uint8Array;
  mapId: string;
  originTileX: number;
  originTileZ: number;
  samplesHigh: number;
  samplesWide: number;
  tileHeight: number;
  tileWidth: number;
};

export type MapRepositoryOptions = {
  dbPath?: string;
};

const ensureDatabasePath = (dbPath: string) => {
  if (dbPath === ':memory:' || dbPath.length === 0) {
    return dbPath;
  }

  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
};

const mapRowToMetadata = (row: MapRow): MapMetadata => {
  const resolution = {
    metersPerTile: row.metersPerTile,
    chunkSizeTiles: row.chunkSizeTiles
  };

  if (row.extentKind === 'finite' && row.widthTiles !== null && row.heightTiles !== null) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as MapMetadata['kind'],
      extent: {
        kind: 'finite' as const,
        widthMeters: row.widthTiles * row.metersPerTile,
        heightMeters: row.heightTiles * row.metersPerTile,
        widthTiles: row.widthTiles,
        heightTiles: row.heightTiles,
        wrapX: row.wrapX === 1,
        wrapZ: row.wrapZ === 1
      },
      resolution,
      generator: row.generator as MapMetadata['generator'],
      seed: row.seed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  return {
    id: row.id,
    name: row.name,
    kind: row.kind as MapMetadata['kind'],
    extent: { kind: 'infinite' as const },
    resolution,
    generator: undefined,
    seed: row.seed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const MAP_ROW_COLUMNS = `
  chunk_size_tiles AS chunkSizeTiles,
  created_at AS createdAt,
  extent_kind AS extentKind,
  generator,
  height_tiles AS heightTiles,
  id,
  kind,
  meters_per_tile AS metersPerTile,
  name,
  seed,
  updated_at AS updatedAt,
  width_tiles AS widthTiles,
  wrap_x AS wrapX,
  wrap_z AS wrapZ
`;

export class MapRepository {
  readonly db: Database;

  constructor(options: MapRepositoryOptions = {}) {
    this.db = new Database(
      ensureDatabasePath(options.dbPath ?? process.env.API_DB_PATH ?? '.data/carrier.sqlite')
    );
    this.migrate();
  }

  close() {
    this.db.close();
  }

  createMap(input: CreateMapInput): MapMetadata {
    const now = new Date().toISOString();
    const defaults = getDefaultMapConfig();
    const id = randomUUID();
    const seed = input.seed ?? randomUUID();

    if (input.kind === 'wrapped-classic') {
      const row: MapRow = {
        chunkSizeTiles: defaults.chunkSizeTiles,
        createdAt: now,
        extentKind: 'finite',
        generator: input.generator,
        heightTiles: input.heightTiles,
        id,
        kind: 'wrapped-classic',
        metersPerTile: defaults.metersPerTile,
        name: input.name ?? null,
        seed,
        updatedAt: now,
        widthTiles: input.widthTiles,
        wrapX: input.wrapX ? 1 : 0,
        wrapZ: input.wrapZ ? 1 : 0
      };

      const chunks = buildGeneratedMapChunks({
        chunkSizeTiles: row.chunkSizeTiles,
        generator: input.generator,
        heightTiles: input.heightTiles,
        id: row.id,
        metersPerTile: row.metersPerTile,
        seed: row.seed,
        widthTiles: input.widthTiles
      });

      const insertMap = this.db.prepare(`
        INSERT INTO maps (
          id, name, kind, extent_kind,
          width_tiles, height_tiles, wrap_x, wrap_z,
          meters_per_tile, chunk_size_tiles,
          generator, seed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertChunk = this.db.prepare(`
        INSERT INTO map_chunks (
          map_id, chunk_x, chunk_z,
          origin_tile_x, origin_tile_z,
          tile_width, tile_height,
          samples_wide, samples_high, heights
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.db.exec('BEGIN');

      try {
        insertMap.run(
          row.id, row.name, row.kind, row.extentKind,
          row.widthTiles, row.heightTiles, row.wrapX, row.wrapZ,
          row.metersPerTile, row.chunkSizeTiles,
          row.generator, row.seed, row.createdAt, row.updatedAt
        );

        for (const chunk of chunks) {
          insertChunk.run(
            row.id,
            chunk.chunkX, chunk.chunkZ,
            chunk.originTileX, chunk.originTileZ,
            chunk.tileWidth, chunk.tileHeight,
            chunk.samplesWide, chunk.samplesHigh,
            encodeFloat32Heights(chunk.heights)
          );
        }

        this.db.exec('COMMIT');
        return mapRowToMetadata(row);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    // infinite-vector: no chunk generation
    const row: MapRow = {
      chunkSizeTiles: defaults.chunkSizeTiles,
      createdAt: now,
      extentKind: 'infinite',
      generator: null,
      heightTiles: null,
      id,
      kind: 'infinite-vector',
      metersPerTile: defaults.metersPerTile,
      name: input.name ?? null,
      seed,
      updatedAt: now,
      widthTiles: null,
      wrapX: 0,
      wrapZ: 0
    };

    this.db.prepare(`
      INSERT INTO maps (
        id, name, kind, extent_kind,
        width_tiles, height_tiles, wrap_x, wrap_z,
        meters_per_tile, chunk_size_tiles,
        generator, seed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.name, row.kind, row.extentKind,
      row.widthTiles, row.heightTiles, row.wrapX, row.wrapZ,
      row.metersPerTile, row.chunkSizeTiles,
      row.generator, row.seed, row.createdAt, row.updatedAt
    );

    return mapRowToMetadata(row);
  }

  deleteMap(id: string) {
    const result = this.db
      .prepare('DELETE FROM maps WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  getMap(id: string) {
    const row = this.db
      .query<MapRow, [string]>(`
        SELECT ${MAP_ROW_COLUMNS}
        FROM maps
        WHERE id = ?
      `)
      .get(id);

    if (!row) {
      return null;
    }

    return mapRowToMetadata(row);
  }

  private getChunkRow(
    mapId: string,
    chunkX: number,
    chunkZ: number
  ): ChunkRow | null {
    return this.db
      .query<ChunkRow, [string, number, number]>(`
        SELECT
          chunk_x AS chunkX,
          chunk_z AS chunkZ,
          heights,
          map_id AS mapId,
          origin_tile_x AS originTileX,
          origin_tile_z AS originTileZ,
          samples_high AS samplesHigh,
          samples_wide AS samplesWide,
          tile_height AS tileHeight,
          tile_width AS tileWidth
        FROM map_chunks
        WHERE map_id = ? AND chunk_x = ? AND chunk_z = ?
      `)
      .get(mapId, chunkX, chunkZ);
  }

  getMapChunk(mapId: string, chunkX: number, chunkZ: number): MapChunk | null {
    const row = this.getChunkRow(mapId, chunkX, chunkZ);

    if (!row) {
      return null;
    }

    return toMapChunkResponse({
      ...row,
      heights: decodeFloat32Heights(row.heights)
    });
  }

  getMapChunkBinary(mapId: string, chunkX: number, chunkZ: number) {
    const row = this.getChunkRow(mapId, chunkX, chunkZ);

    if (!row) {
      return null;
    }

    const heights = decodeFloat32Heights(row.heights);
    const quantized = quantizeUint16Heights(heights);
    const materials = deriveChunkMaterialIds(
      heights,
      row.samplesWide,
      row.tileWidth,
      row.tileHeight,
      row.originTileX,
      row.originTileZ
    );

    return {
      chunkX: row.chunkX,
      chunkZ: row.chunkZ,
      heights: quantized.data,
      layers: {
        height: quantized.layer,
        material: {
          encoding: 'uint8' as const,
          unit: 'surface-material' as const
        }
      },
      mapId: row.mapId,
      materials: encodeMaterialIds(materials),
      originTileX: row.originTileX,
      originTileZ: row.originTileZ,
      samplesHigh: row.samplesHigh,
      samplesWide: row.samplesWide,
      tileHeight: row.tileHeight,
      tileWidth: row.tileWidth
    };
  }

  updateMap(id: string, input: { name?: string | null }): MapMetadata | null {
    const now = new Date().toISOString();

    const result = this.db
      .prepare('UPDATE maps SET name = ?, updated_at = ? WHERE id = ?')
      .run(input.name ?? null, now, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getMap(id);
  }

  listMaps() {
    const rows = this.db
      .query<MapRow, []>(`
        SELECT ${MAP_ROW_COLUMNS}
        FROM maps
        ORDER BY updated_at DESC, created_at DESC
      `)
      .all();

    return rows.map(mapRowToMetadata);
  }

  private migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        name TEXT,
        kind TEXT NOT NULL,
        extent_kind TEXT NOT NULL,
        width_tiles INTEGER,
        height_tiles INTEGER,
        wrap_x INTEGER NOT NULL DEFAULT 0,
        wrap_z INTEGER NOT NULL DEFAULT 0,
        meters_per_tile INTEGER NOT NULL,
        chunk_size_tiles INTEGER NOT NULL,
        generator TEXT,
        seed TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS map_chunks (
        map_id TEXT NOT NULL,
        chunk_x INTEGER NOT NULL,
        chunk_z INTEGER NOT NULL,
        origin_tile_x INTEGER NOT NULL,
        origin_tile_z INTEGER NOT NULL,
        tile_width INTEGER NOT NULL,
        tile_height INTEGER NOT NULL,
        samples_wide INTEGER NOT NULL,
        samples_high INTEGER NOT NULL,
        heights BLOB NOT NULL,
        PRIMARY KEY (map_id, chunk_x, chunk_z),
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      );
    `);
  }
}

let repository: MapRepository | undefined;

export const getMapRepository = () => {
  if (!repository) {
    repository = new MapRepository();
  }

  return repository;
};

export const resetMapRepository = () => {
  repository?.close();
  repository = undefined;
};
