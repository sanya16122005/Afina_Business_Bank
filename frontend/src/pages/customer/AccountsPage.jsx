import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { getAccounts, createAccount } from '../../api/accounts';
import { getResponseList, getResponseData, getResponseSummary } from '../../api/response';
import { Plus, CreditCard, Wallet, PiggyBank, ShieldAlert } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import DropdownSelect from '../../components/ui/DropdownSelect';
import AccountDesignPicker from '../../components/ui/AccountDesignPicker';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_TYPE_LABEL,
  CURRENCY_SYMBOL,
} from '../../constants/accounts';
import { getAccountCardClass, formatAccountCardNumber, getDefaultAccountDesign, resolveAccountDesign, getAccountDesignLabel } from '../../utils/accountDesign';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'Checking', label: 'Расчётный (Checking)' },
  { value: 'Savings', label: 'Сберегательный (Savings)' },
];

const ACCOUNT_SUBTYPE_OPTIONS = [
  { value: 'Debit', label: 'Дебетовый' },
  { value: 'Credit', label: 'Кредитный' },
];

const CURRENCY_OPTIONS = [
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'USD', label: 'USD — Доллар' },
  { value: 'EUR', label: 'EUR — Евро' },
];

const DEFAULT_NEW_FORM = {
  accountType: 'Checking',
  subType: 'Debit',
  currency: 'RUB',
  purpose: '',
  cardDesign: getDefaultAccountDesign('Checking', 'Debit'),
};

const isAutoDesign = (form) => form.cardDesign === getDefaultAccountDesign(form.accountType, form.subType);

const FILTERS = [
  { key: 'all',      label: 'Все',              icon: <Wallet size={14} /> },
  { key: 'Checking', label: 'Расчётные',        icon: <CreditCard size={14} /> },
  { key: 'Savings',  label: 'Сберегательные',   icon: <PiggyBank size={14} /> },
];

