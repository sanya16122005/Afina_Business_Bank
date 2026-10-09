import { useEffect, useState } from 'react';

/**
 * Возвращает значение, обновлённое не чаще, чем раз в `delay` мс.
 * Полезно для поисковых input'ов, чтобы не фильтровать большие списки
 * на каждый keystroke.
 *
 *   const debouncedSearch = useDebouncedValue(search, 200);
 *   const filtered = useMemo(
 *     () => list.filter((x) => x.name.includes(debouncedSearch)),
 *     [list, debouncedSearch],
 *   );
 */
export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
