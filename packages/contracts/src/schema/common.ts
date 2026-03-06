import { z } from 'zod';

export const ObjectId = z.string().regex(/^[\dA-Fa-f]{24}$/);
export const UserId = z.string(); // UUID from Better-Auth
export const IsoDate = z.iso.datetime();

export const Status = z.enum([
  'active',
  'inactive',
  'pending',
  'logically_deleted',
  'revoked',
  'expired'
]);
export const StatusValues = Status.options;
export type Status = z.infer<typeof Status>;

export const AllStatus = z.union([Status, z.literal('all')]);
export const AllStatusValues = AllStatus.options;
export type AllStatus = z.infer<typeof AllStatus>;

export const PageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  nextPage: z.number().nullable(),
  page: z.number().nullable(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number()
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

export const HTTP_STATUS_SUCCESS_WITH_RESPONSE = 200;

export const SortOrder = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrder>;
