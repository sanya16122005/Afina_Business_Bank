/**
 * Маленький круглый спиннер для inline-использования внутри кнопок.
 *
 * По умолчанию декоративный (`aria-hidden`), потому что обычно соседствует
 * с осмысленным текстом кнопки ("Сохранение..."). Если spinner показывается
 * один (без текста) — передайте `label`, тогда он будет озвучен скринридером.
 *
 *   <button disabled={busy}>
 *     {busy && <Spinner size={14} />} {busy ? 'Сохранение' : 'Сохранить'}
 *   </button>
 *
 *   <Spinner label="Загрузка данных" />
 */
export default function Spinner({ size = 14, thickness = 2, className = '', label }) {
  const style = {
    width: size,
    height: size,
    borderWidth: thickness,
  };

  if (label) {
    return (
      <span
        className={`spinner ${className}`.trim()}
        style={style}
        role="status"
        aria-label={label}
      />
    );
  }

  return <span className={`spinner ${className}`.trim()} style={style} aria-hidden="true" />;
}
