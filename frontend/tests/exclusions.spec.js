import { test, expect } from '@playwright/test';

// Dados compartilhados entre os testes deste arquivo
const STUDENT = {
  id: 'excl-e2e-1',
  studentUid: 'uid-excl-e2e-1',
  nome: 'Aluno Exclusão E2E',
  turma: 'Terça e Quinta',
  turmaLabel: 'Terça e Quinta',
  turmaCodigo: 'INF-A',
  grupo: 'INF-A',
  horario: '18:30',
  professor: 'Professor Teste',
  nivel: 'Iniciante',
  categoria: 'Juvenil',
  dataNascimento: '01/01/2012',
  genero: 'Masculino',
  parQ: 'Não',
  atestado: false,
  whatsapp: '',
};

const EXCLUDED_STUDENT = {
  ...STUDENT,
  dataExclusao: '14/03/2026',
  motivo_exclusao: '',
};

const CLASS = {
  Grupo: 'INF-A',
  Turma: 'Terça e Quinta',
  TurmaCodigo: 'INF-A',
  Horario: '18:30',
  Professor: 'Professor Teste',
  Nivel: 'Iniciante',
};

test.setTimeout(60000);

// ─── Cenário 1: Lista de excluídos é exibida corretamente ──────────────────────
test('exclusions page shows excluded student', async ({ page }) => {
  await page.addInitScript(
    ({ excluded, classes }) => {
      localStorage.setItem('access_token', 'local-session');
      localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
      localStorage.setItem('activeClasses', JSON.stringify([classes]));
      localStorage.setItem('activeStudents', JSON.stringify([]));
    },
    { excluded: EXCLUDED_STUDENT, classes: CLASS }
  );

  await page.goto('http://localhost:5173/#exclusions', { timeout: 30000 });

  // aguarda o nome do aluno aparecer na tabela
  await expect(page.getByText('Aluno Exclusão E2E')).toBeVisible({ timeout: 10000 });

  // total count deve mostrar 1
  await expect(page.getByText(/Total.*1/)).toBeVisible({ timeout: 5000 });
});

// ─── Cenário 2: Motivo de exclusão pode ser alterado na linha ─────────────────
test('exclusions page - changing reason updates the select', async ({ page }) => {
  await page.addInitScript(
    ({ excluded, classes }) => {
      localStorage.setItem('access_token', 'local-session');
      localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
      localStorage.setItem('activeClasses', JSON.stringify([classes]));
      localStorage.setItem('activeStudents', JSON.stringify([]));
    },
    { excluded: EXCLUDED_STUDENT, classes: CLASS }
  );

  // intercept POST /exclusions so the reason-update flow completes without a live backend
  await page.route('**/exclusions', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    } else {
      await route.continue();
    }
  });

  await page.goto('http://localhost:5173/#exclusions', { timeout: 30000 });

  // aguarda linha
  await expect(page.getByText('Aluno Exclusão E2E')).toBeVisible({ timeout: 10000 });

  // seleciona o dropdown de motivo na primeira linha de dados
  // use the combobox inside main to avoid picking the quick-teacher-select in the header
  const reasonSelect = page.locator('main combobox, main select').first();
  await expect(reasonSelect).toBeVisible({ timeout: 5000 });

  await reasonSelect.selectOption('Desistência');
  await expect(reasonSelect).toHaveValue('Desistência');

  // wait for the async persist (POST /exclusions) to complete and setStudents to fire
  await page.waitForTimeout(500);

  // confirma que o localStorage foi atualizado pelo handler onChange
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('excludedStudents');
    if (!raw) return null;
    return JSON.parse(raw);
  });
  const record = stored[0];
  expect(record.motivo_exclusao === 'Desistência' || record.MotivoExclusao === 'Desistência').toBeTruthy();
});

// ─── Cenário 3: Botão Restaurar abre modal com dados pré-preenchidos ──────────
test('exclusions page - restore button opens modal with pre-filled data', async ({ page }) => {
  await page.addInitScript(
    ({ excluded, classes }) => {
      localStorage.setItem('access_token', 'local-session');
      localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
      localStorage.setItem('activeClasses', JSON.stringify([classes]));
      localStorage.setItem('activeStudents', JSON.stringify([]));
    },
    { excluded: EXCLUDED_STUDENT, classes: CLASS }
  );

  await page.goto('http://localhost:5173/#exclusions', { timeout: 30000 });
  await expect(page.getByText('Aluno Exclusão E2E')).toBeVisible({ timeout: 10000 });

  // clica em Restaurar
  await page.getByRole('button', { name: 'Restaurar' }).first().click();

  // modal deve abrir com título "Restaurar Aluno"
  await expect(page.getByRole('heading', { name: 'Restaurar Aluno' })).toBeVisible({ timeout: 5000 });

  // campo nome deve conter o nome do aluno
  const nomeInput = page.locator('input[name="nome"]');
  await expect(nomeInput).toHaveValue('Aluno Exclusão E2E');
});

// ─── Cenário 4: Restaurar move aluno de volta para activeStudents ─────────────
test('exclusions page - confirming restore removes student from excluded list', async ({ page }) => {
  await page.addInitScript(
    ({ excluded, classes }) => {
      localStorage.setItem('access_token', 'local-session');
      localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
      localStorage.setItem('activeClasses', JSON.stringify([classes]));
      localStorage.setItem('activeStudents', JSON.stringify([]));
    },
    { excluded: EXCLUDED_STUDENT, classes: CLASS }
  );

  // intercept backend call to avoid network dependency
  await page.route('**/exclusions/restore', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );

  await page.goto('http://localhost:5173/#exclusions', { timeout: 30000 });
  await expect(page.getByText('Aluno Exclusão E2E')).toBeVisible({ timeout: 10000 });

  // abre modal de restauração
  await page.getByRole('button', { name: 'Restaurar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Restaurar Aluno' })).toBeVisible({ timeout: 5000 });

  // aceita o dialog de alerta que aparece após a confirmação
  page.on('dialog', (dialog) => dialog.accept());

  // clica em confirmar restauração (botão dentro do modal)
  await page.getByRole('button', { name: 'Confirmar Restauração' }).click();

  // modal deve fechar e lista deve ficar vazia
  await expect(page.getByRole('heading', { name: 'Restaurar Aluno' })).not.toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/Total.*0/)).toBeVisible({ timeout: 5000 });
});

// ─── Cenário 5: Excluído pelo Students não aparece na lista ativa ─────────────
test('students page - excluded student is filtered out from active list', async ({ page }) => {
  await page.addInitScript(
    ({ student, excluded, classes }) => {
      localStorage.setItem('access_token', 'local-session');
      localStorage.setItem('activeStudents', JSON.stringify([student]));
      localStorage.setItem('excludedStudents', JSON.stringify([excluded]));
      localStorage.setItem('activeClasses', JSON.stringify([classes]));
    },
    { student: STUDENT, excluded: EXCLUDED_STUDENT, classes: CLASS }
  );

  await page.goto('http://localhost:5173/#students', { timeout: 30000 });

  // aguarda a tela de alunos carregar (título ou botão "Novo Aluno")
  await expect(page.getByText(/aluno/i).first()).toBeVisible({ timeout: 10000 });

  // aluno excluído NÃO deve aparecer na lista ativa (a linha com o nome dele deve ser ausente)
  await expect(page.getByText('Aluno Exclusão E2E')).not.toBeVisible({ timeout: 5000 });
});
