import React, { useEffect, useState } from "react";
import { downloadExcelReport, getBootstrap, getReports } from "../api";
import "./Reports.css";
import DashboardCharts from './DashboardCharts';

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
}

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"resumo" | "frequencias" | "graficos" | "clima" | "vagas">("resumo");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedTurmaLabel, setSelectedTurmaLabel] = useState<string>("");
  const [selectedHorario, setSelectedHorario] = useState<string>("");
  const [selectedProfessor, setSelectedProfessor] = useState<string>("");
  const [loadingReports, setLoadingReports] = useState(false);

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

  const [studentsSnapshot, setStudentsSnapshot] = useState<ActiveStudentLite[]>(() => readActiveStudents());
  const [classesData, setClassesData] = useState<ClassStats[]>([]);
  const [bootstrapClasses, setBootstrapClasses] = useState<BootstrapClassLite[]>([]);
  const [capacities, setCapacities] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem("classCapacities");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    let isMounted = true;
    const loadLocal = () => setStudentsSnapshot(readActiveStudents());

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

        if (mapped.length > 0) {
          setStudentsSnapshot(mapped);
        } else {
          loadLocal();
        }

        const mappedClasses: BootstrapClassLite[] = data.classes.map((cls) => ({
          codigo: cls.codigo || "",
          turmaLabel: cls.turma_label || cls.codigo || "",
          horario: cls.horario || "",
          professor: cls.professor || "",
          nivel: cls.nivel || "",
        }));
        setBootstrapClasses(mappedClasses);
      })
      .catch(() => {
        if (isMounted) loadLocal();
      });

    const onStorage = () => loadLocal();
    window.addEventListener("storage", onStorage);
    return () => {
      isMounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("classCapacities", JSON.stringify(capacities));
  }, [capacities]);

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
        .filter((c) => c.turma === selectedTurmaLabel && c.horario === selectedHorario)
        .map((c) => c.professor)
    )
  ).sort();

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
    if (!selectedProfessor || !professorOptions.includes(selectedProfessor)) {
      setSelectedProfessor(professorOptions[0]);
    }
  }, [professorOptions, selectedProfessor]);

  useEffect(() => {
    let isMounted = true;
    setLoadingReports(true);
    getReports({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        const data = response.data as ClassStats[];
        setClassesData(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (isMounted) setClassesData([]);
      })
      .finally(() => {
        if (isMounted) setLoadingReports(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

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
  
  // Estatísticas Gerais da Turma Selecionada
  const totalFaltas = currentClassData ? currentClassData.alunos.reduce((acc, curr) => acc + curr.faltas, 0) : 0;
  const totalJustificativas = currentClassData
    ? currentClassData.alunos.reduce((acc, curr) => acc + curr.justificativas, 0)
    : 0;
  const mediaFrequencia =
    currentClassData && currentClassData.alunos.length > 0
      ? (currentClassData.alunos.reduce((acc, curr) => acc + curr.frequencia, 0) / currentClassData.alunos.length).toFixed(1)
      : "0";

  const totalAlunosTurma = currentClassData ? currentClassData.alunos.length : 0;
  const capacidadeTurma = 20;
  const ocupacaoPct = capacidadeTurma > 0 ? Math.min(100, Math.round((totalAlunosTurma / capacidadeTurma) * 100)) : 0;

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
    const total = studentsSnapshot.length > 0
      ? studentsSnapshot.filter((s) => s.turma === turma).length
      : (meta?.alunos.length || 0);
    const capacity = capacities[turma] ?? 20;
    const pct = capacity > 0 ? Math.min(100, Math.round((total / capacity) * 100)) : 0;
    return {
      turma,
      horario: meta?.horario || "-",
      professor: meta?.professor || "-",
      nivel: meta?.nivel || "-",
      total,
      capacity,
      pct,
    };
  });

  const handleCapacityChange = (turma: string, value: number) => {
    const safeValue = Number.isNaN(value) ? 0 : Math.max(0, value);
    setCapacities((prev) => ({ ...prev, [turma]: safeValue }));
  };

  const handleGenerateExcel = async () => {
    if (!currentClassData) {
      alert("Nenhuma turma disponível para exportação.");
      return;
    }
    try {
      const response = await downloadExcelReport({
        month: selectedMonth,
        turma: currentClassData.turma,
        horario: currentClassData.horario,
        professor: currentClassData.professor,
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Relatorio_${currentClassData.turma}_${selectedMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Falha ao gerar o relatório no template. Verifique o arquivo de referência.");
    }
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
          {!currentClassData && !loadingReports && (
            <div className="reports-section placeholder">Sem dados de relatórios para o mês selecionado.</div>
          )}
          {loadingReports && (
            <div className="reports-section placeholder">Carregando dados de relatórios...</div>
          )}
          {currentClassData && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "40px" }}>
            <div className="report-card" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white" }}>
              <h3>📊 Resumo da Turma {currentClassData?.turma || selectedTurmaLabel}</h3>
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px", textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold" }}>{mediaFrequencia}%</div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>Frequência Média</div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold" }}>{totalFaltas}</div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>Total Faltas</div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", fontWeight: "bold" }}>{totalJustificativas}</div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>Justificativas</div>
                </div>
              </div>
              <div style={{ marginTop: "18px" }}>
                <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "6px" }}>
                  Ocupação da turma: {ocupacaoPct}%
                </div>
                <div style={{ background: "rgba(255,255,255,0.25)", height: "6px", borderRadius: "999px", overflow: "hidden" }}>
                  <div style={{ width: `${ocupacaoPct}%`, height: "100%", background: "rgba(255,255,255,0.9)" }} />
                </div>
              </div>
            </div>

            <div className="report-card" style={{ background: "white", border: "1px solid #eee" }}>
              <h3 style={{ color: "#333", borderBottom: "1px solid #eee", paddingBottom: "10px", marginBottom: "15px" }}>
                Desempenho por Aluno
              </h3>
              <div style={{ maxHeight: "200px", overflowY: "auto", paddingRight: "5px" }}>
                {currentClassData.alunos.map(aluno => (
                  <div key={aluno.id} style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                      <span>{aluno.nome}</span>
                      <span style={{ fontWeight: "bold", color: aluno.frequencia < 75 ? "#dc3545" : "#28a745" }}>
                        {aluno.frequencia}%
                      </span>
                    </div>
                    <div style={{ width: "100%", background: "#eee", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ 
                        width: `${aluno.frequencia}%`, 
                        background: aluno.frequencia < 75 ? "#dc3545" : "#28a745",
                        height: "100%" 
                      }}></div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>
                      {aluno.presencas} Presenças | {aluno.faltas} Faltas | {aluno.justificativas} Justif.
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="report-card" style={{ background: "#fff", border: "1px solid #eee" }}>
              <h3 style={{ color: "#333", borderBottom: "1px solid #eee", paddingBottom: "10px", marginBottom: "15px" }}>
                Dados da Aula
              </h3>
              <div style={{ fontSize: "14px", lineHeight: "1.8", color: "#555" }}>
                <p><strong>👨‍🏫 Professor:</strong> {currentClassData.professor}</p>
                <p><strong>📚 Nível:</strong> {currentClassData.nivel}</p>
                <p><strong>⏰ Horário:</strong> {formatHorario(currentClassData.horario)}</p>
                <p><strong>👥 Total Alunos:</strong> {currentClassData.alunos.length}</p>
                <div style={{ marginTop: "15px", padding: "10px", background: "#fffbeb", borderRadius: "6px", borderLeft: "3px solid #f39c12", fontSize: "12px" }}>
                  ⚠️ {currentClassData.alunos.filter(a => a.frequencia < 75).length} alunos abaixo de 75% de frequência.
                </div>
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
            <div className="reports-filter-field">
              <label>Horário</label>
              <select
                value={selectedHorario}
                onChange={(e) => setSelectedHorario(e.target.value)}
                disabled={horarioOptions.length === 0}
              >
                {horarioOptions.map((horario) => (
                  <option key={horario} value={horario}>{formatHorario(horario)}</option>
                ))}
              </select>
            </div>
            <div className="reports-filter-field">
              <label>Professor</label>
              <div className="reports-filter-inline">
                <select
                  value={selectedProfessor}
                  onChange={(e) => setSelectedProfessor(e.target.value)}
                  disabled={professorOptions.length === 0}
                >
                  {professorOptions.map((professor) => (
                    <option key={professor} value={professor}>{professor}</option>
                  ))}
                </select>
                <span className="reports-level-note">
                  Nível: <strong>{currentClassData?.nivel || "-"}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={handleGenerateExcel}
              className="btn-primary"
              disabled={!currentClassData}
              style={{ marginLeft: "auto", alignSelf: "center" }}
            >
              Exportar relatorioChamada.xlsx
            </button>
          </div>
        </div>
      )}

      {activeTab === "graficos" && (
        <div className="reports-section">
          <DashboardCharts />
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
              <strong>Base ativa:</strong> {studentsSnapshot.length > 0 ? "backend + ajustes locais" : "sem dados"}
            </div>
            <button className="btn-secondary" onClick={() => setStudentsSnapshot(readActiveStudents())}>
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
                <div className="vagas-capacity">
                  <label>Capacidade</label>
                  <input
                    type="number"
                    min={0}
                    value={item.capacity}
                    onChange={(e) => handleCapacityChange(item.turma, parseInt(e.target.value, 10))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
