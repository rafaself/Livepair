import type { ReactNode } from 'react';
import './FieldList.css';

export type FieldListItem = {
  label: string;
  value: ReactNode;
};

export type FieldListProps = {
  items: FieldListItem[];
  className?: string;
};

export function FieldList({ items, className }: FieldListProps): JSX.Element {
  const classes = ['field-list', className].filter(Boolean).join(' ');

  return (
    <dl className={classes}>
      {items.map(({ label, value }) => (
        <div key={label} className="field-list__item">
          <dt className="field-list__label">{label}</dt>
          <dd className="field-list__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
