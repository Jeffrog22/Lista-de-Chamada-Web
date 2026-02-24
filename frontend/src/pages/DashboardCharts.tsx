import React, { useState, useEffect, useMemo } from 'react';
import { getAcademicCalendar, getReports } from '../api';
import { isDateClosedForAttendance } from '../utils/academicCalendar';
import type { AcademicCalendarEvent, AcademicCalendarSettings } from '../utils/academicCalendar';
import './DashboardCharts.css';

interface ReportStudent {
  id: string;
  nome: string;
  presencas: number;
  faltas: number;
  justificativas: number;
  frequencia: number;
  historico: { [date: string]: string };
}

interface ReportClass {
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  alunos: ReportStudent[];
}

const normalizeReportPayload = (payload: unknown): ReportClass[] => {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => {
    const record = (item || {}) as Record<string, unknown>;
    const alunosRaw = Array.isArray(record.alunos) ? (record.alunos as unknown[]) : [];
    const alunos: ReportStudent[] = alunosRaw.map((student) => {
      const st = (student || {}) as Record<string, unknown>;
      return {
        id: String(st.id || ''),
        nome: String(st.nome || ''),
        presencas: Number(st.presencas || 0),
        faltas: Number(st.faltas || 0),
        justificativas: Number(st.justificativas || 0),
        frequencia: Number(st.frequencia || 0),
        historico: (st.historico && typeof st.historico === 'object' ? st.historico : {}) as { [date: string]: string },
      };
    });
    return {
      turma: String(record.turma || '-'),
      horario: String(record.horario || ''),
      professor: String(record.professor || '-'),
      nivel: String(record.nivel || '-'),
      alunos,
    };
  });
};

interface ChartData {
  name: string;
  presente: number;
  ausente: number;
  justificado: number;
}

interface SimpleData {
  name: string;
  valor: number;
}

interface ClassSummary {
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  presentes: number;
  ausentes: number;
  justificados: number;
  total: number;
  frequencia: number;
  dayKeys: string[];
  historicoEntries: Array<{ day: string; status: string }>;
}

interface StudentAggregate {
  name: string;
  presencas: number;
  faltas: number;
  justificativas: number;
  total: number;
  frequencia: number;
}

const formatHorario = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes(':')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return raw;
};

const getHorarioSortValue = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) return Number.parseInt(digits.slice(0, 4), 10);
  if (digits.length === 3) return Number.parseInt(`0${digits}`, 10);
  return Number.MAX_SAFE_INTEGER;
};

const normalize = (value: string) =>
  (() => {
    const base = String(value || '').toLowerCase();
    if (typeof base.normalize !== 'function') return base.trim();
    return base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  })();

const getPeriodo = (horario: string) => {
  const digits = String(horario || '').replace(/\D/g, '');
  const hh = digits.length >= 2 ? parseInt(digits.slice(0, 2), 10) : NaN;
  if (Number.isNaN(hh)) return 'Não informado';
  if (hh < 12) return 'Manhã';
  if (hh < 18) return 'Tarde';
  return 'Noite';
};

const getScheduleGroup = (turma: string): 'terca-quinta' | 'quarta-sexta' | 'outros' => {
  const norm = normalize(turma);
  if (norm.includes('terca') && norm.includes('quinta')) return 'terca-quinta';
  if (norm.includes('quarta') && norm.includes('sexta')) return 'quarta-sexta';
  return 'outros';
};

