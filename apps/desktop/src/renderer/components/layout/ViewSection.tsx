import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './ViewSection.css';

export type ViewSectionProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
};

export function ViewSection({ icon: Icon, title, children }: ViewSectionProps): JSX.Element {
  return (
    <section className="view-section" aria-label={title}>
      <div className="view-section__header">
        <Icon size={13} color="var(--color-text-primary)" aria-hidden="true" />
        <h3 className="view-section__title">{title}</h3>
        <div className="view-section__rule" />
      </div>
      {children}
    </section>
  );
}
