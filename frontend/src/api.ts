import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

const EXCLUDED_STUDENTS_STORAGE_KEY = "excludedStudents";
const ATTENDANCE_LOG_QUEUE_KEY = "pendingAttendanceLogs";
const ATTENDANCE_DEBUG_KEY = "attendanceDebugPersistence";
const ATTENDANCE_DEBUG_EVENTS_KEY = "attendanceDebugEvents";

const isPersistenceDebugEnabled = () => {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(ATTENDANCE_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
};

const logPersistenceDebug = (action: string, payload: Record<string, unknown>) => {
  if (!isPersistenceDebugEnabled()) return;
  const entry = {
    ts: new Date().toISOString(),
    source: "api",
    action,
    payload,
  };
  console.info("[attendance:persistence:api]", { action, ...payload });
  try {
    const raw = localStorage.getItem(ATTENDANCE_DEBUG_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [...list, entry].slice(-80);
    localStorage.setItem(ATTENDANCE_DEBUG_EVENTS_KEY, JSON.stringify(next));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent("attendance-debug-event", { detail: entry }));
  } catch {
  }
};

const normalizeText = (value: unknown) => String(value || "").trim().toLowerCase();

const normalizeHorarioKey = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 3) return `0${digits}`;
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
};

const resolveExclusionName = (item: any) =>
  String(item?.nome || item?.Nome || item?.aluno || item?.aluno_nome || item?.alunoNome || "").trim();

const isPendingExcludedSync = (item: any) => Boolean(item?._pendingSync);

const normalizeExcludedStudentRecord = (item: any) => {
  const normalizedName = resolveExclusionName(item);
  const pendingSync = isPendingExcludedSync(item);
  if (!normalizedName) return { ...item, _pendingSync: pendingSync };

  const next = { ...item };
  if (!next.nome) next.nome = normalizedName;
  if (!next.Nome) next.Nome = normalizedName;
  next._pendingSync = pendingSync;
  return next;
};