const weekdaysByGroup: Record<string, number[]> = {
  'terca-quinta': [2, 4],
  'quarta-sexta': [3, 5],
};

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseHistoricoDayToDate = (rawDay: string, selectedYear: number, selectedMonthIndex: number) => {
  const raw = String(rawDay || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/').map(Number);
    const parsed = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{1,2}$/.test(raw)) {
    const day = Number(raw);
    const parsed = new Date(selectedYear, selectedMonthIndex, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const DashboardCharts: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [dateScope, setDateScope] = useState<'mensal' | 'ate-hoje'>('mensal');

  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [studentsAggregated, setStudentsAggregated] = useState<StudentAggregate[]>([]);
  const [calendarSettings, setCalendarSettings] = useState<AcademicCalendarSettings | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [occurrenceProfessor, setOccurrenceProfessor] = useState<string>('');
  const [occurrenceGroup, setOccurrenceGroup] = useState<'terca-quinta' | 'quarta-sexta'>('terca-quinta');

  const selectedMonth = `${year}-${month}`;

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getReports({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        const data = normalizeReportPayload(response.data);
        setHasData(data.length > 0);

        const summaries: ClassSummary[] = data.map((classItem) => {
          const presentes = classItem.alunos.reduce((acc, student) => acc + (student.presencas || 0), 0);
          const ausentes = classItem.alunos.reduce((acc, student) => acc + (student.faltas || 0), 0);
          const justificados = classItem.alunos.reduce((acc, student) => acc + (student.justificativas || 0), 0);
          const total = presentes + ausentes + justificados;
          const daySet = new Set<string>();
          const historicoEntries: Array<{ day: string; status: string }> = [];
          classItem.alunos.forEach((student) => {
            Object.entries(student.historico || {}).forEach(([day, status]) => {
              if (day) daySet.add(day);
              historicoEntries.push({ day, status: String(status || '') });
            });
          });
          const frequencia = total > 0 ? Number((((presentes + justificados) / total) * 100).toFixed(1)) : 0;
          return {
            turma: classItem.turma || '-',
            horario: formatHorario(classItem.horario || '-'),
            professor: classItem.professor || '-',
            nivel: classItem.nivel || '-',
            presentes,
            ausentes,
            justificados,
            total,
            frequencia,
            dayKeys: Array.from(daySet),
            historicoEntries,
          };
        });

        const studentMap = new Map<string, Omit<StudentAggregate, 'frequencia' | 'total'>>();
        data.forEach((classItem) => {
          classItem.alunos.forEach((student) => {
            const key = normalize(student.nome || '');
            const current = studentMap.get(key) || {
              name: student.nome || '-',
              presencas: 0,
              faltas: 0,
              justificativas: 0,
            };
            current.presencas += student.presencas || 0;
            current.faltas += student.faltas || 0;
            current.justificativas += student.justificativas || 0;
            studentMap.set(key, current);
          });
        });
        const studentsAgg: StudentAggregate[] = Array.from(studentMap.values()).map((item) => {
          const total = item.presencas + item.faltas + item.justificativas;
          const frequencia = total > 0 ? Number((((item.presencas + item.justificativas) / total) * 100).toFixed(1)) : 0;
          return { ...item, total, frequencia };
        });

        setClassSummaries(summaries);
        setStudentsAggregated(studentsAgg);
      })
      .catch(() => {
        if (!isMounted) return;
        setHasData(false);
        setClassSummaries([]);
        setStudentsAggregated([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

  useEffect(() => {
    let isMounted = true;
    getAcademicCalendar({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        const payload = (response?.data || {}) as {
          settings?: AcademicCalendarSettings | null;
          events?: AcademicCalendarEvent[];
        };
        setCalendarSettings(payload.settings || null);
        setCalendarEvents(Array.isArray(payload.events) ? payload.events : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setCalendarSettings(null);
        setCalendarEvents([]);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

  const occurrenceProfessors = useMemo(() => {
    return Array.from(new Set(classSummaries.map((item) => item.professor).filter(Boolean))).sort();
  }, [classSummaries]);

  useEffect(() => {
    if (occurrenceProfessors.length === 0) {
      setOccurrenceProfessor('');
      return;
    }
    if (!occurrenceProfessor || !occurrenceProfessors.includes(occurrenceProfessor)) {
      setOccurrenceProfessor(occurrenceProfessors[0]);
    }
  }, [occurrenceProfessors, occurrenceProfessor]);

  const dashboardData = useMemo(() => {
    const [yearValue, monthValue] = selectedMonth.split('-').map((part) => parseInt(part, 10));
    const safeYear = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
    const safeMonthIndex = Number.isFinite(monthValue) ? Math.max(1, Math.min(12, monthValue)) - 1 : new Date().getMonth();
    const monthStart = new Date(safeYear, safeMonthIndex, 1);
    const monthEnd = new Date(safeYear, safeMonthIndex + 1, 0);
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const effectiveEnd =
      dateScope === 'mensal'
        ? monthEnd
        : (todayOnly < monthStart ? null : (todayOnly < monthEnd ? todayOnly : monthEnd));

    const plannedClassDaysUntilCurrent = (() => {
      if (!effectiveEnd) return [] as string[];
      const result: string[] = [];
      const cursor = new Date(monthStart);
      while (cursor <= effectiveEnd) {
        const dateKey = toDateKey(cursor);
        if (!isDateClosedForAttendance(dateKey, calendarSettings, calendarEvents)) {
          result.push(dateKey);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return result;
    })();

    const plannedClassDaySet = new Set(plannedClassDaysUntilCurrent);

    const getExpectedForClass = (item: ClassSummary) => {
      const group = getScheduleGroup(item.turma);
      const weekdays = weekdaysByGroup[group] || [];
      if (weekdays.length === 0) return 0;
      return plannedClassDaysUntilCurrent.filter((dateKey) => {
        const d = new Date(`${dateKey}T00:00:00`);
        return weekdays.includes(d.getDay());
      }).length;
    };

    const getRegisteredForClass = (item: ClassSummary) => {
      const group = getScheduleGroup(item.turma);
      const weekdays = weekdaysByGroup[group] || [];
      if (weekdays.length === 0) return 0;

      const uniqueRecorded = new Set<string>();
      item.historicoEntries.forEach(({ day, status }) => {
        const normalizedStatus = String(status || '').toLowerCase();
        if (!['c', 'f', 'j'].includes(normalizedStatus)) return;

        const parsed = parseHistoricoDayToDate(day, safeYear, safeMonthIndex);
        if (!parsed) return;

        const parsedKey = toDateKey(parsed);
        if (!plannedClassDaySet.has(parsedKey)) return;
        if (!weekdays.includes(parsed.getDay())) return;
        uniqueRecorded.add(parsedKey);
      });

      return uniqueRecorded.size;
    };

    const sumExpected = classSummaries.reduce((acc, item) => acc + getExpectedForClass(item), 0);

    const aulasDadas = classSummaries.reduce((acc, item) => acc + getRegisteredForClass(item), 0);

    const uniqueObservedDays = new Set<string>();
    classSummaries.forEach((item) => {
      const group = getScheduleGroup(item.turma);
      const weekdays = weekdaysByGroup[group] || [];
      item.historicoEntries.forEach(({ day, status }) => {
        const normalizedStatus = String(status || '').toLowerCase();
        if (!['c', 'f', 'j'].includes(normalizedStatus)) return;

        const parsed = parseHistoricoDayToDate(day, safeYear, safeMonthIndex);
        if (!parsed) return;
        const parsedKey = toDateKey(parsed);
        if (!plannedClassDaySet.has(parsedKey)) return;
        if (!weekdays.includes(parsed.getDay())) return;
        uniqueObservedDays.add(parsedKey);
      });
    });

    const activeWeekdays = new Set<number>();
    classSummaries.forEach((item) => {
      const group = getScheduleGroup(item.turma);
      (weekdaysByGroup[group] || []).forEach((wd) => activeWeekdays.add(wd));
    });
    const totalDiasAula = plannedClassDaysUntilCurrent.filter((dateKey) => {
      const d = new Date(`${dateKey}T00:00:00`);
      return activeWeekdays.has(d.getDay());
    }).length;
    const diasComAula = uniqueObservedDays.size;

    const byGroup = (groupBy: (item: ClassSummary) => string): SimpleData[] => {
      const map = new Map<string, { freqWeighted: number; total: number }>();
      classSummaries.forEach((item) => {
        const key = groupBy(item) || '-';
        const current = map.get(key) || { freqWeighted: 0, total: 0 };
        current.freqWeighted += item.frequencia * Math.max(1, item.total);
        current.total += Math.max(1, item.total);
        map.set(key, current);
      });
      return Array.from(map.entries()).map(([name, value]) => ({
        name,
        valor: value.total > 0 ? Number((value.freqWeighted / value.total).toFixed(1)) : 0,
      }));
    };

    const frequenciaPorNivel = byGroup((item) => item.nivel).sort((a, b) => a.name.localeCompare(b.name));
    const frequenciaPorHorario = byGroup((item) => item.horario).sort((a, b) => getHorarioSortValue(a.name) - getHorarioSortValue(b.name));
    const frequenciaPorPeriodo = byGroup((item) => getPeriodo(item.horario));
    const frequenciaPorProfessor = byGroup((item) => item.professor).sort((a, b) => a.name.localeCompare(b.name));

    const topFrequentes = [...studentsAggregated]
      .filter((item) => item.total > 0)
      .sort((a, b) => b.frequencia - a.frequencia)
      .slice(0, 5)
      .map((item) => ({ name: item.name, valor: item.frequencia }));

    const topAusentes = [...studentsAggregated]
      .sort((a, b) => b.faltas - a.faltas)
      .slice(0, 5)
      .map((item) => ({ name: item.name, valor: item.faltas }));

    const occurrenceClasses = classSummaries
      .filter((item) => getScheduleGroup(item.turma) === occurrenceGroup)
      .filter((item) => !occurrenceProfessor || item.professor === occurrenceProfessor);
    const occurrenceMap = new Map<string, { presente: number; ausente: number; justificado: number }>();
    occurrenceClasses.forEach((item) => {
      const current = occurrenceMap.get(item.horario) || { presente: 0, ausente: 0, justificado: 0 };
      current.presente += item.presentes;
      current.ausente += item.ausentes;
      current.justificado += item.justificados;
      occurrenceMap.set(item.horario, current);
    });
    const ocorrenciaPorTurma: ChartData[] = Array.from(occurrenceMap.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => getHorarioSortValue(a.name) - getHorarioSortValue(b.name));

    return {
      aulasDadas,
      totalAulas: sumExpected,
      diasComAula,
      totalDiasAula,
      ocorrenciaPorTurma,
      frequenciaPorNivel,
      frequenciaPorHorario,
      frequenciaPorPeriodo,
      frequenciaPorProfessor,
      topFrequentes,
      topAusentes,
    };
  }, [
    calendarEvents,
    calendarSettings,
    classSummaries,
    dateScope,
    studentsAggregated,
    selectedMonth,
    occurrenceGroup,
    occurrenceProfessor,
  ]);

  const yearOptions = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  const renderFrequencyBars = (data: SimpleData[], colorClass: string, suffix = '%') => {
    const maxValue = data.reduce((acc, item) => Math.max(acc, item.valor), 0);
    return (
      <div className="native-bars">
        {data.map((item) => {
          const width = maxValue > 0 ? (item.valor / maxValue) * 100 : 0;
          return (
            <div className="native-bar-row" key={`${colorClass}-${item.name}`}>
              <span className="native-label">{item.name}</span>
              <div className="native-bar-track">
                <div className={`native-bar-fill ${colorClass}`} style={{ width: `${width}%` }} />
              </div>
              <span className="native-value">{item.valor}{suffix}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderOccurrenceBars = (data: ChartData[]) => {
    const maxTotal = data.reduce((acc, item) => Math.max(acc, item.presente + item.ausente + item.justificado), 0);
    return (
      <div className="native-occurrence">
        {data.map((item) => {
          const total = item.presente + item.ausente + item.justificado;
          const presenteW = maxTotal > 0 ? (item.presente / maxTotal) * 100 : 0;
          const ausenteW = maxTotal > 0 ? (item.ausente / maxTotal) * 100 : 0;
          const justificadoW = maxTotal > 0 ? (item.justificado / maxTotal) * 100 : 0;
          return (
            <div className="native-occurrence-row" key={`occ-${item.name}`}>
              <div className="native-occurrence-top">
                <span>{item.name}</span>
                <span>{total}</span>
              </div>
              <div className="native-occurrence-track">
                <div className="native-occurrence-presente" style={{ width: `${presenteW}%` }}>
                  {item.presente > 0 && presenteW > 8 && <span className="occurrence-segment-label">{item.presente}</span>}
                </div>
                <div className="native-occurrence-ausente" style={{ width: `${ausenteW}%` }}>
                  {item.ausente > 0 && ausenteW > 8 && <span className="occurrence-segment-label">{item.ausente}</span>}
                </div>
                <div className="native-occurrence-justificado" style={{ width: `${justificadoW}%` }}>
                  {item.justificado > 0 && justificadoW > 8 && <span className="occurrence-segment-label">{item.justificado}</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div className="native-occurrence-legend">
          <span><i className="lg-presente" />Presente</span>
          <span><i className="lg-ausente" />Ausente</span>
          <span><i className="lg-justificado" />Justificado</span>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-charts-container">
      <div className="charts-filter-bar">
        <h3>📊 Indicadores de Frequência</h3>
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="chart-select">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="chart-select">
            {yearOptions.map((yearValue) => (
              <option key={yearValue} value={yearValue}>{yearValue}</option>
            ))}
          </select>
          <button
            type="button"
            className={`chart-scope-btn ${dateScope === 'ate-hoje' ? 'active' : ''}`}
            onClick={() => setDateScope((prev) => (prev === 'mensal' ? 'ate-hoje' : 'mensal'))}
          >
            {dateScope === 'mensal' ? 'Ver até hoje' : 'Ver mensal'}
          </button>
        </div>
      </div>

      {loading && <div className="dashboard-charts-status">Carregando indicadores...</div>}
      {!loading && !hasData && (
        <div className="dashboard-charts-status">Sem dados de relatórios para o mês selecionado.</div>
      )}

      {!loading && hasData && (
        <div className="charts-grid">
          <div className="chart-card indicators-card">
            <h4>Dias de aula</h4>
            <div className="indicator-value">{dashboardData.diasComAula} / {dashboardData.totalDiasAula}</div>
            <div className="indicator-bar">
              <div
                className="indicator-fill info"
                style={{ width: `${dashboardData.totalDiasAula > 0 ? Math.min(100, (dashboardData.diasComAula / dashboardData.totalDiasAula) * 100) : 0}%` }}
              />
            </div>
            <div className="indicator-percent">
              {dashboardData.totalDiasAula > 0 ? Math.round((dashboardData.diasComAula / dashboardData.totalDiasAula) * 100) : 0}%
            </div>
          </div>

          <div className="chart-card indicators-card">
            <h4>Aulas dadas</h4>
            <div className="indicator-value">{dashboardData.aulasDadas} / {dashboardData.totalAulas}</div>
            <div className="indicator-bar">
              <div
                className="indicator-fill"
                style={{ width: `${dashboardData.totalAulas > 0 ? Math.min(100, (dashboardData.aulasDadas / dashboardData.totalAulas) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="chart-card full-width occurrence-card">
            <h4>Registros por turma</h4>
            <div className="occurrence-controls">
              <div className="occurrence-chips">
                <button
                  type="button"
                  className={`occurrence-chip ${occurrenceGroup === 'terca-quinta' ? 'active' : ''}`}
                  onClick={() => setOccurrenceGroup('terca-quinta')}
                >
                  Terça e Quinta
                </button>
                <button
                  type="button"
                  className={`occurrence-chip ${occurrenceGroup === 'quarta-sexta' ? 'active' : ''}`}
                  onClick={() => setOccurrenceGroup('quarta-sexta')}
                >
                  Quarta e Sexta
                </button>
              </div>
              <div className="occurrence-radios">
                {occurrenceProfessors.map((professor) => (
                  <label key={professor}>
                    <input
                      type="radio"
                      name="occurrence-professor"
                      checked={occurrenceProfessor === professor}
                      onChange={() => setOccurrenceProfessor(professor)}
                    />
                    {professor}
                  </label>
                ))}
              </div>
            </div>
            {renderOccurrenceBars(dashboardData.ocorrenciaPorTurma)}
            <div className="occurrence-axis-label">Horários das turmas</div>
          </div>

          <div className="chart-card">
            <h4>Frequência por Nível</h4>
            {renderFrequencyBars(dashboardData.frequenciaPorNivel, 'bar-primary')}
          </div>

          <div className="chart-card">
            <h4>Frequência por Horário</h4>
            {renderFrequencyBars(dashboardData.frequenciaPorHorario, 'bar-info')}
          </div>

          <div className="chart-card">
            <h4>Frequência por Período</h4>
            {renderFrequencyBars(dashboardData.frequenciaPorPeriodo, 'bar-periodo')}
          </div>

          <div className="chart-card">
            <h4>Frequência por Professor</h4>
            {renderFrequencyBars(dashboardData.frequenciaPorProfessor, 'bar-professor')}
          </div>

          <div className="chart-card">
            <h4>Top 5 alunos mais frequentes</h4>
            {renderFrequencyBars(dashboardData.topFrequentes, 'bar-presente')}
          </div>

          <div className="chart-card">
            <h4>Top 5 alunos mais ausentes</h4>
            {renderFrequencyBars(dashboardData.topAusentes, 'bar-ausente', '')}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardCharts;