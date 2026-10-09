import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../../components/layout/Layout';
import { getAccounts } from '../../api/accounts';
import { getTransactions } from '../../api/transactions';
import { getSignedTransactionAmount, getTransactionStatusMeta } from '../../utils/transactionUtils';
import { getResponseList } from '../../api/response';
import { useToast } from '../../context/ToastContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import {
  Search, Download, ArrowDownLeft, ArrowUpRight, Receipt,
  ShieldAlert, Clock3,
} from 'lucide-react';
import {
  CURRENCY_SYMBOL,
  TRANSACTION_TYPE_ICON,
  TRANSACTION_TYPE_LABEL,
} from '../../constants/accounts';

const TYPES = [
  { key: 'Все',        label: 'Все' },
  { key: 'Transfer',   label: 'Переводы' },
  { key: 'Interest',   label: 'Проценты' },
  { key: 'Deposit',    label: 'Пополнения' },
  { key: 'Withdrawal', label: 'Снятия' },
  { key: 'Payment',    label: 'Оплаты' },
];

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TransactionsPage() {
  const toast = useToast();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [typeFilter, setTypeFilter] = useState('Все');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getAccounts(),
      getTransactions(),
    ]).then(([accountsResult, transactionsResult]) => {
      if (cancelled) return;
      if (accountsResult.status === 'fulfilled') {
        setAccounts(getResponseList(accountsResult.value));
      } else {
        toast.danger('Не удалось загрузить счета');
      }

      if (transactionsResult.status === 'fulfilled') {
        setTransactions(getResponseList(transactionsResult.value));
      } else {
        toast.danger('Не удалось загрузить операции');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return transactions.filter((tx) => {
      const description = tx.description || '';
      const reference = tx.reference || '';
      const merchantName = tx.merchant?.name || '';
      const matchSearch =
        description.toLowerCase().includes(q) ||
        reference.toLowerCase().includes(q) ||
        merchantName.toLowerCase().includes(q) ||
        (tx.incomeKindCode && String(tx.incomeKindCode).toLowerCase().includes(q)) ||
        (tx.incomingPayroll?.summary && String(tx.incomingPayroll.summary).toLowerCase().includes(q));
      const matchType = typeFilter === 'Все' || tx.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [transactions, debouncedSearch, typeFilter]);

  const totals = useMemo(() => {
    const completedRUB = filtered.filter((tx) => tx.status === 'Completed' && tx.currency === 'RUB');
    return completedRUB.reduce(
      (acc, t) => {
        const amount = getSignedTransactionAmount(t, accounts);
        if (amount > 0) acc.totalIncome += amount;
        else if (amount < 0) acc.totalExpense += amount;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0 },
    );
  }, [filtered, accounts]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.warning('Нет операций для экспорта');
      return;
    }

    try {
      const rows = filtered.map((tx) => {
        const statusMeta = getTransactionStatusMeta(tx);
        const signed = getSignedTransactionAmount(tx, accounts);
        const isInc = signed > 0;
        const desc = (isInc && tx.incomingPayroll?.summary)
          ? tx.incomingPayroll.summary
          : (tx.description || tx.reference || '—');
        const kvd = tx.incomeKindCode
          ? `${tx.incomeKindCode}${tx.incomeKindTitle ? ' — ' + tx.incomeKindTitle : ''}`
          : '';
        return {
          'Дата': new Date(tx.createdAt).toLocaleString('ru-RU'),
          'Тип': TRANSACTION_TYPE_LABEL[tx.type] || tx.type || '—',
          'Описание': desc,
          'Контрагент': tx.merchant?.name || tx.toAccount?.accountNumber || '—',
          'Сумма': signed,
          'Валюта': tx.currency || '—',
          'Статус': statusMeta.label,
          'Баланс после': tx.balanceAfter ?? '',
          'Референс': tx.reference || tx.id || '—',
          'КВД': kvd,
        };
      });

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Операции');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `transactions-${today}.xlsx`);
      toast.success(`Экспортировано операций: ${filtered.length}`);
    } catch {
      toast.danger('Не удалось сформировать Excel-файл');
    }
  };

  if (loading) {
    return (
      <Layout title="Транзакции">
        <div className="page__header">
          <div>
            <Skeleton width={180} height={26} />
            <Skeleton width={260} height={14} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div className="card card--flush">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="tx-item" style={{ borderBottom: '1px solid var(--afina-border)' }}>
              <div className="tx-item__left">
                <Skeleton width={40} height={40} radius={12} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
                </div>
              </div>
              <Skeleton width={80} height={18} />
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Транзакции">
      <div className="page__header">
        <div>
          <div className="page__title">Транзакции</div>
          <div className="page__subtitle">История всех операций по вашим счетам</div>
        </div>
        <button
          className="btn btn--ghost"
          onClick={handleExport}
          disabled={filtered.length === 0}
          aria-label="Экспортировать операции в Excel"
        >
          <Download size={15} /> Экспорт
        </button>
      </div>

      {/* Сводка */}
      <div className="stats-grid stats-grid--3">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего операций</div>
            <div className="stat-card__value">{filtered.length}</div>
          </div>
          <div className="stat-card__icon"><Receipt size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Поступления (RUB)</div>
            <div className="stat-card__value stat-card__value--success">+{totals.totalIncome.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><ArrowDownLeft size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Расходы (RUB)</div>
            <div className="stat-card__value stat-card__value--danger">{totals.totalExpense.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><ArrowUpRight size={20} /></div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="filter-bar">
        <div className="filter-bar__search">
          <Search size={15} className="filter-bar__search-icon" />
          <input
            placeholder="Поиск по описанию или номеру операции..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`btn ${typeFilter === t.key ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            onClick={() => setTypeFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Список */}
      <div className="card card--flush">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Транзакции не найдены"
            hint="Попробуйте сбросить фильтры — возможно, вы их слишком сузили."
            compact
          />
        ) : (
          filtered.map((tx) => {
            const statusMeta = getTransactionStatusMeta(tx);
            const signed = getSignedTransactionAmount(tx, accounts);
            const isIncome = signed > 0;
            const displayAmount = statusMeta.isBlocked ? (Number(tx.amount) || 0) : signed;
            const descriptionText = (isIncome && tx.incomingPayroll?.summary)
              ? tx.incomingPayroll.summary
              : (tx.description || tx.reference || tx.type || 'Операция');
            const sym = CURRENCY_SYMBOL[tx.currency] || tx.currency;
            const TypeIcon = TRANSACTION_TYPE_ICON[tx.type] || Receipt;
            return (
              <div key={tx.id} className={`tx-item tx-item--${isIncome ? 'income' : 'expense'}${statusMeta.isBlocked ? ' tx-item--blocked' : statusMeta.isReview ? ' tx-item--review' : ''}`}>
                <div className="tx-item__left">
                  <div className="tx-item__icon"><TypeIcon size={16} /></div>
                  <div>
                    <div className="tx-item__desc">{descriptionText}</div>
                    <div className="tx-item__meta">
                      <span className="tx-item__date">{fmtDateTime(tx.createdAt)}</span>
                      {tx.merchant && <span className="tx-item__ref">{tx.merchant.name}</span>}
                      {tx.cardLastDigits && <span className="tx-item__ref">•••• {tx.cardLastDigits}</span>}
                      {tx.incomingPayroll?.isFromEmployerInYourStaff && (
                        <span className="tx-item__ref">Работодатель в штате</span>
                      )}
                      {tx.incomingPayroll && tx.incomeKindCode && <span className="tx-item__ref">КВД {tx.incomeKindCode}</span>}
                      <span className={`badge badge--${statusMeta.badge}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    {statusMeta.note && (
                      <div className={`tx-item__state-note tx-item__state-note--${statusMeta.noteKind === 'blocked' ? 'danger' : 'warning'}`}>
                        {statusMeta.noteKind === 'blocked' ? <ShieldAlert size={13} /> : <Clock3 size={13} />}
                        {statusMeta.note}
                      </div>
                    )}
                  </div>
                </div>
                <div className="tx-item__right">
                  <div className={`tx-item__amount${statusMeta.isBlocked ? ' tx-item__amount--blocked' : ''}`}>
                    {statusMeta.isBlocked ? '↯ ' : isIncome ? '+' : ''}{displayAmount.toLocaleString('ru-RU')} {sym}
                  </div>
                  {tx.balanceAfter != null && tx.status === 'Completed' && (
                    <div className="tx-item__balance">
                      Баланс: {tx.balanceAfter.toLocaleString('ru-RU')} {sym}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
