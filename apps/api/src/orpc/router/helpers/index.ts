import {
  HealthCheckInput,
  HealthCheckOutput,
  HealthCheckRoute
} from '../../../../../../packages/contracts/src/schema/helpers';
import { createLog } from 'odgn-ts-helpers/log';

import { os } from '@orpc/server';

const log = createLog('orpc-router-helpers');

const healthCheck = os
  .route(HealthCheckRoute)
  .input(HealthCheckInput)
  .output(HealthCheckOutput)
  .handler(async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  });

export const helpers = {
  healthCheck
};
