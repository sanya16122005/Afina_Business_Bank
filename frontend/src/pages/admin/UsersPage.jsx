import { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { getUsers, changeUserStatus, updateUser } from '../../api/admin';
import { getResponseData, getResponseList } from '../../api/response';
import { formatDate, formatDateTime } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import { Search, Shield, ShieldOff, Users, UserRound, Building2, Ban } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import DropdownSelect from '../../components/ui/DropdownSelect';

const ROLE_LABELS = { Customer: 'Клиент', Cashier: 'Кассир', Admin: 'Администратор', LegalEntity: 'Юрлицо / ИП' };
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = [
  { value: 'Active', label: 'Активен' },
  { value: 'Blocked', label: 'Заблокирован' },
];

function buildEditForm(user) {
  return {
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phoneNumber: user.phoneNumber || '',
    dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
    role: user.role || 'Customer',
    status: user.status || 'Active',
  };
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(null); // { user, action }
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    getUsers().then(getResponseList)
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const matchSearch = (u.fullName || `${u.firstName || ''} ${u.lastName || ''}`).toLowerCase().includes(search.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const askToggleBlock = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const action = user.status === 'Active' ? 'Block' : 'Unblock';
    setConfirmBlock({ user, action });
  };

  const performToggleBlock = async () => {
    if (!confirmBlock) return;
    const { user, action } = confirmBlock;
    setConfirmBusy(true);
    try {
      await changeUserStatus(user.id, { action });
      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, status: u.status === 'Active' ? 'Blocked' : 'Active' } : u
      ));
      toast.success(action === 'Block' ? `Пользователь ${user.fullName} заблокирован` : `Пользователь ${user.fullName} разблокирован`);
      setConfirmBlock(null);
    } catch (error) {
      const message = error?.response?.data?.detail || 'Не удалось изменить статус';
      toast.danger(message);
    } finally {
      setConfirmBusy(false);
    }
  };

  const openEditor = (user) => {
    setSelectedUser(null);
    setEditError('');
    setEditingUser(user);
    setEditForm(buildEditForm(user));
  };

  const updateFormValue = (field) => (event) => {
    const { type, checked, value } = event.target;
    setEditForm((previous) => ({
      ...previous,
      [field]: type === 'checkbox' ? checked : value,
    }));
  };

  const updateSelectValue = (field) => (value) => {
    setEditForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveUser = async () => {
    if (!editingUser || !editForm) return;

    setEditSaving(true);
    setEditError('');

    try {
      const payload = {
        email: editForm.email.trim(),
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phoneNumber: editForm.phoneNumber.trim(),
        dateOfBirth: editForm.dateOfBirth || null,
        role: editForm.role,
        isActive: editForm.status === 'Active',
      };

      const updated = await updateUser(editingUser.id, payload).then(getResponseData);

      setUsers((previous) => previous.map((user) => (
        user.id === editingUser.id
          ? {
              ...user,
              ...updated,
              status: updated.status || (updated.isActive ? 'Active' : 'Blocked'),
              fullName: updated.fullName || `${updated.firstName || ''} ${updated.lastName || ''}`.trim(),
            }
          : user
      )));

      setEditingUser(null);
      setEditForm(null);
      toast.success('Пользователь сохранён');
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || 'Не удалось сохранить пользователя';
      const validation = error?.response?.data?.errors;
      setEditError(Array.isArray(validation?.email) ? validation.email[0] : message);
      toast.danger(message);
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <Layout title="Пользователи"><div className="card u-loading-card">Загрузка...</div></Layout>;

  return (
    <Layout title="Пользователи">
      <div className="page__header">
        <div>
          <div className="page__title">Пользователи</div>
          <div className="page__subtitle">Управление пользователями системы</div>
        </div>
      </div>

      {/* Статистика */}
      <div className="stats-grid stats-grid--4">
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Всего пользователей</div>
            <div className="stat-card__value">{users.length}</div>
          </div>
          <div className="stat-card__icon"><Users size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Клиенты</div>
            <div className="stat-card__value">{users.filter(u => u.role === 'Customer').length}</div>
          </div>
          <div className="stat-card__icon"><UserRound size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Сотрудники</div>
            <div className="stat-card__value">{users.filter(u => u.role !== 'Customer').length}</div>
          </div>
          <div className="stat-card__icon"><Building2 size={20} /></div>
        </div>
        <div className="stat-card card">
          <div className="stat-card__body">
            <div className="stat-card__label">Заблокированные</div>
            <div className="stat-card__value stat-card__value--danger">{users.filter(u => u.status === 'Blocked').length}</div>
          </div>
          <div className="stat-card__icon"><Ban size={20} /></div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="filter-bar u-mb-16">
        <div className="filter-bar__search">
          <Search size={15} className="filter-bar__search-icon" />
          <input
            placeholder="Поиск по имени или email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {[
          { key: 'all', label: 'Все' },
          { key: 'Customer', label: 'Клиенты' },
          { key: 'Cashier', label: 'Кассиры' },
          { key: 'Admin', label: 'Админы' },
        ].map(f => (
          <button key={f.key} className={`btn ${roleFilter === f.key ? 'btn--primary' : 'btn--ghost'} btn--sm`} onClick={() => setRoleFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Таблица */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Пользователь', 'Email', 'Роль', 'Телефон', 'Статус', 'Действия'].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const fullName = u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
              const avatar = u.avatar || fullName?.charAt(0) || '?';
              return (
              <tr key={u.id}>
                <td>
                  <div className="u-row">
                    <div className="table-avatar table-avatar--lg">
                      {avatar}
                    </div>
                    <span className="u-text-bold">{fullName}</span>
                  </div>
                </td>
                <td className="u-text-muted">{u.email}</td>
                <td><span className={`badge badge--${u.role === 'Admin' ? 'primary' : u.role === 'Cashier' ? 'primary' : 'gray'}`}>{ROLE_LABELS[u.role]}</span></td>
                <td>{u.phoneNumber}</td>
                <td>
                  <span className={`badge badge--${u.status === 'Active' ? 'success' : 'danger'}`}>
                    {u.status === 'Active' ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td>
                  <div className="u-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => setSelectedUser(u)}>Детали</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => openEditor(u)}>Редакт.</button>
                    <button
                      className={`btn btn--sm ${u.status === 'Active' ? 'btn--danger' : 'btn--success'}`}
                      onClick={() => askToggleBlock(u.id)}
                    >
                      {u.status === 'Active' ? <><ShieldOff size={13} /> Блок</> : <><Shield size={13} /> Разблок</>}
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="u-empty-cell">Пользователи не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Модалка деталей */}
      {selectedUser && (
        <Modal title="Информация о пользователе" onClose={() => setSelectedUser(null)}
          footer={
            <div className="u-actions u-actions--8">
              <button className="btn btn--ghost" onClick={() => setSelectedUser(null)}>Закрыть</button>
              <button className="btn btn--primary" onClick={() => openEditor(selectedUser)}>Редактировать</button>
            </div>
          }
        >
          <div className="profile-card profile-card--bare">
            <div className="profile-card__header">
              <div className="profile-card__avatar">{selectedUser.avatar || (selectedUser.fullName || selectedUser.firstName || '?').charAt(0)}</div>
              <div>
                <div className="profile-card__name">{selectedUser.fullName || `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`}</div>
                <div className="profile-card__meta">{selectedUser.email}</div>
              </div>
            </div>
            {[
              ['Роль', ROLE_LABELS[selectedUser.role]],
              ['Телефон', selectedUser.phoneNumber],
              ['Статус', selectedUser.status === 'Active' ? 'Активен' : 'Заблокирован'],
              ['Дата рождения', formatDate(selectedUser.dateOfBirth)],
              ['Последний вход', formatDateTime(selectedUser.lastLoginAt)],
              ['ID', selectedUser.id],
            ].map(([k, v]) => (
              <div key={k} className="profile-card__row">
                <span className="profile-card__key">{k}</span>
                <span className="profile-card__val">{v}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Модалка редактирования */}
      {editingUser && editForm && (
        <Modal
          title="Редактирование пользователя"
          onClose={() => {
            setEditingUser(null);
            setEditForm(null);
            setEditError('');
          }}
          footer={
            <div className="u-actions u-actions--8">
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setEditingUser(null);
                  setEditForm(null);
                  setEditError('');
                }}
              >
                Отмена
              </button>
              <button className="btn btn--primary" onClick={handleSaveUser} disabled={editSaving}>
                {editSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          }
        >
          {editError && <div className="alert alert--danger">{editError}</div>}

          <div className="form-group">
            <label>Имя</label>
            <input value={editForm.firstName} onChange={updateFormValue('firstName')} />
          </div>
          <div className="form-group">
            <label>Фамилия</label>
            <input value={editForm.lastName} onChange={updateFormValue('lastName')} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={editForm.email} onChange={updateFormValue('email')} />
          </div>
          <div className="form-group">
            <label>Телефон</label>
            <input value={editForm.phoneNumber} onChange={updateFormValue('phoneNumber')} />
          </div>
          <div className="form-group">
            <label>Дата рождения</label>
            <input type="date" value={editForm.dateOfBirth} onChange={updateFormValue('dateOfBirth')} />
          </div>
          <div className="form-group">
            <label>Роль</label>
            <DropdownSelect
              value={editForm.role}
              options={ROLE_OPTIONS}
              onChange={updateSelectValue('role')}
              placeholder="Выберите роль"
              ariaLabel="Роль пользователя"
            />
          </div>
          <div className="form-group">
            <label>Статус</label>
            <DropdownSelect
              value={editForm.status}
              options={STATUS_OPTIONS}
              onChange={updateSelectValue('status')}
              placeholder="Выберите статус"
              ariaLabel="Статус пользователя"
            />
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={!!confirmBlock}
        title={confirmBlock?.action === 'Block' ? 'Заблокировать пользователя?' : 'Разблокировать пользователя?'}
        message={confirmBlock?.action === 'Block'
          ? `Пользователь ${confirmBlock?.user?.fullName} больше не сможет войти в систему.`
          : `Доступ пользователя ${confirmBlock?.user?.fullName} будет восстановлен.`}
        confirmLabel={confirmBlock?.action === 'Block' ? 'Заблокировать' : 'Разблокировать'}
        tone={confirmBlock?.action === 'Block' ? 'danger' : 'primary'}
        busy={confirmBusy}
        onConfirm={performToggleBlock}
        onCancel={() => !confirmBusy && setConfirmBlock(null)}
      />
    </Layout>
  );
}
