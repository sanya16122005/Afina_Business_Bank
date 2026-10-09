import { useRef, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, KeyRound, Info } from 'lucide-react';
import { authAPI } from '../../api/auth';
import AfinaLogo, { TrianglePattern } from '../../components/ui/AfinaLogo';
import GlassBackground from '../../components/layout/GlassBackground';
import Spinner from '../../components/ui/Spinner';

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

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const emailInputRef = useRef(null);
  const codeInputRef = useRef(null);

  // Step: 'email' -> 'code' -> done (redirect)
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [expiresIn, setExpiresIn] = useState(5);

  const passwordStrength = useMemo(() => calcPasswordStrength(newPassword), [newPassword]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setFieldErrors({ email: ['Введите email'] });
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setFieldErrors({ email: ['Введите корректный email'] });
      return;
    }

    setLoading(true);
    try {
      const { data } = await authAPI.forgotPassword({ email: trimmedEmail });
      setExpiresIn(data.expiresInMinutes || 5);
      setStep('code');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      setError(detail || 'Не удалось отправить код. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errs = {};
    if (!code.trim()) errs.code = ['Введите код из письма'];
    else if (!/^\d{6}$/.test(code.trim())) errs.code = ['Код должен состоять из 6 цифр'];
    if (!newPassword) errs.newPassword = ['Введите новый пароль'];
    else if (newPassword.length < 8) errs.newPassword = ['Пароль должен быть не менее 8 символов'];
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(newPassword))
      errs.newPassword = ['Пароль должен содержать заглавную, строчную букву, цифру и спецсимвол'];
    if (newPassword !== confirmPassword) errs.confirmPassword = ['Пароли не совпадают'];

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      navigate('/login', {
        state: {
          email: email.trim().toLowerCase(),
          message: 'Пароль успешно изменён. Войдите с новым паролем.',
        },
      });
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.errors) {
        setFieldErrors(resp.errors);
      } else {
        setError(resp?.detail || 'Не удалось сбросить пароль. Проверьте код и попробуйте снова.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldErr = (name) =>
    fieldErrors[name] ? (
      <div className="form-group__error">{fieldErrors[name][0]}</div>
    ) : null;

  return (
    <div className="auth-page">
      <GlassBackground />
      <Link to="/login" className="auth-page__back"><ArrowLeft size={18} /> Назад ко входу</Link>

      {/* ── Левая панель — бренд ── */}
      <div className="auth-page__brand">
        <div className="auth-page__brand-content">
          <div className="auth-page__brand-logo">
            <AfinaLogo size={48} showText textStyle="stacked" useThemeColor />
          </div>
          <TrianglePattern size={220} color="#fff" opacity={0.08} className="auth-page__brand-pattern" />
          <h1 className="auth-page__brand-title">
            Восстановление<br />доступа к <span>аккаунту</span>
          </h1>
          <p className="auth-page__brand-sub">
            Мы отправим код подтверждения на&nbsp;вашу почту.
            Введите его вместе с&nbsp;новым паролем, чтобы восстановить доступ.
          </p>

          <div className="auth-page__brand-features">
            <div className="auth-page__brand-feature">
              <Mail size={18} /> Код отправляется на привязанный email
            </div>
            <div className="auth-page__brand-feature">
              <KeyRound size={18} /> Безопасная смена пароля за 2 шага
            </div>
          </div>
        </div>
      </div>

      {/* ── Правая панель — форма ── */}
      <div className="auth-page__form-side">
        <div className="auth-page__card">
          {step === 'email' && (
            <>
              <div className="auth-page__header">
                <h2>Забыли пароль?</h2>
                <p>Введите email, привязанный к аккаунту</p>
              </div>

              {error && <div className="auth-page__error">{error}</div>}

              <form onSubmit={handleSendCode} noValidate>
                <div className={`form-group${fieldErrors.email ? ' form-group--error' : ''}`}>
                  <label htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    ref={emailInputRef}
                    type="email"
                    placeholder="example@afina.ru"
                    value={email}
                    onChange={(e) => { setError(''); setFieldErrors({}); setEmail(e.target.value); }}
                    autoCapitalize="none"
                    autoComplete="email"
                    inputMode="email"
                    spellCheck="false"
                    autoFocus
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                  {fieldErr('email')}
                </div>

                <button
                  type="submit"
                  className="btn btn--primary btn--full btn--lg"
                  style={{ marginTop: 8 }}
                  disabled={loading}
                >
                  {loading && <Spinner />}
                  {loading ? 'Отправка...' : <>Отправить код <ArrowRight size={16} /></>}
                </button>
              </form>

              <div className="auth-page__switch">
                Вспомнили пароль? <Link to="/login">Войти</Link>
              </div>
            </>
          )}

          {step === 'code' && (
            <>
              <div className="auth-page__header">
                <h2>Новый пароль</h2>
                <p>Введите код из письма и задайте новый пароль</p>
              </div>

              {error && <div className="auth-page__error">{error}</div>}

              <div className="auth-page__reset-info">
                Код отправлен на <strong>{email}</strong>. Действителен {expiresIn} минут.
              </div>

              <form onSubmit={handleResetPassword} noValidate>
                <div className={`form-group${fieldErrors.code ? ' form-group--error' : ''}`}>
                  <label htmlFor="reset-code">Код из письма</label>
                  <input
                    id="reset-code"
                    ref={codeInputRef}
                    type="text"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => { setError(''); setFieldErrors({}); setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    style={{ letterSpacing: '0.3em', fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }}
                    aria-invalid={Boolean(fieldErrors.code)}
                  />
                  {fieldErr('code')}
                </div>

                <div className={`form-group${fieldErrors.newPassword ? ' form-group--error' : ''}`}>
                  <label htmlFor="reset-password">Новый пароль</label>
                  <div className="auth-page__pwd-wrap">
                    <input
                      id="reset-password"
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Не менее 8 символов"
                      value={newPassword}
                      onChange={(e) => { setFieldErrors((p) => ({ ...p, newPassword: undefined })); setNewPassword(e.target.value); }}
                      minLength={8}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.newPassword)}
                    />
                    <button type="button" className="auth-page__pwd-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPassword && (
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
                  {fieldErr('newPassword')}
                  <div className="auth-page__pwd-reqs">
                    <Info size={13} />
                    <span>Минимум 8 символов: заглавная, строчная, цифра и спецсимвол (!@#$%^&*)</span>
                  </div>
                </div>

                <div className={`form-group${fieldErrors.confirmPassword ? ' form-group--error' : ''}`}>
                  <label htmlFor="reset-confirm">Подтверждение пароля</label>
                  <input
                    id="reset-confirm"
                    type="password"
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => { setFieldErrors((p) => ({ ...p, confirmPassword: undefined })); setConfirmPassword(e.target.value); }}
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  />
                  {fieldErr('confirmPassword')}
                </div>

                <button
                  type="submit"
                  className="btn btn--primary btn--full btn--lg"
                  style={{ marginTop: 8 }}
                  disabled={loading}
                >
                  {loading && <Spinner />}
                  {loading ? 'Сохранение...' : <>Сохранить новый пароль <ArrowRight size={16} /></>}
                </button>
              </form>

              <div className="auth-page__switch">
                <button
                  type="button"
                  className="auth-page__forgot-link"
                  onClick={() => { setStep('email'); setError(''); setFieldErrors({}); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                >
                  Отправить код повторно
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
