import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../../../../');

const readGlbJson = async (path: string) => {
  const bytes = await Bun.file(path).arrayBuffer();
  const view = new DataView(bytes);
  let offset = 12;

  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e_4f_53_4a) {
      return JSON.parse(
        new TextDecoder()
          .decode(new Uint8Array(bytes, offset + 8, length))
          .replace(/\u0000+$/, '')
      ) as { nodes?: Array<{ name?: string }> };
    }
    offset += 8 + length;
  }

  throw new Error(`GLB ${path} has no JSON chunk`);
};

test('zarch player tank asset exposes the articulated runtime contract', async () => {
  for (const path of [
    resolve(root, 'test-assets/low-poly-tank.glb'),
    resolve(root, 'assets/zarch/zarch-player-tank.glb')
  ]) {
    const glb = await readGlbJson(path);
    const names = new Set(glb.nodes?.map(node => node.name));

    expect(names).toContain('Hull');
    expect(names).toContain('TurretPivot');
    expect(names).toContain('CannonPivot');
    expect(names).toContain('Muzzle');
  }
});
