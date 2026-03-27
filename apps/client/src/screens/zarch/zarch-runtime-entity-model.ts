import { apiUrl } from '@/helpers/api-link';
import {
  createNormalizedModel,
  fetchAndParseGltf,
  setModelShadowProps
} from '@/helpers/three-model-utils';

import type { ZarchRuntimeEntity } from 'carrier-contracts/types';

export type { NormalizedModel } from '@/helpers/three-model-utils';

export const getZarchRuntimeEntityModelUrl = (id: string) =>
  `${apiUrl}/zarch/runtime-entities/${encodeURIComponent(id)}/model`;

export const loadZarchRuntimeEntityModel = async (
  runtimeEntity: Pick<ZarchRuntimeEntity, 'id'>
) => {
  const url = getZarchRuntimeEntityModelUrl(runtimeEntity.id);
  const gltf = await fetchAndParseGltf(
    url,
    `Zarch runtime entity model ${runtimeEntity.id}`
  );
  const normalized = createNormalizedModel(gltf.scene);
  setModelShadowProps(normalized.object);
  return normalized;
};
