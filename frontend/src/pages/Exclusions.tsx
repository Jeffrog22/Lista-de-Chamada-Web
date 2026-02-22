import React, { useEffect, useState } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { addExclusion, deleteExclusion, getExcludedStudents, restoreStudent } from "../api";
import "./Exclusions.css";

interface ExcludedStudent {
  id?: string;
  nome?: string;
  turma?: string;
  turmaLabel?: string;
  turmaCodigo?: string;
  horario?: string;
  professor?: string;
  nivel?: string;
  categoria?: string;
  whatsapp?: string;
  genero?: string;
  dataNascimento?: string;
  parQ?: string;
  atestado?: boolean;
  dataAtestado?: string;
  dataExclusao?: string;
  motivo_exclusao?: string;
  Nome?: string;
  Turma?: string;
  TurmaLabel?: string;
  TurmaCodigo?: string;
  Horario?: string;
  Professor?: string;
  DataExclusao?: string;
  MotivoExclusao?: string;
  [key: string]: any;
}

export const Exclusions: React.FC = () => {
  const exclusionReasonOptions = ["Falta", "Desistência", "Transferência", "Documentação"];
  const [students, setStudents] = useState<ExcludedStudent[]>([]);
  const turmaOptions = ["Quarta e Sexta", "Terça e Quinta"];
  const [lastTurma, setLastTurma] = useState<string>(turmaOptions[0]);
  const [professorOptions, setProfessorOptions] = useState<string[]>([]);
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
    nivel: "",
    categoria: "",
    parQ: "Não",
    atestado: false,
    dataAtestado: "",
  });

  const categoriaRules = [
    { min: 6, label: "Pré-Mirim" },
    { min: 9, label: "Mirim I" },
    { min: 10, label: "Mirim II" },
    { min: 11, label: "Petiz I" },
    { min: 12, label: "Petiz II" },
    { min: 13, label: "Infantil I" },
    { min: 14, label: "Infantil II" },
    { min: 15, label: "Juvenil I" },
    { min: 16, label: "Juvenil II" },
    { min: 17, label: "Júnior I" },
    { min: 18, label: "Júnior II/Sênior" },
    { min: 20, label: "A20+" },
    { min: 25, label: "B25+" },
    { min: 30, label: "C30+" },
    { min: 35, label: "D35+" },
    { min: 40, label: "E40+" },
    { min: 45, label: "F45+" },
    { min: 50, label: "G50+" },
    { min: 55, label: "H55+" },
    { min: 60, label: "I60+" },
    { min: 65, label: "J65+" },
    { min: 70, label: "K70+" },
  ];

  const maskDateInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const normalizeDateValue = (value: string) => {
    if (!value) return "";
    const raw = value.trim();
    if (raw.includes("-")) {
      const datePart = raw.split("T")[0];
      const [year, month, day] = datePart.split("-").map(Number);
      if (day && month && year) {
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      }
    }
    if (raw.includes("/")) return raw;
    return maskDateInput(raw);
  };

  const parseDateParts = (dateString: string) => {
    if (!dateString || !dateString.includes("/")) return null;
    const [day, month, year] = dateString.split("/").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  };

  const calculateAge = (dateString: string) => {
    const birthDate = parseDateParts(dateString);
    if (!birthDate || Number.isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return isNaN(age) ? 0 : age;
  };

  const getCategoriaByAge = (age: number) => {
    if (!Number.isFinite(age) || age < 6) return "";
    let result = "";
    categoriaRules.forEach((rule) => {
      if (age >= rule.min) result = rule.label;
    });
    return result;
  };

  const formatHorario = (value: string) => {
    const masked = maskHorarioInput(value || "");
    return isValidHorarioPartial(masked) ? masked : value;
  };

  useEffect(() => {
    let isMounted = true;
    const loadLocal = () => {
      try {
        const raw = localStorage.getItem("excludedStudents");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setStudents(parsed);
      } catch {
        // ignore
      }
    };

    getExcludedStudents()
      .then((response) => {
        if (!isMounted) return;
        const data = response.data;
        if (Array.isArray(data)) {
          setStudents(data as ExcludedStudent[]);
          localStorage.setItem("excludedStudents", JSON.stringify(data));
        } else {
          loadLocal();
        }
      })
      .catch(() => {
        if (isMounted) loadLocal();
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("activeClasses");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const professors = new Set<string>();
      parsed.forEach((cls: any) => {
        if (cls.Professor) professors.add(String(cls.Professor));
      });
      setProfessorOptions(Array.from(professors));
    } catch {
      // ignore
    }
  }, []);

  const resolveTurmaLabel = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("quarta") || normalized.includes("sexta")) {
      return "Quarta e Sexta";
    }
    if (normalized.includes("terca") || normalized.includes("terça") || normalized.includes("quinta")) {
      return "Terça e Quinta";
    }
    return "";
  };

  const handleRestoreClick = (student: ExcludedStudent) => {
    const rawTurma = student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "";
    const turmaValue = resolveTurmaLabel(rawTurma) || lastTurma;
    const dataNascimento = normalizeDateValue(student.dataNascimento || "").trim();
    const idade = calculateAge(dataNascimento);
    const categoriaCalc = getCategoriaByAge(idade) || student.categoria || "";

    setEditingStudent(student);
    if (turmaValue) {
      setLastTurma(turmaValue);
    }
    setFormData({
      nome: student.nome || student.Nome || "",
      dataNascimento,
      genero: student.genero || "Masculino",
      whatsapp: student.whatsapp || "",
      turma: turmaValue,
      horario: formatHorario(student.horario || student.Horario || ""),
      professor: student.professor || student.Professor || "",
      nivel: student.nivel || "",
      categoria: categoriaCalc,
      parQ: student.parQ || "Não",
      atestado: !!student.atestado,
      dataAtestado: normalizeDateValue(student.dataAtestado || ""),
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
        if (!isValidHorarioPartial(masked)) return prev;
        newValue = masked;
      }

      if (name === "dataNascimento" && typeof newValue === "string") {
        const masked = maskDateInput(newValue);
        const idade = calculateAge(masked);
        const categoria = getCategoriaByAge(idade);
        return { ...prev, [name]: masked, categoria };
      }

      if (name === "dataAtestado" && typeof newValue === "string") {
        const masked = maskDateInput(newValue);
        return { ...prev, [name]: masked };
      }

      return { ...prev, [name]: newValue };
    });
  };

  const confirmRestore = async () => {
    if (!editingStudent) return;
    if (!formData.turma) {
      alert("Por favor, defina uma turma para restaurar o aluno.");
      return;
    }

    const restorePayload = {
      id: editingStudent.id,
      nome: formData.nome,
      turma: formData.turma,
      horario: formData.horario,
      professor: formData.professor,
    };

    try {
      await restoreStudent(restorePayload);
    } catch {
      alert("Falha ao restaurar no backend.");
      return;
    }

    const restoredStudent = {
      ...editingStudent,
      ...formData,
      idade: calculateAge(formData.dataNascimento),
      dataExclusao: undefined,
      DataExclusao: undefined,
      Nome: undefined,
      Turma: undefined,
      Professor: undefined,
    };

    const activeStudents = JSON.parse(localStorage.getItem("activeStudents") || "[]");
    activeStudents.push(restoredStudent);
    localStorage.setItem("activeStudents", JSON.stringify(activeStudents));

    const newExcludedList = students.filter((s) => s !== editingStudent);
    setStudents(newExcludedList);
    localStorage.setItem("excludedStudents", JSON.stringify(newExcludedList));

    setShowModal(false);
    setEditingStudent(null);
    alert(`Aluno ${formData.nome} restaurado com sucesso para a turma ${formData.turma}!`);
  };

  const handlePermanentDelete = async (student: ExcludedStudent) => {
    if (!confirm(`Excluir definitivamente ${student.nome || student.Nome}?`)) return;
    const payload = {
      id: student.id,
      nome: student.nome || student.Nome,
      turma: student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "",
      horario: student.horario || student.Horario || "",
      professor: student.professor || student.Professor || "",
    };

    try {
      await deleteExclusion(payload);
    } catch {
      alert("Falha ao excluir no backend.");
      return;
    }

    const newExcludedList = students.filter((s) => s !== student);
    setStudents(newExcludedList);
    localStorage.setItem("excludedStudents", JSON.stringify(newExcludedList));
  };

  const persistExclusionReason = async (student: ExcludedStudent, reason: string) => {
    const normalized = reason.trim();
    const payload = {
      ...student,
      nome: student.nome || student.Nome || "",
      turma: student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "",
      horario: student.horario || student.Horario || "",
      professor: student.professor || student.Professor || "",
      dataExclusao: student.dataExclusao || student.DataExclusao || "",
      motivo_exclusao: normalized,
    };

    try {
      await addExclusion(payload);
    } catch {
      alert("Falha ao atualizar o motivo da exclusão no backend.");
      return;
    }

    setStudents((prev) => {
      const next = prev.map((item) => {
        if (item === student) {
          return { ...item, motivo_exclusao: normalized, MotivoExclusao: normalized };
        }
        return item;
      });
      localStorage.setItem("excludedStudents", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div style={{ padding: "20px", background: "white", borderRadius: "12px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ marginBottom: "15px", color: "#2c3e50" }}>Alunos Excluídos</h3>
        <p style={{ color: "#666", fontSize: "14px" }}>Total: {students.length} alunos</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: "1100px", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.6fr 1fr 1.6fr",
              gap: "8px",
              padding: "12px 14px",
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            <span style={{ textAlign: "left" }}>Nome</span>
            <span>Turma</span>
            <span>Horário</span>
            <span>Professor</span>
            <span>Motivo</span>
            <span>Data da exclusão</span>
            <span>Ações</span>
          </div>

          {students.map((student, idx) => (
            <div
              key={`${student.id || student.nome || student.Nome || "aluno"}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1.6fr 1fr 1.6fr",
                gap: "8px",
                padding: "12px 14px",
                borderBottom: idx === students.length - 1 ? "none" : "1px solid #f1f5f9",
                background: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                alignItems: "center",
                fontSize: "14px",
                color: "#1f2937",
                textAlign: "center",
              }}
            >
              <span style={{ fontWeight: 600, textAlign: "left" }}>{student.nome || student.Nome || "-"}</span>
              <span>{student.turmaLabel || student.TurmaLabel || student.turma || student.Turma || "-"}</span>
              <span>{formatHorario(student.horario || student.Horario || "") || "-"}</span>
              <span>{student.professor || student.Professor || "-"}</span>
              <select
                value={student.motivo_exclusao || student.MotivoExclusao || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setStudents((prev) =>
                    prev.map((item) => {
                      if (item === student) {
                        return { ...item, motivo_exclusao: value, MotivoExclusao: value };
                      }
                      return item;
                    })
                  );
                  persistExclusionReason(student, value);
                }}
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  padding: "7px 8px",
                  fontSize: "13px",
                  textAlign: "center",
                }}
              >
                <option value="">Selecionar</option>
                {exclusionReasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {(student.motivo_exclusao || student.MotivoExclusao) &&
                  !exclusionReasonOptions.includes((student.motivo_exclusao || student.MotivoExclusao || "").trim()) && (
                    <option value={student.motivo_exclusao || student.MotivoExclusao}>
                      {student.motivo_exclusao || student.MotivoExclusao}
                    </option>
                  )}
              </select>
              <span>{normalizeDateValue(student.dataExclusao || student.DataExclusao || "") || "-"}</span>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <button
                  onClick={() => handleRestoreClick(student)}
                  style={{
                    background: "#2563eb",
                    border: "none",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  Restaurar
                </button>
                <button
                  onClick={() => handlePermanentDelete(student)}
                  title="Excluir aluno"
                  style={{
                    background: "#dc3545",
                    border: "none",
                    color: "white",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {students.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhum aluno excluído
        </div>
      )}

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              padding: "25px",
              borderRadius: "12px",
              width: "500px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                borderBottom: "1px solid #eee",
                paddingBottom: "10px",
              }}
            >
              <h2 style={{ margin: 0, color: "#2c3e50" }}>Restaurar Aluno</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", color: "#666" }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: "#fff3cd",
                color: "#856404",
                padding: "10px",
                borderRadius: "6px",
                marginBottom: "15px",
                fontSize: "13px",
              }}
            >
              ⚠️ Verifique os dados e defina a nova turma antes de restaurar.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Nome Completo
                </label>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Turma (Obrigatório)
                </label>
                <select
                  name="turma"
                  value={formData.turma}
                  onChange={(e) => {
                    handleInputChange(e);
                    setLastTurma(e.target.value);
                  }}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "2px solid #f39c12", background: "#fffbeb" }}
                >
                  {turmaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Horário
                </label>
                <input
                  name="horario"
                  value={formData.horario}
                  onChange={handleInputChange}
                  placeholder="00:00"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Professor
                </label>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", background: "#fffbeb", padding: "10px", borderRadius: "6px" }}>
                  {(professorOptions.length > 0 ? professorOptions : ["Joao Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa"]).map((prof) => (
                    <label key={prof} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
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
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Nível
                </label>
                <input
                  name="nivel"
                  value={formData.nivel}
                  onChange={handleInputChange}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  Categoria
                </label>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#555", padding: "6px 0" }}>
                  {formData.categoria || "-"}
                </div>
              </div>


              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  WhatsApp
                </label>
                <input
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleInputChange}
                  placeholder="(##) # ####-####"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "5px", fontSize: "13px", fontWeight: 600 }}>
                  ParQ (Apto para atividade física?)
                </label>
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
                style={{ background: "#ccc", color: "#333", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmRestore}
                style={{ background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Confirmar Restauração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exclusions;
