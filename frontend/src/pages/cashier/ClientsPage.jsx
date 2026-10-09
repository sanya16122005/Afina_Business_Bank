import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { getClients, createClient } from '../../api/cashier';
import { getResponseList } from '../../api/response';
import { Search, Plus, Users, UserRound, Building2, TriangleAlert } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import DropdownSelect from '../../components/ui/DropdownSelect';
import { formatPhoneInput, normalizePhoneForApi } from '../../utils/phone';
import { OWNERSHIP_FORM_OPTIONS } from '../../constants/ownership';

const CLIENT_TYPE_OPTIONS = [
  { value: 'Individual', label: 'Физическое лицо' },
  { value: 'Legal', label: 'Юридическое лицо' },
];

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ clientType: 'Individual', firstName: '', lastName: '', companyName: '', ownershipForm: 'ООО', phoneNumber: '', email: '' });
  const [createError, setCreateError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getClients().then(getResponseList)
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) => {
    const matchSearch = (c.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.phoneNumber || '').includes(search) ||
                        (c.email || '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || c.clientType === typeFilter;
    return matchSearch && matchType;
  });

  const reloadClients = () => getClients().then(getResponseList)
    .then((d) => setClients(Array.isArray(d) ? d : []))
    .catch(() => {});

  const handleCreate = async () => {
    if (submitting) return;
    setCreateError('');
    const phoneNumber = normalizePhoneForApi(newForm.phoneNumber);
    const data = newForm.clientType === 'Individual'
      ? { clientType: 'Individual', firstName: newForm.firstName.trim(), lastName: newForm.lastName.trim(), phoneNumber, email: newForm.email }
      : { clientType: 'Legal', companyName: newForm.companyName.trim(), ownershipForm: newForm.ownershipForm, phoneNumber, email: newForm.email };
    setSubmitting(true);
    try {
      const r = await createClient(data);
      await reloadClients();
      setShowNew(false);
      setNewForm({ clientType: 'Individual', firstName: '', lastName: '', companyName: '', ownershipForm: 'ООО', phoneNumber: '', email: '' });
      setCreatedCredentials(
        r.data?.loginCreated && r.data?.temporaryPassword
          ? { email: r.data.loginEmail, password: r.data.temporaryPassword }
          : null,
      );
    } catch (e) {
      const msg = e?.response?.data?.errors?.email?.[0]
        || e?.response?.data?.errors?.phoneNumber?.[0]
        || e?.response?.data?.detail
        || e?.response?.data?.message
        || 'Не удалось зарегистрировать клиента';
      setCreateError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Layout title="Клиенты"><div className="card u-loading-card">Загрузка...</div></Layout>;

  return (
    <Layout title="Клиенты">
      <div className="page__header">
        <div>
          <div className="page__title">Клиенты</div>
          <div className="page__subtitle">Управление клиентской базой</div>
        </div>
        <button className="btn btn--primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> Новый клиент
        </button>
      </div>

      {createdCredentials && (
        <div className="alert alert--success u-mb-20" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <strong>Клиент зарегистрирован. Передайте данные для входа:</strong>
          <span>Логин (email): <b>{createdCredentials.email}</b></span>
          <span>Временный пароль: <b className="u-text-mono">{createdCredentials.password}</b></span>
          <span className="u-text-muted" style={{ fontSize: 13 }}>
            Пароль показывается один раз — скопируйте его сейчас. Клиент сможет сменить пароль после входа.
          </span>
          <button className="btn btn--ghost btn--sm u-mt-8" onClick={() => setCreatedCredentials(null)}>
            Понятно, скрыть
          </button>
        </div>
      )}

      {/* Статистика */}
      <div className="stats-grid stats-grid--4">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего клиентов</div>
            <div className="stat-card__value">{clients.length}</div>
          </div>
          <div className="stat-card__icon"><Users size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Физические лица</div>
            <div className="stat-card__value">{clients.filter(c => c.clientType === 'Individual').length}</div>
          </div>
          <div className="stat-card__icon"><UserRound size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Юридические лица</div>
            <div className="stat-card__value">{clients.filter(c => c.clientType === 'Legal').length}</div>
          </div>
          <div className="stat-card__icon"><Building2 size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Должники</div>
            <div className="stat-card__value stat-card__value--danger">{clients.filter(c => c.isDebtor).length}</div>
          </div>
          <div className="stat-card__icon"><TriangleAlert size={20} /></div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="filter-bar">
        <div className="filter-bar__search">
          <Search size={15} className="filter-bar__search-icon" />
          <input
            placeholder="Поиск по имени, телефону, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {[
          { key: 'all', label: 'Все' },
          { key: 'Individual', label: 'Физ. лица' },
          { key: 'Legal', label: 'Юр. лица' },
        ].map((f) => (
          <button key={f.key} className={`btn ${typeFilter === f.key ? 'btn--primary' : 'btn--ghost'} btn--sm`} onClick={() => setTypeFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Таблица */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Клиент', 'Тип', 'Телефон', 'Email', 'Статус', 'Должник', 'Действия'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="u-text-bold">
                  <div className="u-row">
                    <div className="table-avatar">
                      {c.fullName.charAt(0)}
                    </div>
                    {c.fullName}
                  </div>
                </td>
                <td>{c.clientType === 'Individual' ? 'Физ. лицо' : 'Юр. лицо'}</td>
                <td>{c.phoneNumber}</td>
                <td className="u-text-muted">{c.email}</td>
                <td>
                  <span className={`badge badge--${c.status === 'Active' ? 'success' : 'danger'}`}>
                    {c.status === 'Active' ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td>
                  {c.isDebtor
                    ? <span className="badge badge--danger">Должник</span>
                    : <span className="badge badge--gray">Нет</span>}
                </td>
                <td>
                  <button className="btn btn--primary btn--sm" onClick={() => navigate(`/cashier/clients/${c.id}`)}>
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="u-empty-cell">Клиенты не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Модалка нового клиента */}
      {showNew && (
        <Modal title="Регистрация клиента" onClose={() => { setShowNew(false); setCreateError(''); }}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => { setShowNew(false); setCreateError(''); }} disabled={submitting}>Отмена</button>
              <button className="btn btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? 'Сохранение…' : 'Зарегистрировать'}</button>
            </>
          }
        >
          {createError && <div className="alert alert--danger u-mb-16">{createError}</div>}
          <div className="form-group">
            <label>Тип клиента</label>
            <DropdownSelect
              value={newForm.clientType}
              options={CLIENT_TYPE_OPTIONS}
              onChange={(value) => setNewForm((previous) => ({ ...previous, clientType: value }))}
              placeholder="Выберите тип клиента"
              ariaLabel="Тип клиента"
            />
          </div>
          {newForm.clientType === 'Individual' ? (
            <>
              <div className="form-group">
                <label>Имя</label>
                <input placeholder="Иван" value={newForm.firstName} onChange={(e) => setNewForm({ ...newForm, firstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Фамилия</label>
                <input placeholder="Иванов" value={newForm.lastName} onChange={(e) => setNewForm({ ...newForm, lastName: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Форма собственности</label>
                <DropdownSelect
                  value={newForm.ownershipForm}
                  options={OWNERSHIP_FORM_OPTIONS}
                  onChange={(value) => setNewForm((previous) => ({ ...previous, ownershipForm: value }))}
                  placeholder="Выберите форму"
                  ariaLabel="Форма собственности"
                />
              </div>
              <div className="form-group">
                <label>Название (без формы)</label>
                <input placeholder="Ромашка" value={newForm.companyName} onChange={(e) => setNewForm({ ...newForm, companyName: e.target.value })} />
              </div>
            </>
          )}
          <div className="form-group">
            <label>Телефон</label>
            <input type="tel" inputMode="tel" maxLength={18} placeholder="+7 (900) 123-45-67" value={newForm.phoneNumber} onChange={(e) => setNewForm({ ...newForm, phoneNumber: formatPhoneInput(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="email@example.com" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
