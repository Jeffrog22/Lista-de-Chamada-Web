import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addExclusion, flushPendingAttendanceLogs, forceAttendanceSync, getAcademicCalendar, getExcludedStudents, getPendingAttendanceScopeStatus, getPoolLog, getReports, getWeather, saveAttendanceLog, savePoolLog } from "../api";
import {
  isClassBlockedByEventPeriod,
  isDateClosedForAttendance,
} from "../utils/academicCalendar";
import type { AcademicCalendarEvent, AcademicCalendarSettings } from "../utils/academicCalendar";

interface ClassOption {
  grupo?: string;
  turmaCodigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  nivel: string;
  capacidade?: number;
  faixaEtaria?: string;
  diasSemana: string[]; // Ex: ["Terça", "Quinta"]
}

interface AttendanceRecord {
  id: number;
  aluno: string;
  attendance: { [date: string]: "Presente" | "Falta" | "Justificado" | "" };
  justifications?: { [date: string]: string };
  notes?: string[];
}

interface ActiveStudentMeta {
  nome?: string;
  grupo?: string;
  turma?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  atestado?: boolean;
  dataAtestado?: string;
}

interface ReportStudentLite {
  nome: string;
  historico?: Record<string, string>;
  justifications?: Record<string, string>;
  notes?: string[];
}

interface ReportClassLite {
  turma: string;
  turmaCodigo?: string;
  horario: string;
  professor: string;
  hasLog?: boolean;
  alunos: ReportStudentLite[];
}

interface TransferLockInfo {
  lockBeforeDate: string;
  fromNivel: string;
}

interface TransferHistoryEntry {
  nome?: string;
  fromNivel?: string;
  toNivel?: string;
  fromTurma?: string;
  toTurma?: string;
  fromHorario?: string;
  toHorario?: string;
  fromProfessor?: string;
  toProfessor?: string;
  effectiveDate?: string;
}

interface NormalizedTransferHistoryEntry {
  nome: string;
  fromNivel: string;
  toNivel: string;
  fromTurma: string;
  toTurma: string;
  fromHorario: string;
  toHorario: string;
  fromProfessor: string;
  toProfessor: string;
  effectiveDate: string;
}

type RenewalSeverity = "yellow" | "orange" | "red";

interface RenewalAlertInfo {
  severity: RenewalSeverity;
  color: string;
  background: string;
  message: string;
}

// Interface para o Log da Piscina (logPiscina.xlsx)
interface PoolLogEntry {
  data: string;
  grupo?: string;
  turmaCodigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  clima1: string; // Condição climática (CPTEC/API ou log)
  clima2: string; // Sensação térmica (chips)
  statusAula: "normal" | "justificada" | "cancelada";
  nota: "aula" | "feriado" | "ponte-feriado" | "reuniao" | "ocorrencia";
  tipoOcorrencia: string;
  tempExterna: string;
  tempPiscina: string;
  cloroPpm: number | null;
}

type ClimaCache = {
  tempExterna: string;
  selectedIcons: string[];
  cloro?: number;
  cloroEnabled?: boolean;
  apiTemp?: string;
  apiCondition?: string;
  apiConditionCode?: string;
  weatherCondition?: string;
  cacheVersion?: string;
  cachedAt?: number;
};

const WEATHER_CACHE_VERSION = "cptec-v1";
const WEATHER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

// Opções de Sensação Térmica (ordem solicitada)
const WEATHER_ICONS = {
  sensations: ["Calor", "Abafado", "Agradável", "Seco", "Vento", "Frio"]
};

const JUSTIFIED_CPTEC_CODES = new Set([
  // Chuva/instabilidade
  "ci", "c", "in", "pp", "cm", "cn", "pt", "pm", "np", "pc", "cv", "ch", "t",
  // Condicoes com baixa visibilidade/risco
  "e", "n", "nv", "g", "ne",
  // Possibilidades e combinacoes com chuva
  "psc", "pcm", "pct", "pcn", "npt", "npn", "ncn", "nct", "ncm", "npm", "npp",
  "ct", "pnt", "ppn", "ppt", "ppm",
]);

const WEATHER_JUSTIFICATION_KEYWORDS = [
  "chuva",
  "chuvisco",
  "tempestade",
  "instavel",
  "nevoeiro",
  "encoberto",
  "geada",
  "neve",
  "pancadas",
];

const normalizeSensation = (value: string) => {
  const raw = String(value || "").trim().toLowerCase();
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "";
  if (folded === "agradavel") return "Agradável";
  if (folded === "abafado") return "Abafado";
  if (folded === "calor") return "Calor";
  if (folded === "seco") return "Seco";
  if (folded === "vento") return "Vento";
  if (folded === "frio") return "Frio";
  return "";
};

const normalizeSensationList = (values: string[]) => {
  const allowed = new Set(WEATHER_ICONS.sensations);
  const unique: string[] = [];
  for (const value of values) {
    const normalized = normalizeSensation(value);
    if (!normalized || !allowed.has(normalized) || unique.includes(normalized)) continue;
    unique.push(normalized);
  }
  return unique;
};

const getFallbackSensationByTemp = (rawTemp: string) => {
  const temp = Number(rawTemp);
  if (!Number.isFinite(temp)) return "Agradável";
  if (temp >= 31) return "Calor";
  if (temp >= 27) return "Abafado";
  if (temp >= 21) return "Agradável";
  if (temp >= 17) return "Vento";
  return "Frio";
};

const CPTEC_CONDITION_LABELS: Record<string, string> = {
  ec: "Encoberto com chuvas isoladas",
  ci: "Chuvas isoladas",
  c: "Chuva",
  in: "Instável",
  pp: "Possibilidade de pancadas de chuva",
  cm: "Chuva pela manhã",
  cn: "Chuva à noite",
  pt: "Pancadas à tarde",
  pm: "Pancadas pela manhã",
  np: "Nublado com pancadas",
  pc: "Pancadas de chuva",
  pn: "Parcialmente nublado",
  cv: "Chuvisco",
  ch: "Chuvoso",
  t: "Tempestade",
  ps: "Predomínio de sol",
  sn: "Sol entre nuvens",
  cl: "Céu claro",
  e: "Encoberto",
  n: "Nublado",
  nv: "Nevoeiro",
  g: "Geada",
  pnt: "Pancadas à noite",
  psc: "Possibilidade de chuva",
  pcm: "Possibilidade de chuva pela manhã",
  pct: "Possibilidade de pancadas à tarde",
  pcn: "Possibilidade de chuva à noite",
  npt: "Nublado com pancadas à tarde",
  npn: "Nublado com pancadas à noite",
  ncn: "Nublado com possibilidade de chuva à noite",
  nct: "Nublado com possibilidade de chuva à tarde",
  ncm: "Nublado com possibilidade de chuva pela manhã",
  npm: "Nublado com pancadas pela manhã",
  npp: "Nublado com possibilidade de chuva",
  vn: "Variação de nebulosidade",
  ct: "Chuva à tarde",
  ppn: "Possibilidade de pancadas de chuva à noite",
  ppt: "Possibilidade de pancadas de chuva à tarde",
  ppm: "Possibilidade de pancadas pela manhã",
};

const normalizeWeatherText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeWeatherConditionLabel = (condition?: string, conditionCode?: string) => {
  const code = String(conditionCode || "").trim().toLowerCase();
  if (code && CPTEC_CONDITION_LABELS[code]) {
    return CPTEC_CONDITION_LABELS[code];
  }

  const raw = String(condition || "").trim();
  if (!raw) {
    if (code) return "Condição climática";
    return "";
  }

  const rawCode = raw.toLowerCase();
  if (CPTEC_CONDITION_LABELS[rawCode]) {
    return CPTEC_CONDITION_LABELS[rawCode];
  }

  const cleaned = raw.replace(/[_-]+/g, " ").trim();
  if (cleaned.length <= 4 && /^[a-z0-9]+$/i.test(cleaned)) {
    return "Condição climática";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const shouldJustifyByWeather = (conditionCode?: string, conditionLabel?: string, sensations?: string[]) => {
  const code = String(conditionCode || "").trim().toLowerCase();
  if (JUSTIFIED_CPTEC_CODES.has(code)) return true;

  const normalizedLabel = normalizeWeatherText(String(conditionLabel || ""));
  if (normalizedLabel) {
    if (WEATHER_JUSTIFICATION_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword))) {
      return true;
    }
  }

  const normalizedSensations = normalizeSensationList(sensations || []);
  if (normalizedSensations.includes("Frio") || normalizedSensations.includes("Vento")) return true;

  return false;
};

type SuggestedClassStatus = "normal" | "justificada" | "cancelada";

type SuggestedClassDecision = {
  status: SuggestedClassStatus;
  reason: string;
};

const WEATHER_NORMAL_KEYWORDS = [
  "encoberto",
  "nublado",
  "possibilidade de chuva",
  "variacao de nebulosidade",
  "ceu claro",
  "predominio de sol",
];

const WEATHER_JUSTIFIED_KEYWORDS_CSV = [
  "chuvas isoladas",
  "chuva",
  "instavel",
  "pancadas de chuva",
  "chuvisco",
  "chuvoso",
  "tempestade",
  "nevoeiro",
  "trovoad",
  "raios",
];

const parseTemperatureNumber = (value: string) => {
  const normalized = String(value || "").replace(/[^\d,.-]/g, "").replace(",", ".").trim();
  if (!normalized) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const inferAgeRange = (value: string) => {
  const text = String(value || "").toLowerCase();
  const nums = text.match(/\d+/g)?.map((v) => Number(v)).filter((n) => Number.isFinite(n)) || [];
  if (nums.length === 0) return null as { min: number; max: number } | null;
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
  return { min, max };
};

const isInfantilClass = (nivel: string, faixaEtaria?: string) => {
  const nivelNorm = normalizeWeatherText(nivel || "");
  if (nivelNorm.includes("infant")) return true;

  const range = inferAgeRange(faixaEtaria || "");
  if (!range) return false;
  return range.min <= 15 && range.max >= 7;
};

const isIniciacaoClass = (nivel: string) => {
  const nivelNorm = normalizeWeatherText(nivel || "");
  return nivelNorm.includes("iniciacao") || nivelNorm.includes("iniciac");
};

const getSuggestedDecisionFromRules = (params: {
  conditionCode?: string;
  conditionLabel?: string;
  sensations?: string[];
  tempPiscina?: string;
  cloroPpm?: number;
  nivel?: string;
  faixaEtaria?: string;
}): SuggestedClassDecision => {
  const tempPiscina = parseTemperatureNumber(params.tempPiscina || "");
  const cloro = Number.isFinite(params.cloroPpm ?? Number.NaN) ? Number(params.cloroPpm) : Number.NaN;
  const nivel = String(params.nivel || "");
  const faixaEtaria = String(params.faixaEtaria || "");

  if (Number.isFinite(cloro) && cloro < 0.5) {
    return { status: "cancelada", reason: "Cloro abaixo de 0,5 ppm" };
  }

  if (Number.isFinite(tempPiscina) && tempPiscina < 23) {
    return { status: "cancelada", reason: "Temperatura da piscina abaixo de 23°C" };
  }

  if (Number.isFinite(tempPiscina) && tempPiscina < 25 && isInfantilClass(nivel, faixaEtaria)) {
    return { status: "cancelada", reason: "Temperatura da piscina abaixo de 25°C para grupo infantil" };
  }

  if (Number.isFinite(tempPiscina) && tempPiscina < 28 && isIniciacaoClass(nivel)) {
    return { status: "cancelada", reason: "Temperatura da piscina abaixo de 28°C para Iniciação" };
  }

  if (Number.isFinite(cloro) && ((cloro >= 0.5 && cloro <= 1.0) || cloro > 5.0)) {
    return {
      status: "justificada",
      reason: cloro > 5.0 ? "Cloro acima de 5 ppm" : "Cloro entre 0,5 e 1 ppm",
    };
  }

  const normalizedLabel = normalizeWeatherText(String(params.conditionLabel || ""));
  const normalizedSensations = normalizeSensationList(params.sensations || []);
  const hasColdOrWind = normalizedSensations.includes("Frio") || normalizedSensations.includes("Vento");
  
  // Verificar sensações compostas PRIMEIRO (prioridade alta)
  if (normalizedLabel) {
    // Nublado + Frio/Vento = Justificada
    if (normalizedLabel.includes("nublado") && hasColdOrWind) {
      return { status: "justificada", reason: "Nublado com frio/vento" };
    }
    // Encoberto + Frio/Vento = Justificada
    if (normalizedLabel.includes("encoberto") && hasColdOrWind) {
      return { status: "justificada", reason: "Encoberto com frio/vento" };
    }
    // Chuvisco com frio/vento = Justificada
    if (normalizedLabel.includes("chuvisco")) {
      if (hasColdOrWind) {
        return { status: "justificada", reason: "Chuvisco com frio/vento" };
      }
      return { status: "normal", reason: "Chuvisco leve sem frio/vento" };
    }
    // Condições justificadas simples
    if (WEATHER_JUSTIFIED_KEYWORDS_CSV.some((keyword) => normalizedLabel.includes(keyword))) {
      return { status: "justificada", reason: "Condição climática desfavorável" };
    }
    // Condições normais
    if (WEATHER_NORMAL_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword))) {
      return { status: "normal", reason: "Condição climática favorável" };
    }
  }

  if (shouldJustifyByWeather(params.conditionCode, params.conditionLabel, params.sensations || [])) {
    return { status: "justificada", reason: "Condição climática desfavorável" };
  }

  return { status: "normal", reason: "Condição climática favorável" };
};

// Coordenadas fixas para API (simulação)
// const LAT = "-23.049194";
// const LON = "-47.007278";

type AttendanceHistory = AttendanceRecord[];
type ModalLogType = "aula" | "ocorrencia";
type AttendanceDebugEvent = {
  ts: string;
  source: "ui" | "api";
  action: string;
  payload: Record<string, unknown>;
};

const DEFAULT_POOL_TEMP = "28";
const CANCELLED_CLASS_REASON_PREFIX = "[AULA CANCELADA]";

