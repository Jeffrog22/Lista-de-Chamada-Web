export type CalendarEventType = "feriado" | "ponte" | "reuniao" | "evento";

export interface AcademicCalendarSettings {
  schoolYear: number;
  inicioAulas: string;
  feriasInvernoInicio: string;
  feriasInvernoFim: string;
  terminoAulas: string;
}

export interface AcademicCalendarEvent {
  id: string;
  date: string;
  type: CalendarEventType;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  description?: string;
  teacher?: string;
}

const toDateOnly = (value?: string) => {
  if (!value) return "";
  return String(value).split("T")[0];
};

const toMinutes = (time?: string) => {
  const raw = String(time || "").trim();
  if (!raw) return null;
  const [h, m] = raw.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const normalizeHorario = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes(":")) {
    const [hh, mm] = raw.split(":");
    return `${String(hh || "").padStart(2, "0").slice(0, 2)}:${String(mm || "").padStart(2, "0").slice(0, 2)}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return raw;
};

export const isWithinRange = (date: string, start?: string, end?: string) => {
  const d = toDateOnly(date);
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (!d || !s || !e) return false;
  return d >= s && d <= e;
};

export const isRecessoByPeriods = (date: string, settings?: AcademicCalendarSettings | null) => {
  if (!settings) return false;
  const d = toDateOnly(date);
  if (!d) return false;

  const inicio = toDateOnly(settings.inicioAulas);
  const termino = toDateOnly(settings.terminoAulas);

  if (inicio && d < inicio) return true;
  if (termino && d > termino) return true;
  if (isWithinRange(d, settings.feriasInvernoInicio, settings.feriasInvernoFim)) return true;
  return false;
};

export const getEventsForDate = (date: string, events: AcademicCalendarEvent[]) => {
  const d = toDateOnly(date);
  return events.filter((event) => toDateOnly(event.date) === d);
};

export const isDateClosedForAttendance = (date: string, settings: AcademicCalendarSettings | null, events: AcademicCalendarEvent[]) => {
  if (isRecessoByPeriods(date, settings)) return true;
  const dayEvents = getEventsForDate(date, events);
  return dayEvents.some((event) => {
    if (event.type === "feriado" || event.type === "ponte") return true;
    if (event.type === "reuniao" && event.allDay) return true;
    return false;
  });
};

export const isClassBlockedByEventPeriod = (
  date: string,
  classHorario: string,
  events: AcademicCalendarEvent[]
) => {
  const horario = normalizeHorario(classHorario);
  const classStart = toMinutes(horario);
  if (classStart === null) return false;

  const dayEvents = getEventsForDate(date, events);
  return dayEvents.some((event) => {
    if (event.type !== "reuniao") return false;
    if (event.allDay) return true;

    const eventStart = toMinutes(event.startTime);
    const eventEnd = toMinutes(event.endTime);
    if (eventStart === null || eventEnd === null) return false;
    return classStart >= eventStart && classStart < eventEnd;
  });
};
