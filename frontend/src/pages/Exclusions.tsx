import React, { useCallback, useEffect, useState } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { addExclusion, deleteExclusion, getExcludedStudents, restoreStudent, isExclusionsWriteFailed } from "../api";
import "./Exclusions.css";

interface ExcludedStudent {
  id?: string;
  grupo?: string;
  nome?: string;
  turma?: string;
  turmaLabel?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  nivel?: string;
  categoria?: string;
  whatsapp?: string;
  genero?: string;
  dataNascimento?: string;
  parQ?: string;
  atestado?: boolean;
  dataAtestado?: string;
  dataExclusao?: string;
  motivo_exclusao?: string;
  Nome?: string;
  Turma?: string;
  TurmaLabel?: string;
  Grupo?: string;
  TurmaCodigo?: string;
  Horario?: string;
  Professor?: string;
  DataExclusao?: string;
  MotivoExclusao?: string;
  [key: string]: any;
}

export const Exclusions: React.FC = () => {
  const exclusionReasonOptions = ["Falta", "Desistência", "Transferência", "Documentação"];
  const [students, setStudents] = useState<ExcludedStudent[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [turmaOptions, setTurmaOptions] = useState<string[]>([]);
  const [lastTurma, setLastTurma] = useState<string>("");
  const [professorOptions, setProfessorOptions] = useState<string[]>([]);
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ExcludedStudent | null>(null);
  const [isLoadFromFallback, setIsLoadFromFallback] = useState(false);
  const [writeOpFailed, setWriteOpFailed] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => {
    const byWidth = window.innerWidth <= 768;
    const byLandscapePhone = window.innerWidth <= 1024 && window.innerHeight <= 500;
    return byWidth || byLandscapePhone;
  });
  const [formData, setFormData] = useState({
    nome: "",
    dataNascimento: "",
    genero: "Masculino",
    whatsapp: "",
    turma: "",
    horario: "",
    professor: "",
    nivel: "",
    categoria: "",
    parQ: "Não",
    atestado: false,
    dataAtestado: "",
  });

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

  const maskDateInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const normalizeDateValue = (value: string) => {
    if (!value) return "";
    const raw = value.trim();
    if (raw.includes("-")) {
      const datePart = raw.split("T")[0];
      const [year, month, day] = datePart.split("-").map(Number);
      if (day && month && year) {
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      }
    }
    if (raw.includes("/")) return raw;
    return maskDateInput(raw);
  };

  const parseDateParts = (dateString: string) => {
    if (!dateString || !dateString.includes("/")) return null;
    const [day, month, year] = dateString.split("/").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  };

  const isValidDateString = (dateString: string) => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return false;
    const [day, month, year] = dateString.split("/").map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return false;
    return (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    );
  };

  const calculateAge = (dateString: string) => {
    const birthDate = parseDateParts(dateString);
    if (!birthDate || Number.isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return isNaN(age) ? 0 : age;
  };

  const getCategoriaByAge = (age: number) => {
    if (!Number.isFinite(age) || age < 6) return "";
    let result = "";
    categoriaRules.forEach((rule) => {
      if (age >= rule.min) result = rule.label;
    });
    return result;
  };

  const formatHorario = (value: string) => {
    const masked = maskHorarioInput(value || "");
    return isValidHorarioPartial(masked) ? masked : value;
  };

  const nameParticles = new Set(["da", "de", "do", "das", "dos", "e"]);

  const resolveStudentName = (student: ExcludedStudent) => {
    return String(
      student.nome ||
      student.Nome ||
      student.aluno ||
      student.aluno_nome ||
      student.alunoNome ||
      ""
    ).trim();
  };

  const readExcludedStudentsLocal = () => {
    try {
      const raw = localStorage.getItem("excludedStudents");
      if (!raw) return [] as ExcludedStudent[];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ExcludedStudent[]) : [];
    } catch {
      return [] as ExcludedStudent[];
    }
  };

  const loadExclusionsState = useCallback(async () => {
    const loadLocal = () => {
      const local = sanitizeExcludedStudents(readExcludedStudentsLocal());
      setStudents(local);
      localStorage.setItem("excludedStudents", JSON.stringify(local));
    };

    try {
      const response = await getExcludedStudents();
      const data = response?.data;
      const fromFallback = Boolean((response as any)?._fromFallback);
      setIsLoadFromFallback(fromFallback);
      setWriteOpFailed(isExclusionsWriteFailed());

      if (Array.isArray(data)) {
        const local = sanitizeExcludedStudents(readExcludedStudentsLocal());
        const resolved = fromFallback ? local : sanitizeExcludedStudents(data as ExcludedStudent[]);
        setStudents(resolved);
        localStorage.setItem("excludedStudents", JSON.stringify(resolved));
      } else {
        loadLocal();
      }
    } catch {
      loadLocal();
      setIsLoadFromFallback(true);
    }
  }, []);

  const refreshExclusions = useCallback(async () => {
    try {
      await loadExclusionsState();
    } catch {
      // state is already updated by loadExclusionsState
    }
  }, [loadExclusionsState]);

  const markWriteFailureAndRefresh = useCallback(async () => {
    setWriteOpFailed(true);
    await refreshExclusions();
  }, [refreshExclusions]);

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 768px)");
    const landscapePhoneQuery = window.matchMedia("(max-width: 1024px) and (max-height: 500px)");

    const syncViewport = () => {
      setIsCompactViewport(compactQuery.matches || landscapePhoneQuery.matches);
    };

    syncViewport();

    const onCompactChange = () => syncViewport();
    const onLandscapeChange = () => syncViewport();

    if (typeof compactQuery.addEventListener === "function") {
      compactQuery.addEventListener("change", onCompactChange);
      landscapePhoneQuery.addEventListener("change", onLandscapeChange);
    } else {
      compactQuery.addListener(onCompactChange);
      landscapePhoneQuery.addListener(onLandscapeChange);
    }

    return () => {
      if (typeof compactQuery.removeEventListener === "function") {
        compactQuery.removeEventListener("change", onCompactChange);
        landscapePhoneQuery.removeEventListener("change", onLandscapeChange);
      } else {
        compactQuery.removeListener(onCompactChange);
        landscapePhoneQuery.removeListener(onLandscapeChange);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    refreshExclusions();

    const onVisibility = () => {
      if (!isMounted) return;
      if (document.visibilityState === "visible") {
        refreshExclusions();
      }
    };

    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshExclusions]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("activeClasses");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const turmaLabels = new Set<string>();
      const professors = new Set<string>();
      parsed.forEach((cls: any) => {
        const turma = String(cls.Turma || "").trim();
        if (turma) turmaLabels.add(turma);
        if (cls.Professor) professors.add(String(cls.Professor));
      });
      const turmaList = Array.from(turmaLabels).sort();
      setTurmaOptions(turmaList);
      if (!lastTurma && turmaList.length > 0) {
        setLastTurma(turmaList[0]);
      }
      setProfessorOptions(Array.from(professors));
    } catch {
      // ignore
    }
  }, [lastTurma]);

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const normalizeHorarioDigits = (value?: string) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 3) return `0${digits}`;
    if (digits.length >= 4) return digits.slice(0, 4);
    return digits;
  };

  const getStudentUid = (student: ExcludedStudent) =>
    String(student.student_uid || student.studentUid || "").trim();

  const getStudentId = (student: ExcludedStudent) =>
    String(student.id || "").trim();

  const getStudentTurmaSet = (student: ExcludedStudent) => {
    const values = [
      student.turma,
      student.Turma,
      student.turmaLabel,
      student.TurmaLabel,
      student.turmaCodigo,
      student.TurmaCodigo,
      student.grupo,
      student.Grupo,
    ]
      .map((value) => normalizeText(String(value || "")))
      .filter(Boolean);
    return new Set(values);
  };

  const exclusionsMatch = (left: ExcludedStudent, right: ExcludedStudent) => {
    const leftUid = getStudentUid(left);
    const rightUid = getStudentUid(right);
    if (leftUid && rightUid && leftUid === rightUid) return true;

    const leftId = getStudentId(left);
    const rightId = getStudentId(right);
    if (leftId && rightId && leftId === rightId) return true;

    const leftName = normalizeText(resolveStudentName(left));
    const rightName = normalizeText(resolveStudentName(right));
    if (!leftName || !rightName || leftName !== rightName) return false;

    const leftTurmas = getStudentTurmaSet(left);
    const rightTurmas = getStudentTurmaSet(right);
    const hasTurmaContext = leftTurmas.size > 0 && rightTurmas.size > 0;
    const turmaMatches =
      !hasTurmaContext ||
      Array.from(leftTurmas).some((value) => rightTurmas.has(value));
    if (!turmaMatches) return false;

    const leftHorario = normalizeHorarioDigits(String(left.horario || left.Horario || ""));
    const rightHorario = normalizeHorarioDigits(String(right.horario || right.Horario || ""));
    const hasHorarioContext = Boolean(leftHorario && rightHorario);
    if (hasHorarioContext && leftHorario !== rightHorario) return false;

    const leftProfessor = normalizeText(String(left.professor || left.Professor || ""));
    const rightProfessor = normalizeText(String(right.professor || right.Professor || ""));
    const hasProfessorContext = Boolean(leftProfessor && rightProfessor);
    if (hasProfessorContext && leftProfessor !== rightProfessor) return false;

    return hasTurmaContext || hasHorarioContext || hasProfessorContext;
  };

  const getExclusionRowKey = (student: ExcludedStudent, idx?: number) => {
    const stableKey = getStudentUid(student) || getStudentId(student) || resolveStudentName(student) || "aluno";
    return `${stableKey}-${typeof idx === "number" ? idx : "x"}`;
  };

  const sanitizeExcludedStudents = (list: ExcludedStudent[]) => {
    const source = Array.isArray(list) ? list : [];
    const cleaned: ExcludedStudent[] = [];

    source.forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const item: ExcludedStudent = {
        ...raw,
        horario: normalizeHorarioDigits(String(raw.horario || raw.Horario || "")),
      };

      const hasUid = Boolean(getStudentUid(item));
      const hasName = Boolean(normalizeText(resolveStudentName(item)));
      if (!hasUid && !hasName) return;

      const existingIndex = cleaned.findIndex((candidate) => exclusionsMatch(candidate, item));
      if (existingIndex >= 0) {
        cleaned[existingIndex] = { ...cleaned[existingIndex], ...item };
      } else {
        cleaned.push(item);
      }
    });

    return cleaned;
  };

  const resolveClassFromTriple = (turma: string, horario: string, professor: string) => {
    try {
      const raw = localStorage.getItem("activeClasses");
      if (!raw) return null;
      const classes = JSON.parse(raw) as Array<{
        Grupo?: string;
        Turma?: string;
        TurmaCodigo?: string;
        Horario?: string;
        Professor?: string;
      }>;
      const turmaNorm = normalizeText(turma || "");
      const horarioNorm = normalizeHorarioDigits(horario || "");
      const professorNorm = normalizeText(professor || "");
      return (
        classes.find((cls) => {
          const labelNorm = normalizeText(cls.Turma || "");
          const codeNorm = normalizeText(cls.Grupo || cls.TurmaCodigo || "");
          const clsHorario = normalizeHorarioDigits(cls.Horario || "");
          const clsProfessor = normalizeText(cls.Professor || "");
          const turmaMatches = turmaNorm && (turmaNorm === labelNorm || turmaNorm === codeNorm);
          return turmaMatches && clsHorario === horarioNorm && clsProfessor === professorNorm;
        }) || null
      );
    } catch {
      return null;
    }
  };

  const resolveTurmaLabel = (value: string) => {
    if (!value) return "";
    const normalized = value.toLowerCase();
    if (normalized.includes("quarta") || normalized.includes("sexta")) {
      return "Quarta e Sexta";
    }
    if (normalized.includes("terca") || normalized.includes("terça") || normalized.includes("quinta")) {
      return "Terça e Quinta";
    }
    return value;
  };

  const resolveStudentTurmaLabel = (student: ExcludedStudent) => {
    const raw = String(student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "").trim();
    const horario = String(student.horario || student.Horario || "");
    const professor = String(student.professor || student.Professor || "");

    const cls = resolveClassFromTriple(raw, horario, professor);
    const fromClass = String(cls?.Turma || "").trim();
    if (fromClass) return fromClass;

    return resolveTurmaLabel(raw) || "-";
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

  const getDisplayStudentName = (student: ExcludedStudent) => {
    const fullName = resolveStudentName(student);
    if (!isCompactViewport) return fullName || "-";
    const display = formatMobileStudentName(fullName);
    return display || "-";
  };

  const isReadOnlyMode = isLoadFromFallback || writeOpFailed;

  const handleRestoreClick = (student: ExcludedStudent) => {
    if (isReadOnlyMode) {
      alert("⚠️ Backend não está disponível!\n\nOperações de restauração estão bloqueadas.\n\nPor favor, verifique sua conexão com o servidor e tente novamente.");
      return;
    }
    const rawTurma = resolveStudentTurmaLabel(student);
    const turmaValue = resolveTurmaLabel(rawTurma) || lastTurma || rawTurma;
    const dataNascimento = normalizeDateValue(student.dataNascimento || "").trim();
    const idade = calculateAge(dataNascimento);
    const categoriaCalc = getCategoriaByAge(idade) || student.categoria || "";

    setEditingStudent(student);
    if (turmaValue) {
      setLastTurma(turmaValue);
    }
    setFormData({
      nome: student.nome || student.Nome || "",
      dataNascimento,
      genero: student.genero || "Masculino",
      whatsapp: student.whatsapp || "",
      turma: turmaValue,
      horario: formatHorario(student.horario || student.Horario || ""),
      professor: student.professor || student.Professor || "",
      nivel: student.nivel || "",
      categoria: categoriaCalc,
      parQ: student.parQ || "Não",
      atestado: !!student.atestado,
      dataAtestado: normalizeDateValue(student.dataAtestado || ""),
    });
    setShowModal(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    let newValue: string | boolean = type === "checkbox" ? checked : value;

    setFormData((prev) => {
      if (name === "horario" && typeof newValue === "string") {
        const masked = maskHorarioInput(newValue);
        if (!isValidHorarioPartial(masked)) return prev;
        newValue = masked;
      }

      if (name === "dataNascimento" && typeof newValue === "string") {
        const masked = maskDateInput(newValue);
        const idade = calculateAge(masked);
        const categoria = getCategoriaByAge(idade);
        return { ...prev, [name]: masked, categoria };
      }

      if (name === "dataAtestado" && typeof newValue === "string") {
        const masked = maskDateInput(newValue);
        return { ...prev, [name]: masked };
      }

      return { ...prev, [name]: newValue };
    });
  };

  const confirmRestore = async () => {
    if (!editingStudent) return;
    if (!formData.turma) {
      alert("Por favor, defina uma turma para restaurar o aluno.");
      return;
    }

    const classMatch = resolveClassFromTriple(formData.turma, formData.horario, formData.professor);
    const turmaLabel = classMatch?.Turma || formData.turma;
    const turmaCodigo = classMatch?.Grupo || classMatch?.TurmaCodigo || editingStudent.grupo || editingStudent.turmaCodigo || editingStudent.Grupo || editingStudent.TurmaCodigo || "";

    const restorePayload = {
      id: editingStudent.id,
      nome: formData.nome,
      turma: turmaLabel,
      horario: formData.horario,
      professor: formData.professor,
    };

    try {
      await restoreStudent(restorePayload);
    } catch {
      alert("Falha ao restaurar no backend.");
      await markWriteFailureAndRefresh();
      return;
    }

    const restoredStudent = {
      ...editingStudent,
      ...formData,
      turma: turmaLabel,
      grupo: turmaCodigo,
      turmaLabel,
      turmaCodigo,
      idade: calculateAge(formData.dataNascimento),
      dataExclusao: undefined,
      DataExclusao: undefined,
      Nome: undefined,
      Turma: undefined,
      Professor: undefined,
    };

    const activeStudents = JSON.parse(localStorage.getItem("activeStudents") || "[]");
    activeStudents.push(restoredStudent);
    localStorage.setItem("activeStudents", JSON.stringify(activeStudents));

    await refreshExclusions();

    setShowModal(false);
    setEditingStudent(null);
    alert(`Aluno ${formData.nome} restaurado com sucesso para a turma ${formData.turma}!`);
  };

  const handlePermanentDelete = async (student: ExcludedStudent) => {
    if (isReadOnlyMode) {
      alert("⚠️ Backend não está disponível!\n\nOperações de exclusão estão bloqueadas.\n\nPor favor, verifique sua conexão com o servidor e tente novamente.");
      return;
    }
    if (!confirm(`Excluir definitivamente ${getDisplayStudentName(student)}?`)) return;
    const payload = {
      id: student.id,
      nome: student.nome || student.Nome,
      turma: student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "",
      horario: student.horario || student.Horario || "",
      professor: student.professor || student.Professor || "",
    };

    try {
      await deleteExclusion(payload);
    } catch (err: any) {
      const msg = err?.data?.error || "Falha ao excluir no backend.";
      alert(`${msg}`);
      await markWriteFailureAndRefresh();
      return;
    }

    await refreshExclusions();
  };

  const persistExclusionReason = async (student: ExcludedStudent, reason: string) => {
    if (isReadOnlyMode) {
      alert("Operação bloqueada enquanto os dados estiverem em fallback.");
      await refreshExclusions();
      return;
    }

    const normalized = reason.trim();
    const payload = {
      ...student,
      nome: student.nome || student.Nome || "",
      turma: student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "",
      horario: student.horario || student.Horario || "",
      professor: student.professor || student.Professor || "",
      dataExclusao: student.dataExclusao || student.DataExclusao || "",
      motivo_exclusao: normalized,
    };

    try {
      await addExclusion(payload);
    } catch {
      alert("Falha ao atualizar o motivo da exclusão no backend.");
      await markWriteFailureAndRefresh();
      return;
    }

    await refreshExclusions();
  };

  const persistExclusionDate = async (student: ExcludedStudent, dateExclusao: string) => {
    if (isReadOnlyMode) {
      alert("Operação bloqueada enquanto os dados estiverem em fallback.");
      await refreshExclusions();
      return;
    }

    const payload = {
      ...student,
      nome: student.nome || student.Nome || "",
      turma: student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "",
      horario: student.horario || student.Horario || "",
      professor: student.professor || student.Professor || "",
      dataExclusao: dateExclusao,
      motivo_exclusao: (student.motivo_exclusao || student.MotivoExclusao || "").trim(),
    };

    try {
      await addExclusion(payload);
    } catch {
      alert("Falha ao atualizar a data da exclusão no backend.");
      await markWriteFailureAndRefresh();
      return;
    }

    await refreshExclusions();
  };

  const beginDateEdit = (student: ExcludedStudent, rowKey: string) => {
    if (isReadOnlyMode) {
      alert("Operação bloqueada enquanto os dados estiverem em fallback.");
      return;
    }
    setEditingDateKey(rowKey);
    setEditingDateValue(normalizeDateValue(student.dataExclusao || student.DataExclusao || ""));
  };

  const cancelDateEdit = () => {
    setEditingDateKey(null);
    setEditingDateValue("");
  };

  const commitDateEdit = async (student: ExcludedStudent, rowKey: string) => {
    if (editingDateKey !== rowKey) return;
    if (isReadOnlyMode) {
      cancelDateEdit();
      return;
    }
    const normalized = normalizeDateValue(editingDateValue).trim();
    if (!isValidDateString(normalized)) {
      alert("Data inválida. Use o formato dd/mm/aaaa.");
      return;
    }

    await persistExclusionDate(student, normalized);
    cancelDateEdit();
  };

  const normalizedSearch = normalizeText(nameSearch || "");
  const filteredStudents = students.filter((student) => {
    if (!normalizedSearch) return true;
    return normalizeText(resolveStudentName(student)).includes(normalizedSearch);
  });

  const effectiveTurmaOptions =
    turmaOptions.length > 0
      ? turmaOptions
      : Array.from(
          new Set(
            students
              .map((student) => student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "")
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          )
        ).sort();

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ marginBottom: "15px", color: "#2c3e50" }}>Alunos Excluídos</h3>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "10px" }}>
          Total: {filteredStudents.length} aluno(s)
          {filteredStudents.length !== students.length ? ` (de ${students.length})` : ""}
        </p>
        {(isLoadFromFallback || writeOpFailed) && (
          <div style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: "6px",
            padding: "12px 14px",
            marginBottom: "15px",
            color: "#856404",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span>
              <strong>Backend não disponível:</strong> Os dados de exclusão estão em modo offline (cache local).
              Operações de edição, exclusão e restauração estão bloqueadas até que o servidor fique disponível.
            </span>
            <button
              type="button"
              onClick={() => {
                loadExclusionsState().catch(() => {
                  // no-op
                });
              }}
              style={{
                marginLeft: "auto",
                border: "1px solid #d39e00",
                background: "#ffe08a",
                color: "#7a5d00",
                borderRadius: "6px",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              Recarregar agora
            </button>
          </div>
        )}
        <input
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          placeholder="Buscar por nome do aluno"
          style={{
            width: "min(420px, 100%)",
            padding: "9px 10px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            fontSize: "14px",
          }}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "1100px", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.6fr 1fr 1.6fr",
              gap: "8px",
              padding: "12px 14px",
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            <span style={{ textAlign: "left" }}>Nome</span>
            <span>Turma</span>
            <span>Horário</span>
            <span>Professor</span>
            <span>Motivo</span>
            <span>Data da exclusão</span>
            <span>Ações</span>
          </div>

          {filteredStudents.map((student, idx) => {
            const rowKey = getExclusionRowKey(student, idx);
            const isEditingRowDate = editingDateKey === rowKey;
            return (
            <div
              key={rowKey}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.6fr 1fr 1.6fr",
                gap: "8px",
                padding: "12px 14px",
                borderBottom: idx === filteredStudents.length - 1 ? "none" : "1px solid #f1f5f9",
                background: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                alignItems: "center",
                fontSize: "14px",
                color: "#1f2937",
                textAlign: "center",
              }}
            >
              <span style={{ fontWeight: 600, textAlign: "left" }}>{getDisplayStudentName(student)}</span>
              <span>{resolveStudentTurmaLabel(student)}</span>
              <span>{formatHorario(student.horario || student.Horario || "") || "-"}</span>
              <span>{student.professor || student.Professor || "-"}</span>
              <select
                value={student.motivo_exclusao || student.MotivoExclusao || ""}
                disabled={isReadOnlyMode}
                onChange={(e) => {
                  const value = e.target.value;
                  persistExclusionReason(student, value);
                }}
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  padding: "7px 8px",
                  fontSize: "13px",
                  textAlign: "center",
                  background: isReadOnlyMode ? "#f3f4f6" : "white",
                  color: isReadOnlyMode ? "#6b7280" : "#111827",
                  cursor: isReadOnlyMode ? "not-allowed" : "pointer",
                }}
              >
                <option value="">Selecionar</option>
                {exclusionReasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {(student.motivo_exclusao || student.MotivoExclusao) &&
                  !exclusionReasonOptions.includes((student.motivo_exclusao || student.MotivoExclusao || "").trim()) && (
                    <option value={student.motivo_exclusao || student.MotivoExclusao}>
                      {student.motivo_exclusao || student.MotivoExclusao}
                    </option>
                  )}
              </select>
              {isEditingRowDate ? (
                <input
                  className="exclusion-date-edit-input"
                  autoFocus
                  value={editingDateValue}
                  onChange={(e) => setEditingDateValue(maskDateInput(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => {
                    commitDateEdit(student, rowKey);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitDateEdit(student, rowKey);
                    }
                    if (e.key === "Escape") {
                      cancelDateEdit();
                    }
                  }}
                  placeholder="dd/mm/aaaa"
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    padding: "7px 8px",
                    fontSize: "13px",
                    textAlign: "center",
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => beginDateEdit(student, rowKey)}
                  title={isReadOnlyMode ? "Indisponível em modo fallback" : "Clique para editar a data"}
                  disabled={isReadOnlyMode}
                  style={{
                    background: isReadOnlyMode ? "#f3f4f6" : "transparent",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    cursor: isReadOnlyMode ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    color: isReadOnlyMode ? "#6b7280" : "#1f2937",
                    opacity: isReadOnlyMode ? 0.7 : 1,
                  }}
                >
                  {normalizeDateValue(student.dataExclusao || student.DataExclusao || "") || "-"}
                </button>
              )}
              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <button
                  onClick={() => handleRestoreClick(student)}
                  disabled={writeOpFailed}
                  style={{
                    background: writeOpFailed ? "#ccc" : "#2563eb",
                    border: "none",
                    color: writeOpFailed ? "#666" : "white",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    cursor: writeOpFailed ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    fontWeight: "bold",
                    opacity: writeOpFailed ? 0.6 : 1,
                  }}
                  title={writeOpFailed ? "Operacao indisponivel" : "Restaurar aluno"}
                >
                  Restaurar
                </button>
                <button
                  onClick={() => handlePermanentDelete(student)}
                  disabled={writeOpFailed}
                  title={writeOpFailed ? "Operacao indisponivel" : "Excluir aluno"}
                  style={{
                    background: writeOpFailed ? "#ccc" : "#dc3545",
                    border: "none",
                    color: writeOpFailed ? "#666" : "white",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: writeOpFailed ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    opacity: writeOpFailed ? 0.6 : 1,
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {filteredStudents.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          {students.length === 0 ? "Nenhum aluno excluído" : "Nenhum aluno encontrado pela busca"}
        </div>
      )}

      {showModal && (
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
          <div
            style={{
              background: "white",
              padding: "25px",
              borderRadius: "12px",
              width: "500px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                borderBottom: "1px solid #eee",
                paddingBottom: "10px",
              }}
            >
              <h2 style={{ margin: 0, color: "#2c3e50" }}>Restaurar Aluno</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", color: "#666" }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: "#fff3cd",
                color: "#856404",
                padding: "10px",
                borderRadius: "6px",
                marginBottom: "15px",
                fontSize: "13px",
              }}
            >
              ⚠️ Verifique os dados e defina a nova turma antes de restaurar.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Nome Completo
                </label>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Turma (Obrigatório)
                </label>
                <select
                  name="turma"
                  value={formData.turma}
                  onChange={(e) => {
                    handleInputChange(e);
                    setLastTurma(e.target.value);
                  }}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "2px solid #f39c12", background: "#fffbeb" }}
                >
                  {effectiveTurmaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Horário
                </label>
                <input
                  name="horario"
                  value={formData.horario}
                  onChange={handleInputChange}
                  placeholder="00:00"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Professor
                </label>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  {professorOptions.map((prof) => (
                    <label key={prof} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="professor"
                        value={prof}
                        checked={formData.professor === prof}
                        onChange={handleInputChange}
                      />
                      {prof}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Nível
                </label>
                <input
                  name="nivel"
                  value={formData.nivel}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Categoria
                </label>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#555", padding: "6px 0" }}>
                  {formData.categoria || "-"}
                </div>
              </div>


              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  WhatsApp
                </label>
                <input
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleInputChange}
                  placeholder="(##) # ####-####"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  ParQ (Apto para atividade física?)
                </label>
                <div style={{ display: "flex", gap: "20px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Sim" checked={formData.parQ === "Sim"} onChange={handleInputChange} /> Sim
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Não" checked={formData.parQ === "Não"} onChange={handleInputChange} /> Não
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
                    style={{ width: "16px", height: "16px" }}
                  />
                  Possui Atestado Médico?
                </label>

                {formData.atestado && (
                  <input
                    name="dataAtestado"
                    value={formData.dataAtestado}
                    onChange={handleInputChange}
                    placeholder="Data do Atestado (dd/mm/aaaa)"
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "25px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "#ccc", color: "#333", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmRestore}
                style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Confirmar Restauração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exclusions;
