const cleanDigits = (value?: string) => String(value || "").replace(/\D/g, "");

export const maskHorarioInput = (raw: string): string => {
  const digits = cleanDigits(raw).slice(0, 4);
  if (digits.length < 4) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
};

const validateDigitsLength = (digits: string): boolean => {
  if (!digits) return true;
  if (digits.length > 4) return false;
  const hourDigits = digits.slice(0, 2);
  if (hourDigits) {
    const hour = parseInt(hourDigits, 10);
    if (Number.isNaN(hour) || hour > 23) return false;
  }
  const minuteDigits = digits.slice(2);
  if (minuteDigits.length === 0) return true;
  if (minuteDigits.length === 1) {
    const tens = parseInt(minuteDigits, 10);
    return !Number.isNaN(tens) && tens >= 0 && tens <= 5;
  }
  if (minuteDigits.length === 2) {
    const minute = parseInt(minuteDigits, 10);
    return !Number.isNaN(minute) && minute <= 59;
  }
  return false;
}

export const isValidHorarioPartial = (masked: string): boolean => {
  const value = String(masked || "").trim();
  if (!value) return true;
  const digits = cleanDigits(value);
  return validateDigitsLength(digits);
};
