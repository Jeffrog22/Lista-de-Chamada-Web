import React, { useState, useEffect } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { getBootstrap } from "../api";

interface Student {
  id: string;
  nome: string;
  nivel: string;
  idade: number;
  categoria: string;
  turma: string;
  turmaCodigo?: string;
  horario: string;
  professor: string;
  whatsapp: string;
  genero: string;
  dataNascimento: string;
  parQ: string;
  atestado: boolean;
  dataAtestado?: string;
}

const WhatsappButton: React.FC<{ phoneNumber: string }> = ({ phoneNumber }) => {
  const handleClick = () => {
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (cleanNumber) {
      window.open(`https://wa.me/55${cleanNumber}`, "_blank");
    } else {
      alert("Número inválido para WhatsApp");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Abrir WhatsApp"
      style={{
        background: "#25D366",
        color: "white",
        border: "none",
        borderRadius: "6px",
        width: "42px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
      }}
    >
      📱
    </button>
  );
};

export const Students: React.FC = () => {
  // Mock Data inicial expandido
  const initialMockStudents: Student[] = [
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
    }
  ];

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem("activeStudents");
    return saved ? JSON.parse(saved) : initialMockStudents;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("activeStudents", JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getBootstrap()
      .then((response) => {
        if (!isMounted) return;
        const data = response.data as {
          classes: Array<{
            id: number;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            faixa_etaria: string;
            capacidade: number;
            dias_semana: string;
          }>;
          students: Array<{
            id: number;
            class_id: number;
            nome: string;
            whatsapp: string;
            data_nascimento: string;
            data_atestado: string;
            categoria: string;
            genero: string;
            parq: string;
            atestado: boolean;
          }>;
        };

        const classById = new Map<number, (typeof data.classes)[number]>();
        data.classes.forEach((cls) => classById.set(cls.id, cls));

        const mapped = data.students.map((student) => {
          const cls = classById.get(student.class_id);
          return {
            id: String(student.id),
            nome: student.nome,
            nivel: cls?.nivel || "",
            idade: calculateAge(student.data_nascimento || ""),
            categoria: student.categoria || "",
            turma: cls?.turma_label || cls?.codigo || "",
            turmaCodigo: cls?.codigo || "",
            horario: cls?.horario || "",
            professor: cls?.professor || "",
            whatsapp: student.whatsapp || "",
            genero: student.genero || "",
            dataNascimento: student.data_nascimento || "",
            parQ: student.parq || "",
            atestado: !!student.atestado,
            dataAtestado: student.data_atestado || "",
          } as Student;
        });

        if (mapped.length > 0) {
          setStudents(mapped);
          localStorage.setItem("activeStudents", JSON.stringify(mapped));
        }

        const classStorage = data.classes.map((cls) => ({
          Turma: cls.turma_label || cls.codigo,
          TurmaCodigo: cls.codigo,
          Horario: cls.horario,
          Professor: cls.professor,
          Nivel: cls.nivel,
          FaixaEtaria: cls.faixa_etaria,
          Atalho: cls.codigo,
          CapacidadeMaxima: cls.capacidade,
          DiasSemana: cls.dias_semana,
        }));
        if (classStorage.length > 0) {
          localStorage.setItem("activeClasses", JSON.stringify(classStorage));
        }
      })
      .catch(() => {
        // keep local data
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [nivelFilter, setNivelFilter] = useState("");
  const [sortKey, setSortKey] = useState<
    "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);

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

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const nivelOrder = [
    "Iniciação B",
    "Iniciação A",
    "Nível 1",
    "Nível 2",
    "Nível 3",
    "Nível 4",
    "Adulto B",
    "Adulto A",
  ];

  const categoriaOrder = [
    "Pré-Mirim",
    "Mirim I",
    "Mirim II",
    "Petiz I",
    "Petiz II",
    "Infantil I",
    "Infantil II",
    "Juvenil I",
    "Juvenil II",
    "Júnior I",
    "Júnior II/Sênior",
  ];

  const getNivelRank = (nivel: string) => {
    const normalized = normalizeText(nivel);
    const idx = nivelOrder.findIndex((item) => normalizeText(item) === normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };

  const getCategoriaRank = (categoria: string) => {
    const normalized = normalizeText(categoria);
    const idx = categoriaOrder.findIndex((item) => normalizeText(item) === normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };

  const compareHorario = (a: string, b: string) => {
    const normalize = (value: string) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return parseInt(digits.slice(0, 4), 10);
      if (digits.length === 3) return parseInt(`0${digits}`, 10);
      if (digits.length === 2) return parseInt(`${digits}00`, 10);
      return Number.MAX_SAFE_INTEGER;
    };
    return normalize(a) - normalize(b);
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

      return {
        ...prev,
        [name]: newValue,
      };
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    setIsEditing(true);
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
    setIsEditing(false);
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
      turmaCodigo: formData.turma,
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

      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      alert("Aluno movido para a lista de exclusão.");
    }
  };

  const handleGoToAttendance = (turma: string) => {
    localStorage.setItem("attendanceTargetTurma", turma);
    window.location.hash = "attendance";
  };

  const nivelExtras = Array.from(
    new Set(
      students
        .map((s) => s.nivel)
        .filter(Boolean)
        .filter((nivel) => !nivelOrder.some((item) => normalizeText(item) === normalizeText(nivel)))
    )
  ).sort((a, b) => a.localeCompare(b));
  const nivelOptions = [...nivelOrder, ...nivelExtras];

  const filteredStudents = students.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      s.nome.toLowerCase().includes(term) ||
      s.categoria.toLowerCase().includes(term) ||
      s.professor.toLowerCase().includes(term);
    const matchesNivel = !nivelFilter || normalizeText(s.nivel) === normalizeText(nivelFilter);
    return matchesSearch && matchesNivel;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (!sortKey) return 0;
    let result = 0;
    if (sortKey === "nome") {
      result = a.nome.localeCompare(b.nome);
    } else if (sortKey === "nivel") {
      result = getNivelRank(a.nivel) - getNivelRank(b.nivel);
    } else if (sortKey === "idade") {
      result = a.idade - b.idade;
    } else if (sortKey === "categoria") {
      const aRank = getCategoriaRank(a.categoria);
      const bRank = getCategoriaRank(b.categoria);
      const aIsCustom = aRank < Number.MAX_SAFE_INTEGER - 1;
      const bIsCustom = bRank < Number.MAX_SAFE_INTEGER - 1;
      if (aIsCustom && bIsCustom) {
        result = aRank - bRank;
      } else if (!aIsCustom && !bIsCustom) {
        result = a.categoria.localeCompare(b.categoria);
      } else {
        result = aIsCustom ? -1 : 1;
      }
    } else if (sortKey === "turma") {
      result = a.turma.localeCompare(b.turma);
    } else if (sortKey === "horario") {
      result = compareHorario(a.horario, b.horario);
    } else if (sortKey === "professor") {
      result = a.professor.localeCompare(b.professor);
    }
    return sortDir === "asc" ? result : -result;
  });

  const handleSort = (
    key: "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor"
  ) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIndicator = (
    key: "nome" | "nivel" | "idade" | "categoria" | "turma" | "horario" | "professor"
  ) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder="🔍 Buscar aluno por nome, categoria ou professor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 36px 12px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              title="Limpar busca"
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "14px",
                color: "#666",
                padding: 0,
              }}
            >
              x
            </button>
          )}
        </div>
        {loading && (
          <span style={{ fontSize: "12px", color: "#666" }}>Carregando...</span>
        )}
        <select
          value={nivelFilter}
          onChange={(e) => setNivelFilter(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ddd",
            borderRadius: "8px",
            fontSize: "14px",
            background: "white",
          }}
        >
          <option value="">Limpar filtro</option>
          {nivelOptions.map((nivel) => (
            <option key={nivel} value={nivel}>
              {nivel}
            </option>
          ))}
        </select>
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
              <th
                onClick={() => handleSort("nome")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Nome{getSortIndicator("nome")}
              </th>
              <th
                onClick={() => handleSort("nivel")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Nível{getSortIndicator("nivel")}
              </th>
              <th
                onClick={() => handleSort("idade")}
                style={{ padding: "12px", textAlign: "center", cursor: "pointer" }}
              >
                Idade{getSortIndicator("idade")}
              </th>
              <th
                onClick={() => handleSort("categoria")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Categoria{getSortIndicator("categoria")}
              </th>
              <th
                onClick={() => handleSort("turma")}
                style={{ padding: "12px", textAlign: "center", cursor: "pointer" }}
              >
                Turma{getSortIndicator("turma")}
              </th>
              <th
                onClick={() => handleSort("horario")}
                style={{ padding: "12px", textAlign: "center", cursor: "pointer" }}
              >
                Horário{getSortIndicator("horario")}
              </th>
              <th
                onClick={() => handleSort("professor")}
                style={{ padding: "12px", textAlign: "left", cursor: "pointer" }}
              >
                Professor{getSortIndicator("professor")}
              </th>
              <th style={{ padding: "12px", textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student, idx) => (
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
                <td style={{ padding: "12px", textAlign: "center" }}>{formatHorario(student.horario)}</td>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
              <h2 style={{ margin: 0, color: "#2c3e50" }}>
                {editingId ? "Aluno" : "Adicionar Novo Aluno"}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {editingId && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      background: "#f39c12",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "13px"
                    }}
                  >
                    ✏️ Editar
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "20px",
                    cursor: "pointer",
                    color: "#666",
                    padding: "0 5px",
                    fontWeight: "bold"
                  }}
                  title="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nome Completo</label>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Data Nascimento (dd/mm/aaaa)</label>
                <input
                  name="dataNascimento"
                  value={formData.dataNascimento}
                  onChange={handleInputChange}
                  disabled={!isEditing}
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
                  disabled={!isEditing}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Não binário">Não binário</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>WhatsApp</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleInputChange}
                    placeholder="(##) # ####-####"
                    disabled={!isEditing}
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                  <WhatsappButton phoneNumber={formData.whatsapp} />
                </div>
              </div>

              {/* Campos Sticky */}
              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Turma</label>
                <input
                  name="turma"
                  value={formData.turma}
                  onChange={handleInputChange}
                  disabled={!isEditing}
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
                  disabled={!isEditing}
                  placeholder="00:00"
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
                        disabled={!isEditing}
                      />
                      {prof}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Nível</label>
                <select name="nivel" value={formData.nivel} onChange={handleInputChange} disabled={!isEditing} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediario">Intermediário</option>
                  <option value="Avancado">Avançado</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>Categoria</label>
                <select name="categoria" value={formData.categoria} onChange={handleInputChange} disabled={!isEditing} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
                  <option value="Infantil">Infantil</option>
                  <option value="Juvenil">Juvenil</option>
                  <option value="Adulto">Adulto</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>ParQ (Apto para atividade física?)</label>
                <div style={{ display: "flex", gap: "20px", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Sim" checked={formData.parQ === "Sim"} onChange={handleInputChange} disabled={!isEditing} /> Sim
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input type="radio" name="parQ" value="Não" checked={formData.parQ === "Não"} onChange={handleInputChange} disabled={!isEditing} /> Não
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
                    disabled={!isEditing}
                    style={{ width: "16px", height: "16px" }}
                  />
                  Possui Atestado Médico?
                </label>
                
                {formData.atestado && (
                  <input
                    name="dataAtestado"
                    value={formData.dataAtestado}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="Data do Atestado (dd/mm/aaaa)"
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "25px", justifyContent: "flex-end" }}>
              {isEditing && (
                <button
                  onClick={handleSave}
                  style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {editingId ? "Salvar Alterações" : "Salvar Aluno"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
