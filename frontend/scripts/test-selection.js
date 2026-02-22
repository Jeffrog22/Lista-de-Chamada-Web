async function fetchJson(url) {
  const res = await fetch(url).catch(err => { console.error('fetch error', url, err); process.exit(1); });
  if (!res.ok) { console.error('bad response', url, res.status); process.exit(1); }
  return res.json();
}

function normalizeText(v){ return String(v||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[\u0300-\u036f]/g,'').trim(); }
function normalizeHorarioDigits(value){ const digits = String(value||'').replace(/\D/g,''); if(digits.length===3) return '0'+digits; if(digits.length>=4) return digits.slice(0,4); return digits; }

(async function(){
  const API = process.env.API_URL || 'http://localhost:8000';
  console.log('Using API:', API);
  const classes = await fetchJson(`${API}/classes`);
  const students = await fetchJson(`${API}/students`);
  console.log('classes:', classes.length, 'students:', students.length);

  // choose a sample class to test
  if (classes.length===0){ console.log('no classes'); process.exit(0); }
  const sample = classes[0];
  const turmaLabel = sample.turma_label || sample.nome || sample.codigo || sample.nome || '';
  const horario = sample.horario || '';
  const professor = sample.professor || sample.instrutor || '';
  console.log('Sample class -> turma:', turmaLabel, 'horario:', horario, 'professor:', professor);

  // filtering logic similar to Attendance/Students
  const turmaRef = normalizeText(turmaLabel||sample.codigo||sample.nome||'');
  const horarioRef = normalizeHorarioDigits(horario||'');
  const professorRef = normalizeText(professor||'');

  const matched = students.filter(s=>{
    try{
      const studentTurma = normalizeText(s.turma || s.turmaCodigo || s.class_id || '');
      const studentHorario = normalizeHorarioDigits(s.horario||'');
      const studentProfessor = normalizeText(s.professor || s.instrutor || '');
      const turmaMatches = !turmaRef || studentTurma===turmaRef;
      const horarioMatches = !horarioRef || !studentHorario || studentHorario===horarioRef;
      const professorMatches = !professorRef || !studentProfessor || studentProfessor===professorRef;
      return turmaMatches && horarioMatches && professorMatches;
    }catch(e){return false}
  });

  console.log('Matched students:', matched.length);
  matched.slice(0,20).forEach((m,i)=> console.log(i+1, m.nome || m.nome_aluno || m.id));
})();
