import React, { useState } from "react";
import axios from "axios";

export const Login: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);

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
      setError(err?.response?.data?.detail || "Erro ao efetuar login");
    }
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <h2>Entrar</h2>
      <form onSubmit={doLogin} style={{ display: "grid", gap: 8 }}>
        <label>
          Usuário
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">Login</button>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </form>
    </div>
  );
};