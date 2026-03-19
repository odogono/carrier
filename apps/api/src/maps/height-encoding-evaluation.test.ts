import { describe, expect, test } from 'bun:test';

import { evaluateRepresentativeChunkEncodingOptions } from './height-encoding-evaluation';

describe('height encoding evaluation', () => {
  test('uint16 keeps shoreline-sensitive metrics stable on the representative chunk', () => {
    const report = evaluateRepresentativeChunkEncodingOptions();

    expect(report.uint16.encodedBytes).toBe(report.currentStorageBytes / 2);
    expect(report.uint16.waterMismatchCount).toBe(0);
    expect(report.uint16.shorelineMismatchCount).toBe(0);
    expect(report.uint16.maxTileAverageErrorMetres).toBeLessThan(0.05);
  });

  test('uint8 is materially less accurate than uint16 on the representative chunk', () => {
    const report = evaluateRepresentativeChunkEncodingOptions();

    expect(report.uint8.encodedBytes).toBe(report.currentStorageBytes / 4);
    expect(report.uint8.maxTileAverageErrorMetres).toBeGreaterThan(
      report.uint16.maxTileAverageErrorMetres
    );
    expect(report.uint8.colorMismatchRate).toBeGreaterThanOrEqual(
      report.uint16.colorMismatchRate
    );
  });
});
