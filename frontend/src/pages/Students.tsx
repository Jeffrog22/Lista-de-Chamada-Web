import React, { useEffect, useState } from "react";
import { getStudents } from "../api";

export const Students: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getStudents();
      setStudents(r.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button onClick={load}>Atualizar</button>
      </div>
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <ul>
          {students.map((s) => (
            <li key={s.id}>
              {s.id} — {s.nome} {s.data_nascimento ? `(${s.data_nascimento})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};