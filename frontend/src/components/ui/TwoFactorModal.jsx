import { useState, useRef, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

function computeResendCooldown(lastSentAt) {
  if (!lastSentAt) return RESEND_COOLDOWN_SECONDS;
  const elapsed = Math.floor((Date.now() - lastSentAt) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

export default function TwoFactorModal({ pendingToken, expiresInMinutes, lastSentAt, onVerify, onCancel }) {
  const { verify2fa, resend2fa } = useAuth();
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.round((expiresInMinutes || 5) * 60));
  const [resendCooldown, setResendCooldown] = useState(() => computeResendCooldown(lastSentAt));
  const refs = useRef([]);
  const submittingRef = useRef(false);

  useEffect(() => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setError('');
    setLoading(false);
    setResending(false);
    submittingRef.current = false;
    setSecondsLeft(Math.round((expiresInMinutes || 5) * 60));
    setResendCooldown(computeResendCooldown(lastSentAt));

    const focusTimer = window.setTimeout(() => {
      refs.current[0]?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [pendingToken, expiresInMinutes, lastSentAt]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleChange = (idx, value) => {
    if (!/^\d?$/.test(value)) return;
    setError('');
    const next = [...digits];
    next[idx] = value;
    setDigits(next);

    if (value && idx < CODE_LENGTH - 1) {
      refs.current[idx + 1]?.focus();
    }

    if (next.every((d) => d !== '')) {
      submitCode(next.join(''));
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    const next = Array(CODE_LENGTH).fill('');
    text.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIdx = Math.min(text.length, CODE_LENGTH - 1);
    refs.current[focusIdx]?.focus();

    if (next.every((d) => d !== '')) {
      submitCode(next.join(''));
    }
  };

  const submitCode = async (code) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');

    const result = await verify2fa(pendingToken, code);
    setLoading(false);
    submittingRef.current = false;

    if (result.ok) {
      onVerify(result.role);
    } else {
      setError(result.error);
      setDigits(Array(CODE_LENGTH).fill(''));
      refs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setError('');
    const result = await resend2fa(pendingToken);
    setResending(false);
    if (result.ok) {
      setSecondsLeft(Math.round((result.expiresInMinutes || 5) * 60));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(''));
      refs.current[0]?.focus();
    } else {
      setError(result.error);
      if (result.retryAfterSeconds) {
        setResendCooldown(result.retryAfterSeconds);
      }
    }
  };

  const expired = secondsLeft <= 0;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="tfa-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tfa-modal__close" onClick={onCancel} aria-label="Закрыть окно подтверждения">
          <X size={14} />
        </button>

        {/* Brand logo */}
        <div className="tfa-modal__logo">
          <svg viewBox="0 0 62 62" fill="none" width="44" height="44">
            <path d="M31 5 L57 55 H5 Z" stroke="#F4A683" strokeWidth="2" strokeLinejoin="round" fill="none"/>
            <line x1="15" y1="41" x2="47" y2="41" stroke="#F4A683" strokeWidth="1.5"/>
            <circle cx="31" cy="5" r="1.5" fill="#F4A683"/>
          </svg>
          <span className="tfa-modal__logo-name">АФИНА БАНК</span>
          <span className="tfa-modal__logo-sub">цифровой банкинг</span>
        </div>

        <div className="tfa-modal__divider" />

        <p className="tfa-modal__label">КОД ПОДТВЕРЖДЕНИЯ</p>
        <p className="tfa-modal__subtitle">Введите 6-значный код из письма, чтобы завершить вход.</p>

        {error && <div className="tfa-modal__error">{error}</div>}

        <div className="tfa-modal__code-box" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="tfa-modal__digit"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading || expired}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {!expired && (
          <p className="tfa-modal__timer-text">
            Код действителен <span>{formatTime(secondsLeft)}</span>
          </p>
        )}
        {expired && (
          <p className="tfa-modal__expired-text">
            Код истёк. Запросите новый код.
          </p>
        )}

        <button
          type="button"
          className="btn btn--primary btn--full btn--lg"
          style={{ marginTop: 16 }}
          disabled={loading || expired || digits.some((d) => !d)}
          onClick={() => submitCode(digits.join(''))}
        >
          {loading ? 'Проверка...' : 'Подтвердить'}
        </button>

        <div className="tfa-modal__resend">
          <button
            type="button"
            className="tfa-modal__resend-btn"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            <RotateCcw size={13} /> {resending
              ? 'Отправка...'
              : resendCooldown > 0
                ? `Отправить повторно через ${resendCooldown} сек.`
                : 'Отправить код повторно'}
          </button>
        </div>

        <div className="tfa-modal__bank-footer">
          <span>&copy; 2026 Афина Банк</span>
          <span>Москва, проспект Вернадского, дом 78, ауд. B-415 &middot; +7 (985) 311-76-90</span>
        </div>
      </div>
    </div>
  );
}
