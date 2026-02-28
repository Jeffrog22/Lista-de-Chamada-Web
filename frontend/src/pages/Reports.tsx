import React, { Suspense, useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  deleteAcademicCalendarEvent,
  downloadChamadaPdfReport,
  downloadMultiClassExcelReport,
  getAcademicCalendar,
  getBootstrap,
  getReports,
  getStatistics,
  getWeather,
  saveAcademicCalendarEvent,
  saveAcademicCalendarSettings,
} from "../api";
import {
  isDateClosedForAttendance,
  isWithinRange,
} from "../utils/academicCalendar";
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
  nome: string;
  presencas: number;
  faltas: number;
  justificativas: number;
  frequencia: number; // %
  historico: { [date: string]: string }; // "c", "f", "j", ""
  anotacoes?: string;
}

interface ClassStats {
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  alunos: StudentStats[];
}

interface ActiveStudentLite {
  id?: string;
  nome?: string;
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
  codigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  nivel: string;
  capacidade: number;
}

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

const classSelectionKey = (item: Pick<ClassStats, "turma" | "horario" | "professor">) =>
  `${item.turma}||${item.horario}||${item.professor}`;

const normalizeText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

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
      return {
        id: String(st.id || ""),
        nome: String(st.nome || ""),
        presencas: Number(st.presencas || 0),
        faltas: Number(st.faltas || 0),
        justificativas: Number(st.justificativas || 0),
        frequencia: Number(st.frequencia || 0),
        historico: (st.historico && typeof st.historico === "object" ? st.historico : {}) as Record<string, string>,
        anotacoes: st.anotacoes ? String(st.anotacoes) : undefined,
      };
    });

    return {
      turma: String(record.turma || ""),
      horario: String(record.horario || ""),
      professor: String(record.professor || ""),
      nivel: String(record.nivel || ""),
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

    const weekMatch = normalized.match(/(\d{1,2})\s*(?:a|ª)?\s*sem(?:ana)?\b|sem(?:ana)?\s*(\d{1,2})\b/);
    if (weekMatch) {
      flushCurrentBlock();
      const week = Number(weekMatch[1] || weekMatch[2]);
      const rangeMatch = normalized.match(/(?:de\s+)?(\d{1,2})\s*(?:a|-|ate)\s*(\d{1,2})/i);
      const startDay = rangeMatch ? Number(rangeMatch[1]) : undefined;
      const endDay = rangeMatch ? Number(rangeMatch[2]) : undefined;
      const semHeaderMatch = clean.match(/^\s*(?:\d{1,2}\s*(?:a|ª)?\s*sem(?:ana)?|sem(?:ana)?\s*\d{1,2})\s*:?\s*/i);
      const trailingAfterHeader = semHeaderMatch
        ? clean.slice(semHeaderMatch[0].length).trim().replace(/^[:\-–]+\s*/, "")
        : "";
      currentBlock = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "week",
        key: `${header.year}-${currentMonth || defaultMonth}-sem-${week}`,
        label: clean,
        text: trailingAfterHeader,
        month: currentMonth || defaultMonth,
        week,
        startDay,
        endDay,
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

const weekKeyFromDateKey = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "semana:1";
  return `semana:${getWeekOfMonth(d)}`;
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
  const [activeTab, setActiveTab] = useState<"resumo" | "frequencias" | "graficos" | "estatisticas">("resumo");
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

  // Statistics state
  const [statistics, setStatistics] = useState<StudentStatistics[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsFilter, setStatsFilter] = useState("");
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
        setPlanningStore({ files: parsed.files.filter((item) => item && typeof item === "object") });
      }
    } catch {
      setPlanningStore({ files: [] });
    }
  }, []);

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
  const selectedPlanningWeekKey = useMemo(() => weekKeyFromDateKey(selectedPlanningDateKey), [selectedPlanningDateKey]);
  const selectedPlanningMonthKey = selectedPlanningDateKey.slice(0, 7);

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

  const planningLookupResults = useMemo(() => {
    if (!planningSelectedTarget) return [] as PlanningBlock[];

    const dateObj = new Date(`${selectedPlanningDateKey}T00:00:00`);
    const selectedDay = Number.isNaN(dateObj.getTime()) ? null : dateObj.getDate();
    const selectedWeek = Number.isNaN(dateObj.getTime()) ? null : Number(selectedPlanningWeekKey.replace("semana:", ""));
    const selectedYear = Number.isNaN(dateObj.getTime()) ? Number(selectedMonth.slice(0, 4)) : dateObj.getFullYear();
    const selectedMonthNumber = selectedPlanningMonthKey.slice(5, 7);

    const filesForTargetByYear = planningStore.files.filter(
      (file) =>
        normalizeText(file.target || "") === normalizeText(planningSelectedTarget) &&
        Number(file.year || 0) === selectedYear
    );

    const filesForTarget = filesForTargetByYear.length > 0
      ? filesForTargetByYear
      : planningStore.files.filter(
          (file) => normalizeText(file.target || "") === normalizeText(planningSelectedTarget)
        );

    const matched: Array<PlanningBlock & { _score: number }> = [];
    filesForTarget.forEach((file) => {
      file.blocks.forEach((block) => {
        if (block.type !== "week") return;

        const hasText = String(block.text || "").trim().length > 0;
        if (!hasText) return;

        const monthMatches = !block.month || block.month === selectedMonthNumber;
        if (!monthMatches) return;

        const weekMatches = selectedWeek !== null && typeof block.week === "number" && block.week === selectedWeek;
        const rangeMatches =
          selectedDay !== null &&
          typeof block.startDay === "number" &&
          typeof block.endDay === "number" &&
          selectedDay >= block.startDay &&
          selectedDay <= block.endDay;

        const score = rangeMatches ? 5 : weekMatches ? 4 : 0;

        if (score > 0) {
          matched.push({ ...block, _score: score });
        }
      });
    });

    if (matched.length === 0) return [] as PlanningBlock[];

    const bestScore = Math.max(...matched.map((item) => item._score));

    return matched
      .filter((item) => item._score === bestScore)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ _score, ...block }) => block);
  }, [planningSelectedTarget, planningStore.files, selectedPlanningWeekKey, selectedPlanningDateKey, selectedPlanningMonthKey, selectedMonth]);

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
        const text = await readPlanningTextFromFile(file);
        const parsed = buildPlanningFileData(text, file.name, defaultYear, defaultMonth);
        if (parsed) importedFiles.push(parsed);
      }

      if (importedFiles.length === 0) {
        setPlanningStatus("Nenhum item de planejamento encontrado.");
      } else {
        setPlanningStore((prev) => ({ files: [...importedFiles, ...prev.files] }));
        setPlanningStatus(`${importedFiles.length} arquivo(s) de planejamento importado(s).`);
      }
    } catch {
      setPlanningStatus("Falha ao importar arquivos de planejamento.");
    } finally {
      setPlanningBusy(false);
      event.target.value = "";
    }
  };

  const removePlanningFile = (fileId: string) => {
    setPlanningStore((prev) => ({ files: prev.files.filter((file) => file.id !== fileId) }));
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
  const [summaryTurmaToggle, setSummaryTurmaToggle] = useState<"terca-quinta" | "quarta-sexta">("terca-quinta");
  const [summaryProfessorToggle, setSummaryProfessorToggle] = useState<string>("");

  const summaryProfessorOptions = useMemo(() => {
    const options = Array.from(
      new Set(
        classesData
          .filter((cls) => getSummaryScheduleGroup(cls.turma) === summaryTurmaToggle)
          .map((cls) => String(cls.professor || "").trim())
          .filter(Boolean)
      )
    );
    return options.sort((a, b) => a.localeCompare(b));
  }, [classesData, summaryTurmaToggle]);

  useEffect(() => {
    if (summaryProfessorOptions.length === 0) {
      setSummaryProfessorToggle("");
      return;
    }
    if (!summaryProfessorToggle || !summaryProfessorOptions.includes(summaryProfessorToggle)) {
      setSummaryProfessorToggle(summaryProfessorOptions[0]);
    }
  }, [summaryProfessorOptions, summaryProfessorToggle]);

  const refreshVacanciesSnapshot = (isMounted?: () => boolean) => {
    getBootstrap()
      .then((response) => {
        if (isMounted && !isMounted()) return;
        const data = response.data as {
          classes: Array<{
            id: number;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            capacidade: number;
          }>;
          students: Array<{
            id: number;
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
            nome: student.nome,
            turma: cls?.turma_label || cls?.codigo || "",
            turmaCodigo: cls?.codigo || "",
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
          codigo: cls.codigo || "",
          turmaLabel: cls.turma_label || cls.codigo || "",
          horario: cls.horario || "",
          professor: cls.professor || "",
          nivel: cls.nivel || "",
          capacidade: Number(cls.capacidade || 0),
        }));

        setStudentsSnapshot(mapped);
        setBootstrapClasses(mappedClasses);
      })
      .catch(() => {
        if (isMounted && !isMounted()) return;
        setStudentsSnapshot([]);
        setBootstrapClasses([]);
      });
  };

  useEffect(() => {
    let mounted = true;
    refreshVacanciesSnapshot(() => mounted);
    return () => {
      mounted = false;
    };
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

    const selectedWeekdays = weekdaysBySummaryGroup[summaryTurmaToggle] || [];
    const endKey = toDateKey(effectiveEnd);
    const filteredClasses = classesData.filter((cls) => {
      if (getSummaryScheduleGroup(cls.turma) !== summaryTurmaToggle) return false;
      if (!summaryProfessorToggle) return true;
      return normalizeText(cls.professor) === normalizeText(summaryProfessorToggle);
    });

    const byHorarioMap = new Map<string, { previstas: number; registradas: number }>();

    filteredClasses.forEach((cls) => {
      const horarioKey = formatHorario(cls.horario || "") || "Sem horário";
      const current = byHorarioMap.get(horarioKey) || { previstas: 0, registradas: 0 };

      const previstas = plannedClassDaysUntilCurrent.filter((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        return selectedWeekdays.includes(date.getDay());
      }).length;

      const recordedDays = new Set<string>();
      cls.alunos.forEach((aluno) => {
        Object.entries(aluno.historico || {}).forEach(([rawDay, status]) => {
          const normalizedStatus = String(status || "").toLowerCase();
          if (!["c", "f", "j"].includes(normalizedStatus)) return;
          const parsed = parseHistoricoDayToDate(rawDay, year, monthIndex);
          if (!parsed) return;
          const parsedKey = toDateKey(parsed);
          if (parsedKey > endKey) return;
          if (!plannedClassDaysUntilCurrent.includes(parsedKey)) return;
          if (!selectedWeekdays.includes(parsed.getDay())) return;
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
  }, [classesData, plannedClassDaysUntilCurrent, selectedMonthLimits, summaryProfessorToggle, summaryTurmaToggle]);

  const classTotalsUntilCurrent = useMemo(() => {
    const { year, monthIndex, effectiveEnd } = selectedMonthLimits;
    if (!effectiveEnd) return { previstas: 0, dadas: 0 };
    const endKey = toDateKey(effectiveEnd);

    let previstasTotal = 0;
    let dadasTotal = 0;

    classesData.forEach((cls) => {
      const scheduleGroup = getSummaryScheduleGroup(cls.turma);
      const weekdays = weekdaysBySummaryGroup[scheduleGroup] || [];
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
          if (parsedKey > endKey) return;
          if (!plannedClassDaysUntilCurrent.includes(parsedKey)) return;
          if (!weekdays.includes(parsed.getDay())) return;
          recordedDays.add(parsedKey);
        });
      });

      previstasTotal += previstas;
      dadasTotal += recordedDays.size;
    });

    return { previstas: previstasTotal, dadas: dadasTotal };
  }, [classesData, plannedClassDaysUntilCurrent, selectedMonthLimits]);

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
      const scheduleGroup = getSummaryScheduleGroup(cls.turma);
      const weekdays = weekdaysBySummaryGroup[scheduleGroup] || [];
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
  }, [calendarEvents, classesData, plannedClassDaysUntilCurrent, selectedMonth, selectedMonthLimits]);

  const totalAulasDadas = classTotalsUntilCurrent.dadas;
  const totalAulasPrevistas = classTotalsUntilCurrent.previstas;
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
    if (fromBootstrap?.codigo) return fromBootstrap.codigo;

    const fromStudents = studentsSnapshot.find(
      (student) =>
        (student.turma || "") === (currentClassData?.turma || selectedTurmaLabel) &&
        (student.horario || "") === (currentClassData?.horario || selectedHorario) &&
        (student.professor || "") === (currentClassData?.professor || selectedProfessor) &&
        student.turmaCodigo
    );
    return fromStudents?.turmaCodigo || "-";
  })();
  const selectedClassCodeLower = (selectedClassCode || "-").toLowerCase();

  // 'classesByTurma' e 'turmas' removidos — não são mais necessários dentro da aba Relatórios (Gestão de Vagas foi retirada).

  // 'Gestão de Vagas' removida da seção de Relatórios — manter dados no módulo principal de Vagas.

  const handleGenerateExcel = async () => {
    const selectedClasses = exportClassGrid
      .filter((item) => selectedExportClassKeys.includes(classSelectionKey(item)))
      .map((item) => ({ turma: item.turma, horario: item.horario, professor: item.professor }));

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
      .map((item) => ({ turma: item.turma, horario: item.horario, professor: item.professor }));

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
                  Data selecionada: <strong>{planningCardDate.split("-").reverse().join("/")}</strong>
                  {" "}• Semana: <strong>{selectedPlanningWeekKey.replace("semana:", "")}</strong>
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
                      {target}
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
                      if (typeof block.week === "number") {
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
        <div className="reports-section">
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

          <div className="report-card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginTop: 0 }}>Planejamento</h3>
            <div className="reports-filter-field">
              <label>Selecionar arquivos (PDF/TXT)</label>
              <input
                type="file"
                accept=".pdf,.txt"
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
                    <strong>{file.target}</strong>
                    <span style={{ marginLeft: 8 }}>Ano {file.year}</span>
                    <div className="reports-filter-note">{file.sourceName} • {file.blocks.length} bloco(s)</div>
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
      )}

      {activeTab === "graficos" && (
        <div className="reports-section">
          <ReportsErrorBoundary>
            <Suspense fallback={<div className="reports-section placeholder">Carregando gráficos...</div>}>
              <DashboardCharts />
            </Suspense>
          </ReportsErrorBoundary>
        </div>
      )}

      {activeTab === "estatisticas" && (
        <div className="reports-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Estatísticas — Retenção e Permanência por Nível</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="search"
                placeholder="Filtrar por aluno..."
                value={statsFilter}
                onChange={(e) => setStatsFilter(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd" }}
              />
            </div>
          </div>

          <div className="report-card">
            {statsLoading && <div className="reports-section placeholder">Carregando estatísticas...</div>}

            {!statsLoading && statistics.length === 0 && (
              <div className="reports-section placeholder">Sem dados de presença para calcular estatísticas.</div>
            )}

            {!statsLoading && statistics.length > 0 && (
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
                    {statistics
                      .filter((s) => normalizeText(s.nome).includes(normalizeText(statsFilter || "")))
                      .map((s) => (
                        <React.Fragment key={s.nome}>
                          <tr>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.nome}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{formatDate(s.firstPresence)}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.exclusionDate ? formatDate(s.exclusionDate) : (s.lastPresence ? formatDate(s.lastPresence) : "-")}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.retentionDays}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>{s.currentNivel || "-"}</td>
                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #fafafa" }}>
                              <button
                                className="btn-small-success"
                                onClick={() => setExpandedStats((prev) => ({ ...prev, [s.nome]: !prev[s.nome] }))}
                              >
                                {expandedStats[s.nome] ? "Ocultar" : "Ver"}
                              </button>
                            </td>
                          </tr>
                          {expandedStats[s.nome] && (
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
                                          <tr key={`${s.nome}-${lvl.nivel}-${lvl.firstDate || "-"}`}>
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
                      ))}
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
