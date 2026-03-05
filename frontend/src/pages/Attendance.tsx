import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addExclusion, flushPendingAttendanceLogs, getAcademicCalendar, getExcludedStudents, getPoolLog, getReports, getStatistics, getWeather, saveAttendanceLog, saveJustificationLog, savePoolLog } from "../api";
import {
  isClassBlockedByEventPeriod,
  isDateClosedForAttendance,
} from "../utils/academicCalendar";
import type { AcademicCalendarEvent, AcademicCalendarSettings } from "../utils/academicCalendar";

interface ClassOption {
  turmaCodigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  nivel: string;
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
}

interface ReportClassLite {
  turma: string;
  horario: string;
  professor: string;
  alunos: ReportStudentLite[];
}

interface LevelHistoryLite {
  nivel: string;
  firstDate?: string;
  lastDate?: string;
}

interface StudentStatisticsLite {
  nome: string;
  levels?: LevelHistoryLite[];
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
  "ci", "c", "in", "pp", "cm", "pt", "pm", "np", "pc", "cv", "ch", "t", "e", "n", "nv",
  "psc", "pcm", "pct", "npt", "ncm", "npm", "npp", "ct", "ppt", "ppm",
]);

const normalizeSensation = (value: string) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "agradavel") return "Agradável";
  if (raw === "abafado") return "Abafado";
  if (raw === "calor") return "Calor";
  if (raw === "seco") return "Seco";
  if (raw === "vento") return "Vento";
  if (raw === "frio") return "Frio";
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
  ec: "Céu claro",
  ci: "Chuvas isoladas",
  c: "Chuva",
  in: "Instável",
  pp: "Pancadas de chuva",
  cm: "Chuva pela manhã",
  pt: "Pancadas à tarde",
  pm: "Pancadas pela manhã",
  np: "Nublado com pancadas",
  pc: "Parcialmente nublado",
  cv: "Chuvisco",
  ch: "Chuvoso",
  t: "Tempestade",
  e: "Encoberto",
  n: "Nublado",
  nv: "Nevoeiro",
  psc: "Possibilidade de chuva",
  pct: "Possibilidade de pancadas à tarde",
  ppm: "Possibilidade de pancadas pela manhã",
};

