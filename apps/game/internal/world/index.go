package world

import (
	"math"
	"sort"
)

type gridCell struct {
	X int
	Z int
}

type SpatialIndex struct {
	cellSize float64
	cells    map[gridCell][]*ResolvedStaticEntity
	count    int
}

func NewSpatialIndex(cellSize float64) *SpatialIndex {
	if cellSize <= 0 {
		cellSize = 1
	}

	return &SpatialIndex{
		cellSize: cellSize,
		cells:    make(map[gridCell][]*ResolvedStaticEntity),
	}
}

func (s *SpatialIndex) Insert(entity *ResolvedStaticEntity) {
	if s == nil || entity == nil {
		return
	}

	minCellX, maxCellX, minCellZ, maxCellZ := s.cellRange(entity.FootprintAABB)
	for cellZ := minCellZ; cellZ <= maxCellZ; cellZ++ {
		for cellX := minCellX; cellX <= maxCellX; cellX++ {
			key := gridCell{X: cellX, Z: cellZ}
			s.cells[key] = append(s.cells[key], entity)
		}
	}

	s.count++
}

func (s *SpatialIndex) Count() int {
	if s == nil {
		return 0
	}
	return s.count
}

func (s *SpatialIndex) QueryAABB(bounds AxisAlignedBox2D) []*ResolvedStaticEntity {
	if s == nil {
		return nil
	}

	return s.query(bounds, func(entity *ResolvedStaticEntity) bool {
		return aabbIntersects(entity.FootprintAABB, bounds)
	})
}

func (s *SpatialIndex) QueryRadius(x, z, radius float64) []*ResolvedStaticEntity {
	if s == nil {
		return nil
	}

	search := AxisAlignedBox2D{
		MinX: x - radius,
		MinZ: z - radius,
		MaxX: x + radius,
		MaxZ: z + radius,
	}

	return s.query(search, func(entity *ResolvedStaticEntity) bool {
		return circleIntersectsAABB(x, z, radius, entity.FootprintAABB)
	})
}

func (s *SpatialIndex) query(bounds AxisAlignedBox2D, include func(entity *ResolvedStaticEntity) bool) []*ResolvedStaticEntity {
	minCellX, maxCellX, minCellZ, maxCellZ := s.cellRange(bounds)
	resultsByID := make(map[string]*ResolvedStaticEntity)

	for cellZ := minCellZ; cellZ <= maxCellZ; cellZ++ {
		for cellX := minCellX; cellX <= maxCellX; cellX++ {
			for _, entity := range s.cells[gridCell{X: cellX, Z: cellZ}] {
				if _, seen := resultsByID[entity.ID]; seen {
					continue
				}
				if !include(entity) {
					continue
				}
				resultsByID[entity.ID] = entity
			}
		}
	}

	ids := make([]string, 0, len(resultsByID))
	for id := range resultsByID {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	results := make([]*ResolvedStaticEntity, 0, len(ids))
	for _, id := range ids {
		results = append(results, resultsByID[id])
	}

	return results
}

func (s *SpatialIndex) cellRange(bounds AxisAlignedBox2D) (int, int, int, int) {
	minCellX := int(math.Floor(bounds.MinX / s.cellSize))
	maxCellX := int(math.Floor(bounds.MaxX / s.cellSize))
	minCellZ := int(math.Floor(bounds.MinZ / s.cellSize))
	maxCellZ := int(math.Floor(bounds.MaxZ / s.cellSize))

	return minCellX, maxCellX, minCellZ, maxCellZ
}
