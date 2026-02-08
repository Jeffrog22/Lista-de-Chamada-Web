import React, { useState, useEffect } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import "./Exclusions.css";

// Interface compatível com o Student do Students.tsx
interface ExcludedStudent {
  id: string;
  nome: string;
  nivel: string;
  idade: number;
  categoria: string;
  turma: string;
  horario: string;
  professor: string;
  whatsapp: string;
  genero: string;
  dataNascimento: string;
  parQ: string;
  atestado: boolean;
  dataAtestado?: string;
  dataExclusao?: string;
  // Fallback para propriedades antigas se existirem no storage
  Nome?: string;
  Turma?: string;
  Professor?: string;
  DataExclusao?: string;
  [key: string]: any;
}

export const Exclusions: React.FC = () => {
  const [students, setStudents] = useState<ExcludedStudent[]>([]);
  
  // Estado do Modal de Restauração
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ExcludedStudent | null>(null);
  const [formData, setFormData] = useState({
    nome: "",
    dataNascimento: "",
    genero: "Masculino",
    whatsapp: "",
    turma: "",
    horario: "",
    professor: "",
    nivel: "Iniciante",
    categoria: "Juvenil",
    parQ: "Não",
    atestado: false,
    dataAtestado: ""
  });

  // Carregar dados do localStorage
  useEffect(() => {
    const loadData = () => {
      const saved = localStorage.getItem("excludedStudents");
      if (saved) {
        setStudents(JSON.parse(saved));
      } else {
        setStudents([]);
      }
    };
    loadData();
    
    // Listener para atualizar se a aba mudar (opcional)
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const handleRestoreClick = (student: ExcludedStudent) => {
    setEditingStudent(student);
    setFormData({
      nome: student.nome || student.Nome || "",
      dataNascimento: student.dataNascimento || "",
      genero: student.genero || "Masculino",
      whatsapp: student.whatsapp || "",
      turma: student.turma || student.Turma || "",
      horario: student.horario || "",
      professor: student.professor || student.Professor || "",
      nivel: student.nivel || "Iniciante",
      categoria: student.categoria || "Juvenil",
      parQ: student.parQ || "Não",
      atestado: student.atestado || false,
      dataAtestado: student.dataAtestado || ""
    });
    setShowModal(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    let newValue: string | boolean = type === "checkbox" ? checked : value;

    setFormData((prev) => {
      if (name === "horario" && typeof newValue === "string") {
        const masked = maskHorarioInput(newValue);
        if (!isValidHorarioPartial(masked)) {
          return prev;
        }
        newValue = masked;
      }

      return { ...prev, [name]: newValue };
    });
  };

  const calculateAge = (dateString: string) => {
    if (!dateString) return 0;
    const [day, month, year] = dateString.split("/").map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return isNaN(age) ? 0 : age;
  };

  const confirmRestore = () => {
    if (!editingStudent) return;

    if (!formData.turma) {
      alert("Por favor, defina uma turma para restaurar o aluno.");
      return;
    }

    // 1. Criar objeto do aluno restaurado
    const restoredStudent = {
      ...editingStudent,
      ...formData,
      idade: calculateAge(formData.dataNascimento),
      // Remove campos de exclusão e propriedades antigas/duplicadas
      dataExclusao: undefined,
      DataExclusao: undefined,
      Nome: undefined,
      Turma: undefined,
      Professor: undefined
    };

    // 2. Adicionar aos alunos ativos
    const activeStudents = JSON.parse(localStorage.getItem("activeStudents") || "[]");
    activeStudents.push(restoredStudent);
    localStorage.setItem("activeStudents", JSON.stringify(activeStudents));

    // 3. Remover da lista de exclusão
    const newExcludedList = students.filter(s => s.id !== editingStudent.id);
    setStudents(newExcludedList);
    localStorage.setItem("excludedStudents", JSON.stringify(newExcludedList));

    setShowModal(false);
    setEditingStudent(null);
    alert(`Aluno ${formData.nome} restaurado com sucesso para a turma ${formData.turma}!`);
  };

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
              position: "relative"
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>⚠️</div>
            <h3 style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "10px" }}>{student.nome || student.Nome}</h3>
            <div style={{ fontSize: "13px", opacity: 0.95 }}>
              <p>📚 Turma Anterior: {student.turma || student.Turma}</p>
              <p>👨‍🏫 Professor: {student.professor || student.Professor}</p>
              <p>📅 Excluído em: {student.dataExclusao || student.DataExclusao}</p>
            </div>
            <button
              onClick={() => handleRestoreClick(student)}
              style={{
                marginTop: "15px",
                background: "white",
                border: "none",
                color: "#f5576c",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
              }}
            >
              ↩️ Restaurar & Editar
            </button>
          </div>
        ))}
      </div>

      {students.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno excluído
        </div>
      )}

      {/* MODAL DE RESTAURAÇÃO */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div style={{ background: "white", padding: "25px", borderRadius: "12px", width: "500px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h2 style={{ margin: 0, color: "#2c3e50" }}>Restaurar Aluno</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", color: "#666" }}>✕</button>
            </div>
            
            <div style={{ background: "#fff3cd", color: "#856404", padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px" }}>
              ⚠️ Verifique os dados e defina a nova turma antes de restaurar.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nome Completo</label>
                <input name="nome" value={formData.nome} onChange={handleInputChange} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Turma (Obrigatório)</label>
                <input name="turma" value={formData.turma} onChange={handleInputChange} placeholder="Ex: 1A" style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "2px solid #f39c12", background: "#fffbeb" }} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Horário</label>
                <input name="horario" value={formData.horario} onChange={handleInputChange} placeholder="00:00" style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Professor</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", background: "#f8f9fa", padding: "10px", borderRadius: "6px" }}>
                  {["Joao Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa"].map(prof => (
                    <label key={prof} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", cursor: "pointer" }}>
                      <input type="radio" name="professor" value={prof} checked={formData.professor === prof} onChange={handleInputChange} />
                      {prof}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nível</label>
                <select name="nivel" value={formData.nivel} onChange={handleInputChange} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediario">Intermediário</option>
                  <option value="Avancado">Avançado</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Categoria</label>
                <select name="categoria" value={formData.categoria} onChange={handleInputChange} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
                  <option value="Infantil">Infantil</option>
                  <option value="Juvenil">Juvenil</option>
                  <option value="Adulto">Adulto</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "25px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ background: "#ccc", color: "#333", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmRestore} style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>Confirmar Restauração</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exclusions;
