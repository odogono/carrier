import { evaluateHeightEncodingOptions } from './height-encoding-evaluation';

const formatBytes = (value: number) => `${(value / 1024).toFixed(2)} KiB`;
const formatMetres = (value: number) => `${value.toFixed(4)} m`;
const formatMicros = (value: number) => `${value.toFixed(2)} us`;
const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const report = evaluateHeightEncodingOptions();

console.log('# Map Data Evaluation');
console.log('');
console.log('Representative chunk');
console.log(
  `- samples: ${report.chunk.sampleCount} (${formatBytes(report.chunk.currentStorageBytes)} float32 storage)`
);
console.log(`- current JSON payload: ${formatBytes(report.chunk.currentJsonBytes)}`);
console.log(
  `- current binary envelope estimate: ${formatBytes(report.chunk.currentWireBinaryEnvelopeBytes)}`
);
console.log('');

for (const candidate of [report.chunk.uint16, report.chunk.uint8]) {
  console.log(candidate.encoding);
  console.log(`- encoded bytes: ${formatBytes(candidate.encodedBytes)}`);
  console.log(`- decode/chunk: ${formatMicros(candidate.decodeMicrosecondsPerChunk)}`);
  console.log(`- avg sample error: ${formatMetres(candidate.averageErrorMetres)}`);
  console.log(`- max sample error: ${formatMetres(candidate.maxErrorMetres)}`);
  console.log(
    `- avg tile-average error: ${formatMetres(candidate.averageTileAverageErrorMetres)}`
  );
  console.log(
    `- max tile-average error: ${formatMetres(candidate.maxTileAverageErrorMetres)}`
  );
  console.log(
    `- water mismatches: ${candidate.waterMismatchCount}/${candidate.tileCount} (${formatPercent(candidate.waterMismatchRate)})`
  );
  console.log(
    `- shoreline mismatches: ${candidate.shorelineMismatchCount}/${candidate.tileCount} (${formatPercent(candidate.shorelineMismatchRate)})`
  );
  console.log(
    `- color mismatches: ${candidate.colorMismatchCount}/${candidate.tileCount} (${formatPercent(candidate.colorMismatchRate)})`
  );
  console.log('');
}

console.log('Large map storage totals');

for (const aggregate of report.maps) {
  console.log(
    `- ${aggregate.generator} ${aggregate.sizeTiles}x${aggregate.sizeTiles}: ${aggregate.chunkCount} chunks, float32 DB ${formatBytes(aggregate.currentStorageBytes)}, current JSON ${formatBytes(aggregate.currentJsonBytes)}, uint16 DB ${formatBytes(aggregate.uint16Bytes)}, uint8 DB ${formatBytes(aggregate.uint8Bytes)}`
  );
}

console.log('');
console.log(
  `Recommendation: ${report.recommendation.summary} (uint16=${report.recommendation.uint16}, uint8=${report.recommendation.uint8})`
);
