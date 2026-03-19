import { ORPCError } from '@orpc/server';

import { MapRepositoryError } from '@/maps/repository';

export const asOrpcError = (error: unknown): never => {
  if (error instanceof MapRepositoryError) {
    throw new ORPCError(error.code, {
      message: error.message
    });
  }

  throw error;
};
