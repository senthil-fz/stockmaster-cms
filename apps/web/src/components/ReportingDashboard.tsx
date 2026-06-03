import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookStat, StatsQuery } from '@stockmaster/shared';
import { statsBookQueryOptions, statsBooksQueryOptions } from '../lib/queries';

type ClientFilter = 'all' | 'mobile' | 'web';
type RangeFilter = 'all' | '30d' | '7d';

const RANGE_DAYS: Record<RangeFilter, number | null> = { all: null, '30d': 30, '7d': 7 };

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
    <div className="report">
      <div className="report-head">
        <div>
          <h1 className="report-title">Reporting</h1>
          <p className="report-sub">How your books are being read, by book.</p>
        </div>
        <div className="report-filters">
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

      <div className="report-totals">
        <Stat label="Reads" value={data?.totals.reads} />
        <Stat label="Unique readers" value={data?.totals.uniqueReaders} />
        <Stat label="Books read" value={data?.totals.books} />
      </div>

      {isLoading ? (
        <p className="report-empty">Loading…</p>
      ) : !data || data.books.length === 0 ? (
        <p className="report-empty">
          No reads recorded for this filter yet. Open a book in the reader (or have the mobile
          app read one) and reads will appear here.
        </p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Book</th>
              <th className="num">Reads</th>
              <th className="num">Opens</th>
              <th className="num">Readers</th>
              <th>Completion</th>
              <th>Last read</th>
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
    <div className="seg">
      {options.map(([key, label]) => (
        <button
          key={key}
          className={'seg-btn' + (value === key ? ' on' : '')}
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
    <div className="stat-card">
      <div className="stat-value">{value != null ? value.toLocaleString() : '—'}</div>
      <div className="stat-label">{label}</div>
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
      className={'report-row' + (active ? ' active' : '')}
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
      <td className="num muted">{rank}</td>
      <td className="report-bookname">{book.title}</td>
      <td className="num">{book.reads.toLocaleString()}</td>
      <td className="num">{book.opens.toLocaleString()}</td>
      <td className="num">{book.uniqueReaders.toLocaleString()}</td>
      <td>
        <div className="bar-row">
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.min(book.avgCompletionPct, 100)}%` }} />
          </div>
          <span className="bar-pct">{book.avgCompletionPct.toFixed(0)}%</span>
        </div>
      </td>
      <td className="muted">{relativeDate(book.lastReadAt)}</td>
    </tr>
  );
}

function BookDetail({ bookId, query }: { bookId: string; query: StatsQuery }) {
  const { data } = useQuery(statsBookQueryOptions(bookId, query));
  if (!data) return null;
  const trendMax = Math.max(1, ...data.trend.map((t) => t.reads));
  const dropMax = Math.max(1, ...data.dropoff.map((d) => d.readers));

  return (
    <div className="report-detail">
      <h2 className="report-detail-title">{data.title}</h2>
      <p className="report-sub">
        {data.pageCount} pages · {data.uniqueReaders} readers · {data.avgCompletionPct.toFixed(1)}%
        avg completion
      </p>

      <div className="report-charts">
        <div className="chart-block">
          <div className="chart-label">Reads per day</div>
          {data.trend.length === 0 ? (
            <p className="muted">No data.</p>
          ) : (
            <div className="chart-bars">
              {data.trend.map((t) => (
                <div key={t.date} className="cbar" title={`${t.date}: ${t.reads}`}>
                  <div className="cbar-fill" style={{ height: `${(t.reads / trendMax) * 100}%` }} />
                  <span className="cbar-x">{t.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chart-block">
          <div className="chart-label">Drop-off (readers reaching each page)</div>
          {data.dropoff.length === 0 ? (
            <p className="muted">No data.</p>
          ) : (
            <div className="chart-bars">
              {data.dropoff.map((d) => (
                <div key={d.position} className="cbar" title={`Page ${d.position}: ${d.readers} readers`}>
                  <div className="cbar-fill alt" style={{ height: `${(d.readers / dropMax) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="report-clients">
        <div className="chart-label">Reads by client</div>
        {data.byClient.map((c) => (
          <span key={c.client} className="client-chip">
            {c.client} <strong>{c.reads.toLocaleString()}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
