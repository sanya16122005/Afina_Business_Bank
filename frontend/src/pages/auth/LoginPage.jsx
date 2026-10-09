import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowRight, ArrowLeft, Eye, EyeOff, ShieldCheck, Radio, Lock } from 'lucide-react';
import AfinaLogo, { TrianglePattern } from '../../components/ui/AfinaLogo';
import GlassBackground from '../../components/layout/GlassBackground';
import Spinner from '../../components/ui/Spinner';
import TwoFactorModal from '../../components/ui/TwoFactorModal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getRedirectPath(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return '/admin';
  if (normalized === 'cashier') return '/cashier';
  if (normalized === 'customer') return '/dashboard';
  if (normalized === 'legalentity') return '/dashboard';
  return null;
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const [form, setForm]     = useState({ email: '', password: '' });
  const [error, setError]   = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);
  const [expiresIn, setExpiresIn] = useState(5);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const emailFromState = location.state?.email;
    const messageFromState = location.state?.message;

    if (emailFromState) {
      setForm((prev) => ({ ...prev, email: emailFromState }));
      // Если email уже подставлен — фокус на пароль.
      window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    } else {
      window.setTimeout(() => emailInputRef.current?.focus(), 0);
    }
    if (messageFromState) {
      setSuccessMessage(messageFromState);
    }
  }, [location.state]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const redirectPath = getRedirectPath(user.role);
    if (redirectPath) {
      navigate(redirectPath, { replace: true });
    }
  }, [navigate, user]);

  const setField = (field) => (e) => {
    setError('');
    setSuccessMessage('');
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validate = () => {
    const errs = {};
    const email = form.email.trim().toLowerCase();

    if (!email) {
      errs.email = ['Введите email'];
    } else if (!EMAIL_RE.test(email)) {
      errs.email = ['Введите корректный email'];
    }

    if (!form.password.trim()) {
      errs.password = ['Введите пароль'];
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');
    setFieldErrors({});

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setLoading(false);
      return;
    }

    try {
      const result = await login(form.email.trim().toLowerCase(), form.password);

      if (result.requires2FA) {
        setPendingToken(result.pendingToken);
        setExpiresIn(result.expiresInMinutes || 5);
        setLastSentAt(result.lastSentAt || Date.now());
        setShow2FA(true);
        return;
      }

      if (result.ok) {
        const redirectPath = getRedirectPath(result.role);
        if (!redirectPath) {
          setError('Не удалось определить роль. Попробуйте войти ещё раз.');
          return;
        }

        window.setTimeout(() => {
          navigate(redirectPath, { replace: true });
        }, 0);
        return;
      }

      setError(result.error || 'Неверный email или пароль');
    } catch {
      setError('Не удалось выполнить вход. Проверьте соединение с сервером.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = (role) => {
    setShow2FA(false);
    const redirectPath = getRedirectPath(role);
    if (!redirectPath) {
      setError('Не удалось завершить вход. Попробуйте ещё раз.');
      return;
    }

    window.setTimeout(() => {
      navigate(redirectPath, { replace: true });
    }, 0);
  };

  const handle2FACancel = () => {
    setShow2FA(false);
    setPendingToken(null);
    setLoading(false);
  };

  const fieldErr = (name) =>
    fieldErrors[name] ? (
      <div className="form-group__error">{fieldErrors[name][0]}</div>
    ) : null;

  return (
    <div className="auth-page">
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
            Добро пожаловать<br />в <span>цифровой банк</span>
          </h1>
          <p className="auth-page__brand-sub">
            Управляйте финансами, переводами и счетами в&nbsp;одном
            безопасном пространстве — 24/7, без визита в&nbsp;отделение.
          </p>

          <div className="auth-page__brand-features">
            <div className="auth-page__brand-feature">
              <Lock size={18} /> Вход с подтверждением кодом из email
            </div>
            <div className="auth-page__brand-feature">
              <ShieldCheck size={18} /> Прозрачный антифрод по каждой операции
            </div>
            <div className="auth-page__brand-feature">
              <Radio size={18} /> Уведомления о подозрительных операциях в реальном времени
            </div>
          </div>
        </div>
      </div>

      {/* ── Правая панель — форма ── */}
      <div className="auth-page__form-side">
        <div className="auth-page__card">
          <div className="auth-page__header">
            <h2>Вход в систему</h2>
            <p>Введите email и пароль аккаунта</p>
          </div>

          {successMessage && <div className="auth-page__success">{successMessage}</div>}
          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className={`form-group${fieldErrors.email ? ' form-group--error' : ''}`}>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                ref={emailInputRef}
                type="email"
                placeholder="example@afina.ru"
                value={form.email}
                onChange={setField('email')}
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                spellCheck="false"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErr('email')}
            </div>

            <div className={`form-group${fieldErrors.password ? ' form-group--error' : ''}`}>
              <div className="auth-page__label-row">
                <label htmlFor="login-password">Пароль</label>
                <Link className="auth-page__forgot-link" to="/forgot-password">
                  Забыли пароль?
                </Link>
              </div>
              <div className="auth-page__pwd-wrap">
                <input
                  id="login-password"
                  ref={passwordInputRef}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={setField('password')}
                  autoComplete="current-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button type="button" className="auth-page__pwd-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErr('password')}
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--full btn--lg"
              style={{ marginTop: 8 }}
              disabled={loading}
            >
              {loading && <Spinner />}
              {loading ? 'Входим...' : <>Войти в систему <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="auth-page__switch">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </div>
        </div>
      </div>

      {show2FA && (
        <TwoFactorModal
          pendingToken={pendingToken}
          expiresInMinutes={expiresIn}
          lastSentAt={lastSentAt}
          onVerify={handle2FAVerify}
          onCancel={handle2FACancel}
        />
      )}
    </div>
  );
}
