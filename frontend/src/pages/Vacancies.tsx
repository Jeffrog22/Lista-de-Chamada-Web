import React, { useEffect, useMemo, useState } from "react";
import { getBootstrap, getExcludedStudents } from "../api";
import "./Vacancies.css";

type Periodo = "Todos" | "Manha" | "Tarde";

interface ActiveStudentLite {
  id?: string;
  nome?: string;
  nivel?: string;
  turma?: string;
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
  codigo: string;
  turmaLabel: string;
  horario: string;
  nivel: string;
  professor: string;
  capacidade: number;
}

interface ExclusionLite {
  nome?: string;
  Nome?: string;
  turma?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  Turma?: string;
  TurmaCodigo?: string;
  Horario?: string;
  Professor?: string;
}

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
  return hour < 12 ? "Manha" : "Tarde";
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
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);

  const [nivelFiltro, setNivelFiltro] = useState<string>("Todos");
  const [turmaLabelFiltro, setTurmaLabelFiltro] = useState<string>("Todos");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("Todos");

  const loadBootstrap = () => {
    setLoadingBootstrap(true);
    return Promise.all([getBootstrap(), getExcludedStudents()])
      .then(([bootstrapResponse, exclusionsResponse]) => {
        const data = bootstrapResponse.data as {
          classes: Array<{
            id: number;
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
            class_id: number;
            nome: string;
            categoria: string;
            nivel: string;
            horario: string;
          }>;
        };

        const exclusions = Array.isArray(exclusionsResponse?.data)
          ? (exclusionsResponse.data as ExclusionLite[])
          : [];

        const classById = new Map<number, (typeof data.classes)[number]>();
        data.classes.forEach((cls) => classById.set(cls.id, cls));

        const mappedStudents = data.students.map((student) => {
          const cls = classById.get(student.class_id);
          return {
            id: String(student.id),
            nome: student.nome,
            nivel: cls?.nivel || student.nivel || "",
            turma: cls?.turma_label || cls?.codigo || "",
            turmaCodigo: cls?.codigo || "",
            horario: cls?.horario || "",
            professor: cls?.professor || "",
          } as ActiveStudentLite;
        });

        const mappedClasses: BootstrapClassLite[] = data.classes.map((cls) => ({
          id: cls.id,
          codigo: cls.codigo || "",
          turmaLabel: cls.turma_label || cls.codigo || "",
          horario: cls.horario || "",
          nivel: cls.nivel || "",
          professor: cls.professor || "",
          capacidade: Number(cls.capacidade || 0),
        }));

        setStudentsSnapshot(mappedStudents);
        setClassesSnapshot(mappedClasses);
        setExcludedSnapshot(exclusions);
      })
      .catch(() => {
        setStudentsSnapshot([]);
        setClassesSnapshot([]);
        setExcludedSnapshot([]);
      })
      .finally(() => {
        setLoadingBootstrap(false);
      });
  };

  // load on mount
  useEffect(() => {
    loadBootstrap();
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
    const unique = new Set<string>();
    classesSnapshot.forEach((item) => item.nivel && unique.add(item.nivel));
    return ["Todos", ...Array.from(unique).sort()];
  }, [classesSnapshot]);

  const turmaLabels = useMemo(() => {
    const unique = new Set<string>();
    classesSnapshot.forEach((item) => item.turmaLabel && unique.add(item.turmaLabel));
    return ["Todos", ...Array.from(unique).sort()];
  }, [classesSnapshot]);

  const filteredClasses = useMemo(() => {
    return classesSnapshot.filter((item) => {
      if (nivelFiltro !== "Todos" && item.nivel !== nivelFiltro) return false;
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
      const studentName = normalizeText(student?.nome || "");
      const exclusionName = normalizeText(exclusion?.nome || exclusion?.Nome || "");
      if (!studentName || !exclusionName || studentName !== exclusionName) return false;

      const studentTurma = normalizeText(student?.turma || "");
      const studentTurmaCodigo = normalizeText(student?.turmaCodigo || "");
      const studentHorario = normalizeHorarioKey(student?.horario || "");
      const studentProfessor = normalizeText(student?.professor || "");

      const exclusionTurma = normalizeText(exclusion?.turma || exclusion?.Turma || "");
      const exclusionTurmaCodigo = normalizeText(exclusion?.turmaCodigo || exclusion?.TurmaCodigo || "");
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

  const vagasDisponiveis = useMemo(() => {
    return turmasFiltradas.reduce((acc, turma) => {
      const meta = turmaMeta[turma];
      const capacity = Math.max(0, Number(meta?.capacidade || 0));
      const total = studentsCountByClassKey[turma] || 0;
      if (total >= capacity) return acc;
      return acc + (capacity - total);
    }, 0);
  }, [turmasFiltradas, turmaMeta, studentsCountByClassKey]);

  const vagasExcedentes = useMemo(() => {
    return turmasFiltradas.reduce((acc, turma) => {
      const meta = turmaMeta[turma];
      const capacity = Math.max(0, Number(meta?.capacidade || 0));
      const total = studentsCountByClassKey[turma] || 0;
      if (total <= capacity) return acc;
      return acc + (total - capacity);
    }, 0);
  }, [turmasFiltradas, turmaMeta, studentsCountByClassKey]);

  const turmasComVagasDisponiveis = useMemo(() => {
    return turmasFiltradas
      .map((turma) => {
        const meta = turmaMeta[turma];
        const capacity = Math.max(0, Number(meta?.capacidade || 0));
        const total = studentsCountByClassKey[turma] || 0;
        const vagas = Math.max(0, capacity - total);
        return {
          turma,
          turmaLabel: meta?.turmaLabel || turma,
          nivel: formatNivelLabel(meta?.nivel || ""),
          horario: meta?.horario ? formatHorario(meta.horario) : "-",
          professor: meta?.professor || "-",
          vagas,
          total,
          capacity,
        };
      })
      .filter((item) => item.vagas > 0)
      .sort((a, b) => b.vagas - a.vagas || a.turmaLabel.localeCompare(b.turmaLabel));
  }, [turmasFiltradas, turmaMeta, studentsCountByClassKey]);

  return (
    <div className="vagas-root">
      <div className="vagas-header">
        <div>
          <h2>Gestao de Vagas</h2>
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
          <label>Nivel</label>
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
          <label>Periodo</label>
          <div className="periodo-toggle">
            {["Todos", "Manha", "Tarde"].map((p) => (
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
          <small>{vagasDisponiveis <= 0 ? "Turmas lotadas" : "Clique para ver por turma"}</small>
        </button>
        <div className={`vagas-card highlight ${vagasExcedentes > 0 ? "danger" : ""}`}>
          <span className="label">Vagas Excedentes</span>
          <strong>{vagasExcedentes}</strong>
          <small>{vagasExcedentes > 0 ? "Acima da capacidade" : "Sem excedentes"}</small>
        </div>
      </div>

      {showVagasDisponiveisDetalhe && (
        <div className="vagas-detail-box">
          <h3>Turmas com vagas disponíveis</h3>
          {turmasComVagasDisponiveis.length === 0 ? (
            <div className="empty-state">Nenhuma turma com vaga para os filtros selecionados.</div>
          ) : (
            <div className="vagas-detail-list">
              {turmasComVagasDisponiveis.map((item) => (
                <div key={item.turma} className="vagas-detail-row">
                  <div>
                    <strong>{item.turmaLabel} | {item.nivel}</strong>
                    <span>{item.horario} - {item.professor}</span>
                  </div>
                  <div className="vagas-detail-meta">
                    <span>{item.vagas} vagas</span>
                    <span>{item.total}/{item.capacity}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="vagas-list">
        {turmasFiltradas.length === 0 ? (
          <div className="empty-state">Nenhuma turma encontrada com os filtros selecionados.</div>
        ) : (
          turmasFiltradas.map((turma) => {
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