const normalizeWeatherConditionLabel = (condition?: string, conditionCode?: string) => {
  const code = String(conditionCode || "").trim().toLowerCase();
  if (code && CPTEC_CONDITION_LABELS[code]) {
    return CPTEC_CONDITION_LABELS[code];
  }

  const raw = String(condition || "").trim();
  if (!raw) return "";

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

  const truncateNameWords = (fullName: string, words: number) => {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= words) return parts.join(" ");

    const selected: string[] = [];
    let meaningfulCount = 0;

    for (const part of parts) {
      const normalizedPart = normalizeText(part);
      const isParticle = nameParticles.has(normalizedPart);
      if (!isParticle) {
        meaningfulCount += 1;
      }
      if (meaningfulCount > words) break;
      selected.push(part);
    }

    return selected.join(" ") || parts.slice(0, words).join(" ");
  };

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
    return value
      .split(/[;,]/)
      .map((token) => normalizeHorarioDigits(token.trim()))
      .filter(Boolean);
  };

  const getCanonicalHorario = (value?: string) => extractHorarioTokens(value)[0] || "";

  const normalizeClassOptions = (items: any[]): ClassOption[] => {
    const seen = new Map<string, ClassOption>();
    items.forEach((raw) => {
      if (!raw) return;
      const turmaLabel =
        getStringField(raw, "Turma", "turma_label", "turmaLabel", "turma") ||
        getStringField(raw, "label", "nome");
      const turmaCodigo =
        getStringField(raw, "TurmaCodigo", "codigo", "turmaCodigo", "Atalho") || turmaLabel;
      const professor = getStringField(raw, "Professor", "professor");
      const nivel = getStringField(raw, "Nivel", "nivel");
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
        turmaCodigo: turmaCodigo || turmaLabel,
        turmaLabel: turmaLabel || turmaCodigo,
        horario: canonicalHorario || horarioRaw,
        professor,
        nivel,
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

  const getTurmaKey = (opt: ClassOption) => opt.turmaLabel || opt.turmaCodigo;
  const isSameTurma = (opt: ClassOption, turma: string) => {
    if (!turma) return false;
    const turmaNormalized = normalizeText(turma);
    const codeNormalized = normalizeText(opt.turmaCodigo || "");
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
        const studentTurmaCodigo = normalizeText(student?.turmaCodigo || "");
        const studentHorario = normalizeHorarioDigits(student?.horario || "");
        const studentProfessor = normalizeText(student?.professor || "");

        const exclusionTurma = normalizeText(
          exclusion?.turmaLabel || exclusion?.TurmaLabel || exclusion?.turma || exclusion?.Turma || ""
        );
        const exclusionTurmaCodigo = normalizeText(exclusion?.turmaCodigo || exclusion?.TurmaCodigo || "");
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
        const keys = [turmaCodigo, turmaLabel].filter(Boolean);
        if (keys.length === 0 || !student.nome) return;

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
  const todayDateKey = new Date().toISOString().split("T")[0];
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

  useEffect(() => {
    let isMounted = true;
    getExcludedStudents()
      .then((response) => {
        if (!isMounted) return;
        const payload = Array.isArray(response?.data) ? response.data : [];
        let localList: any[] = [];
        try {
          const localRaw = localStorage.getItem("excludedStudents");
          const localParsed = localRaw ? JSON.parse(localRaw) : [];
          localList = Array.isArray(localParsed) ? localParsed : [];
        } catch {
          localList = [];
        }
        const resolved = payload.length > 0 ? payload : localList;
        localStorage.setItem("excludedStudents", JSON.stringify(resolved));
        refreshStorageData();
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [refreshStorageData]);

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

  const initialTurmaLookup = selectedClass.turmaCodigo || selectedClass.turmaLabel;
  const initialAttendance = (studentsPerClass[initialTurmaLookup] || []).map((aluno, idx) => ({
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

  const mobileTwoWordNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!isCompactViewport) return counts;

    sortedAttendance.forEach((item) => {
      const shortName = truncateNameWords(item.aluno, 2);
      const key = normalizeText(shortName);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
  }, [isCompactViewport, sortedAttendance]);

  const getDisplayStudentName = (fullName: string) => {
    if (!isCompactViewport) return fullName;
    const twoWords = truncateNameWords(fullName, 2);
    const key = normalizeText(twoWords);
    const hasCollision = (mobileTwoWordNameCounts.get(key) || 0) > 1;
    return hasCollision ? truncateNameWords(fullName, 3) : twoWords;
  };
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string>("");

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
      return response.data as { temp: string; condition: string; conditionCode?: string };
    } catch (error) {
      return { temp: "26", condition: "Parcialmente Nublado", conditionCode: "" };
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
        logPersistenceDebug("saveJustificationLog:auto_calendar_closure", {
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
        });
        await saveJustificationLog(changedEntries);
      } catch {
        // ignore to avoid blocking UI
      }

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
    
    // Resetar dados
    setPoolData(prev => ({
      ...prev,
      tempPiscina: DEFAULT_POOL_TEMP,
      cloro: 1.5,
      cloroEnabled: true,
      selectedIcons: [],
      weatherCondition: "",
      weatherConditionCode: "",
      incidentType: "",
      incidentNote: "",
      incidentImpact: "aula",
      logType: "aula"
    }));

    try {
      const existing = await getPoolLog(date, {
        turmaCodigo: selectedClass.turmaCodigo,
        turmaLabel: selectedClass.turmaLabel,
        horario: selectedClass.horario,
        professor: selectedClass.professor,
      });
      if (!existing?.data || typeof existing.data !== "object") {
        throw new Error("no pool log");
      }
      const data = existing.data as {
        turmaCodigo?: string;
        turmaLabel?: string;
        horario?: string;
        professor?: string;
        clima1: string;
        clima2: string;
        nota: string;
        tipoOcorrencia: string;
        tempExterna: string;
        tempPiscina: string;
        cloroPpm: number | null;
      };

      const icons = normalizeSensationList(
        (data.clima2 ? data.clima2.split(",") : []).map((item) => item.trim())
      );
      const inferredCondition = String(data.clima1 || "").trim();
      const inferredConditionLabel = normalizeWeatherConditionLabel(inferredCondition, "");
      const normalizedTemp = normalizeNumberInput(data.tempExterna);
      const fallbackSensation = getFallbackSensationByTemp(normalizedTemp);

      const cloroValue = data.cloroPpm;
      const cloroEnabled = typeof cloroValue === "number" && Number.isFinite(cloroValue);
      const modalLogType: ModalLogType = data.nota === "ocorrencia" ? "ocorrencia" : "aula";
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizedTemp,
        tempPiscina: normalizeNumberInput(data.tempPiscina),
        cloro: cloroEnabled ? cloroValue : 1.5,
        cloroEnabled,
        selectedIcons: icons.length ? icons : [fallbackSensation],
        weatherCondition: inferredConditionLabel,
        weatherConditionCode: "",
        incidentType: data.nota === "ocorrencia" ? data.tipoOcorrencia : "",
        incidentNote: "",
        incidentImpact: "aula",
        logType: modalLogType,
      }));
      setClimaPrefillApplied(true);

      if (modalLogType === "ocorrencia") {
        setModalStep("ocorrencia");
      } else {
        setModalStep("aula");
      }

      setShowDateModal(true);
      return;
    } catch (error) {
      // Tenta prefill pelo log do dia (qualquer turma)
      try {
        const dayLog = await getPoolLog(date);
        if (dayLog?.data && typeof dayLog.data === "object") {
          const data = dayLog.data as {
            clima1: string;
            clima2: string;
            tempExterna: string;
            tempPiscina: string;
            cloroPpm: number | null;
          };

          const icons = normalizeSensationList(
            (data.clima2 ? data.clima2.split(",") : []).map((item) => item.trim())
          );
          const inferredCondition = String(data.clima1 || "").trim();
          const inferredConditionLabel = normalizeWeatherConditionLabel(inferredCondition, "");
          const normalizedTemp = normalizeNumberInput(data.tempExterna);
          const fallbackSensation = getFallbackSensationByTemp(normalizedTemp);

          const cloroValue = data.cloroPpm;
          const cloroEnabled = typeof cloroValue === "number" && Number.isFinite(cloroValue);
          setPoolData(prev => ({
            ...prev,
            tempExterna: normalizedTemp,
            tempPiscina: normalizeNumberInput(data.tempPiscina),
            cloro: cloroEnabled ? cloroValue : 1.5,
            cloroEnabled,
            selectedIcons: icons.length ? icons : [fallbackSensation],
            weatherCondition: inferredConditionLabel,
            weatherConditionCode: "",
            incidentType: "",
            incidentNote: "",
            incidentImpact: "aula",
            logType: "aula",
          }));

          const existingCache = getClimaCache(date);
          setClimaCache(date, {
            tempExterna: normalizedTemp,
            selectedIcons: icons.length ? icons : [fallbackSensation],
            apiTemp: existingCache?.apiTemp,
            apiCondition: existingCache?.apiCondition,
            apiConditionCode: existingCache?.apiConditionCode,
            weatherCondition: inferredConditionLabel,
          });

          setClimaPrefillApplied(true);
          setShowDateModal(true);
          return;
        }
      } catch {
        // Continua com prefill via clima
      }
    }

    // Intentional any cast so we can read cached fields without the compiler narrowing the result to never
    const climaCache = getClimaCache(date) as any;
    if (climaCache) {
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizeNumberInput(climaCache.tempExterna),
        selectedIcons: normalizeSensationList(climaCache.selectedIcons || []),
        weatherCondition: normalizeWeatherConditionLabel(
          String(climaCache.weatherCondition || climaCache.apiCondition || ""),
          String(climaCache.apiConditionCode || "")
        ),
        weatherConditionCode: String(climaCache.apiConditionCode || ""),
      }));
      setClimaPrefillApplied(true);
      setShowDateModal(true);
      return;
    }

    const fallbackDate = localStorage.getItem(lastClimaCacheDateKey);
    const fallbackCache = fallbackDate && fallbackDate !== date ? getClimaCache(fallbackDate) : null;
    if (fallbackCache) {
      setPoolData(prev => ({
        ...prev,
        tempExterna: normalizeNumberInput(fallbackCache.tempExterna),
        selectedIcons: normalizeSensationList(fallbackCache.selectedIcons || []),
        weatherCondition: normalizeWeatherConditionLabel(
          String(fallbackCache.weatherCondition || fallbackCache.apiCondition || ""),
          String(fallbackCache.apiConditionCode || "")
        ),
        weatherConditionCode: String(fallbackCache.apiConditionCode || ""),
      }));
      setClimaPrefillApplied(true);
      setShowDateModal(true);
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
        }));
        setShowDateModal(true);
        return;
      }
    }

    const autoIcons = buildSensationFromApi(apiData);
    setPoolData(prev => ({
      ...prev,
      tempExterna: normalizeNumberInput(apiData.temp),
      selectedIcons: normalizeSensationList(autoIcons),
      weatherCondition: apiCondition,
      weatherConditionCode: apiConditionCode,
    }));
    setClimaCache(date, {
      tempExterna: normalizeNumberInput(apiData.temp),
      selectedIcons: normalizeSensationList(autoIcons),
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
      logPersistenceDebug("saveJustificationLog:auto_holiday_effect", {
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
      });
      saveJustificationLog(changedEntries).catch(() => undefined);
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
  const getSuggestedStatus = (): "normal" | "justificada" => {
    const { selectedIcons, weatherConditionCode } = poolData;
    const i = selectedIcons;

    if (JUSTIFIED_CPTEC_CODES.has(String(weatherConditionCode || "").toLowerCase())) return "justificada";
    if (i.includes("Frio") || i.includes("Vento")) return "justificada";

    return "normal";
  };

  const handleSaveLog = async (logTypeOverride?: ModalLogType | React.MouseEvent<HTMLButtonElement>) => {
    const persistence = resolvePersistenceContext();
    if (!persistence.isValid) {
      alert("Selecione turma, horário e professor válidos antes de salvar.");
      return;
    }

    const effectiveLogType = typeof logTypeOverride === "string" ? logTypeOverride : poolData.logType;
    const statusSugerido = getSuggestedStatus();
    const isOccurrence = effectiveLogType === "ocorrencia";
    const occurrenceImpact = poolData.incidentImpact;
    const reasonLabel = isOccurrence
      ? `Ocorrência (${occurrenceImpact}): ${poolData.incidentType || poolData.personalType}`
      : "Condições Climáticas";
    
    // Lógica para aula justificada e ocorrência
    const shouldTreatOccurrenceAsDay = isOccurrence && occurrenceImpact === "dia";
    const shouldMassJustify =
      (effectiveLogType === "aula" && statusSugerido === "justificada") ||
      shouldTreatOccurrenceAsDay;
    const shouldAddJustificationNote = shouldMassJustify || isOccurrence;
    if (shouldMassJustify || shouldAddJustificationNote) {
      // Aplicar justificativa em massa
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      setAttendance(prev => prev.map(student => {
        const nextJustifications = { ...(student.justifications || {}) };
        if (shouldMassJustify) {
          nextJustifications[modalDate] = reasonLabel;
        }
        if (shouldAddJustificationNote) {
          nextJustifications[modalDate] = reasonLabel;
        }
        return {
          ...student,
          attendance: shouldMassJustify ? { ...student.attendance, [modalDate]: "Justificado" } : student.attendance,
          justifications: nextJustifications,
        };
      }));

      try {
        const entries = attendance.map((student) => ({
          aluno_nome: student.aluno,
          data: modalDate,
          motivo: reasonLabel,
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
        }));
        logPersistenceDebug("saveJustificationLog:modal_mass_justification", {
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
          mes: monthKey,
        });
        await saveJustificationLog(entries);
      } catch {
        // ignore to avoid blocking UI
      }
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
      cloroPpm: !cloroLocked && poolData.cloroEnabled && Number.isFinite(poolData.cloro) ? poolData.cloro : null,
    };

    try {
      if (effectiveLogType === "aula" || (isOccurrence && occurrenceImpact === "aula")) {
        const existingCache = getClimaCache(modalDate);
        setClimaCache(modalDate, {
          tempExterna: normalizeNumberInput(poolData.tempExterna),
          selectedIcons: normalizeSensationList(poolData.selectedIcons),
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
      console.info("pool-log saved", response?.data);
      alert(`Dados salvos! Status da aula: ${logEntry.statusAula.toUpperCase()}${action}${file}`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      console.error("pool-log save error", error);
      alert(detail ? `Erro ao salvar dados do clima: ${detail}` : "Erro ao salvar dados do clima. Tente novamente.");
    }
    setShowDateModal(false);
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

  const handleAddNote = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newNote.trim() && studentModalId !== null) {
      setAttendance((prev) =>
        prev.map((item) => {
          if (item.id === studentModalId) {
            return {
              ...item,
              notes: [...(item.notes || []), newNote.trim()],
            };
          }
          return item;
        })
      );
      setNewNote("");
    }
  };

  const handleDeleteNote = (noteIndex: number) => {
    if (studentModalId !== null) {
      setAttendance((prev) =>
        prev.map((item) => {
          if (item.id === studentModalId) {
            const updatedNotes = [...(item.notes || [])];
            updatedNotes.splice(noteIndex, 1);
            return { ...item, notes: updatedNotes };
          }
          return item;
        })
      );
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

  const selectedDaysKey = selectedClass.diasSemana.join("|");
  useEffect(() => {
    let isMounted = true;

    const hydrateAttendance = async () => {
      const turmaLookup = selectedClass.turmaCodigo || selectedClass.turmaLabel;
      if (!turmaLookup || !storageKey) {
        if (isMounted) setHydratedStorageKey("");
        return;
      }

      const newDates = generateDates(selectedClass.diasSemana, monthKey).map((d) => d.split(" ")[0]);
      const storedRecords = loadAttendanceStorage();
      const storedByName = new Map(
        (storedRecords || []).map((item) => [normalizeText(item.aluno), item])
      );

      const backendByName = new Map<string, { attendance: Record<string, "Presente" | "Falta" | "Justificado" | ""> }>();

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
            const turmaMatches = turmaCandidates.includes(normalizeText(item.turma || ""));
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

        (matchedClass?.alunos || []).forEach((student) => {
          const studentKey = normalizeText(student.nome || "");
          if (!studentKey) return;
          const attendanceMap = (student.historico || {}) as Record<string, string>;
          const mappedAttendance = Object.entries(attendanceMap).reduce(
            (acc, [dayKey, status]) => {
              const day = String(dayKey || "").padStart(2, "0");
              const dateKey = `${monthKey}-${day}`;
              if (newDates.includes(dateKey)) {
                acc[dateKey] = mapAttendanceValue(String(status || ""));
              }
              return acc;
            },
            {} as Record<string, "Presente" | "Falta" | "Justificado" | "">
          );
          backendByName.set(studentKey, { attendance: mappedAttendance });
        });

        const statsResponse = await getStatistics();
        const statsRows = Array.isArray(statsResponse?.data) ? (statsResponse.data as StudentStatisticsLite[]) : [];
        const selectedNivelNormalized = normalizeText(selectedClass.nivel || "");
        const transferLocks: Record<string, TransferLockInfo> = {};

        if (selectedNivelNormalized) {
          statsRows.forEach((row) => {
            const studentKey = normalizeText(row?.nome || "");
            if (!studentKey) return;

            const levels = Array.isArray(row?.levels) ? row.levels : [];
            const currentLevel = levels.find(
              (level) => normalizeText(level?.nivel || "") === selectedNivelNormalized && !!level?.firstDate
            );
            if (!currentLevel?.firstDate) return;
            const currentStartDate = currentLevel.firstDate;

            const previousCandidates = levels
              .filter(
                (level) =>
                  !!level?.lastDate &&
                  !!level?.nivel &&
                  normalizeText(level.nivel) !== selectedNivelNormalized &&
                    level.lastDate < currentStartDate
              )
              .sort((a, b) => String(b.lastDate || "").localeCompare(String(a.lastDate || "")));

            const previousLevel = previousCandidates[0];
            if (!previousLevel?.nivel) return;

            transferLocks[studentKey] = {
              lockBeforeDate: currentStartDate,
              fromNivel: previousLevel.nivel,
            };
          });
        }

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

        if (isMounted) {
          setTransferLocksByName(transferLocks);
        }
      } catch {
        // mantém hidratação local quando backend de relatórios indisponível
        if (isMounted) {
          setTransferLocksByName({});
        }
      }

      if (!isMounted) return;

      // Resetar histórico ao mudar de turma/horário/professor para evitar inconsistências
      setHistory([]);

      setAttendance(
        (studentsPerClass[turmaLookup] || []).map((aluno, idx) => {
          const base = newDates.reduce(
            (acc, date) => {
              acc[date] = "";
              return acc;
            },
            {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
          );

          const backend = backendByName.get(normalizeText(aluno));
          const stored = storedByName.get(normalizeText(aluno));

          return {
            id: idx + 1,
            aluno,
            attendance: (() => {
              const merged = {
                ...base,
                ...(backend?.attendance || {}),
              };

              if (!backend) {
                const storedAttendance = stored?.attendance || {};
                Object.entries(storedAttendance).forEach(([date, value]) => {
                  if (value && !merged[date]) {
                    merged[date] = value;
                  }
                });
              }

              return merged;
            })(),
            justifications: stored?.justifications || {},
          };
        })
      );
      setHydratedStorageKey(storageKey);
    };

    hydrateAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedTurma, selectedClass.horario, selectedClass.professor, selectedDaysKey, studentsPerClass, storageKey, monthKey, selectedClass.turmaLabel, selectedClass.turmaCodigo, selectedHorario, selectedProfessor]);

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

    setAttendance((prev) => {
      const newAttendance = prev.map((item) => {
        if (item.id === id) {
          const currentStatus = item.attendance[date];
          const newStatus = cycleStatus(currentStatus);
          console.log(`Clique: ID=${id} Data=${date} ${currentStatus}→${newStatus}`);
          
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
    }
  };

  const handleClearAll = () => {
    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);

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

  // Função de Exclusão: Ativada quando o aluno tem 3 ou mais faltas
  const excluirAluno = (id: number) => {
    if (window.confirm("O aluno excedeu o limite de faltas. Deseja excluí-lo da lista?")) {
      const student = attendance.find((item) => item.id === id);
      if (student) {
        const excludedStudents = JSON.parse(localStorage.getItem("excludedStudents") || "[]");
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
          dataExclusao: new Date().toLocaleDateString(),
          motivo_exclusao: "Falta",
        };

        addExclusion(payload).catch(() => {
          alert("Falha ao enviar exclusão ao backend. Tente novamente.");
        });

        const exists = excludedStudents.some((s: any) => s.id === payload.id);
        if (!exists) {
          excludedStudents.push(payload);
          localStorage.setItem("excludedStudents", JSON.stringify(excludedStudents));
        }
      }
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      setAttendance((prev) => prev.filter((student) => student.id !== id));
    }
  };

  // Função de Justificativa: Abre o modal de notação
  const adicionarJustificativa = (id: number) => {
    const student = attendance.find((item) => item.id === id);
    const entries = getMonthJustificationEntries(student?.justifications);
    const first = entries[0];
    setJustificationStudentId(id);
    setJustificationDay(first?.day || "");
    setJustificationReason(first?.reason || "");
    setShowJustificationModal(true);
  };

  const salvarJustificativa = () => {
    if (!justificationStudentId || !justificationDay || !justificationReason) {
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

    setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
    setAttendance((prev) =>
      prev.map((item) => {
        if (item.id === justificationStudentId) {
          return {
            ...item,
            attendance: { ...item.attendance, [targetDate]: "Justificado" },
            justifications: { ...(item.justifications || {}), [targetDate]: justificationReason },
          };
        }
        return item;
      })
    );

    setShowJustificationModal(false);

    const student = attendance.find((item) => item.id === justificationStudentId);
    const persistence = resolvePersistenceContext();
    if (student) {
      if (!persistence.isValid) {
        alert("Selecione turma, horário e professor válidos antes de salvar.");
        return;
      }

      logPersistenceDebug("saveJustificationLog:manual_single", {
        turmaCodigo: persistence.turmaCodigo,
        turmaLabel: persistence.turmaLabel,
        horario: persistence.horario,
        professor: persistence.professor,
        mes: monthKey,
      });
      saveJustificationLog([
        {
          aluno_nome: student.aluno,
          data: targetDate,
          motivo: justificationReason,
          turmaCodigo: persistence.turmaCodigo,
          turmaLabel: persistence.turmaLabel,
          horario: persistence.horario,
          professor: persistence.professor,
        },
      ]).catch(() => undefined);
    }
  };

  const handleSave = () => {
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
      })),
    };

    logPersistenceDebug("saveAttendanceLog:manual", {
      turmaCodigo: payload.turmaCodigo,
      turmaLabel: payload.turmaLabel,
      horario: payload.horario,
      professor: payload.professor,
      mes: payload.mes,
    });

    saveAttendanceLog(payload)
      .then((resp: any) => {
        if (resp?.data?.queued) {
          alert("Sem conexão no momento. Chamada salva localmente e pendente de sincronização.");
          return;
        }
        const file = resp?.data?.file ? `\nArquivo: ${resp.data.file}` : "";
        alert(`Chamada salva com sucesso!${file}`);
      })
      .catch(() => {
        alert("Erro ao salvar chamada. Tente novamente.");
      });
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
            onChange={(e) => setSelectedTurma(e.target.value)}
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
            onChange={(e) => setSelectedProfessor(e.target.value)}
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
        </div>
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
                  const holidayBridgeEvent = getHolidayBridgeEventForDate(date);
                  const meetingEvent = getBlockingMeetingEventForDate(date);
                  const isLockedDate = dayClosed || classBlockedByMeeting;
                  const headerTooltip = holidayBridgeEvent
                    ? buildHolidayBridgeReason(holidayBridgeEvent)
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
                const showNote =
                  Object.values(item.attendance).some((s) => s === "Falta" || s === "Justificado") ||
                  hasAnyMonthJustification(item.justifications);
                const showDelete = absences >= 3;
                const renewalAlert = getRenewalAlertInfo(item.aluno);
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
                      <span style={{ borderBottom: "1px dashed #ccc" }}>{getDisplayStudentName(item.aluno)}</span>
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
                    const holidayBridgeEvent = getHolidayBridgeEventForDate(date);
                    const meetingEvent = getBlockingMeetingEventForDate(date);
                    const isTransferLocked = !!transferLock;
                    const isLockedDate = dayClosed || classBlockedByMeeting || isTransferLocked;
                    const cellTooltip = isTransferLocked
                      ? `Transf. > ${transferLock?.fromNivel || "Nível anterior"}`
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
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTÕES AÇÃO */}
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
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
        <button
          onClick={handleClearAll}
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
          🔄 Limpar Tudo
        </button>
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
              const entries = getMonthJustificationEntries(student?.justifications);
              if (entries.length === 0) return null;
              return (
                <div style={{ marginBottom: "15px", background: "#f8f9fa", border: "1px solid #eee", borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#555", marginBottom: "6px" }}>Justificativas do mês</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#666" }}>
                    {entries.map((entry, idx) => (
                      <div key={`${entry.day}-${idx}`} style={{ display: "flex", gap: "6px" }}>
                        <span style={{ minWidth: "28px", fontWeight: 700 }}>{entry.day}</span>
                        <span>{entry.reason}</span>
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
          <div style={{ background: "white", padding: "25px", borderRadius: "16px", width: "450px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#2c3e50" }}>
                {modalDate.split("-").reverse().join("/")}
                {modalStep !== "select" && !!modalLogTypeLabel && <span style={{ fontSize: "14px", color: "#666", marginLeft: "10px" }}>({modalLogTypeLabel})</span>}
              </h3>
              <button onClick={() => setShowDateModal(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
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
                <div style={{ marginBottom: "12px", fontSize: "12px", color: "#555" }}>
                  <strong>Condição climática:</strong>{" "}
                  {poolData.weatherCondition || "Indisponível"}
                </div>
                <div style={{ display: "flex", flexWrap: "nowrap", gap: "6px", marginBottom: "15px" }}>
                  {WEATHER_ICONS.sensations.map(icon => (
                    <button
                      key={icon}
                      onClick={() => toggleIcon(icon)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "20px",
                        border: poolData.selectedIcons.includes(icon) ? "2px solid #667eea" : "1px solid #ddd",
                        background: poolData.selectedIcons.includes(icon) ? "#eef2ff" : "white",
                        color: poolData.selectedIcons.includes(icon) ? "#667eea" : "#666",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                        flex: "1 1 0",
                        minWidth: 0,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666" }}>Temp. Externa (°C)</label>
                    <input 
                      type="number" 
                      value={poolData.tempExterna} 
                      onChange={e => setPoolData({...poolData, tempExterna: e.target.value})}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#f8f9fa" }}
                    />
                  </div>
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
                          <button
                            type="button"
                            onClick={() => {
                              if (cloroLocked) return;
                              setPoolData({ ...poolData, cloroEnabled: !poolData.cloroEnabled });
                            }}
                            disabled={cloroLocked}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "14px",
                              border: poolData.cloroEnabled ? "2px solid #667eea" : "1px solid #ddd",
                              background: poolData.cloroEnabled ? "#eef2ff" : "white",
                              color: poolData.cloroEnabled ? "#667eea" : "#666",
                              cursor: cloroLocked ? "not-allowed" : "pointer",
                              fontSize: "11px",
                              fontWeight: 700,
                              opacity: cloroLocked ? 0.5 : 1,
                            }}
                          >
                            Cloro (ppm)
                          </button>
                          <span style={{ color: poolData.cloroEnabled ? getChlorineColor(cloroSafe) : "#999" }}>
                            {poolData.cloroEnabled ? cloroSafe.toFixed(1) : "-"}
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
                          disabled={!poolData.cloroEnabled || cloroLocked}
                          style={{ width: "100%", accentColor: getChlorineColor(cloroSafe), opacity: poolData.cloroEnabled && !cloroLocked ? 1 : 0.4 }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#999" }}>
                          <span>0.0</span><span>3.5</span><span>7.0</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div style={{ background: getSuggestedStatus() === "justificada" ? "#fff3cd" : "#d4edda", padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px", textAlign: "center", border: "1px solid rgba(0,0,0,0.1)" }}>
                  Status Sugerido: <strong>{getSuggestedStatus() === "justificada" ? "FALTA JUSTIFICADA" : "AULA NORMAL"}</strong>
                </div>

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
                        cloroEnabled: next === "Manutencao" ? false : poolData.cloroEnabled,
                      });
                    }}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    <option value="">Selecione...</option>
                    <option value="Manutencao">Manutenção / Incidente</option>
                    <option value="Pessoal">Pessoal (Professor)</option>
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
                            <button
                              type="button"
                              onClick={() => {
                                if (cloroLocked) return;
                                setPoolData({ ...poolData, cloroEnabled: !poolData.cloroEnabled });
                              }}
                              disabled={cloroLocked}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "14px",
                                border: poolData.cloroEnabled ? "2px solid #667eea" : "1px solid #ddd",
                                background: poolData.cloroEnabled ? "#eef2ff" : "white",
                                color: poolData.cloroEnabled ? "#667eea" : "#666",
                                cursor: cloroLocked ? "not-allowed" : "pointer",
                                fontSize: "11px",
                                fontWeight: 700,
                                opacity: cloroLocked ? 0.5 : 1,
                              }}
                            >
                              Registro Técnico (Cloro)
                            </button>
                            <span style={{ color: poolData.cloroEnabled ? getChlorineColor(cloroSafe) : "#999" }}>
                              {poolData.cloroEnabled ? cloroSafe.toFixed(1) : "-"}
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
                            disabled={!poolData.cloroEnabled || cloroLocked}
                            style={{ width: "100%", accentColor: getChlorineColor(cloroSafe), opacity: poolData.cloroEnabled && !cloroLocked ? 1 : 0.4 }}
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
