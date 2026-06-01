import { queryOptions } from '@tanstack/react-query';
import type { StatsQuery, WorksQuery } from '@blockpress/shared';
import { pagesApi, statsApi, worksApi } from './api';

export const queryKeys = {
  works: (q: WorksQuery = {}) => ['works', q] as const,
  work: (id: string) => ['work', id] as const,
  page: (id: string) => ['page', id] as const,
  statsBooks: (q: StatsQuery = {}) => ['stats', 'books', q] as const,
  statsBook: (id: string, q: StatsQuery = {}) => ['stats', 'book', id, q] as const,
};

export const worksQueryOptions = (q: WorksQuery = {}) =>
  queryOptions({ queryKey: queryKeys.works(q), queryFn: () => worksApi.list(q) });

export const workQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.work(id), queryFn: () => worksApi.detail(id) });

export const pageQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.page(id), queryFn: () => pagesApi.get(id) });

export const statsBooksQueryOptions = (q: StatsQuery = {}) =>
  queryOptions({ queryKey: queryKeys.statsBooks(q), queryFn: () => statsApi.books(q) });

export const statsBookQueryOptions = (id: string, q: StatsQuery = {}) =>
  queryOptions({ queryKey: queryKeys.statsBook(id, q), queryFn: () => statsApi.bookDetail(id, q) });
