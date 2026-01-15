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
          <nav className="main-menu">
            <h2>📌 Menu</h2>
            <ul>
              <li>
                <button className="menu-item-btn" onClick={() => showView("attendance")}>
                  📝 Chamada
                </button>
              </li>
              <li>
                <button className="menu-item-btn" onClick={() => showView("students")}>
                  👥 Alunos
                </button>
              </li>
              <li>
                <button className="menu-item-btn" onClick={() => showView("classes")}>
                  📚 Turmas
                </button>
              </li>
              <li>
                <button className="menu-item-btn" onClick={() => showView("exclusions")}>
                  ❌ Exclusões
                </button>
              </li>
              <li>
                <button className="menu-item-btn" onClick={() => showView("reports")}>
                  📊 Relatórios
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        {/* CONTENT AREA */}
        <main className="content-area">
          <div className="welcome-screen">
            <div className="welcome-card">
              <h1>🎯 Bem-vindo!</h1>
              <p>Sistema de Chamadas - Modo Demo</p>
              <div className="features-grid">
                <div className="feature-card">
                  <span className="feature-icon">📝</span>
                  <h3>Chamada</h3>
                  <p>Registre presenças</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">👥</span>
                  <h3>Alunos</h3>
                  <p>Gerenciar alunos</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">📚</span>
                  <h3>Turmas</h3>
                  <p>Configurar turmas</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">❌</span>
                  <h3>Exclusões</h3>
                  <p>Alunos excluídos</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">📊</span>
                  <h3>Relatórios</h3>
                  <p>Gerar relatórios</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}