package world

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
)

type LoaderConfig struct {
	APIBaseURL  string
	ExportMapID string
	HTTPClient  *http.Client
}

type mapMetadataRecord struct {
	ID         string           `json:"id"`
	Kind       string           `json:"kind"`
	Name       *string          `json:"name"`
	Extent     mapExtentRecord  `json:"extent"`
	Resolution resolutionRecord `json:"resolution"`
	Export     *mapExportRecord `json:"export"`
}

type mapExtentRecord struct {
	Kind         string  `json:"kind"`
	WidthMeters  float64 `json:"widthMeters"`
	HeightMeters float64 `json:"heightMeters"`
	WidthTiles   int     `json:"widthTiles"`
	HeightTiles  int     `json:"heightTiles"`
	WrapX        bool    `json:"wrapX"`
	WrapZ        bool    `json:"wrapZ"`
}

type resolutionRecord struct {
	MetersPerTile  float64 `json:"metersPerTile"`
	ChunkSizeTiles int     `json:"chunkSizeTiles"`
}

type mapExportRecord struct {
	Bounds         boundsRecord                   `json:"bounds"`
	ExportedAt     string                         `json:"exportedAt"`
	SourceMapID    string                         `json:"sourceMapId"`
	SourceRevision int                            `json:"sourceRevision"`
	StaticEntities *mapExportStaticEntitiesRecord `json:"staticEntities"`
}

type boundsRecord struct {
	MinX float64 `json:"minX"`
	MinZ float64 `json:"minZ"`
	MaxX float64 `json:"maxX"`
	MaxZ float64 `json:"maxZ"`
}

type mapExportStaticEntitiesRecord struct {
	Manifest []manifestEntryRecord `json:"manifest"`
}

type manifestEntryRecord struct {
	Archetype    manifestArchetypeRecord    `json:"archetype"`
	AssetVersion manifestAssetVersionRecord `json:"assetVersion"`
}

type manifestArchetypeRecord struct {
	ID             string `json:"id"`
	AssetVersionID string `json:"assetVersionId"`
}

type manifestAssetVersionRecord struct {
	ID                   string            `json:"id"`
	CollisionClass       string            `json:"collisionClass"`
	CollisionBox         dimensions3Record `json:"collisionBox"`
	Footprint            dimensions2Record `json:"footprint"`
	MaxHeightDeltaMeters float64           `json:"maxHeightDeltaMeters"`
}

type dimensions2Record struct {
	WidthMeters float64 `json:"widthMeters"`
	DepthMeters float64 `json:"depthMeters"`
}

type dimensions3Record struct {
	WidthMeters  float64 `json:"widthMeters"`
	DepthMeters  float64 `json:"depthMeters"`
	HeightMeters float64 `json:"heightMeters"`
}

type staticEntityPlacementRecord struct {
	ID          string  `json:"id"`
	MapID       string  `json:"mapId"`
	Label       *string `json:"label"`
	ArchetypeID string  `json:"archetypeId"`
	Position    struct {
		X float64 `json:"x"`
		Z float64 `json:"z"`
	} `json:"position"`
	Rotation struct {
		Yaw float64 `json:"yaw"`
	} `json:"rotation"`
	Scale   float64 `json:"scale"`
	State   string  `json:"state"`
	YOffset float64 `json:"yOffset"`
}

type binaryChunkRecord struct {
	ChunkX         int
	ChunkZ         int
	MapID          string
	OriginTileX    int
	OriginTileZ    int
	SamplesHigh    int
	SamplesWide    int
	TileHeight     int
	TileWidth      int
	HeightEncoding string
	HeightMin      float64
	HeightStep     float64
	HeightBytes    []byte
	StaticEntities []staticEntityPlacementRecord
}