export const Attendance: React.FC = () => {
  const renewalAlertStorageKey = "attendanceAtestadoRenewalDismissed";
  const attendanceSelectionStorageKey = "attendanceSelection";
  const transferHistoryStorageKey = "studentTransferHistory";
  const attendanceRetroModeStorageKey = "attendanceRetroModeEnabled";
  const attendanceReferenceMonthStorageKey = "attendanceReferenceMonth";
  const attendanceDebugKey = "attendanceDebugPersistence";
  const attendanceDebugEventsKey = "attendanceDebugEvents";
  const defaultClassOptions: ClassOption[] = [];

  const defaultStudentsPerClass: { [key: string]: string[] } = {};

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const nameParticles = new Set(["da", "de", "do", "das", "dos", "e"]);

  const parseDiasSemana = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
      .split(/[;,]|\s+e\s+/i)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const getStringField = (item: any, ...keys: string[]) => {
    if (!item) return "";
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const value = item[key];
        if (value !== undefined && value !== null) {
          const text = String(value).trim();
          if (text) return text;
        }
      }
    }
    return "";
  };

  const getNumberField = (item: any, ...keys: string[]) => {
    if (!item) return undefined as number | undefined;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const value = item[key];
        if (value === undefined || value === null || value === "") continue;
        const normalized = Number(String(value).replace(",", ".").trim());
        if (Number.isFinite(normalized)) {
          return normalized;
        }
      }
    }
    return undefined as number | undefined;
  };

  const normalizeHorarioDigits = (value?: string) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 3) return `0${digits}`;
    if (digits.length >= 4) return digits.slice(0, 4);
    return digits;
  };

  const formatHorario = (value: string) => {
    const normalized = normalizeHorarioDigits(value);
    if (normalized.length >= 4) {
      return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
    }
    if (value) {
      return value;
    }
    return "";
  };

  const extractHorarioTokens = (value?: string) => {
    if (!value) return [];
    return String(value)
      .split(/[;,]/)
      .map((token) => normalizeHorarioDigits(token.trim()))
      .filter(Boolean);
  };

  const getCanonicalHorario = (value?: string) => extractHorarioTokens(value)[0] || "";

  const buildStudentsPerClassScopedKey = (turma: string, horario: string, professor: string) => {
    const turmaKey = normalizeText(turma || "");
    const horarioKey = normalizeHorarioDigits(horario || "");
    const professorKey = normalizeText(professor || "");
    if (!turmaKey || !horarioKey || !professorKey) return "";
    return `${turmaKey}|${horarioKey}|${professorKey}`;
  };

  const getStudentNamesForClass = (
    map: { [key: string]: string[] },
    params: { turmaCodigo?: string; turmaLabel?: string; horario?: string; professor?: string }
  ) => {
    const scopedKeys = [
      buildStudentsPerClassScopedKey(params.turmaCodigo || "", params.horario || "", params.professor || ""),
      buildStudentsPerClassScopedKey(params.turmaLabel || "", params.horario || "", params.professor || ""),
    ].filter(Boolean);

    for (const key of scopedKeys) {
      const names = map[key];
      if (Array.isArray(names) && names.length > 0) return names;
    }

    return [] as string[];
  };

  const normalizeClassOptions = (items: any[]): ClassOption[] => {
    const seen = new Map<string, ClassOption>();
    items.forEach((raw) => {
      if (!raw) return;
      const turmaLabel =
        getStringField(raw, "Turma", "turma_label", "turmaLabel", "turma") ||
        getStringField(raw, "label", "nome");
      const turmaCodigo =
        getStringField(raw, "Grupo", "grupo", "TurmaCodigo", "codigo", "turmaCodigo", "Atalho") || turmaLabel;
      const professor = getStringField(raw, "Professor", "professor");
      const nivel = getStringField(raw, "Nivel", "nivel");
      const faixaEtaria = getStringField(raw, "FaixaEtaria", "faixa_etaria", "faixaEtaria");
      const diasSemanaRaw = getStringField(raw, "DiasSemana", "dias_semana", "diasSemana");
      const horarioRaw = String(raw.Horario ?? raw.horario ?? "").trim();
      const canonicalHorario = getCanonicalHorario(horarioRaw);
      const horarioKey = canonicalHorario || horarioRaw;
      if (!turmaLabel && !turmaCodigo) return;
      if (!horarioKey) return;
      const key = `${turmaCodigo.toLowerCase()}|${turmaLabel.toLowerCase()}|${horarioKey}|${normalizeText(
        professor
      )}`;
      if (seen.has(key)) return;
      seen.set(key, {
        grupo: turmaCodigo || turmaLabel,
        turmaCodigo: turmaCodigo || turmaLabel,
        turmaLabel: turmaLabel || turmaCodigo,
        horario: canonicalHorario || horarioRaw,
        professor,
        nivel,
        capacidade: getNumberField(raw, "Capacidade", "capacidade", "capacidade_maxima", "capacidadeMaxima"),
        faixaEtaria,
        diasSemana: parseDiasSemana(diasSemanaRaw),
      });
    });
    return Array.from(seen.values());
  };

  const mapAttendanceValue = (value: string): "Presente" | "Falta" | "Justificado" | "" => {
    const normalized = normalizeText(value || "");
    if (normalized === "c" || normalized === "presente") return "Presente";
    if (normalized === "f" || normalized === "falta") return "Falta";
    if (normalized === "j" || normalized === "justificado") return "Justificado";
    return "";
  };

  const normalizeNumberInput = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const raw = String(value).replace(",", ".").trim();
    const num = Number(raw);
    if (!Number.isFinite(num)) return "";
    return raw;
  };



  const loadAttendanceStorage = () => {
    if (!storageKey) return null as AttendanceRecord[] | null;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as AttendanceRecord[];
      if (parsed && Array.isArray(parsed.records)) return parsed.records as AttendanceRecord[];
    } catch {
      // ignore
    }
    return null;
  };

  const saveAttendanceStorage = (records: AttendanceRecord[]) => {
    if (!storageKey) return;
    const payload = { records, updatedAt: new Date().toISOString() };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  };

  const hasAnyMonthJustification = (justifications?: Record<string, string>) => {
    if (!justifications || !monthKey) return false;
    return Object.keys(justifications).some((key) => key.startsWith(`${monthKey}-`));
  };

  const getMonthJustificationEntries = (justifications?: Record<string, string>) => {
    if (!justifications || !monthKey) return [] as { day: string; reason: string }[];
    return Object.entries(justifications)
      .filter(([key]) => key.startsWith(`${monthKey}-`))
      .map(([key, reason]) => ({ day: key.split("-")[2] || "", reason }))
      .sort((a, b) => Number(a.day) - Number(b.day));
  };

  const getJustificationModalSeed = (student?: AttendanceRecord) => {
    const entries = getMonthJustificationEntries(student?.justifications);
    if (entries.length > 0) {
      return {
        day: entries[0].day || "",
        reason: String(entries[0].reason || ""),
      };
    }

    const firstJustifiedDate = Object.entries(student?.attendance || {})
      .filter(([date, status]) => date.startsWith(`${monthKey}-`) && status === "Justificado")
      .map(([date]) => date)
      .sort((a, b) => a.localeCompare(b))[0];

    return {
      day: firstJustifiedDate ? String(firstJustifiedDate.split("-")[2] || "") : "",
      reason: "",
    };
  };

  const getMonthJustificationSummary = (justifications?: Record<string, string>) => {
    const entries = getMonthJustificationEntries(justifications)
      .map((entry) => ({ ...entry, dayNum: Number(entry.day) }))
      .filter((entry) => Number.isFinite(entry.dayNum))
      .sort((a, b) => a.dayNum - b.dayNum);

    if (entries.length === 0) return [] as { dayLabel: string; reason: string }[];

    const groups: Array<{ start: number; end: number; reason: string }> = [];

    entries.forEach((entry) => {
      const last = groups[groups.length - 1];
      if (!last) {
        groups.push({ start: entry.dayNum, end: entry.dayNum, reason: entry.reason });
        return;
      }

      const sameReason = String(last.reason || "") === String(entry.reason || "");
      const isConsecutive = entry.dayNum === last.end + 1;
      if (sameReason && isConsecutive) {
        last.end = entry.dayNum;
        return;
      }

      groups.push({ start: entry.dayNum, end: entry.dayNum, reason: entry.reason });
    });

    const renderedLongReasons = new Set<string>();

    return groups.map((group) => {
      const start = String(group.start).padStart(2, "0");
      const end = String(group.end).padStart(2, "0");
      const isLongJustification = extractJustificationDays(group.reason) > 1;
      if (isLongJustification) {
        const reasonKey = String(group.reason || "").trim().toLowerCase();
        if (renderedLongReasons.has(reasonKey)) {
          return null;
        }
        renderedLongReasons.add(reasonKey);
      }
      return {
        dayLabel: isLongJustification ? start : (group.start === group.end ? start : `${start}-${end}`),
        reason: group.reason,
      };
    }).filter((entry): entry is { dayLabel: string; reason: string } => Boolean(entry));
  };

  const extractJustificationDays = (reason?: string) => {
    const raw = String(reason || "").trim();
    if (!raw) return 0;
    const match = raw.match(/(\d{1,3})\s*dias?/i);
    if (!match) return 0;
    const days = Number(match[1]);
    if (!Number.isFinite(days) || days <= 0) return 0;
    return Math.min(days, 120);
  };

  const getAfastamentoInfo = (justifications?: Record<string, string>) => {
    if (!justifications || !monthKey) return null as { days: number; startDate: string; tooltip: string } | null;

    const datedEntries = Object.entries(justifications)
      .filter(([date, reason]) => date.startsWith(`${monthKey}-`) && extractJustificationDays(reason) > 1)
      .sort(([a], [b]) => a.localeCompare(b));

    if (datedEntries.length === 0) return null;

    const [startDate, reason] = datedEntries[0];
    const days = extractJustificationDays(reason);
    if (days <= 1) return null;

    const dateLabel = startDate.split("-").reverse().join("/");
    const rangeLabel = getMonthJustificationSummary(justifications).find((entry) => {
      return extractJustificationDays(entry.reason) > 1;
    })?.dayLabel;

    const tooltip = rangeLabel
      ? `${days} dias de afastamento (${rangeLabel}) a partir de ${dateLabel}`
      : `${days} dias de afastamento a partir de ${dateLabel}`;

    return {
      days,
      startDate,
      tooltip,
    };
  };

  const isDiasSemanaLabel = (label: string) => {
    const normalized = normalizeText(label);
    const weekdays = [
      "domingo",
      "segunda",
      "terca",
      "terça",
      "quarta",
      "quinta",
      "sexta",
      "sabado",
      "sábado",
    ];
    return weekdays.some((day) => normalized.includes(normalizeText(day)));
  };

  const resolveDiasSemana = (opt: ClassOption) => {
    if (opt.diasSemana && opt.diasSemana.length > 0) {
      return opt.diasSemana;
    }
    const label = opt.turmaLabel || "";
    if (label && isDiasSemanaLabel(label)) {
      return label
        .split(/\s+e\s+/i)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const resolveDiasSemanaFromText = (value: string) => {
    if (!value) return [] as string[];
    const normalized = normalizeText(value).replace(/\s/g, "");
    if (normalized.includes("tq") || (normalized.includes("terca") && normalized.includes("quinta"))) {
      return ["Terca", "Quinta"];
    }
    if (normalized.includes("qs") || (normalized.includes("quarta") && normalized.includes("sexta"))) {
      return ["Quarta", "Sexta"];
    }
    return [] as string[];
  };

  const getTurmaKey = (opt: ClassOption) => opt.turmaLabel || opt.grupo || opt.turmaCodigo;
  const isSameTurma = (opt: ClassOption, turma: string) => {
    if (!turma) return false;
    const turmaNormalized = normalizeText(turma);
    const codeNormalized = normalizeText(opt.grupo || opt.turmaCodigo || "");
    const labelNormalized = normalizeText(opt.turmaLabel || "");
    return turmaNormalized === codeNormalized || turmaNormalized === labelNormalized;
  };

  const loadFromStorage = () => {
    try {
      const classesStr = localStorage.getItem("activeClasses");
      const studentsStr = localStorage.getItem("activeStudents");
      if (!classesStr && !studentsStr) return null;

      const classes = classesStr ? JSON.parse(classesStr) : [];
      const students = studentsStr ? JSON.parse(studentsStr) : [];
      if (!Array.isArray(classes) || !Array.isArray(students)) return null;

      const excludedRaw = localStorage.getItem("excludedStudents");
      const excluded = excludedRaw ? (JSON.parse(excludedRaw) as any[]) : [];
      const isExcludedStudent = (student: any, exclusion: any) => {
        const studentUid = String(student?.studentUid || student?.student_uid || "").trim();
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
        if (!studentName || !exclusionName || studentName !== exclusionName) {
          return false;
        }

        const studentTurma = normalizeText(student?.turma || "");
        const studentTurmaCodigo = normalizeText(student?.grupo || student?.turmaCodigo || "");
        const studentHorario = normalizeHorarioDigits(student?.horario || "");
        const studentProfessor = normalizeText(student?.professor || "");

        const exclusionTurma = normalizeText(
          exclusion?.turmaLabel || exclusion?.TurmaLabel || exclusion?.turma || exclusion?.Turma || ""
        );
        const exclusionTurmaCodigo = normalizeText(
          exclusion?.grupo || exclusion?.Grupo || exclusion?.turmaCodigo || exclusion?.TurmaCodigo || ""
        );
        const exclusionHorario = normalizeHorarioDigits(exclusion?.horario || exclusion?.Horario || "");
        const exclusionProfessor = normalizeText(exclusion?.professor || exclusion?.Professor || "");

        const turmaMatches =
          !exclusionTurma && !exclusionTurmaCodigo
            ? true
            : [studentTurma, studentTurmaCodigo].includes(exclusionTurma) ||
              [studentTurma, studentTurmaCodigo].includes(exclusionTurmaCodigo);
        const horarioMatches = !exclusionHorario || !studentHorario || exclusionHorario === studentHorario;
        const professorMatches = !exclusionProfessor || !studentProfessor || exclusionProfessor === studentProfessor;

        return turmaMatches && horarioMatches && professorMatches;
      };

      const filteredStudents = students.filter(
        (student) => !excluded.some((exclusion) => isExcludedStudent(student, exclusion))
      );

      const classOptions: ClassOption[] = normalizeClassOptions(classes);

      const studentsPerClass: { [key: string]: string[] } = {};
      filteredStudents.forEach((student: any) => {
        const turmaCodigo = String(student.turmaCodigo || "").trim();
        const turmaLabel = String(student.turmaLabel || student.turma || "").trim();
        const studentHorario = String(student.horario || "").trim();
        const studentProfessor = String(student.professor || "").trim();
        // Validate: only add students with ALL required allocation fields
        if (!turmaCodigo && !turmaLabel) return; // Must have turma
        if (!studentHorario) return; // Must have horario
        if (!studentProfessor) return; // Must have professor
        if (!student.nome) return; // Must have name
        
        const scopedKeys = [
          buildStudentsPerClassScopedKey(turmaCodigo, studentHorario, studentProfessor),
          buildStudentsPerClassScopedKey(turmaLabel, studentHorario, studentProfessor),
        ].filter(Boolean);
        const keys = [...scopedKeys].filter(Boolean);

        keys.forEach((key) => {
          if (!studentsPerClass[key]) {
            studentsPerClass[key] = [];
          }
          if (!studentsPerClass[key].includes(student.nome)) {
            studentsPerClass[key].push(student.nome);
          }
        });
      });

      return { classOptions, studentsPerClass, studentsMeta: filteredStudents as ActiveStudentMeta[] };
    } catch {
      return null;
    }
  };

  const loadAttendanceSelection = () => {
    try {
      const raw = localStorage.getItem(attendanceSelectionStorageKey);
      if (!raw) return null as { turma: string; horario: string; professor: string } | null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        turma: String(parsed.turma || ""),
        horario: String(parsed.horario || ""),
        professor: String(parsed.professor || ""),
      };
    } catch {
      return null;
    }
  };

  const stored = loadFromStorage();
  const refreshStorageData = useCallback(() => {
    const latest = loadFromStorage();
    if (!latest) return;
    setClassOptions(latest.classOptions);
    setStudentsPerClass(latest.studentsPerClass);
    setActiveStudentsMeta(latest.studentsMeta || []);
  }, []);
  const storedSelection = loadAttendanceSelection();
  const [classOptions, setClassOptions] = useState<ClassOption[]>(stored?.classOptions || defaultClassOptions);
  const [studentsPerClass, setStudentsPerClass] = useState<{ [key: string]: string[] }>(
    stored?.studentsPerClass || defaultStudentsPerClass
  );
  const [activeStudentsMeta, setActiveStudentsMeta] = useState<ActiveStudentMeta[]>(
    stored?.studentsMeta || []
  );
  const [dismissedRenewalAlerts, setDismissedRenewalAlerts] = useState<Record<string, RenewalSeverity>>(() => {
    try {
      const raw = localStorage.getItem(renewalAlertStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  // STATE
  const emptyClass: ClassOption = {
    turmaCodigo: "",
    turmaLabel: "",
    horario: "",
    professor: "",
    nivel: "",
    capacidade: 0,
    faixaEtaria: "",
    diasSemana: [],
  };
  const [selectedTurma, setSelectedTurma] = useState<string>(
    storedSelection?.turma || getTurmaKey(classOptions[0] || emptyClass) || ""
  );
  const [selectedHorario, setSelectedHorario] = useState<string>(
    getCanonicalHorario(storedSelection?.horario || classOptions[0]?.horario || "")
  );
  const [selectedProfessor, setSelectedProfessor] = useState<string>(
    storedSelection?.professor || classOptions[0]?.professor || ""
  );
  const nowLocal = new Date();
  const todayDateKey = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
  const currentMonthKey = todayDateKey.slice(0, 7);
  const [retroModeEnabled, setRetroModeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(attendanceRetroModeStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const [referenceMonth, setReferenceMonth] = useState<string>(() => {
    try {
      const storedMonth = localStorage.getItem(attendanceReferenceMonthStorageKey);
      if (storedMonth && /^\d{4}-\d{2}$/.test(storedMonth)) {
        return storedMonth;
      }
    } catch {
      // ignore
    }
    return currentMonthKey;
  });
  const [selectedDate, setSelectedDate] = useState<string>(todayDateKey);

  useEffect(() => {
    const latest = loadFromStorage();
    if (!latest) return;
    if (latest.classOptions.length > 0) {
      setClassOptions(latest.classOptions);
      setStudentsPerClass(latest.studentsPerClass);
      setActiveStudentsMeta(latest.studentsMeta || []);
      // selection handled by effects below
    }
  }, []);

  useEffect(() => {
    window.addEventListener("attendanceDataUpdated", refreshStorageData);
    return () => window.removeEventListener("attendanceDataUpdated", refreshStorageData);
  }, []);

  const refreshExcludedStudents = useCallback(async () => {
    try {
      const response = await getExcludedStudents();
      const payload = Array.isArray(response?.data) ? response.data : [];
      localStorage.setItem("excludedStudents", JSON.stringify(payload));
      refreshStorageData();
    } catch {
      // mantém cache local quando backend estiver indisponível
    }
  }, [refreshStorageData]);

  useEffect(() => {
    let isMounted = true;
    getExcludedStudents()
      .then((response) => {
        if (!isMounted) return;
        const payload = Array.isArray(response?.data) ? response.data : [];
        const fromFallback = Boolean((response as any)?._fromFallback);
        let localList: any[] = [];
        try {
          const localRaw = localStorage.getItem("excludedStudents");
          const localParsed = localRaw ? JSON.parse(localRaw) : [];
          localList = Array.isArray(localParsed) ? localParsed : [];
        } catch {
          localList = [];
        }
        const resolved = fromFallback ? localList : payload;
        localStorage.setItem("excludedStudents", JSON.stringify(resolved));
        refreshStorageData();
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [refreshStorageData]);

  useEffect(() => {
    const triggerExcludedRefresh = () => {
      refreshExcludedStudents();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerExcludedRefresh();
      }
    };

    window.addEventListener("focus", triggerExcludedRefresh);
    window.addEventListener("pageshow", triggerExcludedRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", triggerExcludedRefresh);
      window.removeEventListener("pageshow", triggerExcludedRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshExcludedStudents]);

  useEffect(() => {
    localStorage.setItem(renewalAlertStorageKey, JSON.stringify(dismissedRenewalAlerts));
  }, [dismissedRenewalAlerts]);

  useEffect(() => {
    const onStorage = () => {
      try {
        const raw = localStorage.getItem("activeStudents");
        if (!raw) {
          setActiveStudentsMeta([]);
          return;
        }
        const parsed = JSON.parse(raw);
        setActiveStudentsMeta(Array.isArray(parsed) ? parsed : []);
      } catch {
        setActiveStudentsMeta([]);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    localStorage.setItem(attendanceRetroModeStorageKey, retroModeEnabled ? "1" : "0");
    if (!retroModeEnabled) {
      setReferenceMonth(currentMonthKey);
    }
  }, [retroModeEnabled, attendanceRetroModeStorageKey, currentMonthKey]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(referenceMonth)) return;
    localStorage.setItem(attendanceReferenceMonthStorageKey, referenceMonth);
  }, [referenceMonth, attendanceReferenceMonthStorageKey]);

  // whenever classOptions change or selection values modify,
  // ensure the selectedTurma is canonical when a matching class exists
  useEffect(() => {
    if (classOptions.length === 0) return;
    const currentExact = classOptions.find(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        horarioMatches(opt.horario, selectedHorario) &&
        opt.professor === selectedProfessor
    );
    if (currentExact) {
      const canonicalTurma = getTurmaKey(currentExact) || "";
      if (canonicalTurma && selectedTurma !== canonicalTurma) {
        setSelectedTurma(canonicalTurma);
      }
    }
  }, [classOptions, selectedTurma, selectedHorario, selectedProfessor]);

  // when classOptions load/refresh, pick a valid selection or restore saved
  useEffect(() => {
    if (classOptions.length === 0) return;

    const valid = classOptions.some(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        horarioMatches(opt.horario, selectedHorario) &&
        opt.professor === selectedProfessor
    );
    if (valid) return;

    const saved = loadAttendanceSelection();
    if (saved?.turma) {
      const restored = classOptions.find(
        (opt) =>
          isSameTurma(opt, saved.turma) &&
          (!saved.horario || horarioMatches(opt.horario, saved.horario)) &&
          (!saved.professor || opt.professor === saved.professor)
      );
      if (restored) {
        setSelectedTurma(getTurmaKey(restored) || "");
        if (saved.horario && horarioMatches(restored.horario, saved.horario)) {
          setSelectedHorario(getCanonicalHorario(saved.horario));
        } else {
          const part = (restored.horario || "").split(/[;,]/)[0].trim();
          if (part) setSelectedHorario(getCanonicalHorario(part));
        }
        setSelectedProfessor(saved.professor || restored.professor);
        return;
      }
    }

    const first = classOptions[0];
    setSelectedTurma(getTurmaKey(first) || "");
    setSelectedHorario(getCanonicalHorario(first.horario));
    setSelectedProfessor(first.professor);
  }, [classOptions]);

  useEffect(() => {
    const target = localStorage.getItem("attendanceTargetTurma");
    if (!target) return;

    const selection = loadAttendanceSelection();
    const selectionHorario = selection?.horario || "";
    const selectionProfessor = selection?.professor || "";

    // Prefer precise match when horario/professor are available
    const preciseMatch = classOptions.find(
      (opt) =>
        isSameTurma(opt, target) &&
        (!selectionHorario || horarioMatches(opt.horario, selectionHorario)) &&
        (!selectionProfessor || opt.professor === selectionProfessor)
    );

    const match =
      preciseMatch ||
      classOptions.find((opt) => {
        if (opt.turmaLabel === target) return true;
        if (opt.turmaCodigo === target) return true;
        if (isSameTurma(opt, target)) return true;
        return false;
      });

    if (match) {
      setSelectedTurma(getTurmaKey(match) || "");
      setSelectedHorario(getCanonicalHorario(match.horario));
      setSelectedProfessor(match.professor);
    } else if (classOptions.length === 0) {
      // Turma list not ready, will retry when classOptions loads
      return;
    } else {
      console.warn(
        `[Attendance] Turma não encontrada: ${target}. Disponíveis:`,
        classOptions.map((o) => `${o.turmaLabel}/${o.turmaCodigo}`)
      );
    }
    localStorage.removeItem("attendanceTargetTurma");
  }, [classOptions]);

  useEffect(() => {
    const shortcutDate = localStorage.getItem("attendanceDateShortcut");
    if (!shortcutDate) return;
    setSelectedDate(shortcutDate);
    localStorage.removeItem("attendanceDateShortcut");
  }, []);

  const turmaOptions = useMemo(() => {
    const map = new Map<string, { codigo: string; label: string }>();
    classOptions.forEach((opt) => {
      const key = getTurmaKey(opt);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { codigo: key, label: opt.turmaLabel || opt.turmaCodigo || key });
      }
    });
    return Array.from(map.values());
  }, [classOptions]);

  const horarioOptions = useMemo(() => {
    if (!selectedProfessor) return [];
    const tokens = new Set<string>();
    classOptions
      .filter(
        (opt) => isSameTurma(opt, selectedTurma) && opt.professor === selectedProfessor
      )
      .forEach((opt) => {
        extractHorarioTokens(opt.horario).forEach((token) => tokens.add(token));
      });
    return Array.from(tokens).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });
  }, [classOptions, selectedTurma, selectedProfessor]);

  const horarioMatches = (optHorario: string, hora: string) => {
    const normalizedHora = normalizeHorarioDigits(hora);
    if (!normalizedHora) return false;
    return extractHorarioTokens(optHorario).some((token) => token === normalizedHora);
  };

  const professorOptions = useMemo(() => {
    const set = new Set<string>();
    classOptions
      .filter((opt) => isSameTurma(opt, selectedTurma))
      .forEach((opt) => opt.professor && set.add(opt.professor));
    return Array.from(set);
  }, [classOptions, selectedTurma]);

  const sortHorarioValues = (values: string[]) =>
    [...values].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });

  const resolveHorariosForSelection = (turma: string, professor: string) => {
    if (!turma || !professor) return [] as string[];
    const tokens = new Set<string>();
    classOptions
      .filter((opt) => isSameTurma(opt, turma) && opt.professor === professor)
      .forEach((opt) => {
        extractHorarioTokens(opt.horario).forEach((token) => tokens.add(token));
      });
    return sortHorarioValues(Array.from(tokens));
  };

  const handleTurmaChange = useCallback(
    (nextTurma: string) => {
      setSelectedTurma(nextTurma);

      if (!nextTurma) {
        setSelectedProfessor("");
        setSelectedHorario("");
        return;
      }

      const sameTurma = classOptions.filter((opt) => isSameTurma(opt, nextTurma));
      if (sameTurma.length === 0) {
        setSelectedProfessor("");
        setSelectedHorario("");
        return;
      }

      const nextProfessor = sameTurma.some((opt) => opt.professor === selectedProfessor)
        ? selectedProfessor
        : sameTurma[0].professor;
      setSelectedProfessor(nextProfessor);

      const horarios = resolveHorariosForSelection(nextTurma, nextProfessor);
      if (horarios.length === 0) {
        setSelectedHorario("");
        return;
      }

      const currentHorario = getCanonicalHorario(selectedHorario);
      setSelectedHorario(horarios.includes(currentHorario) ? currentHorario : horarios[0]);
    },
    [classOptions, selectedProfessor, selectedHorario]
  );

  const handleProfessorChange = useCallback(
    (nextProfessor: string) => {
      setSelectedProfessor(nextProfessor);

      if (!selectedTurma || !nextProfessor) {
        setSelectedHorario("");
        return;
      }

      const horarios = resolveHorariosForSelection(selectedTurma, nextProfessor);
      if (horarios.length === 0) {
        setSelectedHorario("");
        return;
      }

      const currentHorario = getCanonicalHorario(selectedHorario);
      setSelectedHorario(horarios.includes(currentHorario) ? currentHorario : horarios[0]);
    },
    [selectedTurma, selectedHorario, classOptions]
  );

  useEffect(() => {
    if (horarioOptions.length === 0) {
      setSelectedHorario("");
      return;
    }
    if (!horarioOptions.includes(selectedHorario)) {
      setSelectedHorario(horarioOptions[0]);
    }
  }, [horarioOptions, selectedHorario]);

  useEffect(() => {
    if (professorOptions.length === 0) {
      setSelectedProfessor("");
      return;
    }
    if (!professorOptions.includes(selectedProfessor)) {
      setSelectedProfessor(professorOptions[0]);
    }
  }, [professorOptions]);

  const selectedClass = useMemo(() => {
    if (classOptions.length === 0) return emptyClass;
    const exact = classOptions.find(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        horarioMatches(opt.horario, selectedHorario) &&
        opt.professor === selectedProfessor
    );
    if (exact) return exact;
    const byHorario = classOptions.find(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        horarioMatches(opt.horario, selectedHorario)
    );
    if (byHorario) return byHorario;
    const byTurma = classOptions.find((opt) => isSameTurma(opt, selectedTurma));
    return byTurma || classOptions[0] || emptyClass;
  }, [classOptions, selectedTurma, selectedHorario, selectedProfessor]);

  const resolvePersistenceContext = useCallback(() => {
    const exactClass = classOptions.find(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        horarioMatches(opt.horario, selectedHorario) &&
        opt.professor === selectedProfessor
    );

    const turmaCodigo = String(exactClass?.turmaCodigo || "").trim();
    const turmaLabel = String(exactClass?.turmaLabel || "").trim();
    const horario = String(exactClass?.horario || "").trim();
    const professor = String(exactClass?.professor || "").trim();

    return {
      turmaCodigo,
      turmaLabel,
      horario,
      professor,
      isValid: Boolean(exactClass && turmaLabel && horario && professor),
    };
  }, [classOptions, selectedTurma, selectedHorario, selectedProfessor]);

  const appendDebugEvent = useCallback(
    (entry: AttendanceDebugEvent) => {
      try {
        const raw = localStorage.getItem(attendanceDebugEventsKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? parsed : [];
        const next = [...list, entry].slice(-80);
        localStorage.setItem(attendanceDebugEventsKey, JSON.stringify(next));
        setDebugEvents(next.slice(-40));
      } catch {
      }
      try {
        window.dispatchEvent(new CustomEvent("attendance-debug-event", { detail: entry }));
      } catch {
      }
    },
    [attendanceDebugEventsKey]
  );

  const logPersistenceDebug = useCallback(
    (action: string, payload: { turmaCodigo: string; turmaLabel: string; horario: string; professor: string; mes?: string }) => {
      const debugEnabled = (() => {
        if (import.meta.env.DEV) return true;
        try {
          return localStorage.getItem(attendanceDebugKey) === "1";
        } catch {
          return false;
        }
      })();
      if (!debugEnabled) return;
      const entry: AttendanceDebugEvent = {
        ts: new Date().toISOString(),
        source: "ui",
        action,
        payload: {
          turmaCodigo: payload.turmaCodigo,
          turmaLabel: payload.turmaLabel,
          horario: payload.horario,
          professor: payload.professor,
          mes: payload.mes,
        },
      };
      console.info("[attendance:persistence]", {
        action,
        turmaCodigo: payload.turmaCodigo,
        turmaLabel: payload.turmaLabel,
        horario: payload.horario,
        professor: payload.professor,
        mes: payload.mes,
      });
      appendDebugEvent(entry);
    },
    [appendDebugEvent, attendanceDebugKey]
  );

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hash = String(window.location.hash || "");
      const hashQueryPart = hash.includes("?") ? hash.split("?")[1] : "";
      const hashParams = new URLSearchParams(hashQueryPart);
      const debugParam = params.get("attendanceDebug") || hashParams.get("attendanceDebug");
      if (debugParam === "1") {
        localStorage.setItem(attendanceDebugKey, "1");
        setShowDebugPanel(true);
      }
      if (debugParam === "0") {
        localStorage.removeItem(attendanceDebugKey);
        localStorage.removeItem(attendanceDebugEventsKey);
        setShowDebugPanel(false);
        setDebugEvents([]);
      }
    } catch {
    }

    const refreshDebugPanel = () => {
      const enabled = import.meta.env.DEV || localStorage.getItem(attendanceDebugKey) === "1";
      setShowDebugPanel(enabled);
      try {
        const raw = localStorage.getItem(attendanceDebugEventsKey);
        const parsed = raw ? JSON.parse(raw) : [];
        setDebugEvents(Array.isArray(parsed) ? parsed.slice(-40) : []);
      } catch {
        setDebugEvents([]);
      }
    };

    const onDebugEvent = (event: Event) => {
      const custom = event as CustomEvent<AttendanceDebugEvent>;
      const entry = custom.detail;
      if (!entry) return;
      setDebugEvents((prev) => [...prev, entry].slice(-40));
    };

    window.addEventListener("storage", refreshDebugPanel);
    window.addEventListener("focus", refreshDebugPanel);
    window.addEventListener("attendance-debug-event", onDebugEvent as EventListener);
    refreshDebugPanel();

    return () => {
      window.removeEventListener("storage", refreshDebugPanel);
      window.removeEventListener("focus", refreshDebugPanel);
      window.removeEventListener("attendance-debug-event", onDebugEvent as EventListener);
    };
  }, [attendanceDebugEventsKey, attendanceDebugKey]);

  useEffect(() => {
    const turmaValue = selectedClass.turmaLabel || selectedTurma || selectedClass.turmaCodigo || "";
    const horarioValue = selectedClass.horario || selectedHorario || "";
    const professorValue = selectedClass.professor || selectedProfessor || "";
    if (!turmaValue) return;
    localStorage.setItem(
      attendanceSelectionStorageKey,
      JSON.stringify({ turma: turmaValue, horario: horarioValue, professor: professorValue })
    );
  }, [selectedClass, selectedTurma, selectedHorario, selectedProfessor]);

  const parseDateFlexible = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (raw.includes("/")) {
      const [day, month, year] = raw.split("/").map(Number);
      if (!day || !month || !year) return null;
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    }
    if (raw.includes("-")) {
      const dateOnly = raw.split("T")[0];
      const [year, month, day] = dateOnly.split("-").map(Number);
      if (!day || !month || !year) return null;
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    }
    return null;
  };

  const addMonths = (base: Date, months: number) => {
    const next = new Date(base);
    next.setMonth(next.getMonth() + months);
    return next;
  };

  const activeStudentByNameInClass = useMemo(() => {
    const map = new Map<string, ActiveStudentMeta>();
    const turmaRef = normalizeText(selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "");
    const turmaCodigoRef = normalizeText(selectedClass.turmaCodigo || "");
    const horarioRef = normalizeHorarioDigits(selectedClass.horario || selectedHorario || "");
    const professorRef = normalizeText(selectedClass.professor || selectedProfessor || "");

    activeStudentsMeta.forEach((student) => {
      const studentName = normalizeText(student.nome || "");
      if (!studentName) return;

      const studentTurma = normalizeText(student.turma || "");
      const studentTurmaCodigo = normalizeText(student.turmaCodigo || "");
      const studentHorario = normalizeHorarioDigits(student.horario || "");
      const studentProfessor = normalizeText(student.professor || "");

      const turmaMatches =
        (!turmaRef && !turmaCodigoRef) ||
        studentTurma === turmaRef ||
        studentTurmaCodigo === turmaCodigoRef ||
        studentTurma === turmaCodigoRef ||
        studentTurmaCodigo === turmaRef;
      const horarioMatches = !horarioRef || !studentHorario || studentHorario === horarioRef;
      const professorMatches = !professorRef || !studentProfessor || studentProfessor === professorRef;

      if (turmaMatches && horarioMatches && professorMatches) {
        map.set(studentName, student);
      }
    });

    return map;
  }, [activeStudentsMeta, selectedClass, selectedTurma, selectedHorario, selectedProfessor]);

  const buildRenewalDismissKey = (studentName: string) => {
    const turma = normalizeText(selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "");
    const horario = normalizeText(selectedClass.horario || selectedHorario || "");
    const professor = normalizeText(selectedClass.professor || selectedProfessor || "");
    const name = normalizeText(studentName || "");
    return `${name}|${turma}|${horario}|${professor}`;
  };

  const getRenewalAlertInfo = (studentName: string): RenewalAlertInfo | null => {
    const student = activeStudentByNameInClass.get(normalizeText(studentName || ""));
    const hasCertificateInfo = !!student?.atestado || !!String(student?.dataAtestado || "").trim();
    if (!hasCertificateInfo || !student?.dataAtestado) return null;

    const atestadoDate = parseDateFlexible(student.dataAtestado);
    if (!atestadoDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limit9 = addMonths(atestadoDate, 9);
    const limit11 = addMonths(atestadoDate, 11);
    const limit12 = addMonths(atestadoDate, 12);

    if (today >= limit12) {
      return {
        severity: "red",
        color: "#dc3545",
        background: "#fdeaea",
        message: "Atestado com 1 ano ou mais. Renovar atestado médico imediatamente.",
      };
    }
    if (today >= limit11) {
      return {
        severity: "orange",
        color: "#fd7e14",
        background: "#fff3e6",
        message: "Atestado com 11 meses. Renovação do atestado médico é recomendada.",
      };
    }
    if (today >= limit9) {
      return {
        severity: "yellow",
        color: "#b08900",
        background: "#fff9db",
        message: "Atestado com 9 meses. Programe a renovação do atestado médico.",
      };
    }
    return null;
  };

  const dismissRenewalAlert = (studentName: string, severity: RenewalSeverity) => {
    const key = buildRenewalDismissKey(studentName);
    setDismissedRenewalAlerts((prev) => ({ ...prev, [key]: severity }));
  };

  // Gerar datas pré-determinadas baseadas no dia da semana (DEFINIR ANTES DO STATE)
  const generateDates = (daysOfWeek: string[], targetMonth: string) => {
    const dates = [];
    const [targetYearRaw, targetMonthRaw] = String(targetMonth || "").split("-");
    const parsedYear = Number(targetYearRaw);
    const parsedMonth = Number(targetMonthRaw);
    const fallback = new Date();
    const currentMonth =
      Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth - 1
        : fallback.getMonth();
    const currentYear = Number.isInteger(parsedYear) && parsedYear > 2000 ? parsedYear : fallback.getFullYear();

    // Mapa: nome do dia -> número (0=domingo, 1=segunda, etc)
    const dayMap: { [key: string]: number } = {
      domingo: 0,
      segunda: 1,
      terca: 2,
      quarta: 3,
      quinta: 4,
      sexta: 5,
      sabado: 6,
    };

    const normalizedDays = daysOfWeek.map((d) => normalizeText(d).replace(/[^a-z]/g, ""));

    for (let day = 1; day <= 31; day++) {
      try {
        const date = new Date(currentYear, currentMonth, day);
        if (date.getMonth() !== currentMonth) break;

        const dayOfWeek = date.getDay();
        const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
        const dayName = dayNames[dayOfWeek];
        const normalizedDayName = normalizeText(dayName).replace(/[^a-z]/g, "");

        if (
          normalizedDays.some(
            (d) => dayMap[d] === dayOfWeek || d === normalizedDayName
          )
        ) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const dayStr = String(date.getDate()).padStart(2, "0");
          dates.push(
            `${year}-${month}-${dayStr}` +
              ` (${dayName.substring(0, 3)})`
          );
        }
      } catch (e) {
        // ignore
      }
    }

    return dates;
  };

  const resolvedDiasSemana = (() => {
    const fromClass = resolveDiasSemana(selectedClass);
    if (fromClass.length > 0) return fromClass;

    const fromTurmaOptions = classOptions
      .filter((opt) => isSameTurma(opt, selectedTurma))
      .map((opt) => resolveDiasSemana(opt))
      .find((days) => days.length > 0);
    if (fromTurmaOptions) return fromTurmaOptions;

    const byLabel = resolveDiasSemanaFromText(selectedClass.turmaLabel || "");
    if (byLabel.length > 0) return byLabel;

    const bySelected = resolveDiasSemanaFromText(selectedTurma);
    if (bySelected.length > 0) return bySelected;

    const byCode = resolveDiasSemanaFromText(selectedClass.turmaCodigo || "");
    if (byCode.length > 0) return byCode;

    return [] as string[];
  })();
  const effectiveMonthKey = retroModeEnabled ? referenceMonth : currentMonthKey;
  const availableDates = generateDates(resolvedDiasSemana, effectiveMonthKey);
  const dateDates = availableDates.map((d) => d.split(" ")[0]); // Pega apenas a data (YYYY-MM-DD)

  const monthKey = useMemo(() => effectiveMonthKey, [effectiveMonthKey]);
  const visibleMonthKey = retroModeEnabled ? referenceMonth : currentMonthKey;
  const selectedDateMonthKey = String(selectedDate || "").slice(0, 7);
  const syncMonthMismatchMessage = useMemo(() => {
    if (monthKey !== visibleMonthKey) {
      return `Inconsistência: Mês do log (${monthKey}) diferente do mês visível (${visibleMonthKey}).`;
    }
    if (selectedDateMonthKey && selectedDateMonthKey !== monthKey) {
      return `Inconsistência: data selecionada (${selectedDate}) fora do mês do log (${monthKey}).`;
    }
    return "";
  }, [monthKey, visibleMonthKey, selectedDateMonthKey, selectedDate]);

  useEffect(() => {
    if (dateDates.length === 0) return;
    if (!dateDates.includes(selectedDate)) {
      setSelectedDate(dateDates[0]);
    }
  }, [dateDates, selectedDate]);

  useEffect(() => {
    getAcademicCalendar({ month: monthKey })
      .then((response) => {
        const payload = (response?.data || {}) as {
          settings?: AcademicCalendarSettings | null;
          events?: AcademicCalendarEvent[];
        };
        setCalendarSettings(payload.settings || null);
        setCalendarEvents(Array.isArray(payload.events) ? payload.events : []);
      })
      .catch(() => {
        setCalendarSettings(null);
        setCalendarEvents([]);
      });
  }, [monthKey]);

  const classKey = useMemo(() => {
    const turmaKey = selectedClass.turmaCodigo || selectedClass.turmaLabel || selectedTurma || "";
    const horarioKey = selectedClass.horario || selectedHorario || "";
    const professorKey = selectedClass.professor || selectedProfessor || "";
    if (!turmaKey || !horarioKey || !professorKey || !monthKey) return "";
    return `${turmaKey}|${horarioKey}|${professorKey}|${monthKey}`;
  }, [selectedClass, selectedTurma, selectedHorario, selectedProfessor, monthKey]);

  const storageKey = classKey ? `attendance:${classKey}` : "";

  const initialStudents = getStudentNamesForClass(studentsPerClass, {
    turmaCodigo: selectedClass.turmaCodigo,
    turmaLabel: selectedClass.turmaLabel,
    horario: selectedClass.horario || selectedHorario,
    professor: selectedClass.professor || selectedProfessor,
  });
  const initialAttendance = initialStudents.map((aluno, idx) => ({
    id: idx + 1,
    aluno,
    attendance: dateDates.reduce(
      (acc, date) => {
        acc[date] = "";
        return acc;
      },
      {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
    ),
  }));

  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
  const [transferLocksByName, setTransferLocksByName] = useState<Record<string, TransferLockInfo>>({});
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [history, setHistory] = useState<AttendanceHistory[]>([]);
  const [hasUnsavedLocalChanges, setHasUnsavedLocalChanges] = useState(false);
  const hasUnsavedLocalChangesRef = useRef(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => {
    const byWidth = window.innerWidth <= 768;
    const byLandscapePhone = window.innerWidth <= 1024 && window.innerHeight <= 500;
    return byWidth || byLandscapePhone;
  });

  const sortedAttendance = useMemo(() => {
    return [...attendance].sort((a, b) => {
      const res = a.aluno.localeCompare(b.aluno);
      return sortDir === "asc" ? res : -res;
    });
  }, [attendance, sortDir]);

  const currentClassCapacity = Math.max(0, Number(selectedClass.capacidade || 0));
  const currentClassLotacao = sortedAttendance.length;

  useEffect(() => {
    hasUnsavedLocalChangesRef.current = hasUnsavedLocalChanges;
  }, [hasUnsavedLocalChanges]);

  useEffect(() => {
    setHasUnsavedLocalChanges(false);
  }, [storageKey]);

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 768px)");
    const landscapePhoneQuery = window.matchMedia("(max-width: 1024px) and (max-height: 500px)");

    const syncViewport = () => {
      setIsCompactViewport(compactQuery.matches || landscapePhoneQuery.matches);
    };

    syncViewport();

    const onCompactChange = () => syncViewport();
    const onLandscapeChange = () => syncViewport();

    compactQuery.addEventListener("change", onCompactChange);
    landscapePhoneQuery.addEventListener("change", onLandscapeChange);

    return () => {
      compactQuery.removeEventListener("change", onCompactChange);
      landscapePhoneQuery.removeEventListener("change", onLandscapeChange);
    };
  }, []);

  const formatMobileStudentName = (fullName: string) => {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(" ");

    const first = parts[0];
    const middle: string[] = [];
    const second = parts[1];
    if (second) {
      middle.push(second);
      if (nameParticles.has(normalizeText(second)) && parts[2]) {
        middle.push(parts[2]);
      }
    }

    const last = parts[parts.length - 1];
    const picked = [first, ...middle];
    const hasLast = picked.some((token) => normalizeText(token) === normalizeText(last));
    if (!hasLast) picked.push(last);
    return picked.join(" ");
  };

  const getDisplayStudentName = (fullName: string) => {
    if (!isCompactViewport) return fullName;
    return formatMobileStudentName(fullName);
  };
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string>("");
  const hydrationRequestIdRef = useRef(0);
  const [hydrationRefreshSeq, setHydrationRefreshSeq] = useState(0);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [hydrationReadInfo, setHydrationReadInfo] = useState<{
    ref: string;
    snapshot: string;
    hasLog: boolean;
    studentCount: number;
    updatedAt: string;
  } | null>(null);
  const [syncIndicator, setSyncIndicator] = useState<{
    status: "checking" | "confirmed" | "pending" | "error";
    detail: string;
    updatedAt: string;
  } | null>(null);
  const lastHydrationReadAlertRef = useRef<string>("");

  const refreshSyncIndicator = useCallback(async () => {
    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      setSyncIndicator(null);
      return;
    }

    const scope = {
      turmaCodigo: persistence.turmaCodigo,
      turmaLabel: persistence.turmaLabel,
      horario: persistence.horario,
      professor: persistence.professor,
      mes: monthKey,
    };

    setSyncIndicator((prev) => ({
      status: "checking",
      detail: prev?.detail || "Verificando sincronização...",
      updatedAt: new Date().toLocaleTimeString("pt-BR"),
    }));

    try {
      const pendingInfo = getPendingAttendanceScopeStatus(scope);
      const pendingCount = Number(pendingInfo?.pending || 0);
      const probe = await forceAttendanceSync(scope).catch(() => ({ data: { hasLog: false } }));
      const hasRemoteLog = Boolean(probe?.data?.hasLog);
      const serverSavedAt = String(probe?.data?.saved_at || "").trim();

      if (pendingCount > 0) {
        setSyncIndicator({
          status: "pending",
          detail: `Pendente: ${pendingCount} item(ns) na fila local para esta turma/mês.`,
          updatedAt: new Date().toLocaleTimeString("pt-BR"),
        });
        return;
      }

      if (hasRemoteLog) {
        setSyncIndicator({
          status: "confirmed",
          detail: serverSavedAt
            ? `Confirmado no servidor (${serverSavedAt}).`
            : "Confirmado no servidor.",
          updatedAt: new Date().toLocaleTimeString("pt-BR"),
        });
        return;
      }

      setSyncIndicator({
        status: "pending",
        detail: "Sem log confirmado no servidor para esta turma/mês.",
        updatedAt: new Date().toLocaleTimeString("pt-BR"),
      });
    } catch {
      setSyncIndicator({
        status: "error",
        detail: "Não foi possível verificar sync agora.",
        updatedAt: new Date().toLocaleTimeString("pt-BR"),
      });
    }
  }, [monthKey, resolvePersistenceContext]);

  useEffect(() => {
    refreshSyncIndicator();
  }, [refreshSyncIndicator, hydrationRefreshSeq, selectedTurma, selectedHorario, selectedProfessor, monthKey]);

  const getTransferLockForDate = useCallback(
    (studentName: string, dateKey: string): TransferLockInfo | null => {
      const info = transferLocksByName[normalizeText(studentName)];
      if (!info) return null;
      return dateKey < info.lockBeforeDate ? info : null;
    },
    [transferLocksByName]
  );

  const sanitizeTransferHistory = useCallback((input: TransferHistoryEntry[]): NormalizedTransferHistoryEntry[] => {
    const seen = new Map<string, NormalizedTransferHistoryEntry>();
    input.forEach((entry) => {
      const normalized: NormalizedTransferHistoryEntry = {
        nome: String(entry?.nome || "").trim(),
        fromNivel: String(entry?.fromNivel || "").trim(),
        toNivel: String(entry?.toNivel || "").trim(),
        fromTurma: String(entry?.fromTurma || "").trim(),
        toTurma: String(entry?.toTurma || "").trim(),
        fromHorario: String(entry?.fromHorario || "").trim(),
        toHorario: String(entry?.toHorario || "").trim(),
        fromProfessor: String(entry?.fromProfessor || "").trim(),
        toProfessor: String(entry?.toProfessor || "").trim(),
        effectiveDate: String(entry?.effectiveDate || "").trim(),
      };

      if (!normalized.nome || !normalized.effectiveDate) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.effectiveDate)) return;

      const key = [
        normalizeText(normalized.nome),
        normalizeText(normalized.fromNivel),
        normalizeText(normalized.toNivel),
        normalizeText(normalized.toTurma),
        normalizeHorarioDigits(normalized.toHorario),
        normalizeText(normalized.toProfessor),
        normalized.effectiveDate,
      ].join("|");

      seen.set(key, normalized);
    });

    return Array.from(seen.values());
  }, []);

  const loadTransferHistory = useCallback((): NormalizedTransferHistoryEntry[] => {
    try {
      const raw = localStorage.getItem(transferHistoryStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? (parsed as TransferHistoryEntry[]) : [];
      const cleaned = sanitizeTransferHistory(list);
      if (JSON.stringify(cleaned) !== JSON.stringify(list)) {
        localStorage.setItem(transferHistoryStorageKey, JSON.stringify(cleaned));
      }
      return cleaned;
    } catch {
      return [];
    }
  }, [sanitizeTransferHistory]);

  // Estados para o Modal de Justificativa
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [justificationStudentId, setJustificationStudentId] = useState<number | null>(null);
  const [justificationDay, setJustificationDay] = useState("");
  const [justificationReason, setJustificationReason] = useState("");

  // Estados para o Modal de Anotações do Aluno
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [studentModalId, setStudentModalId] = useState<number | null>(null);
  const [newNote, setNewNote] = useState("");

  // --- ESTADOS DO MÓDULO INTELIGENTE (DATA/CLIMA) ---
  const [showDateModal, setShowDateModal] = useState(false);
  const [modalDate, setModalDate] = useState(""); // Data selecionada (YYYY-MM-DD)
  const [modalStep, setModalStep] = useState<"select" | "aula" | "ocorrencia">("select");
  const [climaPrefillApplied, setClimaPrefillApplied] = useState(false);
  const [showClimateEditor, setShowClimateEditor] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState<AcademicCalendarSettings | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(() => {
    if (import.meta.env.DEV) return true;
    try {
      return localStorage.getItem(attendanceDebugKey) === "1";
    } catch {
      return false;
    }
  });
  const [debugEvents, setDebugEvents] = useState<AttendanceDebugEvent[]>(() => {
    try {
      const raw = localStorage.getItem(attendanceDebugEventsKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-40) : [];
    } catch {
      return [];
    }
  });
  const [debugPanelCollapsed, setDebugPanelCollapsed] = useState<boolean>(() => {
    try {
      return window.innerWidth <= 768;
    } catch {
      return true;
    }
  });
  const [showClearOptions, setShowClearOptions] = useState(false);
  
  // Dados do Formulário do Modal
  const [poolData, setPoolData] = useState({
    tempExterna: "",
    tempPiscina: DEFAULT_POOL_TEMP,
    cloro: 1.5,
    cloroEnabled: true,
    selectedIcons: [] as string[],
    weatherCondition: "",
    weatherConditionCode: "",
    incidentType: "",
    incidentNote: "",
    incidentImpact: "aula" as "aula" | "dia",
    personalType: "Medico" as "Medico" | "Particular",
    logType: "aula" as ModalLogType
  });

  const cloroLocked =
    poolData.logType === "ocorrencia" && poolData.incidentType !== "Manutencao";

  useEffect(() => {
    if (cloroLocked && poolData.cloroEnabled) {
      setPoolData(prev => ({ ...prev, cloroEnabled: false }));
    }
  }, [cloroLocked, poolData.cloroEnabled]);

  const fetchWeatherData = async (date: string) => {
    try {
      const response = await getWeather(date);
      return response.data as { temp: string; condition: string; conditionCode?: string; source?: string };
    } catch (error) {
      return { temp: "", condition: "", conditionCode: "", source: "error" };
    }
  };

  const climaCacheKey = (date: string) => `climaCache:${date}`;
  const lastClimaCacheDateKey = "climaLastDate";

  const getClimaCache = (date: string): ClimaCache | null => {
    if (!date) return null;
    try {
      const raw = localStorage.getItem(climaCacheKey(date));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ClimaCache;
      if (!parsed || typeof parsed !== "object") return null;
      const version = String(parsed.cacheVersion || "");
      const cachedAt = Number(parsed.cachedAt || 0);
      if (version !== WEATHER_CACHE_VERSION) return null;
      if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > WEATHER_CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const setClimaCache = (date: string, payload: ClimaCache) => {
    localStorage.setItem(
      climaCacheKey(date),
      JSON.stringify({
        ...payload,
        cacheVersion: WEATHER_CACHE_VERSION,
        cachedAt: Date.now(),
      })
    );
    localStorage.setItem(lastClimaCacheDateKey, date);
  };

  const toMinutes = (time?: string) => {
    const raw = String(time || "").trim();
    if (!raw) return null;
    const [h, m] = raw.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const normalizeHorarioForMinutes = (value?: string) => {
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

  const normalizeCalendarDateKey = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [dd, mm, yyyy] = raw.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }
    return raw.slice(0, 10);
  };

  const getHolidayBridgeEventForDate = (date: string) => {
    const dateKey = normalizeCalendarDateKey(date);
    return calendarEvents.find(
      (event) => {
        const eventDate = normalizeCalendarDateKey(event.date);
        const eventType = normalizeText(String(event.type || ""));
        return eventDate === dateKey && (eventType === "feriado" || eventType === "ponte");
      }
    );
  };

  const getAllDayMeetingEventForDate = (date: string) => {
    const dateKey = normalizeCalendarDateKey(date);
    return calendarEvents.find(
      (event) =>
        normalizeCalendarDateKey(event.date) === dateKey &&
        normalizeText(String(event.type || "")) === "reuniao" &&
        !!event.allDay
    );
  };

  const getBlockingMeetingEventForDate = (date: string) => {
    const classStart = toMinutes(normalizeHorarioForMinutes(selectedClass.horario || selectedHorario));
    if (classStart === null) return null as AcademicCalendarEvent | null;

    const dateKey = normalizeCalendarDateKey(date);

    const dayMeetings = calendarEvents.filter(
      (event) =>
        normalizeCalendarDateKey(event.date) === dateKey &&
        normalizeText(String(event.type || "")) === "reuniao"
    );

    return (
      dayMeetings.find((event) => {
        if (event.allDay) return true;
        const eventStart = toMinutes(event.startTime);
        const eventEnd = toMinutes(event.endTime);
        if (eventStart === null || eventEnd === null) return false;
        return classStart >= eventStart && classStart < eventEnd;
      }) || null
    );
  };

  const buildHolidayBridgeReason = (event: AcademicCalendarEvent) => {
    const eventLabel = event.type === "feriado" ? "Feriado" : "Ponte";
    const description = String(event.description || "").trim();
    return description ? `${eventLabel}: ${description}` : eventLabel;
  };

  const buildMeetingReason = (event: AcademicCalendarEvent) => {
    const description = String(event.description || "").trim();
    return description ? `Reunião: ${description}` : "Reunião";
  };

  const getClimateCancellationReasonForDate = (date: string) => {
    for (const student of attendance) {
      const reason = String(student.justifications?.[date] || "").trim();
      if (reason.startsWith(CANCELLED_CLASS_REASON_PREFIX)) {
        return reason;
      }
    }
    return "";
  };

  const applyCalendarClosureJustification = async (date: string, reasonLabel: string) => {
    const persistence = resolvePersistenceContext();
    const changedEntries: Array<{ aluno_nome: string; data: string; motivo: string; turmaCodigo: string; turmaLabel: string; horario: string; professor: string }> = [];
    const nextAttendance: AttendanceRecord[] = attendance.map((student) => {
      const currentStatus = student.attendance?.[date] || "";
      const currentReason = (student.justifications || {})[date] || "";

      const canAutoJustify = currentStatus !== "Presente";
      if (!canAutoJustify) {
        return student;
      }

      const statusChanged = currentStatus !== "Justificado";
      const reasonChanged = currentReason !== reasonLabel;
      if (!statusChanged && !reasonChanged) {
        return student;
      }

      changedEntries.push({
        aluno_nome: student.aluno,
        data: date,
        motivo: reasonLabel,
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
      });

      return {
        ...student,
        attendance: { ...student.attendance, [date]: "Justificado" as const },
        justifications: { ...(student.justifications || {}), [date]: reasonLabel },
      };
    });

    if (changedEntries.length === 0) return;

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setAttendance(nextAttendance);

    if (persistence.isValid) {
      try {
        logPersistenceDebug("saveAttendanceLog:auto_calendar_closure", {
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
        });
        await saveAttendanceLog({
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
          registros: nextAttendance.map((item) => ({
            aluno_nome: item.aluno,
            attendance: item.attendance,
            justifications: item.justifications || {},
            notes: item.notes || [],
          })),
        });
      } catch {
        // ignore to avoid blocking UI
      }
    }
  };

  const applyHolidayBridgeJustification = async (date: string, event: AcademicCalendarEvent) => {
    await applyCalendarClosureJustification(date, buildHolidayBridgeReason(event));
  };

  const applyAllDayMeetingJustification = async (date: string, event: AcademicCalendarEvent) => {
    await applyCalendarClosureJustification(date, buildMeetingReason(event));
  };

  const getModalLogTypeLabel = () => {
    if (poolData.logType === "aula") return "AULA";
    if (poolData.logType === "ocorrencia") return "OCORRÊNCIA";
    return "";
  };

  const buildSensationFromApi = (apiData: { temp: string }) => {
    return [getFallbackSensationByTemp(String(apiData.temp || ""))];
  };

  const handleDateClick = async (date: string) => {
    setSelectedDate(date);

    const climateCancellationReason = getClimateCancellationReasonForDate(date);
    if (climateCancellationReason) {
      await applyCalendarClosureJustification(date, climateCancellationReason);
    }

    const holidayBridgeEvent = getHolidayBridgeEventForDate(date);
    if (holidayBridgeEvent) {
      await applyHolidayBridgeJustification(date, holidayBridgeEvent);
      return;
    }

    const allDayMeetingEvent = getAllDayMeetingEventForDate(date);
    if (allDayMeetingEvent) {
      await applyAllDayMeetingJustification(date, allDayMeetingEvent);
      return;
    }

    const classBlockedByMeeting = isClassBlockedByEventPeriod(
      date,
      selectedClass.horario || selectedHorario,
      calendarEvents
    );
    if (classBlockedByMeeting) {
      return;
    }

    setModalDate(date);
    setModalStep("select");
    setClimaPrefillApplied(false);
    setShowClimateEditor(false);
    const isCurrentDate = date === todayDateKey;
    const isRetroDate = date < todayDateKey;
    const isSameDateSelection = modalDate === date;
    
    // Resetar dados
    setPoolData(prev => ({
      ...prev,
      tempPiscina: DEFAULT_POOL_TEMP,
      cloro: isSameDateSelection ? prev.cloro : 1.5,
      cloroEnabled: isSameDateSelection ? prev.cloroEnabled : true,
      selectedIcons: isSameDateSelection ? prev.selectedIcons : [],
      weatherCondition: isSameDateSelection ? prev.weatherCondition : "",
      weatherConditionCode: isSameDateSelection ? prev.weatherConditionCode : "",
      incidentType: "",
      incidentNote: "",
      incidentImpact: "aula",
      logType: "aula"
    }));

    try {
      const selectedTurmaCodigo = String(selectedClass.turmaCodigo || "").trim();
      const selectedTurmaLabel = String(selectedClass.turmaLabel || selectedTurma || "").trim();
      const selectedHorarioValue = String(selectedClass.horario || selectedHorario || "").trim();
      const selectedProfessorValue = String(selectedClass.professor || selectedProfessor || "").trim();

      const horarioDigits = normalizeHorarioDigits(selectedHorarioValue);
      const horarioHour = horarioDigits ? Number(horarioDigits.slice(0, 2)) : Number.NaN;
      const legacyHorarioAnchor = Number.isFinite(horarioHour)
        ? horarioHour < 12
          ? "06:00"
          : horarioHour < 18
            ? "13:00"
            : "19:00"
        : "";

      const queryCandidates: Array<Record<string, string>> = [
        {
          turmaCodigo: selectedTurmaCodigo,
          turmaLabel: selectedTurmaLabel,
          horario: selectedHorarioValue,
          professor: selectedProfessorValue,
        },
        {
          turmaCodigo: "",
          turmaLabel: selectedTurmaLabel,
          horario: selectedHorarioValue,
          professor: "",
        },
      ];

      if (legacyHorarioAnchor && legacyHorarioAnchor !== formatHorario(selectedHorarioValue)) {
        queryCandidates.push(
          {
            turmaCodigo: selectedTurmaCodigo,
            turmaLabel: selectedTurmaLabel,
            horario: legacyHorarioAnchor,
            professor: selectedProfessorValue,
          },
          {
            turmaCodigo: "",
            turmaLabel: selectedTurmaLabel,
            horario: legacyHorarioAnchor,
            professor: "",
          }
        );
      }

      type PoolLogResponseData = {
        turmaCodigo?: string;
        turmaLabel?: string;
        horario?: string;
        professor?: string;
        clima1: string;
        clima2: string;
        statusAula?: string;
        nota: string;
        tipoOcorrencia: string;
        tempExterna: string;
        tempPiscina: string;
        cloroPpm: number | null;
      };

      let data: PoolLogResponseData | null = null;

      for (const candidate of queryCandidates) {
        const existing = await getPoolLog(date, candidate);
        if (existing?.data && typeof existing.data === "object") {
          data = existing.data as PoolLogResponseData;
          break;
        }
      }

      if (!data) {
        throw new Error("no pool log");
      }

      const statusFromLog = String(data.statusAula || "").toLowerCase();
      const icons = normalizeSensationList(
        (data.clima2 ? data.clima2.split(",") : []).map((item) => item.trim())
      );
      const inferredCondition = String(data.clima1 || "").trim();
      const inferredConditionLabel = normalizeWeatherConditionLabel(inferredCondition, "");
      const normalizedTemp = normalizeNumberInput(data.tempExterna);

      const cloroRaw = data.cloroPpm as unknown;
      const cloroValue = typeof cloroRaw === "number" ? cloroRaw : Number.NaN;
      const cloroEnabled = Number.isFinite(cloroValue);
      const modalLogType: ModalLogType = data.nota === "ocorrencia" ? "ocorrencia" : "aula";
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizedTemp,
        tempPiscina: normalizeNumberInput(data.tempPiscina),
        cloro: cloroEnabled ? cloroValue : 1.5,
        cloroEnabled,
        selectedIcons: icons,
        weatherCondition: inferredConditionLabel,
        weatherConditionCode: "",
        incidentType: data.nota === "ocorrencia" ? data.tipoOcorrencia : "",
        incidentNote: "",
        incidentImpact: "aula",
        logType: modalLogType,
      }));

      if (statusFromLog === "cancelada" || statusFromLog === "justificada") {
        const reason = inferredCondition || "Condições Climáticas";
        const reasonLabel = statusFromLog === "cancelada"
          ? `${CANCELLED_CLASS_REASON_PREFIX} ${reason}`
          : reason;

        await applyCalendarClosureJustification(date, reasonLabel);
      }

      if (modalLogType === "ocorrencia") {
        setClimaPrefillApplied(true);
        setModalStep("ocorrencia");
        setShowDateModal(true);
        return;
      } else {
        setModalStep("aula");
      }

      setClimaPrefillApplied(true);
      setShowDateModal(true);
      return;
    } catch {
      // Continua com prefill via cache/API; evita fallback de outra turma no mesmo dia.
    }

    // Intentional any cast so we can read cached fields without the compiler narrowing the result to never
    const climaCache = getClimaCache(date) as any;
    if (climaCache) {
      const cacheConditionLabel = normalizeWeatherConditionLabel(
        String(climaCache.weatherCondition || climaCache.apiCondition || ""),
        String(climaCache.apiConditionCode || "")
      );
      const cacheTemp = normalizeNumberInput(climaCache.tempExterna);
      const cacheHasClimateData = Boolean(cacheConditionLabel || cacheTemp);

      setPoolData(prev => ({
        ...prev,
        tempExterna: cacheTemp,
        selectedIcons: isCurrentDate ? [] : normalizeSensationList(climaCache.selectedIcons || []),
        weatherCondition: cacheConditionLabel,
        weatherConditionCode: String(climaCache.apiConditionCode || ""),
        cloro: typeof climaCache.cloro === "number" && Number.isFinite(climaCache.cloro) ? climaCache.cloro : prev.cloro,
        cloroEnabled: typeof climaCache.cloroEnabled === "boolean" ? climaCache.cloroEnabled : prev.cloroEnabled,
      }));

      if (cacheHasClimateData) {
        setClimaPrefillApplied(true);
        setShowDateModal(true);
        if (isRetroDate) {
          return;
        }
      }
    }

    const fallbackDate = localStorage.getItem(lastClimaCacheDateKey);
    const fallbackCache = !isRetroDate && fallbackDate && fallbackDate !== date ? getClimaCache(fallbackDate) : null;
    if (fallbackCache) {
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizeNumberInput(fallbackCache.tempExterna),
        selectedIcons: isCurrentDate ? [] : normalizeSensationList(fallbackCache.selectedIcons || []),
        weatherCondition: normalizeWeatherConditionLabel(
          String(fallbackCache.weatherCondition || fallbackCache.apiCondition || ""),
          String(fallbackCache.apiConditionCode || "")
        ),
        weatherConditionCode: String(fallbackCache.apiConditionCode || ""),
        cloro: typeof fallbackCache.cloro === "number" && Number.isFinite(fallbackCache.cloro) ? fallbackCache.cloro : prev.cloro,
        cloroEnabled: typeof fallbackCache.cloroEnabled === "boolean" ? fallbackCache.cloroEnabled : prev.cloroEnabled,
      }));
      setClimaPrefillApplied(true);
      setShowDateModal(true);
    }

    // Para data retroativa, usa API apenas se vier de snapshot historico do proprio dia.
    if (isRetroDate) {
      const retroApi = await fetchWeatherData(date);
      const retroSource = String(retroApi?.source || "").toLowerCase();
      if (retroSource === "snapshot") {
        const retroTemp = normalizeNumberInput(String(retroApi.temp || ""));
        const retroConditionCode = String(retroApi.conditionCode || "").toLowerCase();
        const retroConditionLabel = normalizeWeatherConditionLabel(
          String(retroApi.condition || ""),
          retroConditionCode
        );
        const retroIcons = buildSensationFromApi({ temp: retroTemp || "26" });

        setPoolData(prev => ({
          ...prev,
          tempExterna: retroTemp,
          selectedIcons: normalizeSensationList(retroIcons),
          weatherCondition: retroConditionLabel,
          weatherConditionCode: retroConditionCode,
          cloro: prev.cloro,
        }));

        setClimaCache(date, {
          tempExterna: retroTemp,
          selectedIcons: normalizeSensationList(retroIcons),
          cloro: poolData.cloro,
          cloroEnabled: poolData.cloroEnabled,
          apiTemp: String(retroApi.temp || ""),
          apiCondition: String(retroApi.condition || ""),
          apiConditionCode: retroConditionCode,
          weatherCondition: retroConditionLabel,
        });
      }
      setShowDateModal(true);
      return;
    }

    // Pré-carregar dados da API
    const apiData = await fetchWeatherData(date);
    const apiTemp = String(apiData.temp || "");
    const apiCondition = String(apiData.condition || "");
    const apiConditionCode = String(apiData.conditionCode || "").toLowerCase();
    const apiConditionLabel = normalizeWeatherConditionLabel(apiCondition, apiConditionCode);

    if (climaCache) {
      const hasApiSignature = Boolean(climaCache.apiTemp && climaCache.apiCondition && climaCache.apiConditionCode);
      const cacheMatchesApi =
        (climaCache.apiTemp || "") === apiTemp &&
        (climaCache.apiCondition || "") === apiCondition &&
        String(climaCache.apiConditionCode || "") === apiConditionCode;

      if (cacheMatchesApi || !hasApiSignature) {
        if (!hasApiSignature) {
          setClimaCache(date, {
            tempExterna: climaCache.tempExterna,
            selectedIcons: normalizeSensationList(climaCache.selectedIcons || []),
            cloro: typeof climaCache.cloro === "number" && Number.isFinite(climaCache.cloro) ? climaCache.cloro : poolData.cloro,
            cloroEnabled: typeof climaCache.cloroEnabled === "boolean" ? climaCache.cloroEnabled : poolData.cloroEnabled,
            apiTemp,
            apiCondition,
            apiConditionCode,
            weatherCondition: apiConditionLabel,
          });
        }
        setPoolData(prev => ({
          ...prev,
          weatherCondition: apiConditionLabel,
          weatherConditionCode: apiConditionCode,
          cloro: prev.cloro,
        }));
        setClimaPrefillApplied(true);
        setShowDateModal(true);
        return;
      }
    }

    const autoIcons = buildSensationFromApi(apiData);
    setPoolData(prev => ({
      ...prev,
      tempExterna: normalizeNumberInput(apiData.temp),
      selectedIcons: isCurrentDate ? [] : normalizeSensationList(autoIcons),
      weatherCondition: apiConditionLabel,
      weatherConditionCode: apiConditionCode,
      cloro: prev.cloro,
    }));
    setClimaCache(date, {
      tempExterna: normalizeNumberInput(apiData.temp),
      selectedIcons: normalizeSensationList(autoIcons),
      cloro: poolData.cloro,
      cloroEnabled: poolData.cloroEnabled,
      apiTemp,
      apiCondition,
      apiConditionCode,
      weatherCondition: apiConditionLabel,
    });
    setClimaPrefillApplied(true);
    setShowDateModal(true);
  };

  useEffect(() => {
    if (!attendance.length || !dateDates.length) return;
    const persistence = resolvePersistenceContext();

    const holidayDates = dateDates.filter((date) => !!getHolidayBridgeEventForDate(date));
    if (holidayDates.length === 0) return;

    const reasonByDate = new Map<string, string>();
    holidayDates.forEach((date) => {
      const event = getHolidayBridgeEventForDate(date);
      if (event) {
        reasonByDate.set(date, buildHolidayBridgeReason(event));
      }
    });

    const changedEntries: Array<{
      aluno_nome: string;
      data: string;
      motivo: string;
      turmaCodigo: string;
      turmaLabel: string;
      horario: string;
      professor: string;
    }> = [];

    let hasChanges = false;

    const nextAttendance = attendance.map((student) => {
      let studentChanged = false;
      const nextAttendanceMap = { ...student.attendance };
      const nextJustifications = { ...(student.justifications || {}) };

      holidayDates.forEach((date) => {
        const reason = reasonByDate.get(date);
        if (!reason) return;

        const currentStatus = student.attendance?.[date] || "";
        const currentReason = (student.justifications || {})[date] || "";

        if (currentStatus === "Presente") return;
        if (currentStatus === "Justificado") return;
        if (currentStatus === "" && currentReason === reason) return;

        nextAttendanceMap[date] = "Justificado";
        nextJustifications[date] = reason;
        studentChanged = true;
        hasChanges = true;

        changedEntries.push({
          aluno_nome: student.aluno,
          data: date,
          motivo: reason,
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
        });
      });

      if (!studentChanged) return student;
      return {
        ...student,
        attendance: nextAttendanceMap,
        justifications: nextJustifications,
      };
    });

    if (!hasChanges) return;

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setAttendance(nextAttendance);

    if (persistence.isValid) {
      logPersistenceDebug("saveAttendanceLog:auto_holiday_effect", {
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
      });
      saveAttendanceLog({
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
        registros: nextAttendance.map((item) => ({
          aluno_nome: item.aluno,
          attendance: item.attendance,
          justifications: item.justifications || {},
          notes: item.notes || [],
        })),
      }).catch(() => undefined);
    }
  }, [
    attendance,
    dateDates,
    calendarEvents,
    monthKey,
    resolvePersistenceContext,
  ]);

  useEffect(() => {
    if (!showDateModal || !modalDate) return;
    if (climaPrefillApplied) return;
    const shouldApply =
      modalStep === "aula" ||
      (modalStep === "ocorrencia" && poolData.incidentImpact === "aula");
    if (!shouldApply) return;
    const cache = getClimaCache(modalDate);
    if (cache) {
      const sensations = normalizeSensationList(cache.selectedIcons || []);
      const normalizedTemp = normalizeNumberInput(cache.tempExterna);
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizedTemp,
        selectedIcons: sensations.length ? sensations : [getFallbackSensationByTemp(normalizedTemp)],
        weatherCondition: normalizeWeatherConditionLabel(
          String(cache.weatherCondition || cache.apiCondition || ""),
          String(cache.apiConditionCode || "")
        ),
        weatherConditionCode: String(cache.apiConditionCode || ""),
        cloro: typeof cache.cloro === "number" && Number.isFinite(cache.cloro) ? cache.cloro : prev.cloro,
        cloroEnabled: typeof cache.cloroEnabled === "boolean" ? cache.cloroEnabled : prev.cloroEnabled,
      }));
    }
    setClimaPrefillApplied(true);
  }, [showDateModal, modalDate, modalStep, poolData.incidentImpact, climaPrefillApplied]);

  const toggleIcon = (icon: string) => {
    setPoolData(prev => {
      const exists = prev.selectedIcons.includes(icon);
      if (exists) return { ...prev, selectedIcons: prev.selectedIcons.filter(i => i !== icon) };
      if (prev.selectedIcons.length >= 3) return prev; // Limite de 3 para UI não quebrar
      return { ...prev, selectedIcons: [...prev.selectedIcons, icon] };
    });
  };

  // Matriz de Decisão
  const getSuggestedDecision = (): SuggestedClassDecision =>
    getSuggestedDecisionFromRules({
      conditionCode: poolData.weatherConditionCode,
      conditionLabel: poolData.weatherCondition,
      sensations: poolData.selectedIcons,
      tempPiscina: poolData.tempPiscina,
      cloroPpm: cloroLocked ? Number.NaN : poolData.cloro,
      nivel: selectedClass.nivel,
      faixaEtaria: selectedClass.faixaEtaria,
    });

  const handleSaveLog = async (logTypeOverride?: ModalLogType | React.MouseEvent<HTMLButtonElement>) => {
    if (monthKey !== currentMonthKey) {
      const proceed = window.confirm(
        `Você está salvando no mês ${currentMonthFormatted} (retroativo). Deseja continuar?`
      );
      if (!proceed) return;
    }

    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      alert("Selecione turma, horário e professor válidos antes de salvar.");
      return;
    }

    setShowDateModal(false);

    const effectiveLogType = typeof logTypeOverride === "string" ? logTypeOverride : poolData.logType;
    const suggestedDecision = getSuggestedDecision();
    const statusSugerido = suggestedDecision.status;
    const isOccurrence = effectiveLogType === "ocorrencia";
    const occurrenceImpact = poolData.incidentImpact;
    const reasonLabel = isOccurrence
      ? `Ocorrência (${occurrenceImpact}): ${poolData.incidentType || poolData.personalType}`
      : statusSugerido === "cancelada"
        ? `${CANCELLED_CLASS_REASON_PREFIX} ${suggestedDecision.reason}`
        : suggestedDecision.reason || "Condições Climáticas";
    
    // Lógica para aula justificada e ocorrência
    const shouldTreatOccurrenceAsClass = isOccurrence && occurrenceImpact === "aula";
    const shouldTreatOccurrenceAsDay = isOccurrence && occurrenceImpact === "dia";
    const shouldMassJustify =
      (effectiveLogType === "aula" && statusSugerido === "justificada") ||
      (effectiveLogType === "aula" && statusSugerido === "cancelada") ||
      shouldTreatOccurrenceAsClass ||
      shouldTreatOccurrenceAsDay;
    const shouldAddJustificationNote = shouldMassJustify || isOccurrence;
    let nextAttendanceSnapshot = attendance;
    const shouldClearCancelledLock = effectiveLogType === "aula" && statusSugerido === "normal";

    if (shouldClearCancelledLock) {
      const hasCancelledReason = attendance.some((student) =>
        String(student.justifications?.[modalDate] || "").startsWith(CANCELLED_CLASS_REASON_PREFIX)
      );

      if (hasCancelledReason) {
        nextAttendanceSnapshot = attendance.map((student) => {
          const reason = String(student.justifications?.[modalDate] || "");
          if (!reason.startsWith(CANCELLED_CLASS_REASON_PREFIX)) {
            return student;
          }

          const nextJustifications = { ...(student.justifications || {}) };
          delete nextJustifications[modalDate];

          const nextAttendance = { ...(student.attendance || {}) };
          if (nextAttendance[modalDate] === "Justificado") {
            nextAttendance[modalDate] = "";
          }

          return {
            ...student,
            attendance: nextAttendance,
            justifications: nextJustifications,
          };
        });

        setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
        setAttendance(nextAttendanceSnapshot);

        logPersistenceDebug("saveAttendanceLog:clear_cancelled_lock", {
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
        });

        await saveAttendanceLog({
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
          registros: nextAttendanceSnapshot.map((item) => ({
            aluno_nome: item.aluno,
            attendance: item.attendance,
            justifications: item.justifications || {},
            notes: item.notes || [],
          })),
        }).catch(() => undefined);
      }
    }

    if (shouldMassJustify || shouldAddJustificationNote) {
      // Aplicar justificativa em massa
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      const changedEntries: Array<{
        aluno_nome: string;
        data: string;
        motivo: string;
        turmaCodigo: string;
        turmaLabel: string;
        horario: string;
        professor: string;
      }> = [];
      nextAttendanceSnapshot = attendance.map((student) => {
        const currentStatus = String(student.attendance?.[modalDate] || "");
        const nextJustifications = { ...(student.justifications || {}) };
        if (shouldMassJustify && currentStatus === "") {
          nextJustifications[modalDate] = reasonLabel;
          changedEntries.push({
            aluno_nome: student.aluno,
            data: modalDate,
            motivo: reasonLabel,
            turmaCodigo: persistence.turmaCodigo,
            turmaLabel: persistence.turmaLabel,
            horario: persistence.horario,
            professor: persistence.professor,
          });
        } else if (shouldAddJustificationNote && currentStatus === "") {
          nextJustifications[modalDate] = reasonLabel;
          changedEntries.push({
            aluno_nome: student.aluno,
            data: modalDate,
            motivo: reasonLabel,
            turmaCodigo: persistence.turmaCodigo,
            turmaLabel: persistence.turmaLabel,
            horario: persistence.horario,
            professor: persistence.professor,
          });
        }
        return {
          ...student,
          attendance: shouldMassJustify && currentStatus === "" ? { ...student.attendance, [modalDate]: "Justificado" } : student.attendance,
          justifications: nextJustifications,
        };
      });
      setAttendance(nextAttendanceSnapshot);

      logPersistenceDebug("saveAttendanceLog:modal_mass_justification", {
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
      });
      await saveAttendanceLog({
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
        registros: nextAttendanceSnapshot.map((item) => ({
          aluno_nome: item.aluno,
          attendance: item.attendance,
          justifications: item.justifications || {},
          notes: item.notes || [],
        })),
      }).catch(() => undefined);
    }

    // Construção do Objeto de Log (Persistência)
    const logEntry: PoolLogEntry = {
      data: modalDate,
      turmaCodigo: persistence.turmaCodigo,
      turmaLabel: persistence.turmaLabel,
      horario: persistence.horario,
      professor: persistence.professor,
      clima1: String(poolData.weatherCondition || "").trim(),
      clima2: normalizeSensationList(poolData.selectedIcons).join(", "),
      statusAula: effectiveLogType === "aula" ? statusSugerido : "cancelada",
      nota: effectiveLogType,
      tipoOcorrencia: effectiveLogType === "ocorrencia" ? 
        (poolData.incidentType || poolData.personalType) : "nenhuma",
      tempExterna: poolData.tempExterna || "",
      tempPiscina: poolData.tempPiscina || "",
      cloroPpm: !cloroLocked && Number.isFinite(poolData.cloro) ? poolData.cloro : null,
    };

    try {
      if (effectiveLogType === "aula" || (isOccurrence && occurrenceImpact === "aula")) {
        const existingCache = getClimaCache(modalDate);
        setClimaCache(modalDate, {
          tempExterna: normalizeNumberInput(poolData.tempExterna),
          selectedIcons: normalizeSensationList(poolData.selectedIcons),
          cloro: Number.isFinite(poolData.cloro) ? poolData.cloro : (existingCache?.cloro ?? 1.5),
          cloroEnabled: !cloroLocked,
          apiTemp: existingCache?.apiTemp,
          apiCondition: existingCache?.apiCondition,
          apiConditionCode: poolData.weatherConditionCode || existingCache?.apiConditionCode,
          weatherCondition: poolData.weatherCondition || existingCache?.weatherCondition,
        });
      }
      logPersistenceDebug("savePoolLog:modal", {
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
      });
      const response = await savePoolLog(logEntry);
      const action = response?.data?.action ? ` (${response.data.action})` : "";
      const file = response?.data?.file ? `\nArquivo: ${response.data.file}` : "";
      const reference = `\nRef: ${monthKey} | ${persistence.turmaCodigo || persistence.turmaLabel} | ${persistence.horario} | ${persistence.professor}`;
      alert(`Dados salvos! Status da aula: ${logEntry.statusAula.toUpperCase()}${action}${reference}${file}`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      console.error("pool-log save error", error);
      alert(detail ? `Erro ao salvar dados do clima: ${detail}` : "Erro ao salvar dados do clima. Tente novamente.");
    }
  };

  // Cor do Slider de Cloro
  const getChlorineColor = (val: number) => {
    if (val <= 1.0) return "#a0aec0"; // Transparente/Cinza
    if (val <= 3.0) return "#ffc107"; // Amarelo (Ideal/Ok)
    if (val <= 5.0) return "#fd7e14"; // Laranja
    return "#dc3545"; // Vermelho/Laranja Intenso
  };

  const clickTimerRef = useRef<number | null>(null);

  const handleOpenStudentModal = (id: number) => {
    setStudentModalId(id);
    setNewNote("");
    setStudentModalOpen(true);
  };

  const handleStudentClick = (id: number) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    clickTimerRef.current = window.setTimeout(() => {
      handleOpenStudentModal(id);
      clickTimerRef.current = null;
    }, 400);
  };

  const handleNavigateToStudent = (name: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!name) return;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    const lookupName = normalizeText(name);
    localStorage.setItem("studentLookupName", lookupName || name);
    window.location.hash = "students";
  };

  const persistNotesSnapshot = useCallback(async (snapshot: AttendanceRecord[]) => {
    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) return;

    const attendanceResp: any = await saveAttendanceLog({
      turmaCodigo: persistence.turmaCodigo,
      turmaLabel: persistence.turmaLabel,
      horario: persistence.horario,
      professor: persistence.professor,
      mes: monthKey,
      registros: snapshot.map((item) => ({
        aluno_nome: item.aluno,
        attendance: item.attendance,
        justifications: item.justifications || {},
        notes: item.notes || [],
      })),
    }).catch(() => null);

    if (attendanceResp?.data?.ok && !attendanceResp?.data?.queued) {
      setHasUnsavedLocalChanges(false);
    }

    refreshSyncIndicator().catch(() => undefined);
  }, [monthKey, refreshSyncIndicator, resolvePersistenceContext]);

  const handleAddNote = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newNote.trim() && studentModalId !== null) {
      const noteText = newNote.trim();
      const nextAttendanceSnapshot = attendance.map((item) => {
        if (item.id !== studentModalId) return item;
        return {
          ...item,
          notes: [...(item.notes || []), noteText],
        };
      });

      setHasUnsavedLocalChanges(true);
      setAttendance(nextAttendanceSnapshot);
      setNewNote("");
      persistNotesSnapshot(nextAttendanceSnapshot).catch(() => undefined);
    }
  };

  const handleDeleteNote = (noteIndex: number) => {
    if (studentModalId !== null) {
      const nextAttendanceSnapshot = attendance.map((item) => {
        if (item.id !== studentModalId) return item;
        const updatedNotes = [...(item.notes || [])];
        updatedNotes.splice(noteIndex, 1);
        return { ...item, notes: updatedNotes };
      });

      setHasUnsavedLocalChanges(true);
      setAttendance(nextAttendanceSnapshot);
      persistNotesSnapshot(nextAttendanceSnapshot).catch(() => undefined);
    }
  };

  const activeStudentForNotes = attendance.find((s) => s.id === studentModalId);

  // Formato: mmm/aaaa (ex: jan/2026)
  const currentMonthFormatted = (() => {
    const monthRef = retroModeEnabled ? referenceMonth : currentMonthKey;
    const [yearRaw, monthRaw] = monthRef.split("-");
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    const months = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      const now = new Date();
      return `${months[now.getMonth()]}/${now.getFullYear()}`;
    }
    return `${months[monthIndex]}/${year}`;
  })();

  const selectedDaysKey = resolvedDiasSemana.join("|");

  const resolveReportHistoricoDateKey = (rawDayKey: string, availableDateKeys: string[]) => {
    const raw = String(rawDayKey || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return availableDateKeys.includes(raw) ? raw : "";
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [dd, mm, yyyy] = raw.split("/");
      const iso = `${yyyy}-${mm}-${dd}`;
      return availableDateKeys.includes(iso) ? iso : "";
    }
    const day = raw.padStart(2, "0");
    const dateKey = `${monthKey}-${day}`;
    return availableDateKeys.includes(dateKey) ? dateKey : "";
  };

  useEffect(() => {
    const triggerRefresh = () => {
      if (hasUnsavedLocalChangesRef.current) return;
      setHydrationRefreshSeq((prev) => prev + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    window.addEventListener("focus", triggerRefresh);
    window.addEventListener("pageshow", triggerRefresh);
    window.addEventListener("hashchange", triggerRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", triggerRefresh);
      window.removeEventListener("pageshow", triggerRefresh);
      window.removeEventListener("hashchange", triggerRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrateAttendance = async () => {
      const requestId = ++hydrationRequestIdRef.current;
      const turmaLookup = selectedClass.turmaCodigo || selectedClass.turmaLabel;
      if (!turmaLookup || !storageKey) {
        if (isMounted && requestId === hydrationRequestIdRef.current) setHydratedStorageKey("");
        return;
      }

      const classStudents = getStudentNamesForClass(studentsPerClass, {
        turmaCodigo: selectedClass.turmaCodigo,
        turmaLabel: selectedClass.turmaLabel,
        horario: selectedClass.horario || selectedHorario,
        professor: selectedClass.professor || selectedProfessor,
      });

      const newDates = generateDates(resolvedDiasSemana, monthKey).map((d) => d.split(" ")[0]);
      const storedRecords = loadAttendanceStorage();
      const excludedList = (() => {
        try {
          const raw = localStorage.getItem("excludedStudents");
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [] as any[];
        }
      })();

      const selectedTurmaNorm = normalizeText(selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "");
      const selectedTurmaCodigoNorm = normalizeText(selectedClass.turmaCodigo || "");
      const selectedHorarioNorm = normalizeHorarioDigits(selectedClass.horario || selectedHorario || "");
      const selectedProfessorNorm = normalizeText(selectedClass.professor || selectedProfessor || "");

      const exclusionMatchesSelectedClass = (exclusion: any) => {
        const exclusionTurmaNorm = normalizeText(
          exclusion?.turmaLabel || exclusion?.TurmaLabel || exclusion?.turma || exclusion?.Turma || ""
        );
        const exclusionTurmaCodigoNorm = normalizeText(exclusion?.turmaCodigo || exclusion?.TurmaCodigo || "");
        const exclusionHorarioNorm = normalizeHorarioDigits(exclusion?.horario || exclusion?.Horario || "");
        const exclusionProfessorNorm = normalizeText(exclusion?.professor || exclusion?.Professor || "");

        const hasTurmaInfo = Boolean(exclusionTurmaNorm || exclusionTurmaCodigoNorm);
        const hasHorarioInfo = Boolean(exclusionHorarioNorm);
        const hasProfessorInfo = Boolean(exclusionProfessorNorm);

        const turmaMatches =
          !hasTurmaInfo ||
          exclusionTurmaNorm === selectedTurmaNorm ||
          exclusionTurmaNorm === selectedTurmaCodigoNorm ||
          exclusionTurmaCodigoNorm === selectedTurmaNorm ||
          exclusionTurmaCodigoNorm === selectedTurmaCodigoNorm;
        const horarioMatches = !hasHorarioInfo || !selectedHorarioNorm || exclusionHorarioNorm === selectedHorarioNorm;
        const professorMatches =
          !hasProfessorInfo || !selectedProfessorNorm || exclusionProfessorNorm === selectedProfessorNorm;

        return turmaMatches && horarioMatches && professorMatches;
      };

      const excludedNamesForSelectedClass = new Set(
        excludedList
          .filter((exclusion) => exclusionMatchesSelectedClass(exclusion))
          .map((exclusion) => normalizeText(exclusion?.nome || exclusion?.Nome || ""))
          .filter(Boolean)
      );

      const excludedIdsForSelectedClass = new Set(
        excludedList
          .filter((exclusion) => exclusionMatchesSelectedClass(exclusion))
          .map((exclusion) => String(exclusion?.id || "").trim())
          .filter(Boolean)
      );

      const excludedUidsForSelectedClass = new Set(
        excludedList
          .filter((exclusion) => exclusionMatchesSelectedClass(exclusion))
          .map((exclusion) => String(exclusion?.student_uid || exclusion?.studentUid || "").trim())
          .filter(Boolean)
      );

      const activeMetaByName = new Map<string, ActiveStudentMeta>();
      const selectedTurmaRef = normalizeText(selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "");
      const selectedTurmaCodigoRef = normalizeText(selectedClass.turmaCodigo || "");
      const selectedHorarioRef = normalizeHorarioDigits(selectedClass.horario || selectedHorario || "");
      const selectedProfessorRef = normalizeText(selectedClass.professor || selectedProfessor || "");

      activeStudentsMeta.forEach((student) => {
        const studentName = normalizeText(student.nome || "");
        if (!studentName) return;

        const studentTurma = normalizeText(student.turma || "");
        const studentTurmaCodigo = normalizeText(student.turmaCodigo || student.grupo || "");
        const studentHorario = normalizeHorarioDigits(student.horario || "");
        const studentProfessor = normalizeText(student.professor || "");

        const turmaMatches =
          (!selectedTurmaRef && !selectedTurmaCodigoRef) ||
          studentTurma === selectedTurmaRef ||
          studentTurmaCodigo === selectedTurmaRef ||
          studentTurma === selectedTurmaCodigoRef ||
          studentTurmaCodigo === selectedTurmaCodigoRef;
        const horarioMatches = !selectedHorarioRef || !studentHorario || studentHorario === selectedHorarioRef;
        const professorMatches = !selectedProfessorRef || !studentProfessor || studentProfessor === selectedProfessorRef;

        if (turmaMatches && horarioMatches && professorMatches) {
          activeMetaByName.set(studentName, student);
        }
      });

      const isExcludedByIdentity = (alunoNome: string) => {
        const nameKey = normalizeText(alunoNome || "");
        
        // Check by name first (most direct)
        if (excludedNamesForSelectedClass.has(nameKey)) return true;
        
        // Check by UID/ID from metadata if available
        const studentMeta = activeMetaByName.get(nameKey);
        if (studentMeta) {
          const studentId = String((studentMeta as any)?.id || "").trim();
          const studentUid = String((studentMeta as any)?.studentUid || (studentMeta as any)?.student_uid || "").trim();
          if (studentUid && excludedUidsForSelectedClass.has(studentUid)) return true;
          if (studentId && excludedIdsForSelectedClass.has(studentId)) return true;
        }
        
        // Also check against full exclusion list directly by normalized name
        // in case metadata is missing
        return excludedList.some((exclusion) => {
          const excNorm = normalizeText(exclusion?.nome || exclusion?.Nome || "");
          return excNorm === nameKey && exclusionMatchesSelectedClass(exclusion);
        });
      };

      const storedHasAnyMark = (storedRecords || []).some((item) =>
        Object.values(item?.attendance || {}).some((value) => Boolean(value))
      );
      const storedByName = new Map(
        (storedRecords || []).map((item) => [normalizeText(item.aluno), item])
      );

      const backendByName = new Map<string, {
        attendance: Record<string, "Presente" | "Falta" | "Justificado" | "">;
        justifications: Record<string, string>;
        notes: string[];
      }>();
      let backendSnapshotTrusted = false;

      try {
        const response = await getReports({ month: monthKey });
        const reports = Array.isArray(response?.data) ? (response.data as ReportClassLite[]) : [];
        const turmaCandidates = [selectedClass.turmaLabel, selectedClass.turmaCodigo, selectedTurma]
          .map((value) => normalizeText(value || ""))
          .filter(Boolean);
        const horarioRef = selectedClass.horario || selectedHorario || "";
        const horarioRefNorm = normalizeHorarioDigits(horarioRef);
        const professorRef = normalizeText(selectedClass.professor || selectedProfessor || "");

        const matchedClass = reports
          .map((item) => {
            const turmaMatches =
              turmaCandidates.includes(normalizeText(item.turma || "")) ||
              turmaCandidates.includes(normalizeText(item.turmaCodigo || ""));
            if (!turmaMatches) return { item, score: -1 };

            const itemHorarioRaw = String(item.horario || "").trim();
            const itemHorarioNorm = normalizeHorarioDigits(itemHorarioRaw);
            const professorItem = normalizeText(item.professor || "");

            let score = 1;
            if (horarioRef && itemHorarioRaw === horarioRef) score += 3;
            else if (horarioRefNorm && itemHorarioNorm && itemHorarioNorm === horarioRefNorm) score += 2;

            if (!professorRef) score += 1;
            else if (professorItem === professorRef) score += 1;

            return { item, score };
          })
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)[0]?.item;

        logPersistenceDebug("hydrate:report_match", {
          turmaCodigo: selectedClass.turmaCodigo || "",
          turmaLabel: selectedClass.turmaLabel || selectedTurma || "",
          horario: selectedClass.horario || selectedHorario || "",
          professor: selectedClass.professor || selectedProfessor || "",
          mes: monthKey,
        });

        const matchedCount = Array.isArray(matchedClass?.alunos) ? matchedClass!.alunos.length : 0;
        const sourceRef = `${monthKey} | ${selectedClass.turmaCodigo || selectedClass.turmaLabel || selectedTurma || ""} | ${selectedClass.horario || selectedHorario || ""} | ${selectedClass.professor || selectedProfessor || ""}`;
        const snapshotRef = matchedClass
          ? `${matchedClass.turma || ""} | ${matchedClass.horario || ""} | ${matchedClass.professor || ""}`
          : "(sem correspondencia)";

        setHydrationReadInfo({
          ref: sourceRef,
          snapshot: snapshotRef,
          hasLog: Boolean(matchedClass?.hasLog),
          studentCount: matchedCount,
          updatedAt: new Date().toLocaleTimeString("pt-BR"),
        });

        const readAlertKey = [
          monthKey,
          selectedClass.turmaCodigo || selectedClass.turmaLabel || selectedTurma || "",
          selectedClass.horario || selectedHorario || "",
          selectedClass.professor || selectedProfessor || "",
          matchedClass?.turma || "",
          matchedClass?.horario || "",
          matchedClass?.professor || "",
          matchedClass?.hasLog ? "1" : "0",
          String(matchedCount),
        ].join("|");

        const hydrationReadDebugEnabled = (() => {
          if (import.meta.env.DEV) return true;
          try {
            return localStorage.getItem(attendanceDebugKey) === "1";
          } catch {
            return false;
          }
        })();

        if (hydrationReadDebugEnabled && lastHydrationReadAlertRef.current !== readAlertKey) {
          lastHydrationReadAlertRef.current = readAlertKey;
          alert(
            `Leitura (/reports)\nRef seleção: ${sourceRef}\nSnapshot: ${snapshotRef}\nhasLog: ${matchedClass?.hasLog ? "sim" : "não"}\nQtd alunos snapshot: ${matchedCount}`
          );
        }

        const backendCandidateByName = new Map<
          string,
          {
            attendance: Record<string, "Presente" | "Falta" | "Justificado" | "">;
            justifications: Record<string, string>;
            notes: string[];
          }
        >();

        (matchedClass?.alunos || []).forEach((student) => {
          const studentKey = normalizeText(student.nome || "");
          if (!studentKey) return;
          if (isExcludedByIdentity(student.nome || "")) return;
          const attendanceMap = (student.historico || {}) as Record<string, string>;
          const justificationsMap = (student.justifications || {}) as Record<string, string>;
          const notesList = Array.isArray(student.notes)
            ? student.notes.map((note) => String(note || "").trim()).filter(Boolean)
            : [];
          const mappedAttendance = Object.entries(attendanceMap).reduce(
            (acc, [dayKey, status]) => {
              const dateKey = resolveReportHistoricoDateKey(String(dayKey || ""), newDates);
              if (dateKey) {
                acc[dateKey] = mapAttendanceValue(String(status || ""));
              }
              return acc;
            },
            {} as Record<string, "Presente" | "Falta" | "Justificado" | "">
          );
          const mappedJustifications = Object.entries(justificationsMap).reduce(
            (acc, [rawDate, rawReason]) => {
              const reason = String(rawReason || "").trim();
              if (!reason) return acc;

              const normalizedRawDate = String(rawDate || "").trim();
              const directDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedRawDate)
                ? normalizedRawDate
                : resolveReportHistoricoDateKey(normalizedRawDate, newDates);

              if (directDate && newDates.includes(directDate)) {
                acc[directDate] = reason;
              }
              return acc;
            },
            {} as Record<string, string>
          );

          backendCandidateByName.set(studentKey, {
            attendance: mappedAttendance,
            justifications: mappedJustifications,
            notes: notesList,
          });
        });

        const backendHasAnyMark = Array.from(backendCandidateByName.values()).some((entry) =>
          Object.values(entry.attendance || {}).some((value) => Boolean(value))
        );
        const canTrustBackendSnapshot = backendHasAnyMark || !storedHasAnyMark;
        backendSnapshotTrusted = canTrustBackendSnapshot;

        if (canTrustBackendSnapshot) {
          backendCandidateByName.forEach((value, key) => backendByName.set(key, value));
        }

        const selectedNivelNormalized = normalizeText(selectedClass.nivel || "");
        const transferLocks: Record<string, TransferLockInfo> = {};

        const transferHistory = loadTransferHistory();
        const classTurmaNorm = normalizeText(selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "");
        const classHorarioNorm = normalizeHorarioDigits(selectedClass.horario || selectedHorario || "");
        const classProfessorNorm = normalizeText(selectedClass.professor || selectedProfessor || "");

        transferHistory.forEach((entry) => {
          const studentKey = normalizeText(entry?.nome || "");
          if (!studentKey) return;

          const toNivelNorm = normalizeText(entry?.toNivel || "");
          if (selectedNivelNormalized && toNivelNorm && toNivelNorm !== selectedNivelNormalized) return;

          const toTurmaNorm = normalizeText(entry?.toTurma || "");
          const toHorarioNorm = normalizeHorarioDigits(entry?.toHorario || "");
          const toProfessorNorm = normalizeText(entry?.toProfessor || "");

          const turmaMatches = !toTurmaNorm || !classTurmaNorm || toTurmaNorm === classTurmaNorm;
          const horarioMatches = !toHorarioNorm || !classHorarioNorm || toHorarioNorm === classHorarioNorm;
          const professorMatches = !toProfessorNorm || !classProfessorNorm || toProfessorNorm === classProfessorNorm;
          if (!turmaMatches || !horarioMatches || !professorMatches) return;

          const effectiveDate = String(entry?.effectiveDate || "").trim();
          if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return;

          const fromNivel = String(entry?.fromNivel || "").trim() || "Nível anterior";
          const existing = transferLocks[studentKey];
          if (!existing || effectiveDate > existing.lockBeforeDate) {
            transferLocks[studentKey] = {
              lockBeforeDate: effectiveDate,
              fromNivel,
            };
          }
        });

        if (isMounted && requestId === hydrationRequestIdRef.current) {
          setTransferLocksByName(transferLocks);
        }
      } catch {
        // mantém hidratação local quando backend de relatórios indisponível
        if (isMounted && requestId === hydrationRequestIdRef.current) {
          setTransferLocksByName({});
          setHydrationReadInfo((prev) =>
            prev || {
              ref: `${monthKey} | ${selectedClass.turmaCodigo || selectedClass.turmaLabel || selectedTurma || ""} | ${selectedClass.horario || selectedHorario || ""} | ${selectedClass.professor || selectedProfessor || ""}`,
              snapshot: "(falha ao ler /reports)",
              hasLog: false,
              studentCount: 0,
              updatedAt: new Date().toLocaleTimeString("pt-BR"),
            }
          );
        }
      }

      if (!isMounted || requestId !== hydrationRequestIdRef.current) return;

      if (hasUnsavedLocalChangesRef.current) {
        logPersistenceDebug("hydrate:skipped_local_dirty", {
          turmaCodigo: selectedClass.turmaCodigo || "",
          turmaLabel: selectedClass.turmaLabel || selectedTurma || "",
          horario: selectedClass.horario || selectedHorario || "",
          professor: selectedClass.professor || selectedProfessor || "",
          mes: monthKey,
        });
        return;
      }

      // Resetar histórico ao mudar de turma/horário/professor para evitar inconsistências
      setHistory([]);

      setAttendance(
        classStudents
          .filter((aluno) => !isExcludedByIdentity(aluno || ""))
          .map((aluno, idx) => {
          const studentKey = normalizeText(aluno);
          const base = newDates.reduce(
            (acc, date) => {
              acc[date] = "";
              return acc;
            },
            {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
          );

          const backend = backendByName.get(studentKey);
          const stored = storedByName.get(studentKey);
          const allowStoredMerge = !backendSnapshotTrusted || !backend;

          return {
            id: idx + 1,
            aluno,
            attendance: (() => {
              const merged = {
                ...base,
                ...(backend?.attendance || {}),
              };

              const storedAttendance = stored?.attendance || {};
              if (allowStoredMerge) {
                Object.entries(storedAttendance).forEach(([date, value]) => {
                  if (!newDates.includes(date)) return;
                  if (value && !merged[date]) {
                    merged[date] = value;
                  }
                });
              }

              return merged;
            })(),
            justifications: (() => {
              const merged = {
                ...(backend?.justifications || {}),
              };

              const storedJustifications = stored?.justifications || {};
              if (allowStoredMerge) {
                Object.entries(storedJustifications).forEach(([date, value]) => {
                  if (!newDates.includes(date)) return;
                  const normalized = String(value || "").trim();
                  if (!normalized) return;
                  if (!String(merged[date] || "").trim()) {
                    merged[date] = normalized;
                  }
                });
              }

              return merged;
            })(),
            notes: (() => {
              const backendNotes = Array.isArray(backend?.notes)
                ? backend!.notes.map((note) => String(note || "").trim()).filter(Boolean)
                : [];
              const storedNotes = Array.isArray(stored?.notes)
                ? stored!.notes.map((note) => String(note || "").trim()).filter(Boolean)
                : [];

              if (backendSnapshotTrusted) return backendNotes;
              if (backendNotes.length > 0) return backendNotes;
              return storedNotes;
            })(),
          };
          })
      );
      setHydratedStorageKey(storageKey);
    };

    hydrateAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedTurma, selectedClass.horario, selectedClass.professor, selectedDaysKey, studentsPerClass, storageKey, monthKey, selectedClass.turmaLabel, selectedClass.turmaCodigo, selectedHorario, selectedProfessor, hydrationRefreshSeq, resolvedDiasSemana, activeStudentsMeta]);

  useEffect(() => {
    if (!storageKey || hydratedStorageKey !== storageKey) return;
    saveAttendanceStorage(attendance);
  }, [attendance, storageKey, hydratedStorageKey]);

  useEffect(() => {
    flushPendingAttendanceLogs().catch(() => undefined);

    const onOnline = () => {
      flushPendingAttendanceLogs().catch(() => undefined);
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Ciclar entre os 4 estados
  const cycleStatus = (currentStatus: "Presente" | "Falta" | "Justificado" | "") => {
    const cycle = ["Presente", "Falta", "Justificado", ""];
    const nextIndex = (cycle.indexOf(currentStatus) + 1) % cycle.length;
    return cycle[nextIndex] as "Presente" | "Falta" | "Justificado" | "";
  };

  const handleStatusChange = (id: number, date: string) => {
    const dayClosed = isDateClosedForAttendance(date, calendarSettings, calendarEvents);
    const classBlockedByMeeting = isClassBlockedByEventPeriod(date, selectedClass.horario || selectedHorario, calendarEvents);
    const student = attendance.find((item) => item.id === id);
    const transferLocked = student ? !!getTransferLockForDate(student.aluno, date) : false;
    if (dayClosed || classBlockedByMeeting || transferLocked) return;

    // Salva o estado atual no histórico antes de modificar
    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setHasUnsavedLocalChanges(true);

    setAttendance((prev) => {
      const newAttendance = prev.map((item) => {
        if (item.id === id) {
          const currentStatus = item.attendance[date];
          const newStatus = cycleStatus(currentStatus);
          
          return {
            ...item,
            attendance: {
              ...item.attendance,
              [date]: newStatus,
            },
          };
        }
        return item;
      });
      return newAttendance;
    });
  };
  const handleUndo = () => {
    if (history.length > 0) {
      setAttendance(JSON.parse(JSON.stringify(history[0])));
      setHistory((h) => h.slice(1));
      setHasUnsavedLocalChanges(true);
    }
  };

  const handleNextHorario = () => {
    if (horarioOptions.length <= 1) return;
    const currentIndex = horarioOptions.findIndex((item) => item === selectedHorario);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % horarioOptions.length : 0;
    const nextHorario = horarioOptions[nextIndex];
    if (nextHorario) {
      setSelectedHorario(nextHorario);
    }
  };

  const handlePreviousHorario = () => {
    if (horarioOptions.length <= 1) return;
    const currentIndex = horarioOptions.findIndex((item) => item === selectedHorario);
    const previousIndex = currentIndex >= 0
      ? (currentIndex - 1 + horarioOptions.length) % horarioOptions.length
      : 0;
    const previousHorario = horarioOptions[previousIndex];
    if (previousHorario) {
      setSelectedHorario(previousHorario);
    }
  };

  const handleClearAll = () => {
    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setHasUnsavedLocalChanges(true);

    setAttendance((prev) =>
      prev.map((item) => ({
        ...item,
        attendance: Object.keys(item.attendance).reduce(
          (acc, date) => {
            acc[date] = "";
            return acc;
          },
          {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
        ),
      }))
    );
  };

  const handleClearDay = () => {
    if (!selectedDate) return;

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setHasUnsavedLocalChanges(true);
    setAttendance((prev) =>
      prev.map((item) => ({
        ...item,
        attendance: {
          ...item.attendance,
          [selectedDate]: "",
        },
      }))
    );
  };

  const handleClearOption = (mode: "all" | "day") => {
    if (mode === "all") {
      handleClearAll();
    } else {
      handleClearDay();
    }
    setShowClearOptions(false);
  };

  // Função de Exclusão: Ativada quando o aluno tem 3 ou mais faltas
  const excluirAluno = async (id: number) => {
    if (window.confirm("O aluno excedeu o limite de faltas. Deseja excluí-lo da lista?")) {
      const student = attendance.find((item) => item.id === id);
      if (student) {
        const activeStudents = JSON.parse(localStorage.getItem("activeStudents") || "[]");
        const turmaKey = selectedClass.turmaLabel || selectedClass.turmaCodigo || selectedTurma || "";
        const horarioKey = selectedClass.horario || selectedHorario || "";
        const professorKey = selectedClass.professor || selectedProfessor || "";
        const full = activeStudents.find((s: any) =>
          s.nome === student.aluno &&
          (s.turma === turmaKey || s.turmaCodigo === turmaKey) &&
          s.horario === horarioKey &&
          s.professor === professorKey
        );
        const payload = {
          ...(full || {
            id: `excl-${Date.now()}`,
            studentUid: String((full as any)?.studentUid || (full as any)?.student_uid || ""),
            grupo: selectedClass.turmaCodigo || "",
            nome: student.aluno,
            turma: turmaKey,
            turmaLabel: selectedClass.turmaLabel || selectedTurma || turmaKey,
            turmaCodigo: selectedClass.turmaCodigo || "",
            horario: horarioKey,
            professor: professorKey,
            nivel: selectedClass.nivel || "",
            idade: 0,
            categoria: "",
            whatsapp: "",
            genero: "",
            dataNascimento: "",
            parQ: "",
            atestado: false,
          }),
          turma: turmaKey,
          turmaLabel: selectedClass.turmaLabel || selectedTurma || turmaKey,
          turmaCodigo: selectedClass.turmaCodigo || "",
          horario: horarioKey,
          professor: professorKey,
          grupo: selectedClass.turmaCodigo || "",
          student_uid: String((full as any)?.studentUid || (full as any)?.student_uid || ""),
          dataExclusao: new Date().toLocaleDateString("pt-BR"),
          motivo_exclusao: "Falta",
        };

        await addExclusion(payload).catch(() => {
          alert("Falha ao enviar exclusão ao backend. Tente novamente.");
        });

        try {
          const exclusionResp = await getExcludedStudents();
          const resolved = Array.isArray(exclusionResp?.data) ? exclusionResp.data : [];
          localStorage.setItem("excludedStudents", JSON.stringify(resolved));
        } catch {
          // mantém cache local sem bloquear fluxo
        }
      }
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      setHasUnsavedLocalChanges(true);
      setAttendance((prev) => prev.filter((student) => student.id !== id));
    }
  };

  // Função de Justificativa: Abre o modal de notação
  const adicionarJustificativa = (id: number) => {
    const student = attendance.find((item) => item.id === id);
    const seed = getJustificationModalSeed(student);
    setJustificationStudentId(id);
    setJustificationDay(seed.day || "");
    setJustificationReason(seed.reason || "");
    setShowJustificationModal(true);
  };

  const salvarJustificativa = async () => {
    const normalizedReason = String(justificationReason || "").trim();
    if (!justificationStudentId || !justificationDay || !normalizedReason) {
      alert("Por favor, preencha o dia e o motivo.");
      return;
    }

    // Tenta encontrar a data correspondente ao dia digitado (dd)
    // dateDates está no formato YYYY-MM-DD
    const targetDate = dateDates.find((d) => {
      const dayPart = parseInt(d.split("-")[2], 10);
      return dayPart === parseInt(justificationDay, 10);
    });

    if (!targetDate) {
      alert("Dia não encontrado nas datas exibidas deste mês.");
      return;
    }

    const targetStudent = attendance.find((item) => item.id === justificationStudentId);
    if (targetStudent && getTransferLockForDate(targetStudent.aluno, targetDate)) {
      alert("Data bloqueada por transferência de nível.");
      return;
    }

    const requestedDays = extractJustificationDays(justificationReason);
    const candidateDates = [...dateDates]
      .filter((date) => date >= targetDate)
      .sort((a, b) => a.localeCompare(b));

    const datesToApply = (requestedDays > 1 ? candidateDates.slice(0, requestedDays) : [targetDate]).filter((date) => {
      if (!targetStudent) return true;
      return !getTransferLockForDate(targetStudent.aluno, date);
    });

    if (datesToApply.length === 0) {
      alert("Nenhuma data elegível para aplicar a justificativa.");
      return;
    }

    const firstDateToRegisterReason = datesToApply[0];
    if (!firstDateToRegisterReason) {
      alert("Nenhuma data elegível para registrar a justificativa.");
      return;
    }

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setHasUnsavedLocalChanges(true);
    const nextAttendanceSnapshot = attendance.map((item) => {
      if (item.id !== justificationStudentId) return item;

      const nextAttendance = { ...item.attendance };
      const nextJustifications = { ...(item.justifications || {}) };

      datesToApply.forEach((date) => {
        nextAttendance[date] = "Justificado";
        delete nextJustifications[date];
      });

      nextJustifications[firstDateToRegisterReason] = normalizedReason;

      return {
        ...item,
        attendance: nextAttendance,
        justifications: nextJustifications,
      };
    });
    setAttendance(nextAttendanceSnapshot);

    setShowJustificationModal(false);

    const student = nextAttendanceSnapshot.find((item) => item.id === justificationStudentId);
    const persistence = resolvePersistenceContext();
    if (student) {
      if (!persistence.isValid) {
        alert("Selecione turma, horário e professor válidos antes de salvar.");
        return;
      }

      const attendanceResp: any = await saveAttendanceLog({
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
        registros: nextAttendanceSnapshot.map((item) => ({
          aluno_nome: item.aluno,
          attendance: item.attendance,
          justifications: item.justifications || {},
          notes: item.notes || [],
        })),
      }).catch(() => null);

      if (attendanceResp?.data?.ok && !attendanceResp?.data?.queued) {
        setHasUnsavedLocalChanges(false);
        setHydrationRefreshSeq((prev) => prev + 1);
      }

      refreshSyncIndicator().catch(() => undefined);
    }
  };

  const removerJustificativa = async (entryDayLabel: string, entryReason: string) => {
    if (!justificationStudentId) return;

    const dayLabel = String(entryDayLabel || "").trim();
    const reason = String(entryReason || "").trim();
    if (!dayLabel) return;

    const startDay = Number.parseInt(dayLabel.split("-")[0] || "", 10);
    if (!Number.isFinite(startDay)) {
      alert("Não foi possível identificar o dia inicial da justificativa.");
      return;
    }

    const startDate = dateDates.find((date) => Number.parseInt(date.split("-")[2] || "", 10) === startDay);
    if (!startDate) {
      alert("Dia não encontrado nas datas exibidas deste mês.");
      return;
    }

    const afastamentoDays = extractJustificationDays(reason);
    const candidateDates = [...dateDates].filter((date) => date >= startDate).sort((a, b) => a.localeCompare(b));

    let datesToRemove: string[] = [];
    if (afastamentoDays > 1) {
      datesToRemove = candidateDates.slice(0, afastamentoDays);
    } else if (dayLabel.includes("-")) {
      const [fromRaw, toRaw] = dayLabel.split("-").map((part) => Number.parseInt(part || "", 10));
      const fromDay = Number.isFinite(fromRaw) ? fromRaw : startDay;
      const toDay = Number.isFinite(toRaw) ? toRaw : startDay;
      const minDay = Math.min(fromDay, toDay);
      const maxDay = Math.max(fromDay, toDay);
      datesToRemove = dateDates.filter((date) => {
        const currentDay = Number.parseInt(date.split("-")[2] || "", 10);
        return Number.isFinite(currentDay) && currentDay >= minDay && currentDay <= maxDay;
      });
    } else {
      datesToRemove = [startDate];
    }

    if (datesToRemove.length === 0) {
      alert("Nenhuma data elegível para remover justificativa.");
      return;
    }

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setHasUnsavedLocalChanges(true);

    const nextAttendanceSnapshot = attendance.map((item) => {
      if (item.id !== justificationStudentId) return item;

      const nextAttendance = { ...(item.attendance || {}) };
      const nextJustifications = { ...(item.justifications || {}) };

      datesToRemove.forEach((date) => {
        delete nextJustifications[date];
        if (nextAttendance[date] === "Justificado") {
          nextAttendance[date] = "";
        }
      });

      return {
        ...item,
        attendance: nextAttendance,
        justifications: nextJustifications,
      };
    });

    setAttendance(nextAttendanceSnapshot);

    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      alert("Selecione turma, horário e professor válidos antes de salvar.");
      return;
    }

    const attendanceResp: any = await saveAttendanceLog({
      turmaCodigo: persistence.turmaCodigo,
      turmaLabel: persistence.turmaLabel,
      horario: persistence.horario,
      professor: persistence.professor,
      mes: monthKey,
      registros: nextAttendanceSnapshot.map((item) => ({
        aluno_nome: item.aluno,
        attendance: item.attendance,
        justifications: item.justifications || {},
        notes: item.notes || [],
      })),
    }).catch(() => null);

    if (attendanceResp?.data?.ok && !attendanceResp?.data?.queued) {
      setHasUnsavedLocalChanges(false);
      setHydrationRefreshSeq((prev) => prev + 1);
      refreshSyncIndicator().catch(() => undefined);
    }
  };

  const handleSave = async () => {
    if (monthKey !== visibleMonthKey) {
      alert(
        `Bloqueado: Mês do log (${monthKey}) diferente do mês visível (${visibleMonthKey}).\nAjuste o período antes de salvar.`
      );
      return;
    }

    if (selectedDateMonthKey && selectedDateMonthKey !== monthKey) {
      alert(
        `Bloqueado: data selecionada (${selectedDate}) não pertence ao mês do log (${monthKey}).\nSelecione uma data do mês atual da chamada.`
      );
      return;
    }

    if (monthKey !== currentMonthKey) {
      const proceed = window.confirm(
        `Você está salvando no mês ${currentMonthFormatted} (retroativo). Deseja continuar?`
      );
      if (!proceed) return;
    }

    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      alert("Selecione turma, horário e professor válidos antes de salvar a chamada.");
      return;
    }

    const payload = {
      turmaCodigo: persistence.turmaCodigo,
      turmaLabel: persistence.turmaLabel,
      horario: persistence.horario,
      professor: persistence.professor,
      mes: monthKey,
      registros: attendance.map((item) => ({
        aluno_nome: item.aluno,
        attendance: item.attendance,
        justifications: item.justifications || {},
        notes: item.notes || [],
      })),
    };

    logPersistenceDebug("saveAttendanceLog:manual", {
      turmaCodigo: payload.turmaCodigo,
      turmaLabel: payload.turmaLabel,
      horario: payload.horario,
      professor: payload.professor,
      mes: payload.mes,
    });

    try {
      const resp: any = await saveAttendanceLog(payload);
      const reference = `\nRef: ${payload.mes} | ${payload.turmaCodigo || payload.turmaLabel} | ${payload.horario} | ${payload.professor}`;
      if (resp?.data?.queued) {
        alert(`Sem conexão no momento. Chamada salva localmente e pendente de sincronização.${reference}`);
        return;
      }

      const probe = await forceAttendanceSync({
        turmaCodigo: payload.turmaCodigo,
        turmaLabel: payload.turmaLabel,
        horario: payload.horario,
        professor: payload.professor,
        mes: payload.mes,
      }).catch(() => ({ data: { hasLog: false } }));

      const hasRemoteLog = Boolean(probe?.data?.hasLog);
      const file = resp?.data?.file ? `\nArquivo: ${resp.data.file}` : "";
      setHasUnsavedLocalChanges(false);
      if (hasRemoteLog) {
        alert(`Chamada salva com sucesso e confirmada no servidor.${reference}${file}`);
      } else {
        alert(`Chamada salva, mas ainda não confirmada no servidor.${reference}\nToque em Sincronizar agora para forçar envio.`);
      }
      // Só hidrata se não há mais mudanças locais
      if (!hasUnsavedLocalChangesRef.current) {
        setHydrationRefreshSeq((prev) => prev + 1);
      }
    } catch {
      alert("Erro ao salvar chamada. Tente novamente.");
    }
  };

  const handleForceSyncNow = async () => {
    if (isManualSyncing) return;

    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      alert("Selecione turma, horário e professor válidos antes de sincronizar.");
      return;
    }

    setIsManualSyncing(true);
    try {
      await flushPendingAttendanceLogs().catch(() => ({ flushed: 0, pending: 0 }));
      const syncResp: any = await forceAttendanceSync({
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
      });
      if (syncResp?.data?.hasLog) {
        setHasUnsavedLocalChanges(false);
      }
      // Só hidrata se não há mudanças locais não salvas
      if (!hasUnsavedLocalChangesRef.current) {
        setHydrationRefreshSeq((prev) => prev + 1);
      }
    } finally {
      setIsManualSyncing(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* SUB MENU - SELEÇÃO DE TURMA, HORÁRIO E PROFESSOR */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "25px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
        }}
      >
        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Turma
          </label>
          <select
            value={selectedTurma}
            onChange={(e) => handleTurmaChange(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              marginTop: "6px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {turmaOptions.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.label}
              </option>
            ))}
          </select>
          {selectedClass.turmaCodigo && (
            <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.8 }}>
              Cod. {selectedClass.turmaCodigo}
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Professor
          </label>
          <select
            value={selectedProfessor}
            onChange={(e) => handleProfessorChange(e.target.value)}
            disabled={!selectedTurma || professorOptions.length === 0}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              marginTop: "6px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {professorOptions.length === 0 ? (
              <option value="">Sem professores</option>
            ) : (
              professorOptions.map((professor) => (
                <option key={professor} value={professor}>
                  {professor}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Horário
          </label>
          <select
            value={selectedHorario}
            onChange={(e) => setSelectedHorario(e.target.value)}
            disabled={!selectedTurma || !selectedProfessor || horarioOptions.length === 0}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              marginTop: "6px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {horarioOptions.length === 0 ? (
              <option value="">Sem horários</option>
            ) : (
              horarioOptions.map((horario) => (
                <option key={horario} value={horario}>
                  {formatHorario(horario)}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Nível
          </label>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "8px 12px",
              borderRadius: "6px",
              marginTop: "6px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {selectedClass.nivel}
          </div>
        </div>
      </div>

      {/* MÊS E DATA */}
      <div
        style={{
          background: "#f8f9fa",
          padding: "15px 20px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <span style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}>
            Período
          </span>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#2c3e50", marginTop: "4px" }}>
            {currentMonthFormatted}
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#495057" }}>
            <input
              type="checkbox"
              checked={retroModeEnabled}
              onChange={(e) => setRetroModeEnabled(e.target.checked)}
            />
            Permitir lançamento retroativo
          </label>
          <input
            type="month"
            value={referenceMonth}
            max={currentMonthKey}
            disabled={!retroModeEnabled}
            onChange={(e) => setReferenceMonth(e.target.value || currentMonthKey)}
            style={{
              width: isCompactViewport ? "182px" : "auto",
              minWidth: isCompactViewport ? "182px" : "auto",
              maxWidth: "100%",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #ced4da",
              background: retroModeEnabled ? "#fff" : "#e9ecef",
              color: "#495057",
              fontWeight: 600,
            }}
          />
          <div
            title="Mês efetivo usado para salvar e buscar os registros"
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #ced4da",
              background: "#ffffff",
              color: "#2c3e50",
              fontSize: "12px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Mês do log: {currentMonthFormatted}
          </div>
        </div>
        {retroModeEnabled && referenceMonth !== currentMonthKey && (
          <div
            style={{
              width: "100%",
              marginTop: "4px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #f4c57d",
              background: "#fff6e6",
              color: "#9a6700",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            Atenção: lançamento retroativo ativo ({currentMonthFormatted}).
          </div>
        )}
        {syncMonthMismatchMessage && (
          <div
            style={{
              width: "100%",
              marginTop: "4px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            ⚠ {syncMonthMismatchMessage}
          </div>
        )}
        {hydrationReadInfo && (
          <div
            style={{
              width: "100%",
              marginTop: "4px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #d0d7de",
              background: "#ffffff",
              color: "#334155",
              fontSize: "11px",
              lineHeight: 1.45,
            }}
          >
            <strong>Leitura Sync:</strong> {hydrationReadInfo.updatedAt} | hasLog: {hydrationReadInfo.hasLog ? "sim" : "não"} | alunos: {hydrationReadInfo.studentCount}
            <br />
            <strong>Ref seleção:</strong> {hydrationReadInfo.ref}
            <br />
            <strong>Snapshot:</strong> {hydrationReadInfo.snapshot}
          </div>
        )}
        {syncIndicator && (
          <div
            style={{
              width: "100%",
              marginTop: "4px",
              padding: "8px 10px",
              borderRadius: "8px",
              border:
                syncIndicator.status === "confirmed"
                  ? "1px solid #86efac"
                  : syncIndicator.status === "pending"
                    ? "1px solid #fcd34d"
                    : syncIndicator.status === "error"
                      ? "1px solid #fca5a5"
                      : "1px solid #cbd5e1",
              background:
                syncIndicator.status === "confirmed"
                  ? "#f0fdf4"
                  : syncIndicator.status === "pending"
                    ? "#fffbeb"
                    : syncIndicator.status === "error"
                      ? "#fef2f2"
                      : "#f8fafc",
              color:
                syncIndicator.status === "confirmed"
                  ? "#166534"
                  : syncIndicator.status === "pending"
                    ? "#92400e"
                    : syncIndicator.status === "error"
                      ? "#991b1b"
                      : "#334155",
              fontSize: "12px",
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <div>
                <strong>
                  Sync: {syncIndicator.status === "confirmed" ? "confirmado" : syncIndicator.status === "checking" ? "verificando" : syncIndicator.status === "error" ? "erro" : "pendente"}
                </strong>
                {" "}· {syncIndicator.detail} · {syncIndicator.updatedAt}
              </div>
              <button
                type="button"
                onClick={handleForceSyncNow}
                disabled={isManualSyncing || syncIndicator.status === "checking"}
                style={{
                  border: "none",
                  borderRadius: "8px",
                  background: isManualSyncing || syncIndicator.status === "checking" ? "#94a3b8" : "#334155",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "8px 12px",
                  cursor: isManualSyncing || syncIndicator.status === "checking" ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {isManualSyncing ? "⏳ Sincronizando..." : "🔄 Sincronizar agora"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TABELA DE CHAMADA - DATAS NO CABEÇALHO */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "#667eea", color: "white" }}>
                <th
                  style={{ padding: "12px", textAlign: "left", fontWeight: "bold", minWidth: "150px", cursor: "pointer" }}
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  Aluno {sortDir === "asc" ? "▲" : "▼"}
                </th>
                {dateDates.map((date) => {
                  const dayNum = date.split("-")[2];
                  const isSelected = date === selectedDate;
                  const dayClosed = isDateClosedForAttendance(date, calendarSettings, calendarEvents);
                  const classBlockedByMeeting = isClassBlockedByEventPeriod(date, selectedClass.horario || selectedHorario, calendarEvents);
                  const climateCancellationReason = getClimateCancellationReasonForDate(date);
                  const holidayBridgeEvent = getHolidayBridgeEventForDate(date);
                  const meetingEvent = getBlockingMeetingEventForDate(date);
                  const isLockedDate = dayClosed || classBlockedByMeeting || !!climateCancellationReason;
                  const headerTooltip = holidayBridgeEvent
                    ? buildHolidayBridgeReason(holidayBridgeEvent)
                    : climateCancellationReason
                      ? climateCancellationReason
                    : meetingEvent
                      ? buildMeetingReason(meetingEvent)
                    : isLockedDate
                      ? "Data bloqueada para registro de chamada"
                      : "";
                  return (
                    <th
                      key={date}
                      onClick={() => handleDateClick(date)}
                      style={{
                        cursor: "pointer",
                        padding: "10px 0",
                        textAlign: "center",
                        fontWeight: "bold",
                        fontSize: "14px",
                        minWidth: "70px",
                        width: "70px",
                        background: isLockedDate
                          ? "rgba(220, 53, 69, 0.25)"
                          : isSelected
                            ? "rgba(255, 255, 255, 0.2)"
                            : "transparent",
                      }}
                      title={headerTooltip}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1, width: "100%" }}>
                        <span style={{ fontSize: "10px", fontWeight: "normal", marginBottom: "2px" }}>📅</span>
                        <span>{dayNum}</span>
                      </div>
                    </th>
                  );
                })}
                <th style={{ padding: "12px", textAlign: "center", fontWeight: "bold", minWidth: "100px" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAttendance.map((item, idx) => {
                const absences = Object.values(item.attendance).filter((s) => s === "Falta").length;
                const hasNotes = Array.isArray(item.notes) && item.notes.some((note) => String(note || "").trim().length > 0);
                const showNote =
                  Object.values(item.attendance).some((s) => s === "Falta" || s === "Justificado") ||
                  hasAnyMonthJustification(item.justifications);
                const showDelete = absences >= 3;
                const renewalAlert = getRenewalAlertInfo(item.aluno);
                const afastamentoInfo = getAfastamentoInfo(item.justifications);
                const renewalDismissKey = buildRenewalDismissKey(item.aluno);
                const dismissedSeverity = dismissedRenewalAlerts[renewalDismissKey];
                const showRenewalAlert = !!renewalAlert && dismissedSeverity !== renewalAlert.severity;
                const showRenewalIcon = !!renewalAlert && !showRenewalAlert;
                return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #e0e0e0",
                    background: idx % 2 === 0 ? "#ffffff" : "#f9f9f9",
                  }}
                >
                  <td 
                    style={{ padding: "12px", fontWeight: 500, cursor: "pointer" }}
                    onClick={() => handleStudentClick(item.id)}
                    onDoubleClick={(event) => handleNavigateToStudent(item.aluno, event)}
                    title="Clique para ver/adicionar anotações"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {showRenewalIcon && renewalAlert && (
                        <span
                          title="renovar atestado"
                          style={{ color: renewalAlert.color, fontWeight: 800, fontSize: "15px", lineHeight: 1 }}
                        >
                          ✱
                        </span>
                      )}
                      {afastamentoInfo && (
                        <span
                          title={afastamentoInfo.tooltip}
                          style={{ color: "#d97706", fontWeight: 700, fontSize: "6px", lineHeight: 1 }}
                        >
                          ⏳
                        </span>
                      )}
                      <span
                        style={{
                          borderBottom: "1px dashed #ccc",
                          background: hasNotes ? "#d2bae8" : "transparent",
                          borderRadius: hasNotes ? "6px" : undefined,
                          padding: hasNotes ? "2px 6px" : undefined,
                        }}
                      >
                        {getDisplayStudentName(item.aluno)}
                      </span>
                    </div>
                    {showRenewalAlert && renewalAlert && (
                      <div
                        style={{
                          marginTop: "8px",
                          background: renewalAlert.background,
                          borderLeft: `3px solid ${renewalAlert.color}`,
                          borderRadius: "6px",
                          padding: "7px 8px",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          fontSize: "12px",
                          color: "#374151",
                        }}
                      >
                        <span style={{ color: renewalAlert.color, fontWeight: 700 }}>⚠</span>
                        <span style={{ flex: 1 }}>{renewalAlert.message}</span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            dismissRenewalAlert(item.aluno, renewalAlert.severity);
                          }}
                          title="Fechar alerta"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#6b7280",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: 0,
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                  {dateDates.map((date) => {
                    const status = item.attendance[date];
                    const dayClosed = isDateClosedForAttendance(date, calendarSettings, calendarEvents);
                    const classBlockedByMeeting = isClassBlockedByEventPeriod(date, selectedClass.horario || selectedHorario, calendarEvents);
                    const transferLock = getTransferLockForDate(item.aluno, date);
                    const climateCancellationReason = getClimateCancellationReasonForDate(date);
                    const holidayBridgeEvent = getHolidayBridgeEventForDate(date);
                    const meetingEvent = getBlockingMeetingEventForDate(date);
                    const isTransferLocked = !!transferLock;
                    const isLockedDate = dayClosed || classBlockedByMeeting || isTransferLocked || !!climateCancellationReason;
                    const cellTooltip = isTransferLocked
                      ? `Transf. > ${transferLock?.fromNivel || "Nível anterior"}`
                      : climateCancellationReason
                      ? climateCancellationReason
                      : holidayBridgeEvent
                      ? buildHolidayBridgeReason(holidayBridgeEvent)
                      : meetingEvent
                        ? buildMeetingReason(meetingEvent)
                      : isLockedDate
                        ? "Registro bloqueado por recesso/férias/agenda"
                        : "";
                    let buttonLabel = "-";
                    let buttonColor = "#e8e8e8";
                    let buttonTextColor = "#666";

                    if (isTransferLocked && !status) {
                      buttonLabel = "—";
                      buttonColor = "#f1f3f5";
                      buttonTextColor = "#6c757d";
                    }

                    if (status === "Presente") {
                      buttonLabel = "✓";
                      buttonColor = "#28a745";
                      buttonTextColor = "white";
                    } else if (status === "Falta") {
                      buttonLabel = "✕";
                      buttonColor = "#dc3545";
                      buttonTextColor = "white";
                    } else if (status === "Justificado") {
                      buttonLabel = "j";
                      buttonColor = "#ffc107";
                      buttonTextColor = "white";
                    }

                    return (
                      <td key={date} style={{ padding: "8px", textAlign: "center" }}>
                        <button
                          onClick={() => handleStatusChange(item.id, date)}
                          disabled={isLockedDate}
                          style={{
                            background: buttonColor,
                            color: buttonTextColor,
                            border: "1px solid #ddd",
                            padding: "8px 14px",
                            borderRadius: "6px",
                            cursor: isLockedDate ? "not-allowed" : "pointer",
                            fontWeight: 700,
                            fontSize: "14px",
                            transition: "all 0.15s ease",
                            minWidth: "50px",
                            height: "38px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: "1",
                            opacity: isLockedDate ? 0.45 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (isLockedDate) return;
                            (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            if (isLockedDate) return;
                            (e.target as HTMLButtonElement).style.transform = "scale(1)";
                          }}
                          title={cellTooltip}
                        >
                          {buttonLabel}
                        </button>
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px", textAlign: "center", display: "flex", gap: "5px", justifyContent: "center" }}>
                    <button
                      onClick={() => adicionarJustificativa(item.id)}
                      title="Adicionar Justificativa"
                      disabled={!showNote}
                      style={{
                        background: "#17a2b8",
                        color: "white",
                        border: "none",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        cursor: showNote ? "pointer" : "default",
                        fontSize: "12px",
                        visibility: showNote ? "visible" : "hidden",
                        opacity: showNote ? 1 : 0,
                      }}
                    >
                      📝
                    </button>
                    <button
                      onClick={() => excluirAluno(item.id)}
                      title="Excluir Aluno (Excesso de Faltas)"
                      disabled={!showDelete}
                      style={{
                        background: "#dc3545",
                        color: "white",
                        border: "none",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        cursor: showDelete ? "pointer" : "default",
                        fontSize: "12px",
                        visibility: showDelete ? "visible" : "hidden",
                        opacity: showDelete ? 1 : 0,
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                );
              })}
              <tr>
                <td
                  style={{
                    padding: "8px 12px 10px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#64748b",
                    borderTop: "1px dashed #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  lotação/capacidade (da turma): {currentClassLotacao}/{currentClassCapacity}
                </td>
                {dateDates.map((date) => (
                  <td
                    key={`summary-${date}`}
                    style={{
                      borderTop: "1px dashed #e2e8f0",
                      background: "#f8fafc",
                    }}
                  />
                ))}
                <td
                  style={{
                    borderTop: "1px dashed #e2e8f0",
                    background: "#f8fafc",
                  }}
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTÕES AÇÃO */}
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <button
          onClick={handlePreviousHorario}
          disabled={horarioOptions.length <= 1}
          style={{
            background: horarioOptions.length <= 1 ? "#ccc" : "#0284c7",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "8px",
            cursor: horarioOptions.length <= 1 ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "13px",
            transition: "all 0.2s ease",
            opacity: horarioOptions.length <= 1 ? 0.6 : 1,
          }}
        >
          ⏮ Anterior
        </button>
        <button
          onClick={handleNextHorario}
          disabled={horarioOptions.length <= 1}
          style={{
            background: horarioOptions.length <= 1 ? "#ccc" : "#0ea5e9",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "8px",
            cursor: horarioOptions.length <= 1 ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "13px",
            transition: "all 0.2s ease",
            opacity: horarioOptions.length <= 1 ? 0.6 : 1,
          }}
        >
          ⏭ Próxima
        </button>
        <button
          onClick={handleUndo}
          disabled={history.length === 0}
          style={{
            background: history.length === 0 ? "#ccc" : "#6c757d",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "8px",
            cursor: history.length === 0 ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "13px",
            transition: "all 0.2s ease",
            opacity: history.length === 0 ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (history.length > 0) {
              (e.target as HTMLButtonElement).style.background = "#5a6268";
            }
          }}
          onMouseLeave={(e) => {
            if (history.length > 0) {
              (e.target as HTMLButtonElement).style.background = "#6c757d";
            }
          }}
        >
          ↶ Desfazer
        </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowClearOptions((prev) => !prev)}
            style={{
              background: "#e8e8e8",
              color: "#333",
              border: "1px solid #ccc",
              padding: "10px 18px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = "#d0d0d0";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = "#e8e8e8";
            }}
          >
            🔄 Limpar
          </button>
          {showClearOptions && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "8px",
                boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                padding: "6px",
                minWidth: "130px",
                zIndex: 20,
              }}
            >
              <button
                onClick={() => handleClearOption("all")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: "6px",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Tudo
              </button>
              <button
                onClick={() => handleClearOption("day")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: "6px",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Dia {String(selectedDate.split("-")[2] || "").padStart(2, "0")}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          style={{
            background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            color: "white",
            border: "none",
            padding: "10px 24px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            transition: "all 0.2s ease",
            boxShadow: "0 4px 12px rgba(67, 233, 123, 0.3)",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(-2px)";
            (e.target as HTMLButtonElement).style.boxShadow =
              "0 6px 16px rgba(67, 233, 123, 0.4)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(0)";
            (e.target as HTMLButtonElement).style.boxShadow =
              "0 4px 12px rgba(67, 233, 123, 0.3)";
          }}
        >
          💾 Salvar Chamada
        </button>
      </div>

      {/* MODAL DE JUSTIFICATIVA */}
      {showJustificationModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div style={{ background: "white", padding: "25px", borderRadius: "12px", width: "300px", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "15px", color: "#333" }}>Adicionar Justificativa</h3>

            {(() => {
              const student = attendance.find((item) => item.id === justificationStudentId);
              const entries = getMonthJustificationSummary(student?.justifications);
              if (entries.length === 0) return null;
              return (
                <div style={{ marginBottom: "15px", background: "#f8f9fa", border: "1px solid #eee", borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", marginBottom: "6px" }}>Justificativas do mês</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#666" }}>
                    {entries.map((entry, idx) => (
                      <div key={`${entry.dayLabel}-${idx}`} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ minWidth: "44px", fontWeight: 700 }}>{entry.dayLabel}</span>
                        <span style={{ flex: 1 }}>{entry.reason}</span>
                        <button
                          type="button"
                          onClick={() => removerJustificativa(entry.dayLabel, entry.reason)}
                          title="Remover justificativa"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: "14px",
                            lineHeight: 1,
                            padding: "2px 4px",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: 600 }}>Dia (dd):</label>
              <input
                type="number"
                value={justificationDay}
                onChange={(e) => setJustificationDay(e.target.value)}
                placeholder="Ex: 14"
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
              />
            </div>
            
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: 600 }}>Motivo:</label>
              <textarea
                value={justificationReason}
                onChange={(e) => setJustificationReason(e.target.value)}
                placeholder="Ex: Atestado médico"
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", minHeight: "80px" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowJustificationModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #ccc", background: "white", cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarJustificativa} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#28a745", color: "white", cursor: "pointer", fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ANOTAÇÕES DO ALUNO */}
      {studentModalOpen && activeStudentForNotes && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1100,
          }}
          onClick={() => setStudentModalOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              width: "320px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              overflow: "hidden",
              animation: "fadeIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: "#667eea", padding: "15px", color: "white" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{getDisplayStudentName(activeStudentForNotes.aluno)}</h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.9 }}>Anotações</p>
            </div>
            
            <div style={{ padding: "20px" }}>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={handleAddNote}
                placeholder="Escreva e tecle Enter..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 5px",
                  border: "none",
                  borderBottom: "2px solid #eee",
                  outline: "none",
                  fontSize: "14px",
                  marginBottom: "15px",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderBottomColor = "#667eea")}
                onBlur={(e) => (e.target.style.borderBottomColor = "#eee")}
              />

              <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                {(!activeStudentForNotes.notes || activeStudentForNotes.notes.length === 0) && (
                  <div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "10px" }}>
                    Nenhuma anotação registrada.
                  </div>
                )}
                {activeStudentForNotes.notes?.map((note, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid #f0f0f0",
                      fontSize: "13px",
                      color: "#444",
                    }}
                  >
                    <span style={{ flex: 1, paddingRight: "10px" }}>{note}</span>
                    <button
                      onClick={() => handleDeleteNote(idx)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#dc3545",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                      title="Excluir anotação"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INTELIGENTE (DATA / CLIMA / OCORRÊNCIA) */}
      {showDateModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200
        }}>
          {(() => {
            const modalLogTypeLabel = getModalLogTypeLabel();
            return (
          <div style={{ background: "white", padding: "25px", borderRadius: "16px", width: "min(520px, 96vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#2c3e50" }}>
                {modalDate.split("-").reverse().join("/")}
                {modalStep !== "select" && !!modalLogTypeLabel && <span style={{ fontSize: "14px", color: "#666", marginLeft: "10px" }}>({modalLogTypeLabel})</span>}
              </h3>
              <button onClick={() => { setShowClimateEditor(false); setShowDateModal(false); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>

            {/* NÍVEL 1: SELEÇÃO */}
            {modalStep === "select" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button className="btn-option" style={{ background: "#667eea", color: "white", padding: "15px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setPoolData(p => ({...p, logType: "aula"})); setModalStep("aula"); }}>
                  🏊 Aula
                </button>
                <button className="btn-option" style={{ background: "#ffc107", color: "#333", padding: "15px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setPoolData(p => ({...p, logType: "ocorrencia", cloroEnabled: false, incidentImpact: "aula" })); setModalStep("ocorrencia"); }}>
                  ⚠️ Ocorrência
                </button>
              </div>
            )}

            {/* NÍVEL 2: AULA (CARD CLIMA) */}
            {modalStep === "aula" && (
              <div className="card-clima">
                <h4 style={{ marginTop: 0, color: "#444" }}>🌤️ Condição Climática e Sensação</h4>
                <div style={{ marginBottom: "16px", border: "1px solid #e5e7eb", borderRadius: "10px", background: "#f8fafc", padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "4px" }}>Condição climática:</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#2c3e50", marginBottom: "10px" }}>
                        {poolData.weatherCondition || "Sem retorno automático"}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "4px" }}>Temp. externa (°C):</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#2c3e50", marginBottom: poolData.selectedIcons.length ? "10px" : 0 }}>
                        {poolData.tempExterna || "Sem retorno automático"}
                      </div>
                      {poolData.selectedIcons.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {poolData.selectedIcons.map((icon) => (
                            <span
                              key={icon}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                color: "#475569",
                                fontSize: "10px",
                                fontWeight: 700,
                              }}
                            >
                              {icon}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClimateEditor((prev) => !prev)}
                      title={showClimateEditor ? "Recolher edição manual" : "Editar condição climática"}
                      style={{
                        alignSelf: "flex-start",
                        border: "none",
                        background: "transparent",
                        color: "#666",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 700,
                        padding: "2px 4px",
                        lineHeight: 1,
                      }}
                    >
                      ✎
                    </button>
                  </div>
                  {showClimateEditor && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "4px" }}>Condição climática:</label>
                        <select 
                          value={poolData.weatherCondition || ""} 
                          onChange={e => setPoolData({...poolData, weatherCondition: e.target.value})}
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "12px", background: "white" }}
                        >
                          <option value="">Selecione a condição</option>
                          <optgroup label="Condições Favoráveis">
                            <option value="Céu Claro">Céu Claro</option>
                            <option value="Predomínio de Sol">Predomínio de Sol</option>
                            <option value="Sol entre Nuvens">Sol entre Nuvens</option>
                            <option value="Parcialmente Nublado">Parcialmente Nublado</option>
                            <option value="Nublado">Nublado</option>
                          </optgroup>
                          <optgroup label="Condições que Justificam">
                            <option value="Encoberto">Encoberto</option>
                            <option value="Instável">Instável</option>
                            <option value="Chuvas Isoladas">Chuvas Isoladas</option>
                            <option value="Chuva">Chuva</option>
                            <option value="Chuvisco">Chuvisco</option>
                            <option value="Pancadas de Chuva">Pancadas de Chuva</option>
                            <option value="Tempestade">Tempestade</option>
                            <option value="Nevoeiro">Nevoeiro</option>
                            <option value="Geada">Geada</option>
                          </optgroup>
                        </select>
                      </div>
                      <div style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: "6px", marginBottom: "15px", WebkitOverflowScrolling: "touch" }}>
                        {WEATHER_ICONS.sensations.map(icon => (
                          <button
                            key={icon}
                            onClick={() => toggleIcon(icon)}
                            style={{
                              padding: "4px 9px",
                              borderRadius: "20px",
                              border: poolData.selectedIcons.includes(icon) ? "2px solid #667eea" : "1px solid #ddd",
                              background: poolData.selectedIcons.includes(icon) ? "#eef2ff" : "white",
                              color: poolData.selectedIcons.includes(icon) ? "#667eea" : "#666",
                              cursor: "pointer",
                              fontSize: "9px",
                              fontWeight: 600,
                              flex: "0 0 auto",
                              minWidth: icon === "Agradável" ? "76px" : "64px",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666" }}>Temp. Externa (°C)</label>
                        <input 
                          type="number" 
                          value={poolData.tempExterna} 
                          onChange={e => setPoolData({...poolData, tempExterna: e.target.value})}
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#f8f9fa" }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px", marginBottom: "20px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666" }}>Temp. Piscina (°C)</label>
                    <input 
                      type="number" 
                      value={poolData.tempPiscina} 
                      onChange={e => setPoolData({...poolData, tempPiscina: e.target.value})}
                      placeholder="00"
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  {(() => {
                    const cloroSafe = Number.isFinite(poolData.cloro) ? poolData.cloro : 1.5;
                    return (
                      <>
                        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "bold", color: "#666" }}>
                          <span>Cloro (ppm)</span>
                          <span style={{ color: !cloroLocked ? getChlorineColor(cloroSafe) : "#999" }}>
                            {!cloroLocked ? cloroSafe.toFixed(1) : "-"}
                          </span>
                        </label>
                        <input
                          type="range"
                          min="0" max="7" step="0.5"
                          value={cloroSafe}
                          onChange={e => {
                            const next = parseFloat(e.target.value);
                            if (!Number.isFinite(next)) return;
                            setPoolData({ ...poolData, cloro: next });
                          }}
                          disabled={cloroLocked}
                          style={{ width: "100%", accentColor: getChlorineColor(cloroSafe), opacity: !cloroLocked ? 1 : 0.4 }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#999" }}>
                          <span>0.0</span><span>3.5</span><span>7.0</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {(() => {
                  const suggested = getSuggestedDecision();
                  const background = suggested.status === "cancelada"
                    ? "#f8d7da"
                    : suggested.status === "justificada"
                      ? "#fff3cd"
                      : "#d4edda";
                  const label = suggested.status === "cancelada"
                    ? "AULA CANCELADA"
                    : suggested.status === "justificada"
                      ? "FALTA JUSTIFICADA"
                      : "AULA NORMAL";
                  return (
                    <div style={{ background, padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px", textAlign: "center", border: "1px solid rgba(0,0,0,0.1)" }}>
                      Status Sugerido: <strong>{label}</strong>
                      <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.85 }}>{suggested.reason}</div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setModalStep("select")} style={{ flex: 1, padding: "10px", border: "1px solid #ccc", borderRadius: "6px", background: "white", cursor: "pointer" }}>Voltar</button>
                  <button onClick={() => handleSaveLog()} style={{ flex: 2, padding: "10px", border: "none", borderRadius: "6px", background: "#667eea", color: "white", fontWeight: "bold", cursor: "pointer" }}>Salvar Dados</button>
                </div>
              </div>
            )}

            {/* NÍVEL 2: OCORRÊNCIA (CARD BO) */}
            {modalStep === "ocorrencia" && (
              <div className="card-bo">
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "5px" }}>
                    Tipo de Ocorrência
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: poolData.incidentImpact === "dia" ? "#ffe8cc" : "#e6ffed", color: poolData.incidentImpact === "dia" ? "#b54708" : "#1a7f37" }}>
                      {poolData.incidentImpact === "dia" ? "Dia" : "Aula"}
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "8px", fontSize: "12px", color: "#666" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="radio"
                        name="occurrenceImpact"
                        checked={poolData.incidentImpact === "aula"}
                        onChange={() => setPoolData({ ...poolData, incidentImpact: "aula" })}
                      />
                      Compromete a aula
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="radio"
                        name="occurrenceImpact"
                        checked={poolData.incidentImpact === "dia"}
                        onChange={() => setPoolData({ ...poolData, incidentImpact: "dia" })}
                      />
                      Compromete o dia
                    </label>
                  </div>
                  <select 
                    value={poolData.incidentType} 
                    onChange={e => {
                      const next = e.target.value;
                      setPoolData({
                        ...poolData,
                        incidentType: next,
                      });
                    }}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    <option value="">Selecione...</option>
                    <option value="Manutencao">Manutenção / Incidente</option>
                    <option value="Pessoal">Pessoal (Professor)</option>
                    <option value="RaiosTrovoes">Raios e Trovões</option>
                  </select>
                </div>

                {poolData.incidentType === "Pessoal" && (
                  <div style={{ marginBottom: "15px", display: "flex", gap: "15px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px" }}>
                      <input type="radio" name="personalType" checked={poolData.personalType === "Medico"} onChange={() => setPoolData({...poolData, personalType: "Medico"})} /> Médico
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px" }}>
                      <input type="radio" name="personalType" checked={poolData.personalType === "Particular"} onChange={() => setPoolData({...poolData, personalType: "Particular"})} /> Particular
                    </label>
                  </div>
                )}

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "5px" }}>Detalhes / Observações</label>
                  <textarea 
                    value={poolData.incidentNote}
                    onChange={e => setPoolData({...poolData, incidentNote: e.target.value})}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", minHeight: "80px" }}
                  />
                </div>

                {/* Slider de Cloro também na Ocorrência para registros técnicos */}
                {poolData.incidentType === "Manutencao" && (
                  <div style={{ marginBottom: "20px", borderTop: "1px solid #eee", paddingTop: "15px" }}>
                    {(() => {
                      const cloroSafe = Number.isFinite(poolData.cloro) ? poolData.cloro : 1.5;
                      return (
                        <>
                          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "5px" }}>
                            <span>Registro Técnico (Cloro)</span>
                            <span style={{ color: !cloroLocked ? getChlorineColor(cloroSafe) : "#999" }}>
                              {!cloroLocked ? cloroSafe.toFixed(1) : "-"}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0" max="7" step="0.5"
                            value={cloroSafe}
                            onChange={e => {
                              const next = parseFloat(e.target.value);
                              if (!Number.isFinite(next)) return;
                              setPoolData({ ...poolData, cloro: next });
                            }}
                            disabled={cloroLocked}
                            style={{ width: "100%", accentColor: getChlorineColor(cloroSafe), opacity: !cloroLocked ? 1 : 0.4 }}
                          />
                        </>
                      );
                    })()}
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setModalStep("select")} style={{ flex: 1, padding: "10px", border: "1px solid #ccc", borderRadius: "6px", background: "white", cursor: "pointer" }}>Voltar</button>
                  <button onClick={() => handleSaveLog()} style={{ flex: 2, padding: "10px", border: "none", borderRadius: "6px", background: "#dc3545", color: "white", fontWeight: "bold", cursor: "pointer" }}>Registrar Ocorrência</button>
                </div>
              </div>
            )}
          </div>
            );
          })()}
        </div>
      )}

      {showDebugPanel && (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            width: debugPanelCollapsed ? "auto" : "min(94vw, 420px)",
            maxHeight: debugPanelCollapsed ? "none" : "42vh",
            background: "rgba(17,24,39,0.95)",
            color: "#f9fafb",
            borderRadius: 10,
            padding: 10,
            zIndex: 1600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12 }}>Debug Persistência</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setDebugPanelCollapsed((prev) => !prev)}
                style={{
                  border: "1px solid #6b7280",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#f9fafb",
                  fontSize: 11,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                {debugPanelCollapsed ? "Abrir" : "Recolher"}
              </button>
              {!debugPanelCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(attendanceDebugEventsKey);
                    setDebugEvents([]);
                  }}
                  style={{
                    border: "1px solid #6b7280",
                    borderRadius: 6,
                    background: "transparent",
                    color: "#f9fafb",
                    fontSize: 11,
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {!debugPanelCollapsed && <div style={{ overflowY: "auto", fontSize: 11, lineHeight: 1.35 }}>
            {debugEvents.length === 0 && <div style={{ opacity: 0.8 }}>Sem eventos ainda.</div>}
            {debugEvents
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div key={`${entry.ts}-${entry.action}-${idx}`} style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 6, marginTop: 6 }}>
                  <div style={{ opacity: 0.8 }}>
                    {new Date(entry.ts).toLocaleTimeString()} · {entry.source} · {entry.action}
                  </div>
                  <div style={{ opacity: 0.95 }}>
                    {String(entry.payload?.turmaCodigo || entry.payload?.turmaLabel || "-")} | {String(entry.payload?.horario || "-")} | {String(entry.payload?.professor || "-")} | {String(entry.payload?.mes || "-")}
                  </div>
                  {entry.action.includes("queued") || entry.action.includes("flush") ? (
                    <div style={{ opacity: 0.85 }}>
                      pending: {String(entry.payload?.pending ?? "-")} · flushed: {String(entry.payload?.flushed ?? "-")}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>}
        </div>
      )}
    </div>
  );
};

export default Attendance;
