import { queryOptions } from '@tanstack/react-query';
import type { WorksQuery } from '@blockpress/shared';
import { pagesApi, worksApi } from './api';

export const queryKeys = {
  works: (q: WorksQuery = {}) => ['works', q] as const,
  work: (id: string) => ['work', id] as const,
  page: (id: string) => ['page', id] as const,
};

export const worksQueryOptions = (q: WorksQuery = {}) =>
  queryOptions({ queryKey: queryKeys.works(q), queryFn: () => worksApi.list(q) });

export const workQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.work(id), queryFn: () => worksApi.detail(id) });

export const pageQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.page(id), queryFn: () => pagesApi.get(id) });
