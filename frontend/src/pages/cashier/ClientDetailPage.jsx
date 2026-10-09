import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { getClient, createDeposit, createWithdraw, openAccount, changeClientStatus, updateCashierAccountDesign, changeAccountStatus, closeAccount } from '../../api/cashier';
import { useCashierSession } from '../../hooks/useCashierSession';
import { ArrowLeft, CheckCircle, Clock, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Banknote, FolderPlus, Lock, Unlock, Trash2, Snowflake, Sun, Archive, ChevronDown } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import DropdownSelect from '../../components/ui/DropdownSelect';
import AccountDesignPicker from '../../components/ui/AccountDesignPicker';
import { getAccountCardClass, formatAccountCardNumber, getDefaultAccountDesign, resolveAccountDesign, getAccountDesignLabel } from '../../utils/accountDesign';

const TYPE_ICONS = {
  Transfer: ArrowLeftRight,
  Deposit: ArrowUpCircle,
  Withdrawal: ArrowDownCircle,
  Payment: Banknote,
};
const DEFAULT_OPEN_FORM = {
  accountType: 'Checking',
  subType: 'Debit',
  currency: 'RUB',
  initialDeposit: '0',
  purpose: '',
  cardDesign: getDefaultAccountDesign('Checking', 'Debit'),
};

const isAutoDesign = (form) => form.cardDesign === getDefaultAccountDesign(form.accountType, form.subType);

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

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.response?.data?.message || fallback;

