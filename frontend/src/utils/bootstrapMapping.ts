type ForcedAssignment = {
  turmaCodigo: string;
  horario: string;
  professor: string;
};

const normalizeName = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeHorarioDigits = (value: string) => String(value || "").replace(/\D/g, "").slice(0, 4);

const deriveCategoriaFromAge = (age: number) => {
  if (!Number.isFinite(age) || age < 6) return "";
  if (age >= 65) return "K70+";
  if (age >= 60) return "J65+";
  if (age >= 55) return "I60+";
  if (age >= 50) return "H55+";
  if (age >= 45) return "G50+";
  if (age >= 40) return "F45+";
  if (age >= 35) return "E40+";
  if (age >= 30) return "D35+";
  if (age >= 25) return "C30+";
  if (age >= 20) return "B25+";
  if (age >= 18) return "Júnior II/Sênior";
  if (age >= 17) return "Júnior I";
  if (age >= 16) return "Juvenil II";
  if (age >= 15) return "Juvenil I";
  if (age >= 14) return "Infantil II";
  if (age >= 13) return "Infantil I";
  if (age >= 12) return "Petiz II";
  if (age >= 11) return "Petiz I";
  if (age >= 10) return "Mirim II";
  if (age >= 9) return "Mirim I";
  return "Pré-Mirim";
};

const FORCED_ASSIGNMENTS = new Map<string, ForcedAssignment>([
  ["lucas quintilho de sousa", { turmaCodigo: "dqs04", horario: "1515", professor: "Daniela" }],
]);

export const mapBootstrapForStorage = (data: any, calculateAge: (dateString: string) => number) => {
  const classById = new Map<number, any>();
  (data?.classes || []).forEach((cls: any) => classById.set(cls.id, cls));

  const mappedClasses = (data?.classes || []).map((cls: any) => ({
    Grupo: cls.grupo || cls.codigo,
    Turma: cls.turma_label || cls.codigo,
    TurmaCodigo: cls.grupo || cls.codigo,
    Horario: cls.horario,
    Professor: cls.professor,
    Nivel: cls.nivel,
    Atalho: cls.codigo,
    CapacidadeMaxima: cls.capacidade,
    DiasSemana: cls.dias_semana,
  }));

  const classByTriple = new Map<string, any>();
  mappedClasses.forEach((cls: any) => {
    const turmaCodigo = String(cls?.TurmaCodigo || cls?.Grupo || "").trim();
    const horario = normalizeHorarioDigits(String(cls?.Horario || ""));
    const professor = String(cls?.Professor || "").trim().toLowerCase();
    if (!turmaCodigo || !horario || !professor) return;
    classByTriple.set(`${turmaCodigo}|${horario}|${professor}`, cls);
  });

  const mappedStudents = (data?.students || []).map((student: any) => {
    const cls = classById.get(student.class_id);
    const age = calculateAge(student.data_nascimento || "");
    const base = {
      id: String(student.id),
      classId: student.class_id,
      studentUid: String(student.student_uid || ""),
      grupo: cls?.grupo || cls?.codigo || "",
      nome: student.nome,
      nivel: cls?.nivel || "",
      idade: age,
      categoria: student.categoria || deriveCategoriaFromAge(age),
      turma: cls?.turma_label || cls?.codigo || "",
      turmaCodigo: cls?.grupo || cls?.codigo || "",
      turmaLabel: cls?.turma_label || cls?.codigo || "",
      horario: cls?.horario || "",
      professor: cls?.professor || "",
      whatsapp: student.whatsapp || "",
      genero: student.genero || "",
      dataNascimento: student.data_nascimento || "",
      parQ: student.parq || "",
      atestado: !!student.atestado,
      dataAtestado: student.data_atestado || "",
    };

    const forced = FORCED_ASSIGNMENTS.get(normalizeName(String(base.nome || "")));
    if (!forced) return base;

    const classKey = `${forced.turmaCodigo}|${normalizeHorarioDigits(forced.horario)}|${String(forced.professor || "").trim().toLowerCase()}`;
    const targetClass = classByTriple.get(classKey);

    return {
      ...base,
      grupo: forced.turmaCodigo,
      turmaCodigo: forced.turmaCodigo,
      turma: targetClass?.Turma || base.turma,
      turmaLabel: targetClass?.Turma || base.turmaLabel,
      horario: forced.horario,
      professor: forced.professor,
      nivel: targetClass?.Nivel || base.nivel,
    };
  });

  return { mappedStudents, mappedClasses };
};
