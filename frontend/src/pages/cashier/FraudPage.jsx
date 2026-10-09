import { Fragment, useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { getFraudAlerts, resolveAlert } from '../../api/cashier';
import { getResponseList } from '../../api/response';
import { useFraudAlertsRealtime } from '../../hooks/useFraudAlertsRealtime';
import { ShieldAlert, Clock3, CheckCircle2, Lock } from 'lucide-react';
import {
  getFraudDecision,
  getFraudStatusLabel,
  getFraudStatusTone,
  getFraudRiskTone,
  formatFraudRiskPercent,
  normalizeFraudAlert,
  upsertFraudAlert,
} from '../../utils/fraudAlerts';

const ANOMALY_LABELS = {
  HighAmount: 'Крупная сумма',
  HighFrequency: 'Высокая частота',
  RareGeolocation: 'Редкая геолокация',
  SuspiciousPattern: 'Подозрительный шаблон',
};

export default function FraudPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedAlertId, setExpandedAlertId] = useState(null);

  const { connectionState } = useFraudAlertsRealtime({
    enabled: !loading,
    onNewAlert: (payload) => {
      setAlerts((previous) => upsertFraudAlert(previous, payload));
    },
    onAlertUpdated: (payload) => {
      setAlerts((previous) => upsertFraudAlert(previous, payload));
    },
  });

  useEffect(() => {
    getFraudAlerts()
      .then(getResponseList)
      .then((data) => {
        setAlerts((Array.isArray(data) ? data : []).map((alert) => normalizeFraudAlert(alert)).filter(Boolean));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const filtered = filter === 'all' ? alerts : alerts.filter((alert) => alert.status === filter);

  const handleResolve = (alertId, action) => {
    const decision = getFraudDecision(action);

    resolveAlert(alertId, { decision })
      .then((response) => {
        const nextStatus = response?.data?.status || (decision === 'Blocked' ? 'Blocked' : 'Resolved');
        setAlerts((previous) =>
          previous.map((alert) => (alert.alertId === alertId ? { ...alert, status: nextStatus } : alert)),
        );
      })
      .catch(() => {
        setAlerts((previous) =>
          previous.map((alert) =>
            alert.alertId === alertId
              ? { ...alert, status: decision === 'Blocked' ? 'Blocked' : 'Resolved' }
              : alert,
          ),
        );
      });
  };

  const pending = alerts.filter((alert) => alert.status === 'PendingReview').length;
  const resolved = alerts.filter((alert) => alert.status === 'Resolved').length;
  const blocked = alerts.filter((alert) => alert.status === 'Blocked').length;

  const toggleDetails = (alertId) => {
    setExpandedAlertId((current) => (current === alertId ? null : alertId));
  };

  if (loading) {
    return (
      <Layout title="Антифрод">
        <div className="card u-loading-card">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Антифрод">
      <div className="page__header">
        <div>
          <div className="page__title">Система антифрод-мониторинга</div>
          <div className="page__subtitle connection-status">
            <span>Центр управления безопасностью транзакций</span>
            <span className={`badge badge--${realtimeTone}`}>Live · {realtimeLabel}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid stats-grid--4">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего алертов</div>
            <div className="stat-card__value">{alerts.length}</div>
          </div>
          <div className="stat-card__icon"><ShieldAlert size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">На проверке</div>
            <div className="stat-card__value stat-card__value--warning">{pending}</div>
          </div>
          <div className="stat-card__icon"><Clock3 size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Решено</div>
            <div className="stat-card__value stat-card__value--success">{resolved}</div>
          </div>
          <div className="stat-card__icon"><CheckCircle2 size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Заблокировано</div>
            <div className="stat-card__value stat-card__value--danger">{blocked}</div>
          </div>
          <div className="stat-card__icon"><Lock size={20} /></div>
        </div>
      </div>

      <div className="filter-bar u-mb-20">
        {[
          { key: 'all', label: 'Все алерты' },
          { key: 'PendingReview', label: 'На проверке' },
          { key: 'Resolved', label: 'Решённые' },
          { key: 'Blocked', label: 'Заблокированные' },
        ].map((item) => (
          <button
            key={item.key}
            className={`btn ${filter === item.key ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Риск', 'ID транзакции', 'LLM-обоснование', 'Клиент', 'Счёт', 'Сумма', 'Дата', 'Статус', 'Действия'].map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((alert) => {
              const isExpanded = expandedAlertId === alert.alertId;
              const shortReason = alert.triggerReason || ANOMALY_LABELS[alert.anomalyType] || alert.anomalyType || '—';

              return (
                <Fragment key={alert.alertId}>
                  <tr className={isExpanded ? 'fraud-row fraud-row--expanded' : 'fraud-row'}>
                    <td>
                      <span className={`risk-chip risk-chip--${getFraudRiskTone(alert.riskScore)}`}>
                        <span className="risk-chip__dot" />
                        {formatFraudRiskPercent(alert.riskScore)}
                      </span>
                    </td>
                    <td className="u-text-mono">{alert.transactionId}</td>
                    <td className="fraud-llm-cell">
                      <div className="fraud-alert-summary">
                        <div className="fraud-alert-summary__top">
                          <span className="fraud-alert-summary__reason">{shortReason}</span>
                        </div>
                        <div className="fraud-alert-summary__meta">
                          {ANOMALY_LABELS[alert.anomalyType] || alert.anomalyType || '—'}
                        </div>
                        <button className="btn btn--ghost btn--sm fraud-alert-summary__toggle" type="button" onClick={() => toggleDetails(alert.alertId)}>
                          {isExpanded ? 'Скрыть полный вывод' : 'Показать полный вывод'}
                        </button>
                      </div>
                    </td>
                    <td className="u-text-bold">{alert.ownerFullName || '—'}</td>
                    <td className="u-text-mono">{alert.accountNumber || '—'}</td>
                    <td className="u-text-700">
                      {alert.amount.toLocaleString('ru-RU')} {alert.currency}
                    </td>
                    <td className="u-nowrap">{new Date(alert.createdAt).toLocaleString('ru-RU')}</td>
                    <td>
                      <span className={`badge badge--${getFraudStatusTone(alert.status)}`}>
                        {getFraudStatusLabel(alert.status)}
                      </span>
                    </td>
                    <td>
                      {alert.status === 'PendingReview' ? (
                        <div className="u-actions">
                          <button className="btn btn--soft-success btn--sm fraud-action-btn" onClick={() => handleResolve(alert.alertId, 'confirm')}>
                            ✓ ОК
                          </button>
                          <button className="btn btn--soft-danger btn--sm fraud-action-btn" onClick={() => handleResolve(alert.alertId, 'block')}>
                            ✗ Блок
                          </button>
                        </div>
                      ) : (
                        <span className="u-meta-note">Действие завершено</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="fraud-row__details">
                      <td colSpan={9}>
                        <div className="fraud-detail-panel">
                          <div className="fraud-detail-panel__label">Полный вывод LLM</div>
                          <div className="fraud-detail-panel__text">
                            {alert.triggerReasonFull || alert.triggerReason || 'LLM-объяснение не сформировано'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="u-empty-cell">
                  Нет алертов
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="table-wrap__footer">
          Показано {filtered.length} из {alerts.length} алертов
        </div>
      </div>
    </Layout>
  );
}
