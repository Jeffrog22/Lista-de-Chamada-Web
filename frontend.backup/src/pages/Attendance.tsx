import React, { useEffect, useState } from "react";
import axios from "axios";

export const Attendance: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await axios.get("http://localhost:8000/attendance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(response.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button onClick={load}>Atualizar</button>
      </div>
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              {a.id} - {a.student_name || a.student_id} - {a.class_name || a.class_id} - {formatDate(a.data)} - {a.status || ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};