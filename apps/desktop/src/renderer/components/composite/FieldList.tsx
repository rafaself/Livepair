import type { ReactNode } from 'react';
import './FieldList.css';

export type FieldListItem = {
  label: string;
  value: ReactNode;
};

export type FieldListProps = {
  items: FieldListItem[];
};

export function FieldList({ items }: FieldListProps): JSX.Element {
  return (
    <dl className="field-list">
      {items.map(({ label, value }) => (
        <div key={label} className="field-list__item">
          <dt className="field-list__label">{label}</dt>
          <dd className="field-list__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
