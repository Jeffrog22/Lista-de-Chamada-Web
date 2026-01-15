import React, { useState } from "react";
import "./Exclusions.css";

interface ExcludedStudent {
  Nome: string;
  DataExclusao?: string;
  Turma?: string;
  Professor?: string;
  [key: string]: any;
}

export const Exclusions: React.FC = () => {
  const [students] = useState<ExcludedStudent[]>([
    { Nome: "Roberto Alves", DataExclusao: "10/01/2026", Turma: "1A", Professor: "João" },
    { Nome: "Fernanda Lima", DataExclusao: "08/01/2026", Turma: "1B", Professor: "Maria" },
  ]);

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ marginBottom: "15px", color: "#2c3e50" }}>Alunos Excluídos</h3>
        <p style={{ color: "#666", fontSize: "14px" }}>Total: {students.length} alunos</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "15px" }}>
        {students.map((student, idx) => (
          <div
            key={idx}
            style={{
              background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
              color: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 4px 15px rgba(245, 87, 108, 0.2)",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>⚠️</div>
            <h3 style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "10px" }}>{student.Nome}</h3>
            <div style={{ fontSize: "13px", opacity: 0.95 }}>
              <p>📚 Turma: {student.Turma}</p>
              <p>👨‍🏫 Professor: {student.Professor}</p>
              <p>📅 Data: {student.DataExclusao}</p>
            </div>
            <button
              style={{
                marginTop: "15px",
                background: "rgba(255, 255, 255, 0.3)",
                border: "none",
                color: "white",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              ↩️ Restaurar
            </button>
          </div>
        ))}
      </div>

      {students.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno excluído
        </div>
      )}
    </div>
  );
};

export default Exclusions;
