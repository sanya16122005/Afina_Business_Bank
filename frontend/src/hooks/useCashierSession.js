import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { endSession, getSessionStatus, startSession } from '../api/cashier';
import {
  clearCashierSession,
  normalizeCashierSession,
  readCashierSession,
} from '../utils/cashierSession';

function getCashierFullName(user) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return fullName || user?.fullName || user?.email || 'Кассир';
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.detail
    || error?.response?.data?.message
    || error?.response?.data?.error
    || fallback;
}

function isActiveSession(status) {
  return String(status || '').trim().toLowerCase() === 'active';
}

export function useCashierSession() {
  const { user } = useAuth();
  const [session, setSession] = useState(() => readCashierSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const persistSession = useCallback((payload) => {
    const next = normalizeCashierSession({
      ...payload,
      cashierUserId: payload?.cashierUserId ?? payload?.userId ?? user?.id ?? null,
    });
    setSession(next);
    if (!next) clearCashierSession();
    return next;
  }, [user?.id]);

  const ensureSession = useCallback(async () => {
    if (user?.role !== 'Cashier') {
      clearCashierSession();
      setSession(null);
      setReady(true);
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const storedSession = readCashierSession();
      const currentUserId = String(user?.id || '');
      const storedUserId = String(storedSession?.cashierUserId || '');

      if (storedSession?.sessionId && storedUserId && currentUserId && storedUserId !== currentUserId) {
        clearCashierSession();
        setSession(null);
      }

      if (storedSession?.sessionId && (!storedUserId || !currentUserId || storedUserId === currentUserId)) {
        try {
          const { data } = await getSessionStatus(storedSession.sessionId);
          if (isActiveSession(data?.status)) {
            return persistSession({ ...data, cashierUserId: storedSession.cashierUserId || user?.id });
          }

          clearCashierSession();
          setSession(null);
        } catch (error) {
          if (error?.response?.status !== 404) {
            throw error;
          }

          clearCashierSession();
          setSession(null);
        }
      }

      try {
        const { data } = await startSession({ cashierFullName: getCashierFullName(user) });
        return persistSession({ ...data, cashierUserId: data.cashierUserId || user?.id });
      } catch (error) {
        const existingSessionId = error?.response?.data?.sessionId;
        if (error?.response?.status === 400 && existingSessionId) {
          const { data } = await getSessionStatus(existingSessionId);
          if (isActiveSession(data?.status)) {
            return persistSession({ ...data, cashierUserId: user?.id });
          }
        }

        throw error;
      }
    } catch (error) {
      setError(getErrorMessage(error, 'Не удалось открыть кассовый сеанс'));
      clearCashierSession();
      setSession(null);
      return null;
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [persistSession, user]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  const refreshSession = useCallback(async () => {
    if (!session?.sessionId) {
      return ensureSession();
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await getSessionStatus(session.sessionId);
      if (isActiveSession(data?.status)) {
        return persistSession({ ...data, cashierUserId: session.cashierUserId || user?.id });
      }

      clearCashierSession();
      setSession(null);
      return ensureSession();
    } catch (error) {
      if (error?.response?.status === 404) {
        clearCashierSession();
        setSession(null);
        return ensureSession();
      }

      setError(getErrorMessage(error, 'Не удалось обновить кассовый сеанс'));
      return null;
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [ensureSession, persistSession, session?.cashierUserId, session?.sessionId, user?.id]);

  const closeSession = useCallback(async () => {
    if (!session?.sessionId) {
      clearCashierSession();
      setSession(null);
      return { ok: true };
    }

    setLoading(true);
    setError('');

    try {
      await endSession(session.sessionId, { confirm: true });
      clearCashierSession();
      setSession(null);
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error, 'Не удалось завершить кассовый сеанс');
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [session?.sessionId]);

  return {
    session,
    sessionId: session?.sessionId || '',
    loading: loading || !ready,
    error,
    refreshSession,
    startSession: ensureSession,
    endSession: closeSession,
  };
}