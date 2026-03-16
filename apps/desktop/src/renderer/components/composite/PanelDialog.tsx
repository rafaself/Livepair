import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './PanelDialog.css';

export type PanelDialogProps = {
  backdropClassName?: string;
  frameClassName?: string;
  titleId: string;
  descriptionId?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export const PanelDialog = forwardRef<HTMLDivElement, PanelDialogProps>(function PanelDialog(
  {
    backdropClassName,
    frameClassName,
    titleId,
    descriptionId,
    className,
    children,
    ...rest
  },
  ref,
): JSX.Element {
  const backdropClasses = ['panel-dialog__backdrop', backdropClassName].filter(Boolean).join(' ');
  const frameClasses = ['panel-dialog__frame', frameClassName].filter(Boolean).join(' ');
  const dialogClasses = ['panel-dialog', className].filter(Boolean).join(' ');

  return (
    <div className={backdropClasses}>
      <div className={frameClasses}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          {...(descriptionId ? { 'aria-describedby': descriptionId } : {})}
          className={dialogClasses}
          tabIndex={-1}
          {...rest}
        >
          {children}
        </div>
      </div>
    </div>
  );
});
