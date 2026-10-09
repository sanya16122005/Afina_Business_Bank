import { ArrowRightLeft, ArrowDownLeft, ArrowUpRight, ShoppingBag, TrendingUp } from 'lucide-react';

export const CURRENCY_SYMBOL = { RUB: '₽', USD: '$', EUR: '€' };

export const ACCOUNT_TYPE_LABEL = { Checking: 'Расчётный', Savings: 'Сберегательный' };
export const ACCOUNT_SUBTYPE_LABEL = { Debit: 'Дебетовый', Credit: 'Кредитный' };

export const ACCOUNT_STATUS_TONE = { Active: 'success', Frozen: 'warning', Closed: 'danger' };
export const ACCOUNT_STATUS_LABEL = { Active: 'Активен', Frozen: 'Заморожен', Closed: 'Закрыт' };

export const TRANSACTION_TYPE_ICON = {
  Transfer: ArrowRightLeft,
  Interest: TrendingUp,
  Deposit: ArrowDownLeft,
  Withdrawal: ArrowUpRight,
  Payment: ShoppingBag,
};

export const TRANSACTION_TYPE_LABEL = {
  Interest: 'Начисление %',
  Transfer: 'Перевод',
  Deposit: 'Пополнение',
  Withdrawal: 'Снятие',
  Payment: 'Оплата',
};

export function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOL[currency] || currency || '';
}
