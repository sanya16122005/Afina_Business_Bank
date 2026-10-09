const STORAGE_KEY = 'afina_cashier_session';

function safeRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key, value) {
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

export function readCashierSession() {
  const raw = safeRead(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    clearCashierSession();
    return null;
  }
}

export function writeCashierSession(session) {
  if (!session?.sessionId) {
    clearCashierSession();
    return null;
  }

  const normalized = {
    ...session,
    sessionId: String(session.sessionId),
    status: session.status || 'Active',
    cashierFullName: session.cashierFullName || '',
  };

  safeWrite(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearCashierSession() {
  safeWrite(STORAGE_KEY, null);
}

export function normalizeCashierSession(payload) {
  if (!payload) return null;

  return writeCashierSession({
    sessionId: payload.sessionId || payload.id,
    cashierUserId: payload.cashierUserId || payload.userId || null,
    cashierFullName: payload.cashierFullName || '',
    startedAt: payload.startedAt || null,
    endedAt: payload.endedAt || null,
    status: payload.status || 'Active',
    statusPanel: payload.statusPanel || null,
    totalSystemBalance: payload.totalSystemBalance || payload.statusPanel?.totalSystemBalance || null,
    totalDepositsCurrentSession:
      payload.totalDepositsCurrentSession ?? payload.statusPanel?.totalDepositsCurrentSession ?? 0,
    totalWithdrawalsCurrentSession:
      payload.totalWithdrawalsCurrentSession ?? payload.statusPanel?.totalWithdrawalsCurrentSession ?? 0,
    txCount: payload.txCount ?? payload.statusPanel?.txCount ?? 0,
    finalStatistics: payload.finalStatistics || null,
    statistics: payload.statistics || null,
  });
}

export function getCashierSessionSummary(session) {
  return session?.statusPanel || session?.statistics || {
    totalSystemBalance: session?.totalSystemBalance || { RUB: 0, USD: 0, EUR: 0 },
    totalDepositsCurrentSession: session?.totalDepositsCurrentSession ?? 0,
    totalWithdrawalsCurrentSession: session?.totalWithdrawalsCurrentSession ?? 0,
    txCount: session?.txCount ?? 0,
  };
}