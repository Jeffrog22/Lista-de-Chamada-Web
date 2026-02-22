const cleanDigits = (value?: string) => String(value || "").replace(/\D/g, "");

export const maskHorarioInput = (raw: string): string => {
  const digits = cleanDigits(raw).slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  const normalized = digits.length === 3 ? `0${digits}` : digits;
  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
};

export const isValidHorarioPartial = (masked: string): boolean => {
  const value = String(masked || "").trim();
  if (!value) return true;

  if (!value.includes(":")) {
    if (value.length === 1) {
      return /^\d$/.test(value);
    }
    if (value.length === 2) {
      const hour = parseInt(value, 10);
      return !Number.isNaN(hour) && hour >= 0 && hour <= 23;
    }
    return false;
  }

  const [rawHour, rawMinute] = value.split(":");
  const hourPart = cleanDigits(rawHour);
  if (hourPart.length > 0) {
    if (hourPart.length > 2) return false;
    const hour = parseInt(hourPart, 10);
    if (Number.isNaN(hour) || hour > 23) return false;
  }

  if (!rawMinute) return true;
  const minutePart = cleanDigits(rawMinute);
  if (minutePart.length === 0) return true;
  if (minutePart.length === 1) {
    const tens = parseInt(minutePart, 10);
    return !Number.isNaN(tens) && tens >= 0 && tens <= 5;
  }
  if (minutePart.length === 2) {
    const minute = parseInt(minutePart, 10);
    return !Number.isNaN(minute) && minute >= 0 && minute <= 59;
  }
  return false;
};
