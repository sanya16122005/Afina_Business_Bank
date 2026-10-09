import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { getAccounts } from '../../api/accounts';
import { getTransactions } from '../../api/transactions';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSignedTransactionAmount, getTransactionStatusMeta } from '../../utils/transactionUtils';
import { getResponseList, getResponseSummary } from '../../api/response';
import { getAccountCardClass, formatAccountCardNumber, resolveAccountDesign, getAccountDesignLabel } from '../../utils/accountDesign';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_TYPE_LABEL,
  CURRENCY_SYMBOL,
  TRANSACTION_TYPE_ICON,
} from '../../constants/accounts';
import {
  CreditCard, Receipt, TrendingUp, Wallet,
  ShieldAlert, Clock3,
} from 'lucide-react';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [clientBlocked, setClientBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      getAccounts(),
      getTransactions().then(getResponseList),
    ]).then((results) => {
      if (cancelled) return;

      const [accResult, txResult] = results;
      if (accResult.status === 'fulfilled') {
        setAccounts(getResponseList(accResult.value));
        setClientBlocked(Boolean(getResponseSummary(accResult.value)?.clientBlocked));
      } else {
        toast.danger('Не удалось загрузить счета');
      }
      if (txResult.status === 'fulfilled') {
        setTransactions(Array.isArray(txResult.value) ? txResult.value : []);
      } else {
        toast.danger('Не удалось загрузить операции');
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [toast]);

  const summary = useMemo(() => ({
    totalBalanceRUB: accounts.filter((a) => a.currency === 'RUB').reduce((s, a) => s + (a.balance || 0), 0),
    totalBalanceUSD: accounts.filter((a) => a.currency === 'USD').reduce((s, a) => s + (a.balance || 0), 0),
    totalBalanceEUR: accounts.filter((a) => a.currency === 'EUR').reduce((s, a) => s + (a.balance || 0), 0),
    activeAccountsCount: accounts.filter((a) => a.status === 'Active').length,
  }), [accounts]);

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  if (loading) {
    return (
      <Layout title="Главная">
        <div className="dash-greeting">
          <Skeleton width={260} height={26} />
          <Skeleton width={180} height={14} style={{ marginTop: 6 }} />
        </div>
        <div className="stats-grid stats-grid--4">
          {[0, 1, 2, 3].map((i) => <Skeleton.Card key={i} height={104} />)}
        </div>
        <div className="section-title section-title--mb-14">Мои счета</div>
        <div className="account-cards">
          {[0, 1].map((i) => (
            <div key={i} className="card" style={{ minHeight: 180 }}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="80%" height={26} style={{ marginTop: 14 }} />
              <Skeleton.Lines count={2} />
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Главная">
      <div className="dash-greeting">
        <h2 className="dash-greeting__title">
          {user?.firstName ? `Добро пожаловать, ${user.firstName}!` : 'Добро пожаловать!'}
        </h2>
        <p className="dash-greeting__date">
          {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {clientBlocked && (
        <div className="account-state-banner">
          <ShieldAlert size={18} />
          Профиль заблокирован банком. Операции по счетам недоступны — обратитесь в отделение.
        </div>
      )}

      <div className="stats-grid stats-grid--4">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Баланс RUB</div>
            <div className="stat-card__value">{summary.totalBalanceRUB.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><Wallet size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Баланс USD</div>
            <div className="stat-card__value">${summary.totalBalanceUSD.toLocaleString('en-US')}</div>
          </div>
          <div className="stat-card__icon"><TrendingUp size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Баланс EUR</div>
            <div className="stat-card__value">€{summary.totalBalanceEUR.toLocaleString('de-DE')}</div>
          </div>
          <div className="stat-card__icon"><TrendingUp size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Активных счетов</div>
            <div className="stat-card__value">{summary.activeAccountsCount}</div>
          </div>
          <div className="stat-card__icon"><CreditCard size={20} /></div>
        </div>
      </div>

      <div className="section-title">Мои счета</div>
      <div className="account-cards">
        {accounts.map((acc) => {
          const sym = CURRENCY_SYMBOL[acc.currency] || acc.currency;
          return (
            <div
              key={acc.id}
              className={`${getAccountCardClass(acc)}${acc.status !== 'Active' ? ' account-card--inactive' : ''}`}
              onClick={() => navigate(`/accounts/${acc.id}`)}
            >
              <div className="account-card__type">
                {ACCOUNT_TYPE_LABEL[acc.accountType] || acc.accountType}
                {acc.subType ? ` · ${ACCOUNT_SUBTYPE_LABEL[acc.subType] || acc.subType}` : ''}
              </div>
              <div className="account-card__number">{formatAccountCardNumber(acc.accountNumber)}</div>
              <div className="account-card__balance">
                {(acc.balance ?? 0).toLocaleString('ru-RU')}
                <span>{sym}</span>
              </div>
              <div className="account-card__row">
                <span className="account-card__label">
                  Доступно: {(acc.availableBalance ?? 0).toLocaleString('ru-RU')} {sym}
                </span>
                {acc.cardCount > 0 && (
                  <span className="account-card__cards">
                    <CreditCard size={13} /> {acc.cardCount}
                  </span>
                )}
              </div>
              <div className="account-card__footer">
                <span className={`badge badge--${ACCOUNT_STATUS_TONE[acc.status] || 'gray'}`}>
                  {ACCOUNT_STATUS_LABEL[acc.status] || acc.status}
                </span>
                <div className="account-card__footer-meta">
                  <span className="account-card__rate">{getAccountDesignLabel(resolveAccountDesign(acc))}</span>
                  {acc.interestRate > 0 && (
                    <span className="account-card__rate">{acc.interestRate}% годовых</span>
                  )}
                </div>
              </div>
              <div className="account-card__actions">
                <button className="account-card__btn" onClick={(e) => { e.stopPropagation(); navigate('/transfer'); }}>
                  Перевести
                </button>
                <button className="account-card__btn" onClick={(e) => { e.stopPropagation(); navigate(`/accounts/${acc.id}`); }}>
                  Детали
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-title">Последние операции</div>
      <div className="card card--flush">
        {recentTransactions.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="Пока нет операций"
            hint="Здесь будут отображаться ваши транзакции после первого пополнения или перевода."
            compact
          />
        )}
        {recentTransactions.map((tx) => {
          const statusMeta = getTransactionStatusMeta(tx);
          const signed = getSignedTransactionAmount(tx, accounts);
          const isIncome = signed > 0;
          const displayAmount = statusMeta.isBlocked ? (Number(tx.amount) || 0) : signed;
          const descriptionText = (isIncome && tx.incomingPayroll?.summary)
            ? tx.incomingPayroll.summary
            : (tx.description || tx.reference || tx.type || 'Операция');
          const TypeIcon = TRANSACTION_TYPE_ICON[tx.type] || Receipt;
          const sym = CURRENCY_SYMBOL[tx.currency] || tx.currency;
          return (
            <div key={tx.id} className={`tx-item tx-item--${isIncome ? 'income' : 'expense'}${statusMeta.isBlocked ? ' tx-item--blocked' : statusMeta.isReview ? ' tx-item--review' : ''}`}>
              <div className="tx-item__left">
                <div className="tx-item__icon"><TypeIcon size={16} /></div>
                <div>
                  <div className="tx-item__desc">{descriptionText}</div>
                  <div className="tx-item__meta">
                    <span className="tx-item__date">{fmtDate(tx.createdAt)}</span>
                    {tx.merchant && <span className="tx-item__ref">{tx.merchant.name}</span>}
                    <span className={`badge badge--${statusMeta.badge}`}>{statusMeta.label}</span>
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
        })}
      </div>
    </Layout>
  );
}
