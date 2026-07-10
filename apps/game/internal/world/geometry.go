package world

import "math"

type groundingSample struct {
	X     float64
	Z     float64
	Label string
}

type groundingResult struct {
	AverageTerrainHeightMeters float64
	EffectiveHeightMeters      float64
	MaxHeightDeltaMeters       float64
	Valid                      bool
}

func rotateWorldOffset(x, z, yawDegrees float64) Vector2 {
	yawRadians := yawDegrees * math.Pi / 180
	cosine := math.Cos(yawRadians)
	sine := math.Sin(yawRadians)

	return Vector2{
		X: x*cosine - z*sine,
		Z: x*sine + z*cosine,
	}
}

func getGroundingSamplePoints(anchorX, anchorZ, depthMeters, widthMeters, yawDegrees float64) []groundingSample {
	halfWidth := widthMeters * 0.5
	halfDepth := depthMeters * 0.5

	offsets := []groundingSample{
		{Label: "center", X: 0, Z: 0},
		{Label: "front-left", X: -halfWidth, Z: -halfDepth},
		{Label: "front-right", X: halfWidth, Z: -halfDepth},
		{Label: "back-left", X: -halfWidth, Z: halfDepth},
		{Label: "back-right", X: halfWidth, Z: halfDepth},
	}

	samples := make([]groundingSample, 0, len(offsets))
	for _, offset := range offsets {
		rotated := rotateWorldOffset(offset.X, offset.Z, yawDegrees)
		samples = append(samples, groundingSample{
			Label: offset.Label,
			X:     anchorX + rotated.X,
			Z:     anchorZ + rotated.Z,
		})
	}

	return samples
}

func computeGrounding(terrain *TerrainSet, anchorX, anchorZ, depthMeters, widthMeters, yawDegrees, maxHeightDeltaMeters, scaledYOffsetMeters float64) (groundingResult, bool) {
	samplePoints := getGroundingSamplePoints(anchorX, anchorZ, depthMeters, widthMeters, yawDegrees)
	heights := make([]float64, 0, len(samplePoints))

	for _, sample := range samplePoints {
		height, ok := terrain.SampleHeight(sample.X, sample.Z)
		if !ok {
			return groundingResult{}, false
		}
		heights = append(heights, height)
	}

	minHeight := heights[0]
	maxHeight := heights[0]
	sum := 0.0
	for _, height := range heights {
		if height < minHeight {
			minHeight = height
		}
		if height > maxHeight {
			maxHeight = height
		}
		sum += height
	}

	averageHeight := sum / float64(len(heights))
	maxHeightDelta := maxHeight - minHeight

	return groundingResult{
		AverageTerrainHeightMeters: averageHeight,
		EffectiveHeightMeters:      averageHeight + scaledYOffsetMeters,
		MaxHeightDeltaMeters:       maxHeightDelta,
		Valid:                      maxHeightDelta <= maxHeightDeltaMeters,
	}, true
}

func getFootprintCorners(centerX, centerZ, widthMeters, depthMeters, yawDegrees float64) [4]Vector2 {
	halfWidth := widthMeters * 0.5
	halfDepth := depthMeters * 0.5
	offsets := [4]Vector2{
		rotateWorldOffset(-halfWidth, -halfDepth, yawDegrees),
		rotateWorldOffset(halfWidth, -halfDepth, yawDegrees),
		rotateWorldOffset(halfWidth, halfDepth, yawDegrees),
		rotateWorldOffset(-halfWidth, halfDepth, yawDegrees),
	}

	var corners [4]Vector2
	for index, offset := range offsets {
		corners[index] = Vector2{
			X: centerX + offset.X,
			Z: centerZ + offset.Z,
		}
	}

	return corners
}

func getFootprintAABB(corners [4]Vector2) AxisAlignedBox2D {
	bounds := AxisAlignedBox2D{
		MinX: corners[0].X,
		MinZ: corners[0].Z,
		MaxX: corners[0].X,
		MaxZ: corners[0].Z,
	}

	for _, corner := range corners[1:] {
		if corner.X < bounds.MinX {
			bounds.MinX = corner.X
		}
		if corner.X > bounds.MaxX {
			bounds.MaxX = corner.X
		}
		if corner.Z < bounds.MinZ {
			bounds.MinZ = corner.Z
		}
		if corner.Z > bounds.MaxZ {
			bounds.MaxZ = corner.Z
		}
	}

	return bounds
}

func aabbIntersects(left, right AxisAlignedBox2D) bool {
	return left.MinX <= right.MaxX &&
		left.MaxX >= right.MinX &&
		left.MinZ <= right.MaxZ &&
		left.MaxZ >= right.MinZ
}

func circleIntersectsAABB(x, z, radius float64, bounds AxisAlignedBox2D) bool {
	clampedX := math.Max(bounds.MinX, math.Min(x, bounds.MaxX))
	clampedZ := math.Max(bounds.MinZ, math.Min(z, bounds.MaxZ))
	deltaX := x - clampedX
	deltaZ := z - clampedZ

	return deltaX*deltaX+deltaZ*deltaZ <= radius*radius
}
