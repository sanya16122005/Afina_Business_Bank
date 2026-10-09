import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowRight, ArrowLeft, Eye, EyeOff,
  Lock, UserPlus, Info, FormInput, Mail, CreditCard,
} from 'lucide-react';
import AfinaLogo, { TrianglePattern } from '../../components/ui/AfinaLogo';
import GlassBackground from '../../components/layout/GlassBackground';
import Spinner from '../../components/ui/Spinner';
import { onlyDigits, formatPhoneInput, normalizePhoneForApi } from '../../utils/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REGISTER_STEPS = [
  { icon: FormInput, title: '1. Заполните форму', desc: 'Имя, email, телефон и пароль — пара минут' },
  { icon: Mail, title: '2. Подтвердите email', desc: 'Введите 6-значный код из письма' },
  { icon: CreditCard, title: '3. Откройте первый счёт', desc: 'Расчётный, сберегательный или зарплатный' },
];

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

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading]   = useState(false);
  const [showPwd, setShowPwd]   = useState(false);

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
    const today = new Date().toISOString().slice(0, 10);

    if (!form.firstName.trim()) errs.firstName = ['Введите имя'];
    if (!form.lastName.trim()) errs.lastName = ['Введите фамилию'];
    if (!email) errs.email = ['Введите email'];
    else if (!EMAIL_RE.test(email)) errs.email = ['Введите корректный email'];
    if (!phoneDigits) errs.phoneNumber = ['Введите номер телефона'];
    else if (phoneDigits.length < 10) errs.phoneNumber = ['Введите полный номер телефона'];
    if (!form.dateOfBirth) errs.dateOfBirth = ['Укажите дату рождения'];
    else if (form.dateOfBirth > today) errs.dateOfBirth = ['Укажите корректную дату рождения'];

    if (form.password.length < 8)
      errs.password = ['Пароль должен быть не менее 8 символов'];
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(form.password))
      errs.password = ['Пароль должен содержать заглавную, строчную букву, цифру и спецсимвол'];

    if (form.password !== form.confirmPassword)
      errs.confirmPassword = ['Пароли не совпадают'];

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

    const result = await register({
      firstName: form.firstName,
      lastName: form.lastName,
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
          message: 'Аккаунт создан. Войдите по email и паролю — мы отправим код подтверждения.',
        },
      });
    } else if (result.errors) {
      if (result.errors.general) {
        setError(result.errors.general[0]);
      } else {
        setFieldErrors(result.errors);
      }
      setLoading(false);
    } else {
      setError('Ошибка регистрации');
      setLoading(false);
    }
  };

  const fieldErr = (name) =>
    fieldErrors[name] ? (
      <div className="form-group__error">{fieldErrors[name][0]}</div>
    ) : null;

  return (
    <div className="auth-page auth-page--register">
      <GlassBackground />
      <Link to="/" className="auth-page__back"><ArrowLeft size={18} /> На главную</Link>

      {/* ── Левая панель — бренд ── */}
      <div className="auth-page__brand">
        <div className="auth-page__brand-content">
          <div className="auth-page__brand-logo">
            <AfinaLogo size={48} showText textStyle="stacked" useThemeColor />
          </div>
          <TrianglePattern size={220} color="#fff" opacity={0.08} className="auth-page__brand-pattern" />
          <h1 className="auth-page__brand-title">
            Откройте счёт<br />за <span>5 минут</span>
          </h1>
          <p className="auth-page__brand-sub">
            Без визита в отделение. Расчётный, сберегательный и кредитный счета
            доступны сразу после регистрации.
          </p>

          <div className="auth-page__brand-steps">
            {REGISTER_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="auth-page__brand-step">
                  <div className="auth-page__brand-step-icon"><Icon size={18} /></div>
                  <div>
                    <div className="auth-page__brand-step-title">{step.title}</div>
                    <div className="auth-page__brand-step-desc">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Правая панель — форма ── */}
      <div className="auth-page__form-side">
        <div className="auth-page__card">
          <div className="auth-page__header">
            <div>
              <h2><UserPlus size={22} /> Регистрация</h2>
              <p>Заполните данные — это займёт пару минут</p>
            </div>
            <div className="auth-page__header-actions" aria-label="Перейти к входу или регистрации для бизнеса">
              <div className="auth-page__header-actions-row">
                <span className="auth-page__header-actions-label">Уже есть аккаунт?</span>
                <Link to="/login" className="auth-page__header-pill">Войти</Link>
              </div>
              <Link to="/register-legal" className="auth-page__header-pill auth-page__header-pill--block">
                Для бизнеса (ИП, ООО)
              </Link>
            </div>
          </div>

          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-page__row">
              <div className={`form-group${fieldErrors.firstName ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-first-name">Имя</label>
                <input
                  id="reg-first-name"
                  type="text"
                  placeholder="Иван"
                  value={form.firstName}
                  onChange={set('firstName')}
                  autoComplete="given-name"
                  autoFocus
                  required
                  aria-invalid={Boolean(fieldErrors.firstName)}
                />
                {fieldErr('firstName')}
              </div>
              <div className={`form-group${fieldErrors.lastName ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-last-name">Фамилия</label>
                <input
                  id="reg-last-name"
                  type="text"
                  placeholder="Петров"
                  value={form.lastName}
                  onChange={set('lastName')}
                  autoComplete="family-name"
                  required
                  aria-invalid={Boolean(fieldErrors.lastName)}
                />
                {fieldErr('lastName')}
              </div>
            </div>

            <div className={`form-group${fieldErrors.email ? ' form-group--error' : ''}`}>
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                placeholder="example@afina.ru"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck="false"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErr('email')}
            </div>

            <div className="auth-page__row">
              <div className={`form-group${fieldErrors.phoneNumber ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-phone">Телефон</label>
                <input
                  id="reg-phone"
                  type="tel"
                  placeholder="+7 (900) 123-45-67"
                  value={form.phoneNumber}
                  onChange={setPhone}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={18}
                  aria-invalid={Boolean(fieldErrors.phoneNumber)}
                />
                {fieldErr('phoneNumber')}
              </div>
              <div className={`form-group${fieldErrors.dateOfBirth ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-dob">Дата рождения</label>
                <input
                  id="reg-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={set('dateOfBirth')}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  aria-invalid={Boolean(fieldErrors.dateOfBirth)}
                />
                {fieldErr('dateOfBirth')}
              </div>
            </div>

            <div className="auth-page__row auth-page__row--passwords">
              <div className={`form-group${fieldErrors.password ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-password">Пароль</label>
                <div className="auth-page__pwd-wrap">
                  <input
                    id="reg-password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Не менее 8 символов"
                    value={form.password}
                    onChange={set('password')}
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                  />
                  <button type="button" className="auth-page__pwd-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}>
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
                  <span>Минимум 8 символов: заглавная, строчная, цифра и спецсимвол (!@#$%^&*)</span>
                </div>
              </div>

              <div className={`form-group${fieldErrors.confirmPassword ? ' form-group--error' : ''}`}>
                <label htmlFor="reg-confirm">Подтверждение пароля</label>
                <input
                  id="reg-confirm"
                  type="password"
                  placeholder="Повторите пароль"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                />
                {fieldErr('confirmPassword')}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--full btn--lg"
              style={{ marginTop: 8 }}
              disabled={loading}
            >
              {loading && <Spinner />}
              {loading ? 'Создаём аккаунт...' : <>Создать аккаунт <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
