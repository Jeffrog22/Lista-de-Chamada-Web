import { useEffect, useRef, useState } from "react";
import { Students } from "./pages/Students";
import { Attendance } from "./pages/Attendance";
import { Classes } from "./pages/Classes";
import { Reports } from "./pages/Reports";
import { Vacancies } from "./pages/Vacancies";
import { Exclusions } from "./pages/Exclusions";
import { Login } from "./pages/Login";
import { getBootstrap, getImportDataStatus, importDataFile } from "./api";
import "./App.simple.css";

declare const __APP_VERSION__: string;

type ApiResponse<T = any> = { data: T };

type ViewType = "main" | "attendance" | "students" | "classes" | "exclusions" | "reports" | "vacancies";
type FeatureCardView = "attendance" | "students" | "classes" | "exclusions" | "reports";

const getViewFromHash = (hash: string): ViewType => {
  const normalized = hash.replace(/^#/, "").trim();
  if (!normalized) return "main";
  const candidates: ViewType[] = ["attendance", "students", "classes", "exclusions", "reports", "vacancies", "main"];
  return (candidates.find((view) => view === normalized) || "main");
};

export default function App() {
  const appVersion = (typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()) ? __APP_VERSION__.trim() : "v.local";
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));
  const [currentView, setCurrentView] = useState<ViewType>(getViewFromHash(window.location.hash));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [teacherName, setTeacherName] = useState<string>("");
  const [teacherUnit, setTeacherUnit] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [lastImportInfo, setLastImportInfo] = useState<any>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    const byWidth = window.innerWidth <= 768;
    const byLandscapePhone = window.innerWidth <= 1024 && window.innerHeight <= 500;
    return byWidth || byLandscapePhone;
  });
  const sidebarTouchStartX = useRef<number | null>(null);
  const sidebarTouchCurrentX = useRef<number | null>(null);

  const formatDisplayName = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (!isMobileViewport || tokens.length <= 3) return raw;

    const particles = new Set(["da", "de", "do", "das", "dos", "e"]);
    let endIndex = 3;
    if (tokens[2] && particles.has(tokens[2].toLowerCase()) && tokens[3]) {
      endIndex = 4;
    }

    return tokens.slice(0, endIndex).join(" ");
  };

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

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rawHash = String(window.location.hash || "");
      const hashQuery = rawHash.includes("?") ? rawHash.split("?")[1] : "";
      const hashParams = new URLSearchParams(hashQuery);
      const debugParam = searchParams.get("attendanceDebug") || hashParams.get("attendanceDebug");
      const isProduction = !import.meta.env.DEV;

      if (isProduction && debugParam !== "1") {
        localStorage.removeItem("attendanceDebugPersistence");
        localStorage.removeItem("attendanceDebugEvents");
      }

      if (debugParam === "1") {
        localStorage.setItem("attendanceDebugPersistence", "1");
      }

      if (debugParam === "0") {
        localStorage.removeItem("attendanceDebugPersistence");
        localStorage.removeItem("attendanceDebugEvents");
      }

      const hashPath = rawHash.replace(/^#/, "").split("?")[0].trim();
      if (!hashPath && debugParam === "1") {
        window.location.hash = "attendance";
      }
    } catch {
      // ignore
    }

    // Atualizar token quando localStorage muda
    const stored = localStorage.getItem("access_token");
    if (stored && !token) {
      setToken(stored);
    }
    const profileStr = localStorage.getItem("teacherProfile");
    if (profileStr) {
      try {
        const profile = JSON.parse(profileStr);
        setTeacherName(profile.name || "");
        setTeacherUnit(profile.unit || "");
      } catch {
        // ignore
      }
    }
    getImportDataStatus()
      .then((res: ApiResponse) => {
        const backendStatus = res.data || {};
        const resolvedDate = resolveLastImportAt(backendStatus);
        setLastImportInfo({ ...backendStatus, last_import_at: resolvedDate || null });
      })
      .catch(() => {
        const fallbackDate = readLastImportAtFallback();
        setLastImportInfo(fallbackDate ? { last_import_at: fallbackDate } : null);
      });
  }, []);

  const formatImportDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("pt-BR");
  };

  useEffect(() => {
    const onHashChange = () => {
      setCurrentView(getViewFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const compactQuery = window.matchMedia("(max-width: 768px)");
    const landscapePhoneQuery = window.matchMedia("(max-width: 1024px) and (max-height: 500px)");

    const syncViewport = () => {
      setIsMobileViewport(compactQuery.matches || landscapePhoneQuery.matches);
    };

    syncViewport();

    const onCompactChange = () => syncViewport();
    const onLandscapeChange = () => syncViewport();

    compactQuery.addEventListener("change", onCompactChange);
    landscapePhoneQuery.addEventListener("change", onLandscapeChange);

    return () => {
      compactQuery.removeEventListener("change", onCompactChange);
      landscapePhoneQuery.removeEventListener("change", onLandscapeChange);
    };
  }, []);

  useEffect(() => {
    if (isMobileViewport && currentView === "main") {
      setSidebarOpen(true);
    }
  }, [isMobileViewport, currentView]);

  const onLogin = (t: string) => {
    localStorage.setItem("access_token", t);
    setToken(t);
    const profileStr = localStorage.getItem("teacherProfile");
    if (profileStr) {
      try {
        const profile = JSON.parse(profileStr);
        setTeacherName(profile.name || "");
        setTeacherUnit(profile.unit || "");
      } catch {
        // ignore
      }
    }
  };

  const onLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("teacherProfile");
    setToken(null);
    setCurrentView("main");
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
        studentUid: String(student.student_uid || ""),
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
      };
    });

    const mappedClasses = (data.classes || []).map((cls: any) => ({
      Turma: cls.turma_label || cls.codigo,
      TurmaCodigo: cls.codigo,
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

  const handleQuickUpdate = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setUpdateStatus("Enviando arquivo...");
    try {
      await importDataFile(selected);
      const optimisticDate = saveLastImportAtFallback();
      setLastImportInfo((prev: any) => ({ ...(prev || {}), last_import_at: optimisticDate }));
      setUpdateStatus("Carregando dados...");
      const res = await getBootstrap();
      applyBootstrap(res.data);
      try {
        const statusRes = await getImportDataStatus();
        const backendStatus = statusRes.data || {};
        const persistedDate = resolveLastImportAt(backendStatus) || optimisticDate;
        setLastImportInfo({ ...backendStatus, last_import_at: persistedDate });
      } catch {
        setLastImportInfo((prev: any) => ({ ...(prev || {}), last_import_at: optimisticDate }));
      }
      setUpdateStatus("Base atualizada.");
      window.setTimeout(() => setUpdateStatus(null), 2000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Falha ao atualizar a base.";
      setUpdateStatus(detail);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!isMobileViewport || !sidebarOpen) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    sidebarTouchStartX.current = touch.clientX;
    sidebarTouchCurrentX.current = touch.clientX;
  };

  const handleSidebarTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!isMobileViewport || !sidebarOpen) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    sidebarTouchCurrentX.current = touch.clientX;
  };

  const handleSidebarTouchEnd = () => {
    if (!isMobileViewport || !sidebarOpen) return;

    const startX = sidebarTouchStartX.current;
    const endX = sidebarTouchCurrentX.current;

    sidebarTouchStartX.current = null;
    sidebarTouchCurrentX.current = null;

    if (startX === null || endX === null) return;

    const deltaX = endX - startX;
    const swipeThreshold = 50;
    if (deltaX <= -swipeThreshold) {
      setSidebarOpen(false);
    }
  };

  const showView = (view: ViewType) => {
    setCurrentView(view);
    if (view === "main") {
      window.location.hash = "";
    } else {
      window.location.hash = view;
    }
    if (isMobileViewport) {
      setSidebarOpen(false);
    }
  };

  const featureCards: Array<{
    view: FeatureCardView;
    icon: string;
    title: string;
    description: string;
  }> = [
    { view: "attendance", icon: "📝", title: "Chamada", description: "Registre e acompanhe as presenças dos alunos em tempo real" },
    { view: "students", icon: "👥", title: "Alunos", description: "Gerencie informações dos alunos de forma rápida" },
    { view: "classes", icon: "📚", title: "Turmas", description: "Configure e organize as turmas facilmente" },
    { view: "exclusions", icon: "❌", title: "Exclusões", description: "Consulte alunos excluídos e restaure se necessário" },
    { view: "reports", icon: "📊", title: "Relatórios", description: "Gere relatórios de frequência e consolidados" },
  ];

  if (!token) {
    return <Login onLogin={onLogin} />;
  }

  // Renderizar apenas o header e welcome screen (sem componentes complexos)
  return (
    <div
      className={`app-container ${isMobileViewport ? "mobile-compact" : ""} ${
        isMobileViewport && currentView === "main" ? "mobile-main-menu" : ""
      }`}
    >
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <button className="menu-button" onClick={toggleSidebar}>
            ☰
          </button>
          <h1>📋 {teacherUnit ? teacherUnit : "Protótipo"}</h1>
        </div>
        <div className="header-right">
          <span className="app-version-tag" title="Versão da aplicação">{appVersion}</span>
          <span className="user-info">
            {teacherName ? `Conectado: ${formatDisplayName(teacherName)}` : "Conectado"}
            {teacherUnit ? ` - ${teacherUnit}` : ""}
          </span>
          {updateStatus && (
            <span className="user-info">{updateStatus}</span>
          )}
          <span className="user-info">
            Atualizado em: {formatImportDate(lastImportInfo?.last_import_at)}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={onFileSelected}
          />
          <button className="logout-button" onClick={handleQuickUpdate}>
            Atualizar Base
          </button>
          <button className="logout-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="main-layout">
        {/* SIDEBAR */}
        <aside
          className={`sidebar ${sidebarOpen ? "open" : "closed"}`}
          onTouchStart={handleSidebarTouchStart}
          onTouchMove={handleSidebarTouchMove}
          onTouchEnd={handleSidebarTouchEnd}
          onTouchCancel={handleSidebarTouchEnd}
        >
          {/* MENU PRINCIPAL - NEON TECH */}
          <nav className="primary-menu">
            <div className="menu-title">Menu Principal</div>
            <div className="primary-buttons">
              <button 
                className={`neon-btn ${currentView === "attendance" ? "active" : ""}`} 
                onClick={() => showView("attendance")}
              >
                Chamada
              </button>
              <button 
                className={`neon-btn ${currentView === "students" ? "active" : ""}`} 
                onClick={() => showView("students")}
              >
                Alunos
              </button>
              <button 
                className={`neon-btn ${currentView === "classes" ? "active" : ""}`} 
                onClick={() => showView("classes")}
              >
                Turmas
              </button>
            </div>
          </nav>

          {/* MENU SECUNDÁRIO */}
          <nav className="secondary-menu">
            <div className="menu-title secondary-title">Mais Opções</div>
            <div className="secondary-buttons">
              <button 
                className={`neon-btn-secondary ${currentView === "exclusions" ? "active" : ""}`} 
                onClick={() => showView("exclusions")}
              >
                ❌ Exclusões
              </button>
              <button 
                className={`neon-btn-secondary ${currentView === "reports" ? "active" : ""}`} 
                onClick={() => showView("reports")}
              >
                📊 Relatórios
              </button>
              <button 
                className={`neon-btn-secondary ${currentView === "vacancies" ? "active" : ""}`} 
                onClick={() => showView("vacancies")}
              >
                🏊 Gestão de Vagas
              </button>
            </div>
          </nav>
        </aside>

        {/* CONTENT AREA */}
        <main className="content-area">
          {currentView === "main" ? (
            isMobileViewport ? null : (
              <div className="welcome-screen">
                {featureCards.map((card) => (
                  <button
                    key={card.view}
                    type="button"
                    className="feature-card feature-card-button"
                    onClick={() => showView(card.view)}
                  >
                    <span className="feature-icon">{card.icon}</span>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </button>
                ))}
              </div>
            )
          ) : currentView === "attendance" ? (
            <Attendance />
          ) : currentView === "students" ? (
            <Students />
          ) : currentView === "classes" ? (
            <Classes />
          ) : currentView === "exclusions" ? (
            <Exclusions />
          ) : currentView === "reports" ? (
            <Reports />
          ) : currentView === "vacancies" ? (
            <Vacancies />
          ) : null}
        </main>
      </div>
    </div>
  );
}
