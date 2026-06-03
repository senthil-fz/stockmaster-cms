import { queryOptions } from '@tanstack/react-query';
import type { ArticlesQuery, BooksQuery, StatsQuery } from '@stockmaster/shared';
import { articlesApi, booksApi, pagesApi, statsApi } from './api';

export const queryKeys = {
  books: (q: BooksQuery = {}) => ['books', q] as const,
  book: (id: string) => ['book', id] as const,
  articles: (q: ArticlesQuery = {}) => ['articles', q] as const,
  article: (idOrSlug: string) => ['article', idOrSlug] as const,
  page: (id: string) => ['page', id] as const,
  statsBooks: (q: StatsQuery = {}) => ['stats', 'books', q] as const,
  statsBook: (id: string, q: StatsQuery = {}) => ['stats', 'book', id, q] as const,
};

export const booksQueryOptions = (q: BooksQuery = {}) =>
  queryOptions({ queryKey: queryKeys.books(q), queryFn: () => booksApi.list(q) });

export const bookQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.book(id), queryFn: () => booksApi.detail(id) });

export const articlesQueryOptions = (q: ArticlesQuery = {}) =>
  queryOptions({ queryKey: queryKeys.articles(q), queryFn: () => articlesApi.list(q) });

export const articleQueryOptions = (idOrSlug: string) =>
  queryOptions({ queryKey: queryKeys.article(idOrSlug), queryFn: () => articlesApi.detail(idOrSlug) });

export const pageQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.page(id), queryFn: () => pagesApi.get(id) });

export const statsBooksQueryOptions = (q: StatsQuery = {}) =>
  queryOptions({ queryKey: queryKeys.statsBooks(q), queryFn: () => statsApi.books(q) });

export const statsBookQueryOptions = (id: string, q: StatsQuery = {}) =>
  queryOptions({ queryKey: queryKeys.statsBook(id, q), queryFn: () => statsApi.bookDetail(id, q) });
