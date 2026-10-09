import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getAuditLog, getAnalytics, getFraudAlerts } from '../../api/admin';
import { getResponseData, getResponseList } from '../../api/response';
import { useFraudAlertsRealtime } from '../../hooks/useFraudAlertsRealtime';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatMoney } from '../../utils/format';
import Skeleton from '../../components/ui/Skeleton';
import { Banknote, ClipboardList, ShieldAlert, Users } from 'lucide-react';
import {
  normalizeFraudAlert,
  upsertFraudAlert,
  getFraudStatusLabel,
  getFraudStatusTone,
  formatFraudRiskPercent,
} from '../../utils/fraudAlerts';

const ANOMALY_LABELS = { HighAmount: 'Крупная сумма', HighFrequency: 'Высокая частота', RareGeolocation: 'Редкая геолокация', SuspiciousPattern: 'Подозрительный шаблон' };

export default function AdminDashboard() {
  const toast = useToast();
  const [audit, setAudit] = useState([]);
  const [fraudAlerts, setFraudAlerts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const initialLoadRef = useRef(true);

  const fetchDashboardData = useCallback(async () => {
    const isInitial = initialLoadRef.current;
    const results = await Promise.allSettled([
      getAuditLog().then(getResponseList),
      getFraudAlerts().then(getResponseList),
      getAnalytics().then(getResponseData),
    ]);

    const [auditRes, fraudRes, analyticsRes] = results;
    const failures = [];

    if (auditRes.status === 'fulfilled') {
      setAudit(Array.isArray(auditRes.value) ? auditRes.value : []);
    } else {
      failures.push('журнал аудита');
    }

    if (fraudRes.status === 'fulfilled') {
      const list = Array.isArray(fraudRes.value) ? fraudRes.value : [];
      setFraudAlerts(list.map((alert) => normalizeFraudAlert(alert)).filter(Boolean));
    } else {
      failures.push('антифрод-алерты');
    }

    if (analyticsRes.status === 'fulfilled') {
      setAnalytics(analyticsRes.value);
    } else {
      failures.push('аналитику');
    }



    if (isInitial && failures.length > 0) {
      toast.danger(`Не удалось загрузить: ${failures.join(', ')}`);
    }
    initialLoadRef.current = false;
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDashboardData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchDashboardData]);

  const { connectionState } = useFraudAlertsRealtime({
    enabled: !loading,
    onNewAlert: (payload) => {
      setFraudAlerts((previous) => upsertFraudAlert(previous, payload));
      void fetchDashboardData();
    },
    onAlertUpdated: (payload) => {
      setFraudAlerts((previous) => upsertFraudAlert(previous, payload));
      void fetchDashboardData();
    },
  });

  const pending = useMemo(() => fraudAlerts.filter((a) => a.status === 'PendingReview'), [fraudAlerts]);

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

  if (loading) {
    return (
      <Layout title="Панель администратора">
        <div className="page__header">
          <div>
            <Skeleton width={300} height={26} />
            <Skeleton width={420} height={14} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div className="stats-grid stats-grid--4">
          {[0, 1, 2, 3].map((i) => <Skeleton.Card key={i} height={104} />)}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Панель администратора">
      <div className="page__header">
        <div>
          <div className="page__title">Панель администратора</div>
          <div className="page__subtitle connection-status">
            <span>Обзор ключевых показателей и событий безопасности</span>
            <span className={`badge badge--${realtimeTone}`}>Live · {realtimeLabel}</span>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="stats-grid">
        {[
          { label: 'Всего пользователей', value: analytics?.totalClients?.toString() || '—',  icon: Users, change: '' },
          { label: 'Активных счетов',     value: analytics?.totalAccounts?.toString() || '—', icon: Banknote, change: '' },
          { label: 'Транзакций',          value: analytics?.operationsStats?.totalTransactionsCount?.toString() || '—', icon: ClipboardList, change: '' },
          { label: 'Алертов на проверке', value: String(pending.length), icon: ShieldAlert, change: pending.length > 0 ? 'Требуют внимания' : '' },
        ].map(s => (
          <div key={s.label} className="stat-card card">
            <div className="stat-card__body">
              <div className="stat-card__label">{s.label}</div>
              <div className="stat-card__value">{s.value}</div>
              {s.change && <div className="stat-card__change">{s.change}</div>}
            </div>
            <div className="stat-card__icon"><s.icon size={20} /></div>
          </div>
        ))}
      </div>


      {/* Антифрод алерты */}
      <div className="section-title section-title--mb-14">
        <ShieldAlert size={16} /> Подозрительные операции
      </div>
      {fraudAlerts.map(alert => (
        <div
          key={alert.alertId}
          className={`fraud-alert${alert.riskScore < 0.8 ? ' fraud-alert--warning' : ''}${alert.status === 'Resolved' ? ' fraud-alert--success' : ''}${alert.status === 'Blocked' ? ' fraud-alert--danger' : ''}`}
        >
          <div className="fraud-alert__left">
            <div className={`fraud-alert__risk${alert.riskScore < 0.8 ? ' fraud-alert__risk--warning' : ''}`}>
              {formatFraudRiskPercent(alert.riskScore)}
            </div>
            <div>
              <div className="fraud-alert__desc">{alert.ownerFullName || '—'} — {formatMoney(alert.amount, alert.currency || 'RUB')}</div>
              <div className="fraud-alert__meta u-mb-4">
                {alert.triggerReason || ANOMALY_LABELS[alert.anomalyType] || alert.anomalyType || '—'}
              </div>
              <div className="fraud-alert__meta">{alert.accountNumber} · {formatDateTime(alert.createdAt)}</div>
            </div>
          </div>
          <div className="fraud-alert__actions">
            <span className={`badge badge--${getFraudStatusTone(alert.status)}`}>
              {getFraudStatusLabel(alert.status)}
            </span>
            <span className="u-meta-note">Только просмотр</span>
          </div>
        </div>
      ))}

      {/* Последние события аудита */}
      <div className="section-title section-title--gap-top">
        <ClipboardList size={16} /> Журнал событий
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Время', 'Пользователь', 'Роль', 'Действие', 'Объект', 'IP', 'Результат'].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {audit.map(a => (
              <tr key={a.id}>
                <td>{formatDateTime(a.timestamp)}</td>
                <td className="u-text-bold">{a.userFullName}</td>
                <td><span className="badge badge--blue">{a.role}</span></td>
                <td>{a.actionType}</td>
                <td className="u-cell-muted-sm">{a.targetObject}</td>
                <td className="u-text-mono">{a.ipAddress}</td>
                <td><span className="badge badge--success">{a.result}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
