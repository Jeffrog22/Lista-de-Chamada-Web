import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { getBootstrap, getReports } from "../api";
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

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"resumo" | "frequencias" | "graficos" | "clima" | "vagas">("resumo");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loadingReports, setLoadingReports] = useState(false);

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

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

  const readStudentDetails = (): Record<string, ActiveStudentLite> => {
    const list = readActiveStudents();
    const map: Record<string, ActiveStudentLite> = {};
    list.forEach((item) => {
      const key = normalizeText(item.nome || "");
      if (!key) return;
      map[key] = item;
    });
    return map;
  };

  const [studentsSnapshot, setStudentsSnapshot] = useState<ActiveStudentLite[]>(() => readActiveStudents());
  const [studentDetails, setStudentDetails] = useState<Record<string, ActiveStudentLite>>(() =>
    readStudentDetails()
  );
  const [classesData, setClassesData] = useState<ClassStats[]>([]);
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

        const fromBootstrapDetails: Record<string, ActiveStudentLite> = {};
        mapped.forEach((student) => {
          const key = normalizeText(student.nome || "");
          if (!key) return;
          fromBootstrapDetails[key] = student;
        });

        const fromLocalDetails = readStudentDetails();
        setStudentDetails({ ...fromBootstrapDetails, ...fromLocalDetails });

        if (mapped.length > 0) {
          setStudentsSnapshot(mapped);
        } else {
          loadLocal();
        }
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
    setStudentDetails(readStudentDetails());
  }, [studentsSnapshot]);

  useEffect(() => {
    localStorage.setItem("classCapacities", JSON.stringify(capacities));
  }, [capacities]);

  useEffect(() => {
    if (classesData.length === 0) return;
    if (!selectedClassId || !classesData.some((item) => item.turma === selectedClassId)) {
      setSelectedClassId(classesData[0].turma);
    }
  }, [classesData, selectedClassId]);

  useEffect(() => {
    let isMounted = true;
    setLoadingReports(true);
    getReports({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        const data = response.data as ClassStats[];
        setClassesData(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0 && !data.some((item) => item.turma === selectedClassId)) {
          setSelectedClassId(data[0].turma);
        }
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

  const currentClassData = classesData.find((c) => c.turma === selectedClassId) || classesData[0] || null;
  
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

  const handleGenerateExcel = () => {
    if (!currentClassData) {
      alert("Nenhuma turma disponível para exportação.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    const classDays = Array.from(
      new Set(currentClassData.alunos.flatMap((aluno) => Object.keys(aluno.historico || {})))
    ).sort();

    const [year, month] = selectedMonth.split("-");
    const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const formattedMonth = `${monthNames[parseInt(month) - 1]}/${year}`;

    wsData.push(["Modalidade:", "Natação", "", "PREFEITURA MUNICIPAL DE VINHEDO", ""]); 
    wsData.push(["Local:", "Piscina Bela Vista", "", "SECRETARIA DE ESPORTE E LAZER", ""]);
    wsData.push(["Professor:", currentClassData.professor, "", "", ""]);
    wsData.push(["Turma:", currentClassData.turma, "", "Nível:", currentClassData.nivel]);
    wsData.push(["Horário:", currentClassData.horario, "", "Mês:", formattedMonth]);

    const headerRow = ["", "", "", "", ""]; 
    headerRow[0] = "Nome";
    headerRow[1] = "Whatsapp";
    headerRow[2] = "parQ";
    headerRow[3] = "Aniversário";

    const dateColumnsStart = 4;
    classDays.forEach((day, idx) => {
      headerRow[dateColumnsStart + idx] = day;
    });

    headerRow[dateColumnsStart + classDays.length] = "Anotações";

    wsData.push(headerRow);

    currentClassData.alunos.forEach((aluno) => {
      const extraInfo = studentDetails[normalizeText(aluno.nome)] || {};
      const row = new Array(headerRow.length).fill("");
      row[0] = aluno.nome;

      if (extraInfo) {
        row[1] = extraInfo.whatsapp || "";
        row[2] = extraInfo.atestado ? (extraInfo.dataAtestado || "Com Atestado") : (extraInfo.parQ || "");
        row[3] = extraInfo.dataNascimento || "";
      }

      classDays.forEach((day, idx) => {
        const status = aluno.historico[day] || "";
        row[dateColumnsStart + idx] = status;
      });

      row[dateColumnsStart + classDays.length] = aluno.anotacoes || "";

      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Tentativa de aplicar estilos (funciona se a biblioteca suportar estilos, ex: xlsx-js-style)
    const boldRight = { font: { bold: true }, alignment: { horizontal: "right" } };
    const boldLeft = { font: { bold: true }, alignment: { horizontal: "left" } };
    const boldCenter = { font: { bold: true }, alignment: { horizontal: "center" } };

    const setStyle = (cellRef: string, style: any) => {
      if (ws[cellRef]) ws[cellRef].s = style;
    };

    ["A1", "A2", "A3", "A4", "A5"].forEach(c => setStyle(c, boldRight));
    ["D1", "D2"].forEach(c => setStyle(c, boldLeft));
    ["B6", "C6", "D6"].forEach(c => setStyle(c, boldCenter));

    const wscols = [
      { wch: 30 },
      { wch: 20 },
      { wch: 10 },
      { wch: 35 },
    ];
    classDays.forEach(() => wscols.push({ wch: 4 }));
    wscols.push({ wch: 30 });
    ws["!cols"] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, `Chamada ${currentClassData.turma}`);
    XLSX.writeFile(wb, `Relatorio_${currentClassData.turma}_${selectedMonth}.xlsx`);
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
              <h3>📊 Resumo da Turma {selectedClassId}</h3>
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
                <p><strong>⏰ Horário:</strong> {currentClassData.horario}</p>
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
            <div>
              <label>Mês</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
            <div>
              <label>Turma</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={classesData.length === 0}
              >
                {classesData.map(c => <option key={c.turma} value={c.turma}>{c.turma}</option>)}
              </select>
            </div>
            <button onClick={handleGenerateExcel} className="btn-primary" disabled={!currentClassData}>
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
                  <span>⏰ {item.horario}</span>
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
