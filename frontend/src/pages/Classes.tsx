import React, { useState } from "react";
import "./Classes.css";

interface Class {
  Turma: string;
  Horario: string;
  Professor: string;
  Nivel?: string;
  Atalho?: string;
}

export const Classes: React.FC = () => {
  // MOCK DATA - Baseado em chamadaBelaVista.xlsx
  const [classes, setClasses] = useState<Class[]>([
    { Turma: "1A", Horario: "14:00", Professor: "Joao Silva", Nivel: "Iniciante", Atalho: "1A" },
    { Turma: "1B", Horario: "15:30", Professor: "Maria Santos", Nivel: "Intermediario", Atalho: "1B" },
    { Turma: "2A", Horario: "16:30", Professor: "Carlos Oliveira", Nivel: "Avancado", Atalho: "2A" },
    { Turma: "2B", Horario: "18:00", Professor: "Ana Costa", Nivel: "Iniciante", Atalho: "2B" },
  ]);
  
  const [loading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const filteredClasses = classes.filter(
    (c) =>
      c.Turma.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.Professor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddClick = () => {
    setEditingClass(null);
    setFormData({});
    setShowForm(true);
  };

  const handleEditClick = (classData: Class) => {
    setEditingClass(classData);
    setFormData(classData);
    setShowForm(true);
  };

  const handleSave = () => {
    if (editingClass) {
      setClasses((prev) =>
        prev.map((c) =>
          c.Turma === editingClass.Turma && c.Horario === editingClass.Horario
            ? ({ ...c, ...formData } as Class)
            : c
        )
      );
      alert("Turma atualizada com sucesso!");
    } else {
      setClasses((prev) => [...prev, formData as Class]);
      alert("Turma adicionada com sucesso!");
    }
    setShowForm(false);
  };

  const handleDelete = (classData: Class) => {
    if (confirm("Tem certeza que deseja deletar esta Turma? Certifique-se de que ela esteja vazia antes de excluir; Caso contrário os alunos ficaram perdidos, sem turma e não aparecerão mais nas chamadas")) {
      setClasses((prev) =>
        prev.filter(
          (c) => c.Turma !== classData.Turma || c.Horario !== classData.Horario
        )
      );
      alert("Turma excluída com sucesso!");
    }
  };

  const handleGoToAttendance = (turma: string) => {
    alert(`Ir para chamada da turma ${turma}`);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === "Horario") {
      const digits = value.replace(/\D/g, "").slice(0, 4);
      if (digits.length >= 3) {
        newValue = `${digits.slice(0, 2)}:${digits.slice(2)}`;
      } else {
        newValue = digits;
      }
    }
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar turma..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
        <button
          onClick={handleAddClick}
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            transition: "all 0.2s ease",
          }}
        >
          ➕ Nova Turma
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#f9f9f9", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
          <h3>{editingClass ? "Editar Turma" : "Adicionar Turma"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "15px" }}>
            <input
              type="text"
              name="Turma"
              placeholder="Turma"
              value={formData.Turma || ""}
              onChange={handleFormChange}
              disabled={!!editingClass}
              style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
            />
            <input
              type="text"
              name="Horario"
              placeholder="00:00"
              value={formData.Horario || ""}
              onChange={handleFormChange}
              disabled={!!editingClass}
              style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
            />
            <input
              type="text"
              name="Professor"
              placeholder="Professor"
              value={formData.Professor || ""}
              onChange={handleFormChange}
              disabled={!!editingClass}
              style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
            />
            <input
              type="text"
              name="Nivel"
              placeholder="Nível"
              value={formData.Nivel || ""}
              onChange={handleFormChange}
              style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
            />
            <input
              type="text"
              name="Atalho"
              placeholder="Atalho"
              value={formData.Atalho || ""}
              onChange={handleFormChange}
              style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
            <button
              onClick={handleSave}
              style={{
                background: "#28a745",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ✓ Salvar
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                background: "#6c757d",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#667eea", color: "white" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Turma</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Horário</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Professor</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold" }}>Nível</th>
              <th style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map((classData, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                <td style={{ padding: "12px" }}>{classData.Turma}</td>
                <td style={{ padding: "12px" }}>{classData.Horario}</td>
                <td style={{ padding: "12px" }}>{classData.Professor}</td>
                <td style={{ padding: "12px" }}>{classData.Nivel || "-"}</td>
                <td style={{ padding: "12px", textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleGoToAttendance(classData.Turma)}
                    style={{
                      background: "#28a745",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    📅 Chamada
                  </button>
                  <button
                    onClick={() => handleEditClick(classData)}
                    style={{
                      background: "#667eea",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    ✎ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(classData)}
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredClasses.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhuma turma encontrada
        </div>
      )}
    </div>
  );
};

export default Classes;
