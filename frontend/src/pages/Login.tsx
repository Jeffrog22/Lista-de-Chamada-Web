import React, { useState } from "react";
import axios from "axios";

export const Login: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);
      const res = await axios.post("http://localhost:8000/token", formData);
      const token = res.data.access_token;
      if (token) {
        onLogin(token);
      } else {
        setError("Nenhum token recebido");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Erro ao efetuar login (backend offline?)");
    }
  };

  const doDemoLogin = () => {
    console.log("Entrando em modo demo...");
    localStorage.removeItem("access_token");
    onLogin("demo-token-xyz");
  };

  return (
    <div style={{ maxWidth: 420, margin: "50px auto", fontFamily: "sans-serif" }}>
      <h2>Sistema de Chamadas - Login</h2>
      <form onSubmit={doLogin} style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Usu�rio</span>
          <input 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: "bold", marginBottom: 4 }}>Senha</span>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </label>
        <button 
          type="submit"
          style={{ 
            padding: 10, 
            backgroundColor: "#007bff", 
            color: "white", 
            border: "none", 
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          Login
        </button>
        {error && <div style={{ color: "red", fontSize: 12 }}>{error}</div>}
      </form>

      <div style={{ borderTop: "1px solid #ddd", paddingTop: 20 }}>
        <p style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
          Backend offline? Use modo demo:
        </p>
        <button 
          onClick={doDemoLogin}
          style={{ 
            width: "100%",
            padding: 10, 
            backgroundColor: "#28a745", 
            color: "white", 
            border: "none", 
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          ? Modo Demo
        </button>
      </div>
    </div>
  );
};
