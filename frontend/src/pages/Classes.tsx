import React, { useState, useEffect } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { getBootstrap } from "../api";
import "./Classes.css";

interface Class {
  Turma: string;
  TurmaCodigo?: string;
  Horario: string;
  Professor: string;
  Nivel?: string;
  Atalho?: string;
  CapacidadeMaxima?: number;
  DiasSemana?: string;
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

export const Classes: React.FC = () => {
  // MOCK DATA - Baseado em chamadaBelaVista.xlsx
  const [classes, setClasses] = useState<Class[]>([
    { Turma: "1A", Horario: "14:00", Professor: "Joao Silva", Nivel: "Iniciante", Atalho: "1A", CapacidadeMaxima: 20 },
    { Turma: "1B", Horario: "15:30", Professor: "Maria Santos", Nivel: "Intermediario", Atalho: "1B", CapacidadeMaxima: 20 },
    { Turma: "2A", Horario: "16:30", Professor: "Carlos Oliveira", Nivel: "Avancado", Atalho: "2A", CapacidadeMaxima: 15 },
    { Turma: "2B", Horario: "18:00", Professor: "Ana Costa", Nivel: "Iniciante", Atalho: "2B", CapacidadeMaxima: 20 },
  ]);
  
  const [loading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [studentCounts, setStudentCounts] = useState<{ [key: string]: number }>({});
  const [sortKey, setSortKey] = useState<"Turma" | "Horario" | "Professor" | "Nivel" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const updateCounts = () => {
      const studentsStr = localStorage.getItem("activeStudents");
      if (studentsStr) {
        const students = JSON.parse(studentsStr);
        const counts: { [key: string]: number } = {};
        students.forEach((s: any) => {
          const key = s.turmaCodigo || s.turma;
          if (key) {
            counts[key] = (counts[key] || 0) + 1;
          }
        });
        setStudentCounts(counts);
      }
    };
    updateCounts();
    const intervalId = window.setInterval(updateCounts, 2000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    getBootstrap()
      .then((response) => {
        const data = response.data as {
          classes: Array<{
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            capacidade: number;
            dias_semana: string;
          }>;
        };

        if (data.classes.length === 0) return;
        const mapped = data.classes.map((cls) => ({
          Turma: cls.turma_label || cls.codigo,
          TurmaCodigo: cls.codigo,
          Horario: cls.horario,
          Professor: cls.professor,
          Nivel: cls.nivel,
          Atalho: cls.codigo,
          CapacidadeMaxima: cls.capacidade,
          DiasSemana: cls.dias_semana,
        }));
        setClasses(mapped);
        localStorage.setItem("activeClasses", JSON.stringify(mapped));
      })
      .catch(() => {
        // keep local data
      });
  }, []);

  const filteredClasses = classes.filter(
    (c) =>
      c.Turma.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.Professor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.Nivel || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const nivelOrder = [
    "iniciacao b",
    "iniciacao a",
    "nivel 1",
    "nivel 2",
    "nivel 3",
    "nivel 4",
    "adulto b",
    "adulto a",
  ];

  const getNivelRank = (nivel?: string) => {
    if (!nivel) return Number.MAX_SAFE_INTEGER;
    const normalized = nivel.toLowerCase().trim();
    const idx = nivelOrder.indexOf(normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };

  const compareHorario = (a: string, b: string) => {
    const normalize = (value: string) => {
      if (!value) return 0;
      const digits = value.replace(/\D/g, "");
      if (digits.length === 3) return parseInt(`0${digits}`, 10);
      if (digits.length >= 4) return parseInt(digits.slice(0, 4), 10);
      return 0;
    };
    return normalize(a) - normalize(b);
  };

  const sortedClasses = [...filteredClasses].sort((a, b) => {
    if (!sortKey) return 0;
    let result = 0;
    if (sortKey === "Turma") {
      result = a.Turma.localeCompare(b.Turma);
    } else if (sortKey === "Horario") {
      result = compareHorario(a.Horario, b.Horario);
    } else if (sortKey === "Professor") {
      result = a.Professor.localeCompare(b.Professor);
    } else if (sortKey === "Nivel") {
      result = getNivelRank(a.Nivel) - getNivelRank(b.Nivel);
    }
    return sortDir === "asc" ? result : -result;
  });

  const handleSort = (key: "Turma" | "Horario" | "Professor" | "Nivel") => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIndicator = (key: "Turma" | "Horario" | "Professor" | "Nivel") => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

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
    localStorage.setItem("attendanceTargetTurma", turma);
    window.location.hash = "attendance";
  };

  const getLotacaoStyle = (count: number, capacity: number) => {
    if (capacity > 0 && count > capacity) {
      return { background: "#FF6969", color: "#1f1f1f" };
    }
    if (capacity > 0 && count === capacity) {
      return { background: "#FFDF57", color: "#1f1f1f" };
    }
    return { background: "#eef2ff", color: "#4f46e5" };
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue: string | number = value;

    setFormData((prev) => {
      if (name === "Horario") {
        const masked = maskHorarioInput(value);
        if (!isValidHorarioPartial(masked)) {
          return prev;
        }
        newValue = masked;
      } else if (name === "CapacidadeMaxima") {
        newValue = parseInt(value) || 0;
      }

      return { ...prev, [name]: newValue };
    });
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
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>turma</label>
              <input
                type="text"
                name="Turma"
                placeholder="Turma"
                value={formData.Turma || ""}
                onChange={handleFormChange}
                disabled={!!editingClass}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>horário</label>
              <input
                type="text"
                name="Horario"
                placeholder="00:00"
                value={formData.Horario ? formatHorario(String(formData.Horario)) : ""}
                onChange={handleFormChange}
                disabled={!!editingClass}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>professor(a)</label>
              <input
                type="text"
                name="Professor"
                placeholder="Professor"
                value={formData.Professor || ""}
                onChange={handleFormChange}
                disabled={!!editingClass}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>nível</label>
              <input
                type="text"
                name="Nivel"
                placeholder="Nível"
                value={formData.Nivel || ""}
                onChange={handleFormChange}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>capacidade</label>
              <input
                type="number"
                name="CapacidadeMaxima"
                placeholder="Capacidade Máxima *"
                value={formData.CapacidadeMaxima || ""}
                onChange={handleFormChange}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", textTransform: "lowercase", color: "#666" }}>cód. turma</label>
              <input
                type="text"
                name="Atalho"
                placeholder="Atalho"
                value={formData.Atalho || ""}
                onChange={handleFormChange}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}
              />
            </div>
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
              <th
                onClick={() => handleSort("Turma")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Turma{getSortIndicator("Turma")}
              </th>
              <th
                onClick={() => handleSort("Horario")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Horário{getSortIndicator("Horario")}
              </th>
              <th
                onClick={() => handleSort("Professor")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Professor{getSortIndicator("Professor")}
              </th>
              <th
                onClick={() => handleSort("Nivel")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Nível{getSortIndicator("Nivel")}
              </th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "bold" }}>Lotação</th>
              <th style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedClasses.map((classData, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                <td style={{ padding: "12px" }} title={classData.TurmaCodigo ? `Codigo: ${classData.TurmaCodigo}` : ""}>
                  {classData.Turma}
                </td>
                <td style={{ padding: "12px" }}>{formatHorario(classData.Horario)}</td>
                <td style={{ padding: "12px" }}>{classData.Professor}</td>
                <td style={{ padding: "12px" }}>{classData.Nivel || "-"}</td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  <span
                    style={{
                      ...getLotacaoStyle(
                        studentCounts[classData.TurmaCodigo || classData.Turma] || 0,
                        classData.CapacidadeMaxima || 0
                      ),
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontWeight: "bold",
                      fontSize: "12px",
                    }}
                  >
                    {studentCounts[classData.TurmaCodigo || classData.Turma] || 0} / {classData.CapacidadeMaxima || 0}
                  </span>
                </td>
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
