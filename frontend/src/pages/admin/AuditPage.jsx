import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../../components/layout/Layout';
import { getAuditLog } from '../../api/admin';
import { getResponseList } from '../../api/response';
import { useFraudAlertsRealtime } from '../../hooks/useFraudAlertsRealtime';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import { Search, Download, ClipboardList, CheckCircle2, XCircle } from 'lucide-react';

const ACTION_BADGE = {
  Deposit: 'success',
  Withdrawal: 'danger',
  Transfer: 'primary',
  BlockUser: 'danger',
  UnblockUser: 'success',
  BlockClient: 'danger',
  UnblockClient: 'success',
  Login: 'gray',
};

export default function AuditPage() {
  const toast = useToast();
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const loadAudit = useCallback(async () => {
    const data = await getAuditLog().then(getResponseList).catch(() => []);
    setAudit(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadAudit()
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadAudit]);

  const { connectionState } = useFraudAlertsRealtime({
    enabled: !loading,
    onNewAlert: () => {
      void loadAudit();
    },
    onAlertUpdated: () => {
      void loadAudit();
    },
  });

  const realtimeTone = connectionState === 'connected'
    ? 'success'
    : connectionState === 'error'
      ? 'danger'
      : 'warning';

  const realtimeLabel = {
    connected: 'онлайн',
    reconnecting: 'переподключение',
    connecting: 'подключение',
    error: 'нет связи',
    disabled: 'ожидание',
  }[connectionState] || 'ожидание';

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return audit.filter((a) => {
      const matchSearch = (a.userFullName || '').toLowerCase().includes(q) ||
                          (a.actionType || '').toLowerCase().includes(q) ||
                          (a.targetObject || '').toLowerCase().includes(q);
      const matchRole = roleFilter === 'all' || a.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [audit, search, roleFilter]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.warning('Нет записей для экспорта');
      return;
    }

    try {
      const rows = filtered.map((a) => ({
        'Время': a.timestamp ? new Date(a.timestamp).toLocaleString('ru-RU') : '—',
        'Пользователь': a.userFullName || '—',
        'Роль': a.role || '—',
        'Действие': a.actionType || '—',
        'Объект': a.targetObject || '—',
        'Детали': a.details || '—',
        'IP': a.ipAddress || '—',
        'Результат': a.result === 'Success' ? 'Успех' : (a.result || '—'),
      }));

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Аудит');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `audit-${today}.xlsx`);
      toast.success(`Экспортировано записей: ${filtered.length}`);
    } catch {
      toast.danger('Не удалось сформировать Excel-файл');
    }
  };

  if (loading) return <Layout title="Журнал аудита"><div className="card u-loading-card">Загрузка...</div></Layout>;

  return (
    <Layout title="Журнал аудита">
      <div className="page__header">
        <div>
          <div className="page__title">Журнал аудита</div>
          <div className="page__subtitle connection-status">
            <span>Полная история действий в системе</span>
            <span className={`badge badge--${realtimeTone}`}>Live · {realtimeLabel}</span>
          </div>
        </div>
        <button
          className="btn btn--ghost"
          onClick={handleExport}
          disabled={filtered.length === 0}
          aria-label="Экспортировать журнал аудита в Excel"
        >
          <Download size={15} /> Экспорт
        </button>
      </div>

      {/* Статистика */}
      <div className="stats-grid stats-grid--3">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего записей</div>
            <div className="stat-card__value">{audit.length}</div>
          </div>
          <div className="stat-card__icon"><ClipboardList size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Успешных</div>
            <div className="stat-card__value stat-card__value--success">{audit.filter(a => a.result === 'Success').length}</div>
          </div>
          <div className="stat-card__icon"><CheckCircle2 size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Ошибок</div>
            <div className="stat-card__value stat-card__value--danger">{audit.filter(a => a.result !== 'Success').length}</div>
          </div>
          <div className="stat-card__icon"><XCircle size={20} /></div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="filter-bar u-mb-16">
        <div className="filter-bar__search">
          <Search size={15} className="filter-bar__search-icon" />
          <input
            placeholder="Поиск по пользователю, действию, объекту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {[
          { key: 'all', label: 'Все роли' },
          { key: 'Admin', label: 'Админ' },
          { key: 'Cashier', label: 'Кассир' },
          { key: 'Customer', label: 'Клиент' },
        ].map(f => (
          <button key={f.key} className={`btn ${roleFilter === f.key ? 'btn--primary' : 'btn--ghost'} btn--sm`} onClick={() => setRoleFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Таблица */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Время', 'Пользователь', 'Роль', 'Действие', 'Объект', 'Детали', 'IP', 'Результат'].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td className="u-nowrap">{formatDateTime(a.timestamp)}</td>
                <td className="u-text-bold">{a.userFullName}</td>
                <td>
                  <span className={`badge badge--${a.role === 'Admin' ? 'primary' : a.role === 'Cashier' ? 'primary' : 'gray'}`}>
                    {a.role}
                  </span>
                </td>
                <td>
                  <span className={`badge badge--${ACTION_BADGE[a.actionType] || 'gray'}`}>
                    {a.actionType}
                  </span>
                </td>
                <td className="u-cell-muted-sm">{a.targetObject}</td>
                <td className="u-cell-muted-sm">{a.details}</td>
                <td className="u-text-mono">{a.ipAddress}</td>
                <td>
                  <span className={`badge badge--${a.result === 'Success' ? 'success' : 'danger'}`}>
                    {a.result === 'Success' ? 'Успех' : 'Ошибка'}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="u-empty-cell">Записи не найдены</td></tr>
            )}
          </tbody>
        </table>
        <div className="table-wrap__footer">
          Показано {filtered.length} из {audit.length} записей
        </div>
      </div>
    </Layout>
  );
}
