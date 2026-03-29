import React, { useEffect, useMemo, useState } from "react";
import { getBootstrap, getExcludedStudents } from "../api";
import "./Vacancies.css";

type Periodo = "Todos" | "Manhã" | "Tarde";

interface ActiveStudentLite {
  id?: string;
  studentUid?: string;
  nome?: string;
  nivel?: string;
  turma?: string;
  grupo?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
}

interface TurmaMeta {
  turma: string;
  turmaLabel: string;
  horario: string;
  nivel: string;
  professor: string;
  capacidade: number;
}

interface BootstrapClassLite {
  id: number;
  grupo?: string;
  codigo: string;
  turmaLabel: string;
  horario: string;
  nivel: string;
  professor: string;
  capacidade: number;
}

interface ExclusionLite {
  id?: string;
  student_uid?: string;
  studentUid?: string;
  nome?: string;
  Nome?: string;
  turma?: string;
  turmaLabel?: string;
  grupo?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  Turma?: string;
  TurmaLabel?: string;
  Grupo?: string;
  TurmaCodigo?: string;
  Horario?: string;
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

const exclusionMergeKey = (item: ExclusionLite) => {
  const uid = String(item?.student_uid || item?.studentUid || "").trim();
  if (uid) return `uid:${uid}`;
  const id = String(item?.id || "").trim();
  if (id) return `id:${id}`;
  const name = normalizeText(String(item?.nome || item?.Nome || ""));
  const turma = normalizeText(
    String(item?.turma || item?.Turma || item?.turmaLabel || item?.TurmaLabel || item?.grupo || item?.Grupo || item?.turmaCodigo || item?.TurmaCodigo || "")
  );
  const horario = normalizeHorarioKey(String(item?.horario || item?.Horario || ""));
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
    nivel: String(student?.nivel || ""),
    turma: String(student?.turma || student?.turmaLabel || ""),
    grupo: String(student?.grupo || student?.turmaCodigo || ""),
    turmaCodigo: String(student?.turmaCodigo || student?.grupo || ""),
    horario: String(student?.horario || ""),
    professor: String(student?.professor || ""),
  }));

  const classes: BootstrapClassLite[] = localClassesRaw.map((cls) => ({
    id: Number(cls?.id || 0),
    grupo: String(cls?.Grupo || cls?.grupo || cls?.TurmaCodigo || cls?.turmaCodigo || cls?.Atalho || cls?.codigo || ""),
    codigo: String(cls?.Atalho || cls?.codigo || cls?.TurmaCodigo || cls?.turmaCodigo || ""),
    turmaLabel: String(cls?.Turma || cls?.turmaLabel || cls?.turma || cls?.codigo || ""),
    horario: String(cls?.Horario || cls?.horario || ""),
    nivel: String(cls?.Nivel || cls?.nivel || ""),
    professor: String(cls?.Professor || cls?.professor || ""),
    capacidade: Math.max(0, Number(cls?.CapacidadeMaxima ?? cls?.Capacidade ?? cls?.capacidade ?? 0)),
  }));

  return {
    students,
    classes,
    exclusions: localExcludedRaw as ExclusionLite[],
  };
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

const getHorarioSortValue = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return Number.parseInt(digits.slice(0, 4), 10);
  if (digits.length === 3) return Number.parseInt(`0${digits}`, 10);
  return Number.MAX_SAFE_INTEGER;
};

const parsePeriodo = (horario: string): Periodo => {
  if (!horario) return "Todos";
  const normalized = formatHorario(horario);
  const hour = parseInt(normalized.split(":")[0], 10);
  if (Number.isNaN(hour)) return "Todos";
  return hour < 12 ? "Manhã" : "Tarde";
};

const normalizeText = (value: string) => String(value || "").trim().toLowerCase();

const normalizeHorarioKey = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 3) return `0${digits}`;
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
};

const buildClassKey = (turmaLabel: string, horario: string, nivel: string, professor: string) =>
  `${normalizeText(turmaLabel)}||${normalizeHorarioKey(horario)}||${normalizeText(nivel)}||${normalizeText(professor)}`;

const formatNivelLabel = (nivel: string) => {
  const raw = String(nivel || "").trim();
  if (!raw) return "-";
  const normalized = raw.replace(/^(nivel\s*)/i, "").trim();
  const spaced = normalized.replace(/^(\d+)([A-Za-z])$/, "$1 $2");
  return `Nível ${spaced}`;
};

