import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowRight, ArrowLeft, Eye, EyeOff,
  Building2, Info, Mail, CreditCard,
} from 'lucide-react';
import AfinaLogo, { TrianglePattern } from '../../components/ui/AfinaLogo';
import GlassBackground from '../../components/layout/GlassBackground';
import Spinner from '../../components/ui/Spinner';
import DropdownSelect from '../../components/ui/DropdownSelect';
import { onlyDigits, formatPhoneInput, normalizePhoneForApi } from '../../utils/phone';
import { OWNERSHIP_FORM_OPTIONS } from '../../constants/ownership';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function calcPasswordStrength(password) {
  if (!password) return { score: 0, label: '', tone: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*]/.test(password)) score += 1;
  if (score <= 1) return { score: 1, label: 'Слабый', tone: 'weak' };
  if (score === 2) return { score: 2, label: 'Средний', tone: 'medium' };
  if (score === 3) return { score: 3, label: 'Хороший', tone: 'good' };
  return { score: 4, label: 'Надёжный', tone: 'strong' };
}

export default function RegisterLegalPage() {
  const { registerLegal } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    companyName: '',
    ownershipForm: 'ООО',
    legalAddress: '',
    directorFirstName: '',
    directorLastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const passwordStrength = useMemo(() => calcPasswordStrength(form.password), [form.password]);

  const set = (field) => (e) => {
    setError('');
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const setPhone = (e) => {
    setError('');
    setFieldErrors((prev) => ({ ...prev, phoneNumber: undefined }));
    setForm((prev) => ({ ...prev, phoneNumber: formatPhoneInput(e.target.value) }));
  };

  const validate = () => {
    const errs = {};
    const email = form.email.trim().toLowerCase();
    const phoneDigits = onlyDigits(form.phoneNumber);

    if (!form.companyName.trim()) errs.companyName = ['Укажите наименование'];
    if (!form.ownershipForm.trim()) errs.ownershipForm = ['Укажите форму (ИП, ООО и т.д.)'];
    if (!form.directorFirstName.trim()) errs.directorFirstName = ['Имя представителя'];
    if (!form.directorLastName.trim()) errs.directorLastName = ['Фамилия представителя'];
    if (!email) errs.email = ['Введите email'];
    else if (!EMAIL_RE.test(email)) errs.email = ['Введите корректный email'];
    if (!phoneDigits) errs.phoneNumber = ['Введите номер телефона'];
    else if (phoneDigits.length < 10) errs.phoneNumber = ['Введите полный номер телефона'];
    if (!form.dateOfBirth) errs.dateOfBirth = ['Укажите дату рождения представителя'];
    if (form.password.length < 8) errs.password = ['Пароль не менее 8 символов'];
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(form.password)) {
      errs.password = ['Пароль: заглавная, строчная, цифра и спецсимвол'];
    }
    if (form.password !== form.confirmPassword) errs.confirmPassword = ['Пароли не совпадают'];
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    const phoneNumber = normalizePhoneForApi(form.phoneNumber);

    const result = await registerLegal({
      companyName: form.companyName.trim(),
      ownershipForm: form.ownershipForm.trim(),
      legalAddress: form.legalAddress.trim() || undefined,
      directorFirstName: form.directorFirstName.trim(),
      directorLastName: form.directorLastName.trim(),
      email,
      phoneNumber,
      dateOfBirth: form.dateOfBirth,
      password: form.password,
      confirmPassword: form.confirmPassword,
    });

    if (result.ok) {
      navigate('/login', {
        state: {
          email,
          message: 'Организация зарегистрирована. Войдите — код подтверждения придёт на email.',
        },
      });
    } else if (result.errors) {
      if (result.errors.general) setError(result.errors.general[0]);
      else setFieldErrors(result.errors);
      setLoading(false);
    } else {
      setError('Ошибка регистрации');
      setLoading(false);
    }
  };

  const fieldErr = (name) =>
    fieldErrors[name] ? <div className="form-group__error">{fieldErrors[name][0]}</div> : null;

  return (
    <div className="auth-page auth-page--register">
      <GlassBackground />
      <Link to="/" className="auth-page__back"><ArrowLeft size={18} /> На главную</Link>

      <div className="auth-page__brand">
        <div className="auth-page__brand-content">
          <div className="auth-page__brand-logo">
            <AfinaLogo size={48} showText textStyle="stacked" useThemeColor />
          </div>
          <TrianglePattern size={220} color="#fff" opacity={0.08} className="auth-page__brand-pattern" />
          <h1 className="auth-page__brand-title">
            Кабинет для <span>бизнеса</span>
          </h1>
          <p className="auth-page__brand-sub">
            ИП и ООО: расчётный счёт, выплаты сотрудникам с указанием кода вида дохода для учёта.
          </p>
          <div className="auth-page__brand-steps">
            <div className="auth-page__brand-step">
              <div className="auth-page__brand-step-icon"><Building2 size={18} /></div>
              <div>
                <div className="auth-page__brand-step-title">Регистрация организации</div>
                <div className="auth-page__brand-step-desc">Данные ИП/ООО и представителя</div>
              </div>
            </div>
            <div className="auth-page__brand-step">
              <div className="auth-page__brand-step-icon"><Mail size={18} /></div>
              <div>
                <div className="auth-page__brand-step-title">Сотрудники</div>
                <div className="auth-page__brand-step-desc">По email клиента банка — физлица</div>
              </div>
            </div>
            <div className="auth-page__brand-step">
              <div className="auth-page__brand-step-icon"><CreditCard size={18} /></div>
              <div>
                <div className="auth-page__brand-step-title">Выплаты</div>
                <div className="auth-page__brand-step-desc">Только назначенным сотрудникам, с КВД</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-page__form-side">
        <div className="auth-page__card">
          <div className="auth-page__header">
            <div>
              <h2><Building2 size={22} /> Регистрация юрлица / ИП</h2>
              <p>Данные организации и руководителя (представителя)</p>
            </div>
            <div className="auth-page__header-actions" aria-label="Другие варианты регистрации">
              <Link to="/register" className="auth-page__header-pill auth-page__header-pill--block">
                Физлицо
              </Link>
              <Link to="/login" className="auth-page__header-pill auth-page__header-pill--block">
                Войти
              </Link>
            </div>
          </div>

          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-page__row">
              <div className={`form-group${fieldErrors.ownershipForm ? ' form-group--error' : ''}`}>
                <label>Форма собственности</label>
                <DropdownSelect
                  value={form.ownershipForm}
                  options={OWNERSHIP_FORM_OPTIONS}
                  onChange={(value) => {
                    setError('');
                    setFieldErrors((prev) => ({ ...prev, ownershipForm: undefined }));
                    setForm((prev) => ({ ...prev, ownershipForm: value }));
                  }}
                  placeholder="Выберите форму"
                  ariaLabel="Форма собственности"
                />
                {fieldErr('ownershipForm')}
              </div>
              <div className={`form-group${fieldErrors.companyName ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-company">Название (без формы)</label>
                <input
                  id="leg-company"
                  value={form.companyName}
                  onChange={set('companyName')}
                  placeholder='Ромашка или Иванов Иван Иванович'
                />
                {fieldErr('companyName')}
              </div>
            </div>
            <div className="form-group__hint" style={{ marginTop: -8, marginBottom: 14 }}>
              Форму (ООО, ИП и т.д.) не дублируйте в названии — она хранится отдельно.
            </div>

            <div className="form-group">
              <label htmlFor="leg-address">Юр. адрес</label>
              <input id="leg-address" value={form.legalAddress} onChange={set('legalAddress')} placeholder="Необязательно" />
            </div>

            <div className="auth-page__row">
              <div className={`form-group${fieldErrors.directorFirstName ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-fn">Имя представителя</label>
                <input id="leg-fn" value={form.directorFirstName} onChange={set('directorFirstName')} autoComplete="given-name" />
                {fieldErr('directorFirstName')}
              </div>
              <div className={`form-group${fieldErrors.directorLastName ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-ln">Фамилия</label>
                <input id="leg-ln" value={form.directorLastName} onChange={set('directorLastName')} autoComplete="family-name" />
                {fieldErr('directorLastName')}
              </div>
            </div>

            <div className={`form-group${fieldErrors.email ? ' form-group--error' : ''}`}>
              <label htmlFor="leg-email">Email (логин)</label>
              <input id="leg-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
              {fieldErr('email')}
            </div>

            <div className="auth-page__row">
              <div className={`form-group${fieldErrors.phoneNumber ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-phone">Телефон</label>
                <input id="leg-phone" type="tel" value={form.phoneNumber} onChange={setPhone} maxLength={18} />
                {fieldErr('phoneNumber')}
              </div>
              <div className={`form-group${fieldErrors.dateOfBirth ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-dob">Дата рождения представителя</label>
                <input id="leg-dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
                {fieldErr('dateOfBirth')}
              </div>
            </div>

            <div className="auth-page__row auth-page__row--passwords">
              <div className={`form-group${fieldErrors.password ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-pwd">Пароль</label>
                <div className="auth-page__pwd-wrap">
                  <input
                    id="leg-pwd"
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={set('password')}
                    autoComplete="new-password"
                  />
                  <button type="button" className="auth-page__pwd-toggle" onClick={() => setShowPwd(!showPwd)} aria-label="Показать пароль">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password && (
                  <div className={`auth-page__pwd-meter auth-page__pwd-meter--${passwordStrength.tone}`}>
                    <div className="auth-page__pwd-meter-bars" aria-hidden="true">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={`auth-page__pwd-meter-bar${i <= passwordStrength.score ? ' auth-page__pwd-meter-bar--filled' : ''}`}
                        />
                      ))}
                    </div>
                    <span className="auth-page__pwd-meter-label">{passwordStrength.label}</span>
                  </div>
                )}
                {fieldErr('password')}
                <div className="auth-page__pwd-reqs">
                  <Info size={13} />
                  <span>Как для физлица: 8+ символов, A–Z, a–z, цифра, спецсимвол</span>
                </div>
              </div>
              <div className={`form-group${fieldErrors.confirmPassword ? ' form-group--error' : ''}`}>
                <label htmlFor="leg-confirm">Подтверждение</label>
                <input id="leg-confirm" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
                {fieldErr('confirmPassword')}
              </div>
            </div>

            <button type="submit" className="btn btn--primary btn--full btn--lg" style={{ marginTop: 8 }} disabled={loading}>
              {loading && <Spinner />}
              {loading ? 'Создаём…' : <>Зарегистрировать организацию <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