const isValidExcludedStudentRecord = (item: any) => {
  const name = normalizeText(resolveExclusionName(item));
  if (name) return true;

  const id = String(item?.id || "").trim();
  const turma = normalizeText(item?.turma || item?.Turma || item?.turmaLabel || item?.TurmaLabel || item?.turmaCodigo || item?.TurmaCodigo);
  const horario = normalizeHorarioKey(item?.horario || item?.Horario);
  const professor = normalizeText(item?.professor || item?.Professor);

  return Boolean(id && turma && (horario || professor));
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

const cleanExcludedStudentsLocalCache = () => {
  const localItems = readExcludedStudentsLocal();
  const cleaned = localItems
    .map(normalizeExcludedStudentRecord)
    .filter(isValidExcludedStudentRecord);

  if (cleaned.length !== localItems.length || cleaned.some((item, index) => JSON.stringify(item) !== JSON.stringify(localItems[index]))) {
    writeExcludedStudentsLocal(cleaned);
  }

  return cleaned;
};

const upsertExcludedStudentLocal = (payload: any, pendingSync?: boolean) => {
  const normalizedPayload = normalizeExcludedStudentRecord(
    pendingSync === undefined ? payload : { ...payload, _pendingSync: pendingSync }
  );
  const items = cleanExcludedStudentsLocalCache();
  const nextItems = [...items];
  const idx = nextItems.findIndex((item) => exclusionMatches(item, normalizedPayload));
  if (idx >= 0) {
    const currentPending = isPendingExcludedSync(nextItems[idx]);
    const resolvedPending = pendingSync === undefined ? currentPending : pendingSync;
    nextItems[idx] = normalizeExcludedStudentRecord({
      ...nextItems[idx],
      ...normalizedPayload,
      _pendingSync: resolvedPending,
    });
  } else {
    if (isValidExcludedStudentRecord(normalizedPayload)) {
      nextItems.push(normalizedPayload);
    }
  }
  writeExcludedStudentsLocal(nextItems);
  return nextItems;
};

const removeExcludedStudentLocal = (payload: any) => {
  const items = cleanExcludedStudentsLocalCache();
  const nextItems = items.filter((item) => !exclusionMatches(item, payload));
  writeExcludedStudentsLocal(nextItems);
  return nextItems;
};

const mergeExcludedStudentsLocalWithRemote = (remoteItems: any[]) => {
  const localItems = cleanExcludedStudentsLocalCache();
  const merged = (Array.isArray(remoteItems) ? remoteItems : [])
    .map((remote) => normalizeExcludedStudentRecord({ ...remote, _pendingSync: false }))
    .filter(isValidExcludedStudentRecord);

  localItems
    .filter(isPendingExcludedSync)
    .forEach((localPending) => {
      const idx = merged.findIndex((item) => exclusionMatches(item, localPending));
      if (idx >= 0) {
        merged[idx] = normalizeExcludedStudentRecord({ ...merged[idx], _pendingSync: true });
      } else if (isValidExcludedStudentRecord(localPending)) {
        merged.push(normalizeExcludedStudentRecord({ ...localPending, _pendingSync: true }));
      }
    });

  writeExcludedStudentsLocal(merged);
  return merged;
};

const syncExcludedStudentsToRemote = async (remoteItems: any[], localItems: any[]) => {
  const remote = Array.isArray(remoteItems) ? remoteItems : [];
  const local = Array.isArray(localItems) ? localItems : [];
  if (local.length === 0) return { synced: 0, items: local };

  const candidates = remote.length === 0
    ? local.filter((localItem) => !remote.some((remoteItem) => exclusionMatches(remoteItem, localItem)))
    : local.filter(
        (localItem) => isPendingExcludedSync(localItem) && !remote.some((remoteItem) => exclusionMatches(remoteItem, localItem))
      );
  if (candidates.length === 0) return { synced: 0, items: local };

  const results = await Promise.allSettled(
    candidates.map((item) => API.post("/exclusions", normalizeExcludedStudentRecord({ ...item, _pendingSync: false })))
  );

  const succeeded = candidates.filter((_, index) => results[index]?.status === "fulfilled");
  if (succeeded.length === 0) return { synced: 0, items: local };

  const nextItems = local.map((item) => {
    if (succeeded.some((okItem) => exclusionMatches(okItem, item))) {
      return normalizeExcludedStudentRecord({ ...item, _pendingSync: false });
    }
    return item;
  });

  writeExcludedStudentsLocal(nextItems);
  return { synced: succeeded.length, items: nextItems };
};

const normalizeAttendanceLogField = (value: unknown) => String(value || "").trim().toLowerCase();

const normalizeAttendanceLogHorario = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 3) return `0${digits}`;
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
};

const getAttendanceLogQueueKey = (payload: any) => {
  const turma = normalizeAttendanceLogField(payload?.turmaCodigo || payload?.turmaLabel);
  const horario = normalizeAttendanceLogHorario(payload?.horario);
  const professor = normalizeAttendanceLogField(payload?.professor);
  const mes = normalizeAttendanceLogField(payload?.mes);
  return `${turma}||${horario}||${professor}||${mes}`;
};

const readPendingAttendanceLogs = () => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_LOG_QUEUE_KEY);
    if (!raw) return [] as any[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as any[];
  }
};

