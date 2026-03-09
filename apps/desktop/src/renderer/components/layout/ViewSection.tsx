import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import './ViewSection.css';

export type ViewSectionProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
};

export const ViewSection = forwardRef<HTMLElement, ViewSectionProps>(function ViewSection(
  { icon: Icon, title, children },
  ref,
): JSX.Element {
  return (
    <section ref={ref} className="view-section" aria-label={title}>
      <div className="view-section__header">
        <Icon size={13} color="var(--color-text-primary)" aria-hidden="true" />
        <h3 className="view-section__title">{title}</h3>
        <div className="view-section__rule" />
      </div>
      {children}
    </section>
  );
});
