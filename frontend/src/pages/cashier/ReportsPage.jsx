import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getCashierReportTransactions, getSessionReport } from '../../api/cashier';
import { getResponseList } from '../../api/response';
import { useCashierSession } from '../../hooks/useCashierSession';
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Banknote, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import DropdownSelect from '../../components/ui/DropdownSelect';

const EXPORT_SCOPE_LABELS = {
  session: 'Текущий сеанс',
  overall: 'Все операции',
};

const EXPORT_STATUS_LABELS = {
  Completed: 'Выполнено',
  Pending: 'На проверке',
  PendingReview: 'На проверке',
  Blocked: 'Заблокировано',
};

const EXPORT_SCOPE_OPTIONS = [
  { value: 'session', label: 'Текущий сеанс' },
  { value: 'overall', label: 'Все операции' },
];

function formatDateInputValue(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatTransactionAmount(transaction) {
  const amount = Number(transaction?.amount || 0);
  const signedAmount = transaction?.type === 'Deposit' ? amount : -amount;
  return signedAmount;
}

function formatExportStatus(status) {
  return EXPORT_STATUS_LABELS[status] || status || '—';
}

function formatExportType(type) {
  if (type === 'Deposit') return 'Внесение';
  if (type === 'Withdrawal') return 'Выдача';
  if (type === 'Transfer') return 'Перевод';
  return type || 'Операция';
}

export default function ReportsPage() {
  const { session, sessionId, loading: sessionLoading, error: sessionError } = useCashierSession();
  const [report, setReport] = useState(null);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportScope, setExportScope] = useState('session');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      getSessionReport(sessionId),
      getCashierReportTransactions({ scope: 'session', sessionId }),
    ])
      .then(([reportResponse, operationsResponse]) => {
        if (cancelled) return;

        setReport(reportResponse.data);
        setOperations(getResponseList(operationsResponse));
      })
      .catch(() => {
        if (cancelled) return;

        setReport(null);
        setOperations([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (session?.startedAt && !exportStartDate) {
      setExportStartDate(formatDateInputValue(session.startedAt));
    }
  }, [exportStartDate, session?.startedAt]);

  useEffect(() => {
    if (!exportEndDate) {
      setExportEndDate(formatDateInputValue(new Date()));
    }
  }, [exportEndDate]);

  const statistics = report?.statistics || {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalTransfers: 0,
    totalFees: 0,
    transactionsCount: 0,
  };

  const handleExport = async () => {
    if (!sessionId && exportScope === 'session') {
      setExportError('Кассовый сеанс не открыт');
      return;
    }

    setExporting(true);
    setExportError('');

    try {
      const response = await getCashierReportTransactions({
        scope: exportScope,
        sessionId: exportScope === 'session' ? sessionId : undefined,
        startDate: exportStartDate || undefined,
        endDate: exportEndDate || undefined,
      });

      const rows = getResponseList(response);
      const summary = response?.data?.summary || {};
      const workbook = XLSX.utils.book_new();
      const scopeLabel = EXPORT_SCOPE_LABELS[exportScope] || exportScope;

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['Отчёт', scopeLabel],
        ['Период', `${exportStartDate || '—'} — ${exportEndDate || '—'}`],
        ['Кассир', exportScope === 'session' ? (session?.cashierFullName || '—') : '—'],
        ['Сеанс', exportScope === 'session' ? (sessionId || '—') : '—'],
        ['Всего операций', Number(summary.totalTransactions ?? rows.length ?? 0)],
        ['Выполнено', Number(summary.completedTransactions ?? rows.filter((row) => row.status === 'Completed').length)],
        ['На проверке', Number(summary.pendingTransactions ?? rows.filter((row) => row.status === 'Pending' || row.status === 'PendingReview').length)],
        ['Заблокировано', Number(summary.blockedTransactions ?? rows.filter((row) => row.status === 'Blocked').length)],
        ['Пополнения', Number(summary.totalDeposits ?? 0)],
        ['Снятия', Number(summary.totalWithdrawals ?? 0)],
        ['Переводы', Number(summary.totalTransfers ?? 0)],
        ['Комиссии', Number(summary.totalFees ?? 0)],
      ]);

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

      const exportRows = rows.map((row) => ({
        Дата: row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '—',
        Тип: formatExportType(row.type),
        Статус: formatExportStatus(row.status),
        Клиент: row.clientFullName || '—',
        Счёт: row.accountNumber || row.fromAccountNumber || row.toAccountNumber || '—',
        Сумма: formatTransactionAmount(row),
        Валюта: row.currency || 'RUB',
        Комментарий: row.description || '—',
        Кассир: row.cashierFullName || session?.cashierFullName || '—',
        Сеанс: row.cashierSessionId || '—',
        Референс: row.transactionId || row.id || '—',
      }));

      const transactionsSheet = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Операции');

      const fileSuffix = `${exportStartDate || 'from'}-${exportEndDate || 'to'}`;
      const fileName = exportScope === 'session'
        ? `cashier-session-${sessionId || 'report'}-${fileSuffix}.xlsx`
        : `cashier-overall-${fileSuffix}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      setExportError(error?.response?.data?.detail || 'Не удалось сформировать Excel-файл');
    } finally {
      setExporting(false);
    }
  };

  if (loading || sessionLoading) {
    return <Layout title="Отчёты"><div className="card u-loading-card">Загрузка...</div></Layout>;
  }

  if (!sessionId) {
    return (
      <Layout title="Отчёты">
        <div className="card u-loading-card">
          <p>Кассовый сеанс не открыт.</p>
          <p className="u-text-muted u-mt-8">Откройте сеанс на панели кассира, чтобы увидеть отчёт.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Отчёты">
      {sessionError && (
        <div className="alert alert--danger u-mb-16">
          {sessionError}
        </div>
      )}

      <div className="card u-mb-20">
        <div className="filter-bar filter-bar--flat">
          <div className="form-group filter-bar__col">
            <label>Область выгрузки</label>
            <DropdownSelect
              value={exportScope}
              options={EXPORT_SCOPE_OPTIONS}
              onChange={setExportScope}
              ariaLabel="Область выгрузки"
            />
          </div>
          <div className="form-group filter-bar__col filter-bar__col--160">
            <label>С даты</label>
            <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} />
          </div>
          <div className="form-group filter-bar__col filter-bar__col--160">
            <label>По дату</label>
            <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} />
          </div>
          <button type="button" className="btn btn--ghost" onClick={handleExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Экспорт...' : 'Экспорт Excel'}
          </button>
        </div>
        <div className="reports-export-hint">
          Выбран период выгрузки: {exportStartDate || '—'} — {exportEndDate || '—'}
        </div>
        {exportError && (
          <div className="alert alert--danger reports-export-error">
            {exportError}
          </div>
        )}
      </div>

      <div className="page__header">
        <div>
          <div className="page__title">Отчёты</div>
          <div className="page__subtitle">
            Сводка по кассовому сеансу{session?.startedAt ? ` · ${new Date(session.startedAt).toLocaleString('ru-RU')}` : ''}
          </div>
        </div>
      </div>

      {/* Сводка */}
      <div className="stats-grid stats-grid--4">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Пополнения</div>
            <div className="stat-card__value stat-card__value--success">+{Number(statistics.totalDeposits || 0).toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><ArrowUpCircle size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Снятия</div>
            <div className="stat-card__value stat-card__value--danger">−{Number(statistics.totalWithdrawals || 0).toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><ArrowDownCircle size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Переводы</div>
            <div className="stat-card__value">{Number(statistics.totalTransfers || 0).toLocaleString('ru-RU')}</div>
          </div>
          <div className="stat-card__icon"><ArrowLeftRight size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Комиссии</div>
            <div className="stat-card__value">{Number(statistics.totalFees || 0).toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><Banknote size={20} /></div>
        </div>
      </div>

      {/* Таблица операций */}
      <div className="section-title section-title--mb-14">Операции в сеансе</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Дата', 'Тип', 'Клиент', 'Счёт', 'Сумма', 'Статус'].map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {operations.map((operation) => (
              <tr key={operation.transactionId || operation.id}>
                <td>{operation.createdAt ? new Date(operation.createdAt).toLocaleString('ru-RU') : '—'}</td>
                <td>
                  <span className={`badge badge--${operation.status === 'Completed' ? 'success' : operation.status === 'Blocked' ? 'danger' : 'warning'}`}>
                    {formatExportType(operation.type)}
                  </span>
                </td>
                <td className="u-text-bold">{operation.clientFullName || '—'}</td>
                <td className="u-cell-mono-muted">{operation.accountNumber || operation.fromAccountNumber || operation.toAccountNumber || '—'}</td>
                <td className={`u-text-700 ${operation.type === 'Deposit' ? 'u-text-success' : 'u-text-danger'}`}>
                  {formatTransactionAmount(operation).toLocaleString('ru-RU')} {operation.currency || 'RUB'}
                </td>
                <td>
                  <span className={`badge badge--${operation.status === 'Completed' ? 'success' : operation.status === 'Blocked' ? 'danger' : 'warning'}`}>
                    {formatExportStatus(operation.status)}
                  </span>
                </td>
              </tr>
            ))}
            {operations.length === 0 && (
              <tr>
                <td colSpan={6} className="u-empty-cell">В этом сеансе пока нет операций</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="table-wrap__footer">
          Показано {operations.length} операций из {Number(statistics.transactionsCount || 0)} операций сеанса
        </div>
      </div>
    </Layout>
  );
}
