import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getAnalytics } from '../../api/admin';
import { getResponseData } from '../../api/response';
import { useFraudAlertsRealtime } from '../../hooks/useFraudAlertsRealtime';
import {
  Activity,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  BrainCircuit,
  Calendar,
  Users,
} from 'lucide-react';

const PERIODS = [
  { key: 'week', label: 'Неделя', days: 7 },
  { key: 'month', label: 'Месяц', days: 30 },
  { key: 'quarter', label: 'Квартал', days: 90 },
  { key: 'year', label: 'Год', days: 365 },
];

function getPeriodRange(period) {
  const current = new Date();
  const periodConfig = PERIODS.find((item) => item.key === period) || PERIODS[1];
  const start = new Date(current);
  start.setDate(start.getDate() - periodConfig.days);
  return { startDate: start, endDate: current };
}

function fmtShortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function fmtAmount(value) {
  if (value == null) return '—';
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} RUB`;
}

function fmtPercent(value) {
  if (value == null) return '—';
  //   — non-breaking space между числом и %, чтобы не разрывалось
  // и не сливалось с соседним текстом.
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('ru-RU');
}

function buildLineChart(items, width = 640, height = 220, padding = 24) {
  const values = items.map((item) => Number(item.count || 0));
  const maxValue = Math.max(1, ...values);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = items.length > 1 ? innerWidth / (items.length - 1) : 0;

  const points = items.map((item, index) => {
    const value = Number(item.count || 0);
    const x = padding + (step * index);
    const y = height - padding - ((value / maxValue) * innerHeight);
    return { x, y, value, label: item.date };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`
    : '';

  return { points, linePath, areaPath, maxValue, width, height, padding };
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('month');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalyticsData = useCallback(async () => {
    const { startDate, endDate } = getPeriodRange(period);

    try {
      const data = await getAnalytics({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }).then(getResponseData);
      setAnalytics(data);
      setError('');
    } catch {
      setAnalytics(null);
      setError('Не удалось загрузить аналитику');
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    fetchAnalyticsData()
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAnalyticsData, period]);

  const { connectionState } = useFraudAlertsRealtime({
    enabled: true,
    onNewAlert: () => {
      void fetchAnalyticsData();
    },
    onAlertUpdated: () => {
      void fetchAnalyticsData();
    },
  });

  const operationsStats = useMemo(() => analytics?.operationsStats || {}, [analytics]);
  const modelStats = useMemo(() => analytics?.modelStats || {}, [analytics]);
  const clientRegistrations = useMemo(
    () => (Array.isArray(analytics?.clientRegistrations) ? analytics.clientRegistrations : []),
    [analytics],
  );
  const registrationPeak = useMemo(
    () => clientRegistrations.reduce((peak, item) => Math.max(peak, Number(item.count || 0)), 1),
    [clientRegistrations],
  );
  const registrationChart = useMemo(() => buildLineChart(clientRegistrations), [clientRegistrations]);
  const totalOperations = Number(operationsStats.totalTransactionsCount ?? 0);
  const operationSeries = useMemo(() => [
    {
      key: 'Deposit',
      label: 'Пополнения',
      count: Number(operationsStats.depositCount ?? 0),
      amount: Number(operationsStats.totalDeposits ?? 0),
      tone: 'primary',
    },
    {
      key: 'Withdrawal',
      label: 'Выдачи',
      count: Number(operationsStats.withdrawalCount ?? 0),
      amount: Number(operationsStats.totalWithdrawals ?? 0),
      tone: 'danger',
    },
    {
      key: 'Transfer',
      label: 'Переводы',
      count: Number(operationsStats.transferCount ?? 0),
      amount: Number(operationsStats.totalTransfers ?? 0),
      tone: 'warning',
    },
  ], [operationsStats]);
  const riskSeries = useMemo(() => [
    { label: 'Высокий риск', count: Number(modelStats.highRiskCount ?? 0), tone: 'danger' },
    { label: 'На проверке', count: Number(modelStats.pendingCount ?? 0), tone: 'warning' },
    { label: 'Подтверждено', count: Number(modelStats.resolvedCount ?? 0), tone: 'success' },
    { label: 'Заблокировано', count: Number(modelStats.blockedCount ?? 0), tone: 'gray' },
  ], [modelStats]);
  const topRiskShare = Number(modelStats.reviewedCount ?? 0) > 0
    ? Math.min((Number(modelStats.highRiskCount ?? 0) / Number(modelStats.reviewedCount ?? 1)) * 100, 100)
    : 0;

  const summaryCards = [
    {
      label: 'Операций',
      value: operationsStats.totalTransactionsCount ?? 0,
      change: `${operationsStats.completedTransactionsCount ?? 0} завершено`,
      icon: Activity,
    },
    {
      label: 'Переводы',
      value: fmtAmount(operationsStats.totalTransfers),
      change: `${operationsStats.transferCount ?? 0} операций`,
      icon: ArrowRightLeft,
    },
    {
      label: 'Пополнения',
      value: fmtAmount(operationsStats.totalDeposits),
      change: `${operationsStats.depositCount ?? 0} операций`,
      icon: ArrowDownLeft,
    },
    {
      label: 'Снятия',
      value: fmtAmount(operationsStats.totalWithdrawals),
      change: `${operationsStats.withdrawalCount ?? 0} операций`,
      icon: ArrowUpRight,
    },
    {
      label: 'Комиссии',
      value: fmtAmount(operationsStats.totalFees),
      change: `Средний чек ${fmtAmount(operationsStats.averageAmount)}`,
      icon: Banknote,
    },
    {
      label: 'LLM-объяснения',
      value: modelStats.reviewedCount ?? 0,
      change: `Средний риск ${fmtPercent(modelStats.averageRisk)}`,
      icon: BrainCircuit,
    },
  ];

  if (loading) {
    return (
      <Layout title="Аналитика">
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Аналитика">
      <div className="page__header">
        <div>
          <div className="page__title">Аналитика операций</div>
          <div className="page__subtitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Поток переводов, пополнений и снятий с текстовым LLM-объяснением по каждой записи</span>
            <span className={`badge badge--${connectionState === 'connected' ? 'success' : connectionState === 'error' ? 'danger' : 'warning'}`}>
              Live · {connectionState === 'connected' ? 'онлайн' : connectionState === 'reconnecting' ? 'переподключение' : connectionState === 'error' ? 'нет связи' : 'подключение'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <Calendar size={16} color="var(--afina-text-light)" />
        {PERIODS.map((item) => (
          <button
            key={item.key}
            className={`btn ${period === item.key ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert--warning">{error}</div>}

      <div className="stats-grid">
        {summaryCards.map(({ label, value, change, icon: Icon }) => (
          <div className="stat-card card" key={label}>
            <div className="stat-card__body">
              <div className="stat-card__label">{label}</div>
              <div className="stat-card__value">{value}</div>
              <div className="stat-card__change">{change}</div>
            </div>
            <div className="stat-card__icon"><Icon size={20} /></div>
          </div>
        ))}
      </div>

      <div className="analytics-panels analytics-panels--dashboard">
        <div className="card analytics-card analytics-card--wide">
          <div className="section-title" style={{ marginBottom: 14 }}>
            <Activity size={16} /> Сводка по операциям
          </div>

          <div className="analytics-metric-strip">
            <div className="analytics-metric">
              <span className="analytics-metric__label">Всего операций</span>
              <strong className="analytics-metric__value">{formatCount(operationsStats.totalTransactionsCount)}</strong>
            </div>
            <div className="analytics-metric">
              <span className="analytics-metric__label">Завершено</span>
              <strong className="analytics-metric__value">{formatCount(operationsStats.completedTransactionsCount)}</strong>
            </div>
            <div className="analytics-metric">
              <span className="analytics-metric__label">На проверке</span>
              <strong className="analytics-metric__value">{formatCount(operationsStats.pendingTransactionsCount)}</strong>
            </div>
            <div className="analytics-metric">
              <span className="analytics-metric__label">Заблокировано</span>
              <strong className="analytics-metric__value">{formatCount(operationsStats.blockedTransactionsCount)}</strong>
            </div>
          </div>

          <div className="analytics-bar-list">
            {operationSeries.map((series) => {
              const percent = totalOperations > 0 ? (series.count / totalOperations) * 100 : 0;

              return (
                <div className="analytics-bar-row" key={series.key}>
                  <div className="analytics-bar-row__head">
                    <span className={`analytics-dot analytics-dot--${series.tone}`} />
                    <span>{series.label}</span>
                    <strong>{formatCount(series.count)}</strong>
                  </div>
                  <div className="analytics-bar">
                    <span
                      className={`analytics-bar__fill analytics-bar__fill--${series.tone}`}
                      style={{ width: `${series.count > 0 ? Math.max(percent, 8) : 0}%` }}
                    />
                  </div>
                  <div className="analytics-bar-row__meta">{fmtAmount(series.amount)}</div>
                </div>
              );
            })}
          </div>

          <div className="analytics-summary-strip">
            <div className="analytics-summary-pill">
              <span>Средний чек</span>
              <strong>{fmtAmount(operationsStats.averageAmount)}</strong>
            </div>
            <div className="analytics-summary-pill">
              <span>Максимальная операция</span>
              <strong>{fmtAmount(operationsStats.maxAmount)}</strong>
            </div>
            <div className="analytics-summary-pill">
              <span>Комиссии</span>
              <strong>{fmtAmount(operationsStats.totalFees)}</strong>
            </div>
          </div>
        </div>

        <div className="card analytics-card">
          <div className="section-title" style={{ marginBottom: 14 }}>
            <Users size={16} /> Регистрация клиентов
          </div>

          <div className="analytics-chart-shell">
            {registrationChart.points.length > 0 ? (
              <svg className="analytics-line-chart" viewBox={`0 0 ${registrationChart.width} ${registrationChart.height}`} role="img" aria-label="График регистраций клиентов">
                <defs>
                  <linearGradient id="registrationLine" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#F4A683" />
                    <stop offset="100%" stopColor="#E8926E" />
                  </linearGradient>
                  <linearGradient id="registrationArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(244,166,131,0.32)" />
                    <stop offset="100%" stopColor="rgba(244,166,131,0.02)" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = registrationChart.height - registrationChart.padding - ((registrationChart.height - registrationChart.padding * 2) * ratio);
                  return <line key={ratio} x1={registrationChart.padding} x2={registrationChart.width - registrationChart.padding} y1={y} y2={y} className="analytics-line-chart__grid" />;
                })}

                <path d={registrationChart.areaPath} className="analytics-line-chart__area" />
                <path d={registrationChart.linePath} className="analytics-line-chart__line" />

                {registrationChart.points.map((point) => (
                  <g key={point.label}>
                    <circle cx={point.x} cy={point.y} r="4.5" className="analytics-line-chart__point" />
                    <text x={point.x} y={registrationChart.height - 6} className="analytics-line-chart__label" textAnchor="middle">
                      {fmtShortDate(point.label)}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="empty-state">Нет новых клиентов за период</div>
            )}
          </div>

          <div className="analytics-chart-caption">
            <div>
              <span className="analytics-chart-caption__label">Пик</span>
              <strong>{registrationPeak}</strong>
            </div>
            <div>
              <span className="analytics-chart-caption__label">Физлица</span>
              <strong>{formatCount(analytics?.totalIndividualClients)}</strong>
            </div>
            <div>
              <span className="analytics-chart-caption__label">Юрлица</span>
              <strong>{formatCount(analytics?.totalLegalClients)}</strong>
            </div>
          </div>
        </div>

        <div className="card analytics-card">
          <div className="section-title" style={{ marginBottom: 14 }}>
            <BrainCircuit size={16} /> Риск и контроль
          </div>

          <div className="analytics-risk-hero">
            <div>
              <div className="analytics-risk-hero__label">Средний риск</div>
              <div className="analytics-risk-hero__value">{fmtPercent(modelStats.averageRisk)}</div>
              <div className="analytics-risk-hero__meta">
                {formatCount(modelStats.reviewedCount)} алертов обработано · высокий риск {fmtPercent(topRiskShare)}
              </div>
            </div>
            <div className="analytics-risk-hero__ring" aria-hidden="true">
              <span style={{ width: `${Number(modelStats.reviewedCount ?? 0) > 0 ? Math.max(topRiskShare, 8) : 0}%` }} />
            </div>
          </div>

          <div className="analytics-risk-grid">
            {riskSeries.map((item) => (
              <div key={item.label} className="analytics-risk-row">
                <div className="analytics-risk-row__head">
                  <span className={`analytics-dot analytics-dot--${item.tone}`} />
                  <span>{item.label}</span>
                  <strong>{formatCount(item.count)}</strong>
                </div>
                <div className="analytics-bar analytics-bar--compact">
                  <span
                    className={`analytics-bar__fill analytics-bar__fill--${item.tone}`}
                    style={{
                      width: `${item.count > 0 && Number(modelStats.reviewedCount ?? 0) > 0
                        ? Math.max((item.count / Number(modelStats.reviewedCount ?? 1)) * 100, 8)
                        : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="analytics-summary-strip analytics-summary-strip--compact">
            <div className="analytics-summary-pill">
              <span>Активных кассовых сеансов</span>
              <strong>{formatCount(analytics?.activeCashierSessions)}</strong>
            </div>
            <div className="analytics-summary-pill">
              <span>Средний риск события</span>
              <strong>{fmtPercent(modelStats.averageRisk)}</strong>
            </div>
          </div>
        </div>
      </div>

    </Layout>
  );
}
