import React, { useEffect, useState } from "react";
import axios from "axios";

interface Student {
  id: number;
  nome: string;
  whatsapp?: string;
  turma?: string;
}

export const Students: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setError("Não autenticado");
        return;
      }
      
      const response = await axios.get("http://localhost:8000/students", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudents(response.data);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar alunos. Verifique se o backend está rodando.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este aluno?")) return;
    try {
      const token = localStorage.getItem("access_token");
      await axios.delete(`http://localhost:8000/students/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir aluno.");
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3>Lista de Alunos ({students.length})</h3>
        <button onClick={fetchStudents} disabled={loading}>{loading ? "..." : "Atualizar"}</button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, textAlign: "left", maxHeight: "300px", overflowY: "auto" }}>
        {students.map((s) => (
          <li key={s.id} style={{ padding: "5px 0", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{s.nome}</strong> {s.turma && <span style={{ opacity: 0.7 }}>- {s.turma}</span>}
            </div>
            <button onClick={() => handleDelete(s.id)} style={{ background: "red", color: "white", padding: "2px 8px", fontSize: "0.8em" }}>Excluir</button>
          </li>
        ))}
      </ul>
    </div>
  );
};