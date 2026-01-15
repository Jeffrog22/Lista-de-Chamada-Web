import React, { useState } from "react";
import "./Reports.css";

interface ReportData {
  turma: string;
  presentes: number;
  faltas: number;
  percentual: number;
}

export const Reports: React.FC = () => {
  const [reportData] = useState<ReportData[]>([
    { turma: "1A", presentes: 28, faltas: 5, percentual: 84.8 },
    { turma: "1B", presentes: 25, faltas: 8, percentual: 75.8 },
    { turma: "2A", presentes: 30, faltas: 3, percentual: 90.9 },
    { turma: "2B", presentes: 26, faltas: 7, percentual: 78.8 },
  ]);

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "30px" }}>
        <h3 style={{ color: "#2c3e50", marginBottom: "10px" }}>Relatórios de Frequência</h3>
        <p style={{ color: "#666", fontSize: "14px" }}>Dados compilados até 14/01/2026</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px", marginBottom: "30px" }}>
        {reportData.map((report, idx) => (
          <div
            key={idx}
            style={{
              background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
              color: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 4px 15px rgba(79, 172, 254, 0.2)",
            }}
          >
            <h3 style={{ fontSize: "18px", marginBottom: "15px", fontWeight: "bold" }}>Turma {report.turma}</h3>
            <div style={{ fontSize: "14px", lineHeight: "1.8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>✅ Presentes:</span>
                <strong>{report.presentes}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span>❌ Faltas:</span>
                <strong>{report.faltas}</strong>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.2)", padding: "8px", borderRadius: "6px", marginTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Taxa de Frequência:</span>
                  <strong>{report.percentual}%</strong>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.2)", height: "6px", borderRadius: "3px", marginTop: "6px" }}>
                  <div
                    style={{
                      background: report.percentual > 85 ? "#28a745" : report.percentual > 75 ? "#ffc107" : "#dc3545",
                      height: "100%",
                      borderRadius: "3px",
                      width: `${report.percentual}%`,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#f8f9fa", padding: "20px", borderRadius: "12px", borderLeft: "4px solid #667eea" }}>
        <h4 style={{ marginBottom: "15px", color: "#2c3e50" }}>📊 Resumo Geral</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "15px" }}>
          <div style={{ textAlign: "center", padding: "15px" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold", color: "#667eea" }}>109</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Total de Presentes</div>
          </div>
          <div style={{ textAlign: "center", padding: "15px" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold", color: "#dc3545" }}>23</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Total de Faltas</div>
          </div>
          <div style={{ textAlign: "center", padding: "15px" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold", color: "#28a745" }}>82.6%</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Frequência Média</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