export default function AccountsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [clientBlocked, setClientBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState('all');
  const [newForm, setNewForm] = useState(DEFAULT_NEW_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAccounts()
      .then((response) => {
        if (cancelled) return;
        setAccounts(getResponseList(response));
        setClientBlocked(Boolean(getResponseSummary(response)?.clientBlocked));
      })
      .catch(() => {
        if (!cancelled) toast.danger('Не удалось загрузить счета');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast]);

  const filtered = useMemo(
    () => (filter === 'all' ? accounts : accounts.filter((a) => a.accountType === filter)),
    [accounts, filter],
  );

  const totals = useMemo(() => ({
    totalRUB: accounts
      .filter((a) => a.currency === 'RUB' && a.status === 'Active')
      .reduce((s, a) => s + (a.balance || 0), 0),
    activeCount: accounts.filter((a) => a.status === 'Active').length,
  }), [accounts]);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const r = await createAccount(newForm);
      const created = getResponseData(r);
      if (created) setAccounts((prev) => [...prev, created]);
      setShowNew(false);
      setNewForm(DEFAULT_NEW_FORM);
      toast.success('Счёт успешно открыт');
    } catch (err) {
      setCreateError(err?.response?.data?.detail || err?.response?.data?.message || 'Не удалось открыть счёт');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Мои счета">
        <div className="page__header">
          <div>
            <Skeleton width={180} height={26} />
            <Skeleton width={260} height={14} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div className="account-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ minHeight: 200 }}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="80%" height={28} style={{ marginTop: 14 }} />
              <Skeleton.Lines count={2} />
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Мои счета">
      {/* Шапка */}
      <div className="page__header">
        <div>
          <div className="page__title">Счета</div>
          <div className="page__subtitle">Управление вашими банковскими счетами</div>
        </div>
        <button className="btn btn--primary btn--lg btn--cta" onClick={() => {
          setNewForm(DEFAULT_NEW_FORM);
          setShowNew(true);
        }}>
          <Plus size={15} /> Открыть счёт
        </button>
      </div>

      {clientBlocked && (
        <div className="account-state-banner">
          <ShieldAlert size={18} />
          Профиль заблокирован банком. Операции по счетам недоступны — обратитесь в отделение.
        </div>
      )}

      {/* Сводка */}
      <div className="stats-grid stats-grid--3">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Общий баланс (RUB)</div>
            <div className="stat-card__value">{totals.totalRUB.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card__icon"><Wallet size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего счетов</div>
            <div className="stat-card__value">{accounts.length}</div>
          </div>
          <div className="stat-card__icon"><CreditCard size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Активных</div>
            <div className="stat-card__value">{totals.activeCount}</div>
          </div>
          <div className="stat-card__icon"><PiggyBank size={20} /></div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn ${filter === f.key ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            onClick={() => setFilter(f.key)}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Карточки */}
      {filtered.length === 0 && (
        <EmptyState
          icon={Wallet}
          title={accounts.length === 0 ? 'У вас пока нет счетов' : 'Ничего не найдено'}
          hint={accounts.length === 0 ? 'Откройте первый счёт, чтобы начать пользоваться сервисом.' : 'Попробуйте изменить фильтры.'}
          action={accounts.length === 0 ? (
            <button className="btn btn--primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> Открыть счёт
            </button>
          ) : null}
        />
      )}
      <div className="account-cards">
        {filtered.map((acc) => (
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
              <span>{CURRENCY_SYMBOL[acc.currency] || acc.currency}</span>
            </div>
            <div className="account-card__row">
              <span className="account-card__label">
                Доступно: {(acc.availableBalance ?? 0).toLocaleString('ru-RU')} {CURRENCY_SYMBOL[acc.currency]}
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
          </div>
        ))}
      </div>

      {/* Модалка «Открыть счёт» */}
      {showNew && (
        <Modal title="Открытие нового счёта" onClose={() => { setShowNew(false); setCreateError(''); }}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => { setShowNew(false); setCreateError(''); }}>Отмена</button>
              <button className="btn btn--primary" onClick={handleCreate} disabled={creating}>
                {creating && <Spinner />}
                {creating ? 'Открытие...' : 'Открыть'}
              </button>
            </>
          }
        >
          {createError && <div className="alert alert--danger u-mb-12">{createError}</div>}
          <div className="form-group">
            <label>Тип счёта</label>
            <DropdownSelect
              value={newForm.accountType}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(value) => setNewForm((previous) => ({
                ...previous,
                accountType: value,
                subType: value === 'Savings' ? null : previous.subType || 'Debit',
                cardDesign: isAutoDesign(previous) ? getDefaultAccountDesign(value, previous.subType) : previous.cardDesign,
              }))}
              placeholder="Выберите тип счёта"
              ariaLabel="Тип счёта"
            />
          </div>
          {newForm.accountType === 'Savings' ? (
            <div className="alert alert--info u-mb-12">
              💰 <strong>Сберегательный счёт</strong> — начисляется <strong>7% годовых</strong> на остаток. Проценты начисляются автоматически каждую минуту на основе серверного времени.
            </div>
          ) : (
            <div className="form-group">
              <label>Подтип</label>
              <DropdownSelect
                value={newForm.subType || 'Debit'}
                options={ACCOUNT_SUBTYPE_OPTIONS}
                onChange={(value) => setNewForm((previous) => ({
                  ...previous,
                  subType: value,
                  cardDesign: isAutoDesign(previous) ? getDefaultAccountDesign(previous.accountType, value) : previous.cardDesign,
                }))}
                placeholder="Выберите подтип"
                ariaLabel="Подтип счёта"
              />
              {newForm.subType === 'Credit' && (
                <div className="alert alert--warning u-mt-8">
                  💳 <strong>Кредитный счёт</strong> — при переводе баланс уходит в минус. Комиссия 0.2% при работе с отрицательным балансом.
                </div>
              )}
            </div>
          )}
          <div className="form-group">
            <label>Валюта</label>
            <DropdownSelect
              value={newForm.currency}
              options={CURRENCY_OPTIONS}
              onChange={(value) => setNewForm((previous) => ({ ...previous, currency: value }))}
              placeholder="Выберите валюту"
              ariaLabel="Валюта"
            />
          </div>
          <div className="form-group">
            <label>Дизайн счёта</label>
            <AccountDesignPicker
              value={newForm.cardDesign}
              onChange={(value) => setNewForm((previous) => ({ ...previous, cardDesign: value }))}
            />
          </div>
          <div className="form-group">
            <label>Назначение (необязательно)</label>
            <input placeholder="Например: На отпуск" value={newForm.purpose} onChange={(e) => setNewForm({ ...newForm, purpose: e.target.value })} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
