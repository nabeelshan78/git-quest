/**
 * A sortable column heading: a real <button> inside <th aria-sort>, so it
 * works with the keyboard and screen readers announce the sort order.
 */
import type { SortState } from './aggregate';
import { DASH_TID } from './testids';

interface SortHeaderProps<K extends string> {
  sortKey: K;
  label: string;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}

export function SortHeader<K extends string>({ sortKey, label, sort, onSort, className }: SortHeaderProps<K>) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button type="button" className="gqd-sort" data-testid={DASH_TID.sortButton(sortKey)} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="gqd-sort-icon" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
