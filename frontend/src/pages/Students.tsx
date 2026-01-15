import React, { useEffect, useState } from "react";
import axios from "axios";

interface Student {
  id?: string;
  nome: string;
  turma: string;
  email?: string;
  telefone?: string;
}

export const Students: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([
    { id: "1", nome: "João Silva", turma: "1A", email: "joao@email.com", telefone: "(11) 98765-4321" },
    { id: "2", nome: "Maria Santos", turma: "1A", email: "maria@email.com", telefone: "(11) 98765-4322" },
    { id: "3", nome: "Carlos Oliveira", turma: "1B", email: "carlos@email.com", telefone: "(11) 98765-4323" },
    { id: "4", nome: "Ana Costa", turma: "1B", email: "ana@email.com", telefone: "(11) 98765-4324" },
    { id: "5", nome: "Pedro Ferreira", turma: "2A", email: "pedro@email.com", telefone: "(11) 98765-4325" },
  ]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Carregar dados do backend se disponível
  }, []);

  const filteredStudents = students.filter(
    (s) =>
      s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.turma.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="🔍 Buscar aluno por nome ou turma..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "15px" }}>
        {filteredStudents.map((student) => (
          <div
            key={student.id}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>👤</div>
            <h3 style={{ margin: "10px 0", fontSize: "16px", fontWeight: "bold" }}>{student.nome}</h3>
            <p style={{ background: "rgba(255, 255, 255, 0.2)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", display: "inline-block", marginBottom: "12px" }}>
              {student.turma}
            </p>
            <div style={{ fontSize: "13px", opacity: 0.95, lineHeight: "1.6" }}>
              <p>📧 {student.email}</p>
              <p>📱 {student.telefone}</p>
            </div>
          </div>
        ))}
      </div>

      {filteredStudents.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno encontrado
        </div>
      )}
    </div>
  );
};