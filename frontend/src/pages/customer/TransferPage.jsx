import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getAccounts, lookupAccount } from '../../api/accounts';
import { createTransfer, getTransactions } from '../../api/transactions';
import { getLegalEmployees } from '../../api/legalEntity';
import { getResponseData, getResponseList, getResponseSummary } from '../../api/response';
import DropdownSelect from '../../components/ui/DropdownSelect';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ACCOUNT_TYPE_LABEL, CURRENCY_SYMBOL } from '../../constants/accounts';
import { INCOME_KIND_OPTIONS } from '../../constants/incomeKinds';
import { ArrowLeftRight, CheckCircle, Info, Clock, ShieldAlert } from 'lucide-react';

function isAccountNumberLike(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^10[12]/.test(digits);
}

function buildRecipientLookup(value) {
  const trimmed = String(value || '').trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!trimmed || digits.length < 10) {
    return { mode: '', accountNumber: '', phoneNumber: '' };
  }

  if (isAccountNumberLike(trimmed)) {
    return { mode: 'account', accountNumber: trimmed, phoneNumber: '' };
  }

  return { mode: 'phone', accountNumber: '', phoneNumber: trimmed };
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function TransferPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isLegal = user?.role === 'LegalEntity';

  const [accounts, setAccounts] = useState([]);
  const [clientBlocked, setClientBlocked] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recipientLookup, setRecipientLookup] = useState({ loading: false, data: null, error: '', mode: '' });
  const [form, setForm] = useState({
    fromAccountId: '',
    recipient: '',
    amount: '',
    description: '',
  });
  const [incomeKindCode, setIncomeKindCode] = useState('');
  const [feedback, setFeedback] = useState({ tone: '', message: '' });
  const [error, setError] = useState('');

  const incomeKindOptions = useMemo(
    () => [{ value: '', label: isLegal ? '— выберите код —' : '— не указывать —' }, ...INCOME_KIND_OPTIONS],
    [isLegal],
  );

  // Списывать можно только с активного счёта — замороженные/закрытые
  // в выбор не показываем (перевод по ним всё равно не пройдёт).
  const accountOptions = useMemo(
    () => accounts
      .filter((account) => account.status === 'Active')
      .map((account) => ({
        value: account.id,
        label: `${account.accountNumber} — ${account.balance.toLocaleString('ru-RU')} ${CURRENCY_SYMBOL[account.currency] || account.currency} (${ACCOUNT_TYPE_LABEL[account.accountType] || account.accountType})`,
      })),
    [accounts],
  );

  const hasActiveAccount = useMemo(
    () => accounts.some((a) => a.status === 'Active'),
    [accounts],
  );

  const employeeAccountOptions = useMemo(() => {
    const opts = employees
      .filter((e) => e.defaultAccountNumber)
      .map((e) => ({
        value: e.defaultAccountNumber,
        label: `${e.fullName || e.email} · ${e.defaultAccountNumber}`,
      }));
    return [{ value: '', label: '— выберите сотрудника —' }, ...opts];
  }, [employees]);

  useEffect(() => {
    let cancelled = false;
    const reqs = [
      getAccounts(),
      getTransactions({ type: 'Transfer' }).then(getResponseList),
    ];
    if (isLegal) {
      reqs.push(
        getLegalEmployees().then((r) => (Array.isArray(r.data?.data) ? r.data.data : [])),
      );
    }
    Promise.allSettled(reqs).then((results) => {
      if (cancelled) return;
      const accResult = results[0];
      const txResult = results[1];
      const empResult = isLegal ? results[2] : null;
      if (accResult.status === 'fulfilled') {
        const accs = getResponseList(accResult.value);
        setAccounts(accs);
        setClientBlocked(Boolean(getResponseSummary(accResult.value)?.clientBlocked));
        const firstActive = accs.find((a) => a.status === 'Active');
        setForm((prev) => (prev.fromAccountId || !firstActive
          ? prev
          : { ...prev, fromAccountId: firstActive.id }));
      } else {
        toast.danger('Не удалось загрузить счета');
      }
      if (txResult.status === 'fulfilled') {
        const tx = Array.isArray(txResult.value) ? txResult.value : [];
        setRecentTransfers(tx.slice(0, 3));
      }
      if (isLegal && empResult?.status === 'fulfilled') {
        setEmployees(Array.isArray(empResult.value) ? empResult.value : []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [toast, isLegal]);

  useEffect(() => {
    if (isLegal) return;
    const recipientInput = form.recipient.trim();
    const lookupTarget = buildRecipientLookup(recipientInput);

    if (!lookupTarget.mode) {
      setRecipientLookup({ loading: false, data: null, error: '', mode: '' });
      return;
    }

    let stale = false;

    const timer = window.setTimeout(() => {
      setRecipientLookup((previous) => ({ ...previous, loading: true, error: '', mode: lookupTarget.mode }));

      lookupAccount(lookupTarget)
        .then(getResponseData)
        .then((data) => {
          if (!stale) setRecipientLookup({ loading: false, data, error: '', mode: lookupTarget.mode });
        })
        .catch((lookupError) => {
          if (!stale) setRecipientLookup({
            loading: false,
            data: null,
            error: lookupError?.response?.data?.detail || 'Получатель не найден',
            mode: lookupTarget.mode,
          });
        });
    }, 350);

    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [form.recipient, isLegal]);

  useEffect(() => {
    if (!isLegal || !form.recipient.trim()) {
      if (isLegal) setRecipientLookup({ loading: false, data: null, error: '', mode: '' });
      return;
    }
    const accNum = form.recipient.trim();
    let stale = false;
    setRecipientLookup((p) => ({ ...p, loading: true, error: '' }));
    lookupAccount({ mode: 'account', accountNumber: accNum, phoneNumber: '' })
      .then(getResponseData)
      .then((data) => {
        if (!stale) setRecipientLookup({ loading: false, data, error: '', mode: 'account' });
      })
      .catch((lookupError) => {
        if (!stale) setRecipientLookup({
          loading: false,
          data: null,
          error: lookupError?.response?.data?.detail || 'Счёт не найден',
          mode: 'account',
        });
      });
    return () => { stale = true; };
  }, [form.recipient, isLegal]);

  const handleChange = (field) => (e) => {
    setForm((previous) => ({ ...previous, [field]: e.target.value }));
    setError('');
    setFeedback({ tone: '', message: '' });
  };

  const selectedFrom = accounts.find((a) => a.id === form.fromAccountId);
  const sym = CURRENCY_SYMBOL[selectedFrom?.currency] || '₽';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const recipientInput = form.recipient.trim();
    const recipientTarget = buildRecipientLookup(recipientInput);

    if (!recipientInput || (!isLegal && !recipientTarget.mode)) {
      setError(isLegal ? 'Выберите сотрудника и счёт получателя' : 'Укажите номер счёта или телефона получателя');
      return;
    }
    if (recipientLookup.loading) { setError('Дождитесь проверки счёта получателя'); return; }
    if (recipientLookup.error) { setError(recipientLookup.error); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setError('Укажите корректную сумму'); return; }
    const isCreditAccount = selectedFrom?.subType === 'Credit';
    if (!isCreditAccount && selectedFrom && amt > selectedFrom.availableBalance) { setError('Недостаточно средств'); return; }
    if (recipientLookup.data?.status && recipientLookup.data.status !== 'Active') { setError('Счёт получателя заблокирован'); return; }
    if (selectedFrom && recipientLookup.data?.accountNumber === selectedFrom.accountNumber) {
      setError('Счёт получателя должен отличаться от счёта списания');
      return;
    }
    if (isLegal && !incomeKindCode) {
      setError('Укажите код вида дохода (КВД) для выплаты');
      return;
    }

    try {
      setError('');
      const payload = {
        fromAccountId: form.fromAccountId,
        amount: amt,
        currency: selectedFrom?.currency || 'RUB',
        ...(isLegal && form.description.trim() ? { description: form.description.trim() } : {}),
        ...(recipientTarget.mode === 'phone'
          ? { toPhoneNumber: recipientInput }
          : { toAccountNumber: recipientInput }),
      };
      if (isLegal && incomeKindCode) payload.incomeKindCode = incomeKindCode;

      const response = await createTransfer(payload);
      const pendingReview = response?.status === 202;
      const reviewReason = response?.data?.triggerReason;
      setFeedback({
        tone: pendingReview ? 'warning' : 'success',
        message: pendingReview
          ? `Перевод отправлен на проверку антифрода${reviewReason ? `. ${reviewReason}` : ''}`
          : (isLegal ? 'Выплата выполнена' : 'Перевод успешно выполнен!'),
      });
      setForm((previous) => ({
        ...previous,
        recipient: '',
        amount: '',
        ...(isLegal ? { description: '' } : {}),
      }));
      setIncomeKindCode('');
    } catch (err) {
      setFeedback({ tone: '', message: '' });
      setError(err.response?.data?.detail || err.response?.data?.message || 'Ошибка перевода');
    }
  };

  if (loading) {
    return (
      <Layout title={isLegal ? 'Выплаты' : 'Переводы'}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout title={isLegal ? 'Выплаты сотрудникам' : 'Переводы'}>
      <div className="page__header">
        <div>
          <div className="page__title">{isLegal ? 'Выплаты сотрудникам' : 'Переводы'}</div>
          {!isLegal && (
            <div className="page__subtitle">
              Мгновенные переводы между своими счетами и клиентам банка. Код вида дохода можно указать при необходимости.
            </div>
          )}
        </div>
      </div>

      {clientBlocked ? (
        <div className="account-state-banner">
          <ShieldAlert size={18} />
          Профиль заблокирован банком. Переводы недоступны — обратитесь в отделение.
        </div>
      ) : !hasActiveAccount ? (
        <div className="account-state-banner account-state-banner--warning">
          <ShieldAlert size={18} />
          Нет активных счетов для списания — счёт заморожен или закрыт.
        </div>
      ) : null}

      <div className="transfer-grid">
        <div className="card card--accent">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <ArrowLeftRight size={18} /> {isLegal ? 'Новая выплата' : 'Новый перевод'}
          </div>

          {error && <div className="alert alert--danger">{error}</div>}
          {feedback.message && (
            <div className={`alert alert--${feedback.tone === 'warning' ? 'warning' : 'success'}`}>
              {feedback.tone === 'warning' ? <Clock size={16} /> : <CheckCircle size={16} />}
              {feedback.message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Счёт списания</label>
              <DropdownSelect
                value={form.fromAccountId}
                options={accountOptions}
                onChange={(value) => setForm((previous) => ({ ...previous, fromAccountId: value }))}
                placeholder={accountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
                disabled={!accountOptions.length}
                ariaLabel="Счёт списания"
              />
            </div>

            {isLegal ? (
              <div className="form-group">
                <label>Сотрудник (счёт получателя)</label>
                <DropdownSelect
                  value={form.recipient}
                  options={employeeAccountOptions}
                  onChange={(value) => setForm((previous) => ({ ...previous, recipient: value }))}
                  placeholder="Сначала добавьте сотрудников"
                  disabled={employeeAccountOptions.length <= 1}
                  ariaLabel="Сотрудник"
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Счёт или телефон получателя</label>
                <input
                  placeholder="Например: 101-7000 0000 02 или +7 900 333-44-55"
                  value={form.recipient}
                  onChange={handleChange('recipient')}
                />
                <div className="form-group__hint">Введите номер счёта или телефон — в любом формате.</div>
                {recipientLookup.loading && <div className="form-group__hint">Проверяем получателя...</div>}
                {!recipientLookup.loading && recipientLookup.error && (
                  <div className="form-group__error">{recipientLookup.error}</div>
                )}
                {!recipientLookup.loading && recipientLookup.data && (
                  <div
                    className={`alert alert--${recipientLookup.data.status === 'Active' ? 'success' : 'warning'} transfer-recipient-preview`}
                  >
                    <div className="transfer-recipient-preview__label">Получатель найден</div>
                    <div className="transfer-recipient-preview__name">{recipientLookup.data.ownerName || 'Неизвестный владелец'}</div>
                    <div className="transfer-recipient-preview__meta">
                      {recipientLookup.data.accountNumber} · {recipientLookup.data.currency} · {recipientLookup.data.status === 'Active' ? 'Активен' : 'Заблокирован'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(isLegal || form.recipient) && (
              <>
                {recipientLookup.loading && isLegal && <div className="form-group__hint">Проверяем счёт...</div>}
                {!recipientLookup.loading && recipientLookup.error && isLegal && (
                  <div className="form-group__error">{recipientLookup.error}</div>
                )}
                {!recipientLookup.loading && recipientLookup.data && isLegal && (
                  <div className={`alert alert--${recipientLookup.data.status === 'Active' ? 'success' : 'warning'} transfer-recipient-preview`}>
                    <div className="transfer-recipient-preview__label">Получатель</div>
                    <div className="transfer-recipient-preview__name">{recipientLookup.data.ownerName || '—'}</div>
                    <div className="transfer-recipient-preview__meta">
                      {recipientLookup.data.accountNumber} · {recipientLookup.data.currency}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label>Сумма ({sym})</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={handleChange('amount')}
              />
              {selectedFrom && (
                <div className="form-group__hint">
                  Доступно: {selectedFrom.availableBalance.toLocaleString('ru-RU')} {sym}
                </div>
              )}
            </div>

            {isLegal && (
              <div className="form-group">
                <label>Код вида дохода (КВД)</label>
                <DropdownSelect
                  value={incomeKindCode}
                  options={incomeKindOptions}
                  onChange={setIncomeKindCode}
                  placeholder="Выберите код"
                  ariaLabel="Код вида дохода"
                />
              </div>
            )}

            {isLegal && (
              <div className="form-group">
                <label>Назначение платежа (необязательно)</label>
                <input
                  placeholder="Например: Аванс за май 2026"
                  value={form.description}
                  onChange={handleChange('description')}
                />
              </div>
            )}

            <button type="submit" className="btn btn--primary btn--full btn--lg" style={{ marginTop: 8 }}>
              {isLegal ? 'Выплатить' : 'Перевести'}
            </button>
          </form>
        </div>

        <div className="transfer-info">
          <div className="card">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Info size={16} /> Информация
            </div>
            <ul className="info-list">
              {isLegal ? (
                <>
                  <li>Выплаты в рублях на счёт сотрудника.</li>
                </>
              ) : (
                <>
                  <li>Переводы между своими счетами — мгновенно и без комиссии</li>
                  <li>Переводы клиентам банка по номеру счёта или телефону</li>
                  <li>При необходимости укажите КВД — он сохранится в операции</li>
                  <li>Сберегательный счёт: первое снятие бесплатно, далее комиссия 2.5%</li>
                  <li>Подозрительные операции уходят на проверку антифрода</li>
                </>
              )}
            </ul>
          </div>

          <div className="card">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Clock size={16} /> Последние переводы
            </div>
            {recentTransfers.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Переводов пока нет"
                hint="Здесь появятся ваши последние переводы между счетами."
                compact
              />
            ) : (
              recentTransfers.map((tx) => (
                <div key={tx.id} className="recent-transfer">
                  <div>
                    <div className="recent-transfer__desc">{tx.description || '—'}</div>
                    <div className="recent-transfer__meta">
                      {tx.toAccount?.accountNumber}
                      {tx.incomeKindCode ? ` · КВД ${tx.incomeKindCode}` : ''}
                      {' · '}
                      {fmtDate(tx.createdAt)}
                    </div>
                  </div>
                  <div className="recent-transfer__amount">
                    {tx.amount.toLocaleString('ru-RU')} {CURRENCY_SYMBOL[tx.currency]}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
