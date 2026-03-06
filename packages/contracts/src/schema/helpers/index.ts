import { toBoolean } from '../../internal/boolean';
import { z } from 'zod';

import { oc } from '@orpc/contract';
import { type Route } from '@orpc/server';

const coerceBoolean = z.preprocess((val) => toBoolean(val), z.boolean());

export const HealthCheckRoute: Route = {
  description: 'Check the health of the API',
  method: 'GET',
  path: '/health',
  tags: ['helpers'],
} as const;

export const HealthCheckInput = z.object({});
export type HealthCheckInput = z.infer<typeof HealthCheckInput>;

export const HealthCheckOutput = z.object({
  status: z.string(),
  timestamp: z.string(),
});
export type HealthCheckOutput = z.infer<typeof HealthCheckOutput>;

export const helpersContract = {
  healthCheck: oc
    .route(HealthCheckRoute)
    .input(HealthCheckInput)
    .output(HealthCheckOutput),
};
