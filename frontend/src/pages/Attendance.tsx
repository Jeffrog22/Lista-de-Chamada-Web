import React, { useEffect, useMemo, useState } from "react";
import { getPoolLog, getWeather, savePoolLog } from "../api";

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

// Interface para o Log da Piscina (logPiscina.xlsx)
interface PoolLogEntry {
  data: string;
  clima1: string; // Estado (sol, chuvoso, etc)
  clima2: string; // Sensação (calor, frio, etc)
  statusAula: "normal" | "justificada" | "cancelada";
  nota: "aula" | "feriado" | "ponte-feriado" | "reuniao" | "ocorrencia";
  tipoOcorrencia: string;
  tempExterna: string;
  tempPiscina: string;
  cloroPpm: number;
}

// Opções de Clima para a Matriz de Decisão
const WEATHER_ICONS = {
  conditions: ["Sol", "Parcialmente Nublado", "Nublado", "Chuvoso", "Temporal"],
  sensations: ["Calor", "Frio", "Vento", "Agradavel"]
};

// Coordenadas fixas para API (simulação)
// const LAT = "-23.049194";
// const LON = "-47.007278";

type AttendanceHistory = AttendanceRecord[];

export const Attendance: React.FC = () => {
  // MOCK DATA - Estrutura baseada em chamadaBelaVista.xlsx
  const defaultClassOptions: ClassOption[] = [
    { turmaCodigo: "1A", turmaLabel: "1A", horario: "14:00", professor: "Joao Silva", nivel: "Iniciante", diasSemana: ["Terca", "Quinta"] },
    { turmaCodigo: "1B", turmaLabel: "1B", horario: "15:30", professor: "Maria Santos", nivel: "Intermediario", diasSemana: ["Quarta", "Sexta"] },
    { turmaCodigo: "2A", turmaLabel: "2A", horario: "16:30", professor: "Carlos Oliveira", nivel: "Avancado", diasSemana: ["Segunda", "Quarta"] },
    { turmaCodigo: "2B", turmaLabel: "2B", horario: "18:00", professor: "Ana Costa", nivel: "Iniciante", diasSemana: ["Terca", "Quinta"] },
  ];

  const defaultStudentsPerClass: { [key: string]: string[] } = {
    "1A": ["Joao Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa", "Pedro Ferreira"],
    "1B": ["Roberto Alves", "Fernanda Lima", "Lucas Martins", "Beatriz Souza", "Diego Rocha"],
    "2A": ["Amanda Silva", "Felipe Santos", "Juliana Costa", "Marcos Oliveira", "Sophia Pereira"],
    "2B": ["Thiago Mendes", "Camila Silva", "Bruno Costa", "Larissa Santos", "Rafael Lima"],
  };

  const parseDiasSemana = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
      .split(/[;,]|\s+e\s+/i)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const formatHorario = (value: string) => {
    if (!value) return "";
    if (value.includes(":")) return value;
    const digits = value.replace(/\D/g, "");
    if (digits.length === 3) {
      return `0${digits[0]}:${digits.slice(1)}`;
    }
    if (digits.length >= 4) {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }
    return value;
  };

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

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
    const key = getTurmaKey(opt);
    if (!key || !turma) return false;
    return normalizeText(key) === normalizeText(turma);
  };

  const loadFromStorage = () => {
    try {
      const classesStr = localStorage.getItem("activeClasses");
      const studentsStr = localStorage.getItem("activeStudents");
      if (!classesStr || !studentsStr) return null;

      const classes = JSON.parse(classesStr);
      const students = JSON.parse(studentsStr);
      if (!Array.isArray(classes) || !Array.isArray(students)) return null;

      const classOptions: ClassOption[] = classes.map((cls: any) => ({
        turmaCodigo: cls.TurmaCodigo || cls.Turma,
        turmaLabel: cls.Turma,
        horario: cls.Horario,
        professor: cls.Professor,
        nivel: cls.Nivel || "",
        diasSemana: parseDiasSemana(cls.DiasSemana),
      }));

      const studentsPerClass: { [key: string]: string[] } = {};
      students.forEach((student: any) => {
        const key = student.turmaCodigo || student.turma;
        if (!key || !student.nome) return;
        if (!studentsPerClass[key]) {
          studentsPerClass[key] = [];
        }
        studentsPerClass[key].push(student.nome);
      });

      return { classOptions, studentsPerClass };
    } catch {
      return null;
    }
  };

  const stored = loadFromStorage();
  const [classOptions, setClassOptions] = useState<ClassOption[]>(stored?.classOptions || defaultClassOptions);
  const [studentsPerClass, setStudentsPerClass] = useState<{ [key: string]: string[] }>(
    stored?.studentsPerClass || defaultStudentsPerClass
  );

  // STATE
  const emptyClass: ClassOption = {
    turmaCodigo: "",
    turmaLabel: "",
    horario: "",
    professor: "",
    nivel: "",
    diasSemana: [],
  };
  const [selectedTurma, setSelectedTurma] = useState<string>(getTurmaKey(classOptions[0] || emptyClass) || "");
  const [selectedHorario, setSelectedHorario] = useState<string>(classOptions[0]?.horario || "");
  const [selectedProfessor, setSelectedProfessor] = useState<string>(classOptions[0]?.professor || "");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const latest = loadFromStorage();
    if (!latest) return;
    if (latest.classOptions.length > 0) {
      setClassOptions(latest.classOptions);
      setStudentsPerClass(latest.studentsPerClass);
      // selection handled by effects below
    }
  }, []);

  useEffect(() => {
    if (classOptions.length === 0) return;
    const hasTurma = classOptions.some((opt) => isSameTurma(opt, selectedTurma));
    if (!selectedTurma || !hasTurma) {
      const first = classOptions[0];
      setSelectedTurma(getTurmaKey(first) || "");
      setSelectedHorario(first.horario);
      setSelectedProfessor(first.professor);
    }
  }, [classOptions, selectedTurma]);

  useEffect(() => {
    const target = localStorage.getItem("attendanceTargetTurma");
    if (!target) return;
    const match = classOptions.find(
      (opt) => isSameTurma(opt, target) || opt.turmaLabel === target
    );
    if (match) {
      setSelectedTurma(getTurmaKey(match) || "");
      setSelectedHorario(match.horario);
      setSelectedProfessor(match.professor);
    }
    localStorage.removeItem("attendanceTargetTurma");
  }, [classOptions]);

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
    const set = new Set<string>();
    classOptions
      .filter((opt) => isSameTurma(opt, selectedTurma))
      .forEach((opt) => opt.horario && set.add(opt.horario));
    const normalize = (value: string) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return parseInt(digits.slice(0, 4), 10);
      if (digits.length === 3) return parseInt(`0${digits}`, 10);
      return Number.MAX_SAFE_INTEGER;
    };
    return Array.from(set).sort((a, b) => normalize(a) - normalize(b));
  }, [classOptions, selectedTurma]);

  const professorOptions = useMemo(() => {
    const set = new Set<string>();
    classOptions
      .filter((opt) => isSameTurma(opt, selectedTurma) && opt.horario === selectedHorario)
      .forEach((opt) => opt.professor && set.add(opt.professor));
    return Array.from(set);
  }, [classOptions, selectedTurma, selectedHorario]);

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
  }, [professorOptions, selectedProfessor]);

  const selectedClass = useMemo(() => {
    if (classOptions.length === 0) return emptyClass;
    const exact = classOptions.find(
      (opt) =>
        isSameTurma(opt, selectedTurma) &&
        opt.horario === selectedHorario &&
        opt.professor === selectedProfessor
    );
    if (exact) return exact;
    const byHorario = classOptions.find(
      (opt) => isSameTurma(opt, selectedTurma) && opt.horario === selectedHorario
    );
    if (byHorario) return byHorario;
    const byTurma = classOptions.find((opt) => isSameTurma(opt, selectedTurma));
    return byTurma || classOptions[0] || emptyClass;
  }, [classOptions, selectedTurma, selectedHorario, selectedProfessor]);

  // Gerar datas pré-determinadas baseadas no dia da semana (DEFINIR ANTES DO STATE)
  const generateDates = (daysOfWeek: string[]) => {
    const dates = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

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
  const availableDates = generateDates(resolvedDiasSemana);
  const dateDates = availableDates.map((d) => d.split(" ")[0]); // Pega apenas a data (YYYY-MM-DD)

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
  const [history, setHistory] = useState<AttendanceHistory[]>([]);

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
  
  // Dados do Formulário do Modal
  const [poolData, setPoolData] = useState({
    tempExterna: "",
    tempPiscina: "",
    cloro: 1.5,
    cloroEnabled: true,
    selectedIcons: [] as string[],
    incidentType: "",
    incidentNote: "",
    personalType: "Medico" as "Medico" | "Particular",
    logType: "aula" as PoolLogEntry["nota"]
  });

  // Simulação da API Climatempo
  const fetchClimatempoData = async (date: string) => {
    try {
      const response = await getWeather(date);
      return response.data as { temp: string; condition: string };
    } catch (error) {
      return { temp: "26", condition: "Parcialmente Nublado" };
    }
  };

  const handleDateClick = async (date: string) => {
    setSelectedDate(date);
    setModalDate(date);
    setModalStep("select");
    
    // Resetar dados
    setPoolData(prev => ({
      ...prev,
      tempPiscina: "",
      cloro: 1.5,
      cloroEnabled: true,
      selectedIcons: [],
      incidentType: "",
      incidentNote: "",
      logType: "aula"
    }));

    try {
      const existing = await getPoolLog(date);
      const data = existing.data as {
        clima1: string;
        clima2: string;
        nota: string;
        tipoOcorrencia: string;
        tempExterna: string;
        tempPiscina: string;
        cloroPpm: number | null;
      };

      const icons = [
        ...(data.clima1 ? data.clima1.split(", ") : []),
        ...(data.clima2 ? data.clima2.split(", ") : []),
      ].filter(Boolean);

      const cloroValue = data.cloroPpm;
      const cloroEnabled = typeof cloroValue === "number" && Number.isFinite(cloroValue);
      setPoolData(prev => ({
        ...prev,
        tempExterna: data.tempExterna || "",
        tempPiscina: data.tempPiscina || "",
        cloro: cloroEnabled ? cloroValue : 1.5,
        cloroEnabled,
        selectedIcons: icons,
        incidentType: data.nota === "ocorrencia" ? data.tipoOcorrencia : "",
        incidentNote: "",
        logType: (data.nota as PoolLogEntry["nota"]) || "aula",
      }));

      if (data.nota === "ocorrencia") {
        setModalStep("ocorrencia");
      } else if (data.nota === "aula") {
        setModalStep("aula");
      } else {
        setModalStep("select");
      }

      setShowDateModal(true);
      return;
    } catch (error) {
      // Continua com prefill via clima
    }

    // Pré-carregar dados da API
    const apiData = await fetchClimatempoData(date);
    
    // Mapeamento Automático (API -> Ícones)
    const autoIcons: string[] = [];
    if (apiData.condition === "Ceu Limpo") autoIcons.push("Sol");
    if (apiData.condition === "Chuva Fraca") autoIcons.push("Chuvoso");
    if (apiData.condition.includes("Nublado")) autoIcons.push("Nublado");
    
    // Inferência de sensação baseada na temperatura
    const tempNum = parseInt(apiData.temp);
    if (tempNum > 28) autoIcons.push("Calor");
    else if (tempNum < 20) autoIcons.push("Frio");
    else autoIcons.push("Agradavel");

    setPoolData(prev => ({
      ...prev,
      tempExterna: apiData.temp,
      selectedIcons: autoIcons.slice(0, 2) // Limitar a 2 ícones iniciais
    }));

    setShowDateModal(true);
  };

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
    const { selectedIcons } = poolData;
    const i = selectedIcons;
    
    // Regras de Justificativa (Prioridade)
    const justifiedTriggers = ["Chuvoso", "Temporal", "Frio"];
    if (i.some(icon => justifiedTriggers.includes(icon))) return "justificada";
    
    // Combinações específicas
    if (i.includes("Sol") && i.includes("Chuvoso")) return "justificada";
    if (i.includes("Parcialmente Nublado") && (i.includes("Chuvoso") || i.includes("Temporal") || i.includes("Vento"))) return "justificada";
    if (i.includes("Nublado") || i.includes("Vento")) return "justificada";

    return "normal";
  };

  const handleSaveLog = async () => {
    const statusSugerido = getSuggestedStatus();
    
    // Lógica para Feriado/Ponte/Justificada
    if (["feriado", "ponte-feriado"].includes(poolData.logType) || (poolData.logType === "aula" && statusSugerido === "justificada")) {
      // Aplicar justificativa em massa
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      setAttendance(prev => prev.map(student => ({
        ...student,
        attendance: { ...student.attendance, [modalDate]: "Justificado" },
        justifications: { 
          ...(student.justifications || {}), 
          [modalDate]: poolData.logType === "aula" ? "Condicoes Climaticas" : poolData.logType 
        }
      })));
    }

    // Construção do Objeto de Log (Persistência)
    const logEntry: PoolLogEntry = {
      data: modalDate,
      clima1: poolData.selectedIcons.filter(i => WEATHER_ICONS.conditions.includes(i)).join(", "),
      clima2: poolData.selectedIcons.filter(i => WEATHER_ICONS.sensations.includes(i)).join(", "),
      statusAula: poolData.logType === "aula" ? statusSugerido : "cancelada",
      nota: poolData.logType,
      tipoOcorrencia: poolData.logType === "ocorrencia" ? 
        (poolData.incidentType || poolData.personalType) : "nenhuma",
      tempExterna: poolData.tempExterna || "",
      tempPiscina: poolData.tempPiscina || "",
      cloroPpm: poolData.cloroEnabled ? poolData.cloro : null,
    };

    try {
      await savePoolLog(logEntry);
      alert(`Dados salvos! Status da aula: ${logEntry.statusAula.toUpperCase()}`);
    } catch (error) {
      alert("Erro ao salvar dados do clima. Tente novamente.");
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

  const handleOpenStudentModal = (id: number) => {
    setStudentModalId(id);
    setNewNote("");
    setStudentModalOpen(true);
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
    const now = new Date();
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
    return `${months[now.getMonth()]}/${now.getFullYear()}`;
  })();

  const selectedDaysKey = selectedClass.diasSemana.join("|");
  useEffect(() => {
    const turmaLookup = selectedClass.turmaCodigo || selectedClass.turmaLabel;
    if (!turmaLookup) return;
    const newDates = generateDates(selectedClass.diasSemana).map((d) => d.split(" ")[0]);

    // Resetar histórico ao mudar de turma/horário/professor para evitar inconsistências
    setHistory([]);

    setAttendance(
      (studentsPerClass[turmaLookup] || []).map((aluno, idx) => ({
        id: idx + 1,
        aluno,
        attendance: newDates.reduce(
          (acc, date) => {
            acc[date] = "";
            return acc;
          },
          {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
        ),
      }))
    );
  }, [selectedTurma, selectedClass.horario, selectedClass.professor, selectedDaysKey, studentsPerClass]);

  // Ciclar entre os 4 estados
  const cycleStatus = (currentStatus: "Presente" | "Falta" | "Justificado" | "") => {
    const cycle = ["Presente", "Falta", "Justificado", ""];
    const nextIndex = (cycle.indexOf(currentStatus) + 1) % cycle.length;
    return cycle[nextIndex] as "Presente" | "Falta" | "Justificado" | "";
  };

  const handleStatusChange = (id: number, date: string) => {
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
      setHistory((h) => [JSON.parse(JSON.stringify(attendance)), ...h.slice(0, 9)]);
      setAttendance((prev) => prev.filter((student) => student.id !== id));
    }
  };

  // Função de Justificativa: Abre o modal de notação
  const adicionarJustificativa = (id: number) => {
    setJustificationStudentId(id);
    setJustificationDay("");
    setJustificationReason("");
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
  };

  const handleSave = () => {
    console.log("Salvando chamada:", {
      turma: selectedClass.turmaLabel || selectedClass.turmaCodigo,
      horario: selectedClass.horario,
      professor: selectedClass.professor,
      data: selectedDate,
      attendance,
    });
    alert("Chamada salva com sucesso! (Demo)");
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
            Horário
          </label>
          <select
            value={selectedHorario}
            onChange={(e) => setSelectedHorario(e.target.value)}
            disabled={!selectedTurma || horarioOptions.length === 0}
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
            Professor
          </label>
          <select
            value={selectedProfessor}
            onChange={(e) => setSelectedProfessor(e.target.value)}
            disabled={!selectedHorario || professorOptions.length === 0}
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
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold", minWidth: "150px" }}>
                  Aluno
                </th>
                {dateDates.map((date) => {
                  const dayNum = date.split("-")[2];
                  const isSelected = date === selectedDate;
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
                        background: isSelected ? "rgba(255, 255, 255, 0.2)" : "transparent",
                      }}
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
              {attendance.map((item, idx) => {
                const absences = Object.values(item.attendance).filter((s) => s === "Falta").length;
                const showNote = Object.values(item.attendance).some((s) => s === "Falta" || s === "Justificado");
                const showDelete = absences >= 3;
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
                    onClick={() => handleOpenStudentModal(item.id)}
                    title="Clique para ver/adicionar anotações"
                  >
                    <span style={{ borderBottom: "1px dashed #ccc" }}>{item.aluno}</span>
                  </td>
                  {dateDates.map((date) => {
                    const status = item.attendance[date];
                    let buttonLabel = "-";
                    let buttonColor = "#e8e8e8";
                    let buttonTextColor = "#666";

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
                          style={{
                            background: buttonColor,
                            color: buttonTextColor,
                            border: "1px solid #ddd",
                            padding: "8px 14px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: "14px",
                            transition: "all 0.15s ease",
                            minWidth: "50px",
                            height: "38px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: "1",
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLButtonElement).style.transform = "scale(1)";
                          }}
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
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{activeStudentForNotes.aluno}</h3>
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
          <div style={{ background: "white", padding: "25px", borderRadius: "16px", width: "450px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#2c3e50" }}>
                {modalDate.split("-").reverse().join("/")}
                {modalStep !== "select" && <span style={{ fontSize: "14px", color: "#666", marginLeft: "10px" }}>({poolData.logType.toUpperCase()})</span>}
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
                  onClick={() => { setPoolData(p => ({...p, logType: "ocorrencia"})); setModalStep("ocorrencia"); }}>
                  ⚠️ Ocorrência
                </button>
                <button className="btn-option" style={{ background: "#17a2b8", color: "white", padding: "15px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setPoolData(p => ({...p, logType: "feriado"})); handleSaveLog(); }}>
                  🎉 Feriado
                </button>
                <button className="btn-option" style={{ background: "#6c757d", color: "white", padding: "15px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setPoolData(p => ({...p, logType: "ponte-feriado"})); handleSaveLog(); }}>
                  🌉 Ponte
                </button>
                <button className="btn-option" style={{ gridColumn: "1 / -1", background: "#28a745", color: "white", padding: "15px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => { setPoolData(p => ({...p, logType: "reuniao"})); handleSaveLog(); }}>
                  🤝 Reunião
                </button>
              </div>
            )}

            {/* NÍVEL 2: AULA (CARD CLIMA) */}
            {modalStep === "aula" && (
              <div className="card-clima">
                <h4 style={{ marginTop: 0, color: "#444" }}>🌤️ Clima e Sensação</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "15px" }}>
                  {[...WEATHER_ICONS.conditions, ...WEATHER_ICONS.sensations].map(icon => (
                    <button
                      key={icon}
                      onClick={() => toggleIcon(icon)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: poolData.selectedIcons.includes(icon) ? "2px solid #667eea" : "1px solid #ddd",
                        background: poolData.selectedIcons.includes(icon) ? "#eef2ff" : "white",
                        color: poolData.selectedIcons.includes(icon) ? "#667eea" : "#666",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600
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
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "bold", color: "#666" }}>
                    <button
                      type="button"
                      onClick={() => setPoolData({ ...poolData, cloroEnabled: !poolData.cloroEnabled })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "14px",
                        border: poolData.cloroEnabled ? "2px solid #667eea" : "1px solid #ddd",
                        background: poolData.cloroEnabled ? "#eef2ff" : "white",
                        color: poolData.cloroEnabled ? "#667eea" : "#666",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      Cloro (ppm)
                    </button>
                    <span style={{ color: poolData.cloroEnabled ? getChlorineColor(poolData.cloro) : "#999" }}>
                      {poolData.cloroEnabled ? poolData.cloro.toFixed(1) : "-"}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0" max="7" step="0.5"
                    value={poolData.cloro}
                    onChange={e => setPoolData({...poolData, cloro: parseFloat(e.target.value)})}
                    disabled={!poolData.cloroEnabled}
                    style={{ width: "100%", accentColor: getChlorineColor(poolData.cloro), opacity: poolData.cloroEnabled ? 1 : 0.4 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#999" }}>
                    <span>0.0</span><span>3.5</span><span>7.0</span>
                  </div>
                </div>

                <div style={{ background: getSuggestedStatus() === "justificada" ? "#fff3cd" : "#d4edda", padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px", textAlign: "center", border: "1px solid rgba(0,0,0,0.1)" }}>
                  Status Sugerido: <strong>{getSuggestedStatus() === "justificada" ? "FALTA JUSTIFICADA" : "AULA NORMAL"}</strong>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setModalStep("select")} style={{ flex: 1, padding: "10px", border: "1px solid #ccc", borderRadius: "6px", background: "white", cursor: "pointer" }}>Voltar</button>
                  <button onClick={handleSaveLog} style={{ flex: 2, padding: "10px", border: "none", borderRadius: "6px", background: "#667eea", color: "white", fontWeight: "bold", cursor: "pointer" }}>Salvar Dados</button>
                </div>
              </div>
            )}

            {/* NÍVEL 2: OCORRÊNCIA (CARD BO) */}
            {modalStep === "ocorrencia" && (
              <div className="card-bo">
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "5px" }}>Tipo de Ocorrência</label>
                  <select 
                    value={poolData.incidentType} 
                    onChange={e => setPoolData({...poolData, incidentType: e.target.value})}
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
                <div style={{ marginBottom: "20px", borderTop: "1px solid #eee", paddingTop: "15px" }}>
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "bold", color: "#666", marginBottom: "5px" }}>
                    <button
                      type="button"
                      onClick={() => setPoolData({ ...poolData, cloroEnabled: !poolData.cloroEnabled })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "14px",
                        border: poolData.cloroEnabled ? "2px solid #667eea" : "1px solid #ddd",
                        background: poolData.cloroEnabled ? "#eef2ff" : "white",
                        color: poolData.cloroEnabled ? "#667eea" : "#666",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      Registro Técnico (Cloro)
                    </button>
                    <span style={{ color: poolData.cloroEnabled ? getChlorineColor(poolData.cloro) : "#999" }}>
                      {poolData.cloroEnabled ? poolData.cloro.toFixed(1) : "-"}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0" max="7" step="0.5"
                    value={poolData.cloro}
                    onChange={e => setPoolData({...poolData, cloro: parseFloat(e.target.value)})}
                    disabled={!poolData.cloroEnabled}
                    style={{ width: "100%", accentColor: getChlorineColor(poolData.cloro), opacity: poolData.cloroEnabled ? 1 : 0.4 }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setModalStep("select")} style={{ flex: 1, padding: "10px", border: "1px solid #ccc", borderRadius: "6px", background: "white", cursor: "pointer" }}>Voltar</button>
                  <button onClick={handleSaveLog} style={{ flex: 2, padding: "10px", border: "none", borderRadius: "6px", background: "#dc3545", color: "white", fontWeight: "bold", cursor: "pointer" }}>Registrar Ocorrência</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
