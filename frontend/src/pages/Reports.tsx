import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import "./Reports.css";

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

export const Reports: React.FC = () => {
  // Estados de Filtro
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedClassId, setSelectedClassId] = useState<string>("1A");

  // Mock Data Completo (Simulando dados vindos do backend/localStorage)
  const [classesData, setClassesData] = useState<ClassStats[]>([
    {
      turma: "1A",
      horario: "14:00",
      professor: "Joao Silva",
      nivel: "Iniciante",
      alunos: [
        { id: "1", nome: "João Silva", presencas: 8, faltas: 0, justificativas: 0, frequencia: 100, historico: { "02": "c", "05": "c", "09": "c", "12": "c" }, anotacoes: "Excelente desempenho" },
        { id: "2", nome: "Maria Santos", presencas: 6, faltas: 2, justificativas: 0, frequencia: 75, historico: { "02": "c", "05": "f", "09": "c", "12": "f" } },
        { id: "3", nome: "Pedro Ferreira", presencas: 7, faltas: 0, justificativas: 1, frequencia: 87.5, historico: { "02": "c", "05": "c", "09": "j", "12": "c" }, anotacoes: "Atestado dia 09" },
      ]
    },
    {
      turma: "1B",
      horario: "15:30",
      professor: "Maria Santos",
      nivel: "Intermediario",
      alunos: [
        { id: "4", nome: "Roberto Alves", presencas: 5, faltas: 3, justificativas: 0, frequencia: 62.5, historico: { "03": "c", "06": "f", "10": "f", "13": "c" } },
        { id: "5", nome: "Fernanda Lima", presencas: 8, faltas: 0, justificativas: 0, frequencia: 100, historico: { "03": "c", "06": "c", "10": "c", "13": "c" } },
      ]
    },
    {
      turma: "2A",
      horario: "16:30",
      professor: "Carlos Oliveira",
      nivel: "Avancado",
      alunos: [
        { id: "6", nome: "Amanda Silva", presencas: 8, faltas: 0, justificativas: 0, frequencia: 100, historico: { "02": "c", "04": "c", "09": "c", "11": "c" } },
      ]
    }
  ]);

  // Dados computados para a turma selecionada
  const currentClassData = classesData.find(c => c.turma === selectedClassId) || classesData[0];
  
  // Estatísticas Gerais da Turma Selecionada
  const totalFaltas = currentClassData.alunos.reduce((acc, curr) => acc + curr.faltas, 0);
  const totalJustificativas = currentClassData.alunos.reduce((acc, curr) => acc + curr.justificativas, 0);
  const mediaFrequencia = currentClassData.alunos.length > 0 
    ? (currentClassData.alunos.reduce((acc, curr) => acc + curr.frequencia, 0) / currentClassData.alunos.length).toFixed(1) 
    : "0";

  const handleGenerateExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // Configuração do Mês e Dias
    const classDays = Object.keys(currentClassData.alunos[0]?.historico || {}).sort(); 
    
    // Formatar mês para mmm/aaaa (ex: jan/2026)
    const [year, month] = selectedMonth.split("-");
    const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const formattedMonth = `${monthNames[parseInt(month) - 1]}/${year}`;

    // --- Construção do Layout Específico ---
    
    // Linha 1 (Índice 0): A1: Modalidade, B1: Natação, D1: Prefeitura
    wsData.push(["Modalidade:", "Natação", "", "PREFEITURA MUNICIPAL DE VINHEDO", ""]); 

    // Linha 2 (Índice 1): A2: Local, B2: Piscina, D2: Secretaria
    wsData.push(["Local:", "Piscina Bela Vista", "", "SECRETARIA DE ESPORTE E LAZER", ""]);

    // Linha 3 (Índice 2): B3: Professor
    wsData.push(["Professor:", currentClassData.professor, "", "", ""]);

    // Linha 4 (Índice 3): B4: Turma, E4: Nível
    wsData.push(["Turma:", currentClassData.turma, "", "Nível:", currentClassData.nivel]);

    // Linha 5 (Índice 4): B5: Horário, E5: Mês Selecionado
    wsData.push(["Horário:", currentClassData.horario, "", "Mês:", formattedMonth]);

    // Linha 6 (Índice 5): Cabeçalhos da Tabela
    const headerRow = ["", "", "", "", ""]; 
    headerRow[0] = "Nome"; // A7 (considerando cabeçalho na linha 6 do Excel)
    headerRow[1] = "Whatsapp";
    headerRow[2] = "parQ";
    headerRow[3] = "Aniversário";

    // Preencher datas a partir da coluna E (índice 4)
    const dateColumnsStart = 4;
    classDays.forEach((day, idx) => {
      headerRow[dateColumnsStart + idx] = day;
    });
    
    // Coluna Anotações após a última data
    headerRow[dateColumnsStart + classDays.length] = "Anotações";
    
    wsData.push(headerRow);

    // Base de dados de fallback para garantir que a demo funcione mesmo sem dados no localStorage
    const fallbackStudentsDB = [
      { id: "1", nome: "João Silva", whatsapp: "(11) 98765-4321", dataNascimento: "10/05/2010", parQ: "Não", atestado: true, dataAtestado: "15/01/2025" },
      { id: "2", nome: "Maria Santos", whatsapp: "(11) 98765-4322", dataNascimento: "20/08/2009", parQ: "Sim", atestado: false },
      { id: "3", nome: "Pedro Ferreira", whatsapp: "(11) 98765-4323", dataNascimento: "05/02/2008", parQ: "Não", atestado: false },
      { id: "4", nome: "Roberto Alves", whatsapp: "(11) 98765-4324", dataNascimento: "12/12/2007", parQ: "Não", atestado: false },
      { id: "5", nome: "Fernanda Lima", whatsapp: "(11) 98765-4325", dataNascimento: "30/03/2008", parQ: "Sim", atestado: false },
      { id: "6", nome: "Amanda Silva", whatsapp: "(11) 98765-4326", dataNascimento: "14/07/2009", parQ: "Não", atestado: true, dataAtestado: "10/02/2025" },
    ];

    // Mesclar dados do localStorage com o fallback
    let allStudents = [...fallbackStudentsDB];
    try {
      const stored = localStorage.getItem("activeStudents");
      if (stored) {
        const storedStudents = JSON.parse(stored);
        // Atualiza os dados do fallback com o que estiver no storage (edições do usuário)
        storedStudents.forEach((s: any) => {
          const index = allStudents.findIndex(f => f.id === s.id || f.nome === s.nome);
          if (index >= 0) {
            allStudents[index] = { ...allStudents[index], ...s };
          } else {
            allStudents.push(s);
          }
        });
      }
    } catch (e) { console.error(e); }

    // Linhas 7+ (Índice 6+): Dados dos Alunos
    currentClassData.alunos.forEach((aluno) => {
      const extraInfo = allStudents.find((s: any) => s.id === aluno.id || s.nome === aluno.nome);
      const row = new Array(headerRow.length).fill("");
      row[0] = aluno.nome; // A7: Nome
      
      if (extraInfo) {
        row[1] = extraInfo.whatsapp || "";
        // Mostrar data do atestado se houver, senão mostrar parQ
        row[2] = extraInfo.atestado ? (extraInfo.dataAtestado || "Com Atestado") : (extraInfo.parQ || "");
        row[3] = extraInfo.dataNascimento || "";
      }

      // Preencher presenças
      classDays.forEach((day, idx) => {
        const status = aluno.historico[day] || "";
        row[dateColumnsStart + idx] = status;
      });

      // Anotações
      row[dateColumnsStart + classDays.length] = aluno.anotacoes || "";
      
      wsData.push(row);
    });

    // Criar a planilha
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

    // Ajustes de largura de coluna
    const wscols = [
      { wch: 30 }, // A: Nome
      { wch: 20 }, // B
      { wch: 10 }, // C
      { wch: 35 }, // D (Prefeitura)
    ];
    classDays.forEach(() => wscols.push({ wch: 4 }));
    wscols.push({ wch: 30 }); // Anotações
    ws["!cols"] = wscols;

    // Adicionar à pasta de trabalho e salvar
    XLSX.utils.book_append_sheet(wb, ws, `Chamada ${currentClassData.turma}`);
    XLSX.writeFile(wb, `Relatorio_${currentClassData.turma}_${selectedMonth}.xlsx`);
  };

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      
      {/* HEADER & FILTROS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", flexWrap: "wrap", gap: "20px" }}>
        <div>
          <h2 style={{ color: "#2c3e50", margin: 0 }}>Relatórios e Análises</h2>
          <p style={{ color: "#666", margin: "5px 0 0" }}>Visão geral de frequência e exportação de dados.</p>
        </div>

        <div style={{ display: "flex", gap: "15px", background: "#f8f9fa", padding: "10px", borderRadius: "8px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#666", marginBottom: "4px" }}>Mês</label>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ddd" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#666", marginBottom: "4px" }}>Turma</label>
            <select 
              value={selectedClassId} 
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ddd", minWidth: "100px" }}
            >
              {classesData.map(c => <option key={c.turma} value={c.turma}>{c.turma}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* DASHBOARD DE ANÁLISE */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        
        {/* Card 1: Resumo Geral */}
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
        </div>

        {/* Card 2: Gráfico de Barras (Simulado com CSS) */}
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

        {/* Card 3: Detalhes do Professor */}
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

      {/* ÁREA DE EXPORTAÇÃO */}
      <div style={{ background: "#f1f3f5", padding: "25px", borderRadius: "12px", textAlign: "center" }}>
        <h3 style={{ color: "#2c3e50", marginBottom: "10px" }}>Exportar Relatório Oficial</h3>
        <p style={{ color: "#666", marginBottom: "20px", maxWidth: "600px", margin: "0 auto 20px" }}>
          Gera um arquivo Excel (.xlsx) formatado com base no template 'relatorioChamada.xlsx', contendo a lista de alunos, datas do mês selecionado e registros de presença para a turma <strong>{selectedClassId}</strong>.
        </p>
        
        <button 
          onClick={handleGenerateExcel}
          style={{
            background: "#217346", // Cor Excel
            color: "white",
            border: "none",
            padding: "12px 25px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "15px",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 4px 10px rgba(33, 115, 70, 0.3)",
            transition: "transform 0.2s"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          📥 Baixar Relatório Excel
        </button>
      </div>

    </div>
  );
};

export default Reports;