const writePendingAttendanceLogs = (items: any[]) => {
  localStorage.setItem(ATTENDANCE_LOG_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
};

const upsertPendingAttendanceLog = (payload: any) => {
  const items = readPendingAttendanceLogs();
  const key = getAttendanceLogQueueKey(payload);
  const idx = items.findIndex((item) => getAttendanceLogQueueKey(item) === key);
  if (idx >= 0) {
    items[idx] = payload;
  } else {
    items.push(payload);
  }
  writePendingAttendanceLogs(items);
  return items;
};

const removePendingAttendanceLog = (payload: any) => {
  const key = getAttendanceLogQueueKey(payload);
  const items = readPendingAttendanceLogs().filter((item) => getAttendanceLogQueueKey(item) !== key);
  writePendingAttendanceLogs(items);
  return items;
};

export const flushPendingAttendanceLogs = async () => {
  const queue = readPendingAttendanceLogs();
  logPersistenceDebug("flush:start", { queued: queue.length });
  if (queue.length === 0) return { flushed: 0, pending: 0 };

  const remaining: any[] = [];
  let flushed = 0;

  for (const payload of queue) {
    try {
      await API.post("/attendance-log", payload);
      flushed += 1;
      logPersistenceDebug("flush:item_ok", {
        turmaCodigo: payload?.turmaCodigo || "",
        turmaLabel: payload?.turmaLabel || "",
        horario: payload?.horario || "",
        professor: payload?.professor || "",
        mes: payload?.mes || "",
      });
    } catch {
      remaining.push(payload);
      logPersistenceDebug("flush:item_fail", {
        turmaCodigo: payload?.turmaCodigo || "",
        turmaLabel: payload?.turmaLabel || "",
        horario: payload?.horario || "",
        professor: payload?.professor || "",
        mes: payload?.mes || "",
      });
    }
  }

  writePendingAttendanceLogs(remaining);
  logPersistenceDebug("flush:end", { flushed, pending: remaining.length });
  return { flushed, pending: remaining.length };
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
    .then(async (response) => {
      const remoteItems = Array.isArray(response?.data) ? response.data : [];
      const localStateExists = hasExcludedStudentsLocalState();
      const localData = localStateExists ? cleanExcludedStudentsLocalCache() : [];

      const baseline = remoteItems.length > 0 ? mergeExcludedStudentsLocalWithRemote(remoteItems) : localData;

      if (baseline.length > 0) {
        try {
          const syncResult = await syncExcludedStudentsToRemote(remoteItems, baseline);
          return { ...response, data: syncResult.items };
        } catch {
          return { ...response, data: baseline };
        }
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
      upsertExcludedStudentLocal(data, false);
      return response;
    })
    .catch(() => ({ data: { ok: true, fallback: true, items: upsertExcludedStudentLocal(data, true) } }));

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
export const getReports = (params?: Record<string, any>) =>
  flushPendingAttendanceLogs()
    .then((flushInfo) => {
      logPersistenceDebug("reports:after_flush", {
        flushed: flushInfo?.flushed ?? 0,
        pending: flushInfo?.pending ?? 0,
      });
      return flushInfo;
    })
    .catch(() => ({ flushed: 0, pending: readPendingAttendanceLogs().length }))
    .then(() => API.get("/reports", { params }).catch(() => ({ data: [] })));
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
  (() => {
    logPersistenceDebug("save:start", {
      turmaCodigo: data?.turmaCodigo || "",
      turmaLabel: data?.turmaLabel || "",
      horario: data?.horario || "",
      professor: data?.professor || "",
      mes: data?.mes || "",
    });
    return API.post("/attendance-log", data)
      .then((response) => {
        removePendingAttendanceLog(data);
        logPersistenceDebug("save:ok", {
          turmaCodigo: data?.turmaCodigo || "",
          turmaLabel: data?.turmaLabel || "",
          horario: data?.horario || "",
          professor: data?.professor || "",
          mes: data?.mes || "",
          pending: readPendingAttendanceLogs().length,
        });
        return response;
      })
      .catch((error) => {
        const queued = upsertPendingAttendanceLog(data);
        logPersistenceDebug("save:queued", {
          turmaCodigo: data?.turmaCodigo || "",
          turmaLabel: data?.turmaLabel || "",
          horario: data?.horario || "",
          professor: data?.professor || "",
          mes: data?.mes || "",
          pending: queued.length,
          error: error?.message || "request_failed",
        });
        return { data: { ok: true, fallback: true, queued: true, pending: queued.length } };
      });
  })();

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