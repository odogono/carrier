import { randomUUID } from 'node:crypto';
import type { AssetVersion } from 'carrier-contracts';
import { Elysia } from 'elysia';
import { createLog } from 'odgn-ts-helpers/log';
import { safeParseInt } from 'odgn-ts-helpers/number';
import { z } from 'zod';

import { getAssetPipeline } from '@/maps/assets';
import { MapRepositoryError, getMapRepository } from '@/maps/repository';
import { cors } from '@elysiajs/cors';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { ORPCError, ValidationError, onError } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';

import { router as orpcRouter } from './orpc/router';

const SERVER_HOST = process.env.API_HOST || '0.0.0.0';
const SERVER_PORT = safeParseInt(process.env.API_PORT, 6021);

const log = createLog('server');

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  409: 'Conflict',
  404: 'Not Found'
};

const httpStatusForRepositoryError = (error: MapRepositoryError) => {
  switch (error.code) {
    case 'BAD_REQUEST':
      return 400;
    case 'CONFLICT':
      return 409;
    case 'NOT_FOUND':
      return 404;
  }
};

const respondToRepositoryError = (error: unknown, requestId: string) => {
  if (error instanceof MapRepositoryError) {
    return toJsonErrorResponse(
      httpStatusForRepositoryError(error),
      error.message,
      requestId
    );
  }

  throw error;
};

const toJsonErrorResponse = (
  status: number,
  message: string,
  requestId: string
) =>
  new Response(
    JSON.stringify({
      error: HTTP_STATUS_TEXT[status] ?? 'Error',
      message
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      },
      status
    }
  );

const runtimeResponseOrError = async (
  assetVersionId: string,
  requestId: string,
  notFoundMessage: string
) => {
  let response: Response | null;

  try {
    response = await getAssetPipeline().runtimeResponse(assetVersionId);
  } catch (error) {
    return respondToRepositoryError(error, requestId);
  }

  if (!response) {
    return toJsonErrorResponse(404, notFoundMessage, requestId);
  }

  response.headers.set('X-Request-ID', requestId);
  return response;
};

