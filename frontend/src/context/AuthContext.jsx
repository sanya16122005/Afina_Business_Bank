import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { authAPI } from '../api/auth';
import { getProfile as getUserProfile } from '../api/accounts';
import { clearCashierSession } from '../utils/cashierSession';

const AuthContext = createContext(null);

const SESSION_KEYS = {
  user: 'afina_user',
  token: 'token',
  refreshToken: 'refreshToken',
  pending2fa: 'afina_pending_2fa',
};

const RESEND_COOLDOWN_MS = 60_000;

function readStorageValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key, value) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage failures such as blocked storage or private mode.
  }
}

function parseStoredUser() {
  const raw = readStorageValue(SESSION_KEYS.user);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    writeStorageValue(SESSION_KEYS.user, null);
    return null;
  }
}

function readPending2fa() {
  const raw = readStorageValue(SESSION_KEYS.pending2fa);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (!data?.pendingToken || !data?.email || !data?.expiresAt) return null;
    if (data.expiresAt <= Date.now()) {
      writeStorageValue(SESSION_KEYS.pending2fa, null);
      return null;
    }
    return data;
  } catch {
    writeStorageValue(SESSION_KEYS.pending2fa, null);
    return null;
  }
}

function writePending2fa(data) {
  writeStorageValue(SESSION_KEYS.pending2fa, data ? JSON.stringify(data) : null);
}

function buildPendingResult(pending) {
  const remainingMs = Math.max(0, pending.expiresAt - Date.now());
  return {
    ok: false,
    requires2FA: true,
    pendingToken: pending.pendingToken,
    expiresInMinutes: remainingMs / 60_000,
    lastSentAt: pending.lastSentAt || Date.now(),
  };
}

function buildAvatar(user) {
  const firstInitial = user?.firstName?.[0] || user?.fullName?.[0] || '';
  const lastInitial = user?.lastName?.[0] || '';
  const initials = `${firstInitial}${lastInitial}`.trim();
  return initials || user?.avatar || '';
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'cashier') return 'Cashier';
  if (normalized === 'customer') return 'Customer';
  if (normalized === 'legalentity') return 'LegalEntity';
  return role || '';
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    role: normalizeRole(user.role),
    avatar: buildAvatar(user),
  };
}

function clearSessionStorage() {
  writeStorageValue(SESSION_KEYS.user, null);
  writeStorageValue(SESSION_KEYS.token, null);
  writeStorageValue(SESSION_KEYS.refreshToken, null);
  writeStorageValue(SESSION_KEYS.pending2fa, null);
  clearCashierSession();
}

function getErrorMessage(err, fallback) {
  return err?.response?.data?.detail
    || err?.response?.data?.message
    || err?.response?.data?.error
    || fallback;
}

