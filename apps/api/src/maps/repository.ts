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
  generator: MapMetadata['generator'];
  heightTiles: number;
  id: string;
  metersPerTile: number;
  name: string | null;
  renderUnitsPerTile: number;
  seed: string;
  updatedAt: string;
  widthTiles: number;
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

const mapRowToMetadata = (row: MapRow): MapMetadata => ({
  ...row,
  heightMeters: row.heightTiles * row.metersPerTile,
  widthMeters: row.widthTiles * row.metersPerTile
});

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
    const row: MapRow = {
      chunkSizeTiles: defaults.chunkSizeTiles,
      createdAt: now,
      generator: input.generator,
      heightTiles: input.heightTiles,
      id: randomUUID(),
      metersPerTile: defaults.metersPerTile,
      name: input.name ?? null,
      renderUnitsPerTile: defaults.renderUnitsPerTile,
      seed: input.seed ?? randomUUID(),
      updatedAt: now,
      widthTiles: input.widthTiles
    };
    const chunks = buildGeneratedMapChunks({
      chunkSizeTiles: row.chunkSizeTiles,
      generator: row.generator,
      heightTiles: row.heightTiles,
      id: row.id,
      metersPerTile: row.metersPerTile,
      renderUnitsPerTile: row.renderUnitsPerTile,
      seed: row.seed,
      widthTiles: row.widthTiles
    });

    const insertMap = this.db.prepare(`
      INSERT INTO maps (
        id,
        name,
        width_tiles,
        height_tiles,
        meters_per_tile,
        render_units_per_tile,
        chunk_size_tiles,
        generator,
        seed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChunk = this.db.prepare(`
      INSERT INTO map_chunks (
        map_id,
        chunk_x,
        chunk_z,
        origin_tile_x,
        origin_tile_z,
        tile_width,
        tile_height,
        samples_wide,
        samples_high,
        heights
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec('BEGIN');

    try {
      insertMap.run(
        row.id,
        row.name,
        row.widthTiles,
        row.heightTiles,
        row.metersPerTile,
        row.renderUnitsPerTile,
        row.chunkSizeTiles,
        row.generator,
        row.seed,
        row.createdAt,
        row.updatedAt
      );

      for (const chunk of chunks) {
        insertChunk.run(
          row.id,
          chunk.chunkX,
          chunk.chunkZ,
          chunk.originTileX,
          chunk.originTileZ,
          chunk.tileWidth,
          chunk.tileHeight,
          chunk.samplesWide,
          chunk.samplesHigh,
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

  deleteMap(id: string) {
    const result = this.db
      .prepare('DELETE FROM maps WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  getMap(id: string) {
    const row = this.db
      .query<MapRow, [string]>(`
        SELECT
          chunk_size_tiles AS chunkSizeTiles,
          created_at AS createdAt,
          generator,
          height_tiles AS heightTiles,
          id,
          meters_per_tile AS metersPerTile,
          name,
          render_units_per_tile AS renderUnitsPerTile,
          seed,
          updated_at AS updatedAt,
          width_tiles AS widthTiles
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
        SELECT
          chunk_size_tiles AS chunkSizeTiles,
          created_at AS createdAt,
          generator,
          height_tiles AS heightTiles,
          id,
          meters_per_tile AS metersPerTile,
          name,
          render_units_per_tile AS renderUnitsPerTile,
          seed,
          updated_at AS updatedAt,
          width_tiles AS widthTiles
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
        width_tiles INTEGER NOT NULL,
        height_tiles INTEGER NOT NULL,
        meters_per_tile INTEGER NOT NULL,
        render_units_per_tile INTEGER NOT NULL,
        chunk_size_tiles INTEGER NOT NULL,
        generator TEXT NOT NULL,
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
