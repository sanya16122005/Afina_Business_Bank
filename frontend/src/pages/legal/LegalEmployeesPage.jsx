import { useEffect, useState, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import { getLegalEmployees, addLegalEmployee, removeLegalEmployee } from '../../api/legalEntity';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';

export default function LegalEmployeesPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [adding, setAdding] = useState(false);
  const [removeId, setRemoveId] = useState(null);
  const profileWarnShown = useRef(false);

  const load = () => {
    getLegalEmployees()
      .then((r) => {
        const list = r?.data?.data;
        setRows(Array.isArray(list) ? list : []);
        if (!profileWarnShown.current && r?.data?.meta?.profileMissing && r?.data?.meta?.detail) {
          profileWarnShown.current = true;
          toast.warning(r.data.meta.detail);
        }
      })
      .catch(() => toast.danger('Не удалось загрузить сотрудников'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) {
      toast.warning('Введите email сотрудника');
      return;
    }
    setAdding(true);
    try {
      await addLegalEmployee({ employeeEmail: em, position: position.trim() || null });
      toast.success('Сотрудник добавлен');
      setEmail('');
      setPosition('');
      load();
    } catch (err) {
      toast.danger(err?.response?.data?.detail || 'Не удалось добавить');
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeId) return;
    try {
      await removeLegalEmployee(removeId);
      toast.success('Сотрудник снят с учёта');
      setRemoveId(null);
      load();
    } catch (err) {
      toast.danger(err?.response?.data?.detail || 'Ошибка');
    }
  };

  return (
    <Layout title="Сотрудники">
      <div className="page__header">
        <div>
          <div className="page__title">Назначенные сотрудники</div>
          <div className="page__subtitle">
            Укажите email пользователя банка с ролью «клиент» (физлицо). Выплаты возможны только на счета этих лиц.
          </div>
        </div>
      </div>

      <div className="card card--accent" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <UserPlus size={18} /> Добавить сотрудника
        </div>
        <form onSubmit={handleAdd} className="auth-page__row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div className="form-group" style={{ flex: '1 1 220px', marginBottom: 0 }}>
            <label>Email сотрудника</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="worker@mail.ru" />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Должность (необязательно)</label>
            <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Бухгалтер" />
          </div>
          <Button type="submit" disabled={adding}>{adding ? '…' : 'Добавить'}</Button>
        </form>
      </div>

      <div className="card">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Users size={18} /> Список
        </div>
        {loading ? (
          <p>Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted">Пока нет сотрудников. Добавьте по email после того, как они зарегистрируются как клиенты.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Счёт для выплат</th>
                  <th>Должность</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.fullName}</td>
                    <td>{r.email}</td>
                    <td>{r.defaultAccountNumber || '—'}</td>
                    <td>{r.position || '—'}</td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRemoveId(r.id)} title="Снять с учёта">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(removeId)}
        title="Снять сотрудника?"
        message="Организация не сможет переводить на его счёт, пока не добавите снова."
        confirmLabel="Снять"
        danger
        onCancel={() => setRemoveId(null)}
        onConfirm={confirmRemove}
      />
    </Layout>
  );
}
