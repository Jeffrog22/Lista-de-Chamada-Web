import React, { useState, useCallback, useEffect, useRef } from "react";

interface ClassOption {
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  diasSemana: string[]; // Ex: ["Terça", "Quinta"]
}

interface AttendanceRecord {
  id: number;
  aluno: string;
  attendance: { [date: string]: "Presente" | "Falta" | "Justificado" | "" };
}

type AttendanceHistory = AttendanceRecord[];

export const Attendance: React.FC = () => {
  // MOCK DATA - Estrutura baseada em chamadaBelaVista.xlsx
  const classOptions: ClassOption[] = [
    { turma: "1A", horario: "14:00", professor: "Joao Silva", nivel: "Iniciante", diasSemana: ["Terca", "Quinta"] },
    { turma: "1B", horario: "15:30", professor: "Maria Santos", nivel: "Intermediario", diasSemana: ["Quarta", "Sexta"] },
    { turma: "2A", horario: "16:30", professor: "Carlos Oliveira", nivel: "Avancado", diasSemana: ["Segunda", "Quarta"] },
    { turma: "2B", horario: "18:00", professor: "Ana Costa", nivel: "Iniciante", diasSemana: ["Terca", "Quinta"] },
  ];

  const studentsPerClass: { [key: string]: string[] } = {
    "1A": ["João Silva", "Maria Santos", "Carlos Oliveira", "Ana Costa", "Pedro Ferreira"],
    "1B": ["Roberto Alves", "Fernanda Lima", "Lucas Martins", "Beatriz Souza", "Diego Rocha"],
    "2A": ["Amanda Silva", "Felipe Santos", "Juliana Costa", "Marcos Oliveira", "Sophia Pereira"],
    "2B": ["Thiago Mendes", "Camila Silva", "Bruno Costa", "Larissa Santos", "Rafael Lima"],
  };

  // STATE
  const [selectedClass, setSelectedClass] = useState<ClassOption>(classOptions[0]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const prevAttendanceRef = useRef<AttendanceRecord[] | null>(null);
  const isFirstRenderRef = useRef<boolean>(true);
  const isUndoingRef = useRef<boolean>(false);

  // Gerar datas pré-determinadas baseadas no dia da semana (DEFINIR ANTES DO STATE)
  const generateDates = (daysOfWeek: string[]) => {
    const dates = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Mapa: nome do dia -> número (0=domingo, 1=segunda, etc)
    const dayMap: { [key: string]: number } = {
      Domingo: 0,
      Segunda: 1,
      Terca: 2,
      Quarta: 3,
      Quinta: 4,
      Sexta: 5,
      Sabado: 6,
    };

    for (let day = 1; day <= 31; day++) {
      try {
        const date = new Date(currentYear, currentMonth, day);
        if (date.getMonth() !== currentMonth) break;

        const dayOfWeek = date.getDay();
        const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
        const dayName = dayNames[dayOfWeek];

        if (
          daysOfWeek.some(
            (d) => dayMap[d] === dayOfWeek || d === dayName
          )
        ) {
          dates.push(
            date.toISOString().split("T")[0] +
              ` (${dayName.substring(0, 3)})`
          );
        }
      } catch (e) {
        // ignore
      }
    }

    return dates;
  };

  const availableDates = generateDates(selectedClass.diasSemana);
  const dateDates = availableDates.map((d) => d.split(" ")[0]); // Pega apenas a data (YYYY-MM-DD)

  const initialAttendance = studentsPerClass[selectedClass.turma].map((aluno, idx) => ({
    id: idx + 1,
    aluno,
    attendance: dateDates.reduce(
      (acc, date) => {
        acc[date] = "";
        return acc;
      },
      {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
    ),
  }));

  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
  const [history, setHistory] = useState<AttendanceHistory[]>([]);

  // Monitorar mudanças reais no attendance e salvar histórico uma única vez
  useEffect(() => {
    // Na primeira renderização, apenas inicializa a referência
    if (isFirstRenderRef.current) {
      prevAttendanceRef.current = JSON.parse(JSON.stringify(attendance));
      isFirstRenderRef.current = false;
      return;
    }

    // Se estamos desfazendo, não salva histórico novamente
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      prevAttendanceRef.current = JSON.parse(JSON.stringify(attendance));
      return;
    }

    // Nas renderizações posteriores, detecta mudanças
    const prevStr = JSON.stringify(prevAttendanceRef.current);
    const currentStr = JSON.stringify(attendance);

    if (prevStr !== currentStr) {
      setHistory((h) => [prevAttendanceRef.current as AttendanceRecord[], ...h.slice(0, 9)]);
      prevAttendanceRef.current = JSON.parse(JSON.stringify(attendance));
    }
  }, [attendance]);

  // Formato: mmm/aaaa (ex: jan/2026)
  const currentMonthFormatted = (() => {
    const now = new Date();
    const months = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    return `${months[now.getMonth()]}/${now.getFullYear()}`;
  })();

  const handleClassChange = (turma: string) => {
    const newClass = classOptions.find((c) => c.turma === turma) || selectedClass;
    setSelectedClass(newClass);
    const newDates = generateDates(newClass.diasSemana).map((d) => d.split(" ")[0]);
    setAttendance(
      studentsPerClass[newClass.turma].map((aluno, idx) => ({
        id: idx + 1,
        aluno,
        attendance: newDates.reduce(
          (acc, date) => {
            acc[date] = "";
            return acc;
          },
          {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
        ),
      }))
    );
  };

  // Ciclar entre os 4 estados
  const cycleStatus = (currentStatus: "Presente" | "Falta" | "Justificado" | "") => {
    const cycle = ["Presente", "Falta", "Justificado", ""];
    const nextIndex = (cycle.indexOf(currentStatus) + 1) % cycle.length;
    return cycle[nextIndex] as "Presente" | "Falta" | "Justificado" | "";
  };

  const handleStatusChange = useCallback((id: number, date: string) => {
    setAttendance((prev) => {
      const newAttendance = prev.map((item) => {
        if (item.id === id) {
          const currentStatus = item.attendance[date];
          const newStatus = cycleStatus(currentStatus);
          console.log(`Clique: ID=${id} Data=${date} ${currentStatus}→${newStatus}`);
          
          return {
            ...item,
            attendance: {
              ...item.attendance,
              [date]: newStatus,
            },
          };
        }
        return item;
      });
      return newAttendance;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length > 0) {
      isUndoingRef.current = true;
      setAttendance(history[0]);
      setHistory((h) => h.slice(1));
    }
  }, [history]);

  const handleClearAll = useCallback(() => {
    setAttendance((prev) =>
      prev.map((item) => ({
        ...item,
        attendance: Object.keys(item.attendance).reduce(
          (acc, date) => {
            acc[date] = "";
            return acc;
          },
          {} as { [date: string]: "Presente" | "Falta" | "Justificado" | "" }
        ),
      }))
    );
  }, []);

  const handleSave = () => {
    console.log("Salvando chamada:", {
      turma: selectedClass.turma,
      horario: selectedClass.horario,
      professor: selectedClass.professor,
      data: selectedDate,
      attendance,
    });
    alert("Chamada salva com sucesso! (Demo)");
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* SUB MENU - SELEÇÃO DE TURMA, HORÁRIO E PROFESSOR */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "25px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
        }}
      >
        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Turma
          </label>
          <select
            value={selectedClass.turma}
            onChange={(e) => handleClassChange(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              marginTop: "6px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {classOptions.map((c) => (
              <option key={c.turma} value={c.turma}>
                {c.turma}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Horário
          </label>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "8px 12px",
              borderRadius: "6px",
              marginTop: "6px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {selectedClass.horario}
          </div>
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Professor
          </label>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "8px 12px",
              borderRadius: "6px",
              marginTop: "6px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {selectedClass.professor}
          </div>
        </div>

        <div>
          <label style={{ fontSize: "12px", opacity: 0.9, fontWeight: 600 }}>
            Nível
          </label>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "8px 12px",
              borderRadius: "6px",
              marginTop: "6px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {selectedClass.nivel}
          </div>
        </div>
      </div>

      {/* MÊS E DATA */}
      <div
        style={{
          background: "#f8f9fa",
          padding: "15px 20px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <span style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}>
            Período
          </span>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#2c3e50", marginTop: "4px" }}>
            {currentMonthFormatted}
          </div>
        </div>
      </div>

      {/* TABELA DE CHAMADA - DATAS NO CABEÇALHO */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "#667eea", color: "white" }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "bold", minWidth: "150px" }}>
                  Aluno
                </th>
                {dateDates.map((date) => {
                  const d = new Date(date);
                  const dayNum = String(d.getDate()).padStart(2, "0");
                  return (
                    <th
                      key={date}
                      style={{
                        padding: "12px 8px",
                        textAlign: "center",
                        fontWeight: "bold",
                        fontSize: "14px",
                        minWidth: "60px",
                      }}
                    >
                      {dayNum}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {attendance.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #e0e0e0",
                    background: idx % 2 === 0 ? "#ffffff" : "#f9f9f9",
                  }}
                >
                  <td style={{ padding: "12px", fontWeight: 500 }}>{item.aluno}</td>
                  {dateDates.map((date) => {
                    const status = item.attendance[date];
                    let buttonLabel = "-";
                    let buttonColor = "#e8e8e8";
                    let buttonTextColor = "#666";

                    if (status === "Presente") {
                      buttonLabel = "✓";
                      buttonColor = "#28a745";
                      buttonTextColor = "white";
                    } else if (status === "Falta") {
                      buttonLabel = "✕";
                      buttonColor = "#dc3545";
                      buttonTextColor = "white";
                    } else if (status === "Justificado") {
                      buttonLabel = "j";
                      buttonColor = "#ffc107";
                      buttonTextColor = "white";
                    }

                    return (
                      <td key={date} style={{ padding: "8px", textAlign: "center" }}>
                        <button
                          onClick={() => handleStatusChange(item.id, date)}
                          style={{
                            background: buttonColor,
                            color: buttonTextColor,
                            border: "1px solid #ddd",
                            padding: "8px 14px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: "14px",
                            transition: "all 0.15s ease",
                            minWidth: "50px",
                            height: "38px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: "1",
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLButtonElement).style.transform = "scale(1)";
                          }}
                        >
                          {buttonLabel}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTÕES AÇÃO */}
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <button
          onClick={handleUndo}
          disabled={history.length === 0}
          style={{
            background: history.length === 0 ? "#ccc" : "#6c757d",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "8px",
            cursor: history.length === 0 ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "13px",
            transition: "all 0.2s ease",
            opacity: history.length === 0 ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (history.length > 0) {
              (e.target as HTMLButtonElement).style.background = "#5a6268";
            }
          }}
          onMouseLeave={(e) => {
            if (history.length > 0) {
              (e.target as HTMLButtonElement).style.background = "#6c757d";
            }
          }}
        >
          ↶ Desfazer
        </button>
        <button
          onClick={handleClearAll}
          style={{
            background: "#e8e8e8",
            color: "#333",
            border: "1px solid #ccc",
            padding: "10px 18px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = "#d0d0d0";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = "#e8e8e8";
          }}
        >
          🔄 Limpar Tudo
        </button>
        <button
          onClick={handleSave}
          style={{
            background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            color: "white",
            border: "none",
            padding: "10px 24px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            transition: "all 0.2s ease",
            boxShadow: "0 4px 12px rgba(67, 233, 123, 0.3)",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(-2px)";
            (e.target as HTMLButtonElement).style.boxShadow =
              "0 6px 16px rgba(67, 233, 123, 0.4)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.transform = "translateY(0)";
            (e.target as HTMLButtonElement).style.boxShadow =
              "0 4px 12px rgba(67, 233, 123, 0.3)";
          }}
        >
          💾 Salvar Chamada
        </button>
      </div>
    </div>
  );
};

export default Attendance;
