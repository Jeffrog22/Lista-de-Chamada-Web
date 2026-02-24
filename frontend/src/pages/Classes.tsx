import React, { useState, useEffect } from "react";
import { isValidHorarioPartial, maskHorarioInput } from "../utils/time";
import { getBootstrap, addClass, updateClass } from "../api";
import "./Classes.css";

interface Class {
  id?: number;
  Turma: string;
  TurmaCodigo?: string;
  Horario: string;
  Professor: string;
  Nivel?: string;
  FaixaEtaria?: string;
  Atalho?: string;
  CapacidadeMaxima?: number;
  DiasSemana?: string;
}

type WeekdayValue = "segunda" | "terca" | "quarta" | "quinta" | "sexta";

const WEEKDAY_OPTIONS: Array<{ value: WeekdayValue; label: string }> = [
  { value: "segunda", label: "Segunda" },
  { value: "terca", label: "Terça" },
  { value: "quarta", label: "Quarta" },
  { value: "quinta", label: "Quinta" },
  { value: "sexta", label: "Sexta" },
];

const WEEKDAY_LETTERS: Record<WeekdayValue, string> = {
  segunda: "S",
  terca: "T",
  quarta: "Q",
  quinta: "Q",
  sexta: "S",
};

const WEEKDAY_ACCENTS: Record<WeekdayValue, string> = {
  segunda: "#6f66ff",
  terca: "#7f8bff",
  quarta: "#6b7cf5",
  quinta: "#5c63ff",
  sexta: "#7bb3ff",
};

const getWeekdayAccentStyle = (day: WeekdayValue) =>
  ({
    ["--weekday-accent" as "--weekday-accent"]: WEEKDAY_ACCENTS[day],
  } as React.CSSProperties);

const WEEKDAY_ORDER: Record<WeekdayValue, number> = {
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
};

const normalizeSimple = (value: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const sortDays = (days: WeekdayValue[]) =>
  [...days].sort((a, b) => WEEKDAY_ORDER[a] - WEEKDAY_ORDER[b]);

const parseDiasSemana = (raw?: string) => {
  if (!raw) return [] as WeekdayValue[];
  const chunks = raw
    .split(/[;,]/)
    .map((item) => normalizeSimple(item))
    .filter(Boolean);

  const found = new Set<WeekdayValue>();
  chunks.forEach((item) => {
    if (item.startsWith("seg")) found.add("segunda");
    else if (item.startsWith("ter")) found.add("terca");
    else if (item.startsWith("qua")) found.add("quarta");
    else if (item.startsWith("qui")) found.add("quinta");
    else if (item.startsWith("sex")) found.add("sexta");
  });

  return sortDays(Array.from(found));
};

const buildDiasLabel = (days: WeekdayValue[]) => {
  const ordered = sortDays(days);
  if (ordered.length === 0) return "";

  const groups: WeekdayValue[][] = [];
  ordered.forEach((day) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([day]);
      return;
    }
    const previousDay = lastGroup[lastGroup.length - 1];
    if (WEEKDAY_ORDER[day] - WEEKDAY_ORDER[previousDay] === 1) {
      lastGroup.push(day);
      return;
    }
    groups.push([day]);
  });

  const formatDay = (day: WeekdayValue) => WEEKDAY_OPTIONS.find((opt) => opt.value === day)?.label || day;

  const chunks = groups.map((group) => {
    if (group.length === 1) return formatDay(group[0]);
    if (group.length === 2) return `${formatDay(group[0])} e ${formatDay(group[1])}`;
    return `${formatDay(group[0])} à ${formatDay(group[group.length - 1])}`;
  });

  if (chunks.length === 1) return chunks[0];
  if (chunks.length === 2) return `${chunks[0]} e ${chunks[1]}`;
  return `${chunks.slice(0, -1).join(", ")} e ${chunks[chunks.length - 1]}`;
};

const buildDiasCode = (days: WeekdayValue[]) => {
  const ordered = sortDays(days);
  if (ordered.length === 0) return "";
  const normalizedKey = ordered.join("|");
  if (normalizedKey === "terca|quinta") return "tq";
  if (normalizedKey === "quarta|sexta") return "qs";

  const mapping: Record<WeekdayValue, string> = {
    segunda: "s",
    terca: "t",
    quarta: "q",
    quinta: "q",
    sexta: "f",
  };

  return ordered.map((day) => mapping[day]).join("");
};

