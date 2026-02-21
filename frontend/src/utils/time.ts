export const maskHorarioInput = (raw: string): string => {
  // Keep only numeric characters (max 4 digits representing HHMM)
  let digits = raw.replace(/\D/g, "").slice(0, 4);
  // if two or fewer digits, just return them (user still typing hour)
  if (digits.length <= 2) {
    return digits;
  }
  // insert colon between hour and minute portions
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
