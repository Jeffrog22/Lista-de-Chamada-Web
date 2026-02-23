import React, { useState, useEffect } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { addExclusion, createImportStudent, getBootstrap, updateImportStudent } from "../api";

interface Student {
  id: string;
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

  const normalizeHorarioKey = (value: string) => {
    const digits = (value || "").replace(/\D/g, "");
    if (digits.length === 3) return `0${digits}`;
    if (digits.length >= 4) return digits.slice(0, 4);
    return digits;
  };

  const buildStudentKey = (student: Partial<Student>) => {
    const nameKey = normalizeText(student.nome || "");
    const turmaKey = normalizeText(student.turma || "");
    const professorKey = normalizeText(student.professor || "");
    const horarioKey = normalizeHorarioKey(student.horario || "");
    const birthKey = (student.dataNascimento || "").trim();
    const whatsappKey = (student.whatsapp || "").replace(/\D/g, "");
    return `${nameKey}|${turmaKey}|${horarioKey}|${professorKey}|${birthKey}|${whatsappKey}`;
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
  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem("activeStudents");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return dedupeStudents(parsed);
      } catch {
        // ignore
      }
    }
    return [];
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
    // filter out any students that were marked as excluded; simple in-memory
    try {
      const raw = localStorage.getItem("excludedStudents");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const removed = new Set(parsed.map((s: Partial<Student>) => buildStudentKey(s)));
          setStudents((prev) => prev.filter((s) => !removed.has(buildStudentKey(s))));
        }
      }
    } catch {
      // ignore malformed storage
    }
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

        const classById = new Map<number, (typeof data.classes)[number]>();
        data.classes.forEach((cls) => classById.set(cls.id, cls));

        const mapped = data.students.map((student) => {
          const cls = classById.get(student.class_id);
          return {
            id: String(student.id),
            nome: student.nome,
            nivel: cls?.nivel || "",
            idade: calculateAge(student.data_nascimento || ""),
            categoria: student.categoria || "",
            turma: cls?.turma_label || cls?.codigo || "",
            turmaCodigo: cls?.codigo || "",
            turmaLabel: cls?.turma_label || cls?.codigo || "",
            horario: cls?.horario || "",
            professor: cls?.professor || "",
            whatsapp: student.whatsapp || "",
            genero: student.genero || "",
            dataNascimento: student.data_nascimento || "",
            parQ: student.parq || "",
            atestado: !!student.atestado,
            dataAtestado: student.data_atestado || "",
          } as Student;
        });

        if (mapped.length > 0) {
          const deduped = dedupeStudents(mapped);
          const storedRaw = localStorage.getItem("activeStudents");
          const storedList: Student[] = [];
          if (storedRaw) {
            try {
              const parsed = JSON.parse(storedRaw);
              if (Array.isArray(parsed)) {
                storedList.push(...parsed);
              }
            } catch {
              // ignore malformed storage
            }
          }

          const storedById = new Map<string, Student>();
          storedList.forEach((student) => {
            if (student.id) storedById.set(student.id, student);
          });

          const mergedFromBackend = deduped.map((student) => {
            const stored = storedById.get(student.id);
            if (!stored) return student;

            const turmaLabelFromBackend = student.turmaLabel || stored.turmaLabel;

            const hasManualChange =
              stored.turma !== student.turma ||
              (stored.horario || "") !== (student.horario || "") ||
              (stored.professor || "") !== (student.professor || "");

            if (!hasManualChange) {
              return {
                ...student,
                turmaLabel: turmaLabelFromBackend,
              };
            }

            return {
              ...stored,
              turmaLabel: turmaLabelFromBackend,
            };
          });

          const storedOnly = storedList.filter((student) => !deduped.some((item) => item.id === student.id));
          const finalList = dedupeStudents([...mergedFromBackend, ...storedOnly]);

          setStudents(finalList);
          localStorage.setItem("activeStudents", JSON.stringify(finalList));
        }

        const classStorage = data.classes.map((cls) => ({
          Turma: cls.turma_label || cls.codigo,
          TurmaCodigo: cls.codigo,
          Horario: cls.horario,
          Professor: cls.professor,
          Nivel: cls.nivel,
          FaixaEtaria: cls.faixa_etaria,
          Atalho: cls.codigo,
          CapacidadeMaxima: cls.capacidade,
          DiasSemana: cls.dias_semana,
        }));
        if (classStorage.length > 0) {
          localStorage.setItem("activeClasses", JSON.stringify(classStorage));
          const professors = Array.from(
            new Set(classStorage.map((cls) => cls.Professor).filter(Boolean))
          );
          setProfessorOptions(professors);
        }
      })
      .catch(() => {
        // keep local data
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

  const [sortKey, setSortKey] = useState<    "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);
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
        const turmaKey = cls.TurmaCodigo || "";
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

  const persistStudent = async (student: Student, isNew: boolean) => {
    try {
      const payload = {
        nome: student.nome,
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
          await updateImportStudent(student.id, payload);
        }
      }
    } catch (error) {
      console.error("Falha ao persistir aluno no backend", error);
    }
  };

  const handleSave = () => {
    if (!formData.nome || !formData.turma) {
      alert("Preencha os campos obrigatórios (Nome, Turma)");
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
    const studentData: Student = {
      id: studentId,
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

    if (!editingId) {
      persistStudent(studentData, true).catch(() => undefined);
    } else if (!studentId.startsWith("local-")) {
      persistStudent(studentData, false).catch(() => undefined);
    }

    if (editingId) {
      alert("Aluno atualizado com sucesso!");
    } else {
      alert("Aluno adicionado com sucesso!");
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

  const confirmDeleteWithReason = () => {
    if (!studentPendingExclusion) return;

    const student = studentPendingExclusion;
    const reason = excludeReason.trim();
    if (!reason) {
      alert("Selecione um motivo para a exclusão.");
      return;
    }
    const exclusionPayload = {
      ...student,
      dataExclusao: new Date().toLocaleDateString(),
      motivo_exclusao: reason,
    };

    addExclusion(exclusionPayload).catch(() => {
      alert("Falha ao enviar exclusão ao backend. Tente novamente.");
    });

    const excludedStudents = JSON.parse(localStorage.getItem("excludedStudents") || "[]");
    excludedStudents.push(exclusionPayload);
    localStorage.setItem("excludedStudents", JSON.stringify(excludedStudents));

    // simply remove student from state; persistence effect will clear storage
    setStudents((prev) => prev.filter((s) => s.id !== student.id));

    setShowExcludeReasonModal(false);
    setStudentPendingExclusion(null);
    setExcludeReason("");
    alert("Aluno movido para a lista de exclusão.");
  };

  const handleGoToAttendance = (turma: string) => {
    localStorage.setItem("attendanceTargetTurma", turma);
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
    return (
      matchesSearch &&
      matchesNivel &&
      matchesTurma &&
      matchesHorario &&
      matchesProfessor &&
      matchesCategoria
    );
  });

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
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            placeholder="🔍 Buscar aluno por nome, nível, categoria, idade ou professor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", color: "#333", borderBottom: "2px solid #ddd" }}>
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
                style={{ padding: "12px", textAlign: "center", cursor: "pointer", width: "80px", whiteSpace: "nowrap" }}
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
                style={{ padding: "12px", textAlign: "center", cursor: "pointer" }}
              >
                Turma{getSortIndicator("turma")}
              </th>
              <th
                onClick={() => {
                  handleSort("horario");
                }}
                style={{ padding: "12px", textAlign: "center", cursor: "pointer", position: "relative", width: "90px", whiteSpace: "nowrap" }}
              >
                Horário{getSortIndicator("horario")}
              </th>
              <th
                onClick={() => handleSort("professor")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Professor{getSortIndicator("professor")}
              </th>
              <th style={{ padding: "12px", textAlign: "center" }}>Ações</th>
            </tr>
            {/* filtro acumulativo */}
            <tr className="filter-row">
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
            {sortedStudents.map((student, idx) => (
              <tr key={student.id} style={{ borderBottom: "1px solid #eee", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                <td 
                  style={{ padding: "12px", fontWeight: 500, cursor: "pointer", color: "#2c3e50" }}
                  onClick={() => handleEditClick(student)}
                  title="Clique para editar"
                >
                  <span style={{ borderBottom: "1px dashed #ccc" }}>{student.nome}</span>
                </td>
                <td style={{ padding: "12px" }}>{student.nivel}</td>
                <td style={{ padding: "12px", textAlign: "center" }}>{student.idade}</td>
                <td style={{ padding: "12px" }}>{student.categoria}</td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  <span style={{ background: "#eef2ff", color: "#4f46e5", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold", fontSize: "12px" }}>
                    {getTurmaDisplayLabel(student)}
                  </span>
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>{formatHorario(student.horario)}</td>
                <td style={{ padding: "12px" }}>{student.professor}</td>
                <td style={{ padding: "12px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                  <button
                    onClick={() => handleGoToAttendance(getTurmaDisplayLabel(student))}
                    title="Ir para chamada"
                    style={{
                      background: "#28a745",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    📅 Chamada
                  </button>
                  <button
                    onClick={() => handleDelete(student)}
                    title="Excluir aluno"
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredStudents.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno encontrado
        </div>
      )}

      {showExcludeReasonModal && studentPendingExclusion && (
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
              Informe o motivo para excluir <strong>{studentPendingExclusion.nome}</strong>.
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
          <div style={{ background: "white", padding: "25px", borderRadius: "12px", width: "500px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h2 style={{ margin: 0, color: "#2c3e50" }}>
                {editingId ? "Aluno" : "Adicionar Novo Aluno"}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                  {(professorOptions.length > 0 ? professorOptions : ["Joao Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa"]).map(prof => (
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
