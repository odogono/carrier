package world

import "math"

type TerrainSet struct {
	Chunks   []*TerrainChunk
	cellSize float64
	grid     map[[2]int]*TerrainChunk
}

func NewTerrainSet(chunks []*TerrainChunk, cellSize float64) *TerrainSet {
	grid := make(map[[2]int]*TerrainChunk, len(chunks))
	for _, chunk := range chunks {
		grid[[2]int{chunk.ChunkX, chunk.ChunkZ}] = chunk
	}
	return &TerrainSet{
		Chunks:   chunks,
		cellSize: cellSize,
		grid:     grid,
	}
}

func (t *TerrainSet) SampleHeight(x, z float64) (float64, bool) {
	if t == nil {
		return 0, false
	}

	if t.cellSize > 0 {
		cx := int(math.Floor(x / t.cellSize))
		cz := int(math.Floor(z / t.cellSize))
		chunk, ok := t.grid[[2]int{cx, cz}]
		if !ok {
			return 0, false
		}
		return sampleChunkHeight(chunk, x, z)
	}

	for _, chunk := range t.Chunks {
		if x < chunk.Bounds.MinX || x > chunk.Bounds.MaxX || z < chunk.Bounds.MinZ || z > chunk.Bounds.MaxZ {
			continue
		}

		height, ok := sampleChunkHeight(chunk, x, z)
		if ok {
			return height, true
		}
	}

	return 0, false
}

func sampleChunkHeight(chunk *TerrainChunk, x, z float64) (float64, bool) {
	localX := (x - float64(chunk.OriginTileX)*chunk.SampleSpacing) / chunk.SampleSpacing
	localZ := (z - float64(chunk.OriginTileZ)*chunk.SampleSpacing) / chunk.SampleSpacing

	if localX < 0 || localZ < 0 || localX > float64(chunk.SamplesWide-1) || localZ > float64(chunk.SamplesHigh-1) {
		return 0, false
	}

	x0 := int(math.Floor(localX))
	z0 := int(math.Floor(localZ))
	x1 := min(x0+1, chunk.SamplesWide-1)
	z1 := min(z0+1, chunk.SamplesHigh-1)
	tx := localX - float64(x0)
	tz := localZ - float64(z0)
	rowStride := chunk.SamplesWide

	h00, ok := heightAt(chunk.Heights, z0*rowStride+x0)
	if !ok {
		return 0, false
	}
	h10, ok := heightAt(chunk.Heights, z0*rowStride+x1)
	if !ok {
		return 0, false
	}
	h01, ok := heightAt(chunk.Heights, z1*rowStride+x0)
	if !ok {
		return 0, false
	}
	h11, ok := heightAt(chunk.Heights, z1*rowStride+x1)
	if !ok {
		return 0, false
	}

	top := h00*(1-tx) + h10*tx
	bottom := h01*(1-tx) + h11*tx
	return top*(1-tz) + bottom*tz, true
}

func heightAt(heights []float64, index int) (float64, bool) {
	if index < 0 || index >= len(heights) {
		return 0, false
	}
	return heights[index], true
}

