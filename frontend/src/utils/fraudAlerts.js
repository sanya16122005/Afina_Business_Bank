import * as signalR from '@microsoft/signalr';

const API_BASE = process.env.REACT_APP_API_URL || '';

function getStoredToken() {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

export function createFraudHubConnection() {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE}/hubs/fraud`, {
      accessTokenFactory: getStoredToken,
    })
    .withAutomaticReconnect()
    .build();
}

export function normalizeFraudAlert(alert) {
  if (!alert) return null;

  const account = alert.account || {};

  return {
    ...alert,
    alertId: alert.alertId || alert.id,
    status: alert.status || 'PendingReview',
    riskScore: Number(alert.riskScore ?? 0),
    accountNumber: alert.accountNumber || account.accountNumber || '—',
    ownerFullName: alert.ownerFullName || account.ownerFullName || account.ownerName || '—',
    triggerReason: alert.triggerReason || '',
    triggerReasonFull: alert.triggerReasonFull || alert.triggerReason || '',
    decision: alert.decision || '',
    resolvedBy: alert.resolvedBy || '',
    resolvedAt: alert.resolvedAt || null,
    comment: alert.comment || '',
  };
}

export function formatFraudRiskPercent(riskScore, fractionDigits = 1) {
  const numeric = Number(riskScore ?? 0);
  const clamped = Math.min(Math.max(numeric, 0), 0.999);
  //   — non-breaking space между числом и %, чтобы не сливалось
  // с соседним текстом и не переносилось на новую строку.
  return `${(clamped * 100).toLocaleString('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} %`;
}

export function getFraudRiskTone(riskScore) {
  const numeric = Number(riskScore ?? 0);
  if (numeric >= 0.8) return 'danger';
  if (numeric >= 0.5) return 'warning';
  return 'success';
}

export function upsertFraudAlert(list, alert) {
  const existing = list.find((item) => item.alertId === (alert?.alertId || alert?.id));
  const merged = existing && alert && typeof alert === 'object'
    ? {
        ...existing,
        ...alert,
        account: {
          ...(existing.account || {}),
          ...(alert.account || {}),
        },
      }
    : alert;

  const nextAlert = normalizeFraudAlert(merged);
  if (!nextAlert) return list;

  const withoutDuplicate = list.filter((item) => item.alertId !== nextAlert.alertId);
  return [nextAlert, ...withoutDuplicate].sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export function getFraudStatusLabel(status) {
  switch (status) {
    case 'PendingReview':
      return 'На проверке';
    case 'Resolved':
      return 'Решено';
    case 'Blocked':
      return 'Заблокировано';
    default:
      return status || '—';
  }
}

export function getFraudStatusTone(status) {
  switch (status) {
    case 'PendingReview':
      return 'warning';
    case 'Blocked':
      return 'danger';
    default:
      return 'success';
  }
}

export function getFraudDecision(action) {
  return action === 'block' ? 'Blocked' : 'Confirmed';
}