import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

const EXCLUDED_STUDENTS_STORAGE_KEY = "excludedStudents";

const normalizeText = (value: unknown) => String(value || "").trim().toLowerCase();

const normalizeHorarioKey = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 3) return `0${digits}`;
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
};

const exclusionMatches = (candidate: any, payload: any) => {
  const candidateId = String(candidate?.id || "").trim();
  const payloadId = String(payload?.id || "").trim();
  if (candidateId && payloadId && candidateId === payloadId) return true;

  const candidateNome = normalizeText(
    candidate?.nome || candidate?.Nome || candidate?.aluno || candidate?.aluno_nome || candidate?.alunoNome
  );
  const payloadNome = normalizeText(
    payload?.nome || payload?.Nome || payload?.aluno || payload?.aluno_nome || payload?.alunoNome
  );
  if (!candidateNome || !payloadNome || candidateNome !== payloadNome) return false;

  const candidateTurma = normalizeText(
    candidate?.turma || candidate?.Turma || candidate?.turmaLabel || candidate?.TurmaLabel || candidate?.turmaCodigo || candidate?.TurmaCodigo
  );
  const payloadTurma = normalizeText(
    payload?.turma || payload?.Turma || payload?.turmaLabel || payload?.TurmaLabel || payload?.turmaCodigo || payload?.TurmaCodigo
  );
  const turmaMatches = !candidateTurma || !payloadTurma || candidateTurma === payloadTurma;

  const candidateHorario = normalizeHorarioKey(candidate?.horario || candidate?.Horario);
  const payloadHorario = normalizeHorarioKey(payload?.horario || payload?.Horario);
  const horarioMatches = !candidateHorario || !payloadHorario || candidateHorario === payloadHorario;

  const candidateProfessor = normalizeText(candidate?.professor || candidate?.Professor);
  const payloadProfessor = normalizeText(payload?.professor || payload?.Professor);
  const professorMatches = !candidateProfessor || !payloadProfessor || candidateProfessor === payloadProfessor;

  return turmaMatches && horarioMatches && professorMatches;
};