function getClientDisplayName(client) {
  return client?.fullName
    || client?.companyName
    || [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim()
    || 'Клиент';
}

const ACCOUNT_STATUS_META = {
  Active: { label: 'Активен', tone: 'success' },
  Frozen: { label: 'Заморожен', tone: 'warning' },
  Closed: { label: 'Закрыт', tone: 'gray' },
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sessionId, loading: sessionLoading, error: sessionError } = useCashierSession();
  const [client, setClient] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState({ tone: '', message: '' });
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showOpenAccount, setShowOpenAccount] = useState(false);
  const [showDesignEditor, setShowDesignEditor] = useState(false);
  const [designTargetAccount, setDesignTargetAccount] = useState(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState(null);
  const [designForm, setDesignForm] = useState(getDefaultAccountDesign('Checking', 'Debit'));
  const [depForm, setDepForm] = useState({ accountId: '', amount: '', description: '' });
  const [wdForm, setWdForm] = useState({ accountId: '', amount: '', description: '' });
  const [openForm, setOpenForm] = useState(DEFAULT_OPEN_FORM);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const displayName = getClientDisplayName(client);

  // Активные — на них можно проводить операции; замороженные временно
  // недоступны, но видны; закрытые уходят в архив.
  const activeAccounts = accounts.filter((a) => a.status === 'Active');
  const operationalAccounts = accounts.filter((a) => a.status !== 'Closed');
  const closedAccounts = accounts.filter((a) => a.status === 'Closed');

  const accountOptions = activeAccounts.map((account) => ({
    value: account.id,
    label: `${account.accountNumber} — ${(account.balance || 0).toLocaleString('ru-RU')} ${account.currency}`,
  }));

  const loadClient = useCallback(async ({ preserveNotice = false } = {}) => {
    setLoading(true);
    if (!preserveNotice) {
      setActionNotice({ tone: '', message: '' });
    }
    try {
      const response = await getClient(id);
      const data = response.data;
      setClient(data);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setTransactions(Array.isArray(data.recentTransactions) ? data.recentTransactions : []);
      setActionError('');
    } catch (error) {
      setClient(null);
      setAccounts([]);
      setTransactions([]);
      if (error?.response?.status !== 404) {
        setActionError(getErrorMessage(error, 'Не удалось загрузить данные клиента'));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  const handleDeposit = async () => {
    const accountId = depForm.accountId || activeAccounts[0]?.id;
    if (!accountId || !sessionId || submitting) return;

    setSubmitting(true);
    try {
      setActionError('');
      const response = await createDeposit({
        accountId,
        amount: Number(depForm.amount),
        currency: 'RUB',
        description: depForm.description,
        sessionId,
      });
      const pendingReview = response?.status === 202;
      const reviewReason = response?.data?.triggerReason;
      setActionNotice({
        tone: pendingReview ? 'warning' : 'success',
        message: pendingReview
          ? `Внесение отправлено на проверку антифрода${reviewReason ? `. ${reviewReason}` : ''}`
          : 'Внесение проведено успешно',
      });
      setShowDeposit(false);
      setDepForm({ accountId: '', amount: '', description: '' });
      await loadClient({ preserveNotice: true });
    } catch (error) {
      setActionNotice({ tone: '', message: '' });
      setActionError(getErrorMessage(error, 'Не удалось внести средства'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    const accountId = wdForm.accountId || activeAccounts[0]?.id;
    if (!accountId || !sessionId || submitting) return;

    setSubmitting(true);
    try {
      setActionError('');
      const response = await createWithdraw({
        accountId,
        amount: Number(wdForm.amount),
        currency: 'RUB',
        description: wdForm.description,
        sessionId,
      });
      const pendingReview = response?.status === 202;
      const reviewReason = response?.data?.triggerReason;
      setActionNotice({
        tone: pendingReview ? 'warning' : 'success',
        message: pendingReview
          ? `Выдача отправлена на проверку антифрода${reviewReason ? `. ${reviewReason}` : ''}`
          : 'Выдача проведена успешно',
      });
      setShowWithdraw(false);
      setWdForm({ accountId: '', amount: '', description: '' });
      await loadClient({ preserveNotice: true });
    } catch (error) {
      setActionNotice({ tone: '', message: '' });
      setActionError(getErrorMessage(error, 'Не удалось выдать средства'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAccount = async () => {
    if (!client || submitting) return;

    setSubmitting(true);
    try {
      setActionError('');
      await openAccount({
        clientId: client.id,
        accountType: openForm.accountType,
        subType: openForm.accountType === 'Savings' ? null : openForm.subType,
        currency: openForm.currency,
        initialDeposit: Number(openForm.initialDeposit),
        purpose: openForm.purpose,
        cardDesign: openForm.cardDesign,
      });
      setShowOpenAccount(false);
      setOpenForm(DEFAULT_OPEN_FORM);
      await loadClient();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Не удалось открыть счёт'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmChangeStatus = async () => {
    if (!client || submitting) return;

    const action = client.status === 'Active' ? 'Block' : 'Unblock';

    setSubmitting(true);
    try {
      setActionError('');
      await changeClientStatus(client.id, { action });
      setStatusConfirmOpen(false);
      await loadClient();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Не удалось изменить статус клиента'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCloseAccount = async () => {
    if (!closeTarget || submitting) return;

    const target = closeTarget;
    setSubmitting(true);
    try {
      setActionError('');
      setActionNotice({ tone: '', message: '' });
      await closeAccount(target.id, { confirmAccountNumber: target.accountNumber });
      setCloseTarget(null);
      setActionNotice({ tone: 'success', message: `Счёт ${target.accountNumber} закрыт` });
      await loadClient({ preserveNotice: true });
    } catch (error) {
      setCloseTarget(null);
      setActionError(getErrorMessage(error, 'Не удалось закрыть счёт'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmFreeze = async () => {
    if (!freezeTarget || submitting) return;

    const target = freezeTarget;
    const action = target.status === 'Active' ? 'Freeze' : 'Unfreeze';
    setSubmitting(true);
    try {
      setActionError('');
      setActionNotice({ tone: '', message: '' });
      await changeAccountStatus(target.id, { action });
      setFreezeTarget(null);
      setActionNotice({
        tone: 'success',
        message: action === 'Freeze'
          ? `Счёт ${target.accountNumber} заморожен`
          : `Счёт ${target.accountNumber} разморожен`,
      });
      await loadClient({ preserveNotice: true });
    } catch (error) {
      setFreezeTarget(null);
      setActionError(getErrorMessage(error, 'Не удалось изменить статус счёта'));
    } finally {
      setSubmitting(false);
    }
  };

  const openDesignEditor = (account) => {
    setDesignTargetAccount(account);
    setDesignForm(resolveAccountDesign(account));
    setShowDesignEditor(true);
  };

  const saveDesign = async () => {
    if (!designTargetAccount) return;

    try {
      setActionError('');
      setActionNotice({ tone: '', message: '' });
      await updateCashierAccountDesign(designTargetAccount.id, { cardDesign: designForm });
      await loadClient({ preserveNotice: true });
      setShowDesignEditor(false);
      setDesignTargetAccount(null);
    } catch (error) {
      setActionError(error?.message || 'Не удалось обновить дизайн счёта');
    }
  };

  const renderAccountCard = (acc, archived = false) => {
    const statusMeta = ACCOUNT_STATUS_META[acc.status] || { label: acc.status || '—', tone: 'gray' };
    return (
      <div key={acc.id} className={`${getAccountCardClass(acc)}${archived ? ' account-card--archived' : ''}`}>
        <div className="account-card__type">
          {acc.accountType} · {acc.subType || 'Savings'}
          <span className={`badge badge--${statusMeta.tone} account-card__status-badge`}>{statusMeta.label}</span>
        </div>
        <div className="account-card__number">{formatAccountCardNumber(acc.accountNumber)}</div>
        <div className="account-card__balance">{acc.balance.toLocaleString('ru-RU')}<span>{acc.currency}</span></div>
        <div className="account-card__label">Доступно: {(acc.availableBalance ?? acc.balance).toLocaleString('ru-RU')} {acc.currency}</div>
        <div className="account-card__footer">
          <span className="account-card__rate">{getAccountDesignLabel(resolveAccountDesign(acc))}</span>
        </div>
        {!archived && (
          <div className="account-card__actions">
            <button className="account-card__btn" onClick={() => openDesignEditor(acc)}>
              Дизайн
            </button>
            {acc.status === 'Active' && (
              <button className="account-card__btn" onClick={() => setFreezeTarget(acc)} disabled={submitting}>
                <Snowflake size={13} /> Заморозить
              </button>
            )}
            {acc.status === 'Frozen' && (
              <button className="account-card__btn account-card__btn--accent" onClick={() => setFreezeTarget(acc)} disabled={submitting}>
                <Sun size={13} /> Разморозить
              </button>
            )}
            {(acc.status === 'Active' || acc.status === 'Frozen') && (
              <button
                className="account-card__btn account-card__btn--danger"
                onClick={() => setCloseTarget(acc)}
                disabled={submitting}
              >
                <Trash2 size={13} /> Закрыть счёт
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <Layout title="Загрузка..."><div className="card u-loading-card">Загрузка...</div></Layout>;

  if (!client) {
    if (actionError) {
      return (
        <Layout title="Ошибка загрузки">
          <div className="card u-loading-card">
            <p>{actionError}</p>
            <button className="btn btn--primary u-mt-16" onClick={() => void loadClient()}>
              Повторить
            </button>
          </div>
        </Layout>
      );
    }

    return (
      <Layout title="Клиент не найден">
        <div className="card u-loading-card">
          <p>Клиент с ID «{id}» не найден.</p>
          <button className="btn btn--primary u-mt-16" onClick={() => navigate('/cashier/clients')}>
            К списку клиентов
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={displayName}>
      <button className="btn btn--ghost btn--sm u-mb-20" onClick={() => navigate('/cashier/clients')}>
        <ArrowLeft size={14} /> Назад к клиентам
      </button>

      {(sessionLoading || sessionError) && (
        <div className={`alert alert--${sessionError ? 'danger' : 'warning'} u-mb-16`}>
          {sessionError || 'Проверка кассового сеанса...'}
        </div>
      )}

      {actionNotice.message && (
        <div className={`alert alert--${actionNotice.tone === 'warning' ? 'warning' : 'success'}`}>
          {actionNotice.tone === 'warning' ? <Clock size={16} /> : <CheckCircle size={16} />}
          {actionNotice.message}
        </div>
      )}

      {actionError && (
        <div className="alert alert--danger u-mb-16">
          {actionError}
        </div>
      )}

      {/* Карточка клиента */}
      <div className="profile-card profile-card--wide u-mb-24">
        <div className="profile-card__header">
          <div className="profile-card__avatar">{displayName.charAt(0)}</div>
          <div>
            <div className="profile-card__name">{displayName}</div>
            <div className="profile-card__meta">
              {client.clientType === 'Individual' ? 'Физическое лицо' : 'Юридическое лицо'} ·{' '}
              <span className={`badge badge--${client.status === 'Active' ? 'success' : 'danger'}`}>
                {client.status === 'Active' ? 'Активен' : 'Заблокирован'}
              </span>
              {client.isDebtor && <span className="badge badge--danger debtor-badge">Должник</span>}
            </div>
          </div>
        </div>
        {[
          ['Телефон', client.phoneNumber],
          ['Email', client.email],
          ['ID', client.id],
        ].map(([label, value]) => (
          <div key={label} className="profile-card__row">
            <span className="profile-card__key">{label}</span>
            <span className="profile-card__val">{value}</span>
          </div>
        ))}
      </div>

      {/* Действия */}
      <div className="cashier-action-bar">
        <button className="btn btn--soft-primary" onClick={() => setShowDeposit(true)} disabled={client.status !== 'Active' || !activeAccounts.length}>
          <ArrowUpCircle size={15} /> Внести средства
        </button>
        <button className="btn btn--soft-warning" onClick={() => setShowWithdraw(true)} disabled={client.status !== 'Active' || !activeAccounts.length}>
          <ArrowDownCircle size={15} /> Выдать средства
        </button>
        <button className="btn btn--ghost" onClick={() => {
          setOpenForm(DEFAULT_OPEN_FORM);
          setShowOpenAccount(true);
        }} disabled={client.status !== 'Active'}>
          <FolderPlus size={15} /> Открыть счёт
        </button>
        {client.status === 'Active'
          ? <button className="btn btn--soft-danger" onClick={() => setStatusConfirmOpen(true)} disabled={submitting}><Lock size={15} /> Заблокировать</button>
          : <button className="btn btn--soft-success" onClick={() => setStatusConfirmOpen(true)} disabled={submitting}><Unlock size={15} /> Разблокировать</button>}
      </div>

      {/* Счета клиента */}
      <div className="section-title">Счета клиента</div>
      {operationalAccounts.length === 0 ? (
        <div className="card empty-state-block u-mb-28">У клиента нет действующих счетов.</div>
      ) : (
        <div className="account-cards u-mb-28">
          {operationalAccounts.map((acc) => renderAccountCard(acc, false))}
        </div>
      )}

      {/* Архив закрытых счетов */}
      {closedAccounts.length > 0 && (
        <>
          <button
            type="button"
            className="account-archive-toggle"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
          >
            <Archive size={15} />
            Закрытые счета ({closedAccounts.length})
            <ChevronDown size={15} className={`account-archive-toggle__chevron${showClosed ? ' is-open' : ''}`} />
          </button>
          {showClosed && (
            <div className="account-cards account-cards--archive u-mb-28">
              {closedAccounts.map((acc) => renderAccountCard(acc, true))}
            </div>
          )}
        </>
      )}

      {/* Транзакции клиента */}
      <div className="section-title">Последние операции</div>
      <div className="card card--flush">
        {transactions.length === 0 && (
          <div className="empty-state-block">Операций пока нет.</div>
        )}
        {transactions.slice(0, 5).map((tx) => (
          <div key={tx.id} className={`tx-item tx-item--${tx.amount > 0 ? 'income' : 'expense'}`}>
            <div className="tx-item__left">
              <div className="tx-item__icon">
                {(() => {
                  const TxIcon = TYPE_ICONS[tx.type] || Banknote;
                  return <TxIcon size={16} />;
                })()}
              </div>
              <div>
                <div className="tx-item__desc">{tx.description}</div>
                <div className="tx-item__meta">
                  <span className="tx-item__date">{tx.createdAt}</span>
                  <span className="tx-item__ref">{tx.reference}</span>
                  {tx.accountNumber && <span className="tx-item__ref">{tx.accountNumber}</span>}
                </div>
              </div>
            </div>
            <div className="tx-item__right">
              <div className="tx-item__amount">
                {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('ru-RU')} {tx.currency}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Модалка внесения */}
      {showDeposit && (
        <Modal title="Внесение средств" onClose={() => setShowDeposit(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowDeposit(false)} disabled={submitting}>Отмена</button>
              <button className="btn btn--primary" onClick={handleDeposit} disabled={!sessionId || submitting}>{submitting ? 'Обработка…' : 'Внести'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Счёт зачисления</label>
            <DropdownSelect
              value={depForm.accountId}
              options={accountOptions}
              onChange={(value) => setDepForm((previous) => ({ ...previous, accountId: value }))}
              placeholder={accountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
              disabled={!accountOptions.length}
              ariaLabel="Счёт зачисления"
            />
          </div>
          <div className="form-group">
            <label>Сумма</label>
            <input type="number" min="0" placeholder="0.00" value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Комментарий</label>
            <input placeholder="Основание операции" value={depForm.description} onChange={(e) => setDepForm({ ...depForm, description: e.target.value })} />
          </div>
        </Modal>
      )}

      {/* Модалка выдачи */}
      {showWithdraw && (
        <Modal title="Выдача средств" onClose={() => setShowWithdraw(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowWithdraw(false)} disabled={submitting}>Отмена</button>
              <button className="btn btn--warning" onClick={handleWithdraw} disabled={!sessionId || submitting}>{submitting ? 'Обработка…' : 'Выдать'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Счёт списания</label>
            <DropdownSelect
              value={wdForm.accountId}
              options={accountOptions}
              onChange={(value) => setWdForm((previous) => ({ ...previous, accountId: value }))}
              placeholder={accountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
              disabled={!accountOptions.length}
              ariaLabel="Счёт списания"
            />
          </div>
          <div className="form-group">
            <label>Сумма</label>
            <input type="number" min="0" placeholder="0.00" value={wdForm.amount} onChange={(e) => setWdForm({ ...wdForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Комментарий</label>
            <input placeholder="Основание операции" value={wdForm.description} onChange={(e) => setWdForm({ ...wdForm, description: e.target.value })} />
          </div>
        </Modal>
      )}

      {showOpenAccount && (
        <Modal title="Открытие счёта" onClose={() => setShowOpenAccount(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowOpenAccount(false)} disabled={submitting}>Отмена</button>
              <button className="btn btn--primary" onClick={handleOpenAccount} disabled={submitting}>{submitting ? 'Обработка…' : 'Открыть'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Тип счёта</label>
            <DropdownSelect
              value={openForm.accountType}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(value) => setOpenForm((previous) => ({
                ...previous,
                accountType: value,
                cardDesign: isAutoDesign(previous) ? getDefaultAccountDesign(value, previous.subType) : previous.cardDesign,
              }))}
              placeholder="Выберите тип счёта"
              ariaLabel="Тип счёта"
            />
          </div>
          {openForm.accountType !== 'Savings' && (
            <div className="form-group">
              <label>Подтип</label>
              <DropdownSelect
                value={openForm.subType}
                options={ACCOUNT_SUBTYPE_OPTIONS}
                onChange={(value) => setOpenForm((previous) => ({
                  ...previous,
                  subType: value,
                  cardDesign: isAutoDesign(previous) ? getDefaultAccountDesign(previous.accountType, value) : previous.cardDesign,
                }))}
                placeholder="Выберите подтип"
                ariaLabel="Подтип счёта"
              />
            </div>
          )}
          <div className="form-group">
            <label>Валюта</label>
            <DropdownSelect
              value={openForm.currency}
              options={CURRENCY_OPTIONS}
              onChange={(value) => setOpenForm((previous) => ({ ...previous, currency: value }))}
              placeholder="Выберите валюту"
              ariaLabel="Валюта"
            />
          </div>
          <div className="form-group">
            <label>Дизайн счёта</label>
            <AccountDesignPicker
              value={openForm.cardDesign}
              onChange={(value) => setOpenForm((previous) => ({ ...previous, cardDesign: value }))}
            />
          </div>
          <div className="form-group">
            <label>Начальный взнос</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={openForm.initialDeposit}
              onChange={(e) => setOpenForm({ ...openForm, initialDeposit: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Назначение</label>
            <input
              placeholder="Например: На отпуск"
              value={openForm.purpose}
              onChange={(e) => setOpenForm({ ...openForm, purpose: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {showDesignEditor && designTargetAccount && (
        <Modal
          title="Изменить дизайн счёта"
          onClose={() => {
            setShowDesignEditor(false);
            setDesignTargetAccount(null);
          }}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => {
                setShowDesignEditor(false);
                setDesignTargetAccount(null);
              }}>Отмена</button>
              <button className="btn btn--primary" onClick={saveDesign}>Сохранить</button>
            </>
          }
        >
          <div className="form-group form-group--flush">
            <label>Выберите новый дизайн</label>
            <AccountDesignPicker
              value={designForm}
              onChange={setDesignForm}
            />
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={statusConfirmOpen && Boolean(client)}
        title={client?.status === 'Active' ? 'Блокировка клиента' : 'Разблокировка клиента'}
        message={client?.status === 'Active'
          ? `Заблокировать клиента «${displayName}»? Операции по его счетам будут недоступны.`
          : `Разблокировать клиента «${displayName}»? Операции по счетам снова станут доступны.`}
        confirmLabel={client?.status === 'Active' ? 'Заблокировать' : 'Разблокировать'}
        tone={client?.status === 'Active' ? 'danger' : 'primary'}
        busy={submitting}
        onConfirm={confirmChangeStatus}
        onCancel={() => setStatusConfirmOpen(false)}
      />

      <ConfirmModal
        open={Boolean(closeTarget)}
        title="Закрытие счёта"
        message={closeTarget
          ? `Закрыть счёт ${closeTarget.accountNumber}? Действие необратимо, счёт уйдёт в архив. Закрыть можно только счёт с нулевым балансом.`
          : ''}
        confirmLabel="Закрыть счёт"
        tone="danger"
        busy={submitting}
        onConfirm={confirmCloseAccount}
        onCancel={() => setCloseTarget(null)}
      />

      <ConfirmModal
        open={Boolean(freezeTarget)}
        title={freezeTarget?.status === 'Frozen' ? 'Разморозка счёта' : 'Заморозка счёта'}
        message={freezeTarget
          ? (freezeTarget.status === 'Frozen'
            ? `Разморозить счёт ${freezeTarget.accountNumber}? Операции по счёту снова станут доступны.`
            : `Заморозить счёт ${freezeTarget.accountNumber}? Операции по счёту будут временно недоступны, счёт можно разморозить позже.`)
          : ''}
        confirmLabel={freezeTarget?.status === 'Frozen' ? 'Разморозить' : 'Заморозить'}
        tone={freezeTarget?.status === 'Frozen' ? 'primary' : 'warning'}
        busy={submitting}
        onConfirm={confirmFreeze}
        onCancel={() => setFreezeTarget(null)}
      />
    </Layout>
  );
}
