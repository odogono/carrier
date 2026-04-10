import type { MapMetadataSummary } from 'carrier-contracts/types';

const compareMapsByRecency = (
  left: MapMetadataSummary,
  right: MapMetadataSummary
) => {
  const updatedDelta =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();

  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
};

export const mergeCreatedMapIntoList = (
  current: MapMetadataSummary[] | undefined,
  created: MapMetadataSummary
) => [...(current ?? []).filter(map => map.id !== created.id), created].sort(compareMapsByRecency);