const readExcludedStudentsLocal = () => {
  try {
    const raw = localStorage.getItem(EXCLUDED_STUDENTS_STORAGE_KEY);
    if (!raw) return [] as any[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as any[];
  }
};

const hasExcludedStudentsLocalState = () => {
  try {
    return localStorage.getItem(EXCLUDED_STUDENTS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

const writeExcludedStudentsLocal = (items: any[]) => {
  localStorage.setItem(EXCLUDED_STUDENTS_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
};

const upsertExcludedStudentLocal = (payload: any) => {
  const items = readExcludedStudentsLocal();
  const nextItems = [...items];
  const idx = nextItems.findIndex((item) => exclusionMatches(item, payload));
  if (idx >= 0) {
    nextItems[idx] = { ...nextItems[idx], ...payload };
  } else {
    nextItems.push(payload);
  }
  writeExcludedStudentsLocal(nextItems);
  return nextItems;
};

const removeExcludedStudentLocal = (payload: any) => {
  const items = readExcludedStudentsLocal();
  const nextItems = items.filter((item) => !exclusionMatches(item, payload));
  writeExcludedStudentsLocal(nextItems);
  return nextItems;
};

const mergeExcludedStudentsLocalWithRemote = (remoteItems: any[]) => {
  const localItems = readExcludedStudentsLocal();
  const merged = [...localItems];

  (Array.isArray(remoteItems) ? remoteItems : []).forEach((remote) => {
    const idx = merged.findIndex((item) => exclusionMatches(item, remote));
    if (idx >= 0) {
      merged[idx] = { ...remote, ...merged[idx] };
    } else {
      merged.push(remote);
    }
  });

  writeExcludedStudentsLocal(merged);
  return merged;
};


// Attach token if present
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Students
export const getStudents = () => API.get("/students").catch(() => ({ data: [] }));
export const addStudent = (data: any) => API.post("/students", data).catch(() => ({ data: { ok: true } }));
export const updateStudent = (id: string, data: any) => API.put(`/students/${id}`, data).catch(() => ({ data: { ok: true } }));
export const deleteStudent = (id: string) => API.delete(`/students/${id}`).catch(() => ({ data: { ok: true } }));

// Attendance
export const getAttendance = () => API.get("/attendance").catch(() => ({ data: [] }));
export const addAttendance = (data: any) => API.post("/attendance", data).catch(() => ({ data: { ok: true } }));
export const updateAttendance = (id: string, data: any) => API.put(`/attendance/${id}`, data).catch(() => ({ data: { ok: true } }));
export const deleteAttendance = (id: string) => API.delete(`/attendance/${id}`).catch(() => ({ data: { ok: true } }));

// Classes
export const getAllClasses = () => API.get("/classes").catch(() => ({ data: [] }));
export const addClass = (data: any) => API.post("/import-classes", data).catch(() => ({ data: { ok: true } }));
export const updateClass = (class_id: number, data: any) => 
  API.put(`/import-classes/${class_id}`, data).catch(() => ({ data: { ok: true } }));
export const deleteClass = (turma: string, horario: string, professor: string) => 
  API.delete(`/classes/${turma}/${horario}/${professor}`).catch(() => ({ data: { ok: true } }));

// Exclusions
export const getExcludedStudents = () =>
  API.get("/exclusions")
    .then((response) => {
      const remoteItems = Array.isArray(response?.data) ? response.data : [];
      const localStateExists = hasExcludedStudentsLocalState();
      const localData = localStateExists ? readExcludedStudentsLocal() : [];

      if (remoteItems.length > 0) {
        const data = mergeExcludedStudentsLocalWithRemote(remoteItems);
        return { ...response, data };
      }

      if (localData.length > 0) {
        return { ...response, data: localData };
      }

      if (!localStateExists) {
        writeExcludedStudentsLocal([]);
      }

      return { ...response, data: [] };
    })
    .catch(() => ({ data: readExcludedStudentsLocal() }));

export const addExclusion = (data: any) =>
  API.post("/exclusions", data)
    .then((response) => {
      upsertExcludedStudentLocal(data);
      return response;
    })
    .catch(() => ({ data: { ok: true, fallback: true, items: upsertExcludedStudentLocal(data) } }));

export const restoreStudent = (data: any) =>
  API.post("/exclusions/restore", data)
    .then((response) => {
      removeExcludedStudentLocal(data);
      return response;
    })
    .catch(() => ({ data: { ok: true, fallback: true, items: removeExcludedStudentLocal(data) } }));

export const deleteExclusion = (data: any) =>
  API.post("/exclusions/delete", data)
    .then((response) => {
      removeExcludedStudentLocal(data);
      return response;
    })
    .catch(() => ({ data: { ok: true, fallback: true, items: removeExcludedStudentLocal(data) } }));

// Reports
export const getReports = (params?: Record<string, any>) => API.get("/reports", { params }).catch(() => ({ data: [] }));
export const generateReport = (data: any) => API.post("/reports", data).catch(() => ({ data: { ok: true } }));
export const getFilters = () => API.get("/filters").catch(() => ({ data: { turmas: [], horarios: [], professores: [], meses: [], anos: [] } }));
export const generateExcelReport = (data: any) => API.post("/reports/excel", data).catch(() => ({ data: { ok: true } }));
export const downloadExcelReport = (data: any) =>
  API.post("/reports/excel-file", data, { responseType: "blob" });
export const downloadMultiClassExcelReport = (data: any) =>
  API.post("/reports/excel-file", data, { responseType: "blob" });
export const downloadChamadaPdfReport = (data: any) =>
  API.post("/reports/chamada-pdf-file", data, { responseType: "blob" });
export const generateConsolidatedReport = (data: any) => API.post("/reports/consolidated", data).catch(() => ({ data: { ok: true } }));

// Statistics
export const getStatistics = () => API.get("/reports/statistics").catch(() => ({ data: [] }));

// File Import
export const importFile = (fileName: string) => 
  API.post(`/import?file=${encodeURIComponent(fileName)}&out_clean=true`)
    .catch(() => ({ data: { ok: true } }));

// Weather and Pool Log
export const getWeather = (date: string) =>
  API.get(`/weather?date=${encodeURIComponent(date)}`);

export const savePoolLog = (data: any) =>
  API.post("/pool-log", data);

export const getPoolLog = (date: string, params?: Record<string, string | undefined>) => {
  const query = new URLSearchParams({ date, ...(params || {}) });
  return API.get(`/pool-log?${query.toString()}`);
};

export const saveAttendanceLog = (data: any) =>
  API.post("/attendance-log", data);

export const saveJustificationLog = (data: any) =>
  API.post("/justifications-log", data);

// Academic calendar (reports summary)
export const getAcademicCalendar = (params?: Record<string, any>) =>
  API.get("/academic-calendar", { params }).catch(() => ({
    data: {
      settings: null,
      events: [],
      bankHours: [],
    },
  }));

export const saveAcademicCalendarSettings = (data: any) =>
  API.put("/academic-calendar/settings", data).catch(() => ({ data: { ok: false } }));

export const saveAcademicCalendarEvent = (data: any) =>
  API.post("/academic-calendar/events", data).catch(() => ({ data: { ok: false } }));

export const deleteAcademicCalendarEvent = (eventId: string) =>
  API.delete(`/academic-calendar/events/${encodeURIComponent(eventId)}`).catch(() => ({ data: { ok: false } }));

// Planning uploads
export const getPlanningFiles = () => API.get("/planning-files");
export const savePlanningFile = (data: any) => API.post("/planning-files", data);
export const deletePlanningFile = (id: string) =>
  API.delete(`/planning-files/${encodeURIComponent(id)}`);

// Import backend (multi-unit)
export const getBootstrap = (unitId?: number) =>
  API.get(`/api/bootstrap${unitId ? `?unit_id=${unitId}` : ""}`);

export const createImportStudent = (data: any) =>
  API.post("/api/import-students", data);

export const updateImportStudent = (id: string, data: any) =>
  API.put(`/api/import-students/${id}`, data);

export const importDataFile = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return API.post("/api/import-data", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getImportDataStatus = () =>
  API.get("/api/import-data/status");

// Login
export const login = (username: string, password: string) =>
  API.post("/token", new URLSearchParams({ username, password }), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

export default API;