export const maskHorarioInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  return digits;
};

export const isValidHorarioPartial = (masked: string): boolean => {
  if (!masked) return true;

  if (!masked.includes(":")) {
    if (masked.length === 1) return true;
    if (masked.length === 2) {
      const hour = parseInt(masked, 10);
      return !Number.isNaN(hour) && hour <= 23;
    }
    return false;
  }

  const [hh, mm] = masked.split(":");
  if (hh.length === 2) {
    const hour = parseInt(hh, 10);
    if (Number.isNaN(hour) || hour > 23) return false;
  }

  if (!mm) return true;
  if (mm.length === 1) {
    const tens = parseInt(mm, 10);
    return !Number.isNaN(tens) && tens <= 5;
  }
  if (mm.length === 2) {
    const minute = parseInt(mm, 10);
    return !Number.isNaN(minute) && minute <= 59;
  }
  return false;
};
