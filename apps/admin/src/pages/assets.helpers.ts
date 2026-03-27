import type { AssetVersionListItem, AssetVersionStatus } from 'carrier-contracts/types';

export type AssetWorkflowFilter =
  | 'review'
  | 'ready'
  | 'failed'
  | 'bound'
  | 'unbound'
  | 'archived'
  | 'all';

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const buildAssetSearchIndex = (item: AssetVersionListItem) =>
  [
    item.asset.id,
    item.asset.originalFile.path,
    item.asset.runtimeFile?.path ?? '',
    ...item.usage.archetypeIds,
    ...item.usage.runtimeEntityIds,
    ...item.asset.diagnostics
  ]
    .join(' ')
    .toLowerCase();

export const matchesAssetWorkflowFilter = (
  item: AssetVersionListItem,
  filter: AssetWorkflowFilter
) => {
  switch (filter) {
    case 'review':
      return item.asset.status === 'review';
    case 'ready':
      return item.asset.status === 'ready';
    case 'failed':
      return item.asset.status === 'failed';
    case 'bound':
      return (
        item.usage.archetypeIds.length > 0 || item.usage.runtimeEntityIds.length > 0
      );
    case 'unbound':
      return (
        item.usage.archetypeIds.length === 0 &&
        item.usage.runtimeEntityIds.length === 0
      );
    case 'archived':
      return item.asset.status === 'archived';
    case 'all':
      return true;
  }
};

export const filterAssetItems = ({
  items,
  search,
  status,
  workflow
}: {
  items: AssetVersionListItem[];
  search: string;
  status: AssetVersionStatus | 'all';
  workflow: AssetWorkflowFilter;
}) => {
  const query = normalizeSearch(search);

  return items.filter(item => {
    if (status !== 'all' && item.asset.status !== status) {
      return false;
    }

    if (!matchesAssetWorkflowFilter(item, workflow)) {
      return false;
    }

    if (query.length === 0) {
      return true;
    }

    return buildAssetSearchIndex(item).includes(query);
  });
};

export const sortAssetItems = (items: AssetVersionListItem[]) =>
  [...items].sort(
    (left, right) =>
      new Date(right.asset.updatedAt).getTime() -
        new Date(left.asset.updatedAt).getTime() ||
      left.asset.id.localeCompare(right.asset.id)
  );
