import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getAccount } from '../../api/accounts';
import { updateAccountDesign } from '../../api/accounts';
import { getTransactions } from '../../api/transactions';
import { getSignedTransactionAmount, getTransactionStatusMeta } from '../../utils/transactionUtils';
import { getResponseData, getResponseList } from '../../api/response';
import Modal from '../../components/ui/Modal';
import AccountDesignPicker from '../../components/ui/AccountDesignPicker';
import EmptyState from '../../components/ui/EmptyState';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_TYPE_LABEL,
  CURRENCY_SYMBOL,
  TRANSACTION_TYPE_ICON,
  TRANSACTION_TYPE_LABEL,
} from '../../constants/accounts';
import { getAccountCardClass, formatAccountCardNumber, getDefaultAccountDesign, resolveAccountDesign, getAccountDesignLabel } from '../../utils/accountDesign';
import {
  ArrowLeft, CreditCard, Receipt, Copy, Check,
  ShieldAlert, Clock3,
} from 'lucide-react';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);
  const [showDesignEditor, setShowDesignEditor] = useState(false);
  const [designDraft, setDesignDraft] = useState(getDefaultAccountDesign('Checking', 'Debit'));
  const [designSaving, setDesignSaving] = useState(false);
  const [designError, setDesignError] = useState('');

  useEffect(() => {
    Promise.all([
      getAccount(id).then(getResponseData).catch(() => null),
      getTransactions({ accountId: id }).then(getResponseList).catch(() => []),
    ]).then(([acc, tx]) => {
      setAccount(acc);
      setTransactions(Array.isArray(tx) ? tx : []);
    }).finally(() => setLoading(false));
  }, [id]);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const openDesignEditor = () => {
    setDesignDraft(resolveAccountDesign(account));
    setDesignError('');
    setShowDesignEditor(true);
  };

  const saveDesign = async () => {
    setDesignSaving(true);
    setDesignError('');
    try {
      const response = await updateAccountDesign(account.id, { cardDesign: designDraft });
      const result = response.data || {};
      setAccount((previous) => previous ? { ...previous, cardDesign: result.cardDesign || designDraft } : previous);
      setShowDesignEditor(false);
    } catch (error) {
      setDesignError(error?.response?.data?.detail || error?.response?.data?.message || 'Не удалось обновить дизайн счёта');
    } finally {
      setDesignSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Загрузка...">
        <div className="card" style={{textAlign:'center',padding:40}}>Загрузка...</div>
      </Layout>
    );
  }

  if (!account) {
    return (
      <Layout title="Счёт не найден">
        <div className="card empty-state">
          <p>Счёт с ID «{id}» не найден.</p>
          <button className="btn btn--primary" onClick={() => navigate('/accounts')}>
            К списку счетов
          </button>
        </div>
      </Layout>
    );
  }

  const sym = CURRENCY_SYMBOL[account.currency] || account.currency;
  const infoRows = [
    ['Статус', <span className={`badge badge--${ACCOUNT_STATUS_TONE[account.status] || 'gray'}`}>{ACCOUNT_STATUS_LABEL[account.status] || account.status}</span>],
    ['Дизайн', <span className="badge badge--gray">{getAccountDesignLabel(resolveAccountDesign(account))}</span>],
    ['IBAN', (
      <span className="copyable" onClick={() => copyToClipboard(account.iban, 'iban')}>
        {account.iban} {copied === 'iban' ? <Check size={13} /> : <Copy size={13} />}
      </span>
    )],
    ['BIC', account.bic],
    ['Дата открытия', fmtDate(account.openedAt)],
    ['Последняя операция', account.lastTransactionAt ? fmtDateTime(account.lastTransactionAt) : '—'],
    ['Назначение', account.purpose || '—'],
    account.holdAmount > 0 && ['Холд', `${account.holdAmount.toLocaleString('ru-RU')} ${sym}`],
    account.interestRate > 0 && ['Процентная ставка', `${account.interestRate}% годовых`],
    account.subType === 'Credit' && ['Тип карты', 'Кредитный — баланс может уходить в минус при переводах'],
    ['Привязанных карт', (
      <span className="account-card__cards">
        <CreditCard size={13} /> {account.cardCount}
      </span>
    )],
  ].filter(Boolean);

  return (
    <Layout title={`Счёт ${account.accountNumber}`}>
      <button className="btn btn--ghost btn--sm" style={{ marginBottom: 20 }} onClick={() => navigate('/accounts')}>
        <ArrowLeft size={14} /> Назад к счетам
      </button>

      {/* Карточка счёта */}
      <div className={`${getAccountCardClass(account)}${account.status !== 'Active' ? ' account-card--inactive' : ''}`}
        style={{ maxWidth: 420, cursor: 'default', marginBottom: 28 }}
      >
        <div className="account-card__type">
          {ACCOUNT_TYPE_LABEL[account.accountType] || account.accountType}
          {account.subType ? ` · ${ACCOUNT_SUBTYPE_LABEL[account.subType] || account.subType}` : ''}
        </div>
        <div className="account-card__number">{formatAccountCardNumber(account.accountNumber)}</div>
        <div className="account-card__balance">
          {(account.balance ?? 0).toLocaleString('ru-RU')}<span>{sym}</span>
        </div>
        <div className="account-card__label">
          Доступно: {(account.availableBalance ?? 0).toLocaleString('ru-RU')} {sym}
        </div>
        <div className="account-card__footer">
          <span className="account-card__rate">{getAccountDesignLabel(resolveAccountDesign(account))}</span>
        </div>
        <div className="account-card__actions">
          <button className="account-card__btn" onClick={openDesignEditor} disabled={designSaving}>
            Изменить дизайн
          </button>
        </div>
      </div>

      {/* Детали */}
      <div className="card" style={{ maxWidth: 420, marginBottom: 28 }}>
        <div className="section-title" style={{ marginBottom: 16 }}>Информация о счёте</div>
        {infoRows.map(([label, value]) => (
          <div key={label} className="profile-card__row">
            <span className="profile-card__key">{label}</span>
            <span className="profile-card__val">{value}</span>
          </div>
        ))}
      </div>

      {/* Транзакции */}
      <div className="section-title">История операций</div>
      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Операций по этому счёту пока нет"
          hint="Здесь появятся все операции после первого пополнения, перевода или оплаты."
          compact
        />
      ) : (
        <div className="card card--flush">
          {transactions.map((tx) => {
            const statusMeta = getTransactionStatusMeta(tx);
            const signed = getSignedTransactionAmount(tx, [id]);
            const isIncome = signed > 0;
            const displayAmount = statusMeta.isBlocked ? (Number(tx.amount) || 0) : signed;
            const descriptionText = tx.description || tx.reference || TRANSACTION_TYPE_LABEL[tx.type] || tx.type || 'Операция';
            const TxIcon = TRANSACTION_TYPE_ICON[tx.type] || Receipt;
            return (
              <div key={tx.id} className={`tx-item tx-item--${isIncome ? 'income' : 'expense'}${statusMeta.isBlocked ? ' tx-item--blocked' : statusMeta.isReview ? ' tx-item--review' : ''}`}>
                <div className="tx-item__left">
                  <div className="tx-item__icon"><TxIcon size={16} /></div>
                  <div>
                    <div className="tx-item__desc">{descriptionText}</div>
                    <div className="tx-item__meta">
                      <span className="tx-item__date">{fmtDateTime(tx.createdAt)}</span>
                      {tx.merchant && <span className="tx-item__ref">{tx.merchant.name}</span>}
                      {tx.location && <span className="tx-item__ref">{tx.location}</span>}
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
      )}

      {showDesignEditor && (
        <Modal
          title="Изменить дизайн счёта"
          onClose={() => setShowDesignEditor(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setShowDesignEditor(false)}>Отмена</button>
              <button className="btn btn--primary" onClick={saveDesign} disabled={designSaving}>
                {designSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </>
          }
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Выберите новый дизайн</label>
            {designError && <div className="alert alert--danger" style={{ marginBottom: 12 }}>{designError}</div>}
            <AccountDesignPicker value={designDraft} onChange={setDesignDraft} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
