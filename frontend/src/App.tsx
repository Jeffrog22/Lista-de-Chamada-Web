import React, { useState, useEffect } from "react";
import { Students } from "./pages/Students";
import { Attendance } from "./pages/Attendance";
import { Classes } from "./pages/Classes";
import { Reports } from "./pages/Reports";
import { Exclusions } from "./pages/Exclusions";
import { Login } from "./pages/Login";
import "./App.simple.css";

type ViewType = "main" | "attendance" | "students" | "classes" | "exclusions" | "reports";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // Atualizar token quando localStorage muda
    const stored = localStorage.getItem("access_token");
    if (stored && !token) {
      setToken(stored);
    }
  }, []);

  const onLogin = (t: string) => {
    console.log("Login realizado com token:", t);
    localStorage.setItem("access_token", t);
    setToken(t);
  };

  const onLogout = () => {
    localStorage.removeItem("access_token");
    setToken(null);
    setCurrentView("main");
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
          <span className="user-info">Conectado (Demo)</span>
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
          ) : null}
        </main>
      </div>
    </div>
  );
}