func LoadExportedWorld(ctx context.Context, cfg LoaderConfig) (*World, error) {
	if strings.TrimSpace(cfg.APIBaseURL) == "" {
		return nil, fmt.Errorf("api base URL is required")
	}
	if strings.TrimSpace(cfg.ExportMapID) == "" {
		return nil, fmt.Errorf("export map ID is required")
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{}
	}

	api := &apiClient{
		baseURL: strings.TrimRight(cfg.APIBaseURL, "/"),
		client:  client,
	}

	mapRecord, err := api.fetchExportedMap(ctx, cfg.ExportMapID)
	if err != nil {
		return nil, err
	}
	if mapRecord.Export == nil {
		return nil, fmt.Errorf("map %s is not an exported slice", mapRecord.ID)
	}
	if mapRecord.Extent.Kind != "finite" {
		return nil, fmt.Errorf("map %s must have a finite extent", mapRecord.ID)
	}
	if mapRecord.Export.StaticEntities == nil {
		return nil, fmt.Errorf("map %s is missing static entity export metadata", mapRecord.ID)
	}

	exportedMap := ExportedMap{
		ID:   mapRecord.ID,
		Kind: mapRecord.Kind,
		Name: mapRecord.Name,
		Extent: MapExtent{
			Kind:         mapRecord.Extent.Kind,
			WidthMeters:  mapRecord.Extent.WidthMeters,
			HeightMeters: mapRecord.Extent.HeightMeters,
			WidthTiles:   mapRecord.Extent.WidthTiles,
			HeightTiles:  mapRecord.Extent.HeightTiles,
			WrapX:        mapRecord.Extent.WrapX,
			WrapZ:        mapRecord.Extent.WrapZ,
		},
		Resolution: Resolution{
			MetersPerTile:  mapRecord.Resolution.MetersPerTile,
			ChunkSizeTiles: mapRecord.Resolution.ChunkSizeTiles,
		},
		Export: ExportInfo{
			Bounds: AxisAlignedBox2D{
				MinX: mapRecord.Export.Bounds.MinX,
				MinZ: mapRecord.Export.Bounds.MinZ,
				MaxX: mapRecord.Export.Bounds.MaxX,
				MaxZ: mapRecord.Export.Bounds.MaxZ,
			},
			ExportedAt:     mapRecord.Export.ExportedAt,
			SourceMapID:    mapRecord.Export.SourceMapID,
			SourceRevision: mapRecord.Export.SourceRevision,
		},
	}

	manifestByArchetypeID := make(map[string]manifestEntryRecord, len(mapRecord.Export.StaticEntities.Manifest))
	for _, entry := range mapRecord.Export.StaticEntities.Manifest {
		manifestByArchetypeID[entry.Archetype.ID] = entry
	}

	chunkCountX := int(math.Ceil(float64(exportedMap.Extent.WidthTiles) / float64(exportedMap.Resolution.ChunkSizeTiles)))
	chunkCountZ := int(math.Ceil(float64(exportedMap.Extent.HeightTiles) / float64(exportedMap.Resolution.ChunkSizeTiles)))
	chunks := make([]*TerrainChunk, 0, chunkCountX*chunkCountZ)
	uniquePlacements := make(map[string]staticEntityPlacementRecord)

	for chunkZ := 0; chunkZ < chunkCountZ; chunkZ++ {
		for chunkX := 0; chunkX < chunkCountX; chunkX++ {
			record, err := api.fetchChunkBinary(ctx, exportedMap.ID, chunkX, chunkZ)
			if err != nil {
				return nil, err
			}

			chunk, err := terrainChunkFromBinary(record, exportedMap.Resolution)
			if err != nil {
				return nil, fmt.Errorf("decode chunk %d,%d: %w", chunkX, chunkZ, err)
			}
			chunks = append(chunks, chunk)

			for _, entity := range record.StaticEntities {
				existing, exists := uniquePlacements[entity.ID]
				if exists {
					if !staticEntityPlacementsEqual(existing, entity) {
						return nil, fmt.Errorf("static entity %s differed across chunk payloads", entity.ID)
					}
					continue
				}
				uniquePlacements[entity.ID] = entity
			}
		}
	}

	cellSize := exportedMap.Resolution.MetersPerTile * float64(exportedMap.Resolution.ChunkSizeTiles)
	terrain := NewTerrainSet(chunks, cellSize)
	ids := make([]string, 0, len(uniquePlacements))
	for id := range uniquePlacements {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	entities := make([]*ResolvedStaticEntity, 0, len(ids))
	index := NewSpatialIndex(cellSize)

	for _, id := range ids {
		entity := uniquePlacements[id]
		manifest, ok := manifestByArchetypeID[entity.ArchetypeID]
		if !ok {
			return nil, fmt.Errorf("static entity %s referenced archetype %s missing from export manifest", entity.ID, entity.ArchetypeID)
		}

		resolved, err := resolveStaticEntity(exportedMap.ID, entity, manifest, terrain)
		if err != nil {
			return nil, err
		}
		entities = append(entities, resolved)

		if resolved.State == "active" {
			index.Insert(resolved)
		}
	}

	return &World{
		Map:      exportedMap,
		Terrain:  terrain,
		Entities: entities,
		index:    index,
	}, nil
}

type apiClient struct {
	baseURL string
	client  *http.Client
}

func (c *apiClient) fetchExportedMap(ctx context.Context, exportMapID string) (*mapMetadataRecord, error) {
	endpoint, err := c.joinPath("api", "maps", "exports", exportMapID)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch export metadata: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("fetch export metadata: unexpected status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	var record mapMetadataRecord
	if err := json.NewDecoder(response.Body).Decode(&record); err != nil {
		return nil, fmt.Errorf("decode export metadata: %w", err)
	}

	return &record, nil
}

func (c *apiClient) fetchChunkBinary(ctx context.Context, mapID string, chunkX, chunkZ int) (*binaryChunkRecord, error) {
	endpoint, err := c.joinPath("api", "maps", mapID, "chunks", strconv.Itoa(chunkX), strconv.Itoa(chunkZ), "binary")
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch chunk %d,%d: %w", chunkX, chunkZ, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("fetch chunk %d,%d: unexpected status %d: %s", chunkX, chunkZ, response.StatusCode, strings.TrimSpace(string(body)))
	}

	record, err := decodeChunkMultipart(response)
	if err != nil {
		return nil, fmt.Errorf("fetch chunk %d,%d: %w", chunkX, chunkZ, err)
	}

	return record, nil
}

func (c *apiClient) joinPath(parts ...string) (string, error) {
	parsed, err := url.Parse(c.baseURL)
	if err != nil {
		return "", fmt.Errorf("parse base URL: %w", err)
	}

	allParts := []string{parsed.Path}
	allParts = append(allParts, parts...)
	parsed.Path = path.Join(allParts...)
	return parsed.String(), nil
}

func decodeChunkMultipart(response *http.Response) (*binaryChunkRecord, error) {
	contentType := response.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, fmt.Errorf("parse content type: %w", err)
	}
	if mediaType != "multipart/form-data" {
		return nil, fmt.Errorf("expected multipart/form-data response, got %s", mediaType)
	}

	boundary := params["boundary"]
	if boundary == "" {
		return nil, fmt.Errorf("missing multipart boundary")
	}

	reader := multipart.NewReader(response.Body, boundary)
	fields := make(map[string]string)
	var heights []byte
	var staticEntities []staticEntityPlacementRecord

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read multipart part: %w", err)
		}

		partName := part.FormName()
		partBytes, err := io.ReadAll(part)
		part.Close()
		if err != nil {
			return nil, fmt.Errorf("read multipart field %s: %w", partName, err)
		}

		switch partName {
		case "heights":
			heights = partBytes
		case "staticEntitiesJson":
			fields[partName] = string(partBytes)
			if len(strings.TrimSpace(fields[partName])) > 0 {
				if err := json.Unmarshal(partBytes, &staticEntities); err != nil {
					return nil, fmt.Errorf("decode staticEntitiesJson: %w", err)
				}
			}
		default:
			fields[partName] = string(partBytes)
		}
	}

	chunkX, err := parseRequiredInt(fields, "chunkX")
	if err != nil {
		return nil, err
	}
	chunkZ, err := parseRequiredInt(fields, "chunkZ")
	if err != nil {
		return nil, err
	}
	originTileX, err := parseRequiredInt(fields, "originTileX")
	if err != nil {
		return nil, err
	}
	originTileZ, err := parseRequiredInt(fields, "originTileZ")
	if err != nil {
		return nil, err
	}
	samplesHigh, err := parseRequiredInt(fields, "samplesHigh")
	if err != nil {
		return nil, err
	}
	samplesWide, err := parseRequiredInt(fields, "samplesWide")
	if err != nil {
		return nil, err
	}
	tileHeight, err := parseRequiredInt(fields, "tileHeight")
	if err != nil {
		return nil, err
	}
	tileWidth, err := parseRequiredInt(fields, "tileWidth")
	if err != nil {
		return nil, err
	}

	heightEncoding := strings.TrimSpace(fields["layers[height][encoding]"])
	if heightEncoding == "" {
		return nil, fmt.Errorf("missing height encoding")
	}

	record := &binaryChunkRecord{
		ChunkX:         chunkX,
		ChunkZ:         chunkZ,
		MapID:          fields["mapId"],
		OriginTileX:    originTileX,
		OriginTileZ:    originTileZ,
		SamplesHigh:    samplesHigh,
		SamplesWide:    samplesWide,
		TileHeight:     tileHeight,
		TileWidth:      tileWidth,
		HeightEncoding: heightEncoding,
		HeightBytes:    heights,
		StaticEntities: staticEntities,
	}

	if record.HeightEncoding != "float32" {
		record.HeightMin, err = parseRequiredFloat(fields, "layers[height][minHeight]")
		if err != nil {
			return nil, err
		}
		record.HeightStep, err = parseRequiredFloat(fields, "layers[height][step]")
		if err != nil {
			return nil, err
		}
	}

	return record, nil
}

