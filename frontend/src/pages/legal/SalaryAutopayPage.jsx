import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import DropdownSelect from '../../components/ui/DropdownSelect';
import {
  getLegalEmployees,
  getSalaryAutopayRules,
  createSalaryAutopayRule,
  updateSalaryAutopayRule,
  deleteSalaryAutopayRule,
} from '../../api/legalEntity';
import { getAccounts } from '../../api/accounts';
import { getResponseList } from '../../api/response';
import { useToast } from '../../context/ToastContext';
import { INCOME_KIND_OPTIONS } from '../../constants/incomeKinds';
import { CalendarClock, Plus, Trash2, Power } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';

const CADENCE_OPTIONS = [
  { value: 'Monthly', label: 'Ежемесячно (число месяца, Москва)' },
  { value: 'Weekly', label: 'Еженедельно (день недели, Москва)' },
  { value: 'BiWeekly', label: 'Раз в две недели (день недели, Москва)' },
];

const DOW_OPTIONS = [
  { value: '0', label: 'Воскресенье' },
  { value: '1', label: 'Понедельник' },
  { value: '2', label: 'Вторник' },
  { value: '3', label: 'Среда' },
  { value: '4', label: 'Четверг' },
  { value: '5', label: 'Пятница' },
  { value: '6', label: 'Суббота' },
];

