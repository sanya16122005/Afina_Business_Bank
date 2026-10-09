export default function Button({
  variant = 'primary',
  size,
  full,
  loading = false,
  disabled = false,
  startIcon,
  endIcon,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const cls = [
    'btn',
    `btn--${variant}`,
    size && `btn--${size}`,
    full && 'btn--full',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {startIcon && <span aria-hidden="true">{startIcon}</span>}
      {loading ? 'Загрузка...' : children}
      {endIcon && <span aria-hidden="true">{endIcon}</span>}
    </button>
  );
}
