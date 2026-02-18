import React, { Suspense, useEffect, useMemo, useState } from "react";
import {
  deleteAcademicCalendarEvent,
  downloadChamadaPdfReport,
  downloadMultiClassExcelReport,
  getAcademicCalendar,
  getBootstrap,
  getReports,
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
    const parsed = JSON.parse(raw) as Partial<WeatherSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
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
  localStorage.setItem(weatherCacheKey(date), JSON.stringify(snapshot));
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
  const [activeTab, setActiveTab] = useState<"resumo" | "frequencias" | "graficos" | "clima" | "vagas">("resumo");
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
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");
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
  const [summaryProfessorToggle, setSummaryProfessorToggle] = useState<"Daniela" | "Jefferson">("Daniela");

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
    const filteredClasses = classesData.filter(
      (cls) =>
        getSummaryScheduleGroup(cls.turma) === summaryTurmaToggle &&
        normalizeText(cls.professor) === normalizeText(summaryProfessorToggle)
    );

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
  
  const classesByTurma = classesData.reduce<Record<string, ClassStats>>((acc, item) => {
    acc[item.turma] = item;
    return acc;
  }, {});

  const turmas = Array.from(new Set([
    ...classesData.map((c) => c.turma),
    ...studentsSnapshot.map((s) => s.turma).filter(Boolean) as string[],
  ])).sort();

  const vagasResumo = turmas.map((turma) => {
    const meta = classesByTurma[turma];
    const bootstrapMeta = bootstrapClasses.find((item) => item.turmaLabel === turma || item.codigo === turma);
    const total = studentsSnapshot.length > 0
      ? studentsSnapshot.filter((s) => s.turma === turma).length
      : (meta?.alunos.length || 0);
    const capacity = Math.max(0, Number(bootstrapMeta?.capacidade || 0));
    const pct = capacity > 0 ? Math.min(100, Math.round((total / capacity) * 100)) : 0;
    return {
      turma,
      horario: bootstrapMeta?.horario || meta?.horario || "-",
      professor: bootstrapMeta?.professor || meta?.professor || "-",
      nivel: bootstrapMeta?.nivel || meta?.nivel || "-",
      total,
      capacity,
      pct,
    };
  });

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
        <button className={`reports-tab ${activeTab === "frequencias" ? "active" : ""}`} onClick={() => setActiveTab("frequencias")}>
          📅 Frequências
        </button>
        <button className={`reports-tab ${activeTab === "graficos" ? "active" : ""}`} onClick={() => setActiveTab("graficos")}>
          📈 Gráficos
        </button>
        <button className={`reports-tab ${activeTab === "clima" ? "active" : ""}`} onClick={() => setActiveTab("clima")}>
          ☁️ Clima
        </button>
        <button className={`reports-tab ${activeTab === "vagas" ? "active" : ""}`} onClick={() => setActiveTab("vagas")}>
          🏊 Gestão de Vagas
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
                    <h3>Calendário</h3>
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
                      {(["feriado", "ponte", "reuniao", "evento"] as CalendarEventForm["type"][]).map((type) => (
                        <button
                          key={type}
                          className="reports-record-chip"
                          disabled={!selectedCalendarDate}
                          onClick={() => selectedCalendarDate && handleOpenEventModal(selectedCalendarDate, type)}
                        >
                          {type}
                        </button>
                      ))}
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
                <div className="vagas-footer">ano letivo {selectedYear}</div>
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
                  <h3>Aulas previstas x registradas</h3>
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
                      <button
                        type="button"
                        className={`reports-summary-toggle-chip ${summaryProfessorToggle === "Daniela" ? "active" : ""}`}
                        onClick={() => setSummaryProfessorToggle("Daniela")}
                      >
                        Daniela
                      </button>
                      <button
                        type="button"
                        className={`reports-summary-toggle-chip ${summaryProfessorToggle === "Jefferson" ? "active" : ""}`}
                        onClick={() => setSummaryProfessorToggle("Jefferson")}
                      >
                        Jefferson
                      </button>
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
                  <div className="vagas-footer">Eixo Y: horários</div>
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

      {activeTab === "clima" && (
        <div className="reports-section placeholder">
          Módulo em desenvolvimento
        </div>
      )}

      {activeTab === "vagas" && (
        <div className="reports-section">
          <div className="vagas-toolbar">
            <div>
              <strong>Base ativa:</strong> {studentsSnapshot.length > 0 ? "backend (bootstrap)" : "sem dados"}
            </div>
            <button className="btn-secondary" onClick={() => refreshVacanciesSnapshot()}>
              Atualizar
            </button>
          </div>

          <div className="vagas-grid">
            {vagasResumo.map((item) => (
              <div key={item.turma} className="report-card vagas-card">
                <div className="vagas-card-header">
                  <h3>Turma {item.turma}</h3>
                  <span className="vagas-chip">{item.nivel}</span>
                </div>
                <div className="vagas-meta">
                  <span>⏰ {formatHorario(item.horario)}</span>
                  <span>👨‍🏫 {item.professor}</span>
                </div>
                <div className="vagas-metric">
                  <span>{item.total} alunos</span>
                  <span>{item.capacity} vagas</span>
                </div>
                <div className="vagas-bar">
                  <div className="vagas-bar-fill" style={{ width: `${item.pct}%` }} />
                </div>
                <div className="vagas-footer">{item.pct}% ocupada</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
