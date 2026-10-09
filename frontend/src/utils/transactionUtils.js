export function getSignedTransactionAmount(transaction, accountRefs = []) {
  const amount = Number(transaction?.amount) || 0;

  if (transaction?.type === 'Deposit') return amount;
  if (transaction?.type === 'Withdrawal' || transaction?.type === 'Payment') return -amount;

  if (transaction?.type === 'Transfer') {
    if (transaction.direction === 'Outgoing' || transaction.isOutgoing === true) return -amount;
    if (transaction.direction === 'Incoming' || transaction.isIncoming === true) return amount;

    const ownedIds = new Set();
    const ownedAccountNumbers = new Set();

    accountRefs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'string') {
        ownedIds.add(ref);
        return;
      }

      if (ref.id) ownedIds.add(ref.id);
      if (ref.accountNumber) ownedAccountNumbers.add(ref.accountNumber);
    });

    const fromCandidates = [
      transaction.fromAccountId,
      transaction.fromAccount?.id,
      transaction.fromAccount?.accountId,
      transaction.fromAccount?.accountNumber,
      transaction.fromAccountNumber,
    ];
    const toCandidates = [
      transaction.toAccountId,
      transaction.toAccount?.id,
      transaction.toAccount?.accountId,
      transaction.toAccount?.accountNumber,
      transaction.toAccountNumber,
    ];

    const matchesOwnedAccount = (candidates) => candidates.some((candidate) => {
      if (!candidate) return false;
      return ownedIds.has(candidate) || ownedAccountNumbers.has(candidate);
    });

    if (matchesOwnedAccount(fromCandidates)) return -amount;
    if (matchesOwnedAccount(toCandidates)) return amount;

    if (fromCandidates.some(Boolean) && !toCandidates.some(Boolean)) return -amount;
    if (toCandidates.some(Boolean) && !fromCandidates.some(Boolean)) return amount;
  }

  return amount;
}

const STATUS_META = {
  Completed: {
    label: 'Выполнено',
    badge: 'success',
  },
  Pending: {
    label: 'В обработке',
    badge: 'warning',
    note: 'Ожидает проверки антифрода',
    noteTone: 'warning',
    noteKind: 'review',
  },
  PendingReview: {
    label: 'На проверке',
    badge: 'warning',
    note: 'Ожидает проверки антифрода',
    noteTone: 'warning',
    noteKind: 'review',
  },
  Blocked: {
    label: 'Заблокировано',
    badge: 'danger',
    note: 'Платёж заблокирован антифродом',
    noteTone: 'danger',
    noteKind: 'blocked',
  },
  Failed: {
    label: 'Ошибка',
    badge: 'danger',
  },
};

export function getTransactionStatusMeta(transaction) {
  const status = transaction?.status || 'Pending';
  const meta = STATUS_META[status] || { label: status, badge: 'gray' };

  return {
    status,
    label: meta.label,
    badge: meta.badge || 'gray',
    note: meta.note || '',
    noteTone: meta.noteTone || '',
    noteKind: meta.noteKind || '',
    isBlocked: status === 'Blocked',
    isReview: status === 'Pending' || status === 'PendingReview',
  };
}