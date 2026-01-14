import React, { useState } from "react";
import { Students } from "./pages/Students";
import { Attendance } from "./pages/Attendance";
import { Login } from "./pages/Login";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));

  const onLogin = (t: string) => {
    localStorage.setItem("access_token", t);
    setToken(t);
  };

  const onLogout = () => {
    localStorage.removeItem("access_token");
    setToken(null);
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Lista de Chamada - Web (Protótipo)</h1>
        <div>
          {token ? (
            <button onClick={onLogout}>Logout</button>
          ) : (
            <span style={{ color: "#666" }}>Desconectado</span>
          )}
        </div>
      </header>

      {!token ? (
        <Login onLogin={onLogin} />
      ) : (
        <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
          <div style={{ flex: 1 }}>
            <h2>Alunos</h2>
            <Students />
          </div>
          <div style={{ flex: 1 }}>
            <h2>Chamada</h2>
            <Attendance />
          </div>
        </div>
      )}
    </div>
  );
}