import { Inbox } from 'lucide-react';

/**
 * Стандартизированный плейсхолдер для пустых списков.
 *
 *   <EmptyState
 *     icon={CreditCard}
 *     title="Счетов пока нет"
 *     hint="Откройте первый счёт, чтобы начать пользоваться сервисом"
 *     action={<button>Открыть счёт</button>}
 *   />
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Пока пусто',
  hint,
  action,
  compact = false,
  className = '',
}) {
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''} ${className}`.trim()}>
      <div className="empty-state__icon">
        <Icon size={compact ? 22 : 28} />
      </div>
      <div className="empty-state__title">{title}</div>
      {hint && <div className="empty-state__hint">{hint}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
