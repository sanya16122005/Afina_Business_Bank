// Единая телефонная маска для всех форм (регистрация, профиль, кассир),
// чтобы не дублировать одинаковую логику по страницам.

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Ввод → маска вида «+7 (900) 123-45-67».
export function formatPhoneInput(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';

  const normalized = digits.startsWith('8')
    ? `7${digits.slice(1)}`
    : digits.startsWith('7')
      ? digits
      : `7${digits}`;

  const trimmed = normalized.slice(0, 11);
  const area = trimmed.slice(1, 4);
  const firstPart = trimmed.slice(4, 7);
  const secondPart = trimmed.slice(7, 9);
  const thirdPart = trimmed.slice(9, 11);

  let result = '+7';

  if (trimmed.length > 1) result += ` (${area}`;
  if (trimmed.length >= 4) result += ')';
  if (trimmed.length > 4) result += ` ${firstPart}`;
  if (trimmed.length > 7) result += `-${secondPart}`;
  if (trimmed.length > 9) result += `-${thirdPart}`;

  return result;
}

// Маска → формат для API «+7XXXXXXXXXX».
export function normalizePhoneForApi(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.startsWith('7')) {
    return `+${digits.slice(0, 11)}`;
  }
  return `+${digits.slice(0, 15)}`;
}
