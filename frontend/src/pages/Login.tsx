import React, { useEffect, useRef, useState } from "react";
import { getBootstrap, getImportDataStatus, importDataFile } from "../api";
import { mapBootstrapForStorage } from "../utils/bootstrapMapping";

type ApiResponse<T = any> = { data: T };

interface TeacherProfile {
  name: string;
  unit: string;
}

const expectedUnitName = String(import.meta.env.VITE_UNIT_NAME || "").trim();
const envName = String(import.meta.env.VITE_ENV_NAME || "").trim();

const normalizeUnitName = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const isAdminProfile = (value: string) => normalizeUnitName(value) === "admin";

const isUnitAllowedForEnvironment = (typedUnit: string) => {
  if (!expectedUnitName) {
    return true;
  }
  return normalizeUnitName(typedUnit) === normalizeUnitName(expectedUnitName);
};

export const Login: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const teacherProfileStorageKey = "teacherProfile";
  const quickProfessorsStorageKey = "quickProfessorProfiles";
  const [profile, setProfile] = useState<TeacherProfile>({
    name: "",
    unit: "",
  });
  const [firstLoginMode, setFirstLoginMode] = useState(true);
  const [rememberProfile, setRememberProfile] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [importStatusInfo, setImportStatusInfo] = useState<any>(null);
  const [quickProfessors, setQuickProfessors] = useState<string[]>([]);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [adminInputsUnlocked, setAdminInputsUnlocked] = useState(false);
  const mobileTapTimestampsRef = useRef<number[]>([]);

  const importTimestampStorageKey = "last_import_at";

  const readLastImportAtFallback = () => {
    try {
      return localStorage.getItem(importTimestampStorageKey) || null;
    } catch {
      return null;
    }
  };

  const saveLastImportAtFallback = (value?: string | null) => {
    const resolved = String(value || "").trim() || new Date().toISOString();
    try {
      localStorage.setItem(importTimestampStorageKey, resolved);
    } catch {
      // ignore
    }
    return resolved;
  };

  const resolveLastImportAt = (status?: any) => {
    const backendValue = String(status?.last_import_at || "").trim();
    if (backendValue) {
      return saveLastImportAtFallback(backendValue);
    }
    const fallback = readLastImportAtFallback();
    return fallback || "";
  };

  const buildMergedQuickProfessors = (base: string[], extra: string[]) =>
    Array.from(
      new Set(
        [...base, ...extra]
          .map((name) => String(name || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const saveQuickProfessors = (nextList: string[]) => {
    try {
      localStorage.setItem(quickProfessorsStorageKey, JSON.stringify(nextList));
    } catch {
      // ignore storage errors
    }
  };

  const canEditInputs = firstLoginMode || adminInputsUnlocked;

  const handleContainerTap = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const now = Date.now();
    const recent = [...mobileTapTimestampsRef.current, now].filter((ts) => now - ts <= 1200);
    mobileTapTimestampsRef.current = recent;
    if (recent.length >= 4) {
      setAdminInputsUnlocked(true);
      mobileTapTimestampsRef.current = [];
    }
  };

  useEffect(() => {
    try {
      const savedProfileRaw = localStorage.getItem(teacherProfileStorageKey);
      if (savedProfileRaw) {
        const parsed = JSON.parse(savedProfileRaw);
        setProfile({
          name: String(parsed?.name || ""),
          unit: String(parsed?.unit || ""),
        });
        setRememberProfile(true);
        setHasSavedProfile(true);
      }
    } catch {
      // ignore invalid local profile payload
    }

    getBootstrap()
      .then((res: ApiResponse) => {
        setBackendOnline(true);
        const classes = Array.isArray(res?.data?.classes) ? res.data.classes : [];
        const professorsFromClasses: string[] = Array.from(
          new Set(
            classes
              .map((cls: any) => String(cls?.professor || "").trim())
              .filter(Boolean)
          )
        ) as string[];
        let savedQuickProfessors: string[] = [];
        try {
          const raw = localStorage.getItem(quickProfessorsStorageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          savedQuickProfessors = Array.isArray(parsed) ? parsed.map((name) => String(name || "").trim()) : [];
        } catch {
          // ignore invalid local payload
        }

        const mergedProfessors = buildMergedQuickProfessors(professorsFromClasses, savedQuickProfessors);
        setQuickProfessors(mergedProfessors);
        saveQuickProfessors(mergedProfessors);
      })
      .catch(() => setBackendOnline(false));
    getImportDataStatus()
      .then((res: ApiResponse) => {
        const backendStatus = res.data || {};
        const resolvedDate = resolveLastImportAt(backendStatus);
        setImportStatusInfo({ ...backendStatus, last_import_at: resolvedDate || null });
      })
      .catch(() => {
        const fallbackDate = readLastImportAtFallback();
        setImportStatusInfo(fallbackDate ? { last_import_at: fallbackDate } : null);
      });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && String(event.key || "").toLowerCase() === "a") {
        setAdminInputsUnlocked(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleRememberChange = (checked: boolean) => {
    setRememberProfile(checked);
    if (!checked) {
      try {
        localStorage.removeItem(teacherProfileStorageKey);
        setHasSavedProfile(false);
      } catch {
        // ignore storage errors
      }
    }
  };

  const handleResetAutoLogin = () => {
    try {
      localStorage.removeItem(teacherProfileStorageKey);
      localStorage.removeItem("access_token");
    } catch {
      // ignore storage errors
    }

    setProfile({ name: "", unit: "" });
    setRememberProfile(false);
    setHasSavedProfile(false);
    setError(null);
    setStatus("Login automático limpo neste dispositivo.");
  };

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
    const { mappedStudents, mappedClasses } = mapBootstrapForStorage(data, calculateAge);

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

    if (!canEditInputs) {
      setError("Desative o modo rápido e marque Cadastro / Primeiro Login para cadastrar novo professor.");
      return;
    }

    if (!profile.name || !profile.unit) {
      setError("Preencha nome e unidade.");
      return;
    }

    if (!isUnitAllowedForEnvironment(profile.unit)) {
      setError(
        expectedUnitName
          ? `Login bloqueado: esta aplicação aceita apenas a unidade \"${expectedUnitName}\".`
          : "Login bloqueado: unidade inválida para este ambiente."
      );
      return;
    }

    setLoading(true);
    try {
      if (file) {
        setStatus("Enviando arquivo...");
        try {
          await importDataFile(file);
        } catch (firstErr: any) {
          const firstDetail = String(firstErr?.response?.data?.detail || "");
          if (!/autoflush|integrityerror|unique/i.test(firstDetail)) {
            throw firstErr;
          }
          setStatus("Reprocessando sem transferencias...");
          await importDataFile(file, { applyOverrides: false });
        }
        const optimisticDate = saveLastImportAtFallback();
        setImportStatusInfo((prev: any) => ({ ...(prev || {}), last_import_at: optimisticDate }));
        try {
          const importStatus = await getImportDataStatus();
          const backendStatus = importStatus.data || {};
          const persistedDate = resolveLastImportAt(backendStatus) || optimisticDate;
          setImportStatusInfo({ ...backendStatus, last_import_at: persistedDate });
        } catch {
          setImportStatusInfo((prev: any) => ({ ...(prev || {}), last_import_at: optimisticDate }));
        }
      }

      const normalizedProfile = {
        name: String(profile.name || "").trim(),
        unit: expectedUnitName || String(profile.unit || "").trim(),
      };
      const adminAccess = isAdminProfile(normalizedProfile.name);

      setStatus("Carregando dados...");
      const res = adminAccess
        ? await getBootstrap()
        : await getBootstrap(undefined, { professor: normalizedProfile.name });
      applyBootstrap(res.data);

      const updatedQuickProfessors = buildMergedQuickProfessors(quickProfessors, [normalizedProfile.name]);
      setQuickProfessors(updatedQuickProfessors);
      saveQuickProfessors(updatedQuickProfessors);

      if (rememberProfile) {
        localStorage.setItem(teacherProfileStorageKey, JSON.stringify(normalizedProfile));
        setHasSavedProfile(true);
      } else {
        localStorage.removeItem(teacherProfileStorageKey);
        setHasSavedProfile(false);
      }
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

  const handleQuickProfessorLogin = async (professorName: string) => {
    if (firstLoginMode) {
      setError("Desmarque Cadastro / Primeiro Login para usar o atalho rápido.");
      return;
    }

    const normalizedName = String(professorName || "").trim();
    if (!normalizedName) return;

    setError(null);
    setStatus("Entrando com perfil rápido...");
    setLoading(true);

    const unitForQuickLogin = expectedUnitName || String(profile.unit || "Piscina Bela Vista").trim() || "Piscina Bela Vista";
    if (!isUnitAllowedForEnvironment(unitForQuickLogin)) {
      setError(
        expectedUnitName
          ? `Login bloqueado: esta aplicação aceita apenas a unidade \"${expectedUnitName}\".`
          : "Login bloqueado: unidade inválida para este ambiente."
      );
      setStatus(null);
      setLoading(false);
      return;
    }

    const normalizedProfile = {
      name: normalizedName,
      unit: unitForQuickLogin,
    };

    try {
      const res = await getBootstrap(undefined, { professor: normalizedName });
      applyBootstrap(res.data);

      if (rememberProfile) {
        localStorage.setItem(teacherProfileStorageKey, JSON.stringify(normalizedProfile));
        setHasSavedProfile(true);
      }
      localStorage.setItem("access_token", "local-session");
      onLogin("local-session");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Falha no login rápido do professor.";
      setError(detail);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  return (
    <div
      style={{
        width: "min(520px, calc(100% - 24px))",
        margin: "20px auto",
        padding: "16px",
        borderRadius: 12,
        background: "#fff",
        fontFamily: "sans-serif",
      }}
      onClick={handleContainerTap}
    >
      <h2 style={{ fontSize: 22, lineHeight: 1.25 }}>Login / Importar dados</h2>
      <p style={{ color: "#666", fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
        Backend import: {backendOnline ? "online" : "offline"} (porta 8001)
      </p>
      <p style={{ color: "#666", fontSize: 12, marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>
        Atualizado em: {formatImportDate(importStatusInfo?.last_import_at)}
        {importStatusInfo?.filename ? ` (${importStatusInfo.filename})` : ""}
      </p>

      {!firstLoginMode && quickProfessors.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Login rápido por professor cadastrado:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {quickProfessors.slice(0, 8).map((professor) => (
              <button
                key={professor}
                type="button"
                disabled={loading}
                onClick={() => handleQuickProfessorLogin(professor)}
                style={{
                  padding: "8px 10px",
                  border: "1px solid #c7d2fe",
                  borderRadius: 20,
                  background: "#eef2ff",
                  color: "#1e3a8a",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                {professor}
              </button>
            ))}
          </div>
        </div>
      )}

      {!firstLoginMode && quickProfessors.length === 0 && (
        <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          Nenhum professor no atalho rápido. Marque Cadastro / Primeiro Login para cadastrar o primeiro acesso.
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Nome do Professor</span>
          <input
            value={profile.name}
            onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
            disabled={loading || !canEditInputs}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4, fontSize: 16 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Unidade</span>
          <input
            value={profile.unit}
            onChange={(e) => setProfile((prev) => ({ ...prev, unit: e.target.value }))}
            disabled={loading || !canEditInputs}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4, fontSize: 16 }}
          />
          {expectedUnitName && (
            <span style={{ marginTop: 6, color: "#555", fontSize: 12 }}>
              Unidade oficial deste ambiente{envName ? ` (${envName})` : ""}: <strong>{expectedUnitName}</strong>
            </span>
          )}
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Arquivo CSV</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading || !canEditInputs}
            style={{ width: "100%" }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#333" }}>
          <input
            type="checkbox"
            checked={firstLoginMode}
            onChange={(e) => setFirstLoginMode(e.target.checked)}
            disabled={loading}
          />
          <span>Cadastro / Primeiro Login</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#333" }}>
          <input
            type="checkbox"
            checked={rememberProfile}
            onChange={(e) => handleRememberChange(e.target.checked)}
          />
          <span>Lembrar meus dados neste dispositivo</span>
        </label>

        {hasSavedProfile && (
          <button
            type="button"
            onClick={handleResetAutoLogin}
            disabled={loading}
            style={{
              width: "100%",
              padding: 10,
              background: "#f8fafc",
              color: "#1f2937",
              border: "1px solid #cbd5e1",
              borderRadius: 4,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Resetar login automático (somente neste dispositivo)
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !canEditInputs}
          style={{
            width: "100%",
            padding: 12,
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