function fmtMsk(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

export default function SalaryAutopayPage() {
  const toast = useToast();
  const [rules, setRules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeId, setRemoveId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employerEmployeeId: '',
    fromAccountId: '',
    amount: '',
    currency: 'RUB',
    incomeKindCode: '2000',
    cadence: 'Monthly',
    dayOfMonth: '25',
    dayOfWeek: '1',
    hourMsk: '9',
    minuteMsk: '0',
    paymentDescription: '',
  });

  const incomeOptions = useMemo(
    () => INCOME_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const employeeOptions = useMemo(() => {
    const opts = employees.map((e) => ({
      value: e.id,
      label: `${e.fullName || e.email} (${e.defaultAccountNumber || 'нет счёта'})`,
    }));
    return [{ value: '', label: '— выберите сотрудника —' }, ...opts];
  }, [employees]);

  const accountOptions = useMemo(() => {
    const opts = accounts
      .filter((a) => a.status === 'Active')
      .map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.balance?.toLocaleString?.('ru-RU') ?? a.balance} ${a.currency}`,
      }));
    return [{ value: '', label: '— счёт списания —' }, ...opts];
  }, [accounts]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [empRes, accRes, rulesRes] = await Promise.all([
        getLegalEmployees(),
        getAccounts(),
        getSalaryAutopayRules(),
      ]);
      const empList = empRes?.data?.data;
      setEmployees(Array.isArray(empList) ? empList : []);
      setAccounts(getResponseList(accRes));
      const rlist = rulesRes?.data?.data;
      setRules(Array.isArray(rlist) ? rlist : []);
    } catch {
      toast.danger('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /** Минуты от полуночи по Москве (как на бэкенде в runTimeMinutesUtc). */
  const runMinutesMoscow = () => {
    const h = Math.min(23, Math.max(0, parseInt(form.hourMsk, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(form.minuteMsk, 10) || 0));
    return h * 60 + m;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.employerEmployeeId || !form.fromAccountId) {
      toast.warning('Выберите сотрудника и счёт списания');
      return;
    }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      toast.warning('Укажите сумму');
      return;
    }
    const cadence = form.cadence;
    let dayOfMonth = null;
    let dayOfWeek = null;
    if (cadence === 'Monthly') {
      const dom = parseInt(form.dayOfMonth, 10);
      if (dom < 1 || dom > 28) {
        toast.warning('День месяца: от 1 до 28');
        return;
      }
      dayOfMonth = dom;
    } else {
      dayOfWeek = parseInt(form.dayOfWeek, 10);
      if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        toast.warning('Выберите день недели');
        return;
      }
    }

    setSaving(true);
    try {
      await createSalaryAutopayRule({
        employerEmployeeId: form.employerEmployeeId,
        fromAccountId: form.fromAccountId,
        amount: amt,
        currency: form.currency || 'RUB',
        incomeKindCode: form.incomeKindCode,
        cadence,
        dayOfMonth,
        dayOfWeek,
        runTimeMinutesUtc: runMinutesMoscow(),
        paymentDescription: form.paymentDescription.trim() || null,
      });
      toast.success('Автоплатёж создан');
      setForm((p) => ({ ...p, amount: '', paymentDescription: '' }));
      loadAll();
    } catch (err) {
      toast.danger(err?.response?.data?.detail || 'Не удалось создать');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule) => {
    try {
      await updateSalaryAutopayRule(rule.id, { isEnabled: !rule.isEnabled });
      toast.success(rule.isEnabled ? 'Отключено' : 'Включено');
      loadAll();
    } catch (err) {
      toast.danger(err?.response?.data?.detail || 'Ошибка');
    }
  };

  const confirmDelete = async () => {
    if (!removeId) return;
    try {
      await deleteSalaryAutopayRule(removeId);
      toast.success('Удалено');
      setRemoveId(null);
      loadAll();
    } catch (err) {
      toast.danger(err?.response?.data?.detail || 'Ошибка');
    }
  };

  if (loading) {
    return (
      <Layout title="Автоплатежи">
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Автоплатежи зарплаты">
      <div className="page__header">
        <div>
          <div className="page__title">Автоплатежи зарплаты</div>
          <div className="page__subtitle">
            Даты и время задаются по московскому времени (как в календаре и на часах в Москве). Раз в минуту сервер
            проверяет срок: при наступлении момента средства переводятся на основной счёт сотрудника с указанным КВД.
          </div>
        </div>
      </div>

      <div className="transfer-grid">
        <div className="card card--accent">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <CalendarClock size={18} /> Новый автоплатёж
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Сотрудник</label>
              <DropdownSelect
                value={form.employerEmployeeId}
                options={employeeOptions}
                onChange={(v) => setForm((p) => ({ ...p, employerEmployeeId: v }))}
                placeholder="Сначала добавьте сотрудников"
                disabled={employeeOptions.length <= 1}
                ariaLabel="Сотрудник"
              />
            </div>
            <div className="form-group">
              <label>Счёт списания (организация)</label>
              <DropdownSelect
                value={form.fromAccountId}
                options={accountOptions}
                onChange={(v) => setForm((p) => ({ ...p, fromAccountId: v }))}
                placeholder="Нет счетов"
                disabled={accountOptions.length <= 1}
                ariaLabel="Счёт списания"
              />
            </div>
            <div className="form-group">
              <label>Сумма</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>КВД</label>
              <DropdownSelect
                value={form.incomeKindCode}
                options={incomeOptions}
                onChange={(v) => setForm((p) => ({ ...p, incomeKindCode: v }))}
                ariaLabel="КВД"
              />
            </div>
            <div className="form-group">
              <label>Периодичность</label>
              <DropdownSelect
                value={form.cadence}
                options={CADENCE_OPTIONS}
                onChange={(v) => setForm((p) => ({ ...p, cadence: v }))}
                ariaLabel="Периодичность"
              />
            </div>
            {form.cadence === 'Monthly' ? (
              <div className="form-group">
                <label>Число месяца в Москве (1–28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={form.dayOfMonth}
                  onChange={(e) => setForm((p) => ({ ...p, dayOfMonth: e.target.value }))}
                />
              </div>
            ) : (
              <div className="form-group">
                <label>День недели (по календарю Москвы)</label>
                <DropdownSelect
                  value={form.dayOfWeek}
                  options={DOW_OPTIONS}
                  onChange={(v) => setForm((p) => ({ ...p, dayOfWeek: v }))}
                  ariaLabel="День недели"
                />
              </div>
            )}
            <div className="form-group">
              <label>Время списания (Москва)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  style={{ width: 72 }}
                  type="number"
                  min="0"
                  max="23"
                  value={form.hourMsk}
                  onChange={(e) => setForm((p) => ({ ...p, hourMsk: e.target.value }))}
                />
                <span>ч</span>
                <input
                  style={{ width: 72 }}
                  type="number"
                  min="0"
                  max="59"
                  value={form.minuteMsk}
                  onChange={(e) => setForm((p) => ({ ...p, minuteMsk: e.target.value }))}
                />
                <span>мин</span>
              </div>
              <div className="form-group__hint">По умолчанию 9:00 — обычное время выплаты зарплаты.</div>
            </div>
            <div className="form-group">
              <label>Назначение в платеже (необязательно)</label>
              <input
                value={form.paymentDescription}
                onChange={(e) => setForm((p) => ({ ...p, paymentDescription: e.target.value }))}
                placeholder="Автовыплата зарплаты"
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={saving}>
              <Plus size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {saving ? 'Сохранение…' : 'Создать'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 14 }}>Активные расписания</div>
          {rules.length === 0 ? (
            <p className="form-group__hint">Пока нет правил. На одного сотрудника — одно расписание.</p>
          ) : (
            <div className="table-like">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="recent-transfer"
                  style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="recent-transfer__desc">{r.employeeName || 'Сотрудник'}</div>
                    <div className="recent-transfer__meta">
                      {r.amount?.toLocaleString?.('ru-RU')} {r.currency} · КВД {r.incomeKindCode} · {r.cadence}
                      {r.cadence === 'Monthly' && r.dayOfMonth != null ? ` · ${r.dayOfMonth} число` : ''}
                      {(r.cadence === 'Weekly' || r.cadence === 'BiWeekly') && r.dayOfWeek != null
                        ? ` · день недели ${r.dayOfWeek}`
                        : ''}
                      {' · '}
                      {Math.floor(r.runTimeMinutesUtc / 60)}:{String(r.runTimeMinutesUtc % 60).padStart(2, '0')} МСК
                    </div>
                    <div className="recent-transfer__meta" style={{ marginTop: 4 }}>
                      Следующий: {fmtMsk(r.nextRunAt)}
                      {r.lastRunAt ? ` · Последний: ${fmtMsk(r.lastRunAt)}` : ''}
                    </div>
                    {r.lastError && (
                      <div className="form-group__error" style={{ marginTop: 6 }}>{r.lastError}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => toggleEnabled(r)}
                      title={r.isEnabled ? 'Отключить' : 'Включить'}
                    >
                      <Power size={14} /> {r.isEnabled ? 'Выкл' : 'Вкл'}
                    </button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => setRemoveId(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!removeId}
        title="Удалить автоплатёж?"
        message="Правило будет удалено без отмены уже прошедших переводов."
        confirmLabel="Удалить"
        onCancel={() => setRemoveId(null)}
        onConfirm={confirmDelete}
      />
    </Layout>
  );
}
