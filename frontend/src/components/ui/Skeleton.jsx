/**
 * Универсальный плейсхолдер-блок для состояний загрузки.
 *
 *   <Skeleton width="60%" height={20} />
 *   <Skeleton.Lines count={3} />
 *   <Skeleton.Card />
 */
export default function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  className = '',
  style,
}) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

Skeleton.Lines = function SkeletonLines({ count = 3, gap = 8, lastWidth = '70%', height = 14 }) {
  const lines = Array.from({ length: count });
  return (
    <div className="skeleton-lines" style={{ display: 'grid', gap }}>
      {lines.map((_, i) => (
        <Skeleton
          key={i}
          height={height}
          width={i === lines.length - 1 ? lastWidth : '100%'}
        />
      ))}
    </div>
  );
};

Skeleton.Card = function SkeletonCard({ height = 120 }) {
  return (
    <div className="card skeleton-card" style={{ minHeight: height }}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="80%" height={28} style={{ marginTop: 12 }} />
      <Skeleton.Lines count={2} height={12} />
    </div>
  );
};