export const createServer = async () => {
  const openApiHandler = new OpenAPIHandler(orpcRouter, {
    interceptors: [
      onError(error => {
        if (
          error instanceof ORPCError &&
          error.code === 'BAD_REQUEST' &&
          error.cause instanceof ValidationError
        ) {
          // If you only use Zod you can safely cast to ZodIssue[]
          const zodError = new z.ZodError(
            error.cause.issues as z.core.$ZodIssue[]
          );

          throw new ORPCError('INPUT_VALIDATION_FAILED', {
            cause: error.cause,
            data: z.flattenError(zodError),
            message: z.prettifyError(zodError),
            status: 422
          });
        }

        if (
          error instanceof ORPCError &&
          error.code === 'INTERNAL_SERVER_ERROR' &&
          error.cause instanceof ValidationError
        ) {
          throw new ORPCError('OUTPUT_VALIDATION_FAILED', {
            cause: error.cause
          });
        }

        // Identify OpenAPIGeneratorError by name or message pattern
        // (OpenAPIGeneratorError is not exported from @orpc/openapi)
        if (
          error instanceof Error &&
          (error.name === 'OpenAPIGeneratorError' ||
            error.message?.includes('[OpenAPIGenerator]') ||
            error.message?.includes('OpenAPI generation'))
        ) {
          throw new ORPCError('OPENAPI_GENERATOR_ERROR', {
            cause: error,
            message: error.message
          });
        }

        log.error('Error handling ORPC request', { error });
      })
    ],
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: {
            title: 'Carrier API',
            version: '1.0.0'
          }
        }
      })
    ]
  });
  const assetDiagnostics = getAssetPipeline().getDiagnostics();

  log.info('Asset pipeline diagnostics', {
    assetCount: assetDiagnostics.repository.assetCount,
    cwd: assetDiagnostics.cwd,
    dbPath: assetDiagnostics.repository.dbPath,
    pid: process.pid,
    recentAssetIds: assetDiagnostics.repository.recentAssetIds,
    storageRoot: assetDiagnostics.storageRoot
  });

  const app = new Elysia()
    .use(
      cors({
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        origin: [
          'http://localhost:5178',
          'http://localhost:5179',
          'http://localhost:3000',
          'http://localhost:8080',
          'http://localhost',
          ...(process.env.TRUSTED_ORIGINS?.split(',').filter(Boolean) || [])
        ]
      })
    )
    // Request context middleware for request ID and IP tracking
    .derive({ as: 'global' }, ({ request }) => {
      // Generate request ID if not present
      const existingRequestId = request.headers.get('x-request-id');
      const requestId = existingRequestId || randomUUID();

      // Extract real IP (handle forwarded headers)
      const forwardedFor = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      const clientIp =
        forwardedFor?.split(',')[0]?.trim() ||
        realIp ||
        request.headers.get('cf-connecting-ip') ||
        'unknown';

      return {
        clientIp,
        requestId
      };
    })
    .get('/health', () => ({
      status: 'ok',
      timestamp: new Date().toISOString()
    }))
    .get('/api/maps/assets', ({ request, requestId }) => {
      const statusParam = new URL(request.url).searchParams.get('status');
      const status =
        statusParam === null || statusParam === 'all'
          ? undefined
          : (statusParam as AssetVersion['status']);
      const assets = getAssetPipeline().list(status ?? undefined);

      return Response.json(assets, {
        headers: {
          'X-Request-ID': requestId
        }
      });
    })
    .get('/api/maps/assets/:id', ({ params, requestId }) => {
      const assetVersion = getAssetPipeline().get(params.id);

      if (!assetVersion) {
        return toJsonErrorResponse(
          404,
          `Asset version ${params.id} was not found`,
          requestId
        );
      }

      return Response.json(assetVersion, {
        headers: {
          'X-Request-ID': requestId
        }
      });
    })
    .get('/api/maps/assets/:id/runtime', ({ params, requestId }) =>
      runtimeResponseOrError(
        params.id,
        requestId,
        `Runtime artifact for asset version ${params.id} was not found`
      )
    )
    .get('/api/zarch/runtime-entities/:id/model', ({ params, requestId }) => {
      const runtimeEntity = getMapRepository().getZarchRuntimeEntity(params.id);

      if (!runtimeEntity) {
        return toJsonErrorResponse(
          404,
          `Zarch runtime entity ${params.id} was not found`,
          requestId
        );
      }

      return runtimeResponseOrError(
        runtimeEntity.assetVersionId,
        requestId,
        `Runtime artifact for zarch runtime entity ${params.id} was not found`
      );
    })
    .post('/api/maps/assets', async ({ request, requestId }) => {
      try {
        const formData = await request.formData();
        const entry = formData.get('file');

        if (!(entry instanceof File)) {
          return toJsonErrorResponse(
            400,
            'Expected multipart form-data with a file field',
            requestId
          );
        }

        const assetVersion = await getAssetPipeline().upload(entry);

        return Response.json(assetVersion, {
          headers: {
            'X-Request-ID': requestId
          },
          status: 201
        });
      } catch (error) {
        return respondToRepositoryError(error, requestId);
      }
    })

    .all(
      '/api/*',
      async ({
        clientIp,
        request,
        requestId
      }: {
        clientIp: string;
        request: Request;
        requestId: string;
      }) => {
        try {
          const headers: Record<string, string> = {};
          request.headers.forEach((value, key) => {
            headers[key] = value;
          });

          // Ensure request ID is in headers for consistency
          headers['x-request-id'] = requestId;
          headers['x-forwarded-for'] = clientIp;

          const url = new URL(request.url);
          log.debug('API request', {
            method: request.method,
            path: url.pathname,
            requestId
          });

          const { response } = await openApiHandler.handle(request, {
            context: {
              clientIp,
              headers,
              requestId
            },
            prefix: '/api/'
          });

          if (response) {
            // Bun 1.4 drops a FormData body's implicit multipart content-type
            // when `.body` is read before `.headers`, which is the order Elysia
            // uses when it rewraps a returned Response. Reading the headers
            // first materializes the content-type so it survives the rewrap.
            void response.headers.get('content-type');
            return response;
          }

          // No route found - return 404
          log.debug('No route found for', { path: url.pathname, requestId });
          return new Response(
            JSON.stringify({
              error: 'Not Found',
              message: `No route found for ${url.pathname}`
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId
              },
              status: 404
            }
          );
        } catch (error) {
          log.error('Error handling API request', {
            error,
            path: new URL(request.url).pathname,
            requestId
          });
          return new Response(
            JSON.stringify({
              error: 'Internal Server Error',
              message: error instanceof Error ? error.message : 'Unknown error'
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId
              },
              status: 500
            }
          );
        }
      },
      {
        parse: 'none' // Disable Elysia body parser to prevent "body already used" error
      }
    );

  return { app, openApiHandler };
};

// Start the server
const start = async () => {
  log.info('API_ENV', process.env.API_ENV);
  log.info('NODE_ENV', process.env.NODE_ENV);
  log.info('Starting server on port', SERVER_PORT);

  try {
    const { app } = await createServer();

    // Start HTTP server
    // Note: mTLS is handled by nginx on port 8443, which proxies to this server
    // with client certificate info in X-SSL-Client-* headers
    app.listen(SERVER_PORT);
    log.info(`HTTP server running on http://${SERVER_HOST}:${SERVER_PORT}`);
  } catch (error) {
    log.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (import.meta.main) {
  void start();
}