const buildProfessorCode = (professor: string) => {
  const clean = normalizeSimple(professor).replace(/[^a-z]/g, "");
  if (!clean) return "xx";
  return clean.slice(0, 2).padEnd(2, "x");
};

const buildNextTurmaCode = (professor: string, days: WeekdayValue[], existingClasses: Class[]) => {
  const profCode = buildProfessorCode(professor);
  const diasCode = buildDiasCode(days);
  if (!profCode || !diasCode) return "";

  const base = `${profCode}${diasCode}`;
  let nextIndex = 1;
  existingClasses.forEach((cls) => {
    const currentCode = ((cls.TurmaCodigo || cls.Atalho || "") as string).trim().toLowerCase();
    const match = currentCode.match(new RegExp(`^${base}(\\d{2})$`, "i"));
    if (!match) return;
    const numeric = parseInt(match[1], 10);
    if (numeric >= nextIndex) nextIndex = numeric + 1;
  });
  return `${base}${String(nextIndex).padStart(2, "0")}`;
};

const formatHorario = (value: string) => {
  if (!value) return "";
  if (value.includes(":")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
  return digits;
};

export const Classes: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  
  const [loading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [studentCounts, setStudentCounts] = useState<{ [key: string]: number }>({});
  const [sortKey, setSortKey] = useState<"Turma" | "Horario" | "Professor" | "Nivel" | "FaixaEtaria" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedDays, setSelectedDays] = useState<WeekdayValue[]>([]);
  const [turmaTouched, setTurmaTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    const updateCounts = () => {
      const studentsStr = localStorage.getItem("activeStudents");
      if (studentsStr) {
        const students = JSON.parse(studentsStr);
        const counts: { [key: string]: number } = {};
        students.forEach((s: any) => {
          const key = s.turmaCodigo || s.turma;
          if (key) {
            counts[key] = (counts[key] || 0) + 1;
          }
        });
        setStudentCounts(counts);
      }
    };
    updateCounts();
    const intervalId = window.setInterval(updateCounts, 2000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    getBootstrap()
      .then((response) => {
        const data = response.data as {
          classes: Array<{
            id: number;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            faixa_etaria: string;
            capacidade: number;
            dias_semana: string;
          }>;
        };

        if (data.classes.length === 0) return;
        const mapped = data.classes.map((cls) => ({
          id: cls.id,
          Turma: cls.turma_label || cls.codigo,
          TurmaCodigo: cls.codigo,
          Horario: cls.horario,
          Professor: cls.professor,
          Nivel: cls.nivel,
          FaixaEtaria: cls.faixa_etaria,
          Atalho: cls.codigo,
          CapacidadeMaxima: cls.capacidade,
          DiasSemana: cls.dias_semana,
        }));
        setClasses(mapped);
        localStorage.setItem("activeClasses", JSON.stringify(mapped));
        // Notify Attendance component to refresh
        window.dispatchEvent(new Event("attendanceDataUpdated"));
      })
      .catch(() => {
        // keep local data
      });
  }, []);

  useEffect(() => {
    localStorage.setItem("activeClasses", JSON.stringify(classes));
    // Notify Attendance component to refresh
    window.dispatchEvent(new Event("attendanceDataUpdated"));
  }, [classes]);

  useEffect(() => {
    if (!showForm || !!editingClass) return;
    const nextLabel = buildDiasLabel(selectedDays);
    const nextCode = buildNextTurmaCode(String(formData.Professor || ""), selectedDays, classes);
    const nextDiasSemana = selectedDays
      .map((day) => WEEKDAY_OPTIONS.find((opt) => opt.value === day)?.label || "")
      .filter(Boolean)
      .join(";");

    setFormData((prev) => ({
      ...prev,
      Turma: turmaTouched ? prev.Turma : nextLabel,
      Atalho: codeTouched ? prev.Atalho : nextCode,
      TurmaCodigo: codeTouched ? prev.TurmaCodigo : nextCode,
      DiasSemana: nextDiasSemana,
    }));
  }, [showForm, editingClass, selectedDays, formData.Professor, classes, turmaTouched, codeTouched]);

  const filteredClasses = classes.filter(
    (c) =>
      c.Turma.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.Professor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.Nivel || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const nivelOrder = [
    "iniciacao b",
    "iniciacao a",
    "nivel 1",
    "nivel 2",
    "nivel 3",
    "nivel 4",
    "adulto b",
    "adulto a",
  ];

  const getNivelRank = (nivel?: string) => {
    if (!nivel) return Number.MAX_SAFE_INTEGER;
    const normalized = nivel.toLowerCase().trim();
    const idx = nivelOrder.indexOf(normalized);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
  };

  const compareHorario = (a: string, b: string) => {
    const normalize = (value: string) => {
      if (!value) return 0;
      const digits = value.replace(/\D/g, "");
      if (digits.length === 3) return parseInt(`0${digits}`, 10);
      if (digits.length >= 4) return parseInt(digits.slice(0, 4), 10);
      return 0;
    };
    return normalize(a) - normalize(b);
  };

  const sortedClasses = [...filteredClasses].sort((a, b) => {
    if (!sortKey) return 0;
    let result = 0;
    if (sortKey === "Turma") {
      result = a.Turma.localeCompare(b.Turma);
    } else if (sortKey === "Horario") {
      result = compareHorario(a.Horario, b.Horario);
    } else if (sortKey === "Professor") {
      result = a.Professor.localeCompare(b.Professor);
    } else if (sortKey === "Nivel") {
      result = getNivelRank(a.Nivel) - getNivelRank(b.Nivel);
    } else if (sortKey === "FaixaEtaria") {
      result = (a.FaixaEtaria || "").localeCompare(b.FaixaEtaria || "");
    }
    return sortDir === "asc" ? result : -result;
  });

  const handleSort = (key: "Turma" | "Horario" | "Professor" | "Nivel" | "FaixaEtaria") => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortIndicator = (key: "Turma" | "Horario" | "Professor" | "Nivel" | "FaixaEtaria") => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const handleAddClick = () => {
    setEditingClass(null);
    setSelectedDays([]);
    setTurmaTouched(false);
    setCodeTouched(false);
    setFormData({});
    setShowForm(true);
  };

  const handleEditClick = (classData: Class) => {
    setEditingClass(classData);
    setSelectedDays(parseDiasSemana(classData.DiasSemana));
    setTurmaTouched(true);
    setCodeTouched(true);
    setFormData(classData);
    setShowForm(true);
  };

  const handleSave = async () => {
    const finalCode = String(formData.Atalho || formData.TurmaCodigo || "").trim();
    const finalPayload: Class = {
      ...(formData as Class),
      TurmaCodigo: finalCode,
      Atalho: finalCode,
      DiasSemana:
        formData.DiasSemana ||
        selectedDays
          .map((day) => WEEKDAY_OPTIONS.find((opt) => opt.value === day)?.label || "")
          .filter(Boolean)
          .join(";"),
    };

    try {
      if (editingClass) {
        // Update existing class
        if (!editingClass.id) {
          throw new Error("ID da turma não encontrado");
        }
        await updateClass(editingClass.id, {
          turma_label: finalPayload.Turma,
          horario: finalPayload.Horario,
          professor: finalPayload.Professor,
          nivel: finalPayload.Nivel,
          faixa_etaria: finalPayload.FaixaEtaria,
          capacidade: finalPayload.CapacidadeMaxima,
          dias_semana: finalPayload.DiasSemana,
        });
        setClasses((prev) =>
          prev.map((c) =>
            c.id === editingClass.id
              ? ({ ...c, ...finalPayload } as Class)
              : c
          )
        );
        // Notify Attendance component to refresh
        window.dispatchEvent(new Event("attendanceDataUpdated"));
        alert("Turma atualizada com sucesso!");
      } else {
        // Add new class
        await addClass({
          turma_label: finalPayload.Turma,
          horario: finalPayload.Horario,
          professor: finalPayload.Professor,
          nivel: finalPayload.Nivel,
          faixa_etaria: finalPayload.FaixaEtaria,
          capacidade: finalPayload.CapacidadeMaxima,
          dias_semana: finalPayload.DiasSemana,
        });
        // Refetch data from backend to get the ID
        const response = await getBootstrap();
        const data = response.data as {
          classes: Array<{
            id: number;
            codigo: string;
            turma_label: string;
            horario: string;
            professor: string;
            nivel: string;
            faixa_etaria: string;
            capacidade: number;
            dias_semana: string;
          }>;
        };
        const mapped = data.classes.map((cls) => ({
          id: cls.id,
          Turma: cls.turma_label || cls.codigo,
          TurmaCodigo: cls.codigo,
          Horario: cls.horario,
          Professor: cls.professor,
          Nivel: cls.nivel,
          FaixaEtaria: cls.faixa_etaria,
          Atalho: cls.codigo,
          CapacidadeMaxima: cls.capacidade,
          DiasSemana: cls.dias_semana,
        }));
        setClasses(mapped);
        localStorage.setItem("activeClasses", JSON.stringify(mapped));
        // Notify Attendance component to refresh
        window.dispatchEvent(new Event("attendanceDataUpdated"));
        alert("Turma adicionada com sucesso!");
      }
      setShowForm(false);
    } catch (error) {
      console.error("Erro ao salvar turma:", error);
      alert("Erro ao salvar turma. Verifique os dados e tente novamente.");
    }
  };

  const handleDelete = (classData: Class) => {
    if (confirm("Tem certeza que deseja deletar esta Turma? Certifique-se de que ela esteja vazia antes de excluir; Caso contrário os alunos ficaram perdidos, sem turma e não aparecerão mais nas chamadas")) {
      setClasses((prev) =>
        prev.filter(
          (c) => c.Turma !== classData.Turma || c.Horario !== classData.Horario
        )
      );
      // Notify Attendance component to refresh
      window.dispatchEvent(new Event("attendanceDataUpdated"));
      alert("Turma excluída com sucesso!");
    }
  };

  const handleGoToAttendance = (classData: Class) => {
    const targetValue = classData.TurmaCodigo || classData.Turma;
    localStorage.setItem("attendanceTargetTurma", targetValue);
    localStorage.setItem(
      "attendanceSelection",
      JSON.stringify({
        turma: classData.Turma || "",
        horario: classData.Horario || "",
        professor: classData.Professor || "",
      })
    );
    window.location.hash = "attendance";
  };

  const getLotacaoStyle = (count: number, capacity: number) => {
    if (capacity > 0 && count > capacity) {
      return { background: "#FF6969", color: "#1f1f1f" };
    }
    if (capacity > 0 && count === capacity) {
      return { background: "#FFDF57", color: "#1f1f1f" };
    }
    return { background: "#eef2ff", color: "#4f46e5" };
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue: string | number = value;

    if (name === "Turma") setTurmaTouched(true);
    if (name === "Atalho") setCodeTouched(true);

    setFormData((prev) => {
      if (name === "Horario") {
        const masked = maskHorarioInput(value);
        if (!isValidHorarioPartial(masked)) {
          return prev;
        }
        newValue = masked;
      } else if (name === "CapacidadeMaxima") {
        newValue = parseInt(value) || 0;
      }

      if (name === "Atalho") {
        const normalized = String(newValue).toLowerCase().replace(/[^a-z0-9]/g, "");
        return { ...prev, Atalho: normalized, TurmaCodigo: normalized };
      }

      return { ...prev, [name]: newValue };
    });
  };

  const handleDayToggle = (day: WeekdayValue) => {
    setSelectedDays((prev) => {
      const exists = prev.includes(day);
      const next = exists ? prev.filter((item) => item !== day) : [...prev, day];
      return sortDays(next);
    });
  };

  const diasResumo = selectedDays.length ? buildDiasLabel(selectedDays) : "Selecione os dias da semana";
  const summaryCode = formData.Atalho || formData.TurmaCodigo;

  return (
    <div className="classes-page">
      <div className="classes-top">
        <div className="classes-top__search">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar turma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={handleAddClick} className="btn-primary btn-gradient">
            ➕ Nova Turma
          </button>
        </div>
      </div>

      {showForm && (
        <section className="nova-turma-card">
          <header className="nova-turma-card__header">
            <div>
              <p className="nova-turma-card__eyebrow">painel rápido</p>
              <h3>{editingClass ? "Editar Turma" : "Adicionar Turma"}</h3>
            </div>
            <div className="nova-turma-card__summary">
              <span className="nova-turma-card__summary-title">dias</span>
              <strong className="nova-turma-card__summary-text">{diasResumo}</strong>
              <span className="nova-turma-card__summary-meta">
                {summaryCode ? `ID ${summaryCode.toUpperCase()}` : "Código automático"}
              </span>
            </div>
          </header>
          <div className="nova-turma-grid nova-turma-grid--top">
            <div className="form-group form-group--chips">
              <label>dias da semana</label>
              <div className="weekday-chips">
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = selectedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handleDayToggle(day.value)}
                      disabled={!!editingClass}
                      className={`weekday-chip ${active ? "weekday-chip--active" : ""} ${editingClass ? "weekday-chip--disabled" : ""}`}
                      style={getWeekdayAccentStyle(day.value)}
                      aria-label={day.label}
                    >
                      <span className="weekday-chip__letter">{WEEKDAY_LETTERS[day.value]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group form-group--selected">
              <label>dias selecionados</label>
              <input
                type="text"
                name="DiasSemana"
                placeholder="dias da semana"
                value={formData.DiasSemana || ""}
                onChange={handleFormChange}
                disabled
              />
            </div>
            <div className="form-group form-group--turma">
              <label>turma</label>
              <input
                type="text"
                name="Turma"
                placeholder="turma"
                value={formData.Turma || ""}
                onChange={handleFormChange}
                disabled={!!editingClass}
              />
            </div>
            <div className="form-group form-group--horario">
              <label>horário</label>
              <input
                type="text"
                name="Horario"
                placeholder="00:00"
                value={String(formData.Horario || "")}
                onChange={handleFormChange}
                disabled={!!editingClass}
              />
            </div>
            <div className="form-group form-group--professor">
              <label>professor(a)</label>
              <input
                type="text"
                name="Professor"
                placeholder="professor(a)"
                value={formData.Professor || ""}
                onChange={handleFormChange}
                disabled={!!editingClass}
              />
            </div>
            <div className="form-group form-group--nivel">
              <label>nível</label>
              <input
                type="text"
                name="Nivel"
                placeholder="nível"
                value={formData.Nivel || ""}
                onChange={handleFormChange}
              />
            </div>
            <div className="form-group form-group--capacidade">
              <label>capacidade</label>
              <input
                type="number"
                name="CapacidadeMaxima"
                placeholder="máximo de alunos *"
                value={formData.CapacidadeMaxima || ""}
                onChange={handleFormChange}
              />
            </div>
            <div className="form-group form-group--faixaetaria">
              <label>faixa etária</label>
              <input
                type="text"
                name="FaixaEtaria"
                placeholder="faixa etária"
                value={formData.FaixaEtaria || ""}
                onChange={handleFormChange}
              />
            </div>
          </div>
          <div className="nova-turma-actions">
            <button onClick={handleSave} className="btn-success">
              ✓ Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">
              ✕ Cancelar
            </button>
          </div>
        </section>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#667eea", color: "white" }}>
              <th
                onClick={() => handleSort("Turma")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Turma{getSortIndicator("Turma")}
              </th>
              <th
                onClick={() => handleSort("Horario")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Horário{getSortIndicator("Horario")}
              </th>
              <th
                onClick={() => handleSort("Professor")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Professor{getSortIndicator("Professor")}
              </th>
              <th
                onClick={() => handleSort("Nivel")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Nível{getSortIndicator("Nivel")}
              </th>
              <th
                onClick={() => handleSort("FaixaEtaria")}
                style={{ padding: "12px", textAlign: "left", fontWeight: "bold", cursor: "pointer" }}
              >
                Faixa etária{getSortIndicator("FaixaEtaria")}
              </th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "bold" }}>Lotação</th>
              <th style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedClasses.map((classData, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e0e0e0", background: idx % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                <td style={{ padding: "12px" }} title={classData.TurmaCodigo ? `Codigo: ${classData.TurmaCodigo}` : ""}>
                  {classData.Turma}
                </td>
                <td style={{ padding: "12px" }}>{formatHorario(classData.Horario)}</td>
                <td style={{ padding: "12px" }}>{classData.Professor}</td>
                <td style={{ padding: "12px" }}>{classData.Nivel || "-"}</td>
                <td style={{ padding: "12px", fontWeight: "bold", fontSize: "12px", color: "#677feb" }}>
                  {classData.FaixaEtaria || "-"}
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  <span
                    style={{
                      ...getLotacaoStyle(
                        studentCounts[classData.TurmaCodigo || classData.Turma] || 0,
                        classData.CapacidadeMaxima || 0
                      ),
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontWeight: "bold",
                      fontSize: "12px",
                    }}
                  >
                    {studentCounts[classData.TurmaCodigo || classData.Turma] || 0} / {classData.CapacidadeMaxima || 0}
                  </span>
                </td>
                <td style={{ padding: "12px", textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleGoToAttendance(classData)}
                    style={{
                      background: "#28a745",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    📅 Chamada
                  </button>
                  <button
                    onClick={() => handleEditClick(classData)}
                    style={{
                      background: "#667eea",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    ✎ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(classData)}
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredClasses.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
          Nenhuma turma encontrada
        </div>
      )}
    </div>
  );
};

export default Classes;
