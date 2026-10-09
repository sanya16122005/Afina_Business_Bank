import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { getClients } from '../../api/cashier';
import { useAuth } from '../../context/AuthContext';
import { useCashierSession } from '../../hooks/useCashierSession';
import { getCashierSessionSummary } from '../../utils/cashierSession';
import { getResponseList } from '../../api/response';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Spinner from '../../components/ui/Spinner';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Search } from 'lucide-react';


export default function CashierDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const {
    session,
    loading: sessionLoading,
    error: sessionError,
    endSession,
  } = useCashierSession();
  const [searchClient, setSearchClient] = useState('');
  const debouncedSearchClient = useDebouncedValue(searchClient, 200);
  const [clients, setClients] = useState([]);
  const [endingSession, setEndingSession] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);




  useEffect(() => {
    let cancelled = false;
    getClients().then(getResponseList)
      .then((data) => {
        if (!cancelled) setClients(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) toast.danger('Не удалось загрузить список клиентов');
      });
    return () => { cancelled = true; };
  }, [toast]);

  const summary = getCashierSessionSummary(session);
  const balance = summary.totalSystemBalance || { RUB: 0, USD: 0, EUR: 0 };
  const totalDeposits = summary.totalDepositsCurrentSession ?? 0;
  const totalWithdrawals = summary.totalWithdrawalsCurrentSession ?? 0;
  const txCount = summary.txCount ?? 0;
  const sessionActive = session?.status === 'Active';
  const sessionDotInactive = !sessionLoading && !sessionActive;
  const sessionStatusTone = sessionLoading && !session ? 'gray' : sessionActive ? 'success' : 'danger';
  const sessionStatusLabel = sessionLoading && !session ? 'Проверка...' : sessionActive ? 'Активен' : 'Неактивен';
  const filtered = useMemo(
    () => clients.filter((client) =>
      (client.fullName || '').toLowerCase().includes(debouncedSearchClient.toLowerCase()),
    ),
    [clients, debouncedSearchClient],
  );

  useEffect(() => {
    if (sessionError) toast.danger(sessionError);
  }, [sessionError, toast]);

  const performEndSession = async () => {
    setEndingSession(true);

    const result = await endSession();
    if (result.ok) {
      toast.success('Кассовый сеанс завершён');
      setConfirmEnd(false);
    } else {
      toast.danger(result.error || 'Не удалось завершить сеанс');
    }
    setEndingSession(false);
  };

  return (
    <Layout title="Панель кассира">
      {/* Статус сеанса */}
      <div className="session-bar">
        <div className="session-bar__info">
          <div className={`session-bar__dot${sessionDotInactive ? ' session-bar__dot--inactive' : ''}`} />
          <div>
            <div className="session-bar__label">Кассовый сеанс</div>
            <div className="session-bar__value connection-status">
              {sessionLoading && !session ? 'Открываем сеанс...' : (session?.cashierFullName || user?.fullName || 'Кассир')}
              <span className={`badge badge--${sessionStatusTone}`}>
                {sessionStatusLabel}
              </span>
            </div>
            <div className="session-bar__label">
              {session?.startedAt ? `С начала смены: ${new Date(session.startedAt).toLocaleString('ru-RU')}` : 'Сеанс не найден'}
            </div>
          </div>
        </div>
        <div className="session-bar__stats">
          <div className="session-bar__stat">
            <div className="session-bar__label">Поступления</div>
            <div className="session-bar__value session-bar__value--success">
              +{Number(totalDeposits).toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div className="session-bar__stat">
            <div className="session-bar__label">Выдача</div>
            <div className="session-bar__value session-bar__value--danger">
              −{Number(totalWithdrawals).toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div className="session-bar__stat">
            <div className="session-bar__label">Операции</div>
            <div className="session-bar__value">{txCount}</div>
          </div>
        </div>
        <button
          className="session-bar__end-btn"
          onClick={() => setConfirmEnd(true)}
          disabled={endingSession || !session}
        >
          {endingSession && <Spinner />}
          {endingSession ? 'Завершение...' : 'Завершить сеанс'}
        </button>
      </div>


      {/* Общий баланс системы */}
      <div className="stats-grid">
        {Object.entries(balance).map(([currency, amount]) => (
          <div key={currency} className="stat-card card">
            <div className="stat-card__body">
              <div className="stat-card__label">Баланс системы ({currency})</div>
              <div className="stat-card__value">{Number(amount || 0).toLocaleString('ru-RU')}</div>
            </div>
            <div className="stat-card__icon">🏦</div>
          </div>
        ))}
      </div>

      {/* Поиск клиента */}
      <div className="section-title">Поиск клиента</div>
      <div className="filter-bar filter-bar--flat u-mb-16">
        <div className="filter-bar__search">
          <Search size={15} className="filter-bar__search-icon" />
          <input
            placeholder="Поиск по имени клиента..."
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Клиент', 'Тип', 'Телефон', 'Статус', 'Должник', 'Действия'].map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id}>
                <td className="u-text-500">{client.fullName}</td>
                <td>{client.clientType === 'Individual' ? 'Физ. лицо' : 'Юр. лицо'}</td>
                <td>{client.phoneNumber}</td>
                <td>
                  <span className={`badge badge--${client.status === 'Active' ? 'success' : 'danger'}`}>{client.status === 'Active' ? 'Активен' : 'Заблокирован'}</span>
                </td>
                <td>
                  {client.isDebtor ? <span className="badge badge--danger">Должник</span> : <span className="badge badge--gray">Нет</span>}
                </td>
                <td>
                  <button className="btn btn--primary btn--sm" onClick={() => navigate(`/cashier/clients/${client.id}`)}>
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirmEnd}
        title="Завершить кассовый сеанс?"
        message="После завершения сеанса до открытия нового кассир не сможет выполнять операции."
        confirmLabel="Завершить сеанс"
        cancelLabel="Отмена"
        tone="danger"
        busy={endingSession}
        onConfirm={performEndSession}
        onCancel={() => !endingSession && setConfirmEnd(false)}
      />
    </Layout>
  );
}
