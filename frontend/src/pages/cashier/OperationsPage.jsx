import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { getClient, getClients, createDeposit, createWithdraw, createTransfer, getCashierReportTransactions } from '../../api/cashier';
import { getResponseList } from '../../api/response';
import { useCashierSession } from '../../hooks/useCashierSession';
import Modal from '../../components/ui/Modal';
import DropdownSelect from '../../components/ui/DropdownSelect';
import { INCOME_KIND_OPTIONS } from '../../constants/incomeKinds';
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight } from 'lucide-react';

const OPERATION_TYPE_META = {
  Deposit: { label: 'Внесение', icon: ArrowUpCircle },
  Withdrawal: { label: 'Выдача', icon: ArrowDownCircle },
  Transfer: { label: 'Перевод', icon: ArrowLeftRight },
};

const OPERATION_STATUS_META = {
  Completed: { label: 'Выполнено', tone: 'success' },
  Pending: { label: 'На проверке', tone: 'warning' },
  PendingReview: { label: 'На проверке', tone: 'warning' },
  Blocked: { label: 'Заблокировано', tone: 'danger' },
};

function formatOperationTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function formatOperationAmount(operation) {
  const amount = Number(operation?.amount || 0);
  const signedAmount = operation?.type === 'Deposit' ? amount : -amount;
  return `${signedAmount >= 0 ? '+' : ''}${Math.abs(signedAmount).toLocaleString('ru-RU')} ${operation?.currency || 'RUB'}`;
}