export const Vacancies: React.FC = () => {
  const [studentsSnapshot, setStudentsSnapshot] = useState<ActiveStudentLite[]>([]);
  const [classesSnapshot, setClassesSnapshot] = useState<BootstrapClassLite[]>([]);
  const [excludedSnapshot, setExcludedSnapshot] = useState<ExclusionLite[]>([]);
  const [showVagasDisponiveisDetalhe, setShowVagasDisponiveisDetalhe] = useState(false);
  const [expandedNiveis, setExpandedNiveis] = useState<Record<string, boolean>>({});
  const [selectedNivelDetailFilter, setSelectedNivelDetailFilter] = useState<{ nivelKey: string; subdivKey: string | null } | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  const [nivelFiltro, setNivelFiltro] = useState<string>("Todos");
  const [turmaLabelFiltro, setTurmaLabelFiltro] = useState<string>("Todos");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("Todos");

  const getNivelDetails = (nivelRaw: string) => {
    const original = String(nivelRaw || "").trim();
    const lowered = normalizeText(original)
      .replace(/[áàãâä]/g, "a")
      .replace(/[éèêë]/g, "e")
      .replace(/[íìîï]/g, "i")
      .replace(/[óòõôö]/g, "o")
      .replace(/[úùûü]/g, "u")
      .replace(/ç/g, "c");

    const fallbackLabel = formatNivelLabel(original);

    if (!lowered) {
      return {
        simpleKey: "sem-nivel",
        simpleLabel: "Sem nível",
        subdivisao: "",
      };
    }

    if (lowered.includes("iniciac")) {
      const subMatch = lowered.match(/(?:iniciac[a-z]*)\s*([a-z])$/i);
      return {
        simpleKey: "iniciacao",
        simpleLabel: "Iniciação",
        subdivisao: subMatch ? subMatch[1].toUpperCase() : "",
      };
    }

    if (lowered.includes("adult")) {
      const subMatch = lowered.match(/(?:adult[a-z]*)\s*([a-z])$/i);
      return {
        simpleKey: "adulto",
        simpleLabel: "Adulto",
        subdivisao: subMatch ? subMatch[1].toUpperCase() : "",
      };
    }

    const normalized = lowered.replace(/nivel\s*/g, "").replace(/\s+/g, " ").trim();
    const compact = normalized.replace(/\s+/g, "");
    const directMatch = compact.match(/^(\d+)([a-z])?$/i);
    if (directMatch) {
      const numero = directMatch[1];
      return {
        simpleKey: `nivel-${numero}`,
        simpleLabel: `Nível ${numero}`,
        subdivisao: directMatch[2] ? directMatch[2].toUpperCase() : "",
      };
    }

    const looseNumberMatch = lowered.match(/(\d+)\s*([a-z])?$/i);
    if (looseNumberMatch) {
      const numero = looseNumberMatch[1];
      return {
        simpleKey: `nivel-${numero}`,
        simpleLabel: `Nível ${numero}`,
        subdivisao: looseNumberMatch[2] ? looseNumberMatch[2].toUpperCase() : "",
      };
    }

    return {
      simpleKey: `raw-${normalizeText(fallbackLabel)}`,
      simpleLabel: fallbackLabel,
      subdivisao: "",
    };
  };

  const getNivelRank = (simpleKey: string, simpleLabel: string) => {
    if (simpleKey === "iniciacao") return 0;
    const match = simpleKey.match(/^nivel-(\d+)$/i);
    if (match) return Number.parseInt(match[1], 10);
    if (simpleKey === "adulto") return 5;
    if (simpleKey === "sem-nivel") return 999;
    return 500 + normalizeText(simpleLabel).charCodeAt(0);
  };

  const loadBootstrap = () => {
    setLoadingBootstrap(true);
    return Promise.all([getBootstrap(), getExcludedStudents()])
      .then(([bootstrapResponse, exclusionsResponse]) => {
        const localSnapshot = readLocalVacancySnapshot();
        const data = bootstrapResponse.data as {
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
          }>;
          students: Array<{
            id: number;
            student_uid?: string;
            class_id: number;
            nome: string;
            categoria: string;
            nivel: string;
            horario: string;
          }>;
        };

        const backendExclusions = Array.isArray(exclusionsResponse?.data)
          ? (exclusionsResponse.data as ExclusionLite[])
          : [];
        const mergedExclusionsMap = new Map<string, ExclusionLite>();
        [...localSnapshot.exclusions, ...backendExclusions].forEach((item) => {
          mergedExclusionsMap.set(exclusionMergeKey(item), item);
        });
        const mergedExclusions = Array.from(mergedExclusionsMap.values());

        const classById = new Map<number, (typeof data.classes)[number]>();
        data.classes.forEach((cls) => classById.set(cls.id, cls));

        const mappedStudents = data.students.map((student) => {
          const cls = classById.get(student.class_id);
          return {
            id: String(student.id),
            studentUid: String(student.student_uid || ""),
            nome: student.nome,
            nivel: cls?.nivel || student.nivel || "",
            turma: cls?.turma_label || cls?.codigo || "",
            grupo: cls?.grupo || cls?.codigo || "",
            turmaCodigo: cls?.grupo || cls?.codigo || "",
            horario: cls?.horario || "",
            professor: cls?.professor || "",
          } as ActiveStudentLite;
        });

        const mappedClasses: BootstrapClassLite[] = data.classes.map((cls) => ({
          id: cls.id,
          grupo: cls.grupo || cls.codigo || "",
          codigo: cls.codigo || "",
          turmaLabel: cls.turma_label || cls.codigo || "",
          horario: cls.horario || "",
          nivel: cls.nivel || "",
          professor: cls.professor || "",
          capacidade: Number(cls.capacidade || 0),
        }));

        setStudentsSnapshot(localSnapshot.students.length > 0 ? localSnapshot.students : mappedStudents);
        setClassesSnapshot(localSnapshot.classes.length > 0 ? localSnapshot.classes : mappedClasses);
        setExcludedSnapshot(mergedExclusions);
        localStorage.setItem("excludedStudents", JSON.stringify(mergedExclusions));
      })
      .catch(() => {
        const localSnapshot = readLocalVacancySnapshot();
        setStudentsSnapshot(localSnapshot.students);
        setClassesSnapshot(localSnapshot.classes);
        setExcludedSnapshot(localSnapshot.exclusions);
      })
      .finally(() => {
        setLoadingBootstrap(false);
      });
  };

  // load on mount
  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    let lastExclusionCount = excludedSnapshot.length;
    
    const checkForUpdates = () => {
      const localSnapshot = readLocalVacancySnapshot();
      const currentExclusionCount = localSnapshot.exclusions.length;
      
      // If exclusion count changed, force full update
      if (currentExclusionCount !== lastExclusionCount) {
        lastExclusionCount = currentExclusionCount;
        setStudentsSnapshot(localSnapshot.students);
        setClassesSnapshot(localSnapshot.classes);
        setExcludedSnapshot(localSnapshot.exclusions);
      }
    };

    const intervalId = window.setInterval(checkForUpdates, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const turmaMeta = useMemo(() => {
    const meta: Record<string, TurmaMeta> = {};
    classesSnapshot.forEach((cls) => {
      const turmaLabel = cls.turmaLabel || cls.codigo || "";
      const key = buildClassKey(turmaLabel, cls.horario || "", cls.nivel || "", cls.professor || "");
      if (!key) return;
      const resolvedProfessor =
        cls.professor ||
        classesSnapshot.find(
          (candidate) =>
            buildClassKey(candidate.turmaLabel || candidate.codigo || "", candidate.horario || "", candidate.nivel || "", candidate.professor || "") === key &&
            String(candidate.professor || "").trim()
        )?.professor ||
        "-";

      meta[key] = {
        turma: key,
        turmaLabel,
        horario: cls.horario || "-",
        nivel: cls.nivel || "-",
        professor: resolvedProfessor,
        capacidade: Math.max(0, Number(cls.capacidade || 0)),
      };
    });
    return meta;
  }, [classesSnapshot]);

  const niveis = useMemo(() => {
    const unique = new Map<string, string>();
    classesSnapshot.forEach((item) => {
      const details = getNivelDetails(item.nivel || "");
      if (!details.simpleKey) return;
      unique.set(details.simpleKey, details.simpleLabel);
    });
    const ordered = Array.from(unique.entries())
      .sort((a, b) => {
        const byRank = getNivelRank(a[0], a[1]) - getNivelRank(b[0], b[1]);
        if (byRank !== 0) return byRank;
        return a[1].localeCompare(b[1]);
      })
      .map((entry) => entry[1]);
    return ["Todos", ...ordered];
  }, [classesSnapshot]);

  const turmaLabels = useMemo(() => {
    const unique = new Set<string>();
    classesSnapshot.forEach((item) => item.turmaLabel && unique.add(item.turmaLabel));
    return ["Todos", ...Array.from(unique).sort()];
  }, [classesSnapshot]);

  const filteredClasses = useMemo(() => {
    return classesSnapshot.filter((item) => {
      const nivelDetails = getNivelDetails(item.nivel || "");
      if (nivelFiltro !== "Todos" && nivelDetails.simpleLabel !== nivelFiltro) return false;
      if (turmaLabelFiltro !== "Todos" && item.turmaLabel !== turmaLabelFiltro) return false;
      if (periodoFiltro !== "Todos") {
        const periodo = parsePeriodo(item.horario || "");
        if (periodo !== periodoFiltro) return false;
      }
      return true;
    });
  }, [classesSnapshot, nivelFiltro, turmaLabelFiltro, periodoFiltro]);

  const turmasFiltradas = useMemo(() => {
    return filteredClasses
      .map((item) => buildClassKey(item.turmaLabel || item.codigo || "", item.horario || "", item.nivel || "", item.professor || ""))
      .filter(Boolean)
      .sort((a, b) => {
      const horarioA = turmaMeta[a]?.horario || "";
      const horarioB = turmaMeta[b]?.horario || "";
      const byHorario = getHorarioSortValue(horarioA) - getHorarioSortValue(horarioB);
      if (byHorario !== 0) return byHorario;
      return a.localeCompare(b);
    });
  }, [filteredClasses, turmaMeta]);

  const capacidadeTotal = useMemo(() => {
    return turmasFiltradas.reduce((acc, turma) => acc + (turmaMeta[turma]?.capacidade || 0), 0);
  }, [turmasFiltradas, turmaMeta]);

  const studentsCountByClassKey = useMemo(() => {
    const isExcludedStudent = (student: ActiveStudentLite, exclusion: ExclusionLite) => {
      const studentUid = String(student?.studentUid || "").trim();
      const exclusionUid = String(exclusion?.student_uid || exclusion?.studentUid || "").trim();
      if (studentUid && exclusionUid) {
        return studentUid === exclusionUid;
      }

      const studentId = String(student?.id || "").trim();
      const exclusionId = String(exclusion?.id || "").trim();
      if (studentId && exclusionId && studentId === exclusionId) {
        return true;
      }

      const studentName = normalizeText(student?.nome || "");
      const exclusionName = normalizeText(exclusion?.nome || exclusion?.Nome || "");
      if (!studentName || !exclusionName || studentName !== exclusionName) return false;

      const studentTurma = normalizeText(student?.turma || "");
      const studentTurmaCodigo = normalizeText(student?.grupo || student?.turmaCodigo || "");
      const studentHorario = normalizeHorarioKey(student?.horario || "");
      const studentProfessor = normalizeText(student?.professor || "");

      const exclusionTurma = normalizeText(exclusion?.turma || exclusion?.Turma || "");
      const exclusionTurmaCodigo = normalizeText(exclusion?.grupo || exclusion?.Grupo || exclusion?.turmaCodigo || exclusion?.TurmaCodigo || "");
      const exclusionHorario = normalizeHorarioKey(exclusion?.horario || exclusion?.Horario || "");
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

    const activeStudents = studentsSnapshot.filter(
      (student) => !excludedSnapshot.some((exclusion) => isExcludedStudent(student, exclusion))
    );

    const counts: Record<string, number> = {};
    activeStudents.forEach((student) => {
      const key = buildClassKey(student.turma || "", student.horario || "", student.nivel || "", student.professor || "");
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [studentsSnapshot, excludedSnapshot]);

  const alunosAtivos = useMemo(
    () => turmasFiltradas.reduce((acc, turma) => acc + (studentsCountByClassKey[turma] || 0), 0),
    [turmasFiltradas, studentsCountByClassKey]
  );

  const vagasDetalhadasPorNivel = useMemo(() => {
    type NivelDetail = {
      nivelKey: string;
      nivel: string;
      total: number;
      capacidade: number;
      vagas: number;
      vagasPorPeriodo: number;
      excedentesPorPeriodo: number;
      periodos: Record<"Manhã" | "Tarde", { total: number; capacidade: number }>;
      turmas: string[];
      subdivisoes: Array<{ key: string; label: string; total: number; capacidade: number }>;
    };

    const grouped = new Map<string, NivelDetail>();

    turmasFiltradas.forEach((turma) => {
      const meta = turmaMeta[turma];
      if (!meta) return;

      const details = getNivelDetails(meta.nivel || "");
      const nivelKey = details.simpleKey;
      const periodo = parsePeriodo(meta.horario || "");
      const subdiv = details.subdivisao || "Sem subdivisão";
      const capacidade = Math.max(0, Number(meta.capacidade || 0));
      const total = studentsCountByClassKey[turma] || 0;

      const existing = grouped.get(nivelKey) || {
        nivelKey,
        nivel: details.simpleLabel,
        total: 0,
        capacidade: 0,
        vagas: 0,
        vagasPorPeriodo: 0,
        excedentesPorPeriodo: 0,
        periodos: {
          "Manhã": { total: 0, capacidade: 0 },
          "Tarde": { total: 0, capacidade: 0 },
        },
        turmas: [],
        subdivisoes: [],
      };

      existing.total += total;
      existing.capacidade += capacidade;
      if (periodo === "Manhã" || periodo === "Tarde") {
        existing.periodos[periodo].total += total;
        existing.periodos[periodo].capacidade += capacidade;
      }

      const turmaResumo = `${meta.turmaLabel} • ${formatHorario(meta.horario || "")}`;
      if (!existing.turmas.includes(turmaResumo)) {
        existing.turmas.push(turmaResumo);
      }

      const subdivIdx = existing.subdivisoes.findIndex((item) => item.key === subdiv);
      if (subdivIdx >= 0) {
        existing.subdivisoes[subdivIdx].total += total;
        existing.subdivisoes[subdivIdx].capacidade += capacidade;
      } else {
        existing.subdivisoes.push({
          key: subdiv,
          label: subdiv === "Sem subdivisão" ? "Sem subdivisão" : `${details.simpleLabel} ${subdiv}`,
          total,
          capacidade,
        });
      }

      grouped.set(nivelKey, existing);
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        turmas: [...item.turmas].sort((a, b) => a.localeCompare(b)),
        subdivisoes: [...item.subdivisoes].sort((a, b) => {
          if (a.key === "Sem subdivisão") return 1;
          if (b.key === "Sem subdivisão") return -1;
          return a.key.localeCompare(b.key);
        }),
        vagas: Math.max(0, item.capacidade - item.total),
        vagasPorPeriodo:
          Math.max(0, item.periodos["Manhã"].capacidade - item.periodos["Manhã"].total) +
          Math.max(0, item.periodos["Tarde"].capacidade - item.periodos["Tarde"].total),
        excedentesPorPeriodo:
          Math.max(0, item.periodos["Manhã"].total - item.periodos["Manhã"].capacidade) +
          Math.max(0, item.periodos["Tarde"].total - item.periodos["Tarde"].capacidade),
      }))
      .sort((a, b) => {
        const byRank = getNivelRank(a.nivelKey, a.nivel) - getNivelRank(b.nivelKey, b.nivel);
        if (byRank !== 0) return byRank;
        return a.nivel.localeCompare(b.nivel);
      });
  }, [turmasFiltradas, turmaMeta, studentsCountByClassKey]);

  const vagasDisponiveis = useMemo(() => {
    return vagasDetalhadasPorNivel.reduce((acc, item) => acc + item.vagasPorPeriodo, 0);
  }, [vagasDetalhadasPorNivel]);

  const vagasExcedentes = useMemo(() => {
    return vagasDetalhadasPorNivel.reduce((acc, item) => acc + item.excedentesPorPeriodo, 0);
  }, [vagasDetalhadasPorNivel]);

  const toggleNivelDetalhe = (nivelKey: string) => {
    setExpandedNiveis((prev) => ({ ...prev, [nivelKey]: !prev[nivelKey] }));
    setSelectedNivelDetailFilter((prev) => {
      if (prev?.nivelKey === nivelKey && prev?.subdivKey === null) return null;
      return { nivelKey, subdivKey: null };
    });
  };

  const toggleSubdivisaoDetalhe = (nivelKey: string, subdivKey: string) => {
    setSelectedNivelDetailFilter((prev) => {
      if (prev?.nivelKey === nivelKey && prev?.subdivKey === subdivKey) return null;
      return { nivelKey, subdivKey };
    });
  };

  useEffect(() => {
    setSelectedNivelDetailFilter(null);
    setExpandedNiveis({});
  }, [nivelFiltro, turmaLabelFiltro, periodoFiltro]);

  useEffect(() => {
    if (!showVagasDisponiveisDetalhe) {
      setSelectedNivelDetailFilter(null);
      setExpandedNiveis({});
    }
  }, [showVagasDisponiveisDetalhe]);

  const turmasFiltradasDetalhe = useMemo(() => {
    if (!selectedNivelDetailFilter) return turmasFiltradas;

    return turmasFiltradas.filter((turma) => {
      const meta = turmaMeta[turma];
      if (!meta) return false;

      const details = getNivelDetails(meta.nivel || "");
      if (details.simpleKey !== selectedNivelDetailFilter.nivelKey) return false;

      if (!selectedNivelDetailFilter.subdivKey) return true;
      const turmaSubdiv = details.subdivisao || "Sem subdivisão";
      return turmaSubdiv === selectedNivelDetailFilter.subdivKey;
    });
  }, [selectedNivelDetailFilter, turmasFiltradas, turmaMeta]);

  const getBalanceLabel = (total: number, capacidade: number) => {
    if (total > capacidade) return `${total - capacidade} excedente${total - capacidade > 1 ? "s" : ""}`;
    return `${capacidade - total} vaga${capacidade - total > 1 ? "s" : ""}`;
  };

  return (
    <div className="vagas-root">
      <div className="vagas-header">
        <div>
          <h2>Gestão de Vagas</h2>
          <p>Leitura da base oficial de dados.</p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={loadBootstrap}
            disabled={loadingBootstrap}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              background: loadingBootstrap ? "#ccc" : "#4caf50",
              color: "white",
              cursor: loadingBootstrap ? "default" : "pointer",
            }}
          >
            {loadingBootstrap ? "Atualizando..." : "Atualizar dados"}
          </button>
        </div>
      </div>

      <div className="vagas-filters">
        <div className="filter-block">
          <label>Nível</label>
          <select value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)}>
            {niveis.map((nivel) => (
              <option key={nivel} value={nivel}>{nivel}</option>
            ))}
          </select>
        </div>
        <div className="filter-block">
          <label>Turma</label>
          <select value={turmaLabelFiltro} onChange={(e) => setTurmaLabelFiltro(e.target.value)}>
            {turmaLabels.map((turmaLabel) => (
              <option key={turmaLabel} value={turmaLabel}>{turmaLabel}</option>
            ))}
          </select>
        </div>
        <div className="filter-block">
          <label>Período</label>
          <div className="periodo-toggle">
            {["Todos", "Manhã", "Tarde"].map((p) => (
              <button
                key={p}
                className={periodoFiltro === p ? "active" : ""}
                onClick={() => setPeriodoFiltro(p as Periodo)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="vagas-cards">
        <div className="vagas-card">
          <span className="label">Capacidade Total</span>
          <strong>{capacidadeTotal}</strong>
          <small>Somatório das turmas filtradas</small>
        </div>
        <div className="vagas-card">
          <span className="label">Alunos Ativos</span>
          <strong>{alunosAtivos}</strong>
          <small>Matriculados nas turmas filtradas</small>
        </div>
        <button
          type="button"
          className={`vagas-card vagas-card-button highlight ${vagasDisponiveis <= 0 ? "danger" : ""} ${showVagasDisponiveisDetalhe ? "active" : ""}`}
          onClick={() => setShowVagasDisponiveisDetalhe((prev) => !prev)}
          aria-expanded={showVagasDisponiveisDetalhe}
        >
          <span className="label">Vagas Disponíveis</span>
          <strong>{vagasDisponiveis}</strong>
          <small>{vagasDisponiveis <= 0 ? "Turmas lotadas" : "Clique para ver por nível"}</small>
        </button>
        <div className={`vagas-card highlight ${vagasExcedentes > 0 ? "danger" : ""}`}>
          <span className="label">Vagas Excedentes</span>
          <strong>{vagasExcedentes}</strong>
          <small>{vagasExcedentes > 0 ? "Acima da capacidade" : "Sem excedentes"}</small>
        </div>
      </div>

      {showVagasDisponiveisDetalhe && (
        <div className="vagas-detail-box">
          <h3>Relação total de vagas/capacidade</h3>
          <div className="vagas-detail-total">Total filtrado: <strong>{alunosAtivos}/{capacidadeTotal}</strong></div>
          {selectedNivelDetailFilter && (
            <div className="vagas-detail-filter-hint">
              Filtro aplicado nas aulas abaixo: <strong>
                {vagasDetalhadasPorNivel.find((item) => item.nivelKey === selectedNivelDetailFilter.nivelKey)?.nivel || "Nível"}
                {selectedNivelDetailFilter.subdivKey ? ` ${selectedNivelDetailFilter.subdivKey}` : ""}
              </strong>
            </div>
          )}
          {vagasDetalhadasPorNivel.length === 0 ? (
            <div className="empty-state">Nenhum nível encontrado para os filtros selecionados.</div>
          ) : (
            <div className="vagas-detail-list">
              {vagasDetalhadasPorNivel.map((item) => (
                <div key={item.nivelKey} className="vagas-detail-row-block">
                  <button
                    type="button"
                    className={`vagas-detail-row vagas-detail-row-button ${expandedNiveis[item.nivelKey] ? "active" : ""}`}
                    onClick={() => toggleNivelDetalhe(item.nivelKey)}
                  >
                    <div>
                      <strong>{item.nivel}</strong>
                      <span>Turmas (nível simples): {item.turmas.join(" | ")}</span>
                    </div>
                    <div className="vagas-detail-meta">
                      <span>
                        {item.vagasPorPeriodo > 0
                          ? `${item.vagasPorPeriodo} vagas`
                          : `${item.excedentesPorPeriodo} excedente${item.excedentesPorPeriodo > 1 ? "s" : ""}`}
                      </span>
                      {item.vagasPorPeriodo > 0 && item.excedentesPorPeriodo > 0 && (
                        <span>{item.excedentesPorPeriodo} excedente{item.excedentesPorPeriodo > 1 ? "s" : ""}</span>
                      )}
                      <span>{item.total}/{item.capacidade}</span>
                    </div>
                  </button>

                  {expandedNiveis[item.nivelKey] && (
                    <div className="vagas-detail-subrows">
                      <div className="vagas-detail-periodos">
                        <span>
                          Manhã: <strong>{item.periodos["Manhã"].total}/{item.periodos["Manhã"].capacidade}</strong>
                          {` (${getBalanceLabel(item.periodos["Manhã"].total, item.periodos["Manhã"].capacidade)})`}
                        </span>
                        <span>
                          Tarde: <strong>{item.periodos["Tarde"].total}/{item.periodos["Tarde"].capacidade}</strong>
                          {` (${getBalanceLabel(item.periodos["Tarde"].total, item.periodos["Tarde"].capacidade)})`}
                        </span>
                      </div>

                      {item.subdivisoes.map((sub) => {
                        const isActive =
                          selectedNivelDetailFilter?.nivelKey === item.nivelKey &&
                          selectedNivelDetailFilter?.subdivKey === sub.key;
                        return (
                          <button
                            key={`${item.nivelKey}-${sub.key}`}
                            type="button"
                            className={`vagas-detail-subrow vagas-detail-subrow-button ${isActive ? "active" : ""}`}
                            onClick={() => toggleSubdivisaoDetalhe(item.nivelKey, sub.key)}
                          >
                            <strong>{sub.label}</strong>
                            <span>{sub.total}/{sub.capacidade}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="vagas-list">
        {turmasFiltradasDetalhe.length === 0 ? (
          <div className="empty-state">Nenhuma turma encontrada com os filtros selecionados.</div>
        ) : (
          turmasFiltradasDetalhe.map((turma) => {
            const meta = turmaMeta[turma];
            const total = studentsCountByClassKey[turma] || 0;
            const capacity = meta?.capacidade || 0;
            const pct = capacity > 0 ? Math.min(100, Math.round((total / capacity) * 100)) : 0;
            return (
              <div key={turma} className="vagas-row">
                <div>
                  <strong>{meta?.turmaLabel || turma} | {formatNivelLabel(meta?.nivel || "")}</strong>
                  <span>{meta?.horario ? formatHorario(meta.horario) : "-"} - {meta?.professor || "-"}</span>
                </div>
                <div className="vagas-row-meta">
                  <span>{total}/{capacity}</span>
                </div>
                <div className="vagas-row-bar">
                  <div style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Vacancies;
