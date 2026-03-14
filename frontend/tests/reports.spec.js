import { test, expect } from '@playwright/test';

const reportPayload = [
  {
    turma: 'Terça e Quinta',
    horario: '18:30',
    professor: 'Professor A',
    nivel: 'Iniciante',
    hasLog: true,
    alunos: [
      {
        id: '1',
        student_uid: 'uid-report-1',
        nome: 'Aluno Relatório A',
        presencas: 4,
        faltas: 1,
        justificativas: 0,
        frequencia: 80,
        historico: { '03': 'c', '05': 'f', '10': 'c', '12': 'c', '17': 'c' },
      },
    ],
  },
  {
    turma: 'Terça e Quinta',
    horario: '19:30',
    professor: 'Professor B',
    nivel: 'Intermediário',
    hasLog: true,
    alunos: [
      {
        id: '2',
        student_uid: 'uid-report-2',
        nome: 'Aluno Relatório B',
        presencas: 3,
        faltas: 0,
        justificativas: 1,
        frequencia: 100,
        historico: { '03': 'c', '05': 'j', '10': 'c', '12': 'c' },
      },
    ],
  },
  {
    turma: 'Quarta e Sexta',
    horario: '18:45',
    professor: 'Professor C',
    nivel: 'Avançado',
    hasLog: false,
    alunos: [
      {
        id: '3',
        student_uid: 'uid-report-3',
        nome: 'Aluno Relatório C',
        presencas: 0,
        faltas: 0,
        justificativas: 0,
        frequencia: 0,
        historico: {},
      },
    ],
  },
];

const bootstrapPayload = {
  classes: [
    {
      id: 1,
      grupo: 'INF-A',
      codigo: 'INF-A',
      turma_label: 'Terça e Quinta',
      horario: '18:30',
      professor: 'Professor A',
      nivel: 'Iniciante',
      capacidade: 20,
    },
    {
      id: 2,
      grupo: 'INF-B',
      codigo: 'INF-B',
      turma_label: 'Terça e Quinta',
      horario: '19:30',
      professor: 'Professor B',
      nivel: 'Intermediário',
      capacidade: 20,
    },
    {
      id: 3,
      grupo: 'AV-C',
      codigo: 'AV-C',
      turma_label: 'Quarta e Sexta',
      horario: '18:45',
      professor: 'Professor C',
      nivel: 'Avançado',
      capacidade: 20,
    },
  ],
  students: [
    {
      id: 1,
      class_id: 1,
      nome: 'Aluno Relatório A',
      whatsapp: '',
      data_nascimento: '2012-01-01',
      data_atestado: '',
      categoria: 'Juvenil',
      genero: 'Masculino',
      parq: 'Não',
      atestado: false,
    },
    {
      id: 2,
      class_id: 2,
      nome: 'Aluno Relatório B',
      whatsapp: '',
      data_nascimento: '2011-01-01',
      data_atestado: '',
      categoria: 'Juvenil',
      genero: 'Feminino',
      parq: 'Não',
      atestado: false,
    },
    {
      id: 3,
      class_id: 3,
      nome: 'Aluno Relatório C',
      whatsapp: '',
      data_nascimento: '2010-01-01',
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

const installAppRoutes = async (page, capture = {}, overrides = {}) => {
  const reportsBody = overrides.reportPayload || reportPayload;
  const bootstrapBody = overrides.bootstrapPayload || bootstrapPayload;

  await page.route('**/reports/excel-file', async (route) => {
    capture.excel = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: 'fake-xlsx',
    });
  });

  await page.route('**/reports/chamada-pdf-file', async (route) => {
    capture.pdf = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: 'fake-pdf',
    });
  });

  await page.route('**/reports/statistics', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/reports?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reportsBody),
    });
  });

  await page.route('**/academic-calendar?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(calendarPayload),
    });
  });

  await page.route('**/planning-files', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/bootstrap', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bootstrapBody),
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
};

test.setTimeout(120000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'local-session');
  });
});

