import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './DashboardCharts.css';

// Interfaces para tipagem dos dados (Mock - substituir por chamadas reais à API)
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

const DashboardCharts: React.FC = () => {
  // Filtros
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  
  // Estados para os dados dos gráficos
  const [classData, setClassData] = useState<ChartData[]>([]);
  const [levelData, setLevelData] = useState<ChartData[]>([]);
  const [timeData, setTimeData] = useState<SimpleData[]>([]);
  const [teacherData, setTeacherData] = useState<ChartData[]>([]);
  const [studentData, setStudentData] = useState<SimpleData[]>([]);

  // Cores do tema
  const COLORS = {
    presente: '#28a745',
    ausente: '#dc3545',
    justificado: '#ffc107',
    primary: '#007bff',
    info: '#17a2b8'
  };

  useEffect(() => {
    // TODO: Conectar com endpoints reais da API (ex: api.getDashboardData(year, month))
    // Simulando dados baseados nos filtros para demonstração
    
    const mockClassData = [
      { name: 'Turma A', presente: 45, ausente: 2, justificado: 1 },
      { name: 'Turma B', presente: 38, ausente: 5, justificado: 3 },
      { name: 'Turma C', presente: 42, ausente: 1, justificado: 0 },
      { name: 'Turma D', presente: 30, ausente: 8, justificado: 2 },
    ];

    const mockLevelData = [
      { name: 'Iniciante', presente: 120, ausente: 15, justificado: 5 },
      { name: 'Intermediário', presente: 80, ausente: 8, justificado: 4 },
      { name: 'Avançado', presente: 40, ausente: 2, justificado: 1 },
    ];

    const mockTimeData = [
      { name: '08:00', valor: 85 },
      { name: '10:00', valor: 92 },
      { name: '14:00', valor: 78 },
      { name: '18:00', valor: 88 },
      { name: '20:00', valor: 65 },
    ];

    const mockTeacherData = [
      { name: 'Prof. Silva', presente: 150, ausente: 10, justificado: 5 },
      { name: 'Prof. Santos', presente: 140, ausente: 12, justificado: 8 },
    ];

    const mockStudentData = [
      { name: 'João Silva', valor: 100 },
      { name: 'Maria Oliveira', valor: 95 },
      { name: 'Pedro Santos', valor: 92 },
      { name: 'Ana Costa', valor: 90 },
      { name: 'Lucas Pereira', valor: 88 },
    ];

    setClassData(mockClassData);
    setLevelData(mockLevelData);
    setTimeData(mockTimeData);
    setTeacherData(mockTeacherData);
    setStudentData(mockStudentData);

  }, [year, month]);

  return (
    <div className="dashboard-charts-container">
      <div className="charts-filter-bar">
        <h3>📊 Indicadores de Frequência</h3>
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="chart-select">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="chart-select">
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </div>
      </div>

      <div className="charts-grid">
        {/* Gráfico por Turma */}
        <div className="chart-card full-width">
          <h4>Frequência por Turma</h4>
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
          <h4>Presença por Nível</h4>
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
          <h4>Média de Presença por Horário (%)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="valor" fill={COLORS.info} name="Presença %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico por Professor */}
        <div className="chart-card">
          <h4>Presença por Professor</h4>
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
          <h4>Top 5 Alunos Mais Assíduos (%)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={studentData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Bar dataKey="valor" fill={COLORS.primary} name="Frequência %" barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;