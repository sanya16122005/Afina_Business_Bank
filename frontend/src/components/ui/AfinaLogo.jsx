/**
 * Афина Банк — Geometric «А» logo from the brand kit.
 *
 * Props:
 *   size      — height of the triangle icon (default 28)
 *   color     — stroke/fill colour (default "#F4A683")
 *   showText  — render "Афина" / "Афина Банк" next to the icon (default false)
 *   textStyle — "short" = "Афина", "full" = "Афина Банк", "stacked" = two-line (default "short")
 *   dark      — тёмно-серый текст для светлых панелей (логин и т.п.)
 *   useThemeColor — цвет текста из темы (--afina-text), для сайдбара и шапки кабинета
 *   className — extra wrapper className
 */

export default function AfinaLogo({
  size = 28,
  color = '#F4A683',
  showText = false,
  textStyle = 'short',
  dark = false,
  useThemeColor = false,
  className = '',
}) {
  const textColor = useThemeColor ? 'var(--afina-text)' : (dark ? '#1E1E1E' : '#fff');
  const subLabelColor = useThemeColor ? 'var(--afina-text-muted)' : color;

  return (
    <span className={`afina-logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28 }}>
      <svg
        viewBox="0 0 62 62"
        fill="none"
        width={size}
        height={size}
        aria-label="Афина Банк"
      >
        <path
          d="M31 5 L57 55 H5 Z"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
        />
        <line x1="15" y1="41" x2="47" y2="41" stroke={color} strokeWidth="1.5" />
        <circle cx="31" cy="5" r="1.5" fill={color} />
      </svg>

      {showText && textStyle === 'stacked' && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span
            className="afina-logo__name"
            style={{
              fontFamily: "'Jost', sans-serif",
              fontWeight: 300,
              fontSize: size * 0.6,
              letterSpacing: '0.08em',
              color: textColor,
            }}
          >
            Афина
          </span>
          <span
            className="afina-logo__sub"
            style={{
              fontFamily: "'Jost', sans-serif",
              fontWeight: 200,
              fontSize: size * 0.25,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: subLabelColor,
            }}
          >
            Банк
          </span>
        </span>
      )}

      {showText && textStyle === 'short' && (
        <span
          className="afina-logo__name"
          style={{
            fontFamily: "'Jost', sans-serif",
            fontWeight: 300,
            fontSize: size * 0.55,
            letterSpacing: '0.08em',
            color: textColor,
          }}
        >
          Афина
        </span>
      )}

      {showText && textStyle === 'full' && (
        <span
          className="afina-logo__name"
          style={{
            fontFamily: "'Jost', sans-serif",
            fontWeight: 300,
            fontSize: size * 0.55,
            letterSpacing: '0.08em',
            color: textColor,
          }}
        >
          Афина Банк
        </span>
      )}
    </span>
  );
}

/**
 * Decorative triangle pattern (used as background accents on cards, hero, etc.)
 */
export function TrianglePattern({ size = 180, color = '#F4A683', opacity = 0.06, className = '' }) {
  return (
    <svg
      className={`triangle-pattern ${className}`}
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      style={{ opacity }}
    >
      <path d="M90 10 L170 150 H10 Z" stroke={color} strokeWidth="1" fill="none" />
      <path d="M90 50 L140 130 H40 Z" stroke={color} strokeWidth="0.7" fill="none" />
      <path d="M90 80 L115 115 H65 Z" stroke={color} strokeWidth="0.5" fill="none" />
    </svg>
  );
}