test('reports frequency tab filters classes and toggles export selection', async ({ page }) => {
  await installAppRoutes(page);

  await page.goto('http://localhost:5173/#reports', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Relatórios e Análises' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /Frequência e Planejamento/ }).click();

  const turmaSelect = page.locator('select').filter({ has: page.locator('option[value="Terça e Quinta"]') }).first();
  await turmaSelect.selectOption('Terça e Quinta');
  await expect(turmaSelect).toHaveValue('Terça e Quinta');

  const allProfessors = page.getByRole('button', { name: 'Todos' });
  await allProfessors.click();

  const gridRows = page.locator('.reports-class-grid-row');
  await expect(gridRows).toHaveCount(2);
  await expect(page.getByText('18:30')).toBeVisible();
  await expect(page.getByText('19:30')).toBeVisible();

  await page.getByRole('button', { name: 'Professor A' }).click();
  await expect(gridRows).toHaveCount(1);
  await expect(page.getByText('18:30')).toBeVisible();
  await expect(page.getByText('Intermediário')).not.toBeVisible();

  const selectToggleButton = page.locator('.reports-select-toggle-chip');
  await expect(selectToggleButton).toBeVisible();
  const toggleLabel = (await selectToggleButton.textContent()) || '';
  if (toggleLabel.includes('Selecionar')) {
    await selectToggleButton.click();
  }

  const excelButton = page.getByRole('button', { name: 'Exportar chamada (.xlsx)' });
  const pdfButton = page.getByRole('button', { name: 'Exportar chamada.pdf' });
  await expect(excelButton).toBeEnabled();
  await expect(pdfButton).toBeEnabled();
});

test('reports exports send normalized selected class payload', async ({ page }) => {
  const capture = {};
  await installAppRoutes(page, capture);

  await page.goto('http://localhost:5173/#reports', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Relatórios e Análises' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /Frequência e Planejamento/ }).click();
  const turmaSelect = page.locator('select').filter({ has: page.locator('option[value="Terça e Quinta"]') }).first();
  await turmaSelect.selectOption('Terça e Quinta');
  await expect(turmaSelect).toHaveValue('Terça e Quinta');
  await page.getByRole('button', { name: 'Todos' }).click();

  const selectToggleButton = page.locator('.reports-select-toggle-chip');
  await expect(selectToggleButton).toBeVisible();
  const toggleLabel = (await selectToggleButton.textContent()) || '';
  if (toggleLabel.includes('Selecionar')) {
    await selectToggleButton.click();
  }

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar chamada (.xlsx)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('Relatorio_Multiturmas_');

  expect(capture.excel).toBeTruthy();
  expect(capture.excel.month).toMatch(/^\d{4}-\d{2}$/);
  expect(capture.excel.classes).toEqual([
    { turma: 'Terça e Quinta', horario: '18:30', professor: 'Professor A' },
    { turma: 'Terça e Quinta', horario: '19:30', professor: 'Professor B' },
  ]);
});

test('reports summary uses bootstrap dias_semana fallback to avoid zero KPIs', async ({ page }) => {
  const fallbackReportPayload = [
    {
      turma: 'INF-A',
      horario: '18:30',
      professor: 'Professor A',
      nivel: 'Iniciante',
      hasLog: true,
      alunos: [
        {
          id: '1',
          student_uid: 'uid-fallback-1',
          nome: 'Aluno Fallback A',
          presencas: 3,
          faltas: 0,
          justificativas: 0,
          frequencia: 100,
          historico: { '03': 'c', '05': 'c', '10': 'c' },
        },
      ],
    },
  ];

  const fallbackBootstrapPayload = {
    classes: [
      {
        id: 1,
        grupo: 'INF-A',
        codigo: 'INF-A',
        turma_label: 'INF-A',
        horario: '18:30',
        professor: 'Professor A',
        nivel: 'Iniciante',
        capacidade: 20,
        dias_semana: 'terça,quinta',
      },
    ],
    students: [
      {
        id: 1,
        class_id: 1,
        nome: 'Aluno Fallback A',
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

  await installAppRoutes(page, {}, {
    reportPayload: fallbackReportPayload,
    bootstrapPayload: fallbackBootstrapPayload,
  });

  await page.goto('http://localhost:5173/#reports', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Relatórios e Análises' })).toBeVisible({ timeout: 10000 });

  const aproveitamentoCard = page.locator('.report-card').filter({ has: page.getByRole('heading', { name: 'Aproveitamento das aulas dadas' }) }).first();
  const aproveitamentoValue = (await aproveitamentoCard.locator('strong').first().innerText()).replace('%', '').trim();
  expect(Number(aproveitamentoValue)).toBeGreaterThan(0);

  await aproveitamentoCard.getByRole('button', { name: 'Detalhes' }).click();

  const aulasCard = page.locator('.report-card').filter({ has: page.getByRole('heading', { name: 'Aulas registradas x previstas' }) }).first();
  const ratioText = (await aulasCard.locator('.reports-kpi-line span').first().innerText()).trim();
  const [registradasRaw, previstasRaw] = ratioText.split('/');
  const registradas = Number(registradasRaw);
  const previstas = Number(previstasRaw);

  expect(Number.isFinite(registradas)).toBeTruthy();
  expect(Number.isFinite(previstas)).toBeTruthy();
  expect(registradas).toBeGreaterThan(0);
  expect(previstas).toBeGreaterThan(0);
});
