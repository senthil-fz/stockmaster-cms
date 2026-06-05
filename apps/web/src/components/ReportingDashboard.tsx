import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookStat, StatsQuery } from '@stockmaster/shared';
import { statsBookQueryOptions, statsBooksQueryOptions } from '../lib/queries';
import { cx } from './ui/cx';

type ClientFilter = 'all' | 'mobile' | 'web';
type RangeFilter = 'all' | '30d' | '7d';

const RANGE_DAYS: Record<RangeFilter, number | null> = { all: null, '30d': 30, '7d': 7 };

const REPORT_TH =
  'text-left text-faint font-semibold text-[11px] uppercase tracking-[0.04em] px-2.5 py-2 border-b border-line';
const REPORT_TD = 'p-2.5 border-b border-line';
const REPORT_TD_NUM = `${REPORT_TD} text-right tabular-nums`;

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Read analytics for all books, derived from the ReadEvent log. Filter by client + window. */
export function ReportingDashboard() {
  const [client, setClient] = useState<ClientFilter>('all');
  const [range, setRange] = useState<RangeFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const query = useMemo<StatsQuery>(() => {
    const q: StatsQuery = {};
    if (client !== 'all') q.client = client;
    const days = RANGE_DAYS[range];
    if (days != null) q.from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return q;
  }, [client, range]);

  const { data, isLoading } = useQuery(statsBooksQueryOptions(query));

  return (
    <div className="mx-auto max-w-[1040px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-bold tracking-[-0.02em]">Reporting</h1>
          <p className="mt-1 text-[13px] text-muted">How your books are being read, by book.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Segmented
            value={client}
            onChange={setClient}
            options={[
              ['all', 'All clients'],
              ['mobile', 'Mobile'],
              ['web', 'Web'],
            ]}
          />
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              ['all', 'All time'],
              ['30d', '30 days'],
              ['7d', '7 days'],
            ]}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Reads" value={data?.totals.reads} />
        <Stat label="Unique readers" value={data?.totals.uniqueReaders} />
        <Stat label="Books read" value={data?.totals.books} />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : !data || data.books.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No reads recorded for this filter yet. Open a book in the reader (or have the mobile
          app read one) and reads will appear here.
        </p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={REPORT_TH}>#</th>
              <th className={REPORT_TH}>Book</th>
              <th className={cx(REPORT_TH, 'text-right tabular-nums')}>Reads</th>
              <th className={cx(REPORT_TH, 'text-right tabular-nums')}>Opens</th>
              <th className={cx(REPORT_TH, 'text-right tabular-nums')}>Readers</th>
              <th className={REPORT_TH}>Completion</th>
              <th className={REPORT_TH}>Last read</th>
            </tr>
          </thead>
          <tbody>
            {data.books.map((b, i) => (
              <BookRow
                key={b.bookId}
                rank={i + 1}
                book={b}
                active={selected === b.bookId}
                onClick={() => setSelected(selected === b.bookId ? null : b.bookId)}
              />
            ))}
          </tbody>
        </table>
      )}

      {selected && <BookDetail bookId={selected} query={query} />}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="inline-flex rounded-full border border-line bg-subtle p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={cx(
            'cursor-pointer rounded-full px-3 py-[5px] text-xs font-semibold',
            value === key ? 'bg-canvas text-fg shadow-xs' : 'bg-transparent text-muted',
          )}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="text-[26px] font-bold tracking-[-0.02em]">
        {value != null ? value.toLocaleString() : '—'}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function BookRow({
  rank,
  book,
  active,
  onClick,
}: {
  rank: number;
  book: BookStat;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      className={cx('cursor-pointer hover:bg-hover', active && 'bg-subtle')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-expanded={active}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <td className={cx(REPORT_TD_NUM, 'text-muted')}>{rank}</td>
      <td className={cx(REPORT_TD, 'font-semibold')}>{book.title}</td>
      <td className={REPORT_TD_NUM}>{book.reads.toLocaleString()}</td>
      <td className={REPORT_TD_NUM}>{book.opens.toLocaleString()}</td>
      <td className={REPORT_TD_NUM}>{book.uniqueReaders.toLocaleString()}</td>
      <td className={REPORT_TD}>
        <div className="flex min-w-[120px] items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle">
            <div
              className="h-full rounded-[3px] bg-primary"
              style={{ width: `${Math.min(book.avgCompletionPct, 100)}%` }}
            />
          </div>
          <span className="w-[34px] text-right text-xs text-muted tabular-nums">
            {book.avgCompletionPct.toFixed(0)}%
          </span>
        </div>
      </td>
      <td className={cx(REPORT_TD, 'text-muted')}>{relativeDate(book.lastReadAt)}</td>
    </tr>
  );
}

function BookDetail({ bookId, query }: { bookId: string; query: StatsQuery }) {
  const { data } = useQuery(statsBookQueryOptions(bookId, query));
  if (!data) return null;
  const trendMax = Math.max(1, ...data.trend.map((t) => t.reads));
  const dropMax = Math.max(1, ...data.dropoff.map((d) => d.readers));

  return (
    <div className="mt-6 rounded-lg border border-line bg-canvas p-5">
      <h2 className="m-0 text-base font-bold">{data.title}</h2>
      <p className="mt-1 text-[13px] text-muted">
        {data.pageCount} pages · {data.uniqueReaders} readers · {data.avgCompletionPct.toFixed(1)}%
        avg completion
      </p>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
            Reads per day
          </div>
          {data.trend.length === 0 ? (
            <p className="text-muted">No data.</p>
          ) : (
            <div className="flex h-[90px] items-end gap-[3px]">
              {data.trend.map((t) => (
                <div
                  key={t.date}
                  className="flex h-full min-w-[4px] flex-1 flex-col items-center justify-end gap-1"
                  title={`${t.date}: ${t.reads}`}
                >
                  <div
                    className="min-h-0.5 w-full rounded-t-[2px] bg-primary"
                    style={{ height: `${(t.reads / trendMax) * 100}%` }}
                  />
                  <span className="whitespace-nowrap text-[9px] text-faint">{t.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
            Drop-off (readers reaching each page)
          </div>
          {data.dropoff.length === 0 ? (
            <p className="text-muted">No data.</p>
          ) : (
            <div className="flex h-[90px] items-end gap-[3px]">
              {data.dropoff.map((d) => (
                <div
                  key={d.position}
                  className="flex h-full min-w-[4px] flex-1 flex-col items-center justify-end gap-1"
                  title={`Page ${d.position}: ${d.readers} readers`}
                >
                  <div
                    className="min-h-0.5 w-full rounded-t-[2px] bg-accent"
                    style={{ height: `${(d.readers / dropMax) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
          Reads by client
        </div>
        {data.byClient.map((c) => (
          <span
            key={c.client}
            className="mr-2 inline-block rounded-full border border-line bg-subtle px-2.5 py-1 text-xs text-muted"
          >
            {c.client} <strong>{c.reads.toLocaleString()}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
