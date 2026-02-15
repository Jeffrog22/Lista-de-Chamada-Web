import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { getReports } from '../api';
import './DashboardCharts.css';

interface ReportStudent {
  id: string;
  nome: string;
  presencas: number;
  faltas: number;
  justificativas: number;
  frequencia: number;
}

interface ReportClass {
  turma: string;
  horario: string;
  professor: string;
  nivel: string;
  alunos: ReportStudent[];
}

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

const DashboardCharts: React.FC = () => {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));

  const [classData, setClassData] = useState<ChartData[]>([]);
  const [levelData, setLevelData] = useState<ChartData[]>([]);
  const [timeData, setTimeData] = useState<SimpleData[]>([]);
  const [teacherData, setTeacherData] = useState<ChartData[]>([]);
  const [studentData, setStudentData] = useState<SimpleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(true);

  const COLORS = {
    presente: '#28a745',
    ausente: '#dc3545',
    justificado: '#ffc107',
    primary: '#007bff',
    info: '#17a2b8'
  };

  const selectedMonth = `${year}-${month}`;

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getReports({ month: selectedMonth })
      .then((response) => {
        if (!isMounted) return;
        const data = Array.isArray(response.data) ? (response.data as ReportClass[]) : [];
        setHasData(data.length > 0);

        const classAggregated: ChartData[] = data.map((classItem) => {
          const presente = classItem.alunos.reduce((acc, student) => acc + (student.presencas || 0), 0);
          const ausente = classItem.alunos.reduce((acc, student) => acc + (student.faltas || 0), 0);
          const justificado = classItem.alunos.reduce((acc, student) => acc + (student.justificativas || 0), 0);
          return {
            name: classItem.turma || '-',
            presente,
            ausente,
            justificado,
          };
        });

        const levelMap = new Map<string, { presente: number; ausente: number; justificado: number }>();
        const teacherMap = new Map<string, { presente: number; ausente: number; justificado: number }>();
        const timeMap = new Map<string, { presentes: number; totais: number }>();
        const studentsFlat: SimpleData[] = [];

        data.forEach((classItem) => {
          const levelKey = classItem.nivel || '-';
          const teacherKey = classItem.professor || '-';
          const timeKey = classItem.horario ? formatHorario(classItem.horario) : '-';

          const presentes = classItem.alunos.reduce((acc, student) => acc + (student.presencas || 0), 0);
          const ausentes = classItem.alunos.reduce((acc, student) => acc + (student.faltas || 0), 0);
          const justificados = classItem.alunos.reduce((acc, student) => acc + (student.justificativas || 0), 0);
          const total = presentes + ausentes + justificados;

          const levelCurrent = levelMap.get(levelKey) || { presente: 0, ausente: 0, justificado: 0 };
          levelMap.set(levelKey, {
            presente: levelCurrent.presente + presentes,
            ausente: levelCurrent.ausente + ausentes,
            justificado: levelCurrent.justificado + justificados,
          });

          const teacherCurrent = teacherMap.get(teacherKey) || { presente: 0, ausente: 0, justificado: 0 };
          teacherMap.set(teacherKey, {
            presente: teacherCurrent.presente + presentes,
            ausente: teacherCurrent.ausente + ausentes,
            justificado: teacherCurrent.justificado + justificados,
          });

          const timeCurrent = timeMap.get(timeKey) || { presentes: 0, totais: 0 };
          timeMap.set(timeKey, {
            presentes: timeCurrent.presentes + presentes + justificados,
            totais: timeCurrent.totais + total,
          });

          classItem.alunos.forEach((student) => {
            const stTotal = (student.presencas || 0) + (student.faltas || 0) + (student.justificativas || 0);
            const freq = stTotal > 0 ? ((student.presencas + student.justificativas) / stTotal) * 100 : 0;
            studentsFlat.push({ name: student.nome, valor: Number(freq.toFixed(1)) });
          });
        });

        const levelAggregated: ChartData[] = Array.from(levelMap.entries()).map(([name, value]) => ({
          name,
          presente: value.presente,
          ausente: value.ausente,
          justificado: value.justificado,
        }));

        const teacherAggregated: ChartData[] = Array.from(teacherMap.entries()).map(([name, value]) => ({
          name,
          presente: value.presente,
          ausente: value.ausente,
          justificado: value.justificado,
        }));

        const timeAggregated: SimpleData[] = Array.from(timeMap.entries())
          .map(([name, value]) => ({
            name,
            valor: value.totais > 0 ? Number(((value.presentes / value.totais) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => getHorarioSortValue(a.name) - getHorarioSortValue(b.name));

        const topStudents: SimpleData[] = studentsFlat
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5);

        setClassData(classAggregated);
        setLevelData(levelAggregated);
        setTimeData(timeAggregated);
        setTeacherData(teacherAggregated);
        setStudentData(topStudents);
      })
      .catch(() => {
        if (!isMounted) return;
        setHasData(false);
        setClassData([]);
        setLevelData([]);
        setTimeData([]);
        setTeacherData([]);
        setStudentData([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

  const yearOptions = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - 2 + i));

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
        </div>
      </div>

      {loading && <div className="dashboard-charts-status">Carregando indicadores...</div>}
      {!loading && !hasData && (
        <div className="dashboard-charts-status">Sem dados de relatórios para o mês selecionado.</div>
      )}

      <div className="charts-grid">
        {/* Gráfico por Turma */}
        <div className="chart-card full-width">
          <h4>Ocorrências por Turma (Presente, Ausente, Justificado)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={classData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="presente" fill={COLORS.presente} name="Presente" />
              <Bar dataKey="ausente" fill={COLORS.ausente} name="Ausente" />
              <Bar dataKey="justificado" fill={COLORS.justificado} name="Justificado" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico por Nível */}
        <div className="chart-card">
          <h4>Ocorrências por Nível</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={levelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="presente" fill={COLORS.presente} stackId="a" name="Presente" />
              <Bar dataKey="ausente" fill={COLORS.ausente} stackId="a" name="Ausente" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico por Horário */}
        <div className="chart-card">
          <h4>Média de Frequência por Horário (%)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tickFormatter={(value) => formatHorario(String(value || ''))} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="valor" fill={COLORS.info} name="Frequência % (Presença + Justificada)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico por Professor */}
        <div className="chart-card">
          <h4>Ocorrências por Professor</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={teacherData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip />
              <Legend />
              <Bar dataKey="presente" fill={COLORS.presente} stackId="a" name="Presente" />
              <Bar dataKey="ausente" fill={COLORS.ausente} stackId="a" name="Ausente" />
              <Bar dataKey="justificado" fill={COLORS.justificado} stackId="a" name="Justificado" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Alunos */}
        <div className="chart-card full-width">
          <h4>Top 5 Alunos por Frequência (%)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={studentData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Bar dataKey="valor" fill={COLORS.primary} name="Frequência % (Presença + Justificada)" barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;