export function AuthProvider({ children }) {
  const userRef = useRef(null);
  const [user, setUser] = useState(() => normalizeUser(parseStoredUser()));
  const [token, setToken] = useState(() => readStorageValue(SESSION_KEYS.token));
  userRef.current = user;

  const syncUser = useCallback((nextUser) => {
    if (!nextUser) return null;

    const currentUser = userRef.current || {};
    const normalized = normalizeUser({
      ...currentUser,
      ...nextUser,
      address: nextUser.address ?? currentUser.address ?? null,
      settings: nextUser.settings ?? currentUser.settings ?? null,
    });

    setUser(normalized);
    return normalized;
  }, []);

  // Persist the active session so reloads keep the current auth state.
  useEffect(() => {
    if (user) {
      writeStorageValue(SESSION_KEYS.user, JSON.stringify(user));
      return;
    }

    clearSessionStorage();
  }, [user]);

  const saveSession = useCallback((data) => {
    if (!data?.user || !data?.token) {
      return { ok: false, error: 'Некорректный ответ сервера' };
    }

    const nextUser = normalizeUser(data.user);
    syncUser(nextUser);
    writeStorageValue(SESSION_KEYS.token, data.token);
    writeStorageValue(SESSION_KEYS.refreshToken, data.refreshToken || null);
    setToken(data.token);
    return { ok: true, role: nextUser.role, user: nextUser };
  }, [syncUser]);

  const login = useCallback(async (email, password) => {
    const stored = readPending2fa();
    if (stored && stored.email === email) {
      return buildPendingResult(stored);
    }

    try {
      const { data } = await authAPI.login({ email, password });

      if (data.requiresTwoFactor) {
        const expiresInMinutes = data.expiresInMinutes || 5;
        const lastSentAt = Date.now();
        const expiresAt = lastSentAt + expiresInMinutes * 60_000;
        writePending2fa({
          email,
          pendingToken: data.pendingToken,
          expiresAt,
          lastSentAt,
        });
        return {
          ok: false,
          requires2FA: true,
          pendingToken: data.pendingToken,
          expiresInMinutes,
          lastSentAt,
        };
      }

      return saveSession(data);
    } catch (err) {
      if (!err?.response) {
        return { ok: false, error: 'Сервер недоступен. Попробуйте позже.' };
      }

      return { ok: false, error: getErrorMessage(err, 'Неверный email или пароль') };
    }
  }, [saveSession]);

  const verify2fa = useCallback(async (pendingToken, code) => {
    try {
      const { data } = await authAPI.verify2fa({ pendingToken, code });
      writePending2fa(null);
      return saveSession(data);
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Неверный код подтверждения') };
    }
  }, [saveSession]);

  const resend2fa = useCallback(async (pendingToken) => {
    const stored = readPending2fa();
    if (stored?.pendingToken === pendingToken && stored.lastSentAt) {
      const elapsed = Date.now() - stored.lastSentAt;
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return {
          ok: false,
          error: `Запросить новый код можно через ${waitSeconds} сек.`,
          retryAfterSeconds: waitSeconds,
        };
      }
    }

    try {
      const { data } = await authAPI.resend2fa({ pendingToken });
      const expiresInMinutes = data.expiresInMinutes || 5;
      const lastSentAt = Date.now();
      if (stored?.pendingToken === pendingToken) {
        writePending2fa({
          ...stored,
          lastSentAt,
          expiresAt: lastSentAt + expiresInMinutes * 60_000,
        });
      }
      return { ok: true, expiresInMinutes, lastSentAt };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Не удалось отправить код повторно') };
    }
  }, []);

  const registerLegal = useCallback(async (payload) => {
    try {
      const { data } = await authAPI.registerLegal(payload);
      return {
        ok: true,
        role: normalizeRole(data.role || 'LegalEntity'),
        user: normalizeUser({
          id: data.userId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role || 'LegalEntity',
        }),
      };
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.errors) return { ok: false, errors: resp.errors };
      if (!err?.response) return { ok: false, errors: { general: ['Сервер недоступен'] } };
      return { ok: false, errors: { general: [getErrorMessage(err, 'Ошибка регистрации')] } };
    }
  }, []);

  const register = useCallback(async ({ firstName, lastName, email, phoneNumber, dateOfBirth, password, confirmPassword }) => {
    try {
      const { data } = await authAPI.register({
        firstName,
        lastName,
        email,
        phoneNumber,
        dateOfBirth,
        password,
        confirmPassword: confirmPassword || password,
      });

      const nextUser = normalizeUser({
        id: data.userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role || 'Customer',
      });

      return {
        ok: true,
        role: nextUser.role,
        user: nextUser,
      };
    } catch (err) {
      const resp = err?.response?.data;

      if (resp?.errors) {
        return { ok: false, errors: resp.errors };
      }

      if (!err?.response) {
        return { ok: false, errors: { general: ['Сервер недоступен'] } };
      }

      return { ok: false, errors: { general: [getErrorMessage(err, 'Ошибка регистрации')] } };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) {
      return { ok: false, skipped: true };
    }

    try {
      const { data } = await getUserProfile();
      const normalized = syncUser(data);
      return { ok: true, user: normalized };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Не удалось обновить профиль') };
    }
  }, [syncUser, token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      const result = await refreshUser();
      if (cancelled || !result.ok) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshUser, token]);

  const logout = useCallback(async () => {
    const refreshToken = readStorageValue(SESSION_KEYS.refreshToken);

    try {
      if (refreshToken) {
        await authAPI.logout({ refreshToken });
      }
    } catch {
      // Ignore logout failures.
    }

    clearSessionStorage();
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, verify2fa, resend2fa, register, registerLegal, logout, syncUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