func terrainChunkFromBinary(record *binaryChunkRecord, resolution Resolution) (*TerrainChunk, error) {
	heights, err := decodeHeights(record.HeightEncoding, record.HeightBytes, record.HeightMin, record.HeightStep)
	if err != nil {
		return nil, err
	}

	return &TerrainChunk{
		ChunkX:        record.ChunkX,
		ChunkZ:        record.ChunkZ,
		MapID:         record.MapID,
		OriginTileX:   record.OriginTileX,
		OriginTileZ:   record.OriginTileZ,
		SamplesHigh:   record.SamplesHigh,
		SamplesWide:   record.SamplesWide,
		TileHeight:    record.TileHeight,
		TileWidth:     record.TileWidth,
		SampleSpacing: resolution.MetersPerTile,
		Heights:       heights,
		Bounds: AxisAlignedBox2D{
			MinX: float64(record.OriginTileX) * resolution.MetersPerTile,
			MinZ: float64(record.OriginTileZ) * resolution.MetersPerTile,
			MaxX: float64(record.OriginTileX+record.TileWidth) * resolution.MetersPerTile,
			MaxZ: float64(record.OriginTileZ+record.TileHeight) * resolution.MetersPerTile,
		},
	}, nil
}

func decodeHeights(encoding string, payload []byte, minHeight, step float64) ([]float64, error) {
	switch encoding {
	case "uint16":
		if len(payload)%2 != 0 {
			return nil, fmt.Errorf("uint16 height payload length %d is invalid", len(payload))
		}
		heights := make([]float64, len(payload)/2)
		for index := range heights {
			value := binary.LittleEndian.Uint16(payload[index*2:])
			heights[index] = minHeight + float64(value)*step
		}
		return heights, nil
	case "float32":
		if len(payload)%4 != 0 {
			return nil, fmt.Errorf("float32 height payload length %d is invalid", len(payload))
		}
		heights := make([]float64, len(payload)/4)
		for index := range heights {
			bits := binary.LittleEndian.Uint32(payload[index*4:])
			heights[index] = float64(math.Float32frombits(bits))
		}
		return heights, nil
	default:
		return nil, fmt.Errorf("unsupported height encoding %q", encoding)
	}
}

