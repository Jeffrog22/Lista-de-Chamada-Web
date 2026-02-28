import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});


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
export const getExcludedStudents = () => API.get("/exclusions").catch(() => ({ data: [] }));
export const addExclusion = (data: any) => API.post("/exclusions", data);
export const restoreStudent = (data: any) => API.post("/exclusions/restore", data).catch(() => ({ data: { ok: true } }));
export const deleteExclusion = (data: any) => API.post("/exclusions/delete", data).catch(() => ({ data: { ok: true } }));

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