import React, { useState } from "react";

export const Attendance: React.FC = () => {
  const [attendance, setAttendance] = useState([
    { id: 1, aluno: "João Silva", data: "14/01/2026", status: "Presente", turma: "1A" },
    { id: 2, aluno: "Maria Santos", data: "14/01/2026", status: "Presente", turma: "1A" },
    { id: 3, aluno: "Carlos Oliveira", data: "14/01/2026", status: "Falta", turma: "1B" },
    { id: 4, aluno: "Ana Costa", data: "14/01/2026", status: "Presente", turma: "1B" },
  ]);

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <input
          type="date"
          defaultValue="2026-01-14"
          style={{
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
        <select
          style={{
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          <option>Todas as turmas</option>
          <option>1A</option>
          <option>1B</option>
          <option>2A</option>
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#667eea", color: "white" }}>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Aluno</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Turma</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Data</th>
            <th style={{ padding: "12px", textAlign: "center", fontWeight: "bold" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map((item) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
              <td style={{ padding: "12px" }}>{item.aluno}</td>
              <td style={{ padding: "12px" }}>{item.turma}</td>
              <td style={{ padding: "12px" }}>{item.data}</td>
              <td style={{ padding: "12px", textAlign: "center" }}>
                <span
                  style={{
                    background: item.status === "Presente" ? "#28a745" : "#dc3545",
                    color: "white",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Attendance;