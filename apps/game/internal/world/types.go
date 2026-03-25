package world

type Vector2 struct {
	X float64
	Z float64
}

type Vector3 struct {
	X float64
	Y float64
	Z float64
}

type AxisAlignedBox2D struct {
	MinX float64
	MinZ float64
	MaxX float64
	MaxZ float64
}

type OrientedBox3D struct {
	Center           Vector3
	HalfWidthMeters  float64
	HalfDepthMeters  float64
	HalfHeightMeters float64
	YawDegrees       float64
	YawRadians       float64
}

type Resolution struct {
	MetersPerTile  float64
	ChunkSizeTiles int
}

type MapExtent struct {
	Kind         string
	WidthMeters  float64
	HeightMeters float64
	WidthTiles   int
	HeightTiles  int
	WrapX        bool
	WrapZ        bool
}

type ExportInfo struct {
	Bounds         AxisAlignedBox2D
	ExportedAt     string
	SourceMapID    string
	SourceRevision int
}

type ExportedMap struct {
	ID         string
	Kind       string
	Name       *string
	Extent     MapExtent
	Resolution Resolution
	Export     ExportInfo
}

type TerrainChunk struct {
	ChunkX        int
	ChunkZ        int
	MapID         string
	OriginTileX   int
	OriginTileZ   int
	SamplesHigh   int
	SamplesWide   int
	TileHeight    int
	TileWidth     int
	SampleSpacing float64
	Heights       []float64
	Bounds        AxisAlignedBox2D
}

type ResolvedStaticEntity struct {
	ID                    string
	MapID                 string
	Label                 *string
	ArchetypeID           string
	AssetVersionID        string
	State                 string
	PositionX             float64
	PositionZ             float64
	YawDegrees            float64
	Scale                 float64
	YOffset               float64
	CollisionClass        string
	FootprintWidthMeters  float64
	FootprintDepthMeters  float64
	CollisionWidthMeters  float64
	CollisionDepthMeters  float64
	CollisionHeightMeters float64
	MaxHeightDeltaMeters  float64
	EffectiveY            float64
	GroundingValid        bool
	FootprintCorners      [4]Vector2
	FootprintAABB         AxisAlignedBox2D
	CollisionOBB          OrientedBox3D
}

type World struct {
	Map      ExportedMap
	Terrain  *TerrainSet
	Entities []*ResolvedStaticEntity
	index    *SpatialIndex
}

func (w *World) QueryStaticObstaclesInRadius(x, z, radius float64) []*ResolvedStaticEntity {
	if w == nil || w.index == nil {
		return nil
	}

	return w.index.QueryRadius(x, z, radius)
}

func (w *World) QueryStaticObstaclesInAABB(minX, minZ, maxX, maxZ float64) []*ResolvedStaticEntity {
	if w == nil || w.index == nil {
		return nil
	}

	return w.index.QueryAABB(AxisAlignedBox2D{
		MinX: minX,
		MinZ: minZ,
		MaxX: maxX,
		MaxZ: maxZ,
	})
}

func (w *World) ActiveObstacleCount() int {
	if w == nil || w.index == nil {
		return 0
	}

	return w.index.Count()
}
