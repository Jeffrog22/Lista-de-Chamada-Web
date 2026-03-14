import { test, expect } from '@playwright/test';

const attendanceClass = {
  Grupo: 'SMK-A',
  Turma: 'Terça e Quinta',
  TurmaCodigo: 'SMK-A',
  Horario: '18:30',
  Professor: 'Professor Smoke',
  Nivel: 'Iniciante',
};

const activeStudent = {
  id: 'smoke-1',
  studentUid: 'uid-smoke-1',
  nome: 'Aluno Smoke',
  turma: 'Terça e Quinta',
  turmaLabel: 'Terça e Quinta',
  turmaCodigo: 'SMK-A',
  grupo: 'SMK-A',
  horario: '18:30',
  professor: 'Professor Smoke',
  nivel: 'Iniciante',
  categoria: 'Juvenil',
  dataNascimento: '01/01/2012',
  genero: 'Masculino',
  parQ: 'Não',
  atestado: false,
  whatsapp: '',
};

const excludedStudent = {
  ...activeStudent,
  dataExclusao: '14/03/2026',
  motivo_exclusao: 'Falta',
};

const reportPayload = [
  {
    turma: 'Terça e Quinta',
    horario: '18:30',
    professor: 'Professor Smoke',
    nivel: 'Iniciante',
    hasLog: true,
    alunos: [
      {
        id: 'smoke-1',
        student_uid: 'uid-smoke-1',
        nome: 'Aluno Smoke',
        presencas: 3,
        faltas: 1,
        justificativas: 0,
        frequencia: 75,
        historico: { '03': 'c', '05': 'f', '10': 'c', '12': 'c' },
      },
    ],
  },
  {
    turma: 'Quarta e Sexta',
    horario: '19:15',
    professor: 'Professor Outro',
    nivel: 'Intermediário',
    hasLog: false,
    alunos: [],
  },
];

const bootstrapPayload = {
  classes: [
    {
      id: 1,
      grupo: 'SMK-A',
      codigo: 'SMK-A',
      turma_label: 'Terça e Quinta',
      horario: '18:30',
      professor: 'Professor Smoke',
      nivel: 'Iniciante',
      capacidade: 20,
    },
    {
      id: 2,
      grupo: 'SMK-B',
      codigo: 'SMK-B',
      turma_label: 'Quarta e Sexta',
      horario: '19:15',
      professor: 'Professor Outro',
      nivel: 'Intermediário',
      capacidade: 20,
    },
  ],
  students: [
    {
      id: 1,
      class_id: 1,
      nome: 'Aluno Smoke',
      whatsapp: '',
      data_nascimento: '2012-01-01',
      data_atestado: '',
      categoria: 'Juvenil',
      genero: 'Masculino',
      parq: 'Não',
      atestado: false,
    },
  ],
};

const calendarPayload = {
  settings: {
    schoolYear: 2026,
    inicioAulas: '2026-01-01',
    feriasInvernoInicio: '2026-07-01',
    feriasInvernoFim: '2026-07-31',
    terminoAulas: '2026-12-31',
  },
  events: [],
  bankHours: [],
};

const installRoutes = async (page) => {
  await page.route('**/reports?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reportPayload) });
  });
  await page.route('**/academic-calendar?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calendarPayload) });
  });
  await page.route('**/planning-files', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/bootstrap', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bootstrapPayload) });
  });
  await page.route('**/reports/excel-file', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: 'fake-xlsx',
    });
  });
  await page.route('**/maintenance/clear-transfer-overrides', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/maintenance/diagnostics', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"attendance":0,"classes":0,"students":0}' });
  });
  await page.route('**/api/import-data/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/exclusions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([excludedStudent]) });
  });
};

test.setTimeout(120000);

test('smoke flow: attendance -> exclusions -> reports', async ({ page }) => {
  await page.addInitScript(({ cls, active, excluded }) => {
    localStorage.setItem('access_token', 'local-session');
    localStorage.setItem('activeClasses', JSON.stringify([cls]));
    localStorage.setItem('activeStudents', JSON.stringify([active]));
    localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
  }, { cls: attendanceClass, active: activeStudent, excluded: excludedStudent });

  await installRoutes(page);

  await page.goto('http://localhost:5173/#attendance', { timeout: 30000 });
  const selects = page.locator('select');
  await expect(selects.first()).toBeVisible({ timeout: 10000 });
  await selects.nth(0).selectOption({ index: 0 });
  await page.waitForTimeout(200);
  await selects.nth(1).selectOption({ index: 0 });
  await page.waitForTimeout(200);
  await selects.nth(2).selectOption({ index: 0 });
  await expect(page.locator('table thead')).toBeVisible({ timeout: 10000 });

  await page.goto('http://localhost:5173/#exclusions', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Alunos Excluídos' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Aluno Smoke')).toBeVisible({ timeout: 10000 });

  await page.goto('http://localhost:5173/#reports', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Relatórios e Análises' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Frequência e Planejamento/ }).click();

  const turmaSelect = page.locator('select').filter({ has: page.locator('option[value="Terça e Quinta"]') }).first();
  await turmaSelect.selectOption('Terça e Quinta');
  await expect(turmaSelect).toHaveValue('Terça e Quinta');

  const toggle = page.locator('.reports-select-toggle-chip');
  await expect(toggle).toBeVisible();
  const label = (await toggle.textContent()) || '';
  if (label.includes('Selecionar')) {
    await toggle.click();
  }

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar chamada (.xlsx)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('Relatorio_Multiturmas_');
});
