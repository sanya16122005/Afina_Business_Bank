export const ACCOUNT_DESIGN_OPTIONS = [
  {
    value: 'classic',
    label: 'Классический',
    description: 'Peach gradient — базовый брендовый стиль',
    sampleNumber: '101-4370 8387 81',
  },
  {
    value: 'white',
    label: 'Белый минимализм',
    description: 'Светлая карточка с мягким акцентом',
    sampleNumber: '101-2458 1133 90',
  },
  {
    value: 'virtual',
    label: 'Виртуальный',
    description: 'Frosted peach — более лёгкий стеклянный вариант',
    sampleNumber: '102-8844 0019 74',
  },
  {
    value: 'dual',
    label: 'Двухтональный',
    description: 'Контрастная карта с двумя цветами и сильным акцентом',
    sampleNumber: '103-2918 4477 05',
  },
  {
    value: 'premium',
    label: 'Премиум',
    description: 'Строгая премиальная карта с металлическим акцентом',
    sampleNumber: '104-9218 4477 05',
  },
];

const ACCOUNT_DESIGN_MAP = ACCOUNT_DESIGN_OPTIONS.reduce((map, option) => {
  map[option.value] = option;
  return map;
}, {});

export function getDefaultAccountDesign(accountType, subType) {
  if (accountType === 'Savings') return 'virtual';
  if (subType === 'Credit') return 'white';
  return 'classic';
}

export function resolveAccountDesign(account) {
  const design = account?.cardDesign;
  if (design && ACCOUNT_DESIGN_MAP[design]) return design;
  return getDefaultAccountDesign(account?.accountType, account?.subType);
}

export function getAccountDesignLabel(design) {
  return ACCOUNT_DESIGN_MAP[design]?.label || ACCOUNT_DESIGN_MAP[getDefaultAccountDesign()]?.label || 'Классический';
}

export function getAccountCardClass(account) {
  return `account-card account-card--${resolveAccountDesign(account)}`;
}

export function formatAccountCardNumber(accountNumber) {
  const raw = String(accountNumber || '').trim();
  if (!raw) return '—';

  if (raw.includes('-')) {
    const [prefix, suffix = ''] = raw.split('-');
    const groupedSuffix = suffix.match(/.{1,4}/g)?.join(' ') || suffix;
    return groupedSuffix ? `${prefix}-${groupedSuffix}` : prefix;
  }

  const digitsOnly = raw.replace(/\s+/g, '');
  if (/^\d+$/.test(digitsOnly)) {
    return digitsOnly.match(/.{1,4}/g)?.join(' ') || digitsOnly;
  }

  return raw;
}
