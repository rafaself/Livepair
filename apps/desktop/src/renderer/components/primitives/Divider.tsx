import './Divider.css';

export type DividerProps = {
  orientation?: 'horizontal' | 'vertical';
};

export function Divider({
  orientation = 'horizontal',
}: DividerProps): JSX.Element {
  return (
    <hr
      className={`divider divider--${orientation}`}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
