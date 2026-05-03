import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  deleteAcademicCalendarEvent,
  downloadChamadaPdfReport,
  downloadMultiClassExcelReport,
  downloadVacanciesExcelReport,
  downloadVacanciesPdfReport,
  getAcademicCalendar,
  getBootstrap,
  getExcludedStudents,
  getPlanningFiles,
  getReports,
  getStatistics,
  getWeather,
  saveAcademicCalendarEvent,
  saveAcademicCalendarSettings,
  savePlanningFile,
  deletePlanningFile,
} from "../api";
import {
  isDateClosedForAttendance,
  isWithinRange,
} from "../utils/academicCalendar";
import { subscribeLocalStorageKeys } from "../utils/localStorageEvents";
import type { AcademicCalendarEvent, AcademicCalendarSettings } from "../utils/academicCalendar";
import "./Reports.css";
const DashboardCharts = React.lazy(() => import('./DashboardCharts'));

class ReportsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="reports-section placeholder">
          O bloco de gráficos encontrou um erro de renderização. Recarregue a página.
        </div>
      );
    }
    return this.props.children;
  }
}

interface StudentStats {
  id: string;
  studentUid?: string;
  nome: string;
  presencas: number;
  faltas: number;
  justificativas: number;
  frequencia: number; // %
  historico: { [date: string]: string }; // "c", "f", "j", ""
  anotacoes?: string;
}

interface ClassStats {
  turmaCodigo?: string;
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  hasLog?: boolean;
  alunos: StudentStats[];
}

interface ActiveStudentLite {
  id?: string;
  studentUid?: string;
  nome?: string;
  grupo?: string;
  turma?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  nivel?: string;
  whatsapp?: string;
  dataNascimento?: string;
  dataAtestado?: string;
  parQ?: string;
  atestado?: boolean;
}

// Statistics types (frontend)
interface LevelHistory {
  nivel: string;
  firstDate?: string | null;
  lastDate?: string | null;
  days: number;
  presencas: number;
  faltas: number;
  justificativas: number;
  frequencia: number;
}

interface StudentStatistics {
  id?: string | null;
  nome: string;
  firstPresence?: string | null;
  lastPresence?: string | null;
  exclusionDate?: string | null;
  retentionDays: number;
  currentNivel?: string | null;
  levels: LevelHistory[];
}

interface BootstrapClassLite {
  grupo: string;
  codigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  nivel: string;
  capacidade: number;
  diasSemana?: string;
}

interface ExclusionLite {
  id?: string;
  student_uid?: string;
  studentUid?: string;
  nome?: string;
  Nome?: string;
  turma?: string;
  Turma?: string;
  turmaLabel?: string;
  TurmaLabel?: string;
  turmaCodigo?: string;
  TurmaCodigo?: string;
  grupo?: string;
  Grupo?: string;
  horario?: string;
  Horario?: string;
  professor?: string;
  Professor?: string;
}

const safeParseArray = <T,>(raw: string | null): T[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const toFiniteNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const exclusionMergeKey = (item: ExclusionLite) => {
  const uid = String(item?.student_uid || item?.studentUid || "").trim();
  if (uid) return `uid:${uid}`;
  const id = String(item?.id || "").trim();
  if (id) return `id:${id}`;
  const name = normalizeText(String(item?.nome || item?.Nome || ""));
  const turma = normalizeText(
    String(item?.turma || item?.Turma || item?.turmaLabel || item?.TurmaLabel || item?.grupo || item?.Grupo || item?.turmaCodigo || item?.TurmaCodigo || "")
  );
  const horario = normalizeHorarioSelectionKey(String(item?.horario || item?.Horario || ""));
  const professor = normalizeText(String(item?.professor || item?.Professor || ""));
  return `ctx:${name}|${turma}|${horario}|${professor}`;
};

const readLocalVacancySnapshot = () => {
  const localStudentsRaw = safeParseArray<any>(localStorage.getItem("activeStudents"));
  const localClassesRaw = safeParseArray<any>(localStorage.getItem("activeClasses"));
  const localExcludedRaw = safeParseArray<any>(localStorage.getItem("excludedStudents"));

  const students: ActiveStudentLite[] = localStudentsRaw.map((student) => ({
    id: String(student?.id || ""),
    studentUid: String(student?.studentUid || student?.student_uid || ""),
    nome: String(student?.nome || ""),
    turma: String(student?.turma || student?.turmaLabel || ""),
    turmaCodigo: String(student?.turmaCodigo || student?.grupo || ""),
    grupo: String(student?.grupo || student?.turmaCodigo || ""),
    horario: String(student?.horario || ""),
    professor: String(student?.professor || ""),
    nivel: String(student?.nivel || ""),
    whatsapp: String(student?.whatsapp || ""),
    dataNascimento: String(student?.dataNascimento || student?.data_nascimento || ""),
    dataAtestado: String(student?.dataAtestado || student?.data_atestado || ""),
    parQ: String(student?.parQ || student?.parq || ""),
    atestado: Boolean(student?.atestado),
  }));

  const classes: BootstrapClassLite[] = localClassesRaw.map((cls) => ({
    grupo: String(cls?.Grupo || cls?.grupo || cls?.TurmaCodigo || cls?.turmaCodigo || cls?.Atalho || cls?.codigo || ""),
    codigo: String(cls?.Atalho || cls?.codigo || cls?.TurmaCodigo || cls?.turmaCodigo || ""),
    turmaLabel: String(cls?.Turma || cls?.turmaLabel || cls?.turma || cls?.codigo || ""),
    horario: String(cls?.Horario || cls?.horario || ""),
    professor: String(cls?.Professor || cls?.professor || ""),
    nivel: String(cls?.Nivel || cls?.nivel || ""),
    capacidade: toFiniteNumber(cls?.CapacidadeMaxima ?? cls?.Capacidade ?? cls?.capacidade ?? 0),
    diasSemana: String(cls?.DiasSemana || cls?.dias_semana || cls?.diasSemana || ""),
  }));

  const exclusions = localExcludedRaw as ExclusionLite[];

  return { students, classes, exclusions };
};

interface CalendarEventForm {
  date: string;
  type: "feriado" | "ponte" | "reuniao" | "evento";
  allDay: boolean;
  startTime: string;
  endTime: string;
  description: string;
}

interface SummaryLessonsByHorario {
  horario: string;
  previstas: number;
  registradas: number;
}

interface WeatherSnapshot {
  temp: string;
  condition: string;
}

interface WeatherCacheRecord extends WeatherSnapshot {
  cacheVersion: string;
  cachedAt: number;
}

type PlanningBlockType = "month" | "week" | "date" | "general";

interface PlanningBlock {
  id: string;
  type: PlanningBlockType;
  key: string;
  label: string;
  text: string;
  month?: string;
  week?: number;
  startDay?: number;
  endDay?: number;
}

interface PlanningFileData {
  id: string;
  sourceName: string;
  target: string;
  year: number;
  blocks: PlanningBlock[];
  createdAt: string;
}

interface PlanningStore {
  files: PlanningFileData[];
}

const REPORTS_WEATHER_CACHE_VERSION = "cptec-v1";
const REPORTS_WEATHER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const PLANNING_STORAGE_KEY = "reports:planning:v1";

if (!(pdfjsLib as any).GlobalWorkerOptions?.workerSrc) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

const normalizeHorarioSelectionKey = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 3) return `0${digits}`;
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
};

const classSelectionKey = (item: Pick<ClassStats, "turma" | "horario" | "professor" | "turmaCodigo">) =>
  `${normalizeText(item.turmaCodigo || "")}||${normalizeText(item.turma)}||${normalizeHorarioSelectionKey(item.horario)}||${normalizeText(item.professor)}`;

const bootstrapClassSelectionKey = (item: Pick<BootstrapClassLite, "turmaLabel" | "horario" | "professor">) =>
  `${normalizeText(item.turmaLabel)}||${normalizeHorarioSelectionKey(item.horario)}||${normalizeText(item.professor)}`;

const normalizeText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toTitleCase = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/g)
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
};

const formatFileNameSentenceCase = (fileName: string) => {
  const trimmed = String(fileName || "").trim();
  if (!trimmed) return trimmed;
  const lastDot = trimmed.lastIndexOf(".");
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const extension = lastDot > 0 ? trimmed.slice(lastDot) : "";
  const normalizedBase = base.toLowerCase();
  const sentenceBase = normalizedBase
    ? `${normalizedBase.charAt(0).toUpperCase()}${normalizedBase.slice(1)}`
    : normalizedBase;
  return `${sentenceBase}${extension}`;
};

const normalizeTargetKey = (value: string) =>
  normalizeText(value || "").replace(/\s+/g, "");

const extractProfileFromTarget = (value: string) => {
  let trimmed = String(value || "").trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/^planejamento\s+/i, "");
  trimmed = trimmed.replace(/\s+-\s+/g, " ");
  trimmed = trimmed.replace(/\b20\d{2}\b.*$/i, "");
  trimmed = trimmed.replace(/\s+/g, " ").trim();
  return trimmed;
};

const formatPlanningTargetForDisplay = (value: string) => {
  const trimmed = String(value || "").trim();
  const profile = extractProfileFromTarget(trimmed);
  if (profile) return toTitleCase(profile);
  if (!trimmed) return trimmed;
  return toTitleCase(trimmed);
};

const isWeatherAlertCondition = (condition: string) => {
  const normalized = normalizeText(condition);
  return ["chuv", "temporal", "tempest", "trovo", "frio", "vento"].some((keyword) =>
    normalized.includes(keyword)
  );
};

const getWeatherIcon = (condition: string) => {
  const normalized = normalizeText(condition);
  if (!normalized) return "☁️";
  if (normalized.includes("temporal") || normalized.includes("tempest") || normalized.includes("trovo")) return "⛈️";
  if (normalized.includes("chuv")) return "🌧️";
  if (normalized.includes("sol")) return "☀️";
  if (normalized.includes("parcial")) return "⛅";
  if (normalized.includes("nublado")) return "☁️";
  if (normalized.includes("vento")) return "💨";
  if (normalized.includes("frio")) return "🥶";
  return "🌡️";
};

const weatherCacheKey = (date: string) => `reportsClimaCache:${date}`;

const getWeatherCache = (date: string): WeatherSnapshot | null => {
  try {
    const raw = localStorage.getItem(weatherCacheKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WeatherCacheRecord>;
    if (!parsed || typeof parsed !== "object") return null;
    if (String(parsed.cacheVersion || "") !== REPORTS_WEATHER_CACHE_VERSION) return null;
    const cachedAt = Number(parsed.cachedAt || 0);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > REPORTS_WEATHER_CACHE_TTL_MS) return null;
    if (!parsed.temp || !parsed.condition) return null;
    return {
      temp: String(parsed.temp),
      condition: String(parsed.condition),
    };
  } catch {
    return null;
  }
};

const setWeatherCache = (date: string, snapshot: WeatherSnapshot) => {
  const record: WeatherCacheRecord = {
    ...snapshot,
    cacheVersion: REPORTS_WEATHER_CACHE_VERSION,
    cachedAt: Date.now(),
  };
  localStorage.setItem(weatherCacheKey(date), JSON.stringify(record));
};

const fetchWeatherSnapshot = async (dateKey: string) => {
  try {
    const response = await getWeather(dateKey);
    const payload = (response?.data || {}) as Partial<WeatherSnapshot>;
    const snapshot: WeatherSnapshot = {
      temp: String(payload.temp || "26"),
      condition: String(payload.condition || "Parcialmente Nublado"),
    };
    setWeatherCache(dateKey, snapshot);
    return { dateKey, snapshot };
  } catch {
    return {
      dateKey,
      snapshot: {
        temp: "-",
        condition: "Indisponível",
      },
    };
  }
};

