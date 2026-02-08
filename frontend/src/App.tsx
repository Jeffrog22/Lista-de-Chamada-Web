import { useEffect, useRef, useState } from "react";
import { Students } from "./pages/Students";
import { Attendance } from "./pages/Attendance";
import { Classes } from "./pages/Classes";
import { Reports } from "./pages/Reports";
import { Vacancies } from "./pages/Vacancies";
import { Exclusions } from "./pages/Exclusions";
import { Login } from "./pages/Login";
import { getBootstrap, importDataFile } from "./api";
import "./App.simple.css";

type ViewType = "main" | "attendance" | "students" | "classes" | "exclusions" | "reports" | "vacancies";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [teacherName, setTeacherName] = useState<string>("");
  const [teacherUnit, setTeacherUnit] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const onLogin = (t: string) => {
    console.log("Login realizado com token:", t);
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
      setUpdateStatus("Carregando dados...");
      const res = await getBootstrap();
      applyBootstrap(res.data);
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

  const showView = (view: ViewType) => {
    setCurrentView(view);
  };

  if (!token) {
    return <Login onLogin={onLogin} />;
  }

  // Renderizar apenas o header e welcome screen (sem componentes complexos)
  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <button className="menu-button" onClick={toggleSidebar}>
            ☰
          </button>
          <h1>📋 Protótipo</h1>
        </div>
        <div className="header-right">
          <span className="user-info">
            {teacherName ? `Conectado: ${teacherName}` : "Conectado"}
            {teacherUnit ? ` - ${teacherUnit}` : ""}
          </span>
          {updateStatus && (
            <span className="user-info">{updateStatus}</span>
          )}
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
        <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
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
            <div className="welcome-screen">
              <div className="feature-card">
                <span className="feature-icon">📝</span>
                <h3>Chamada</h3>
                <p>Registre e acompanhe as presenças dos alunos em tempo real</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">👥</span>
                <h3>Alunos</h3>
                <p>Gerencie informações dos alunos de forma rápida</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">📚</span>
                <h3>Turmas</h3>
                <p>Configure e organize as turmas facilmente</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">❌</span>
                <h3>Exclusões</h3>
                <p>Consulte alunos excluídos e restaure se necessário</p>
              </div>
              <div className="feature-card">
                <span className="feature-icon">📊</span>
                <h3>Relatórios</h3>
                <p>Gere relatórios de frequência e consolidados</p>
              </div>
            </div>
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