export default function OperationsPage() {
  const { sessionId, error: sessionError } = useCashierSession();
  const [clients, setClients] = useState([]);
  const [operations, setOperations] = useState([]);
  const [clientAccounts, setClientAccounts] = useState([]);
  const [recipientAccounts, setRecipientAccounts] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [operationsError, setOperationsError] = useState('');
  const [activeOp, setActiveOp] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [opForm, setOpForm] = useState({
    clientId: '',
    accountId: '',
    recipientClientId: '',
    recipientAccountId: '',
    amount: '',
    description: '',
    toAccountNumber: '',
    incomeKindCode: '',
  });

  const activeClients = clients.filter((client) => client.status === 'Active');
  const recipientClients = activeClients.filter((client) => client.id !== opForm.clientId);

  const transferClientOptions = clients.map((client) => ({
    value: client.id,
    label: client.fullName || client.companyName || 'Клиент',
  }));

  const activeClientOptions = activeClients.map((client) => ({
    value: client.id,
    label: client.fullName || client.companyName || 'Клиент',
  }));

  const recipientClientOptions = recipientClients.map((client) => ({
    value: client.id,
    label: client.fullName || client.companyName || 'Клиент',
  }));

  const clientAccountOptions = clientAccounts.map((account) => ({
    value: account.id,
    label: `${account.accountNumber} — ${(account.balance || 0).toLocaleString('ru-RU')} ${account.currency}`,
  }));

  const recipientAccountOptions = recipientAccounts.map((account) => ({
    value: account.id,
    label: `${account.accountNumber} — ${(account.balance || 0).toLocaleString('ru-RU')} ${account.currency}`,
  }));

  useEffect(() => {
    let cancelled = false;

    getClients().then(getResponseList)
      .then((data) => {
        if (cancelled) return;

        const nextClients = Array.isArray(data) ? data : [];
        setClients(nextClients);

        setOpForm((prev) => {
          if (prev.clientId || !nextClients[0]?.id) {
            return prev;
          }

          return { ...prev, clientId: nextClients[0].id };
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const loadOperations = useCallback(async () => {
    if (!sessionId) {
      setOperations([]);
      setOperationsLoading(false);
      return;
    }

    setOperationsError('');
    try {
      const response = await getCashierReportTransactions({ scope: 'session', sessionId });
      setOperations(getResponseList(response));
    } catch (error) {
      setOperations([]);
      setOperationsError(error?.response?.data?.detail || 'Не удалось загрузить операции');
    } finally {
      setOperationsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setOperationsLoading(true);
    void loadOperations();
  }, [loadOperations]);

  useEffect(() => {
    if (!opForm.clientId) {
      setClientAccounts([]);
      return;
    }

    let cancelled = false;
    setClientLoading(true);

    getClient(opForm.clientId)
      .then((response) => {
        if (cancelled) return;

        const data = response.data;
        const accounts = Array.isArray(data.accounts)
          ? data.accounts.filter((account) => account.status === 'Active')
          : [];

        setClientAccounts(accounts);
        setOpForm((prev) => {
          const existingAccount = accounts.some((account) => account.id === prev.accountId)
            ? prev.accountId
            : accounts[0]?.id || '';

          if (existingAccount === prev.accountId) {
            return prev;
          }

          return { ...prev, accountId: existingAccount };
        });
      })
      .catch(() => {
        if (cancelled) return;

        setClientAccounts([]);
        setOpForm((prev) => ({ ...prev, accountId: '' }));
      })
      .finally(() => {
        if (!cancelled) {
          setClientLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opForm.clientId]);

  useEffect(() => {
    if (!opForm.recipientClientId) {
      setRecipientAccounts([]);
      setOpForm((prev) => ({ ...prev, recipientAccountId: '', toAccountNumber: '' }));
      return;
    }

    let cancelled = false;
    setRecipientLoading(true);

    getClient(opForm.recipientClientId)
      .then((response) => {
        if (cancelled) return;

        const data = response.data;
        const accounts = Array.isArray(data.accounts)
          ? data.accounts.filter((account) => account.status === 'Active')
          : [];

        setRecipientAccounts(accounts);
        setOpForm((prev) => {
          const nextRecipientAccountId = accounts.some((account) => account.id === prev.recipientAccountId)
            ? prev.recipientAccountId
            : accounts[0]?.id || '';
          const nextRecipientAccount = accounts.find((account) => account.id === nextRecipientAccountId);

          if (nextRecipientAccountId === prev.recipientAccountId && nextRecipientAccount?.accountNumber === prev.toAccountNumber) {
            return prev;
          }

          return {
            ...prev,
            recipientAccountId: nextRecipientAccountId,
            toAccountNumber: nextRecipientAccount?.accountNumber || '',
          };
        });
      })
      .catch(() => {
        if (cancelled) return;

        setRecipientAccounts([]);
        setOpForm((prev) => ({ ...prev, recipientAccountId: '', toAccountNumber: '' }));
      })
      .finally(() => {
        if (!cancelled) {
          setRecipientLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opForm.recipientClientId]);

  const handleComplete = async (type) => {
    // Защита от двойной/тройной отправки: пока запрос в полёте, повторные
    // клики по кнопке игнорируются — иначе создавались дубли операций
    // («затроение перевода»).
    if (submitting) return;

    const labels = { deposit: 'Внесение', withdraw: 'Выдача', transfer: 'Перевод' };
    const amount = Number(opForm.amount);
    const accountId = opForm.accountId || clientAccounts[0]?.id;

    if (!sessionId) {
      setSuccess('Ошибка: кассовый сеанс не открыт');
      return;
    }

    if (!opForm.clientId) {
      setSuccess('Ошибка: выберите клиента');
      return;
    }

    if (!accountId) {
      setSuccess('Ошибка: выберите счёт клиента');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setSuccess('Ошибка: укажите корректную сумму');
      return;
    }

    if (type === 'transfer' && !opForm.toAccountNumber.trim()) {
      setSuccess('Ошибка: выберите счёт получателя');
      return;
    }

    if (type === 'transfer' && opForm.accountId && opForm.accountId === opForm.recipientAccountId) {
      setSuccess('Ошибка: счёт получателя должен отличаться от счёта списания');
      return;
    }

    setSubmitting(true);
    try {
      let response;

      if (type === 'deposit') {
        response = await createDeposit({
          accountId,
          amount,
          currency: 'RUB',
          description: opForm.description,
          sessionId,
        });
      } else if (type === 'withdraw') {
        response = await createWithdraw({
          accountId,
          amount,
          currency: 'RUB',
          description: opForm.description,
          sessionId,
        });
      } else {
        response = await createTransfer({
          fromAccountId: accountId,
          toAccountNumber: opForm.toAccountNumber.trim(),
          amount,
          currency: 'RUB',
          description: opForm.description,
          sessionId,
          ...(opForm.incomeKindCode ? { incomeKindCode: opForm.incomeKindCode } : {}),
        });
      }

      const isPendingReview = response?.status === 202;
      const reviewReason = response?.data?.triggerReason;

      if (opForm.clientId) {
        const refreshedClient = await getClient(opForm.clientId);
        const refreshedAccounts = Array.isArray(refreshedClient.data.accounts) ? refreshedClient.data.accounts : [];
        setClientAccounts(refreshedAccounts);
      }

      // Перезагружаем список операций — иначе только что созданная
      // (особенно Completed без фрод-чека) не появится в таблице.
      void loadOperations();

      setActiveOp(null);
      setSuccess(isPendingReview
        ? `${labels[type]} отправлена на проверку антифрода${reviewReason ? `. ${reviewReason}` : ''}`
        : `${labels[type]} успешно проведена!`);
      setOpForm((prev) => ({
        ...prev,
        amount: '',
        description: '',
        toAccountNumber: '',
        incomeKindCode: '',
        accountId: clientAccounts[0]?.id || prev.accountId || '',
        recipientClientId: '',
        recipientAccountId: '',
      }));

      window.setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || 'Произошла ошибка';
      setSuccess(`Ошибка: ${message}`);
      window.setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const bannerTone = success.startsWith('Ошибка:')
    ? 'danger'
    : success.includes('проверку антифрода')
      ? 'warning'
      : 'success';

  return (
    <Layout title="Операции">
      <div className="page__header">
        <div>
          <div className="page__title">Кассовые операции</div>
          <div className="page__subtitle">Внесение, выдача и переводы средств</div>
        </div>
      </div>

      {sessionError && (
        <div className="alert alert--danger u-mb-20">
          {sessionError}
        </div>
      )}

      {success && (
        <div className={`alert alert--${bannerTone} u-mb-20`}>
          {success}
        </div>
      )}

      {/* Кнопки операций */}
      <div className="ops-actions-grid">
        <button type="button" className="card card--hover action-tile" onClick={() => setActiveOp('deposit')}>
          <ArrowUpCircle size={36} color="var(--afina-text)" className="u-icon-hint" />
          <div className="action-tile__title">Внесение</div>
          <div className="action-tile__desc">Приём наличных на счёт клиента</div>
        </button>
        <button type="button" className="card card--hover action-tile" onClick={() => setActiveOp('withdraw')}>
          <ArrowDownCircle size={36} color="var(--afina-text)" className="u-icon-hint" />
          <div className="action-tile__title">Выдача</div>
          <div className="action-tile__desc">Выдача наличных со счёта клиента</div>
        </button>
        <button type="button" className="card card--hover action-tile" onClick={() => setActiveOp('transfer')}>
          <ArrowLeftRight size={36} color="var(--afina-text)" className="u-icon-hint" />
          <div className="action-tile__title">Перевод</div>
          <div className="action-tile__desc">Перевод между счетами клиентов</div>
        </button>
      </div>

      {/* Недавние операции */}
      <div className="section-title section-title--mb-14">
        Операции текущего сеанса
        {clientLoading && <span className="u-meta-note" style={{ marginLeft: 10 }}>Загрузка клиента...</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Время', 'Тип', 'Клиент', 'Счёт', 'Сумма', 'Статус'].map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {operationsLoading ? (
              <tr>
                <td colSpan={6} className="u-empty-cell">Загрузка операций...</td>
              </tr>
            ) : operationsError ? (
              <tr>
                <td colSpan={6} className="u-empty-cell u-text-danger">{operationsError}</td>
              </tr>
            ) : operations.length === 0 ? (
              <tr>
                <td colSpan={6} className="u-empty-cell">В текущем сеансе пока нет операций</td>
              </tr>
            ) : operations.map((operation) => {
              const typeMeta = OPERATION_TYPE_META[operation.type] || { label: operation.type || 'Операция', icon: ArrowLeftRight };
              const statusMeta = OPERATION_STATUS_META[operation.status] || { label: operation.status || '—', tone: 'gray' };
              const AccountIcon = typeMeta.icon;
              const accountNumber = operation.accountNumber || operation.fromAccountNumber || operation.toAccountNumber || '—';
              const amountClass = typeMeta.label === 'Внесение' ? 'u-text-700 u-text-success' : 'u-text-700 u-text-danger';

              return (
                <tr key={operation.transactionId || operation.id}>
                  <td>{formatOperationTime(operation.createdAt)}</td>
                  <td>
                    <span className={`badge badge--${statusMeta.tone} u-row u-row--6`}>
                      <AccountIcon size={12} />
                      {typeMeta.label}
                    </span>
                  </td>
                  <td className="u-text-bold">{operation.clientFullName || '—'}</td>
                  <td className="u-text-mono">{accountNumber}</td>
                  <td className={amountClass}>{formatOperationAmount(operation)}</td>
                  <td><span className={`badge badge--${statusMeta.tone}`}>{statusMeta.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="table-wrap__footer">
          Показано {operations.length} операций текущего сеанса
        </div>
      </div>

      {/* Модалка — Внесение */}
      {activeOp === 'deposit' && (
        <Modal
          title="Внесение средств"
          onClose={() => setActiveOp(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setActiveOp(null)}>Отмена</button>
              <button className="btn btn--primary" onClick={() => handleComplete('deposit')} disabled={!sessionId || submitting}>{submitting ? 'Обработка…' : 'Внести'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Клиент</label>
                <DropdownSelect
                  value={opForm.clientId}
                  options={activeClientOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, clientId: value, accountId: '' }))}
                  placeholder={activeClientOptions.length ? 'Выберите клиента' : 'Нет доступных клиентов'}
                  disabled={!activeClientOptions.length}
                  ariaLabel="Клиент"
                />
          </div>
          <div className="form-group">
            <label>Счёт зачисления</label>
                <DropdownSelect
                  value={opForm.accountId}
                  options={clientAccountOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, accountId: value }))}
                  placeholder={clientAccountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
                  disabled={!clientAccountOptions.length}
                  ariaLabel="Счёт зачисления"
                />
          </div>
          <div className="form-group">
            <label>Сумма</label>
            <input type="number" min="0" placeholder="0.00" value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Комментарий</label>
            <input placeholder="Основание операции" value={opForm.description} onChange={(e) => setOpForm({ ...opForm, description: e.target.value })} />
          </div>
        </Modal>
      )}

      {/* Модалка — Выдача */}
      {activeOp === 'withdraw' && (
        <Modal
          title="Выдача средств"
          onClose={() => setActiveOp(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setActiveOp(null)}>Отмена</button>
              <button className="btn btn--warning" onClick={() => handleComplete('withdraw')} disabled={!sessionId || submitting}>{submitting ? 'Обработка…' : 'Выдать'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Клиент</label>
                <DropdownSelect
                  value={opForm.clientId}
                  options={activeClientOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, clientId: value, accountId: '' }))}
                  placeholder={activeClientOptions.length ? 'Выберите клиента' : 'Нет доступных клиентов'}
                  disabled={!activeClientOptions.length}
                  ariaLabel="Клиент"
                />
          </div>
          <div className="form-group">
            <label>Счёт списания</label>
                <DropdownSelect
                  value={opForm.accountId}
                  options={clientAccountOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, accountId: value }))}
                  placeholder={clientAccountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
                  disabled={!clientAccountOptions.length}
                  ariaLabel="Счёт списания"
                />
          </div>
          <div className="form-group">
            <label>Сумма</label>
            <input type="number" min="0" placeholder="0.00" value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Комментарий</label>
            <input placeholder="Основание операции" value={opForm.description} onChange={(e) => setOpForm({ ...opForm, description: e.target.value })} />
          </div>
        </Modal>
      )}

      {/* Модалка — Перевод */}
      {activeOp === 'transfer' && (
        <Modal
          title="Перевод между счетами"
          onClose={() => setActiveOp(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setActiveOp(null)}>Отмена</button>
              <button className="btn btn--primary" onClick={() => handleComplete('transfer')} disabled={!sessionId || submitting}>{submitting ? 'Обработка…' : 'Перевести'}</button>
            </>
          }
        >
          <div className="form-group">
            <label>Клиент</label>
                <DropdownSelect
                  value={opForm.clientId}
                  options={transferClientOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, clientId: value, accountId: '' }))}
                  placeholder={transferClientOptions.length ? 'Выберите клиента' : 'Нет доступных клиентов'}
                  disabled={!transferClientOptions.length}
                  ariaLabel="Клиент"
                />
          </div>
          <div className="form-group">
            <label>Счёт отправителя</label>
                <DropdownSelect
                  value={opForm.accountId}
                  options={clientAccountOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, accountId: value }))}
                  placeholder={clientAccountOptions.length ? 'Выберите счёт' : 'Нет доступных счетов'}
                  disabled={!clientAccountOptions.length}
                  ariaLabel="Счёт списания"
                />
          </div>
          <div className="form-group">
            <label>Получатель</label>
                <DropdownSelect
                  value={opForm.recipientClientId}
                  options={recipientClientOptions}
                  onChange={(value) => setOpForm((previous) => ({ ...previous, recipientClientId: value, recipientAccountId: '', toAccountNumber: '' }))}
                  placeholder={recipientClientOptions.length ? 'Выберите клиента-получателя' : 'Нет доступных клиентов'}
                  disabled={!recipientClientOptions.length}
                  ariaLabel="Клиент-получатель"
                />
            {recipientLoading && <div className="form-group__hint">Загрузка счетов получателя...</div>}
          </div>
          <div className="form-group">
            <label>Счёт получателя</label>
                <DropdownSelect
                  value={opForm.recipientAccountId}
                  options={recipientAccountOptions}
                  onChange={(value) => {
                    const nextAccount = recipientAccounts.find((account) => account.id === value);
                    setOpForm((previous) => ({
                      ...previous,
                      recipientAccountId: value,
                      toAccountNumber: nextAccount?.accountNumber || '',
                    }));
                  }}
                  placeholder={recipientAccountOptions.length ? 'Выберите счёт' : 'Сначала выберите получателя'}
                  disabled={!recipientAccountOptions.length}
                  ariaLabel="Счёт получателя"
                />
            {opForm.toAccountNumber && (
              <div className="form-group__hint">Номер для перевода: {opForm.toAccountNumber}</div>
            )}
          </div>
          <div className="form-group">
            <label>Сумма</label>
            <input type="number" min="0" placeholder="0.00" value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Назначение</label>
            <input placeholder="Назначение перевода" value={opForm.description} onChange={(e) => setOpForm({ ...opForm, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Код вида дохода (КВД), необязательно</label>
            <DropdownSelect
              value={opForm.incomeKindCode}
              options={[{ value: '', label: '— не указывать —' }, ...INCOME_KIND_OPTIONS]}
              onChange={(value) => setOpForm((previous) => ({ ...previous, incomeKindCode: value }))}
              placeholder="Для зарплатных и аналогичных выплат"
              ariaLabel="Код вида дохода"
            />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