const fetchWeatherWithConcurrency = async (dates: string[], limit: number) => {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results: Array<{ dateKey: string; snapshot: WeatherSnapshot }> = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < dates.length) {
      const current = dates[cursor];
      cursor += 1;
      const entry = await fetchWeatherSnapshot(current);
      results.push(entry);
    }
  };

  const workers = Array.from(
    { length: Math.min(safeLimit, dates.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
};

const getSummaryScheduleGroup = (turmaLabel: string): "terca-quinta" | "quarta-sexta" | "outros" => {
  const normalized = normalizeText(turmaLabel);
  if (normalized.includes("terca") && normalized.includes("quinta")) return "terca-quinta";
  if (normalized.includes("quarta") && normalized.includes("sexta")) return "quarta-sexta";
  return "outros";
};

const weekdaysBySummaryGroup: Record<string, number[]> = {
  "terca-quinta": [2, 4],
  "quarta-sexta": [3, 5],
};

const getSummaryGroupFromWeekdays = (weekdays: number[]): "terca-quinta" | "quarta-sexta" | "outros" => {
  const normalized = Array.from(new Set(weekdays)).sort((a, b) => a - b);
  const signature = normalized.join(",");
  if (signature === "2,4") return "terca-quinta";
  if (signature === "3,5") return "quarta-sexta";
  return "outros";
};

const parseWeekdaysFromDiasSemana = (value: string): number[] => {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (!normalized) return [];

  const isTq =
    normalized.includes("tq") ||
    (normalized.includes("terca") && normalized.includes("quinta")) ||
    (normalized.includes("ter") && normalized.includes("qui"));

  const isQs =
    normalized.includes("qs") ||
    (normalized.includes("quarta") && normalized.includes("sexta")) ||
    (normalized.includes("qua") && normalized.includes("sex"));

  if (isTq) return [2, 4];
  if (isQs) return [3, 5];
  return [];
};

const resolveScheduleGroupForVacancy = (diasSemana: string, turmaLabel: string): "terca-quinta" | "quarta-sexta" | "outros" => {
  const weekdays = parseWeekdaysFromDiasSemana(diasSemana);
  if (weekdays.length > 0) {
    return getSummaryGroupFromWeekdays(weekdays);
  }
  return getSummaryScheduleGroup(turmaLabel);
};

const scheduleGroupLabel: Record<"terca-quinta" | "quarta-sexta" | "outros", string> = {
  "terca-quinta": "Ter/Qui",
  "quarta-sexta": "Qua/Sex",
  outros: "Outros",
};

const parseHistoricoDayToDate = (rawDay: string, selectedYear: number, selectedMonthIndex: number) => {
  const raw = String(rawDay || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/").map(Number);
    const parsed = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{1,2}$/.test(raw)) {
    const day = Number(raw);
    const parsed = new Date(selectedYear, selectedMonthIndex, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const normalizeReportsData = (payload: unknown): ClassStats[] => {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => {
    const record = (item || {}) as Record<string, unknown>;
    const alunosRaw = Array.isArray(record.alunos) ? (record.alunos as unknown[]) : [];
    const alunos: StudentStats[] = alunosRaw.map((student) => {
      const st = (student || {}) as Record<string, unknown>;
      const historicoRaw = st.historico && typeof st.historico === "object" ? (st.historico as Record<string, unknown>) : {};
      const historico = Object.fromEntries(
        Object.entries(historicoRaw)
          .map(([day, status]) => [String(day || "").trim(), String(status || "").trim().toLowerCase()])
          .filter(([day, status]) => Boolean(day) && ["c", "f", "j", ""].includes(status))
      ) as Record<string, string>;
      return {
        id: String(st.id || ""),
        studentUid: st.student_uid ? String(st.student_uid) : st.studentUid ? String(st.studentUid) : undefined,
        nome: String(st.nome || ""),
        presencas: Number(st.presencas || 0),
        faltas: Number(st.faltas || 0),
        justificativas: Number(st.justificativas || 0),
        frequencia: Number(st.frequencia || 0),
        historico,
        anotacoes: st.anotacoes ? String(st.anotacoes) : undefined,
      };
    });

    return {
      turmaCodigo: String(record.turmaCodigo || record.turma_codigo || record.codigo || ""),
      turma: String(record.turma || ""),
      horario: String(record.horario || ""),
      professor: String(record.professor || ""),
      nivel: String(record.nivel || ""),
      hasLog: Boolean(record.hasLog),
      alunos,
    };
  });
};

const monthRange = (month: string) => {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return { first, last };
};

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getCurrentLocalDateKey = () => toDateKey(new Date());

const getWeekOfMonth = (date: Date) => Math.floor((date.getDate() - 1) / 7) + 1;

const monthNameToNumber: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

const normalizeParserText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const parseHeaderTargetYear = (lines: string[], sourceName: string, defaultYear: number) => {
  const firstLines = lines.slice(0, Math.min(12, lines.length));
  const sourceFallback = sourceName.replace(/\.[^.]+$/, "").trim() || "Geral";
  let target = sourceFallback;
  let year = defaultYear;

  for (const line of firstLines) {
    const clean = String(line || "").trim();
    if (!clean) continue;
    const fullMatch = clean.match(/planejamento\s+(.+?)\s+(20\d{2})/i);
    if (fullMatch) {
      target = fullMatch[1].replace(/[:\-–]+$/g, "").trim() || sourceFallback;
      year = Number(fullMatch[2]);
      return { target, year };
    }

    const onlyTargetMatch = clean.match(/planejamento\s+(.+)$/i);
    if (onlyTargetMatch && !/\b20\d{2}\b/.test(clean)) {
      const parsedTarget = onlyTargetMatch[1].replace(/[:\-–]+$/g, "").trim();
      if (parsedTarget) target = parsedTarget;
    }

    const yearMatch = clean.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      year = Number(yearMatch[1]);
    }
  }

  return { target, year };
};

const parseOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizePlanningBlocks = (value: unknown): PlanningBlock[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((block): block is Record<string, unknown> => Boolean(block))
    .map((block) => ({
      id: String(block.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      type: (String(block.type || "general") as PlanningBlockType),
      key: String(block.key || ""),
      label: String(block.label || ""),
      text: String(block.text || ""),
      month: block.month ? String(block.month) : undefined,
      week: parseOptionalNumber(block.week),
      startDay: parseOptionalNumber(block.startDay),
      endDay: parseOptionalNumber(block.endDay),
    }));
};

const parseMonthTransitionFromLabel = (label: string) => {
  const tokens = String(label || "").match(/\b\d{1,2}\/(\d{1,2})(?:\/20\d{2})?\b/g) || [];
  if (tokens.length < 2) return null as { startMonth: string; endMonth: string } | null;

  const extractMonth = (token: string) => {
    const parts = token.split("/");
    if (parts.length < 2) return "";
    const month = Number(parts[1]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return "";
    return String(month).padStart(2, "0");
  };

  const startMonth = extractMonth(tokens[0] || "");
  const endMonth = extractMonth(tokens[1] || "");
  if (!startMonth || !endMonth || startMonth === endMonth) return null;
  return { startMonth, endMonth };
};

const inferBlockYearFromKey = (key: string, fallbackYear: number) => {
  const match = String(key || "").match(/^(20\d{2})-/);
  if (!match) return fallbackYear;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : fallbackYear;
};

const normalizeLegacyWeekLikeDateBlock = (block: PlanningBlock, fileYear: number): PlanningBlock => {
  if (block.type !== "date") return block;
  const normalizedLabel = normalizeParserText(block.label || "");
  if (!/\bsem/.test(normalizedLabel)) return block;

  const weekMatch = normalizedLabel.match(/(\d{1,2})\s*(?:a|ª)?\s*sem(?:ana)?\b|sem(?:ana)?\s*(\d{1,2})\b/);
  const parsedWeek = weekMatch ? Number(weekMatch[1] || weekMatch[2]) : undefined;

  const explicitDateTokens = String(block.label || "").match(/\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g) || [];
  let startDay: number | undefined;
  let endDay: number | undefined;
  let resolvedMonth = String(block.month || "").padStart(2, "0");
  let resolvedYear = inferBlockYearFromKey(block.key, fileYear);

  if (explicitDateTokens.length >= 2) {
    const startParts = (explicitDateTokens[0] || "").split("/").map(Number);
    const endParts = (explicitDateTokens[1] || "").split("/").map(Number);
    if (startParts.length >= 2 && endParts.length >= 2) {
      startDay = Number(startParts[0]);
      endDay = Number(endParts[0]);
      resolvedMonth = String(Number(endParts[1])).padStart(2, "0");
      if (endParts[2]) resolvedYear = Number(endParts[2]);
    }
  } else if (explicitDateTokens.length === 1) {
    const tokenParts = explicitDateTokens[0].split("/").map(Number);
    const rangePrefix = normalizedLabel.match(/(?:de\s+)?(\d{1,2})\s*(?:a|-|ate)\s*(\d{1,2})\//i);
    if (tokenParts.length >= 2) {
      endDay = Number(tokenParts[0]);
      resolvedMonth = String(Number(tokenParts[1])).padStart(2, "0");
      startDay = rangePrefix ? Number(rangePrefix[1]) : undefined;
      if (tokenParts[2]) resolvedYear = Number(tokenParts[2]);
    }
  }

  if (
    !Number.isFinite(Number(parsedWeek)) ||
    !Number.isFinite(Number(startDay)) ||
    !Number.isFinite(Number(endDay)) ||
    !resolvedMonth
  ) {
    return block;
  }

  const cleanedText = String(block.text || "")
    .replace(
      /^(?:de\s+)?\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\s*(?:a|-|ate)\s*\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\s*/i,
      ""
    )
    .trim()
    .replace(/^[:\-–]+\s*/, "");

  return {
    ...block,
    type: "week",
    month: resolvedMonth,
    week: Number(parsedWeek),
    startDay: Number(startDay),
    endDay: Number(endDay),
    key: `${resolvedYear}-${resolvedMonth}-sem-${Number(parsedWeek)}`,
    text: cleanedText,
  };
};

const normalizeLegacyPlanningTransitions = (file: PlanningFileData): PlanningFileData => {
  const normalizedBlocks = [...(file.blocks || [])].map((block) =>
    normalizeLegacyWeekLikeDateBlock(block, Number(file.year || new Date().getFullYear()))
  );
  let transitionContext: { startMonth: string; endMonth: string } | null = null;

  for (let index = 0; index < normalizedBlocks.length; index += 1) {
    const block = normalizedBlocks[index];
    const transition = parseMonthTransitionFromLabel(block.label || "");

    if (block.type === "month") {
      transitionContext = null;
      continue;
    }

    if (transition) {
      transitionContext = transition;

      if (block.type === "week") {
        const nextYear = inferBlockYearFromKey(block.key, Number(file.year || new Date().getFullYear()));
        const nextMonth = transition.endMonth;
        normalizedBlocks[index] = {
          ...block,
          month: nextMonth,
          key: typeof block.week === "number" ? `${nextYear}-${nextMonth}-sem-${block.week}` : block.key,
        };
      }
      continue;
    }

    if (block.type !== "week" || !transitionContext) {
      continue;
    }

    const blockMonth = String(block.month || "").padStart(2, "0");
    const transitionStartMonth = String(transitionContext.startMonth || "").padStart(2, "0");
    const transitionEndMonth = String(transitionContext.endMonth || "").padStart(2, "0");

    if (!blockMonth || blockMonth === transitionEndMonth) {
      transitionContext = null;
      continue;
    }

    if (blockMonth !== transitionStartMonth) {
      transitionContext = null;
      continue;
    }

    const nextYear = inferBlockYearFromKey(block.key, Number(file.year || new Date().getFullYear()));
    normalizedBlocks[index] = {
      ...block,
      month: transitionEndMonth,
      key:
        typeof block.week === "number"
          ? `${nextYear}-${transitionEndMonth}-sem-${block.week}`
          : block.key,
    };

    const upcoming = normalizedBlocks[index + 1];
    if (!upcoming || upcoming.type !== "week") {
      transitionContext = null;
    }
  }

  // Keep only one block per effective week key to avoid duplicated week cards.
  const dedupedBlocks: PlanningBlock[] = [];
  const seenWeekKeys = new Set<string>();
  normalizedBlocks.forEach((block) => {
    if (block.type !== "week") {
      dedupedBlocks.push(block);
      return;
    }

    const effectiveKey = String(block.key || "").trim();
    if (!effectiveKey) {
      dedupedBlocks.push(block);
      return;
    }

    if (seenWeekKeys.has(effectiveKey)) {
      return;
    }

    seenWeekKeys.add(effectiveKey);
    dedupedBlocks.push(block);
  });

  return {
    ...file,
    blocks: dedupedBlocks,
  };
};

const normalizePlanningFiles = (payload: unknown): PlanningFileData[] => {
  if (!Array.isArray(payload)) return [];
  const normalized = payload
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .map((record) => ({
      id: String(record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      sourceName: String(record.sourceName || ""),
      target: String(record.target || ""),
      year: Number(record.year || new Date().getFullYear()),
      blocks: normalizePlanningBlocks(record.blocks),
      createdAt: String(record.createdAt || new Date().toISOString()),
    }))
    .map((file) => normalizeLegacyPlanningTransitions(file))
    .filter((file) => file.sourceName);

  return normalized.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
};

const detectMonthFromLine = (line: string): string | null => {
  const normalized = normalizeParserText(line);
  for (const [name, monthNumber] of Object.entries(monthNameToNumber)) {
    if (normalized.includes(name)) return monthNumber;
  }
  return null;
};

const normalizePlanningLineSpacing = (line: string) => {
  let next = String(line || "").replace(/\s{2,}/g, " ").trim();
  next = next.replace(/(^|[\s:/-])([A-ZÀ-Ý])\s+([a-zà-ÿ]{2,})/gu, "$1$2$3");
  next = next.replace(/(^|[\s:/\-()])([b-df-hj-np-tv-zç])\s+([a-zà-ÿ]{3,})/gu, "$1$2$3");
  return next;
};

const parseCsvRow = (line: string, delimiter: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const normalizeCsvHeader = (header: string) =>
  normalizeParserText(String(header || ""))
    .replace(/[^a-z0-9]/g, "")
    .trim();

const planningCsvHeaderAliases: Record<string, string[]> = {
  target: ["target", "perfil", "turma", "planejamento", "plano", "objetivo"],
  year: ["year", "ano", "anoreferencia", "anoplanejamento"],
  type: ["type", "tipo", "bloco", "tipobloco"],
  label: ["label", "rotulo", "titulo", "cabecalho", "periodo", "semana", "data"],
  text: ["text", "conteudo", "descricao", "descricaoatividade", "atividades", "objetivos", "observacoes"],
  month: ["month", "mes"],
  week: ["week", "semana", "nsemana"],
  startDay: ["startday", "diainicio", "inicio", "de"],
  endDay: ["endday", "diafim", "fim", "ate"],
  date: ["date", "data", "dia"],
};

const resolveCsvHeaderMap = (headers: string[]) => {
  const map = new Map<string, number>();
  const normalizedHeaders = headers.map((header) => normalizeCsvHeader(header));

  Object.entries(planningCsvHeaderAliases).forEach(([canonical, aliases]) => {
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index >= 0) {
      map.set(canonical, index);
    }
  });

  return map;
};

const parsePlanningType = (value: string): PlanningBlockType => {
  const normalized = normalizeParserText(value).replace(/\s+/g, "");
  if (["date", "dia", "data"].includes(normalized)) return "date";
  if (["week", "semana", "semanal"].includes(normalized)) return "week";
  if (["month", "mes", "mensal"].includes(normalized)) return "month";
  return "general";
};

const parsePlanningDateValue = (value: string, fallbackYear: number) => {
  const clean = String(value || "").trim();
  if (!clean) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [yearStr, monthStr, dayStr] = clean.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month: String(month).padStart(2, "0"), day: String(day).padStart(2, "0") };
  }

  const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = brMatch[3] ? Number(brMatch[3]) : fallbackYear;
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month: String(month).padStart(2, "0"), day: String(day).padStart(2, "0") };
  }

  return null;
};

const normalizePlanningCsvContent = (value: string) =>
  String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\n/g)
    .map((line) => normalizePlanningLineSpacing(line))
    .filter(Boolean)
    .join("\n");

const buildPlanningFileDataFromCsv = (
  raw: string,
  sourceName: string,
  defaultYear: number,
  defaultMonth: string
): PlanningFileData | null => {
  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const delimiter = (() => {
    const header = lines[0] || "";
    const semicolonCount = (header.match(/;/g) || []).length;
    const commaCount = (header.match(/,/g) || []).length;
    const tabCount = (header.match(/\t/g) || []).length;
    if (tabCount > semicolonCount && tabCount > commaCount) return "\t";
    return semicolonCount >= commaCount ? ";" : ",";
  })();

  const headers = parseCsvRow(lines[0], delimiter);
  const headerMap = resolveCsvHeaderMap(headers);
  const hasContentColumns =
    headerMap.has("label") ||
    headerMap.has("text") ||
    headerMap.has("week") ||
    headerMap.has("date");

  if (!hasContentColumns) {
    return null;
  }

  const sourceFallback = sourceName.replace(/\.[^.]+$/, "").trim() || "Geral";
  const targetSet = new Set<string>();
  const blocks: PlanningBlock[] = [];
  let inferredYear = defaultYear;

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvRow(lines[i], delimiter);
    const pick = (key: string) => {
      const idx = headerMap.get(key);
      if (typeof idx !== "number") return "";
      return String(row[idx] || "").trim();
    };

    const rawTarget = pick("target");
    if (rawTarget) targetSet.add(rawTarget);

    const rawYear = Number(pick("year"));
    const year = Number.isFinite(rawYear) && rawYear >= 2000 ? rawYear : inferredYear;
    inferredYear = year;

    const rawLabel = pick("label");
    const rawText = normalizePlanningCsvContent(pick("text"));
    const rawMonth = pick("month");
    const parsedMonth = rawMonth
      ? (() => {
          const mm = String(rawMonth).trim();
          if (/^\d{1,2}$/.test(mm)) return String(Number(mm)).padStart(2, "0");
          const detected = detectMonthFromLine(mm);
          return detected || "";
        })()
      : "";

    const week = parseOptionalNumber(pick("week"));
    const startDay = parseOptionalNumber(pick("startDay"));
    const endDay = parseOptionalNumber(pick("endDay"));

    const rawDate = pick("date");
    const parsedDate = parsePlanningDateValue(rawDate || rawLabel, year);
    const explicitType = parsePlanningType(pick("type"));

    const inferredType: PlanningBlockType = (() => {
      if (explicitType !== "general") return explicitType;
      if (parsedDate) return "date";
      if (typeof week === "number" || (typeof startDay === "number" && typeof endDay === "number")) return "week";
      if (parsedMonth) return "month";
      return "general";
    })();

    const month = parsedDate?.month || parsedMonth || defaultMonth;
    const label = rawLabel || (parsedDate ? `${parsedDate.day}/${parsedDate.month}/${parsedDate.year}` : "Geral");

    const key = (() => {
      if (inferredType === "date" && parsedDate) {
        return `${parsedDate.year}-${parsedDate.month}-${parsedDate.day}`;
      }
      if (inferredType === "week") {
        const weekNumber = typeof week === "number" ? week : getWeekOfMonth(new Date(year, Number(month) - 1, Math.max(1, Number(startDay || 1))));
        return `${year}-${month}-sem-${weekNumber}`;
      }
      if (inferredType === "month") {
        return `${year}-${month}`;
      }
      return `${year}-${month}-geral-${i}`;
    })();

    const text = rawText || (inferredType === "month" ? "" : String(rawLabel || "").trim());
    if (!text && inferredType !== "month") continue;

    blocks.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${i}`,
      type: inferredType,
      key,
      label,
      text,
      month,
      week: typeof week === "number" ? week : undefined,
      startDay: typeof startDay === "number" ? startDay : undefined,
      endDay: typeof endDay === "number" ? endDay : undefined,
    });
  }

  if (blocks.length === 0) return null;

  const target =
    Array.from(targetSet)[0] ||
    parseHeaderTargetYear(lines, sourceName, inferredYear).target ||
    sourceFallback;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sourceName,
    target,
    year: inferredYear,
    blocks,
    createdAt: new Date().toISOString(),
  };
};

const buildPlanningFileData = (
  raw: string,
  sourceName: string,
  defaultYear: number,
  defaultMonth: string
): PlanningFileData | null => {
  const text = String(raw || "").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  const rawLines = text
    .split("\n")
    .map((line) => normalizePlanningLineSpacing(line))
    .filter(Boolean);
  if (rawLines.length === 0) return null;

  const lines: string[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const current = rawLines[index];
    const next = rawLines[index + 1] || "";
    const next2 = rawLines[index + 2] || "";

    const currentNormalized = normalizeParserText(current);
    const nextNormalized = normalizeParserText(next);

    if (/^\d{1,2}\s*[aª]?$/.test(currentNormalized) && /^sem(?:ana)?[:\-]?$/.test(nextNormalized)) {
      let merged = `${current} ${next}`;
      if (/^\d{1,2}\s*(a|ate|-)\s*\d{1,2}/i.test(next2)) {
        merged = `${merged} ${next2}`;
        index += 2;
      } else {
        index += 1;
      }
      lines.push(merged);
      continue;
    }

    if (/^\d{1,2}\s*[aª]?\s*sem(?:ana)?[:\-]?$/.test(currentNormalized) && /^\d{1,2}\s*(a|ate|-)\s*\d{1,2}/i.test(next)) {
      lines.push(`${current} ${next}`);
      index += 1;
      continue;
    }

    lines.push(current);
  }

  const header = parseHeaderTargetYear(lines, sourceName, defaultYear);
  let currentMonth = "";

  const blocks: PlanningBlock[] = [];
  let currentBlock: PlanningBlock | null = null;

  const flushCurrentBlock = () => {
    if (!currentBlock) return;
    let cleanedText = String(currentBlock.text || "").trim();

    if (
      currentBlock.type === "week" &&
      typeof currentBlock.startDay === "number" &&
      typeof currentBlock.endDay === "number" &&
      cleanedText
    ) {
      const lines = cleanedText
        .split("\n")
        .map((line) => normalizePlanningLineSpacing(line))
        .filter(Boolean);

      if (lines.length > 0) {
        const firstLineNormalized = normalizeParserText(lines[0]);
        const rangeRegex = new RegExp(
          `^(?:de\\s+)?0?${currentBlock.startDay}\\s*(?:a|-|ate)\\s*0?${currentBlock.endDay}(?:\\b|\\s|$)`
        );
        if (rangeRegex.test(firstLineNormalized)) {
          lines.shift();
        }
      }

      cleanedText = lines.join("\n").trim();
    }

    if (cleanedText.length > 0) {
      blocks.push({ ...currentBlock, text: cleanedText });
    }
    currentBlock = null;
  };

  for (const line of lines) {
    const clean = normalizePlanningLineSpacing(line);
    const normalized = normalizeParserText(clean);
    if (!clean) continue;
    if (/^planejamento\b/.test(normalized)) continue;

    const monthFromLine = detectMonthFromLine(clean);
    if (monthFromLine && normalized.length <= 24) {
      flushCurrentBlock();
      currentMonth = monthFromLine;
      currentBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "month",
        key: `${header.year}-${currentMonth}`,
        label: clean,
        text: "",
        month: currentMonth,
      };
      continue;
    }

    const weekMatch = normalized.match(/(\d{1,2})\s*(?:a|ª)?\s*sem(?:ana)?\b|sem(?:ana)?\s*(\d{1,2})\b/);
    if (weekMatch) {
      flushCurrentBlock();
      const week = Number(weekMatch[1] || weekMatch[2]);
      const explicitDateTokens = clean.match(/\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g) || [];
      const startToken = explicitDateTokens[0];
      const endToken = explicitDateTokens[1] || explicitDateTokens[0];

      let weekYear = header.year;
      let resolvedMonth = currentMonth || defaultMonth;
      let startDay: number | undefined;
      let endDay: number | undefined;

      if (startToken && endToken) {
        const startParts = startToken.split("/").map(Number);
        const endParts = endToken.split("/").map(Number);
        if (startParts.length >= 2 && endParts.length >= 2) {
          startDay = Number(startParts[0]);
          endDay = Number(endParts[0]);
          resolvedMonth = String(Number(endParts[1])).padStart(2, "0");
          if (endParts[2]) weekYear = Number(endParts[2]);
        }
      }

      if (typeof startDay !== "number" || typeof endDay !== "number") {
        const rangeMatch = normalized.match(/(?:de\s+)?(\d{1,2})\s*(?:a|-|ate)\s*(\d{1,2})/i);
        startDay = rangeMatch ? Number(rangeMatch[1]) : undefined;
        endDay = rangeMatch ? Number(rangeMatch[2]) : undefined;
      }

      const semHeaderMatch = clean.match(/^\s*(?:\d{1,2}\s*(?:a|ª)?\s*sem(?:ana)?|sem(?:ana)?\s*\d{1,2})\s*:?\s*/i);
      let trailingAfterHeader = semHeaderMatch
        ? clean.slice(semHeaderMatch[0].length).trim().replace(/^[:\-–]+\s*/, "")
        : "";

      trailingAfterHeader = trailingAfterHeader
        .replace(
          /^(?:de\s+)?\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\s*(?:a|-|ate)\s*\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\s*/i,
          ""
        )
        .trim()
        .replace(/^[:\-–]+\s*/, "");

      currentMonth = resolvedMonth;
      currentBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "week",
        key: `${weekYear}-${resolvedMonth}-sem-${week}`,
        label: clean,
        text: trailingAfterHeader,
        month: resolvedMonth,
        week,
        startDay,
        endDay,
      };
      continue;
    }

    const dateMatch = clean.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
    if (dateMatch) {
      flushCurrentBlock();
      const day = String(Number(dateMatch[1])).padStart(2, "0");
      const month = String(Number(dateMatch[2])).padStart(2, "0");
      const year = dateMatch[3] ? Number(dateMatch[3]) : header.year;
      currentMonth = month;
      const trailing = clean.slice((dateMatch.index || 0) + dateMatch[0].length).trim().replace(/^[:\-–]+\s*/, "");
      currentBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "date",
        key: `${year}-${month}-${day}`,
        label: clean,
        text: trailing,
        month,
      };
      continue;
    }

    if (!currentBlock) {
      currentBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "general",
        key: `${header.year}-${currentMonth || defaultMonth}-geral`,
        label: "Geral",
        text: "",
        month: currentMonth || undefined,
      };
    }

    currentBlock.text = currentBlock.text ? `${currentBlock.text}\n${clean}` : clean;
  }

  flushCurrentBlock();
  if (blocks.length === 0) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sourceName,
    target: header.target,
    year: header.year,
    blocks,
    createdAt: new Date().toISOString(),
  };
};

const readPlanningTextFromFile = async (file: File): Promise<string> => {
  if (file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }

  if (file.name.toLowerCase().endsWith(".pdf")) {
    const buffer = await file.arrayBuffer();
    const loadingTask = (pdfjsLib as any).getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];

    const buildTextLinesFromPdfItems = (items: any[]) => {
      const validItems = items
        .map((item) => {
          const rawText = String(item?.str || "");
          const text = rawText.replace(/\s+/g, " ").trim();
          const transform = Array.isArray(item?.transform) ? item.transform : [];
          const x = Number(transform[4] || 0);
          const y = Number(transform[5] || 0);
          const width = Number(item?.width || 0);
          return { text, x, y, width };
        })
        .filter((item) => item.text.length > 0);

      if (validItems.length === 0) return [] as string[];

      const sorted = validItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

      const rows: Array<{ y: number; cells: Array<{ text: string; x: number; width: number }> }> = [];
      for (const item of sorted) {
        const row = rows.find((entry) => Math.abs(entry.y - item.y) <= 2);
        if (row) {
          row.cells.push({ text: item.text, x: item.x, width: item.width });
        } else {
          rows.push({ y: item.y, cells: [{ text: item.text, x: item.x, width: item.width }] });
        }
      }

      return rows
        .sort((a, b) => b.y - a.y)
        .map((row) => {
          const sortedCells = row.cells.sort((a, b) => a.x - b.x);
          let merged = "";
          let previousEndX: number | null = null;

          sortedCells.forEach((cell) => {
            if (!merged) {
              merged = cell.text;
              previousEndX = cell.x + (cell.width > 0 ? cell.width : Math.max(1, cell.text.length * 3));
              return;
            }

            const safePreviousEndX = previousEndX ?? cell.x;
            const gap = cell.x - safePreviousEndX;
            const punctuationStart = /^[,.;:!?)]/.test(cell.text);
            const punctuationEnd = /[(\/-]$/.test(merged);
            const needsSpace = gap > 1.4 && !punctuationStart && !punctuationEnd;

            merged = `${merged}${needsSpace ? " " : ""}${cell.text}`;
            previousEndX = cell.x + (cell.width > 0 ? cell.width : Math.max(1, cell.text.length * 3));
          });

          return merged.replace(/\s{2,}/g, " ").trim();
        })
        .filter(Boolean);
    };

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const pageText = buildTextLinesFromPdfItems(content.items as any[]).join("\n");
      if (pageText) parts.push(pageText);
    }
    return parts.join("\n");
  }

  return "";
};

const parsePlanningFile = async (
  file: File,
  defaultYear: number,
  defaultMonth: string
): Promise<PlanningFileData | null> => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const raw = await file.text();
    return buildPlanningFileDataFromCsv(raw, file.name, defaultYear, defaultMonth);
  }

  const text = await readPlanningTextFromFile(file);
  return buildPlanningFileData(text, file.name, defaultYear, defaultMonth);
};

const findNearestOpenPlanningDateKey = (
  dateKey: string,
  settings: AcademicCalendarSettings | null,
  events: AcademicCalendarEvent[]
) => {
  if (!dateKey || !isDateClosedForAttendance(dateKey, settings, events)) {
    return dateKey;
  }

  const baseDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return dateKey;

  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();

  for (let offset = 1; offset <= 31; offset += 1) {
    const before = new Date(baseDate);
    before.setDate(baseDate.getDate() - offset);
    if (
      before.getFullYear() === baseYear &&
      before.getMonth() === baseMonth &&
      !isDateClosedForAttendance(toDateKey(before), settings, events)
    ) {
      return toDateKey(before);
    }

    const after = new Date(baseDate);
    after.setDate(baseDate.getDate() + offset);
    if (
      after.getFullYear() === baseYear &&
      after.getMonth() === baseMonth &&
      !isDateClosedForAttendance(toDateKey(after), settings, events)
    ) {
      return toDateKey(after);
    }
  }

  return dateKey;
};

const weekKeyFromDateKey = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "semana:1";
  return `semana:${getWeekOfMonth(d)}`;
};

const parseDateTokenInLabel = (token: string, fallbackYear: number) => {
  const match = String(token || "").trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  const dateObj = new Date(year, month - 1, day);
  if (Number.isNaN(dateObj.getTime())) return null;
  return dateObj;
};

const resolvePlanningDateRange = (label: string, fallbackYear: number) => {
  const clean = String(label || "").trim();
  if (!clean) return null as { start: Date; end: Date } | null;

  const explicitDateTokens = clean.match(/\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g) || [];
  if (explicitDateTokens.length >= 2) {
    const firstToken = explicitDateTokens[0] || "";
    const secondToken = explicitDateTokens[1] || "";
    const start = parseDateTokenInLabel(firstToken, fallbackYear);
    let end = parseDateTokenInLabel(secondToken, fallbackYear);
    if (!start || !end) return null;
    if (end.getTime() < start.getTime() && !/\/20\d{2}\b/.test(secondToken)) {
      end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
    }
    return { start, end };
  }

  const dayToDateMatch = clean.match(/\b(\d{1,2})\s*(?:a|-|ate)\s*(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/i);
  if (dayToDateMatch) {
    const startDay = Number(dayToDateMatch[1]);
    const endDay = Number(dayToDateMatch[2]);
    const endMonth = Number(dayToDateMatch[3]);
    const endYear = dayToDateMatch[4] ? Number(dayToDateMatch[4]) : fallbackYear;
    if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || !Number.isFinite(endMonth) || !Number.isFinite(endYear)) {
      return null;
    }

    const end = new Date(endYear, endMonth - 1, endDay);
    if (Number.isNaN(end.getTime())) return null;

    const inferredStartMonth = startDay > endDay ? endMonth - 1 : endMonth;
    const normalizedStartMonth = inferredStartMonth >= 1 ? inferredStartMonth : 12;
    const normalizedStartYear = inferredStartMonth >= 1 ? endYear : endYear - 1;
    const start = new Date(normalizedStartYear, normalizedStartMonth - 1, startDay);
    if (Number.isNaN(start.getTime())) return null;

    return { start, end };
  }

  return null;
};

const previousMonthOf = (month: string) => {
  const numeric = Number(month);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) return "";
  if (numeric === 1) return "12";
  return String(numeric - 1).padStart(2, "0");
};

const planningRangeIncludesDate = (label: string, fallbackYear: number, selectedDateKey: string) => {
  const selectedDate = new Date(`${selectedDateKey}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return false;
  const range = resolvePlanningDateRange(label, fallbackYear);
  if (!range) return false;

  const selectedTime = selectedDate.getTime();
  return selectedTime >= range.start.getTime() && selectedTime <= range.end.getTime();
};

const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekdayMonToSun = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const monthOptions = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"resumo" | "frequencias" | "graficos" | "estatisticas" | "vagas">("resumo");
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentLocalDateKey().slice(0, 7));
  const [selectedTurmaLabel, setSelectedTurmaLabel] = useState<string>("");
  const [selectedHorario, setSelectedHorario] = useState<string>("");
  const [selectedProfessor, setSelectedProfessor] = useState<string>("");
  const [selectedExportClassKeys, setSelectedExportClassKeys] = useState<string[]>([]);
  const [hasInitializedExportSelection, setHasInitializedExportSelection] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState<AcademicCalendarSettings | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>([]);
  const [bankHours, setBankHours] = useState<Array<{ teacher: string; hours: number }>>([]);
  const [savingCalendarSettings, setSavingCalendarSettings] = useState(false);
  const [loadingWeatherMonth, setLoadingWeatherMonth] = useState(false);
  const [weatherByDate, setWeatherByDate] = useState<Record<string, WeatherSnapshot>>({});
  const [periodsCollapsed, setPeriodsCollapsed] = useState(false);
  const [vacancySearch, setVacancySearch] = useState("");
  const [vacancyNivelFilter, setVacancyNivelFilter] = useState("");
  const [vacancyProfessorFilter, setVacancyProfessorFilter] = useState("");

  // Statistics state
  const [statistics, setStatistics] = useState<StudentStatistics[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsFilter, setStatsFilter] = useState("");
  const [statsStatusFilter, setStatsStatusFilter] = useState<"todos" | "ativos" | "excluidos">("todos");
  const [statsSortBy, setStatsSortBy] = useState<"retention_desc" | "retention_asc" | "freq_desc" | "name_asc">("retention_desc");
  const [expandedStats, setExpandedStats] = useState<Record<string, boolean>>({});

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    } catch {
      return iso;
    }
  };

  useEffect(() => {
    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const res = await getStatistics();
        const data = Array.isArray(res.data) ? res.data as StudentStatistics[] : [];
        setStatistics(data);
      } catch (err) {
        setStatistics([]);
      } finally {
        setStatsLoading(false);
      }
    };

    if (activeTab === "estatisticas") {
      loadStats();
    }
  }, [activeTab]);

  const statisticsView = useMemo(() => {
    const toNumber = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizedSearch = normalizeText(statsFilter || "");

    const mapped = (statistics || []).map((student) => {
      const levels = Array.isArray(student.levels) ? student.levels : [];
      const totals = levels.reduce(
        (acc, lvl) => {
          acc.presencas += toNumber(lvl?.presencas);
          acc.faltas += toNumber(lvl?.faltas);
          acc.justificativas += toNumber(lvl?.justificativas);
          return acc;
        },
        { presencas: 0, faltas: 0, justificativas: 0 }
      );

      const totalRegistros = totals.presencas + totals.faltas + totals.justificativas;
      const frequenciaCalculada =
        totalRegistros > 0
          ? Number((((totals.presencas + totals.justificativas) / totalRegistros) * 100).toFixed(1))
          : 0;

      return {
        ...student,
        levels,
        isExcluded: Boolean(student.exclusionDate),
        totals,
        totalRegistros,
        frequenciaCalculada,
      };
    });

    const summarySource = mapped;
    const summary = {
      total: summarySource.length,
      ativos: summarySource.filter((s) => !s.isExcluded).length,
      excluidos: summarySource.filter((s) => s.isExcluded).length,
      retencaoMedia:
        summarySource.length > 0
          ? Math.round(summarySource.reduce((acc, s) => acc + toNumber(s.retentionDays), 0) / summarySource.length)
          : 0,
      frequenciaMedia:
        summarySource.length > 0
          ? Number(
              (
                summarySource.reduce((acc, s) => acc + toNumber(s.frequenciaCalculada), 0) /
                summarySource.length
              ).toFixed(1)
            )
          : 0,
    };

    let filtered = mapped.filter((student) => {
      const matchName = !normalizedSearch || normalizeText(student.nome).includes(normalizedSearch);
      const matchStatus =
        statsStatusFilter === "todos" ||
        (statsStatusFilter === "ativos" && !student.isExcluded) ||
        (statsStatusFilter === "excluidos" && student.isExcluded);
      return matchName && matchStatus;
    });

    filtered = filtered.sort((a, b) => {
      if (statsSortBy === "retention_asc") {
        return toNumber(a.retentionDays) - toNumber(b.retentionDays);
      }
      if (statsSortBy === "freq_desc") {
        return toNumber(b.frequenciaCalculada) - toNumber(a.frequenciaCalculada);
      }
      if (statsSortBy === "name_asc") {
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
      }
      return toNumber(b.retentionDays) - toNumber(a.retentionDays);
    });

    return { summary, rows: filtered };
  }, [statistics, statsFilter, statsStatusFilter, statsSortBy]);

  const [selectedCalendarDate, setSelectedCalendarDate] = useState(getCurrentLocalDateKey());
  const [planningStore, setPlanningStore] = useState<PlanningStore>({ files: [] });
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningStatus, setPlanningStatus] = useState("");
  const [planningCardOpen, setPlanningCardOpen] = useState(false);
  const [planningCardDate, setPlanningCardDate] = useState(getCurrentLocalDateKey());
  const [planningSelectedTarget, setPlanningSelectedTarget] = useState("");
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<CalendarEventForm>({
    date: "",
    type: "feriado",
    allDay: true,
    startTime: "",
    endTime: "",
    description: "",
  });

  const [selectedYear, selectedMonthNumber] = selectedMonth.split("-");
  const [showAproveitamentoDetails, setShowAproveitamentoDetails] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLANNING_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PlanningStore;
      if (parsed && Array.isArray(parsed.files)) {
        setPlanningStore({ files: normalizePlanningFiles(parsed.files) });
      }
    } catch {
      setPlanningStore({ files: [] });
    }
  }, []);

  const refreshPlanningStoreFromBackend = useCallback(async () => {
    try {
      const response = await getPlanningFiles();
      setPlanningStore({ files: normalizePlanningFiles(response.data) });
    } catch {
      // keep cached data when backend is unavailable
    }
  }, []);

  const refreshExcludedStudentsFromBackend = useCallback(async () => {
    const localSnapshot = readLocalVacancySnapshot();
    setExcludedSnapshot(localSnapshot.exclusions);

    try {
      const response = await getExcludedStudents();
      const backendPayload = Array.isArray(response?.data) ? (response.data as ExclusionLite[]) : [];
      const mergedMap = new Map<string, ExclusionLite>();
      [...localSnapshot.exclusions, ...backendPayload].forEach((item) => {
        mergedMap.set(exclusionMergeKey(item), item);
      });
      const merged = Array.from(mergedMap.values());
      setExcludedSnapshot(merged);
      localStorage.setItem("excludedStudents", JSON.stringify(merged));
    } catch {
      // keep cached data when backend is unavailable
    }
  }, []);

  useEffect(() => {
    refreshPlanningStoreFromBackend();
    refreshExcludedStudentsFromBackend();
  }, [refreshPlanningStoreFromBackend, refreshExcludedStudentsFromBackend]);

  useEffect(() => {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(planningStore));
  }, [planningStore]);

  const updateCalendarPeriod = (nextYear: string, nextMonth: string) => {
    if (!nextYear || !nextMonth) return;
    setSelectedMonth(`${nextYear}-${nextMonth}`);
  };

  const shiftSelectedMonth = (offset: number) => {
    const [yearPart, monthPart] = selectedMonth.split("-");
    const baseDate = new Date(Number(yearPart), Number(monthPart) - 1, 1);
    baseDate.setMonth(baseDate.getMonth() + offset);
    const nextYear = String(baseDate.getFullYear());
    const nextMonth = String(baseDate.getMonth() + 1).padStart(2, "0");
    updateCalendarPeriod(nextYear, nextMonth);
  };

  const goToCurrentMonth = () => {
    const todayKey = getCurrentLocalDateKey();
    const [yearNow, monthNow] = todayKey.split("-");
    updateCalendarPeriod(yearNow, monthNow);
    setSelectedCalendarDate(todayKey);
  };

  const yearOptions = Array.from({ length: 9 }, (_, idx) => String(new Date().getFullYear() - 4 + idx));

  const selectedPlanningDateKey = planningCardDate || selectedCalendarDate || getCurrentLocalDateKey();
  const effectivePlanningDateKey = useMemo(
    () => findNearestOpenPlanningDateKey(selectedPlanningDateKey, calendarSettings, calendarEvents),
    [selectedPlanningDateKey, calendarSettings, calendarEvents]
  );
  const selectedPlanningWeekKey = useMemo(() => weekKeyFromDateKey(effectivePlanningDateKey), [effectivePlanningDateKey]);
  const selectedPlanningMonthKey = effectivePlanningDateKey.slice(0, 7);
  const planningDateWasAdjusted = Boolean(
    selectedPlanningDateKey && effectivePlanningDateKey && selectedPlanningDateKey !== effectivePlanningDateKey
  );

  const planningTargets = useMemo(() => {
    const uniqueTargets = Array.from(
      new Set(
        planningStore.files
          .map((file) => String(file.target || "").trim())
          .filter(Boolean)
      )
    );
    return uniqueTargets.sort((a, b) => a.localeCompare(b));
  }, [planningStore.files]);

  useEffect(() => {
    if (planningTargets.length === 0) {
      setPlanningSelectedTarget("");
      return;
    }
    if (!planningSelectedTarget || !planningTargets.includes(planningSelectedTarget)) {
      setPlanningSelectedTarget(planningTargets[0]);
    }
  }, [planningTargets, planningSelectedTarget]);

  const planningSelectedTargetKey = normalizeTargetKey(planningSelectedTarget);

  const planningLookupResults = useMemo(() => {
    if (!planningSelectedTargetKey) return [] as PlanningBlock[];

    const dateObj = new Date(`${effectivePlanningDateKey}T00:00:00`);
    const selectedDay = Number.isNaN(dateObj.getTime()) ? null : dateObj.getDate();
    const selectedWeek = Number.isNaN(dateObj.getTime()) ? null : Number(selectedPlanningWeekKey.replace("semana:", ""));
    const selectedYear = Number.isNaN(dateObj.getTime()) ? Number(selectedMonth.slice(0, 4)) : dateObj.getFullYear();
    const selectedMonthNumber = selectedPlanningMonthKey.slice(5, 7);

    const filesForTargetByYear = planningStore.files.filter(
      (file) =>
        normalizeTargetKey(file.target || "") === planningSelectedTargetKey &&
        Number(file.year || 0) === selectedYear
    );

    const filesForTarget = filesForTargetByYear.length > 0
      ? filesForTargetByYear
      : planningStore.files.filter(
          (file) => normalizeTargetKey(file.target || "") === planningSelectedTargetKey
        );

    const matched: Array<PlanningBlock & { _score: number }> = [];
    filesForTarget.forEach((file) => {
      file.blocks.forEach((block) => {
        const hasText = String(block.text || "").trim().length > 0;
        if (!hasText) return;

        let score = 0;

        if (block.type === "week") {
          const blockMonth = String(block.month || "").padStart(2, "0");
          const prevOfBlockMonth = previousMonthOf(blockMonth);
          const isCrossMonthRange =
            typeof block.startDay === "number" &&
            typeof block.endDay === "number" &&
            block.startDay > block.endDay;

          const monthMatches =
            !block.month ||
            blockMonth === selectedMonthNumber ||
            (isCrossMonthRange && prevOfBlockMonth === selectedMonthNumber);
          if (!monthMatches) return;

          const weekMatches = selectedWeek !== null && typeof block.week === "number" && block.week === selectedWeek;
          const rangeMatches = (() => {
            if (
              selectedDay === null ||
              typeof block.startDay !== "number" ||
              typeof block.endDay !== "number"
            ) {
              return false;
            }

            if (block.startDay <= block.endDay) {
              return selectedDay >= block.startDay && selectedDay <= block.endDay;
            }

            // Semana de transição de mês: ex. 31/03 a 03/04
            if (blockMonth === selectedMonthNumber) {
              return selectedDay <= block.endDay;
            }

            if (prevOfBlockMonth === selectedMonthNumber) {
              return selectedDay >= block.startDay;
            }

            return false;
          })();

          score = rangeMatches ? 5 : weekMatches ? 4 : 0;
        } else if (block.type === "date") {
          const exactDateMatch = block.key === effectivePlanningDateKey;
          const labelRangeMatch = planningRangeIncludesDate(block.label || "", Number(file.year || selectedYear), effectivePlanningDateKey);
          score = exactDateMatch ? 7 : labelRangeMatch ? 6 : 0;
        } else {
          return;
        }

        if (score > 0) {
          matched.push({ ...block, _score: score });
        }
      });
    });

    if (matched.length === 0) return [] as PlanningBlock[];

    const bestScore = Math.max(...matched.map((item) => item._score));
    let bestMatched = matched.filter((item) => item._score === bestScore);

    if (bestMatched.length > 1 && selectedDay !== null) {
      const datePriority = bestMatched.filter((item) => item.type === "date");
      if (datePriority.length > 0) {
        bestMatched = datePriority;
      } else {
        const boundaryStarts = bestMatched.filter(
          (item) => item.type === "week" && typeof item.startDay === "number" && item.startDay === selectedDay
        );

        if (boundaryStarts.length > 0) {
          bestMatched = boundaryStarts;
        } else {
          const weekBlocks = bestMatched.filter(
            (item) => item.type === "week" && typeof item.startDay === "number" && typeof item.endDay === "number"
          );

          if (weekBlocks.length > 0) {
            const minSpan = Math.min(
              ...weekBlocks.map((item) => Math.max(0, Number(item.endDay) - Number(item.startDay)))
            );
            const narrowest = weekBlocks.filter(
              (item) => Math.max(0, Number(item.endDay) - Number(item.startDay)) === minSpan
            );
            if (narrowest.length > 0) {
              const bestStart = Math.max(...narrowest.map((item) => Number(item.startDay || 0)));
              bestMatched = narrowest.filter((item) => Number(item.startDay || 0) === bestStart);
            }
          }
        }
      }
    }

    const bestSingle = bestMatched
      .sort((a, b) => {
        const textA = String(a.text || "").trim().length;
        const textB = String(b.text || "").trim().length;
        if (textB !== textA) return textB - textA;
        return a.label.localeCompare(b.label);
      })[0];

    if (!bestSingle) return [] as PlanningBlock[];

    const { _score, ...block } = bestSingle;
    return [block];
  }, [planningSelectedTargetKey, planningStore.files, selectedPlanningWeekKey, effectivePlanningDateKey, selectedPlanningMonthKey, selectedMonth]);

  const handlePlanningUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (files.length > 4) {
      setPlanningStatus("Selecione no máximo 4 arquivos por vez.");
      event.target.value = "";
      return;
    }

    setPlanningBusy(true);
    setPlanningStatus("Processando arquivos...");
    try {
      const importedFiles: PlanningFileData[] = [];
      const defaultYear = Number(selectedMonth.split("-")[0]) || new Date().getFullYear();
      const defaultMonth = selectedMonth.split("-")[1] || "01";

      for (const file of files) {
        const parsed = await parsePlanningFile(file, defaultYear, defaultMonth);
        if (parsed) importedFiles.push(parsed);
      }

      if (importedFiles.length === 0) {
        setPlanningStatus("Nenhum item de planejamento encontrado.");
      } else {
        await Promise.all(importedFiles.map((file) => savePlanningFile(file)));
        setPlanningStatus(`${importedFiles.length} arquivo(s) de planejamento importado(s).`);
        await refreshPlanningStoreFromBackend();
      }
    } catch {
      setPlanningStatus("Falha ao importar arquivos de planejamento.");
    } finally {
      setPlanningBusy(false);
      event.target.value = "";
    }
  };

  const removePlanningFile = async (fileId: string) => {
    try {
      await deletePlanningFile(fileId);
      await refreshPlanningStoreFromBackend();
    } catch {
      setPlanningStatus("Falha ao remover arquivo de planejamento.");
    }
  };

  const formatHorario = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.includes(":")) return raw;
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
    if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    return raw;
  };

  const getHorarioSortValue = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return Number.MAX_SAFE_INTEGER;
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 4) return Number.parseInt(digits.slice(0, 4), 10);
    if (digits.length === 3) return Number.parseInt(`0${digits}`, 10);
    return Number.MAX_SAFE_INTEGER;
  };

  const [studentsSnapshot, setStudentsSnapshot] = useState<ActiveStudentLite[]>([]);
  const [classesData, setClassesData] = useState<ClassStats[]>([]);
  const [bootstrapClasses, setBootstrapClasses] = useState<BootstrapClassLite[]>([]);
  const [excludedSnapshot, setExcludedSnapshot] = useState<ExclusionLite[]>([]);
  const [summaryTurmaToggle, setSummaryTurmaToggle] = useState<"terca-quinta" | "quarta-sexta">("terca-quinta");
  const [summaryProfessorToggle, setSummaryProfessorToggle] = useState<string>("");

  const bootstrapWeekdaysByKey = useMemo(() => {
    const map = new Map<string, number[]>();
    bootstrapClasses.forEach((cls) => {
      const key = bootstrapClassSelectionKey(cls);
      const weekdays = parseWeekdaysFromDiasSemana(cls.diasSemana || "");
      if (weekdays.length > 0) {
        map.set(key, weekdays);
      }
    });
    return map;
  }, [bootstrapClasses]);

  const classScheduleMetaByKey = useMemo(() => {
    const map = new Map<string, { group: "terca-quinta" | "quarta-sexta" | "outros"; weekdays: number[] }>();

    classesData.forEach((cls) => {
      const key = classSelectionKey(cls);
      let group = getSummaryScheduleGroup(cls.turma);
      let weekdays = weekdaysBySummaryGroup[group] || [];

      if (weekdays.length === 0) {
        // Tentativa 1: chave exata bootstrap
        const exactFallback = bootstrapWeekdaysByKey.get(key) || [];
        if (exactFallback.length > 0) {
          weekdays = exactFallback;
          group = getSummaryGroupFromWeekdays(exactFallback);
        } else {
          // Tentativa 2: correspondência fuzzy por horario+professor (turmas sem dia no nome)
          const clsHorarioNorm = normalizeHorarioSelectionKey(cls.horario || "");
          const clsProfNorm = normalizeText(cls.professor || "");
          const matched = bootstrapClasses.find((bc) => {
            const bcHorarioNorm = normalizeHorarioSelectionKey(bc.horario || "");
            const bcProfNorm = normalizeText(bc.professor || "");
            return bcHorarioNorm === clsHorarioNorm && bcProfNorm === clsProfNorm;
          });
          if (matched) {
            const fuzzyWeekdays = parseWeekdaysFromDiasSemana(matched.diasSemana || "");
            if (fuzzyWeekdays.length > 0) {
              weekdays = fuzzyWeekdays;
              group = getSummaryGroupFromWeekdays(fuzzyWeekdays);
            }
          }
        }
      }

      map.set(key, { group, weekdays });
    });

    return map;
  }, [classesData, bootstrapWeekdaysByKey, bootstrapClasses]);

  const summaryProfessorOptions = useMemo(() => {
    const options = Array.from(
      new Set(
        classesData
          .filter((cls) => classScheduleMetaByKey.get(classSelectionKey(cls))?.group === summaryTurmaToggle)
          .map((cls) => String(cls.professor || "").trim())
          .filter(Boolean)
      )
    );
    return options.sort((a, b) => a.localeCompare(b));
  }, [classScheduleMetaByKey, classesData, summaryTurmaToggle]);

  // Auto-seleciona o grupo TQ/QS com mais registros ao carregar dados
  useEffect(() => {
    if (classesData.length === 0) return;
    const groupLogCount = new Map<string, number>([["terca-quinta", 0], ["quarta-sexta", 0]]);
    classesData.forEach((cls) => {
      const meta = classScheduleMetaByKey.get(classSelectionKey(cls));
      if (!meta || meta.group === "outros") return;
      if (cls.hasLog) groupLogCount.set(meta.group, (groupLogCount.get(meta.group) || 0) + 1);
    });
    const tqC = groupLogCount.get("terca-quinta") || 0;
    const qsC = groupLogCount.get("quarta-sexta") || 0;
    if (qsC > tqC) setSummaryTurmaToggle("quarta-sexta");
    else setSummaryTurmaToggle("terca-quinta");
  }, [classesData, classScheduleMetaByKey]);

  // Auto-seleciona professor com mais aulas registradas (não o primeiro alfabético)
  useEffect(() => {
    if (summaryProfessorOptions.length === 0) {
      setSummaryProfessorToggle("");
      return;
    }
    if (summaryProfessorToggle && summaryProfessorOptions.includes(summaryProfessorToggle)) return;
    // Conta classes com hasLog por professor
    const logCount = new Map<string, number>();
    summaryProfessorOptions.forEach((p) => logCount.set(p, 0));
    classesData.forEach((cls) => {
      const meta = classScheduleMetaByKey.get(classSelectionKey(cls));
      if (!meta || meta.group !== summaryTurmaToggle) return;
      if (cls.hasLog && logCount.has(cls.professor)) {
        logCount.set(cls.professor, (logCount.get(cls.professor) || 0) + 1);
      }
    });
    let best = summaryProfessorOptions[0];
    let bestN = -1;
    logCount.forEach((n, p) => { if (n > bestN) { bestN = n; best = p; } });
    setSummaryProfessorToggle(best);
  }, [summaryProfessorOptions, summaryProfessorToggle, classesData, classScheduleMetaByKey, summaryTurmaToggle]);

  const refreshVacanciesSnapshot = (isMounted?: () => boolean) => {
    getBootstrap()
      .then((response) => {
        if (isMounted && !isMounted()) return;
        const localSnapshot = readLocalVacancySnapshot();
        const data = response.data as {
          classes: Array<{
            id: number;
            grupo?: string;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            capacidade: number;
            dias_semana?: string;
          }>;
          students: Array<{
            id: number;
            student_uid?: string;
            class_id: number;
            nome: string;
            whatsapp: string;
            data_nascimento: string;
            data_atestado: string;
            categoria: string;
            genero: string;
            parq: string;
            atestado: boolean;
          }>;
        };

        const classById = new Map<number, (typeof data.classes)[number]>();
        data.classes.forEach((cls) => classById.set(cls.id, cls));

        const mapped = data.students.map((student) => {
          const cls = classById.get(student.class_id);
          return {
            id: String(student.id),
            studentUid: String(student.student_uid || ""),
            nome: student.nome,
            turma: cls?.turma_label || cls?.codigo || "",
            turmaCodigo: cls?.grupo || cls?.codigo || "",
            grupo: cls?.grupo || cls?.codigo || "",
            horario: cls?.horario || "",
            professor: cls?.professor || "",
            nivel: cls?.nivel || "",
            whatsapp: student.whatsapp || "",
            dataNascimento: student.data_nascimento || "",
            dataAtestado: student.data_atestado || "",
            parQ: student.parq || "",
            atestado: !!student.atestado,
          } as ActiveStudentLite;
        });

        const mappedClasses: BootstrapClassLite[] = data.classes.map((cls) => ({
          grupo: cls.grupo || cls.codigo || "",
          codigo: cls.codigo || "",
          turmaLabel: cls.turma_label || cls.codigo || "",
          horario: cls.horario || "",
          professor: cls.professor || "",
          nivel: cls.nivel || "",
          capacidade: Number(cls.capacidade || 0),
          diasSemana: String(cls.dias_semana || ""),
        }));

        setStudentsSnapshot(localSnapshot.students.length > 0 ? localSnapshot.students : mapped);
        setBootstrapClasses(localSnapshot.classes.length > 0 ? localSnapshot.classes : mappedClasses);
        if (localSnapshot.exclusions.length > 0) {
          setExcludedSnapshot(localSnapshot.exclusions);
        }
      })
      .catch(() => {
        if (isMounted && !isMounted()) return;
        const localSnapshot = readLocalVacancySnapshot();
        setStudentsSnapshot(localSnapshot.students);
        setBootstrapClasses(localSnapshot.classes);
        setExcludedSnapshot(localSnapshot.exclusions);
      });
  };

  useEffect(() => {
    let mounted = true;
    refreshVacanciesSnapshot(() => mounted);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncFromLocal = () => {
      const localSnapshot = readLocalVacancySnapshot();
      setStudentsSnapshot(localSnapshot.students);
      setBootstrapClasses(localSnapshot.classes);
      setExcludedSnapshot(localSnapshot.exclusions);
    };

    return subscribeLocalStorageKeys(["activeStudents", "activeClasses", "excludedStudents"], syncFromLocal);
  }, []);

  const turmaOptions = Array.from(new Set(classesData.map((c) => c.turma))).sort();

  const horarioOptions = Array.from(
    new Set(
      classesData
        .filter((c) => c.turma === selectedTurmaLabel)
        .map((c) => c.horario)
    )
  ).sort((a, b) => getHorarioSortValue(a) - getHorarioSortValue(b));

  const professorOptions = Array.from(
    new Set(
      classesData
        .filter((c) => c.turma === selectedTurmaLabel)
        .map((c) => c.professor)
    )
  ).sort();

  const exportClassGrid = classesData
    .filter(
      (c) =>
        c.turma === selectedTurmaLabel &&
        (!selectedProfessor || c.professor === selectedProfessor)
    )
    .sort(
      (a, b) =>
        getHorarioSortValue(a.horario) - getHorarioSortValue(b.horario) ||
        String(a.nivel || "").localeCompare(String(b.nivel || ""))
    );

  const allGridSelected = exportClassGrid.length > 0 && selectedExportClassKeys.length === exportClassGrid.length;

  useEffect(() => {
    if (turmaOptions.length === 0) {
      setSelectedTurmaLabel("");
      return;
    }
    if (!selectedTurmaLabel || !turmaOptions.includes(selectedTurmaLabel)) {
      setSelectedTurmaLabel(turmaOptions[0]);
    }
  }, [turmaOptions, selectedTurmaLabel]);

  useEffect(() => {
    if (horarioOptions.length === 0) {
      setSelectedHorario("");
      return;
    }
    if (!selectedHorario || !horarioOptions.includes(selectedHorario)) {
      setSelectedHorario(horarioOptions[0]);
    }
  }, [horarioOptions, selectedHorario]);

  useEffect(() => {
    if (professorOptions.length === 0) {
      setSelectedProfessor("");
      return;
    }
    if (selectedProfessor && !professorOptions.includes(selectedProfessor)) {
      setSelectedProfessor(professorOptions[0]);
    }
  }, [professorOptions, selectedProfessor]);

  useEffect(() => {
    const availableKeys = new Set(exportClassGrid.map((item) => classSelectionKey(item)));
    setSelectedExportClassKeys((prev) => {
      const kept = prev.filter((key) => availableKeys.has(key));
      if (kept.length > 0 || exportClassGrid.length === 0) return kept;
      if (!hasInitializedExportSelection) {
        return exportClassGrid.map((item) => classSelectionKey(item));
      }
      return kept;
    });
    if (!hasInitializedExportSelection && exportClassGrid.length > 0) {
      setHasInitializedExportSelection(true);
    }
  }, [exportClassGrid, hasInitializedExportSelection]);

  useEffect(() => {
    let isMounted = true;
    setClassesData([]);
    getReports({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        setClassesData(normalizeReportsData(response.data));
      })
      .catch(() => {
        if (isMounted) setClassesData([]);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

  useEffect(() => {
    getAcademicCalendar({ month: selectedMonth })
      .then((response) => {
        const payload = (response?.data || {}) as {
          settings?: AcademicCalendarSettings | null;
          events?: AcademicCalendarEvent[];
          bankHours?: Array<{ teacher?: string; hours?: number }>;
        };

        const [selectedYear] = selectedMonth.split("-");
        const year = Number(selectedYear);
        const defaultSettings: AcademicCalendarSettings = {
          schoolYear: year,
          inicioAulas: `${selectedYear}-01-01`,
          feriasInvernoInicio: `${selectedYear}-07-01`,
          feriasInvernoFim: `${selectedYear}-07-31`,
          terminoAulas: `${selectedYear}-12-31`,
        };

        const incomingSettings = payload.settings || null;
        setCalendarSettings(incomingSettings || defaultSettings);
        setPeriodsCollapsed(Boolean(incomingSettings));
        setCalendarEvents(Array.isArray(payload.events) ? payload.events : []);
        setBankHours(
          Array.isArray(payload.bankHours)
            ? payload.bankHours.map((item) => ({
                teacher: String(item.teacher || ""),
                hours: Number(item.hours || 0),
              }))
            : []
        );
      })
      .catch(() => {
        const [selectedYear] = selectedMonth.split("-");
        setCalendarSettings({
          schoolYear: Number(selectedYear),
          inicioAulas: `${selectedYear}-01-01`,
          feriasInvernoInicio: `${selectedYear}-07-01`,
          feriasInvernoFim: `${selectedYear}-07-31`,
          terminoAulas: `${selectedYear}-12-31`,
        });
        setPeriodsCollapsed(false);
        setCalendarEvents([]);
        setBankHours([]);
      });
  }, [selectedMonth]);

  const handleSaveCalendarSettings = async () => {
    if (!calendarSettings) return;
    setSavingCalendarSettings(true);
    try {
      await saveAcademicCalendarSettings(calendarSettings);
      alert("Períodos salvos com sucesso.");
      setPeriodsCollapsed(true);
    } catch {
      alert("Falha ao salvar períodos.");
    } finally {
      setSavingCalendarSettings(false);
    }
  };

  const handleOpenEventModal = (date: string, type: CalendarEventForm["type"] = "feriado") => {
    const defaultAllDay = type === "reuniao" || type === "feriado" || type === "ponte";
    setEventForm({
      date,
      type,
      allDay: defaultAllDay,
      startTime: "",
      endTime: "",
      description: "",
    });
    setEventModalOpen(true);
  };

  const handleSaveEvent = async () => {
    const teacherProfileRaw = localStorage.getItem("teacherProfile");
    let teacherName = "";
    if (teacherProfileRaw) {
      try {
        teacherName = JSON.parse(teacherProfileRaw)?.name || "";
      } catch {
        teacherName = "";
      }
    }

    if (eventForm.type === "reuniao" && !eventForm.allDay && (!eventForm.startTime || !eventForm.endTime)) {
      alert("Informe início e término para reunião por período.");
      return;
    }
    if (eventForm.type === "evento" && (!eventForm.startTime || !eventForm.endTime)) {
      alert("Informe início e término para evento.");
      return;
    }

    try {
      await saveAcademicCalendarEvent({
        ...eventForm,
        teacher: teacherName || selectedProfessor || currentClassData?.professor || "",
      });
      const refresh = await getAcademicCalendar({ month: selectedMonth });
      const payload = (refresh?.data || {}) as {
        events?: AcademicCalendarEvent[];
        bankHours?: Array<{ teacher?: string; hours?: number }>;
      };
      setCalendarEvents(Array.isArray(payload.events) ? payload.events : []);
      setBankHours(
        Array.isArray(payload.bankHours)
          ? payload.bankHours.map((item) => ({
              teacher: String(item.teacher || ""),
              hours: Number(item.hours || 0),
            }))
          : []
      );
      setEventModalOpen(false);
    } catch {
      alert("Falha ao salvar evento no calendário.");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteAcademicCalendarEvent(id);
      const refresh = await getAcademicCalendar({ month: selectedMonth });
      const payload = (refresh?.data || {}) as {
        events?: AcademicCalendarEvent[];
        bankHours?: Array<{ teacher?: string; hours?: number }>;
      };
      setCalendarEvents(Array.isArray(payload.events) ? payload.events : []);
      setBankHours(
        Array.isArray(payload.bankHours)
          ? payload.bankHours.map((item) => ({
              teacher: String(item.teacher || ""),
              hours: Number(item.hours || 0),
            }))
          : []
      );
    } catch {
      alert("Não foi possível remover o registro.");
    }
  };

  const selectedMonthDates = useMemo(() => {
    const { first, last } = monthRange(selectedMonth);
    const days: Date[] = [];
    const cursor = new Date(first);
    while (cursor <= last) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [selectedMonth]);

  const selectedMonthDateKeys = useMemo(
    () => selectedMonthDates.map((date) => toDateKey(date)),
    [selectedMonthDates]
  );

  const calendarGridCells = useMemo(() => {
    if (selectedMonthDates.length === 0) return [] as Array<Date | null>;
    const firstWeekday = selectedMonthDates[0].getDay();
    const leadingEmpty = (firstWeekday + 6) % 7;
    const cells: Array<Date | null> = [];
    for (let i = 0; i < leadingEmpty; i += 1) cells.push(null);
    selectedMonthDates.forEach((d) => cells.push(d));
    return cells;
  }, [selectedMonthDates]);

  useEffect(() => {
    const today = getCurrentLocalDateKey();
    setSelectedCalendarDate((prev) => {
      if (prev && prev.startsWith(`${selectedMonth}-`)) return prev;
      if (today.startsWith(`${selectedMonth}-`)) return today;
      return selectedMonthDateKeys[0] || "";
    });
  }, [selectedMonth, selectedMonthDateKeys]);

  useEffect(() => {
    if (selectedMonthDateKeys.length === 0) {
      setWeatherByDate({});
      setLoadingWeatherMonth(false);
      return;
    }

    let isMounted = true;
    const cachedMap: Record<string, WeatherSnapshot> = {};
    const missingDates: string[] = [];

    selectedMonthDateKeys.forEach((dateKey) => {
      const cached = getWeatherCache(dateKey);
      if (cached) {
        cachedMap[dateKey] = cached;
      } else {
        missingDates.push(dateKey);
      }
    });

    setWeatherByDate(cachedMap);

    if (missingDates.length === 0) {
      setLoadingWeatherMonth(false);
      return () => {
        isMounted = false;
      };
    }

    setLoadingWeatherMonth(true);

    fetchWeatherWithConcurrency(missingDates, 5)
      .then((entries) => {
        if (!isMounted) return;
        setWeatherByDate((prev) => {
          const next = { ...prev };
          entries.forEach((item) => {
            next[item.dateKey] = item.snapshot;
          });
          return next;
        });
      })
      .finally(() => {
        if (isMounted) setLoadingWeatherMonth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMonthDateKeys]);

  const plannedClassDays = selectedMonthDateKeys.filter((dateKey) =>
    !isDateClosedForAttendance(dateKey, calendarSettings, calendarEvents)
  );

  const selectedMonthLimits = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const effectiveEnd = todayOnly < monthStart ? null : (todayOnly < monthEnd ? todayOnly : monthEnd);
    return { year, monthIndex, monthStart, effectiveEnd };
  }, [selectedMonth]);

  const plannedClassDaysUntilCurrent = useMemo(() => {
    const { effectiveEnd } = selectedMonthLimits;
    if (!effectiveEnd) return [] as string[];
    const endKey = toDateKey(effectiveEnd);
    return plannedClassDays.filter((dateKey) => dateKey <= endKey);
  }, [plannedClassDays, selectedMonthLimits]);

  const plannedClassDaysUntilCurrentSet = useMemo(
    () => new Set(plannedClassDaysUntilCurrent),
    [plannedClassDaysUntilCurrent]
  );

  const plannedYearDateKeys = (() => {
    const year = Number(selectedYear);
    if (!Number.isFinite(year)) return [] as string[];

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  })();

  const plannedYearDays = plannedYearDateKeys.filter((dateKey) =>
    !isDateClosedForAttendance(dateKey, calendarSettings, calendarEvents)
  );

  const plannedYearCurrentDays = (() => {
    const currentYear = new Date().getFullYear();
    const selectedYearNumber = Number(selectedYear);
    if (!Number.isFinite(selectedYearNumber)) return 0;
    if (selectedYearNumber < currentYear) return plannedYearDays.length;
    if (selectedYearNumber > currentYear) return 0;

    const todayKey = getCurrentLocalDateKey();
    return plannedYearDays.filter((dateKey) => dateKey <= todayKey).length;
  })();

  const plannedDaysProgress = {
    atual: plannedYearCurrentDays,
    total: plannedYearDays.length,
    pct:
      plannedYearDays.length > 0
        ? Math.min(100, Math.round((plannedYearCurrentDays / plannedYearDays.length) * 100))
        : 0,
  };

  const summaryLessonsByHorario = useMemo(() => {
    const { year, monthIndex, effectiveEnd } = selectedMonthLimits;
    if (!effectiveEnd) {
      return {
        byHorario: [] as SummaryLessonsByHorario[],
        totalPrevistas: 0,
        totalRegistradas: 0,
      };
    }

    const endKey = toDateKey(effectiveEnd);
    const todayKey = getCurrentLocalDateKey();
    const filteredClasses = classesData.filter((cls) => {
      const meta = classScheduleMetaByKey.get(classSelectionKey(cls));
      if (!meta || meta.group !== summaryTurmaToggle) return false;
      if (!summaryProfessorToggle) return true;
      return normalizeText(cls.professor) === normalizeText(summaryProfessorToggle);
    });

    const byHorarioMap = new Map<string, { previstas: number; registradas: number }>();

    filteredClasses.forEach((cls) => {
      const horarioKey = formatHorario(cls.horario || "") || "Sem horário";
      const current = byHorarioMap.get(horarioKey) || { previstas: 0, registradas: 0 };
      const weekdays = classScheduleMetaByKey.get(classSelectionKey(cls))?.weekdays || [];

      const previstas = plannedClassDaysUntilCurrent.filter((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        return weekdays.includes(date.getDay());
      }).length;

      const recordedDays = new Set<string>();
      cls.alunos.forEach((aluno) => {
        Object.entries(aluno.historico || {}).forEach(([rawDay, status]) => {
          const normalizedStatus = String(status || "").toLowerCase();
          if (!["c", "f", "j"].includes(normalizedStatus)) return;
          const parsed = parseHistoricoDayToDate(rawDay, year, monthIndex);
          if (!parsed) return;
          const parsedKey = toDateKey(parsed);
          if (normalizedStatus === "j" && parsedKey > todayKey) return;
          if (parsedKey > endKey) return;
          const isPlannedDay = plannedClassDaysUntilCurrentSet.has(parsedKey);
          const isRetroactiveInSelectedMonth =
            parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
          if (!isPlannedDay && !isRetroactiveInSelectedMonth) return;
          if (isDateClosedForAttendance(parsedKey, calendarSettings, calendarEvents)) return;
          if (!weekdays.includes(parsed.getDay())) return;
          recordedDays.add(parsedKey);
        });
      });

      current.previstas += previstas;
      current.registradas += recordedDays.size;
      byHorarioMap.set(horarioKey, current);
    });

    const byHorario = Array.from(byHorarioMap.entries())
      .map(([horario, values]) => ({
        horario,
        previstas: values.previstas,
        registradas: values.registradas,
      }))
      .sort((a, b) => getHorarioSortValue(a.horario) - getHorarioSortValue(b.horario));

    return {
      byHorario,
      totalPrevistas: byHorario.reduce((acc, item) => acc + item.previstas, 0),
      totalRegistradas: byHorario.reduce((acc, item) => acc + item.registradas, 0),
    };
  }, [
    calendarEvents,
    calendarSettings,
    classScheduleMetaByKey,
    classesData,
    plannedClassDaysUntilCurrent,
    plannedClassDaysUntilCurrentSet,
    selectedMonthLimits,
    summaryProfessorToggle,
    summaryTurmaToggle,
  ]);

  const climateCancellationKeywords = ["climaticas", "cloro", "ocorrencia", "feriado", "ponte"];
  const totalCancelamentosElegiveis = useMemo(() => {
    const { effectiveEnd } = selectedMonthLimits;
    if (!effectiveEnd || plannedClassDaysUntilCurrent.length === 0) return 0;

    const endKey = toDateKey(effectiveEnd);
    const eligibleDateKeys = new Set<string>();

    calendarEvents.forEach((event) => {
      const dateKey = String(event.date || "");
      if (!dateKey.startsWith(`${selectedMonth}-`)) return;
      if (dateKey > endKey) return;

      const normalizedDescription = normalizeText(String(event.description || ""));
      const eligibleByType = event.type === "feriado" || event.type === "ponte";
      const eligibleByDescription = climateCancellationKeywords.some((keyword) =>
        normalizedDescription.includes(keyword)
      );

      if (eligibleByType || eligibleByDescription) {
        eligibleDateKeys.add(dateKey);
      }
    });

    if (eligibleDateKeys.size === 0) return 0;

    let canceledClassLessons = 0;

    classesData.forEach((cls) => {
      const meta = classScheduleMetaByKey.get(classSelectionKey(cls));
      if (!meta || meta.group === "outros") return;

      const weekdays = meta.weekdays;
      if (weekdays.length === 0) return;

      plannedClassDaysUntilCurrent.forEach((dateKey) => {
        if (!eligibleDateKeys.has(dateKey)) return;
        const date = new Date(`${dateKey}T00:00:00`);
        if (weekdays.includes(date.getDay())) {
          canceledClassLessons += 1;
        }
      });
    });

    return canceledClassLessons;
  }, [
    calendarEvents,
    classScheduleMetaByKey,
    classesData,
    plannedClassDaysUntilCurrent,
    selectedMonth,
    selectedMonthLimits,
  ]);

  // Aproveitamento global — considera TODAS as turmas/professores, sem filtro de toggle
  const globalClassTotalsUntilCurrent = useMemo(() => {
    const { year, monthIndex, effectiveEnd } = selectedMonthLimits;
    if (!effectiveEnd) return { previstas: 0, dadas: 0 };
    const endKey = toDateKey(effectiveEnd);
    const todayKey = getCurrentLocalDateKey();
    let previstasTotal = 0;
    let dadasTotal = 0;
    classesData.forEach((cls) => {
      const meta = classScheduleMetaByKey.get(classSelectionKey(cls));
      if (!meta || meta.group === "outros") return;
      const weekdays = meta.weekdays;
      if (weekdays.length === 0) return;
      const previstas = plannedClassDaysUntilCurrent.filter((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        return weekdays.includes(date.getDay());
      }).length;
      const recordedDays = new Set<string>();
      cls.alunos.forEach((aluno) => {
        Object.entries(aluno.historico || {}).forEach(([rawDay, status]) => {
          const normalizedStatus = String(status || "").toLowerCase();
          if (!["c", "f", "j"].includes(normalizedStatus)) return;
          const parsed = parseHistoricoDayToDate(rawDay, year, monthIndex);
          if (!parsed) return;
          const parsedKey = toDateKey(parsed);
          if (normalizedStatus === "j" && parsedKey > todayKey) return;
          if (parsedKey > endKey) return;
          const isPlannedDay = plannedClassDaysUntilCurrentSet.has(parsedKey);
          const isRetroactive = parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
          if (!isPlannedDay && !isRetroactive) return;
          if (isDateClosedForAttendance(parsedKey, calendarSettings, calendarEvents)) return;
          if (!weekdays.includes(parsed.getDay())) return;
          recordedDays.add(parsedKey);
        });
      });
      previstasTotal += previstas;
      dadasTotal += recordedDays.size;
    });
    return { previstas: previstasTotal, dadas: dadasTotal };
  }, [
    calendarEvents, calendarSettings, classScheduleMetaByKey, classesData,
    plannedClassDaysUntilCurrent, plannedClassDaysUntilCurrentSet, selectedMonthLimits,
  ]);

  const totalAulasDadas = globalClassTotalsUntilCurrent.dadas;
  const totalAulasPrevistas = globalClassTotalsUntilCurrent.previstas;
  const totalAulasPrevistasValidas = Math.max(0, totalAulasPrevistas - totalCancelamentosElegiveis);
  const aproveitamentoAulas =
    totalAulasPrevistasValidas > 0
      ? Math.max(0, Math.min(100, Math.round((totalAulasDadas / totalAulasPrevistasValidas) * 100)))
      : 0;

  const selectedDateEvents = calendarEvents.filter((event) => event.date === selectedCalendarDate);
  const selectedDateWeather = selectedCalendarDate ? weatherByDate[selectedCalendarDate] : null;

  const currentClassData =
    classesData.find(
      (c) =>
        c.turma === selectedTurmaLabel &&
        c.horario === selectedHorario &&
        c.professor === selectedProfessor
    ) ||
    classesData.find((c) => c.turma === selectedTurmaLabel) ||
    classesData[0] ||
    null;

  const selectedClassCode = (() => {
    const fromBootstrap = bootstrapClasses.find(
      (cls) =>
        cls.turmaLabel === (currentClassData?.turma || selectedTurmaLabel) &&
        cls.horario === (currentClassData?.horario || selectedHorario) &&
        cls.professor === (currentClassData?.professor || selectedProfessor)
    );
    if (fromBootstrap?.grupo || fromBootstrap?.codigo) return fromBootstrap.grupo || fromBootstrap.codigo;

    const fromStudents = studentsSnapshot.find(
      (student) =>
        (student.turma || "") === (currentClassData?.turma || selectedTurmaLabel) &&
        (student.horario || "") === (currentClassData?.horario || selectedHorario) &&
        (student.professor || "") === (currentClassData?.professor || selectedProfessor) &&
        (student.grupo || student.turmaCodigo)
    );
      return fromStudents?.grupo || fromStudents?.turmaCodigo || "-";
  })();
  const selectedClassCodeLower = (selectedClassCode || "-").toLowerCase();

  const isExcludedStudentForVacancy = (student: ActiveStudentLite, exclusion: ExclusionLite) => {
    const studentUid = String(student?.studentUid || "").trim();
    const exclusionUid = String(exclusion?.student_uid || exclusion?.studentUid || "").trim();
    if (studentUid && exclusionUid && studentUid === exclusionUid) {
      return true;
    }

    const studentId = String(student?.id || "").trim();
    const exclusionId = String(exclusion?.id || "").trim();
    if (studentId && exclusionId && studentId === exclusionId) {
      return true;
    }

    const studentName = normalizeText(student?.nome || "");
    const exclusionName = normalizeText(exclusion?.nome || exclusion?.Nome || "");
    if (!studentName || !exclusionName || studentName !== exclusionName) return false;

    const studentTurmas = new Set(
      [student?.turma, student?.grupo, student?.turmaCodigo]
        .map((value) => normalizeText(String(value || "")))
        .filter(Boolean)
    );
    const exclusionTurmas = new Set(
      [
        exclusion?.turma,
        exclusion?.Turma,
        exclusion?.turmaLabel,
        exclusion?.TurmaLabel,
        exclusion?.grupo,
        exclusion?.Grupo,
        exclusion?.turmaCodigo,
        exclusion?.TurmaCodigo,
      ]
        .map((value) => normalizeText(String(value || "")))
        .filter(Boolean)
    );

    const hasTurmaContext = studentTurmas.size > 0 && exclusionTurmas.size > 0;
    const turmaMatches = !hasTurmaContext || Array.from(exclusionTurmas).some((value) => studentTurmas.has(value));
    if (!turmaMatches) return false;

    const studentHorario = normalizeHorarioSelectionKey(student?.horario || "");
    const exclusionHorario = normalizeHorarioSelectionKey(String(exclusion?.horario || exclusion?.Horario || ""));
    const hasHorarioContext = Boolean(studentHorario && exclusionHorario);
    if (hasHorarioContext && studentHorario !== exclusionHorario) return false;

    const studentProfessor = normalizeText(student?.professor || "");
    const exclusionProfessor = normalizeText(String(exclusion?.professor || exclusion?.Professor || ""));
    const hasProfessorContext = Boolean(studentProfessor && exclusionProfessor);
    if (hasProfessorContext && studentProfessor !== exclusionProfessor) return false;

    // Backward compatibility: legacy exclusions may have only student name.
    // If name (or uid/id) matched and no contextual conflict was found above,
    // consider the student excluded.
    return true;
  };

  const vacancyRows = useMemo(() => {
    type ScheduleGroup = "terca-quinta" | "quarta-sexta" | "outros";

    const activeStudents = studentsSnapshot.filter(
      (student) => !excludedSnapshot.some((exclusion) => isExcludedStudentForVacancy(student, exclusion))
    );

    const detailByKey = new Map<
      string,
      {
        key: string;
        groupKey: string;
        periodoGrupo: ScheduleGroup;
        periodoLabel: string;
        horario: string;
        turmaAgrupada: string;
        turmasDetalhe: Set<string>;
        professor: string;
        nivel: string;
        lotacao: number;
        capacidade: number;
        publicationOrder: number;
        professores: string[];
        niveis: string[];
      }
    >();

    const groupedByHorario = new Map<
      string,
      {
        lotacao: number;
        capacidade: number;
        publicationOrder: number;
      }
    >();

    bootstrapClasses.forEach((cls, clsIndex) => {
      const horarioKey = normalizeHorarioSelectionKey(cls.horario || "");
      if (!horarioKey) return;

      const scheduleGroup: ScheduleGroup = resolveScheduleGroupForVacancy(cls.diasSemana || "", cls.turmaLabel || "");
      const groupKey = `${scheduleGroup}||${horarioKey}`;

      const turmaCandidates = [cls.turmaLabel, cls.codigo, cls.grupo]
        .map((value) => normalizeText(String(value || "")))
        .filter(Boolean);

      const professorKey = normalizeText(cls.professor || "");
      const classLotacao = activeStudents.filter((student) => {
        const studentHorarioKey = normalizeHorarioSelectionKey(student.horario || "");
        if (!studentHorarioKey || studentHorarioKey !== horarioKey) return false;
        if (normalizeText(student.professor || "") !== professorKey) return false;

        const studentTurmas = [student.turma, student.grupo, student.turmaCodigo]
          .map((value) => normalizeText(String(value || "")))
          .filter(Boolean);

        if (turmaCandidates.length === 0 || studentTurmas.length === 0) return false;
        return turmaCandidates.some((candidate) => studentTurmas.includes(candidate));
      }).length;

      const detailKey = [
        scheduleGroup,
        horarioKey,
        normalizeText(cls.professor || ""),
        normalizeText(cls.nivel || ""),
      ].join("||") || `detail-${clsIndex}`;

      const currentDetail = detailByKey.get(detailKey) || {
        key: `detail:${detailKey}`,
        groupKey,
        periodoGrupo: scheduleGroup,
        periodoLabel: scheduleGroupLabel[scheduleGroup],
        horario: cls.horario || horarioKey,
        turmaAgrupada: scheduleGroupLabel[scheduleGroup],
        turmasDetalhe: new Set<string>(),
        professor: cls.professor || "-",
        nivel: cls.nivel || "-",
        lotacao: 0,
        capacidade: 0,
        publicationOrder: clsIndex,
        professores: cls.professor ? [cls.professor] : [],
        niveis: cls.nivel ? [cls.nivel] : [],
      };

      currentDetail.capacidade += Math.max(0, Number(cls.capacidade || 0));
      currentDetail.lotacao += classLotacao;
      if (cls.turmaLabel) currentDetail.turmasDetalhe.add(cls.turmaLabel);
      if (!currentDetail.professor && cls.professor) currentDetail.professor = cls.professor;
      if (!currentDetail.nivel && cls.nivel) currentDetail.nivel = cls.nivel;
      currentDetail.publicationOrder = Math.min(currentDetail.publicationOrder, clsIndex);

      detailByKey.set(detailKey, currentDetail);

      const currentGrouped = groupedByHorario.get(groupKey) || { lotacao: 0, capacidade: 0, publicationOrder: clsIndex };
      currentGrouped.lotacao += classLotacao;
      currentGrouped.capacidade += Math.max(0, Number(cls.capacidade || 0));
      currentGrouped.publicationOrder = Math.min(currentGrouped.publicationOrder, clsIndex);
      groupedByHorario.set(groupKey, currentGrouped);
    });

    return Array.from(detailByKey.values())
      .map((row) => {
        const grouped =
          groupedByHorario.get(row.groupKey) ||
          { lotacao: row.lotacao, capacidade: row.capacidade, publicationOrder: row.publicationOrder };
        const vagasDisponiveis = Math.max(0, grouped.capacidade - grouped.lotacao);
        const excesso = Math.max(0, grouped.lotacao - grouped.capacidade);
        const ocupacaoPct = grouped.capacidade > 0 ? Math.round((grouped.lotacao / grouped.capacidade) * 100) : 0;

        return {
          ...row,
          turma: Array.from(row.turmasDetalhe).sort((a, b) => a.localeCompare(b)).join(" | ") || "-",
          lotacaoHorario: grouped.lotacao,
          capacidadeHorario: grouped.capacidade,
          publicationOrder: grouped.publicationOrder,
          detailPublicationOrder: row.publicationOrder,
          vagasDisponiveis,
          excesso,
          ocupacaoPct,
        };
      })
      .sort((a, b) => {
        const periodRank = (value: string) => {
          if (value === "terca-quinta") return 0;
          if (value === "quarta-sexta") return 1;
          return 2;
        };
        const byPeriod = periodRank(a.periodoGrupo) - periodRank(b.periodoGrupo);
        if (byPeriod !== 0) return byPeriod;

        const byHorario = getHorarioSortValue(a.horario) - getHorarioSortValue(b.horario);
        if (byHorario !== 0) return byHorario;

        const byPublication = (a.publicationOrder || 0) - (b.publicationOrder || 0);
        if (byPublication !== 0) return byPublication;

        const byProfessor = a.professor.localeCompare(b.professor);
        if (byProfessor !== 0) return byProfessor;

        return a.nivel.localeCompare(b.nivel);
      });
  }, [bootstrapClasses, excludedSnapshot, studentsSnapshot]);

  const vacancyNivelOptions = useMemo(
    () => Array.from(new Set(vacancyRows.flatMap((row) => row.niveis || []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [vacancyRows]
  );

  const vacancyProfessorOptions = useMemo(
    () => Array.from(new Set(vacancyRows.flatMap((row) => row.professores || []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [vacancyRows]
  );

  const filteredVacancyRows = useMemo(() => {
    const searchKey = normalizeText(vacancySearch || "");

    return vacancyRows.filter((row) => {
      if (vacancyNivelFilter && !(row.niveis || []).includes(vacancyNivelFilter)) return false;
      if (vacancyProfessorFilter && !(row.professores || []).includes(vacancyProfessorFilter)) return false;
      if (!searchKey) return true;

      const rowSearch = [
        row.turma,
        row.nivel,
        row.professor,
        row.periodoLabel,
        formatHorario(row.horario),
        `${row.lotacao}/${row.capacidade}`,
      ]
        .map((value) => normalizeText(String(value || "")))
        .join(" ");

      return rowSearch.includes(searchKey);
    });
  }, [vacancyNivelFilter, vacancyProfessorFilter, vacancyRows, vacancySearch]);

  const vacancySummary = useMemo(() => {
    const uniqueHorario = new Map<string, { lotacaoHorario: number; capacidadeHorario: number }>();
    filteredVacancyRows.forEach((row) => {
      if (!uniqueHorario.has(row.groupKey)) {
        uniqueHorario.set(row.groupKey, {
          lotacaoHorario: row.lotacaoHorario,
          capacidadeHorario: row.capacidadeHorario,
        });
      }
    });

    const totalCapacidade = Array.from(uniqueHorario.values()).reduce((acc, row) => acc + row.capacidadeHorario, 0);
    const totalLotacao = Array.from(uniqueHorario.values()).reduce((acc, row) => acc + row.lotacaoHorario, 0);
    // "Vagas reais" e "Excesso real" devem somar por bloco (sem compensar um bloco pelo outro).
    const totalVagas = Array.from(uniqueHorario.values()).reduce(
      (acc, row) => acc + Math.max(0, row.capacidadeHorario - row.lotacaoHorario),
      0
    );
    const totalExcesso = Array.from(uniqueHorario.values()).reduce(
      (acc, row) => acc + Math.max(0, row.lotacaoHorario - row.capacidadeHorario),
      0
    );
    return { totalCapacidade, totalLotacao, totalVagas, totalExcesso };
  }, [filteredVacancyRows]);

  const getVacancyPeriodRank = (value: string) => {
    const normalized = normalizeText(String(value || ""));
    if (normalized.includes("ter") && normalized.includes("qui")) return 0;
    if (normalized.includes("qua") && normalized.includes("sex")) return 1;
    return 2;
  };

  const getVacancyLevelSortParts = (nivel: string) => {
    const normalized = normalizeText(String(nivel || ""));
    if (!normalized) return { bucket: 99, number: 999, suffix: "" };
    if (normalized.includes("iniciac")) return { bucket: 0, number: 0, suffix: "" };
    if (normalized.includes("adult")) {
      const suffixMatch = normalized.match(/adult[a-z]*\s*([a-z])$/i);
      return { bucket: 2, number: 0, suffix: suffixMatch ? suffixMatch[1].toUpperCase() : "" };
    }

    const numberMatch = normalized.match(/(\d+)\s*([a-z])?$/i);
    if (numberMatch) {
      return {
        bucket: 1,
        number: Number.parseInt(numberMatch[1], 10),
        suffix: numberMatch[2] ? numberMatch[2].toUpperCase() : "",
      };
    }

    return { bucket: 3, number: 999, suffix: normalized };
  };

  const vacancyPrintBlocks = useMemo(() => {
    type VacancyPrintRow = {
      nivel: string;
      lotacao: number;
      capacidade: number;
      professor: string;
      publicationOrder: number;
    };

    type VacancyPrintBlock = {
      groupKey: string;
      periodoLabel: string;
      horario: string;
      publicationOrder: number;
      lotacaoHorario: number;
      capacidadeHorario: number;
      vagasDisponiveis: number;
      excesso: number;
      rows: VacancyPrintRow[];
    };

    const blocks = Array.from(
      filteredVacancyRows.reduce((acc, row) => {
        const current =
          acc.get(row.groupKey) ||
          {
            groupKey: row.groupKey,
            periodoLabel: row.periodoLabel,
            horario: row.horario,
            publicationOrder: Number(row.publicationOrder || 0),
            lotacaoHorario: row.lotacaoHorario,
            capacidadeHorario: row.capacidadeHorario,
            vagasDisponiveis: row.vagasDisponiveis,
            excesso: row.excesso,
            rows: [] as VacancyPrintRow[],
          };

        current.rows.push({
          nivel: String(row.nivel || "-").trim() || "-",
          lotacao: Number(row.lotacao || 0),
          capacidade: Number(row.capacidade || 0),
          professor: String(row.professor || "-").trim() || "-",
          publicationOrder: Number(row.detailPublicationOrder || row.publicationOrder || 0),
        });

        acc.set(row.groupKey, current);
        return acc;
      }, new Map<string, VacancyPrintBlock>())
        .values()
    ).map((block) => ({
      ...block,
      rows: [...block.rows].sort((a, b) => {
        const byPublication = (a.publicationOrder || 0) - (b.publicationOrder || 0);
        if (byPublication !== 0) return byPublication;

        const aSort = getVacancyLevelSortParts(a.nivel);
        const bSort = getVacancyLevelSortParts(b.nivel);
        const byBucket = aSort.bucket - bSort.bucket;
        if (byBucket !== 0) return byBucket;
        const byNumber = aSort.number - bSort.number;
        if (byNumber !== 0) return byNumber;
        const bySuffix = aSort.suffix.localeCompare(bSort.suffix);
        if (bySuffix !== 0) return bySuffix;
        const byNivelLabel = a.nivel.localeCompare(b.nivel);
        if (byNivelLabel !== 0) return byNivelLabel;
        return a.professor.localeCompare(b.professor);
      }),
    }));

    return blocks.sort((a, b) => {
      const byPeriod = getVacancyPeriodRank(a.periodoLabel) - getVacancyPeriodRank(b.periodoLabel);
      if (byPeriod !== 0) return byPeriod;

      const byHorario = getHorarioSortValue(a.horario) - getHorarioSortValue(b.horario);
      if (byHorario !== 0) return byHorario;

      const byPublication = (a.publicationOrder || 0) - (b.publicationOrder || 0);
      if (byPublication !== 0) return byPublication;

      return a.groupKey.localeCompare(b.groupKey);
    });
  }, [filteredVacancyRows]);

  const handleExportVacanciesXlsx = async () => {
    if (filteredVacancyRows.length === 0) {
      alert("Não há dados de vagas para exportar.");
      return;
    }

    try {
      const response = await downloadVacanciesExcelReport({
        generatedAt: new Date().toLocaleString("pt-BR"),
        summary: vacancySummary,
        blocks: vacancyPrintBlocks,
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_Vagas_${getCurrentLocalDateKey()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Falha ao exportar vagas em XLSX pelo backend.");
    }
  };

  const handleDownloadVacanciesPdf = async () => {
    if (filteredVacancyRows.length === 0) {
      alert("Não há dados de vagas para exportar em PDF.");
      return;
    }

    try {
      const response = await downloadVacanciesPdfReport({
        generatedAt: new Date().toLocaleString("pt-BR"),
        summary: vacancySummary,
        blocks: vacancyPrintBlocks,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_Vagas_${getCurrentLocalDateKey()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Falha ao exportar vagas em PDF pelo backend.");
    }
  };

  const handleGenerateExcel = async () => {
    const selectedClasses = exportClassGrid
      .filter((item) => selectedExportClassKeys.includes(classSelectionKey(item)))
      .map((item) => ({ turmaCodigo: item.turmaCodigo || "", turma: item.turma, horario: item.horario, professor: item.professor }));

    if (selectedClasses.length === 0) {
      alert("Selecione pelo menos uma turma para exportação.");
      return;
    }

    try {
      const response = await downloadMultiClassExcelReport({
        month: selectedMonth,
        classes: selectedClasses,
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_Multiturmas_${selectedMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Falha ao gerar o relatório no template. Verifique o arquivo de referência.");
    }
  };

  const handleGenerateChamadaPdf = async () => {
    const selectedClasses = exportClassGrid
      .filter((item) => selectedExportClassKeys.includes(classSelectionKey(item)))
      .map((item) => ({ turmaCodigo: item.turmaCodigo || "", turma: item.turma, horario: item.horario, professor: item.professor }));

    if (selectedClasses.length === 0) {
      alert("Selecione pelo menos uma turma para exportação em PDF.");
      return;
    }

    try {
      const response = await downloadChamadaPdfReport({
        month: selectedMonth,
        classes: selectedClasses,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_Multiturmas_${selectedMonth}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Falha ao gerar o PDF de chamada.");
    }
  };

  const handleToggleAllGrid = () => {
    if (allGridSelected) {
      setSelectedExportClassKeys([]);
      return;
    }
    setSelectedExportClassKeys(exportClassGrid.map((item) => classSelectionKey(item)));
  };

  const toggleExportClass = (key: string) => {
    setSelectedExportClassKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  return (
    <div className="reports-root" style={{ padding: "20px", borderRadius: "16px" }}>
      <div className="reports-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "20px" }}>
        <div>
          <h2 style={{ color: "#1f2937", margin: 0 }}>Relatórios e Análises</h2>
          <p style={{ color: "#666", margin: "5px 0 0" }}>Selecione um módulo para visualizar os dados.</p>
        </div>
      </div>

      <div className="reports-tabs">
        <button className={`reports-tab ${activeTab === "resumo" ? "active" : ""}`} onClick={() => setActiveTab("resumo")}>
          📊 Resumo Geral
        </button>
        <button className={`reports-tab ${activeTab === "graficos" ? "active" : ""}`} onClick={() => setActiveTab("graficos")}>
          📈 Gráficos
        </button>
        <button className={`reports-tab ${activeTab === "estatisticas" ? "active" : ""}`} onClick={() => setActiveTab("estatisticas")}>
          📈 Estatísticas
        </button>
        <button className={`reports-tab ${activeTab === "frequencias" ? "active" : ""}`} onClick={() => setActiveTab("frequencias")}>
          📅 Frequência e Planejamento
        </button>
        <button className={`reports-tab ${activeTab === "vagas" ? "active" : ""}`} onClick={() => setActiveTab("vagas")}>
          🧩 Vagas
        </button>
      </div>

      {activeTab === "resumo" && (
        <div className="reports-section">
          <div className="reports-summary-layout">
            <div className="reports-summary-main">
              <div className={`report-card reports-period-card ${periodsCollapsed ? "is-collapsed" : ""}`}>
                <div className="reports-period-header-row">
                  <h3>Períodos Letivos</h3>
                  <button
                    className="btn-secondary"
                    onClick={() => setPeriodsCollapsed((prev) => !prev)}
                  >
                    {periodsCollapsed ? "Editar" : "Recolher"}
                  </button>
                </div>
                {!periodsCollapsed && (
                  <>
                    <div className="reports-period-grid">
                      <div className="reports-filter-field">
                        <label>Início das aulas</label>
                        <input
                          type="date"
                          value={calendarSettings?.inicioAulas || ""}
                          onChange={(e) =>
                            setCalendarSettings((prev) =>
                              prev ? { ...prev, inicioAulas: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                      <div className="reports-filter-field">
                        <label>Férias de inverno (início)</label>
                        <input
                          type="date"
                          value={calendarSettings?.feriasInvernoInicio || ""}
                          onChange={(e) =>
                            setCalendarSettings((prev) =>
                              prev ? { ...prev, feriasInvernoInicio: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                      <div className="reports-filter-field">
                        <label>Férias de inverno (fim)</label>
                        <input
                          type="date"
                          value={calendarSettings?.feriasInvernoFim || ""}
                          onChange={(e) =>
                            setCalendarSettings((prev) =>
                              prev ? { ...prev, feriasInvernoFim: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                      <div className="reports-filter-field">
                        <label>Término das aulas</label>
                        <input
                          type="date"
                          value={calendarSettings?.terminoAulas || ""}
                          onChange={(e) =>
                            setCalendarSettings((prev) =>
                              prev ? { ...prev, terminoAulas: e.target.value } : prev
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="reports-period-actions">
                      <button className="btn-primary" onClick={handleSaveCalendarSettings} disabled={savingCalendarSettings}>
                        {savingCalendarSettings ? "Salvando..." : "Salvar períodos"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="report-card reports-calendar-card">
                <div className="reports-calendar-header">
                  <div className="reports-calendar-title-row">
                    <h3>Calendário/ Planejamento</h3>
                    <div className="reports-calendar-period-filter">
                      <button
                        type="button"
                        className="reports-calendar-nav-btn"
                        onClick={() => shiftSelectedMonth(-1)}
                        aria-label="Mês anterior"
                        title="Mês anterior"
                      >
                        ◀
                      </button>
                      <select
                        value={selectedMonthNumber}
                        onChange={(e) => updateCalendarPeriod(selectedYear, e.target.value)}
                      >
                        {monthOptions.map((monthOpt) => (
                          <option key={monthOpt.value} value={monthOpt.value}>
                            {monthOpt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedYear}
                        onChange={(e) => updateCalendarPeriod(e.target.value, selectedMonthNumber)}
                      >
                        {yearOptions.map((yearOpt) => (
                          <option key={yearOpt} value={yearOpt}>
                            {yearOpt}
                          </option>
                        ))}
                      </select>
                        <button
                          type="button"
                          className="reports-calendar-today-btn"
                          onClick={goToCurrentMonth}
                        >
                          Hoje
                        </button>
                        <button
                          type="button"
                          className="reports-calendar-nav-btn"
                          onClick={() => shiftSelectedMonth(1)}
                          aria-label="Próximo mês"
                          title="Próximo mês"
                        >
                          ▶
                        </button>
                    </div>
                  </div>
                  <p>Selecione uma data no calendário e registre na lateral por tipo.</p>
                </div>
                <div className="reports-calendar-content">
                  <div>
                    <div className="reports-calendar-weekdays">
                      {weekdayMonToSun.map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="reports-calendar-grid">
                    {calendarGridCells.map((dateObj, index) => {
                      if (!dateObj) {
                        return <div key={`empty-${index}`} className="reports-calendar-day is-empty" />;
                      }
                      const dateKey = toDateKey(dateObj);
                      const dayWeather = weatherByDate[dateKey];
                      const isWeatherLoadingForDay = loadingWeatherMonth && !dayWeather;
                      const hasWeatherAlert = dayWeather ? isWeatherAlertCondition(dayWeather.condition) : false;
                      const dayEvents = calendarEvents.filter((event) => event.date === dateKey);
                      const isClosed = isDateClosedForAttendance(dateKey, calendarSettings, calendarEvents);
                      const isWinterBreak = isWithinRange(
                        dateKey,
                        calendarSettings?.feriasInvernoInicio,
                        calendarSettings?.feriasInvernoFim
                      );
                      const dayHolidayBridgeEvents = dayEvents.filter(
                        (event) => event.type === "feriado" || event.type === "ponte"
                      );
                      const dayMeetingEvents = dayEvents.filter((event) => event.type === "reuniao");
                      const dayGenericEvents = dayEvents.filter((event) => event.type === "evento");
                      const hasRecessoIndicator = isWinterBreak || isClosed || dayHolidayBridgeEvents.length > 0;
                      const hasMeetingIndicator = dayMeetingEvents.length > 0;
                      const hasEventIndicator = dayGenericEvents.length > 0;

                      const buildDescriptionTooltip = (label: string, descriptions: string[], fallback: string) => {
                        const uniqueDescriptions = Array.from(
                          new Set(
                            descriptions
                              .map((description) => String(description || "").trim())
                              .filter(Boolean)
                          )
                        );
                        if (uniqueDescriptions.length === 0) return `${label}: ${fallback}`;
                        return `${label}: ${uniqueDescriptions.join(" | ")}`;
                      };

                      const recessoTooltip = (() => {
                        const periodLabels: string[] = [];
                        if (isWinterBreak) periodLabels.push("Férias de inverno");
                        if (!isWinterBreak && isClosed && dayHolidayBridgeEvents.length === 0) {
                          periodLabels.push("Recesso");
                        }

                        const eventDescriptions = dayHolidayBridgeEvents.flatMap((event) => {
                          const typeLabel = event.type === "ponte" ? "Ponte" : "Feriado";
                          const rawDescription = String(event.description || "").trim();
                          if (!rawDescription) return [typeLabel];
                          return [typeLabel, rawDescription];
                        });

                        return buildDescriptionTooltip(
                          "Recesso",
                          [...periodLabels, ...eventDescriptions],
                          "Sem descrição"
                        );
                      })();

                      const meetingTooltip = buildDescriptionTooltip(
                        "Reunião",
                        dayMeetingEvents.map((event) => event.description || ""),
                        "Sem descrição"
                      );

                      const eventTooltip = buildDescriptionTooltip(
                        "Evento",
                        dayGenericEvents.map((event) => event.description || ""),
                        "Sem descrição"
                      );

                      return (
                        <div
                          key={dateKey}
                          className={`reports-calendar-day ${isClosed ? "is-closed" : ""} ${isWinterBreak ? "is-winter" : ""} ${hasWeatherAlert ? "is-weather-alert" : ""} ${selectedCalendarDate === dateKey ? "is-selected" : ""}`}
                          onClick={() => setSelectedCalendarDate(dateKey)}
                          onDoubleClick={() => {
                            setSelectedCalendarDate(dateKey);
                            setPlanningCardDate(dateKey);
                            setPlanningCardOpen(true);
                          }}
                        >
                          <div className="reports-calendar-day-top">
                            <strong>{String(dateObj.getDate()).padStart(2, "0")}</strong>
                            <span>{weekdayShort[dateObj.getDay()]}</span>
                          </div>
                          <div className="reports-calendar-indicators">
                            {dayWeather && (
                              <span
                                className={`reports-calendar-climate-indicator ${hasWeatherAlert ? "is-alert" : ""}`}
                                title={`${dayWeather.condition} · ${dayWeather.temp}°C`}
                              >
                                {getWeatherIcon(dayWeather.condition)}
                              </span>
                            )}
                            {isWeatherLoadingForDay && (
                              <span
                                className="reports-calendar-weather-loading"
                                title="Carregando clima"
                                aria-label="Carregando clima"
                              />
                            )}
                            {hasRecessoIndicator && (
                              <span
                                className="reports-calendar-status-dot is-recesso"
                                title={recessoTooltip}
                                aria-label={recessoTooltip}
                              />
                            )}
                            {hasMeetingIndicator && (
                              <span
                                className="reports-calendar-status-dot is-reuniao"
                                title={meetingTooltip}
                                aria-label={meetingTooltip}
                              />
                            )}
                            {hasEventIndicator && (
                              <span
                                className="reports-calendar-status-dot is-evento"
                                title={eventTooltip}
                                aria-label={eventTooltip}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  <div className="reports-calendar-actions">
                    <div className="reports-calendar-selected-date">
                      Data selecionada: <strong>{selectedCalendarDate ? selectedCalendarDate.split("-").reverse().join("/") : "-"}</strong>
                    </div>
                    <div className="reports-calendar-selected-date">
                      {!selectedCalendarDate && <span>Selecione um dia para consultar o clima.</span>}
                      {selectedCalendarDate && loadingWeatherMonth && !selectedDateWeather && <span>Consultando clima...</span>}
                      {selectedCalendarDate && selectedDateWeather && (
                        <>
                          <strong>Clima (API): </strong>
                          <span>
                            {selectedDateWeather.condition} · {selectedDateWeather.temp}°C
                          </span>
                        </>
                      )}
                    </div>
                    <div className="reports-record-chips">
                      {(["feriado", "ponte", "reuniao", "evento"] as CalendarEventForm["type"][]).map((type) => {
                        const typeLabel = type === "reuniao" ? "reunião" : type;
                        return (
                          <button
                            key={type}
                            className="reports-record-chip"
                            disabled={!selectedCalendarDate}
                            onClick={() => selectedCalendarDate && handleOpenEventModal(selectedCalendarDate, type)}
                          >
                            {typeLabel}
                          </button>
                        );
                      })}
                    </div>
                    <div className="reports-class-metrics">
                      {selectedDateEvents.length === 0 && (
                        <div className="reports-section placeholder">Sem registros para a data selecionada.</div>
                      )}
                      {selectedDateEvents.map((event) => (
                        <div key={event.id} className="reports-class-metric-row">
                          <strong>{event.type}</strong>
                          <span>{event.description || "Sem descrição"}</span>
                          {(event.type === "reuniao" || event.type === "evento") && !event.allDay && event.startTime && event.endTime && (
                            <span>{event.startTime} às {event.endTime}</span>
                          )}
                          <button className="btn-secondary" onClick={() => handleDeleteEvent(event.id)}>
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="reports-summary-side">
              <div className="report-card">
                <h3>Dias previstos</h3>
                <div className="reports-kpi-line">
                  <span>{plannedDaysProgress.atual}/{plannedDaysProgress.total} dias de aula no ano</span>
                  <span>{plannedDaysProgress.pct}%</span>
                </div>
                <div className="vagas-bar">
                  <div className="vagas-bar-fill" style={{ width: `${plannedDaysProgress.pct}%` }} />
                </div>
                <div className="vagas-footer">ano {selectedYear}</div>
              </div>

              <div className="report-card">
                <h3>Aproveitamento das aulas dadas</h3>
                <div className="reports-kpi-line">
                  <span>Considerando clima, cloro, ocorrências, feriados e pontes</span>
                  <strong>{aproveitamentoAulas}%</strong>
                </div>
                <div className="vagas-bar">
                  <div className="vagas-bar-fill" style={{ width: `${aproveitamentoAulas}%` }} />
                </div>
                <div className="vagas-footer">
                  Cancelamentos elegíveis: {totalCancelamentosElegiveis} | Previstas válidas: {totalAulasPrevistasValidas} | Dadas: {totalAulasDadas}
                </div>
                <div className="reports-kpi-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowAproveitamentoDetails((prev) => !prev)}
                    aria-expanded={showAproveitamentoDetails}
                  >
                    {showAproveitamentoDetails ? "Ocultar detalhes" : "Detalhes"}
                  </button>
                </div>
              </div>

              {showAproveitamentoDetails && (
                <div className="report-card">
                  <h3>Aulas registradas x previstas</h3>
                  <div className="reports-kpi-line">
                    <span>{summaryLessonsByHorario.totalRegistradas}/{summaryLessonsByHorario.totalPrevistas}</span>
                    <strong>
                      {summaryLessonsByHorario.totalPrevistas > 0
                        ? Math.round((summaryLessonsByHorario.totalRegistradas / summaryLessonsByHorario.totalPrevistas) * 100)
                        : 0}%
                    </strong>
                  </div>
                  <div className="reports-summary-toggles">
                    <div className="reports-summary-toggle-group">
                      <button
                        type="button"
                        className={`reports-summary-toggle-chip ${summaryTurmaToggle === "terca-quinta" ? "active" : ""}`}
                        onClick={() => setSummaryTurmaToggle("terca-quinta")}
                      >
                        Terça e Quinta
                      </button>
                      <button
                        type="button"
                        className={`reports-summary-toggle-chip ${summaryTurmaToggle === "quarta-sexta" ? "active" : ""}`}
                        onClick={() => setSummaryTurmaToggle("quarta-sexta")}
                      >
                        Quarta e Sexta
                      </button>
                    </div>

                    <div className="reports-summary-toggle-group">
                      {summaryProfessorOptions.map((professor) => (
                        <button
                          key={professor}
                          type="button"
                          className={`reports-summary-toggle-chip ${summaryProfessorToggle === professor ? "active" : ""}`}
                          onClick={() => setSummaryProfessorToggle(professor)}
                        >
                          {professor}
                        </button>
                      ))}
                      {summaryProfessorOptions.length === 0 && (
                        <button
                          type="button"
                          className="reports-summary-toggle-chip"
                          disabled
                        >
                          Sem professor
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="reports-summary-bars">
                    {summaryLessonsByHorario.byHorario.map((item) => {
                      const progressPct = item.previstas > 0
                        ? Math.min(100, (item.registradas / item.previstas) * 100)
                        : 0;

                      return (
                        <div className="reports-summary-bar-row" key={`${item.horario}-${summaryTurmaToggle}-${summaryProfessorToggle}`}>
                          <div className="reports-summary-y-label">{item.horario}</div>
                          <div className="reports-summary-bar-single">
                            <div className="reports-summary-line-track">
                              <div className="reports-summary-line-fill registradas" style={{ width: `${progressPct}%` }} />
                            </div>
                            <span className="reports-summary-line-value">{item.registradas}/{item.previstas}</span>
                          </div>
                        </div>
                      );
                    })}
                    {summaryLessonsByHorario.byHorario.length === 0 && (
                      <div className="reports-section placeholder">Sem dados para os filtros selecionados.</div>
                    )}
                  </div>
                  <div className="vagas-footer">horários</div>
                </div>
              )}

              <div className="report-card">
                <h3>Banco de horas (eventos)</h3>
                <div className="reports-class-metrics">
                  {bankHours.length === 0 && <div className="reports-section placeholder">Sem eventos com horas no mês.</div>}
                  {bankHours.map((item, idx) => (
                    <div key={`${item.teacher}-${idx}`} className="reports-class-metric-row">
                      <strong>{item.teacher || "Professor"}</strong>
                      <span>{item.hours.toFixed(2)} h</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {eventModalOpen && (
            <div className="reports-event-modal-backdrop" onClick={() => setEventModalOpen(false)}>
              <div className="reports-event-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Registro de calendário</h3>
                <div className="reports-filter-field">
                  <label>Data</label>
                  <input
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="reports-filter-field">
                  <label>Tipo</label>
                  <select
                    value={eventForm.type}
                    onChange={(e) => {
                      const nextType = e.target.value as CalendarEventForm["type"];
                      setEventForm((prev) => ({
                        ...prev,
                        type: nextType,
                        allDay: nextType === "reuniao" ? prev.allDay : true,
                        startTime: nextType === "feriado" || nextType === "ponte" ? "" : prev.startTime,
                        endTime: nextType === "feriado" || nextType === "ponte" ? "" : prev.endTime,
                      }));
                    }}
                  >
                    <option value="feriado">Feriado</option>
                    <option value="ponte">Ponte</option>
                    <option value="reuniao">Reunião</option>
                    <option value="evento">Evento</option>
                  </select>
                </div>

                {eventForm.type === "reuniao" && (
                  <label className="reports-checkbox-inline">
                    <input
                      type="checkbox"
                      checked={eventForm.allDay}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, allDay: e.target.checked }))}
                    />
                    Dia todo (cancela todas as aulas na chamada)
                  </label>
                )}

                {(eventForm.type === "evento" || (eventForm.type === "reuniao" && !eventForm.allDay)) && (
                  <div className="reports-period-grid">
                    <div className="reports-filter-field">
                      <label>Hora início</label>
                      <input
                        type="time"
                        value={eventForm.startTime}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="reports-filter-field">
                      <label>Hora término</label>
                      <input
                        type="time"
                        value={eventForm.endTime}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="reports-filter-field">
                  <label>Descrição</label>
                  <input
                    type="text"
                    value={eventForm.description}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Observação do registro"
                  />
                </div>

                <div className="reports-period-actions">
                  <button className="btn-secondary" onClick={() => setEventModalOpen(false)}>
                    Cancelar
                  </button>
                  <button className="btn-primary" onClick={handleSaveEvent}>
                    Salvar registro
                  </button>
                </div>
              </div>
            </div>
          )}

          {planningCardOpen && (
            <div className="reports-event-modal-backdrop" onClick={() => setPlanningCardOpen(false)}>
              <div className="reports-event-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Planejamento</h3>
                <div className="reports-filter-note" style={{ marginBottom: 12 }}>
                  {planningDateWasAdjusted && (
                    <div style={{ marginBottom: 8 }}>
                      Data selecionada em recesso/fechamento. Planejamento consultado em <strong>{effectivePlanningDateKey.split("-").reverse().join("/")}</strong>.
                    </div>
                  )}
                  {(() => {
                    const firstBlock = planningLookupResults[0];
                    if (
                      firstBlock &&
                      firstBlock.type === "week" &&
                      typeof firstBlock.startDay === "number" &&
                      typeof firstBlock.endDay === "number" &&
                      firstBlock.startDay > 0 &&
                      firstBlock.endDay > 0
                    ) {
                      return (
                        <>
                          Período: <strong>{String(firstBlock.startDay).padStart(2, "0")} a {String(firstBlock.endDay).padStart(2, "0")}</strong>
                          {" "}• Semana: <strong>{selectedPlanningWeekKey.replace("semana:", "")}</strong>
                        </>
                      );
                    }
                    return (
                      <>
                        Data selecionada: <strong>{selectedPlanningDateKey.split("-").reverse().join("/")}</strong>
                        {" "}• Semana: <strong>{selectedPlanningWeekKey.replace("semana:", "")}</strong>
                      </>
                    );
                  })()}
                </div>

                <div className="reports-professor-chips" style={{ marginBottom: 12 }}>
                  {planningTargets.length === 0 && (
                    <div className="reports-section placeholder" style={{ width: "100%" }}>
                      Nenhum planejamento carregado.
                    </div>
                  )}
                  {planningTargets.map((target) => (
                    <button
                      key={target}
                      type="button"
                      className={`reports-professor-chip ${planningSelectedTarget === target ? "active" : ""}`}
                      onClick={() => setPlanningSelectedTarget(target)}
                    >
                      {formatPlanningTargetForDisplay(target)}
                    </button>
                  ))}
                </div>

                <div className="reports-class-metrics">
                  {planningSelectedTarget && planningLookupResults.length === 0 && (
                    <div className="reports-section placeholder">
                      Não há planejamento carregado para este período e perfil.
                    </div>
                  )}

                  {planningLookupResults.map((block) => {
                    const lines = String(block.text || "")
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean);

                    const parseCategoryLine = (line: string) => {
                      const match = line.match(/^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30})\s*:\s*(.*)$/);
                      if (!match) return null;
                      const category = match[1].trim();
                      const content = match[2] ?? "";
                      return { category, content };
                    };

                    const weekTitle = (() => {
                      if (
                        block.type === "week" &&
                        typeof block.week === "number" &&
                        block.week > 0
                      ) {
                        if (typeof block.startDay === "number" && typeof block.endDay === "number") {
                          return `${block.week}ª SEM · ${String(block.startDay).padStart(2, "0")} a ${String(block.endDay).padStart(2, "0")}`;
                        }
                        return `${block.week}ª SEM`;
                      }
                      return block.label;
                    })();

                    return (
                      <div
                        key={block.id}
                        className="reports-class-metric-row"
                        style={{ alignItems: "flex-start", display: "block", paddingTop: 10, paddingBottom: 10 }}
                      >
                        <strong style={{ display: "block", marginBottom: 6 }}>{weekTitle}</strong>
                        <div style={{ display: "grid", gap: 4 }}>
                          {lines.map((line, idx) => (
                            (() => {
                              const parsed = parseCategoryLine(line);
                              if (!parsed) {
                                return (
                                  <div key={`${block.id}-${idx}`} style={{ lineHeight: 1.35 }}>
                                    {line}
                                  </div>
                                );
                              }

                              return (
                                <div key={`${block.id}-${idx}`} style={{ lineHeight: 1.35, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 12,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      background: "var(--gray-100)",
                                      color: "var(--text)",
                                    }}
                                  >
                                    {parsed.category}
                                  </span>
                                  <span>{parsed.content}</span>
                                </div>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="reports-period-actions">
                  <button className="btn-secondary" onClick={() => setPlanningCardOpen(false)}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "frequencias" && (
        <div className="reports-section reports-frequency-layout">
          <div className="reports-frequency-column reports-frequency-main">
            <h3 className="reports-frequency-heading">Frequência</h3>
            <div className="reports-filters">
              <div className="reports-filter-field">
                <label>Mês</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
              </div>
              <div className="reports-filter-field">
                <label>Turma</label>
                <select
                  value={selectedTurmaLabel}
                  onChange={(e) => setSelectedTurmaLabel(e.target.value)}
                  disabled={turmaOptions.length === 0}
                >
                  {turmaOptions.map((turma) => (
                    <option key={turma} value={turma}>{turma}</option>
                  ))}
                </select>
                <div className="reports-filter-note">
                  cod.turma: <strong>{selectedClassCodeLower}</strong>
                </div>
              </div>
            </div>

            <div className="reports-professor-chips">
              <button
                type="button"
                className={`reports-professor-chip ${selectedProfessor === "" ? "active" : ""}`}
                onClick={() => setSelectedProfessor("")}
              >
                Todos
              </button>
              {professorOptions.map((professor) => (
                <button
                  key={professor}
                  type="button"
                  className={`reports-professor-chip ${selectedProfessor === professor ? "active" : ""}`}
                  onClick={() => setSelectedProfessor(professor)}
                >
                  {professor}
                </button>
              ))}
            </div>

            <div className="reports-class-grid">
              <div className="reports-class-grid-header">
                <span>
                  <button
                    type="button"
                    className={`reports-select-toggle-chip ${allGridSelected ? "active" : ""}`}
                    onClick={handleToggleAllGrid}
                  >
                    {allGridSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </button>
                </span>
                <span>Horário</span>
                <span>Nível</span>
              </div>
              {exportClassGrid.map((item) => {
                const key = classSelectionKey(item);
                return (
                  <label key={key} className="reports-class-grid-row">
                    <input
                      type="checkbox"
                      checked={selectedExportClassKeys.includes(key)}
                      onChange={() => toggleExportClass(key)}
                    />
                    <span>{formatHorario(item.horario)}</span>
                    <span>{item.nivel || "-"}</span>
                  </label>
                );
              })}
              {exportClassGrid.length === 0 && (
                <div className="reports-class-grid-empty">Nenhuma turma encontrada para os filtros selecionados.</div>
              )}
            </div>

            <div className="reports-export-actions">
              <button
                onClick={handleGenerateExcel}
                className="btn-primary"
                disabled={selectedExportClassKeys.length === 0}
              >
                Exportar chamada (.xlsx)
              </button>
              <button
                onClick={handleGenerateChamadaPdf}
                className="btn-secondary"
                disabled={selectedExportClassKeys.length === 0}
              >
                Exportar chamada.pdf
              </button>
            </div>
          </div>

          <div className="reports-frequency-column reports-frequency-planning">
            <div className="report-card" style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Planejamento</h3>
              <div className="reports-filter-field">
                <label>Selecionar arquivos (PDF/TXT/CSV)</label>
                <input
                  type="file"
                  accept=".pdf,.txt,.csv"
                  multiple
                  disabled={planningBusy}
                  onChange={handlePlanningUpload}
                />
                <div className="reports-filter-note">Envie de 1 a 4 arquivos por vez.</div>
                {planningStatus && <div className="reports-filter-note">{planningStatus}</div>}
              </div>

              <div className="reports-class-metrics" style={{ marginTop: 10 }}>
                {planningStore.files.length === 0 && (
                  <div className="reports-section placeholder">Nenhum planejamento carregado.</div>
                )}
                {planningStore.files.map((file) => (
                  <div key={file.id} className="reports-class-metric-row" style={{ alignItems: "flex-start" }}>
                    <div>
                      <strong>{formatPlanningTargetForDisplay(file.target)}</strong>
                      <span style={{ marginLeft: 8 }}>Ano {file.year}</span>
                      <div className="reports-filter-note">{formatFileNameSentenceCase(file.sourceName)} • {file.blocks.length} bloco(s)</div>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => removePlanningFile(file.id)}
                      style={{
                        marginLeft: "auto",
                        width: 20,
                        height: 20,
                        minWidth: 20,
                        borderRadius: 999,
                        padding: 0,
                        fontSize: 11,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "vagas" && (
        <div className="reports-section">
          <div className="reports-vacancy-header">
            <h3 style={{ margin: 0 }}>Gestão de Vagas</h3>
            <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>
              Visão consolidada por horário com lotação, capacidade e disponibilidade.
            </p>
          </div>

          <div className="reports-vacancy-filters">
            <div className="reports-filter-field">
              <label>Busca</label>
              <input
                type="text"
                placeholder="Turma, nível, professor ou horário"
                value={vacancySearch}
                onChange={(e) => setVacancySearch(e.target.value)}
              />
            </div>
            <div className="reports-filter-field">
              <label>Nível</label>
              <select value={vacancyNivelFilter} onChange={(e) => setVacancyNivelFilter(e.target.value)}>
                <option value="">Todos</option>
                {vacancyNivelOptions.map((nivel) => (
                  <option key={nivel} value={nivel}>
                    {nivel}
                  </option>
                ))}
              </select>
            </div>
            <div className="reports-filter-field">
              <label>Professor</label>
              <select value={vacancyProfessorFilter} onChange={(e) => setVacancyProfessorFilter(e.target.value)}>
                <option value="">Todos</option>
                {vacancyProfessorOptions.map((professor) => (
                  <option key={professor} value={professor}>
                    {professor}
                  </option>
                ))}
              </select>
            </div>
            <div className="reports-vacancy-filter-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setVacancySearch("");
                  setVacancyNivelFilter("");
                  setVacancyProfessorFilter("");
                }}
              >
                Limpar
              </button>
              <button className="btn-secondary" onClick={() => refreshVacanciesSnapshot()}>
                Atualizar
              </button>
            </div>
          </div>

          <div className="reports-vacancy-summary-list">
            <span><strong>{filteredVacancyRows.length}</strong> aulas separadas</span>
            <span>Lotação: <strong>{vacancySummary.totalLotacao}</strong></span>
            <span>Capacidade: <strong>{vacancySummary.totalCapacidade}</strong></span>
            <span>Vagas: <strong>{vacancySummary.totalVagas}</strong></span>
            <span>Excesso: <strong>{vacancySummary.totalExcesso}</strong></span>
          </div>

          <div className="reports-export-actions">
            <button className="btn-primary" onClick={handleExportVacanciesXlsx} disabled={filteredVacancyRows.length === 0}>
              Exportar vagas (.xlsx)
            </button>
            <button className="btn-secondary" onClick={handleDownloadVacanciesPdf} disabled={filteredVacancyRows.length === 0}>
              Exportar vagas (.pdf)
            </button>
          </div>

          <div className="reports-vacancy-grid">
            {filteredVacancyRows.map((row) => (
              <article key={row.key} className="reports-vacancy-card">
                <div className="reports-vacancy-line">
                  <strong>{formatHorario(row.horario)} | {row.turmaAgrupada}</strong>
                  <span>| {row.professor}</span>
                </div>
                <div className="reports-vacancy-line">
                  <strong>{row.nivel}</strong>
                  <span>| {row.lotacao}/{row.capacidade}</span>
                </div>
                <div className="reports-vacancy-line">
                  <strong>Lotação/Horário</strong>
                  <span>| {row.lotacaoHorario}/{row.capacidadeHorario}</span>
                </div>
                <div className="reports-vacancy-list">
                  <span>{row.turma}</span>
                  <span>Vagas: {row.vagasDisponiveis}</span>
                  <span>Excesso: {row.excesso}</span>
                  <span>Ocupação: {row.ocupacaoPct}%</span>
                </div>
              </article>
            ))}
            {filteredVacancyRows.length === 0 && (
              <div className="reports-class-grid-empty">Nenhuma turma encontrada para os filtros de vagas.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "graficos" && (
        <div className="reports-section">
          <ReportsErrorBoundary>
            <Suspense fallback={<div className="reports-section placeholder">Carregando gráficos...</div>}>
              <DashboardCharts
                externalClassesData={classesData}
                externalCalendarSettings={calendarSettings}
                externalCalendarEvents={calendarEvents}
                externalSelectedMonth={selectedMonth}
              />
            </Suspense>
          </ReportsErrorBoundary>
        </div>
      )}

      {activeTab === "estatisticas" && (
        <div className="reports-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Estatísticas — Retenção e Permanência por Nível</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="search"
                placeholder="Filtrar por aluno..."
                value={statsFilter}
                onChange={(e) => setStatsFilter(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd" }}
              />
              <select
                value={statsStatusFilter}
                onChange={(e) => setStatsStatusFilter(e.target.value as "todos" | "ativos" | "excluidos")}
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd" }}
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="excluidos">Excluídos</option>
              </select>
              <select
                value={statsSortBy}
                onChange={(e) =>
                  setStatsSortBy(
                    e.target.value as "retention_desc" | "retention_asc" | "freq_desc" | "name_asc"
                  )
                }
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd" }}
              >
                <option value="retention_desc">Retenção: maior primeiro</option>
                <option value="retention_asc">Retenção: menor primeiro</option>
                <option value="freq_desc">Frequência: maior primeiro</option>
                <option value="name_asc">Nome: A-Z</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div className="report-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Total de alunos</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{statisticsView.summary.total}</div>
            </div>
            <div className="report-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Ativos</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#166534" }}>{statisticsView.summary.ativos}</div>
            </div>
            <div className="report-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Excluídos</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#991b1b" }}>{statisticsView.summary.excluidos}</div>
            </div>
            <div className="report-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Retenção média (dias)</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{statisticsView.summary.retencaoMedia}</div>
            </div>
            <div className="report-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Frequência média</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{statisticsView.summary.frequenciaMedia}%</div>
            </div>
          </div>

          <div className="report-card">
            {statsLoading && <div className="reports-section placeholder">Carregando estatísticas...</div>}

            {!statsLoading && statistics.length === 0 && (
              <div className="reports-section placeholder">Sem dados de presença para calcular estatísticas.</div>
            )}

            {!statsLoading && statistics.length > 0 && statisticsView.rows.length === 0 && (
              <div className="reports-section placeholder">Nenhum aluno encontrado para os filtros aplicados.</div>
            )}

            {!statsLoading && statistics.length > 0 && statisticsView.rows.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: "8px" }}>Aluno</th>
                      <th style={{ padding: "8px", width: 120 }}>Primeira presença</th>
                      <th style={{ padding: "8px", width: 120 }}>Exclusão / Última</th>
                      <th style={{ padding: "8px", width: 120 }}>Retenção (dias)</th>
                      <th style={{ padding: "8px", width: 160 }}>Nível atual</th>
                      <th style={{ padding: "8px", width: 80 }}>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statisticsView.rows.map((s) => {
                      const rowKey = String(s.id || s.nome || "");
                      return (
                        <React.Fragment key={rowKey}>
                          <tr>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span>{s.nome}</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    background: s.isExcluded ? "#fee2e2" : "#dcfce7",
                                    color: s.isExcluded ? "#991b1b" : "#166534",
                                  }}
                                >
                                  {s.isExcluded ? "Excluído" : "Ativo"}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{formatDate(s.firstPresence)}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.exclusionDate ? formatDate(s.exclusionDate) : (s.lastPresence ? formatDate(s.lastPresence) : "-")}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.retentionDays}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.currentNivel || "-"}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>
                              <button
                                className="btn-small-success"
                                onClick={() => setExpandedStats((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                              >
                                {expandedStats[rowKey] ? "Ocultar" : "Ver"}
                              </button>
                            </td>
                          </tr>
                          {expandedStats[rowKey] && (
                            <tr>
                              <td colSpan={6} style={{ padding: 12, background: "#fbfdff" }}>
                                <strong>Histórico por nível</strong>
                                <div style={{ marginTop: 8 }}>
                                  {s.levels.length === 0 && <div className="reports-section placeholder">Sem dados por nível.</div>}
                                  {s.levels.length > 0 && (
                                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                                      <thead>
                                        <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                                          <th style={{ padding: "6px" }}>Nível</th>
                                          <th style={{ padding: "6px" }}>Período</th>
                                          <th style={{ padding: "6px" }}>Dias</th>
                                          <th style={{ padding: "6px" }}>Presenças</th>
                                          <th style={{ padding: "6px" }}>Faltas</th>
                                          <th style={{ padding: "6px" }}>Justif.</th>
                                          <th style={{ padding: "6px" }}>Frequência %</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {s.levels.map((lvl) => (
                                          <tr key={`${rowKey}-${lvl.nivel}-${lvl.firstDate || "-"}`}>
                                            <td style={{ padding: "6px 8px" }}>{lvl.nivel || "-"}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.firstDate ? `${formatDate(lvl.firstDate)} → ${formatDate(lvl.lastDate)}` : "-"}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.days}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.presencas}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.faltas}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.justificativas}</td>
                                            <td style={{ padding: "6px 8px" }}>{lvl.frequencia}%</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aba 'Gestão de Vagas' removida de Relatórios — use o menu principal 'Gestão de Vagas' para esse relatório. */}
    </div>
  );
};

export default Reports;
