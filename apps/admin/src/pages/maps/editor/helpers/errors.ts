export const getErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || !error) {
    return null;
  }

  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }

  if (
    'data' in error &&
    typeof error.data === 'object' &&
    error.data &&
    'code' in error.data &&
    typeof error.data.code === 'string'
  ) {
    return error.data.code;
  }

  return null;
};

export const toMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
