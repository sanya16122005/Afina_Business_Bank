export default function Card({ accent, hover, className = '', style, children }) {
  const cls = [
    'card',
    accent && 'card--accent',
    hover && 'card--hover',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
