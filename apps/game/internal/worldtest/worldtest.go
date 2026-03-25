package worldtest

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"strconv"
	"testing"
)

type ChunkFields struct {
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
	StaticEntities any
}

func WriteMultipartChunk(t *testing.T, w http.ResponseWriter, chunk ChunkFields) {
	t.Helper()

	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)

	writeField := func(name, value string) {
		fw, err := mw.CreateFormField(name)
		if err != nil {
			t.Fatalf("create field %s: %v", name, err)
		}
		if _, err := fw.Write([]byte(value)); err != nil {
			t.Fatalf("write field %s: %v", name, err)
		}
	}

	writeFileField := func(name string, value []byte) {
		fw, err := mw.CreateFormFile(name, "")
		if err != nil {
			t.Fatalf("create file field %s: %v", name, err)
		}
		if _, err := fw.Write(value); err != nil {
			t.Fatalf("write file field %s: %v", name, err)
		}
	}

	writeField("chunkX", strconv.Itoa(chunk.ChunkX))
	writeField("chunkZ", strconv.Itoa(chunk.ChunkZ))
	writeFileField("heights", chunk.HeightBytes)
	writeField("layers[height][encoding]", chunk.HeightEncoding)
	writeField("layers[height][minHeight]", strconv.FormatFloat(chunk.HeightMin, 'f', -1, 64))
	writeField("layers[height][step]", strconv.FormatFloat(chunk.HeightStep, 'f', -1, 64))
	writeField("layers[height][unit]", "metres")
	writeField("mapId", chunk.MapID)
	writeField("originTileX", strconv.Itoa(chunk.OriginTileX))
	writeField("originTileZ", strconv.Itoa(chunk.OriginTileZ))
	writeField("samplesHigh", strconv.Itoa(chunk.SamplesHigh))
	writeField("samplesWide", strconv.Itoa(chunk.SamplesWide))
	writeField("tileHeight", strconv.Itoa(chunk.TileHeight))
	writeField("tileWidth", strconv.Itoa(chunk.TileWidth))

	staticEntitiesJSON, err := json.Marshal(chunk.StaticEntities)
	if err != nil {
		t.Fatalf("marshal static entities: %v", err)
	}
	writeField("staticEntitiesJson", string(staticEntitiesJSON))

	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	w.Header().Set("Content-Type", mw.FormDataContentType())
	if _, err := w.Write(body.Bytes()); err != nil {
		t.Fatalf("write multipart response: %v", err)
	}
}

func EncodeUint16Heights(values []uint16) []byte {
	buf := make([]byte, len(values)*2)
	for i, v := range values {
		binary.LittleEndian.PutUint16(buf[i*2:], v)
	}
	return buf
}
