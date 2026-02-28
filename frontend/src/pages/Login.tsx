import React, { useEffect, useState } from "react";
import { getBootstrap, getImportDataStatus, importDataFile } from "../api";

type ApiResponse<T = any> = { data: T };

interface TeacherProfile {
  name: string;
  unit: string;
  email: string;
  whatsapp: string;
}

export const Login: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [profile, setProfile] = useState<TeacherProfile>({
    name: "",
    unit: "",
    email: "",
    whatsapp: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [importStatusInfo, setImportStatusInfo] = useState<any>(null);

  useEffect(() => {
    getBootstrap()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
    getImportDataStatus()
      .then((res: ApiResponse) => setImportStatusInfo(res.data || null))
      .catch(() => setImportStatusInfo(null));
  }, []);

  const formatImportDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("pt-BR");
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
    return Number.isNaN(age) ? 0 : age;
  };

  const applyBootstrap = (data: any) => {
    const classById = new Map<number, any>();
    (data.classes || []).forEach((cls: any) => classById.set(cls.id, cls));

    const mappedStudents = (data.students || []).map((student: any) => {
      const cls = classById.get(student.class_id);
      return {
        id: String(student.id),
        nome: student.nome,
        nivel: cls?.nivel || "",
        idade: calculateAge(student.data_nascimento || ""),
        categoria: student.categoria || "",
        turma: cls?.codigo || "",
        horario: cls?.horario || "",
        professor: cls?.professor || "",
        whatsapp: student.whatsapp || "",
        genero: student.genero || "",
        dataNascimento: student.data_nascimento || "",
        parQ: student.parq || "",
        atestado: !!student.atestado,
        dataAtestado: student.data_atestado || "",
      };
    });

    const mappedClasses = (data.classes || []).map((cls: any) => ({
      Turma: cls.codigo,
      Horario: cls.horario,
      Professor: cls.professor,
      Nivel: cls.nivel,
      Atalho: cls.codigo,
      CapacidadeMaxima: cls.capacidade,
      DiasSemana: cls.dias_semana,
    }));

    if (mappedStudents.length > 0) {
      localStorage.setItem("activeStudents", JSON.stringify(mappedStudents));
    }
    if (mappedClasses.length > 0) {
      localStorage.setItem("activeClasses", JSON.stringify(mappedClasses));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!profile.name || !profile.unit || !profile.email || !profile.whatsapp) {
      setError("Preencha nome, unidade, email e whatsapp.");
      return;
    }

    setLoading(true);
    try {
      if (file) {
        setStatus("Enviando arquivo...");
        await importDataFile(file);
        const importStatus = await getImportDataStatus();
        setImportStatusInfo(importStatus.data || null);
      }

      setStatus("Carregando dados...");
      const res = await getBootstrap();
      applyBootstrap(res.data);

      localStorage.setItem("teacherProfile", JSON.stringify(profile));
      localStorage.setItem("access_token", "local-session");
      onLogin("local-session");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Falha ao carregar dados do backend import.";
      setError(detail);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "50px auto", fontFamily: "sans-serif" }}>
      <h2>Cadastro Inicial - Importacao de Dados</h2>
      <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
        Backend import: {backendOnline ? "online" : "offline"} (porta 8001)
      </p>
      <p style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
        Último import: {importStatusInfo?.last_import_by || "-"} em {formatImportDate(importStatusInfo?.last_import_at)}
        {importStatusInfo?.filename ? ` (${importStatusInfo.filename})` : ""}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Nome do Professor</span>
          <input
            value={profile.name}
            onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Unidade</span>
          <input
            value={profile.unit}
            onChange={(e) => setProfile((prev) => ({ ...prev, unit: e.target.value }))}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Email</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Whatsapp</span>
          <input
            value={profile.whatsapp}
            onChange={(e) => setProfile((prev) => ({ ...prev, whatsapp: e.target.value }))}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Arquivo CSV</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 10,
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: "bold",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Processando..." : "Entrar e Carregar"}
        </button>

        {status && <div style={{ color: "#555", fontSize: 12 }}>{status}</div>}
        {error && <div style={{ color: "red", fontSize: 12 }}>{error}</div>}
      </form>
    </div>
  );
};