func resolveStaticEntity(mapID string, placement staticEntityPlacementRecord, manifest manifestEntryRecord, terrain *TerrainSet) (*ResolvedStaticEntity, error) {
	footprintWidth := manifest.AssetVersion.Footprint.WidthMeters * placement.Scale
	footprintDepth := manifest.AssetVersion.Footprint.DepthMeters * placement.Scale
	collisionWidth := manifest.AssetVersion.CollisionBox.WidthMeters * placement.Scale
	collisionDepth := manifest.AssetVersion.CollisionBox.DepthMeters * placement.Scale
	collisionHeight := manifest.AssetVersion.CollisionBox.HeightMeters * placement.Scale

	grounding, ok := computeGrounding(
		terrain,
		placement.Position.X,
		placement.Position.Z,
		footprintDepth,
		footprintWidth,
		placement.Rotation.Yaw,
		manifest.AssetVersion.MaxHeightDeltaMeters,
		placement.YOffset,
	)
	if !ok {
		return nil, fmt.Errorf("static entity %s could not be grounded from exported terrain", placement.ID)
	}

	corners := getFootprintCorners(
		placement.Position.X,
		placement.Position.Z,
		footprintWidth,
		footprintDepth,
		placement.Rotation.Yaw,
	)
	bounds := getFootprintAABB(corners)

	return &ResolvedStaticEntity{
		ID:                    placement.ID,
		MapID:                 mapID,
		Label:                 placement.Label,
		ArchetypeID:           placement.ArchetypeID,
		AssetVersionID:        manifest.Archetype.AssetVersionID,
		State:                 placement.State,
		PositionX:             placement.Position.X,
		PositionZ:             placement.Position.Z,
		YawDegrees:            placement.Rotation.Yaw,
		Scale:                 placement.Scale,
		YOffset:               placement.YOffset,
		CollisionClass:        manifest.AssetVersion.CollisionClass,
		FootprintWidthMeters:  footprintWidth,
		FootprintDepthMeters:  footprintDepth,
		CollisionWidthMeters:  collisionWidth,
		CollisionDepthMeters:  collisionDepth,
		CollisionHeightMeters: collisionHeight,
		MaxHeightDeltaMeters:  manifest.AssetVersion.MaxHeightDeltaMeters,
		EffectiveY:            grounding.AverageHeight,
		GroundingValid:        grounding.Valid,
		FootprintCorners:      corners,
		FootprintAABB:         bounds,
		CollisionOBB: OrientedBox3D{
			Center: Vector3{
				X: placement.Position.X,
				Y: grounding.AverageHeight + collisionHeight*0.5,
				Z: placement.Position.Z,
			},
			HalfWidthMeters:  collisionWidth * 0.5,
			HalfDepthMeters:  collisionDepth * 0.5,
			HalfHeightMeters: collisionHeight * 0.5,
			YawDegrees:       placement.Rotation.Yaw,
			YawRadians:       placement.Rotation.Yaw * math.Pi / 180,
		},
	}, nil
}

func parseRequiredInt(fields map[string]string, key string) (int, error) {
	raw := strings.TrimSpace(fields[key])
	if raw == "" {
		return 0, fmt.Errorf("missing integer field %s", key)
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid integer field %s: %w", key, err)
	}

	return value, nil
}

func parseRequiredFloat(fields map[string]string, key string) (float64, error) {
	raw := strings.TrimSpace(fields[key])
	if raw == "" {
		return 0, fmt.Errorf("missing float field %s", key)
	}

	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid float field %s: %w", key, err)
	}

	return value, nil
}

func staticEntityPlacementsEqual(a, b staticEntityPlacementRecord) bool {
	return a.ID == b.ID &&
		a.MapID == b.MapID &&
		a.ArchetypeID == b.ArchetypeID &&
		a.Position.X == b.Position.X &&
		a.Position.Z == b.Position.Z &&
		a.Rotation.Yaw == b.Rotation.Yaw &&
		a.Scale == b.Scale &&
		a.State == b.State &&
		a.YOffset == b.YOffset
}
