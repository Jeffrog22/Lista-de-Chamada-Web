import React, { useEffect, useRef, useState } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { addExclusion, addExclusionsBulk, bulkAllocateImportStudents, createImportStudent, getBootstrap, getExcludedStudents, updateImportStudent } from "../api";
import { mapBootstrapForStorage } from "../utils/bootstrapMapping";

interface Student {
  id: string;
  studentUid?: string;
  grupo?: string;
  nome: string;
  nivel: string;
  idade: number;
  categoria: string;
  turma: string;
  turmaCodigo?: string;
  turmaLabel?: string;
  horario: string;
  professor: string;
  whatsapp: string;
  genero: string;
  dataNascimento: string;
  parQ: string;
  atestado: boolean;
  dataAtestado?: string;
}

interface AllocationTarget {
  turma: string;
  horario: string;
  professor: string;
  turmaCodigo?: string;
}

const WhatsappButton: React.FC<{ phoneNumber: string }> = ({ phoneNumber }) => {
  const handleClick = () => {
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (cleanNumber) {
      window.open(`https://wa.me/55${cleanNumber}`, "_blank");
    } else {
      alert("Número inválido para WhatsApp");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Abrir WhatsApp"
      style={{
        background: "#25D366",
        color: "white",
        border: "none",
        borderRadius: "6px",
        width: "42px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
      }}
    >
      📱
    </button>
  );
};

export const Students: React.FC = () => {
  const exclusionReasonOptions = ["Falta", "Desistência", "Transferência", "Documentação"];

  // utilitários simples para trabalhar com alunos
  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const nameParticles = new Set(["da", "de", "do", "das", "dos", "e"]);

  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => {
    const byWidth = window.innerWidth <= 768;
    const byLandscapePhone = window.innerWidth <= 1024 && window.innerHeight <= 500;
    return byWidth || byLandscapePhone;
  });

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

  const normalizeHorarioKey = (value: string) => {
    const digits = (value || "").replace(/\D/g, "");
    if (digits.length === 3) return `0${digits}`;
    if (digits.length >= 4) return digits.slice(0, 4);
    return digits;
  };

  const buildStudentKey = (student: Partial<Student>) => {
    const nameKey = normalizeText(student.nome || "");
    const turmaKey = normalizeText(student.turmaLabel || student.turma || student.turmaCodigo || "");
    const professorKey = normalizeText(student.professor || "");
    const horarioKey = normalizeHorarioKey(student.horario || "");
    const birthKey = (student.dataNascimento || "").trim();
    const whatsappKey = (student.whatsapp || "").replace(/\D/g, "");
    return `${nameKey}|${turmaKey}|${horarioKey}|${professorKey}|${birthKey}|${whatsappKey}`;
  };

  const exclusionUid = (entry: any) => String(entry?.student_uid || entry?.studentUid || "").trim();

  const exclusionId = (entry: any) => String(entry?.id || "").trim();

  const exclusionName = (entry: any) => normalizeText(entry?.nome || entry?.Nome || "");

  const exclusionTurmaSet = (entry: any) => {
    const values = [
      entry?.turma,
      entry?.Turma,
      entry?.turmaLabel,
      entry?.TurmaLabel,
      entry?.turmaCodigo,
      entry?.TurmaCodigo,
      entry?.grupo,
      entry?.Grupo,
    ]
      .map((value) => normalizeText(String(value || "")))
      .filter(Boolean);
    return new Set(values);
  };

  const exclusionsMatch = (left: any, right: any) => {
    const leftUid = exclusionUid(left);
    const rightUid = exclusionUid(right);
    if (leftUid && rightUid && leftUid === rightUid) return true;

    const leftId = exclusionId(left);
    const rightId = exclusionId(right);
    if (leftId && rightId && leftId === rightId) return true;

    const leftName = exclusionName(left);
    const rightName = exclusionName(right);
    if (!leftName || !rightName || leftName !== rightName) return false;

    const leftTurmas = exclusionTurmaSet(left);
    const rightTurmas = exclusionTurmaSet(right);
    const hasTurmaContext = leftTurmas.size > 0 && rightTurmas.size > 0;
    const turmaMatches =
      !hasTurmaContext ||
      Array.from(leftTurmas).some((value) => rightTurmas.has(value));
    if (!turmaMatches) return false;

    const leftHorario = normalizeHorarioKey(left?.horario || left?.Horario || "");
    const rightHorario = normalizeHorarioKey(right?.horario || right?.Horario || "");
    const hasHorarioContext = Boolean(leftHorario && rightHorario);
    if (hasHorarioContext && leftHorario !== rightHorario) return false;

    const leftProfessor = normalizeText(left?.professor || left?.Professor || "");
    const rightProfessor = normalizeText(right?.professor || right?.Professor || "");
    const hasProfessorContext = Boolean(leftProfessor && rightProfessor);
    if (hasProfessorContext && leftProfessor !== rightProfessor) return false;

    return hasTurmaContext || hasHorarioContext || hasProfessorContext;
  };

  const isStudentExcluded = (student: Student, records: any[]) => {
    const comparable = {
      id: student.id,
      student_uid: student.studentUid || "",
      nome: student.nome,
      turma: student.turma,
      turmaLabel: student.turmaLabel,
      turmaCodigo: student.turmaCodigo,
      horario: student.horario,
      professor: student.professor,
    };
    return (records || []).some((record) => exclusionsMatch(record, comparable));
  };

  const sanitizeExcludedRecords = (records: any[]) => {
    const source = Array.isArray(records) ? records : [];
    const cleaned: any[] = [];
    source.forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const item = {
        ...raw,
        horario: normalizeHorarioKey(raw?.horario || raw?.Horario || ""),
      };
      if (!exclusionUid(item) && !exclusionName(item)) return;

      const existingIndex = cleaned.findIndex((candidate) => exclusionsMatch(candidate, item));
      if (existingIndex >= 0) {
        cleaned[existingIndex] = { ...cleaned[existingIndex], ...item };
      } else {
        cleaned.push(item);
      }
    });
    return cleaned;
  };

  const transferHistoryStorageKey = "studentTransferHistory";

  const saveTransferHistory = (entry: {
    nome: string;
    fromNivel: string;
    toNivel: string;
    fromTurma?: string;
    toTurma?: string;
    fromHorario?: string;
    toHorario?: string;
    fromProfessor?: string;
    toProfessor?: string;
    effectiveDate: string;
  }) => {
    try {
      const raw = localStorage.getItem(transferHistoryStorageKey);
      const current = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(current) ? current : [];

      const normalizedEntry = {
        ...entry,
        nome: String(entry.nome || "").trim(),
        fromNivel: String(entry.fromNivel || "").trim(),
        toNivel: String(entry.toNivel || "").trim(),
        fromTurma: String(entry.fromTurma || "").trim(),
        toTurma: String(entry.toTurma || "").trim(),
        fromHorario: String(entry.fromHorario || "").trim(),
        toHorario: String(entry.toHorario || "").trim(),
        fromProfessor: String(entry.fromProfessor || "").trim(),
        toProfessor: String(entry.toProfessor || "").trim(),
        effectiveDate: String(entry.effectiveDate || "").trim(),
      };

      const dedupeKey = [
        normalizeText(normalizedEntry.nome),
        normalizeText(normalizedEntry.fromNivel),
        normalizeText(normalizedEntry.toNivel),
        normalizeText(normalizedEntry.toTurma),
        normalizeHorarioKey(normalizedEntry.toHorario),
        normalizeText(normalizedEntry.toProfessor),
        normalizedEntry.effectiveDate,
      ].join("|");

      const filtered = list.filter((item: any) => {
        const key = [
          normalizeText(item?.nome || ""),
          normalizeText(item?.fromNivel || ""),
          normalizeText(item?.toNivel || ""),
          normalizeText(item?.toTurma || ""),
          normalizeHorarioKey(item?.toHorario || ""),
          normalizeText(item?.toProfessor || ""),
          String(item?.effectiveDate || "").trim(),
        ].join("|");
        return key !== dedupeKey;
      });

      filtered.push(normalizedEntry);
      localStorage.setItem(transferHistoryStorageKey, JSON.stringify(filtered));
    } catch {
      // ignore storage failures
    }
  };

  const clearTransferHistoryForNames = (names: string[]) => {
    try {
      const normalizedNames = new Set(
        names
          .map((name) => normalizeText(String(name || "")))
          .filter(Boolean)
      );
      if (normalizedNames.size === 0) return;

      const raw = localStorage.getItem(transferHistoryStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      const filtered = list.filter((entry: any) => !normalizedNames.has(normalizeText(entry?.nome || "")));
      localStorage.setItem(transferHistoryStorageKey, JSON.stringify(filtered));
    } catch {
      // ignore storage failures
    }
  };


  const dedupeStudents = (list: Student[]) => {
    const seen = new Map<string, Student>();
    list.forEach((student) => {
      const key = buildStudentKey(student);
      if (!seen.has(key)) {
        seen.set(key, student);
      }
    });
    return Array.from(seen.values());
  };
  const [students, setStudents] = useState<Student[]>([]);
  const [allocationTarget, setAllocationTarget] = useState<AllocationTarget | null>(null);
  const [bulkExcludeMode, setBulkExcludeMode] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [isAllocatingBulk, setIsAllocatingBulk] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [excludedRecords, setExcludedRecords] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem("excludedStudents");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [professorOptions, setProfessorOptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const lookup = localStorage.getItem("studentLookupName");
    if (!lookup) return;
    setSearchTerm(lookup);
    localStorage.removeItem("studentLookupName");
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("studentAllocationTarget");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.turma && parsed.horario && parsed.professor) {
        setAllocationTarget({
          turma: String(parsed.turma || ""),
          horario: String(parsed.horario || ""),
          professor: String(parsed.professor || ""),
          turmaCodigo: String(parsed.turmaCodigo || ""),
        });
      }
      localStorage.removeItem("studentAllocationTarget");
    } catch {
      localStorage.removeItem("studentAllocationTarget");
    }
  }, []);
  // helper moved up so horarioOptions can reference it without hoisting issues
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

  const compareHorario = (a: string, b: string) => {
    const normalize = (value: string) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return parseInt(digits.slice(0, 4), 10);
      if (digits.length === 3) return parseInt(`0${digits}`, 10);
      if (digits.length === 2) return parseInt(`${digits}00`, 10);
      return Number.MAX_SAFE_INTEGER;
    };
    return normalize(a) - normalize(b);
  };

  const getTurmaDisplayLabel = (student: Student) => student.turmaLabel || student.turma;

  const turmaOptions = React.useMemo(() => {
    try {
      const raw = localStorage.getItem("activeClasses");
      if (raw) {
        const classes = JSON.parse(raw) as Array<{ Turma?: string }>;
        const labels = Array.from(new Set(classes.map((cls) => (cls.Turma || "").trim()).filter(Boolean)));
        if (labels.length > 0) return labels.sort();
      }
    } catch {
      // ignore
    }
    return Array.from(new Set(students.map(getTurmaDisplayLabel))).sort();
  }, [students]);
  const categoriaOptions = React.useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => s.categoria && set.add(s.categoria));
    return Array.from(set).sort();
  }, [students]);
  // filters accumulate in header
  const [filters, setFilters] = useState<{
    nivel: string;
    categoria: string;
    turma: string;
    horario: string;
    professor: string;
  }>({ nivel: "", categoria: "", turma: "", horario: "", professor: "" });
  const horarioOptions = React.useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const h = formatHorario(s.horario || "");
      if (h) set.add(h);
    });
    return Array.from(set).sort(compareHorario);
  }, [students]);

  useEffect(() => {
    localStorage.setItem("activeStudents", JSON.stringify(students));
    window.dispatchEvent(new Event("attendanceDataUpdated"));
  }, [students]);

  useEffect(() => {
    let isMounted = true;
    getExcludedStudents()
      .then((response) => {
        if (!isMounted) return;
        const fromFallback = Boolean((response as any)?._fromFallback);
        const remote = sanitizeExcludedRecords(Array.isArray(response?.data) ? response.data : []);
        if (!fromFallback) {
          setExcludedRecords(remote);
          localStorage.setItem("excludedStudents", JSON.stringify(remote));
          return;
        }
        try {
          const raw = localStorage.getItem("excludedStudents");
          const parsed = raw ? JSON.parse(raw) : [];
          const local = sanitizeExcludedRecords(Array.isArray(parsed) ? parsed : []);
          setExcludedRecords(local);
          localStorage.setItem("excludedStudents", JSON.stringify(local));
        } catch {
          setExcludedRecords([]);
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem("excludedStudents");
          const parsed = raw ? JSON.parse(raw) : [];
          const local = sanitizeExcludedRecords(Array.isArray(parsed) ? parsed : []);
          setExcludedRecords(local);
          localStorage.setItem("excludedStudents", JSON.stringify(local));
        } catch {
          setExcludedRecords([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getBootstrap()
      .then((response) => {
        if (!isMounted) return;
        const data = response.data as {
          classes: Array<{
            id: number;
            grupo?: string;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            faixa_etaria: string;
            capacidade: number;
            dias_semana: string;
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

        const { mappedStudents, mappedClasses } = mapBootstrapForStorage(data, calculateAge);
        const mapped = mappedStudents as Student[];

        const finalList = dedupeStudents(mapped);
        setStudents(finalList);
        localStorage.setItem("activeStudents", JSON.stringify(finalList));

        const classStorage = mappedClasses;
        if (classStorage.length > 0) {
          localStorage.setItem("activeClasses", JSON.stringify(classStorage));
          const professors: string[] = Array.from(
            new Set<string>(
              classStorage
                .map((cls: any) => String(cls?.Professor || "").trim())
                .filter((value: string) => Boolean(value))
            )
          );
          setProfessorOptions(professors);
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem("activeStudents");
          if (!saved) return;
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setStudents(dedupeStudents(parsed));
          }
        } catch {
          // ignore malformed storage
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (professorOptions.length > 0) return;
    try {
      const raw = localStorage.getItem("activeClasses");
      if (!raw) return;
      const classes = JSON.parse(raw) as Array<{ Professor?: string }>;
      const professors = Array.from(
        new Set(classes.map((cls) => cls.Professor).filter((value): value is string => Boolean(value)))
      );
      setProfessorOptions(professors);
    } catch {
      // ignore
    }
  }, [professorOptions.length]);

  useEffect(() => {
    setSelectedPendingIds([]);
  }, [allocationTarget]);

  const [sortKey, setSortKey] = useState<    "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showModal, setShowModal] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [editMovementType, setEditMovementType] = useState<"correction" | "transfer">("correction");
  const [minAgeError, setMinAgeError] = useState<string>("");
  const [showExcludeReasonModal, setShowExcludeReasonModal] = useState(false);
  const [studentPendingExclusion, setStudentPendingExclusion] = useState<Student | null>(null);
  const [excludeReason, setExcludeReason] = useState("");

  // Estado do formulário
  const [formData, setFormData] = useState({
    nome: "",
    dataNascimento: "",
    genero: "Masculino",
    whatsapp: "",
    turma: "",
    horario: "",
    professor: "",
    nivel: "Iniciante",
    categoria: "Juvenil",
    parQ: "Não",
    atestado: false,
    dataAtestado: ""
  });

  // Scroll modal to top when opening
  useEffect(() => {
    if (showModal && modalContentRef.current) {
      modalContentRef.current.scrollTop = 0;
      // Auto-focus edit button if viewing existing student
      if (editingId && !isEditing) {
        const editBtn = Array.from(modalContentRef.current.querySelectorAll("button")).find((btn) =>
          String(btn.textContent || "").includes("Editar")
        ) as HTMLButtonElement | undefined;
        if (editBtn) {
          setTimeout(() => editBtn.focus(), 50);
        }
      }
    }
  }, [showModal, editingId, isEditing]);

  // Carregar dados persistentes (sticky) ao iniciar
  useEffect(() => {
    const sticky = localStorage.getItem("studentStickyData");
    if (sticky) {
      const parsed = JSON.parse(sticky);
      setFormData((prev) => ({
        ...prev,
        turma: parsed.turma || "",
        horario: parsed.horario || "",
        professor: parsed.professor || "",
        parQ: parsed.parQ || "Não",
        genero: parsed.genero || prev.genero,
      }));
    }
  }, []);

  const calculateAge = (dateString: string) => {
    if (!dateString) return 0;
    const [day, month, year] = dateString.split("/").map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return isNaN(age) ? 0 : age;
  };

  const parseBirthDate = (value: string) => {
    const [day, month, year] = value.split("/").map(Number);
    if (!day || !month || !year) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  };

  const categoriaRules = [
    { min: 6, label: "Pré-Mirim" },
    { min: 9, label: "Mirim I" },
    { min: 10, label: "Mirim II" },
    { min: 11, label: "Petiz I" },
    { min: 12, label: "Petiz II" },
    { min: 13, label: "Infantil I" },
    { min: 14, label: "Infantil II" },
    { min: 15, label: "Juvenil I" },
    { min: 16, label: "Juvenil II" },
    { min: 17, label: "Júnior I" },
    { min: 18, label: "Júnior II/Sênior" },
    { min: 20, label: "A20+" },
    { min: 25, label: "B25+" },
    { min: 30, label: "C30+" },
    { min: 35, label: "D35+" },
    { min: 40, label: "E40+" },
    { min: 45, label: "F45+" },
    { min: 50, label: "G50+" },
    { min: 55, label: "H55+" },
    { min: 60, label: "I60+" },
    { min: 65, label: "J65+" },
    { min: 70, label: "K70+" },
  ];

  const getCategoriaByAge = (age: number) => {
    if (!Number.isFinite(age)) return "";
    if (age < 6) return "";
    let result = "";
    for (const rule of categoriaRules) {
      if (age >= rule.min) result = rule.label;
    }
    return result;
  };

  const maskDateInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const maskWhatsappInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const findClassFromTriple = (turma: string, horario: string, professor: string) => {
    try {
      const raw = localStorage.getItem("activeClasses");
      if (!raw) return null;
      const classes = JSON.parse(raw) as Array<{
        Grupo?: string;
        Turma?: string;
        TurmaCodigo?: string;
        Horario?: string;
        Professor?: string;
        Nivel?: string;
      }>;
      const turmaNorm = normalizeText(turma || "");
      const professorNorm = normalizeText(professor || "");
      const horarioNorm = (value: string) => {
        const digits = (value || "").replace(/\D/g, "");
        if (digits.length === 3) return `0${digits}`;
        if (digits.length >= 4) return digits.slice(0, 4);
        return digits;
      };
      const horarioKey = horarioNorm(horario || "");
      const match = classes.find((cls) => {
        const turmaKey = cls.Grupo || cls.TurmaCodigo || "";
        const turmaLabel = cls.Turma || "";
        if (!horarioKey || !professorNorm) return false;
        const turmaKeyNorm = normalizeText(turmaKey);
        const turmaLabelNorm = normalizeText(turmaLabel);
        const turmaMatch = turmaNorm && (turmaNorm === turmaKeyNorm || turmaNorm === turmaLabelNorm);
        const clsHorario = horarioNorm(cls.Horario || "");
        const clsProfessor = normalizeText(cls.Professor || "");
        return turmaMatch && clsHorario === horarioKey && clsProfessor === professorNorm;
      });
      return match || null;
    } catch {
      return null;
    }
  };

  const getNivelFromClasses = (turma: string, horario: string, professor: string) => {
    const match = findClassFromTriple(turma, horario, professor);
    return match?.Nivel || "";
  };

  const getTurmaCodigoFromClasses = (turma: string, horario: string, professor: string) => {
    try {
      const match = findClassFromTriple(turma, horario, professor);
      return match?.TurmaCodigo || turma;
    } catch {
      return turma;
    }
  };

  const getTurmaLabelFromClasses = (turma: string, horario: string, professor: string) => {
    const match = findClassFromTriple(turma, horario, professor);
    return match?.Turma || turma;
  };

  const nivelOrder = [
    "Iniciação B",
    "Iniciação A",
    "Nível 1",
    "Nível 2",
    "Nível 3",
    "Nível 4",
    "Adulto B",
    "Adulto A",
  ];

  const categoriaOrder = [
    "Pré-Mirim",
    "Mirim I",
    "Mirim II",
    "Petiz I",
    "Petiz II",
    "Infantil I",
    "Infantil II",
    "Juvenil I",
    "Juvenil II",
    "Júnior I",
    "Júnior II/Sênior",
    "A20+",
    "B25+",
    "C30+",
    "D35+",
    "E40+",
    "F45+",
    "G50+",
    "H55+",
    "I60+",
    "J65+",
    "K70+",
  ];

  const getNivelRank = (nivel: string) => {
    const normalized = normalizeText(nivel);
    const idx = nivelOrder.findIndex((item) => normalizeText(item) === normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };

  const getCategoriaRank = (categoria: string) => {
    const normalized = normalizeText(categoria);
    const idx = categoriaOrder.findIndex((item) => normalizeText(item) === normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    let newValue: string | boolean = type === "checkbox" ? checked : value;

    setFormData((prev) => {
      if (name === "horario" && typeof newValue === "string") {
        const masked = maskHorarioInput(newValue);
        if (!isValidHorarioPartial(masked)) {
          return prev;
        }
        newValue = masked;
      }

      if ((name === "dataNascimento" || name === "dataAtestado") && typeof newValue === "string") {
        newValue = maskDateInput(newValue);
      }

      if (name === "whatsapp" && typeof newValue === "string") {
        newValue = maskWhatsappInput(newValue);
      }

      const nextState = {
        ...prev,
        [name]: newValue,
      } as typeof prev;

      if (["turma", "horario", "professor"].includes(name)) {
        const turmaValue = name === "turma" ? String(newValue) : nextState.turma;
        const horarioValue = name === "horario" ? String(newValue) : nextState.horario;
        const professorValue = name === "professor" ? String(newValue) : nextState.professor;
        const nivel = getNivelFromClasses(turmaValue, horarioValue, professorValue);
        if (nivel) {
          nextState.nivel = nivel;
        }
      }

      if (name === "dataNascimento" && typeof newValue === "string") {
        const date = parseBirthDate(newValue);
        if (date) {
          const age = calculateAge(newValue);
          if (newValue.length === 10 && age < 6) {
            setMinAgeError("Idade mínima é 6 anos. Corrija a data de nascimento.");
            alert("Idade mínima é 6 anos. Corrija a data de nascimento.");
          } else {
            setMinAgeError("");
          }
          const categoria = getCategoriaByAge(age);
          if (categoria) {
            nextState.categoria = categoria;
          }
        } else {
          setMinAgeError("");
        }
      }

      return nextState;
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    setIsEditing(true);
    setEditMovementType("correction");
    setMinAgeError("");
    const sticky = localStorage.getItem("studentStickyData");
    const parsed = sticky ? JSON.parse(sticky) : {};
    const suggestedNivel = getNivelFromClasses(parsed.turma || "", parsed.horario || "", parsed.professor || "");
    
    setFormData({
      nome: "",
      dataNascimento: "",
      genero: parsed.genero || "Masculino",
      whatsapp: "",
      turma: parsed.turma || "",
      horario: parsed.horario || "",
      professor: parsed.professor || "",
      nivel: suggestedNivel || "Iniciante",
      categoria: "Juvenil",
      parQ: parsed.parQ || "Não",
      atestado: false,
      dataAtestado: ""
    });
    setShowModal(true);
  };

  const handleEditClick = (student: Student) => {
    setEditingId(student.id);
    setIsEditing(false);
    setEditMovementType("correction");
    setMinAgeError("");
    const normalizedBirth = maskDateInput(student.dataNascimento || "");
    const normalizedAtestado = maskDateInput(student.dataAtestado || "");
    const normalizedWhatsapp = maskWhatsappInput(student.whatsapp || "");
    const normalizedHorario = maskHorarioInput(student.horario || "");
    const age = calculateAge(normalizedBirth);
    const categoria = getCategoriaByAge(age) || student.categoria;
    if (normalizedBirth.length === 10 && age < 6) {
      setMinAgeError("Idade mínima é 6 anos. Corrija a data de nascimento.");
    }
    setFormData({
      nome: student.nome,
      dataNascimento: normalizedBirth,
      genero: student.genero,
      whatsapp: normalizedWhatsapp,
      turma: getTurmaDisplayLabel(student),
      horario: normalizedHorario,
      professor: student.professor,
      nivel: student.nivel,
      categoria,
      parQ: student.parQ,
      atestado: student.atestado,
      dataAtestado: normalizedAtestado
    });
    setShowModal(true);
  };

  const persistStudent = async (
    student: Student,
    isNew: boolean,
    movementType: "correction" | "transfer" = "correction"
  ): Promise<boolean> => {
    try {
      const payload = {
        nome: student.nome,
        student_uid: student.studentUid || "",
        grupo: student.grupo || student.turmaCodigo || "",
        turma: student.turmaLabel || student.turma || "",
        horario: student.horario || "",
        professor: student.professor || "",
        whatsapp: student.whatsapp || "",
        data_nascimento: student.dataNascimento || "",
        data_atestado: student.dataAtestado || "",
        categoria: student.categoria || "",
        genero: student.genero || "",
        parq: student.parQ || "",
        atestado: student.atestado,
      };
      if (isNew) {
        await createImportStudent(payload);
      } else {
        const numericId = Number(student.id);
        if (Number.isFinite(numericId)) {
          await updateImportStudent(student.id, {
            ...payload,
            movement_type: movementType,
          });
        }
      }
      return true;
    } catch (error) {
      console.error("Falha ao persistir aluno no backend", error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!formData.nome) {
      alert("Preencha o nome do aluno.");
      return;
    }

    const birthDate = parseBirthDate(formData.dataNascimento);
    if (!birthDate) {
      alert("Data de nascimento inválida.");
      return;
    }
    const age = calculateAge(formData.dataNascimento);
    if (age < 6) {
      alert("Idade mínima é 6 anos. Não é possível cadastrar.");
      return;
    }
    const autoCategoria = getCategoriaByAge(age);

    const candidateKey = buildStudentKey({
      nome: formData.nome,
      turma: formData.turma,
      horario: formData.horario,
      professor: formData.professor,
      dataNascimento: formData.dataNascimento,
      whatsapp: formData.whatsapp,
    });
    const duplicate = students.find(
      (student) => student.id !== editingId && buildStudentKey(student) === candidateKey
    );
    if (duplicate) {
      alert("Aluno já cadastrado para esta turma/horário. Verifique os duplicados.");
      return;
    }

    const turmaCodigo = getTurmaCodigoFromClasses(formData.turma, formData.horario, formData.professor);
    const turmaLabel = getTurmaLabelFromClasses(formData.turma, formData.horario, formData.professor);
    const studentId = editingId || `local-${Date.now()}`;
    const previousStudent = editingId ? students.find((s) => s.id === editingId) : null;
    const studentData: Student = {
      id: studentId,
      studentUid: previousStudent?.studentUid || "",
      grupo: turmaCodigo,
      nome: formData.nome,
      dataNascimento: formData.dataNascimento,
      genero: formData.genero,
      whatsapp: formData.whatsapp,
      turma: turmaLabel,
      turmaCodigo,
      turmaLabel,
      horario: formData.horario,
      professor: formData.professor,
      nivel: formData.nivel,
      categoria: autoCategoria || formData.categoria,
      parQ: formData.parQ,
      atestado: formData.atestado,
      dataAtestado: formData.atestado ? formData.dataAtestado : undefined,
      idade: age,
    };

    if (previousStudent) {
      const changedNivel = normalizeText(previousStudent.nivel || "") !== normalizeText(studentData.nivel || "");
      const changedClass =
        normalizeText(previousStudent.turmaLabel || previousStudent.turma || "") !== normalizeText(studentData.turmaLabel || studentData.turma || "") ||
        normalizeHorarioKey(previousStudent.horario || "") !== normalizeHorarioKey(studentData.horario || "") ||
        normalizeText(previousStudent.professor || "") !== normalizeText(studentData.professor || "");

      if (changedNivel) {
        if (editMovementType === "transfer") {
          saveTransferHistory({
            nome: studentData.nome,
            fromNivel: previousStudent.nivel || "",
            toNivel: studentData.nivel || "",
            fromTurma: previousStudent.turmaLabel || previousStudent.turma || "",
            toTurma: studentData.turmaLabel || studentData.turma || "",
            fromHorario: previousStudent.horario || "",
            toHorario: studentData.horario || "",
            fromProfessor: previousStudent.professor || "",
            toProfessor: studentData.professor || "",
            effectiveDate: new Date().toISOString().slice(0, 10),
          });
        } else {
          clearTransferHistoryForNames([studentData.nome]);
        }
      } else if (changedClass) {
        if (editMovementType === "transfer") {
          saveTransferHistory({
            nome: studentData.nome,
            fromNivel: previousStudent.nivel || "",
            toNivel: studentData.nivel || "",
            fromTurma: previousStudent.turmaLabel || previousStudent.turma || "",
            toTurma: studentData.turmaLabel || studentData.turma || "",
            fromHorario: previousStudent.horario || "",
            toHorario: studentData.horario || "",
            fromProfessor: previousStudent.professor || "",
            toProfessor: studentData.professor || "",
            effectiveDate: new Date().toISOString().slice(0, 10),
          });
        } else {
          clearTransferHistoryForNames([studentData.nome]);
        }
      }
    }

    // update state directly; persistence handled by effect
    setStudents((prev) => {
      let updated = prev;
      if (editingId) {
        updated = prev.map((s) => (s.id === studentId ? studentData : s));
      } else {
        updated = [...prev, studentData];
      }
      return dedupeStudents(updated);
    });

    let persisted = true;
    if (!editingId) {
      persisted = await persistStudent(studentData, true);
    } else if (!studentId.startsWith("local-")) {
      persisted = await persistStudent(studentData, false, editMovementType);
    }

    if (persisted) {
      if (editingId) {
        alert("Aluno atualizado com sucesso!");
      } else {
        alert("Aluno adicionado com sucesso!");
      }
    } else {
      alert("Alteracao aplicada localmente, mas houve falha ao persistir no backend. Verifique a conexao e tente Atualizar Base.");
    }

    // Salvar dados persistentes (sticky)
    const stickyData = {
      turma: formData.turma,
      horario: formData.horario,
      professor: formData.professor,
      parQ: formData.parQ,
      genero: formData.genero,
    };
    localStorage.setItem("studentStickyData", JSON.stringify(stickyData));

    if (!editingId) {
      // Abrir nova edição imediatamente
      const suggestedNivel = getNivelFromClasses(formData.turma, formData.horario, formData.professor);
      setFormData({
        nome: "",
        dataNascimento: "",
        genero: formData.genero,
        whatsapp: "",
        turma: formData.turma,
        horario: formData.horario,
        professor: formData.professor,
        nivel: suggestedNivel || formData.nivel,
        categoria: formData.categoria,
        parQ: formData.parQ,
        atestado: false,
        dataAtestado: "",
      });

      setEditingId(null);
      setIsEditing(true);
      setShowModal(true);
    } else {
      setShowModal(false);
      setEditingId(null);
    }
  };

  const handleDelete = (student: Student) => {
    setStudentPendingExclusion(student);
    setExcludeReason("");
    setShowExcludeReasonModal(true);
  };

  const confirmDeleteWithReason = async () => {
    const reason = excludeReason.trim();
    if (!reason) {
      alert("Selecione um motivo para a exclusão.");
      return;
    }

    const selectedIds = studentPendingExclusion
      ? [String(studentPendingExclusion.id)]
      : [...selectedPendingIds];
    const selectedStudents = students.filter((student) => selectedIds.includes(String(student.id)));
    if (selectedStudents.length === 0) {
      alert("Selecione pelo menos um aluno para excluir.");
      return;
    }

    const payloads = selectedStudents.map((student) => ({
      ...student,
      student_uid: student.studentUid || "",
      grupo: student.grupo || student.turmaCodigo || "",
      turma: student.turmaLabel || student.turma || student.turmaCodigo || "",
      turmaLabel: student.turmaLabel || student.turma || student.turmaCodigo || "",
      turmaCodigo: student.turmaCodigo || "",
      dataExclusao: new Date().toLocaleDateString("pt-BR"),
      motivo_exclusao: reason,
    }));

    if (payloads.length > 1) {
      await addExclusionsBulk(payloads, false).catch(() => undefined);
    } else if (payloads.length === 1) {
      await addExclusion(payloads[0]).catch(() => {
        alert("Falha ao enviar exclusão ao backend. Tente novamente.");
      });
    }

    await getExcludedStudents()
      .then((response) => {
        const synced = sanitizeExcludedRecords(Array.isArray(response?.data) ? response.data : []);
        setExcludedRecords(synced);
        localStorage.setItem("excludedStudents", JSON.stringify(synced));
      })
      .catch(() => undefined);

    setStudents((prev) => prev.filter((s) => !selectedIds.includes(String(s.id))));

    setShowExcludeReasonModal(false);
    setStudentPendingExclusion(null);
    setExcludeReason("");
    setSelectedPendingIds([]);
    if (!studentPendingExclusion) {
      setBulkExcludeMode(false);
    }
    alert(
      selectedStudents.length === 1
        ? "Aluno movido para a lista de exclusão."
        : `${selectedStudents.length} alunos movidos para a lista de exclusão.`
    );
  };

  const handleGoToAttendance = (student: Student) => {
    const turmaValue = student.turmaLabel || student.turmaCodigo || student.turma || "";
    localStorage.setItem("attendanceTargetTurma", turmaValue);
    localStorage.setItem(
      "attendanceSelection",
      JSON.stringify({
        turma: turmaValue,
        horario: student.horario || "",
        professor: student.professor || "",
      })
    );
    window.location.hash = "attendance";
  };

  const nivelExtras = Array.from(
    new Set(
      students
        .map((s) => s.nivel)
        .filter(Boolean)
        .filter((nivel) => !nivelOrder.some((item) => normalizeText(item) === normalizeText(nivel)))
    )
  ).sort((a, b) => a.localeCompare(b));
  const nivelOptions = [...nivelOrder, ...nivelExtras];

  const filteredStudents = students.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      normalizeText(s.nome).includes(term) ||
      normalizeText(s.nivel).includes(term) ||
      normalizeText(s.categoria).includes(term) ||
      s.idade.toString().includes(term) ||
      normalizeText(s.professor).includes(term);

    const matchesNivel = !filters.nivel || normalizeText(s.nivel) === normalizeText(filters.nivel);
    const turmaValue = getTurmaDisplayLabel(s);
    const matchesTurma = !filters.turma || turmaValue === filters.turma;
    const matchesHorario =
      !filters.horario || formatHorario(s.horario || "") === filters.horario;
    const matchesProfessor =
      !filters.professor || s.professor === filters.professor;
    const matchesCategoria =
      !filters.categoria || normalizeText(s.categoria) === normalizeText(filters.categoria);
    const matchesExcluded = !isStudentExcluded(s, excludedRecords);
    return (
      matchesSearch &&
      matchesNivel &&
      matchesTurma &&
      matchesHorario &&
      matchesProfessor &&
      matchesCategoria &&
      matchesExcluded
    );
  });

  const pendingStudents = filteredStudents.filter((student) => !getTurmaDisplayLabel(student));

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (!sortKey) return 0;
    let result = 0;
    if (sortKey === "nome") {
      result = a.nome.localeCompare(b.nome);
    } else if (sortKey === "nivel") {
      result = getNivelRank(a.nivel) - getNivelRank(b.nivel);
    } else if (sortKey === "idade") {
      result = a.idade - b.idade;
    } else if (sortKey === "categoria") {
      const aRank = getCategoriaRank(a.categoria);
      const bRank = getCategoriaRank(b.categoria);
      const aIsCustom = aRank < Number.MAX_SAFE_INTEGER - 1;
      const bIsCustom = bRank < Number.MAX_SAFE_INTEGER - 1;
      if (aIsCustom && bIsCustom) {
        result = aRank - bRank;
      } else if (!aIsCustom && !bIsCustom) {
        result = a.categoria.localeCompare(b.categoria);
      } else {
        result = aIsCustom ? -1 : 1;
      }
    } else if (sortKey === "turma") {
      result = getTurmaDisplayLabel(a).localeCompare(getTurmaDisplayLabel(b));
    } else if (sortKey === "horario") {
      result = compareHorario(a.horario, b.horario);
    } else if (sortKey === "professor") {
      result = a.professor.localeCompare(b.professor);
    }
    return sortDir === "asc" ? result : -result;
  });

  const displayedStudents = allocationTarget
    ? [...pendingStudents].sort((a, b) => a.nome.localeCompare(b.nome))
    : sortedStudents;
  const selectionMode = Boolean(allocationTarget) || bulkExcludeMode;

  const selectablePendingIds = displayedStudents
    .map((student) => {
      const numericId = Number(student.id);
      return Number.isFinite(numericId) ? String(student.id) : "";
    })
    .filter(Boolean);

  const allPendingSelected =
    selectablePendingIds.length > 0 && selectablePendingIds.every((id) => selectedPendingIds.includes(id));

  const reloadBootstrapData = async () => {
    const response = await getBootstrap();
    const data = response.data as {
      classes: Array<{
        id: number;
        grupo?: string;
        codigo: string;
        turma_label: string;
        horario: string;
        professor: string;
        nivel: string;
        faixa_etaria: string;
        capacidade: number;
        dias_semana: string;
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

    const { mappedStudents, mappedClasses } = mapBootstrapForStorage(data, calculateAge);
    const finalList = dedupeStudents(mappedStudents as Student[]);
    setStudents(finalList);
    localStorage.setItem("activeStudents", JSON.stringify(finalList));
    localStorage.setItem("activeClasses", JSON.stringify(mappedClasses));

    const professors: string[] = Array.from(
      new Set<string>(
        mappedClasses
          .map((cls: any) => String(cls?.Professor || "").trim())
          .filter((value: string) => Boolean(value))
      )
    );
    setProfessorOptions(professors);
  };

  const togglePendingSelection = (studentId: string) => {
    setSelectedPendingIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
    requestAnimationFrame(() => {
      if (allocationTarget && searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    });
  };

  const toggleSelectAllPending = () => {
    setSelectedPendingIds(allPendingSelected ? [] : selectablePendingIds);
  };

  const handleCancelAllocationMode = () => {
    setAllocationTarget(null);
    setBulkExcludeMode(false);
    setSelectedPendingIds([]);
  };

  const handleStartBulkExcludeMode = () => {
    setBulkExcludeMode(true);
    setAllocationTarget(null);
    setSelectedPendingIds([]);
  };

  const handleConfirmBulkExclude = () => {
    if (selectedPendingIds.length === 0) {
      alert("Selecione pelo menos um aluno para excluir.");
      return;
    }
    setStudentPendingExclusion(null);
    setExcludeReason("");
    setShowExcludeReasonModal(true);
  };

  const handleBulkAllocate = async () => {
    if (!allocationTarget) return;

    const selectedStudents = displayedStudents.filter((student) => selectedPendingIds.includes(String(student.id)));
    const numericIds = selectedPendingIds
      .map((studentId) => Number(studentId))
      .filter((studentId) => Number.isFinite(studentId));
    if (numericIds.length === 0) {
      alert("Selecione pelo menos um aluno pendente.");
      return;
    }

    try {
      setIsAllocatingBulk(true);
      const movementType: "correction" = "correction";
      await bulkAllocateImportStudents({
        student_ids: numericIds,
        turma: allocationTarget.turma,
        horario: allocationTarget.horario,
        professor: allocationTarget.professor,
        movement_type: movementType,
      });
      clearTransferHistoryForNames(selectedStudents.map((student) => student.nome));
      await reloadBootstrapData();
      setSelectedPendingIds([]);
      setAllocationTarget(null);
      alert("Alunos alocados com sucesso!");
    } catch (error) {
      console.error("Falha ao alocar alunos em lote", error);
      alert("Nao foi possivel alocar os alunos selecionados.");
    } finally {
      setIsAllocatingBulk(false);
    }
  };

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

  const getDisplayStudentName = (student: Student) => {
    const rawName = String(student?.nome || "");
    if (!isCompactViewport) return rawName;

    return formatMobileStudentName(rawName);
  };

  const handleSort = (
    key: "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor"
  ) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIndicator = (
    key: "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor"
  ) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      {allocationTarget && (
        <div
          style={{
            marginBottom: "16px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "#fff7ed",
            border: "1px solid #fdba74",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#9a3412", textTransform: "uppercase" }}>
              modo de alocacao
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#7c2d12" }}>
              {allocationTarget.turma} • {formatHorario(allocationTarget.horario)} • {allocationTarget.professor}
            </div>
            <div style={{ fontSize: "12px", color: "#9a3412", marginTop: "4px" }}>
              Selecione alunos pendentes para admitir nesta turma.
            </div>
            <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#7c2d12", fontWeight: 700 }}>Tipo configurado:</span>
              <span
                style={{
                  borderRadius: "999px",
                  padding: "4px 10px",
                  fontWeight: 700,
                  fontSize: "12px",
                  background: "#ea580c",
                  color: "#fff",
                }}
              >
                Correção
              </span>
              <span style={{ fontSize: "11px", color: "#9a3412" }}>
                Alocação de pendentes sempre usa correção (sem bloqueio retroativo).
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={toggleSelectAllPending}
              style={{
                background: "#fed7aa",
                color: "#9a3412",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {allPendingSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <button
              type="button"
              onClick={handleCancelAllocationMode}
              style={{
                background: "#e5e7eb",
                color: "#111827",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBulkAllocate}
              disabled={isAllocatingBulk || selectedPendingIds.length === 0}
              style={{
                background: isAllocatingBulk || selectedPendingIds.length === 0 ? "#cbd5e1" : "#ea580c",
                color: "white",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: isAllocatingBulk || selectedPendingIds.length === 0 ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {isAllocatingBulk ? "Alocando..." : `Alocar selecionados (${selectedPendingIds.length})`}
            </button>
          </div>
        </div>
      )}
      {bulkExcludeMode && !allocationTarget && (
        <div
          style={{
            marginBottom: "16px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "#fff1f2",
            border: "1px solid #fda4af",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#9f1239", textTransform: "uppercase" }}>
              modo de exclusão em massa
            </div>
            <div style={{ fontSize: "13px", color: "#9f1239", marginTop: "4px" }}>
              Marque os alunos e confirme a exclusão de uma vez.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={toggleSelectAllPending}
              style={{
                background: "#fecdd3",
                color: "#9f1239",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {allPendingSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <button
              type="button"
              onClick={handleCancelAllocationMode}
              style={{
                background: "#e5e7eb",
                color: "#111827",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkExclude}
              disabled={selectedPendingIds.length === 0}
              style={{
                background: selectedPendingIds.length === 0 ? "#cbd5e1" : "#dc2626",
                color: "white",
                border: "none",
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: selectedPendingIds.length === 0 ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {`Excluir selecionados (${selectedPendingIds.length})`}
            </button>
          </div>
        </div>
      )}
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="🔍 Buscar aluno por nome, nível, categoria, idade ou professor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={(e) => {
              if (allocationTarget && e.currentTarget.value) {
                e.currentTarget.select();
              }
            }}
            style={{
              width: "100%",
              padding: "12px 36px 12px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              title="Limpar busca"
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "14px",
                color: "#666",
                padding: 0,
              }}
            >
              x
            </button>
          )}
        </div>
        {loading && (
          <span style={{ fontSize: "12px", color: "#666" }}>Carregando...</span>
        )}
        {!allocationTarget && (
          <>
            {!bulkExcludeMode && (
              <button
                onClick={handleStartBulkExcludeMode}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "14px",
                  whiteSpace: "nowrap",
                }}
              >
                Excluir em massa
              </button>
            )}
            <button
              onClick={() => {
                setFilters({ nivel: "", categoria: "", turma: "", horario: "", professor: "" });
                setSearchTerm("");
                setSortKey(null);
                setSortDir("asc");
              }}
              style={{
                background: "#f59e0b",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "14px",
                whiteSpace: "nowrap",
                marginRight: "10px",
              }}
            >
              Limpar filtros
            </button>
            <button
              onClick={handleAddClick}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "14px",
                whiteSpace: "nowrap"
              }}
            >
              + Aluno
            </button>
          </>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", color: "#333", borderBottom: "2px solid #ddd" }}>
              {selectionMode && (
                <th style={{ padding: "12px", textAlign: "center", width: "44px" }}>
                  <input
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={toggleSelectAllPending}
                    title={allPendingSelected ? "Desmarcar todos" : "Selecionar todos"}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </th>
              )}
              <th
                onClick={() => handleSort("nome")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Nome{getSortIndicator("nome")}
              </th>
              <th
                onClick={() => handleSort("nivel")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Nível{getSortIndicator("nivel")}
              </th>
              <th
                onClick={() => handleSort("idade")}
                style={{ padding: "10px 8px", textAlign: "center", cursor: "pointer", width: "56px", whiteSpace: "nowrap" }}
              >
                Idade{getSortIndicator("idade")}
              </th>
              <th
                onClick={() => handleSort("categoria")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Categoria{getSortIndicator("categoria")}
              </th>
              <th
                onClick={() => handleSort("turma")}
                style={{ padding: "10px 8px", textAlign: "center", cursor: "pointer", whiteSpace: "nowrap", width: "118px" }}
              >
                Turma{getSortIndicator("turma")}
              </th>
              <th
                onClick={() => {
                  handleSort("horario");
                }}
                style={{ padding: "10px 8px", textAlign: "center", cursor: "pointer", position: "relative", width: "70px", whiteSpace: "nowrap" }}
              >
                Horário{getSortIndicator("horario")}
              </th>
              <th
                onClick={() => handleSort("professor")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Professor{getSortIndicator("professor")}
              </th>
              <th style={{ padding: "12px", textAlign: "center" }}>{selectionMode ? "Selecionar" : "Ações"}</th>
            </tr>
            {/* filtro acumulativo */}
            <tr className="filter-row">
              {selectionMode && <th style={{ padding: "8px" }}></th>}
              <th style={{ padding: "8px" }}></th>
              <th style={{ padding: "8px" }}>
                <select
                  value={filters.nivel}
                  onChange={(e) => setFilters((f) => ({ ...f, nivel: e.target.value }))}
                  style={{ width: "100%", padding: "4px" }}
                >
                  <option value="">Todos</option>
                  {nivelOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px" }}></th>
              <th style={{ padding: "8px" }}>
                <select
                  value={filters.categoria}
                  onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value }))}
                  style={{ width: "100%", padding: "4px" }}
                >
                  <option value="">Todos</option>
                  {categoriaOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px" }}>
                <select
                  value={filters.turma}
                  onChange={(e) => setFilters((f) => ({ ...f, turma: e.target.value }))}
                  style={{ width: "100%", padding: "4px" }}
                >
                  <option value="">Todos</option>
                  {turmaOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px" }}>
                <select
                  value={filters.horario}
                  onChange={(e) => setFilters((f) => ({ ...f, horario: e.target.value }))}
                  style={{ width: "100%", padding: "4px" }}
                >
                  <option value="">Todos</option>
                  {horarioOptions.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px" }}></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayedStudents.map((student, idx) => (
              <tr key={student.id} style={{ borderBottom: "1px solid #eee", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                {selectionMode && (
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedPendingIds.includes(String(student.id))}
                      onChange={() => togglePendingSelection(String(student.id))}
                      disabled={!Number.isFinite(Number(student.id))}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                  </td>
                )}
                <td 
                  style={{ padding: "10px 8px", fontWeight: 500, cursor: allocationTarget ? "pointer" : "pointer", color: "#2c3e50", whiteSpace: "nowrap" }}
                  onClick={() => {
                    if (selectionMode) {
                      togglePendingSelection(String(student.id));
                    } else {
                      handleEditClick(student);
                    }
                  }}
                  title={selectionMode ? "Clique para selecionar" : "Clique para editar"}
                >
                  <span
                    style={{
                      borderBottom: "1px dashed #ccc",
                      display: "inline-block",
                      maxWidth: isCompactViewport ? "150px" : "280px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "bottom",
                    }}
                  >
                    {getDisplayStudentName(student)}
                  </span>
                </td>
                <td style={{ padding: "12px" }}>{student.nivel}</td>
                <td style={{ padding: "10px 6px", textAlign: "center", whiteSpace: "nowrap" }}>{student.idade}</td>
                <td style={{ padding: "12px" }}>{student.categoria}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                  {getTurmaDisplayLabel(student) ? (
                    <span
                      style={{
                        background: "#eef2ff",
                        color: "#4f46e5",
                        padding: "3px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      {getTurmaDisplayLabel(student)}
                    </span>
                  ) : (
                    <span
                      style={{
                        background: "#fff3cd",
                        color: "#856404",
                        padding: "3px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        border: "1px solid #ffc107",
                      }}
                    >
                      Pendente
                    </span>
                  )}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "center", whiteSpace: "nowrap" }}>{formatHorario(student.horario)}</td>
                <td style={{ padding: "12px" }}>{student.professor}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", display: "flex", gap: "6px", justifyContent: "center" }}>
                  {selectionMode ? null : (
                    <>
                      {getTurmaDisplayLabel(student) ? (
                        <button
                          onClick={() => handleGoToAttendance(student)}
                          title="Ir para chamada"
                          style={{
                            background: "#28a745",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "11px",
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isCompactViewport ? "📅" : "📅 Chamada"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEditClick(student)}
                          title="Alocar em turma"
                          style={{
                            background: "#fd7e14",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "11px",
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isCompactViewport ? "📌" : "📌 Alocar"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(student)}
                        title="Excluir aluno"
                        style={{
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "11px",
                          lineHeight: 1.1,
                        }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayedStudents.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          {allocationTarget ? "Nenhum aluno pendente encontrado" : "Nenhum aluno encontrado"}
        </div>
      )}

      {showExcludeReasonModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1100,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              width: "420px",
              padding: "18px",
              boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
            }}
          >
            <h3 style={{ margin: "0 0 10px", color: "#2c3e50" }}>Motivo da exclusão</h3>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#555" }}>
              Informe o motivo para excluir <strong>{studentPendingExclusion ? getDisplayStudentName(studentPendingExclusion) : `${selectedPendingIds.length} alunos selecionados`}</strong>.
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
              {exclusionReasonOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setExcludeReason((prev) => (prev.trim() === option ? "" : option))
                  }
                  style={{
                    border: "1px solid #cbd5e1",
                    background: excludeReason.trim() === option ? "#2563eb" : "#f8fafc",
                    color: excludeReason.trim() === option ? "#fff" : "#334155",
                    borderRadius: "999px",
                    padding: "5px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
              Motivo selecionado: <strong>{excludeReason.trim() || "Nenhum"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
              <button
                onClick={() => {
                  setShowExcludeReasonModal(false);
                  setStudentPendingExclusion(null);
                  setExcludeReason("");
                }}
                style={{
                  background: "#e5e7eb",
                  color: "#111827",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteWithReason}
                style={{
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Confirmar exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADICIONAR ALUNO */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div ref={modalContentRef} style={{ background: "white", padding: "25px", borderRadius: "12px", width: "500px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h2 style={{ margin: 0, color: "#2c3e50" }}>
                {editingId ? "Aluno" : "Adicionar Novo Aluno"}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {editingId && isEditing && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      onClick={() => setEditMovementType("correction")}
                      style={{
                        border: "none",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: editMovementType === "correction" ? "#ea580c" : "#fed7aa",
                        color: editMovementType === "correction" ? "#fff" : "#9a3412",
                      }}
                    >
                      Correção
                    </button>
                    <button
                      onClick={() => setEditMovementType("transfer")}
                      style={{
                        border: "none",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: editMovementType === "transfer" ? "#2563eb" : "#dbeafe",
                        color: editMovementType === "transfer" ? "#fff" : "#1d4ed8",
                      }}
                    >
                      Transferência
                    </button>
                  </div>
                )}
                {editingId && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      background: "#f39c12",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "13px"
                    }}
                  >
                    ✏️ Editar
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "20px",
                    cursor: "pointer",
                    color: "#666",
                    padding: "0 5px",
                    fontWeight: "bold"
                  }}
                  title="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nome Completo</label>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Data Nascimento (dd/mm/aaaa)</label>
                <input
                  name="dataNascimento"
                  value={formData.dataNascimento}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Ex: 10/05/2010"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
                {minAgeError && (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#dc3545", fontWeight: 600 }}>
                    {minAgeError}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Gênero</label>
                <select
                  name="genero"
                  value={formData.genero}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Não binário">Não binário</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>WhatsApp</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleInputChange}
                    placeholder="(##) # ####-####"
                    disabled={!isEditing}
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                  <WhatsappButton phoneNumber={formData.whatsapp} />
                </div>
              </div>

              {/* Campos Sticky */}
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Turma</label>
                <select
                  name="turma"
                  value={formData.turma}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#fffbeb" }}
                >
                  <option value="" disabled hidden>Selecione uma turma</option>
                  {turmaOptions.map((turma) => (
                    <option key={turma} value={turma}>{turma}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Horário</label>
                <input
                  name="horario"
                  value={formData.horario}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="00:00"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#fffbeb" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Professor</label>
                <div style={{ display: "flex", gap: "15px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  {professorOptions.map(prof => (
                    <label key={prof} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="professor"
                        value={prof}
                        checked={formData.professor === prof}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                      />
                      {prof}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nível</label>
                <select name="nivel" value={formData.nivel} onChange={handleInputChange} disabled={!isEditing} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
                  {nivelOptions.map((nivel) => (
                    <option key={nivel} value={nivel}>
                      {nivel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Categoria</label>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#555", padding: "6px 0" }}>
                  {formData.categoria || "-"}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>ParQ (Apto para atividade física?)</label>
                <div style={{ display: "flex", gap: "20px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Sim" checked={formData.parQ === "Sim"} onChange={handleInputChange} disabled={!isEditing} /> Sim
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Não" checked={formData.parQ === "Não"} onChange={handleInputChange} disabled={!isEditing} /> Não
                  </label>
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", marginTop: "5px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="atestado"
                    checked={formData.atestado}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    style={{ width: "16px", height: "16px" }}
                  />
                  Possui Atestado Médico?
                </label>
                
                {formData.atestado && (
                  <input
                    name="dataAtestado"
                    value={formData.dataAtestado}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="Data do Atestado (dd/mm/aaaa)"
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "25px", justifyContent: "flex-end" }}>
              {isEditing && (
                <button
                  onClick={handleSave}
                  disabled={!!minAgeError}
                  style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {editingId ? "Salvar Alterações" : "Salvar Aluno"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
