import React, { useEffect, useMemo, useState } from "react";
import { getBootstrap } from "../api";
import "./Vacancies.css";

type Periodo = "Todos" | "Manha" | "Tarde";

interface ActiveStudentLite {
  id?: string;
  nome?: string;
  nivel?: string;
  categoria?: string;
  turma?: string;
  turmaCodigo?: string;
  horario?: string;
}

interface TurmaMeta {
  turma: string;
  turmaLabel: string;
  horario: string;
  nivel: string;
  categoria: string;
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

const parsePeriodo = (horario: string): Periodo => {
  if (!horario) return "Todos";
  const normalized = formatHorario(horario);
  const hour = parseInt(normalized.split(":")[0], 10);
  if (Number.isNaN(hour)) return "Todos";
  return hour < 12 ? "Manha" : "Tarde";
};

const readActiveStudents = (): ActiveStudentLite[] => {
  try {
    const stored = localStorage.getItem("activeStudents");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readCapacities = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem("classCapacities");
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

export const Vacancies: React.FC = () => {
  const [studentsSnapshot, setStudentsSnapshot] = useState<ActiveStudentLite[]>(() => readActiveStudents());
  const [capacities, setCapacities] = useState<Record<string, number>>(() => readCapacities());

  const [nivelFiltro, setNivelFiltro] = useState<string>("Todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("Todos");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("Todos");

  useEffect(() => {
    let isMounted = true;

    const fetchSnapshot = () => {
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

          const classById = new Map<number, (typeof data.classes)[number]>();
          data.classes.forEach((cls) => classById.set(cls.id, cls));

          const mapped = data.students.map((student) => {
            const cls = classById.get(student.class_id);
            return {
              id: String(student.id),
              nome: student.nome,
              nivel: cls?.nivel || student.nivel || "",
              categoria: student.categoria || cls?.faixa_etaria || "",
              turma: cls?.turma_label || cls?.codigo || "",
              turmaCodigo: cls?.codigo || "",
              horario: cls?.horario || "",
            } as ActiveStudentLite;
          });

          if (mapped.length > 0) {
            setStudentsSnapshot(mapped);
          } else {
            setStudentsSnapshot(readActiveStudents());
          }
        })
        .catch(() => {
          if (isMounted) setStudentsSnapshot(readActiveStudents());
        });
    };

    fetchSnapshot();
    const intervalId = window.setInterval(() => {
      fetchSnapshot();
      setCapacities(readCapacities());
    }, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const turmaMeta = useMemo(() => {
    const meta: Record<string, TurmaMeta> = {};
    studentsSnapshot.forEach((student) => {
      const key = student.turmaCodigo || student.turma;
      if (!key) return;
      if (!meta[key]) {
        meta[key] = {
          turma: key,
          turmaLabel: student.turma || key,
          horario: student.horario || "-",
          nivel: student.nivel || "-",
          categoria: student.categoria || "-",
        };
      }
    });
    return meta;
  }, [studentsSnapshot]);

  const niveis = useMemo(() => {
    const unique = new Set<string>();
    studentsSnapshot.forEach((s) => s.nivel && unique.add(s.nivel));
    return ["Todos", ...Array.from(unique).sort()];
  }, [studentsSnapshot]);

  const categorias = useMemo(() => {
    const unique = new Set<string>();
    studentsSnapshot.forEach((s) => s.categoria && unique.add(s.categoria));
    return ["Todos", ...Array.from(unique).sort()];
  }, [studentsSnapshot]);

  const filteredStudents = useMemo(() => {
    return studentsSnapshot.filter((student) => {
      if (nivelFiltro !== "Todos" && student.nivel !== nivelFiltro) return false;
      if (categoriaFiltro !== "Todos" && student.categoria !== categoriaFiltro) return false;
      if (periodoFiltro !== "Todos") {
        const periodo = parsePeriodo(student.horario || "");
        if (periodo !== periodoFiltro) return false;
      }
      return true;
    });
  }, [studentsSnapshot, nivelFiltro, categoriaFiltro, periodoFiltro]);

  const turmasFiltradas = useMemo(() => {
    const set = new Set<string>();
    filteredStudents.forEach((s) => {
      const key = s.turmaCodigo || s.turma;
      if (key) set.add(key);
    });
    return Array.from(set).sort();
  }, [filteredStudents]);

  const capacidadeTotal = useMemo(() => {
    return turmasFiltradas.reduce((acc, turma) => acc + (capacities[turma] ?? 20), 0);
  }, [turmasFiltradas, capacities]);

  const alunosAtivos = filteredStudents.length;
  const vagasDisponiveis = capacidadeTotal - alunosAtivos;

  return (
    <div className="vagas-root">
      <div className="vagas-header">
        <div>
          <h2>Gestao de Vagas</h2>
          <p>Leitura em tempo real do cadastro ativo para analise de ocupacao.</p>
        </div>
        <div className="vagas-status">
          <span>Atualizacao a cada 2s</span>
          <span className="dot" />
        </div>
      </div>

      <div className="vagas-filters">
        <div className="filter-block">
          <label>Nivel / Categoria</label>
          <select value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)}>
            {niveis.map((nivel) => (
              <option key={nivel} value={nivel}>{nivel}</option>
            ))}
          </select>
        </div>
        <div className="filter-block">
          <label>Categoria</label>
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria}>{categoria}</option>
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
          <small>Somatorio das turmas filtradas</small>
        </div>
        <div className="vagas-card">
          <span className="label">Alunos Ativos</span>
          <strong>{alunosAtivos}</strong>
          <small>Matriculados nas turmas filtradas</small>
        </div>
        <div className={`vagas-card highlight ${vagasDisponiveis <= 0 ? "danger" : ""}`}>
          <span className="label">Vagas Disponiveis</span>
          <strong>{vagasDisponiveis}</strong>
          <small>{vagasDisponiveis <= 0 ? "Turmas lotadas" : "Vagas remanescentes"}</small>
        </div>
      </div>

      <div className="vagas-list">
        {turmasFiltradas.length === 0 ? (
          <div className="empty-state">Nenhuma turma encontrada com os filtros selecionados.</div>
        ) : (
          turmasFiltradas.map((turma) => {
            const meta = turmaMeta[turma];
            const total = filteredStudents.filter((s) => (s.turmaCodigo || s.turma) === turma).length;
            const capacity = capacities[turma] ?? 20;
            const pct = capacity > 0 ? Math.min(100, Math.round((total / capacity) * 100)) : 0;
            return (
              <div key={turma} className="vagas-row">
                <div>
                  <strong>Turma {meta?.turmaLabel || turma}</strong>
                  <span>{meta?.nivel || "-"} | {meta?.categoria || "-"}</span>
                </div>
                <div className="vagas-row-meta">
                  <span>{meta?.horario ? formatHorario(meta.horario) : "-"}</span>
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
