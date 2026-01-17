import React, { useState, useEffect } from "react";

interface Student {
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
}

export const Students: React.FC = () => {
  // Mock Data inicial expandido
  const [students, setStudents] = useState<Student[]>([
    { 
      id: "1", nome: "João Silva", nivel: "Iniciante", idade: 15, categoria: "Juvenil", 
      turma: "1A", horario: "14:00", professor: "Joao Silva", whatsapp: "(11) 98765-4321",
      genero: "Masculino", dataNascimento: "10/05/2010", parQ: "Não", atestado: true, dataAtestado: "15/01/2025"
    },
    { 
      id: "2", nome: "Maria Santos", nivel: "Intermediario", idade: 16, categoria: "Juvenil", 
      turma: "1B", horario: "15:30", professor: "Maria Santos", whatsapp: "(11) 98765-4322",
      genero: "Feminino", dataNascimento: "20/08/2009", parQ: "Sim", atestado: false
    },
    { 
      id: "3", nome: "Carlos Oliveira", nivel: "Avancado", idade: 17, categoria: "Adulto", 
      turma: "2A", horario: "16:30", professor: "Carlos Oliveira", whatsapp: "(11) 98765-4323",
      genero: "Masculino", dataNascimento: "05/02/2008", parQ: "Não", atestado: false
    },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estado do formulário
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

  // Carregar dados persistentes (sticky) ao iniciar
  useEffect(() => {
    const sticky = localStorage.getItem("studentStickyData");
    if (sticky) {
      const parsed = JSON.parse(sticky);
      setFormData((prev) => ({
        ...prev,
        turma: parsed.turma || "",
        horario: parsed.horario || "",
        professor: parsed.professor || "",
        parQ: parsed.parQ || "Não"
      }));
    }
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleAddClick = () => {
    setEditingId(null);
    const sticky = localStorage.getItem("studentStickyData");
    const parsed = sticky ? JSON.parse(sticky) : {};
    
    setFormData({
      nome: "",
      dataNascimento: "",
      genero: "Masculino",
      whatsapp: "",
      turma: parsed.turma || "",
      horario: parsed.horario || "",
      professor: parsed.professor || "",
      nivel: "Iniciante",
      categoria: "Juvenil",
      parQ: parsed.parQ || "Não",
      atestado: false,
      dataAtestado: ""
    });
    setShowModal(true);
  };

  const handleEditClick = (student: Student) => {
    setEditingId(student.id);
    setFormData({
      nome: student.nome,
      dataNascimento: student.dataNascimento,
      genero: student.genero,
      whatsapp: student.whatsapp,
      turma: student.turma,
      horario: student.horario,
      professor: student.professor,
      nivel: student.nivel,
      categoria: student.categoria,
      parQ: student.parQ,
      atestado: student.atestado,
      dataAtestado: student.dataAtestado || ""
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.turma) {
      alert("Preencha os campos obrigatórios (Nome, Turma)");
      return;
    }

    const studentData: Student = {
      id: editingId || Date.now().toString(),
      nome: formData.nome,
      dataNascimento: formData.dataNascimento,
      genero: formData.genero,
      whatsapp: formData.whatsapp,
      turma: formData.turma,
      horario: formData.horario,
      professor: formData.professor,
      nivel: formData.nivel,
      categoria: formData.categoria,
      parQ: formData.parQ,
      atestado: formData.atestado,
      dataAtestado: formData.atestado ? formData.dataAtestado : undefined,
      idade: calculateAge(formData.dataNascimento)
    };

    if (editingId) {
      setStudents((prev) => prev.map((s) => (s.id === editingId ? studentData : s)));
      alert("Aluno atualizado com sucesso!");
    } else {
      setStudents([...students, studentData]);
      alert("Aluno adicionado com sucesso!");
    }

    // Salvar dados persistentes (sticky)
    const stickyData = {
      turma: formData.turma,
      horario: formData.horario,
      professor: formData.professor,
      parQ: formData.parQ
    };
    localStorage.setItem("studentStickyData", JSON.stringify(stickyData));

    // Resetar campos específicos
    setFormData((prev) => ({
      ...prev,
      nome: "",
      dataNascimento: "",
      genero: "Masculino",
      whatsapp: "",
      // Mantém turma, horário, professor, parQ
    }));

    setShowModal(false);
    setEditingId(null);
  };

  const handleDelete = (student: Student) => {
    if (confirm(`Deseja excluir o aluno ${student.nome}?`)) {
      // Simulação de envio para lista de exclusão
      const excludedStudents = JSON.parse(localStorage.getItem("excludedStudents") || "[]");
      excludedStudents.push({ ...student, dataExclusao: new Date().toLocaleDateString() });
      localStorage.setItem("excludedStudents", JSON.stringify(excludedStudents));

      setStudents(students.filter((s) => s.id !== student.id));
      alert("Aluno movido para a lista de exclusão.");
    }
  };

  const handleGoToAttendance = (turma: string) => {
    // Simulação de navegação. Em um app real usaria navigate('/attendance', { state: { turma } })
    alert(`Ir para chamada da turma ${turma}`);
    // window.location.href = `/attendance?turma=${turma}`; // Exemplo se houvesse rotas
  };

  const filteredStudents = students.filter(
    (s) =>
      s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.turma.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="🔍 Buscar aluno por nome ou turma..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: "12px",
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
            padding: "12px 24px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "14px",
            whiteSpace: "nowrap"
          }}
        >
          + Aluno
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", color: "#333", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Nome</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Nível</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Idade</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Categoria</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Turma</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Horário</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Professor</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student, idx) => (
              <tr key={student.id} style={{ borderBottom: "1px solid #eee", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                <td 
                  style={{ padding: "12px", fontWeight: 500, cursor: "pointer", color: "#2c3e50" }}
                  onClick={() => handleEditClick(student)}
                  title="Clique para editar"
                >
                  <span style={{ borderBottom: "1px dashed #ccc" }}>{student.nome}</span>
                </td>
                <td style={{ padding: "12px" }}>{student.nivel}</td>
                <td style={{ padding: "12px", textAlign: "center" }}>{student.idade}</td>
                <td style={{ padding: "12px" }}>{student.categoria}</td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  <span style={{ background: "#eef2ff", color: "#4f46e5", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold", fontSize: "12px" }}>
                    {student.turma}
                  </span>
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>{student.horario}</td>
                <td style={{ padding: "12px" }}>{student.professor}</td>
                <td style={{ padding: "12px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                  <button
                    onClick={() => handleGoToAttendance(student.turma)}
                    title="Ir para chamada"
                    style={{
                      background: "#28a745",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    📅 Chamada
                  </button>
                  <button
                    onClick={() => handleDelete(student)}
                    title="Excluir aluno"
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px"
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

      {filteredStudents.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno encontrado
        </div>
      )}

      {/* MODAL ADICIONAR ALUNO */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div style={{ background: "white", padding: "25px", borderRadius: "12px", width: "500px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#2c3e50", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              {editingId ? "Editar Aluno" : "Adicionar Novo Aluno"}
            </h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nome Completo</label>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Data Nascimento (dd/mm/aaaa)</label>
                <input
                  name="dataNascimento"
                  value={formData.dataNascimento}
                  onChange={handleInputChange}
                  placeholder="Ex: 10/05/2010"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Gênero</label>
                <select
                  name="genero"
                  value={formData.genero}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Não binário">Não binário</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>WhatsApp</label>
                <input
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleInputChange}
                  placeholder="(##) # ####-####"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              {/* Campos Sticky */}
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Turma</label>
                <input
                  name="turma"
                  value={formData.turma}
                  onChange={handleInputChange}
                  placeholder="Ex: 1A"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#fffbeb" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Horário</label>
                <input
                  name="horario"
                  value={formData.horario}
                  onChange={handleInputChange}
                  placeholder="Ex: 14:00"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", background: "#fffbeb" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Professor</label>
                <div style={{ display: "flex", gap: "15px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  {["Joao Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa"].map(prof => (
                    <label key={prof} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="professor"
                        value={prof}
                        checked={formData.professor === prof}
                        onChange={handleInputChange}
                      />
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

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>ParQ (Apto para atividade física?)</label>
                <div style={{ display: "flex", gap: "20px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Sim" checked={formData.parQ === "Sim"} onChange={handleInputChange} /> Sim
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Não" checked={formData.parQ === "Não"} onChange={handleInputChange} /> Não
                  </label>
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", marginTop: "5px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="atestado"
                    checked={formData.atestado}
                    onChange={handleInputChange}
                    style={{ width: "16px", height: "16px" }}
                  />
                  Possui Atestado Médico?
                </label>
                
                {formData.atestado && (
                  <input
                    name="dataAtestado"
                    value={formData.dataAtestado}
                    onChange={handleInputChange}
                    placeholder="Data do Atestado (dd/mm/aaaa)"
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "25px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "#6c757d", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                {editingId ? "Salvar Alterações" : "Salvar Aluno"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
