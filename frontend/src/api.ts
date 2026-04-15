import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

const accessMode = String(import.meta.env.VITE_ACCESS_MODE || "unit").trim().toLowerCase();

const readScopedProfessorName = () => {
  if (accessMode !== "professor") return "";
  try {
    const raw = localStorage.getItem("teacherProfile");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.name || "").trim();
  } catch {
    return "";
  }
};

const noCacheConfig = {
  headers: {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
};

const EXCLUDED_STUDENTS_STORAGE_KEY = "excludedStudents";
const ATTENDANCE_LOG_QUEUE_KEY = "pendingAttendanceLogs";
const JUSTIFICATION_LOG_QUEUE_KEY = "pendingJustificationLogs";
const ATTENDANCE_DEBUG_KEY = "attendanceDebugPersistence";
const ATTENDANCE_DEBUG_EVENTS_KEY = "attendanceDebugEvents";

// Track explicit backend failure for operation attempts (not just read failures)
let EXCLUSIONS_WRITE_FAILED = false;

export const isExclusionsWriteFailed = () => EXCLUSIONS_WRITE_FAILED;
export const setExclusionsWriteFailed = (state: boolean) => { EXCLUSIONS_WRITE_FAILED = state; };

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
  const normalizedUid = String(item?.student_uid || item?.studentUid || "").trim();
  if (!normalizedName) return { ...item, _pendingSync: pendingSync };

  const next = { ...item };
  if (!next.nome) next.nome = normalizedName;
  if (!next.Nome) next.Nome = normalizedName;
  if (normalizedUid) {
    next.student_uid = normalizedUid;
    next.studentUid = normalizedUid;
  }
  next._pendingSync = pendingSync;
  return next;
};

const isValidExcludedStudentRecord = (item: any) => {
  const uid = String(item?.student_uid || item?.studentUid || "").trim();
  if (uid) return true;

  const name = normalizeText(resolveExclusionName(item));
  if (name) return true;

  const id = String(item?.id || "").trim();
  const turma = normalizeText(item?.turma || item?.Turma || item?.turmaLabel || item?.TurmaLabel || item?.grupo || item?.Grupo || item?.turmaCodigo || item?.TurmaCodigo);
  const horario = normalizeHorarioKey(item?.horario || item?.Horario);
  const professor = normalizeText(item?.professor || item?.Professor);

  return Boolean(id && turma && (horario || professor));
};

const exclusionMatches = (candidate: any, payload: any) => {
  const candidateUid = String(candidate?.student_uid || candidate?.studentUid || "").trim();
  const payloadUid = String(payload?.student_uid || payload?.studentUid || "").trim();
  if (candidateUid && payloadUid && candidateUid === payloadUid) return true;

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

  // IMPROVED: Require at least one full context match (turma+horario+professor or equivalent)
  // to avoid false positives from names alone, especially with historical data
  const candidateTurmaSet = new Set(
    [
      candidate?.turma,
      candidate?.Turma,
      candidate?.turmaLabel,
      candidate?.TurmaLabel,
      candidate?.turmaCodigo,
      candidate?.TurmaCodigo,
      candidate?.grupo,
      candidate?.Grupo,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
  const payloadTurmaSet = new Set(
    [
      payload?.turma,
      payload?.Turma,
      payload?.turmaLabel,
      payload?.TurmaLabel,
      payload?.turmaCodigo,
      payload?.TurmaCodigo,
      payload?.grupo,
      payload?.Grupo,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );

  const candidateHorario = normalizeHorarioKey(candidate?.horario || candidate?.Horario);
  const payloadHorario = normalizeHorarioKey(payload?.horario || payload?.Horario);
  
  const candidateProfessor = normalizeText(candidate?.professor || candidate?.Professor);
  const payloadProfessor = normalizeText(payload?.professor || payload?.Professor);

  const hasTurmaContext = candidateTurmaSet.size > 0 && payloadTurmaSet.size > 0;
  const hasHorarioContext = Boolean(candidateHorario && payloadHorario);
  const hasProfessorContext = Boolean(candidateProfessor && payloadProfessor);
  
  // If both have turma + horario + professor, all must match
  if (hasTurmaContext && hasHorarioContext && hasProfessorContext) {
    const turmaMatches = Array.from(candidateTurmaSet).some((value) => payloadTurmaSet.has(value));
    const horarioMatches = candidateHorario === payloadHorario;
    const professorMatches = candidateProfessor === payloadProfessor;
    return turmaMatches && horarioMatches && professorMatches;
  }

  // If both have turma + horario, both must match
  if (hasTurmaContext && hasHorarioContext) {
    const turmaMatches = Array.from(candidateTurmaSet).some((value) => payloadTurmaSet.has(value));
    const horarioMatches = candidateHorario === payloadHorario;
    return turmaMatches && horarioMatches;
  }

  // If both have turma + professor, both must match
  if (hasTurmaContext && hasProfessorContext) {
    const turmaMatches = Array.from(candidateTurmaSet).some((value) => payloadTurmaSet.has(value));
    const professorMatches = candidateProfessor === payloadProfessor;
    return turmaMatches && professorMatches;
  }

  // If only turma context, turma must match
  if (hasTurmaContext) {
    return Array.from(candidateTurmaSet).some((value) => payloadTurmaSet.has(value));
  }

  // If only horario context, horario must match
  if (hasHorarioContext) {
    return candidateHorario === payloadHorario;
  }

  // If only professor context, professor must match
  if (hasProfessorContext) {
    return candidateProfessor === payloadProfessor;
  }

  const candidateHasAnyContext = candidateTurmaSet.size > 0 || Boolean(candidateHorario) || Boolean(candidateProfessor);
  const payloadHasAnyContext = payloadTurmaSet.size > 0 || Boolean(payloadHorario) || Boolean(payloadProfessor);

  // Backward compatibility for legacy exclusions stored only by name.
  // If one side has no context, keep name match so old exclusions remain effective.
  if (!candidateHasAnyContext || !payloadHasAnyContext) {
    return true;
  }

  return false;
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

const writeExcludedStudentsLocal = (items: any[]) => {
  localStorage.setItem(EXCLUDED_STUDENTS_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
};

const cleanExcludedStudentsLocalCache = () => {
  const localItems = readExcludedStudentsLocal();
  if (localItems.length === 0) return [];
  
  const cleaned: any[] = [];
  const seen = new Set<string>();
  
  // First pass: deduplicate by UID/ID
  localItems.forEach((item) => {
    const uid = String(item?.student_uid || item?.studentUid || "").trim();
    const id = String(item?.id || "").trim();
    const key = (uid || id || "") + "|" + (normalizeText(item?.nome || item?.Nome || ""));
    
    if (key && !key.startsWith("|") && seen.has(key)) {
      return; // Skip duplicates by UID/ID/Name combo
    }
    
    if (key && !key.startsWith("|")) {
      seen.add(key);
    }
    
    const normalized = normalizeExcludedStudentRecord(item);
    if (isValidExcludedStudentRecord(normalized)) {
      cleaned.push(normalized);
    }
  });
  
  // Only persist if changes were made
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

const getJustificationLogScopeKey = (payload: any) => {
  const turma = normalizeAttendanceLogField(payload?.turmaCodigo || payload?.turmaLabel);
  const horario = normalizeAttendanceLogHorario(payload?.horario);
  const professor = normalizeAttendanceLogField(payload?.professor);
  const dataRaw = String(payload?.data || "").trim();
  const mesFromData = /^\d{4}-\d{2}-\d{2}$/.test(dataRaw) ? dataRaw.slice(0, 7) : "";
  const mes = normalizeAttendanceLogField(payload?.mes || mesFromData);
  return `${turma}||${horario}||${professor}||${mes}`;
};

const getJustificationLogQueueKey = (payload: any) => {
  const scope = getJustificationLogScopeKey(payload);
  const aluno = normalizeAttendanceLogField(payload?.aluno_nome || payload?.alunoNome || payload?.aluno || "");
  const data = String(payload?.data || "").trim();
  return `${scope}||${aluno}||${data}`;
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

const readPendingJustificationLogs = () => {
  try {
    const raw = localStorage.getItem(JUSTIFICATION_LOG_QUEUE_KEY);
    if (!raw) return [] as any[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as any[];
  }
};

const writePendingJustificationLogs = (items: any[]) => {
  localStorage.setItem(JUSTIFICATION_LOG_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
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

const upsertPendingJustificationLog = (payload: any) => {
  const items = readPendingJustificationLogs();
  const key = getJustificationLogQueueKey(payload);
  const idx = items.findIndex((item) => getJustificationLogQueueKey(item) === key);
  if (idx >= 0) {
    items[idx] = payload;
  } else {
    items.push(payload);
  }
  writePendingJustificationLogs(items);
  return items;
};

const removePendingJustificationLog = (payload: any) => {
  const key = getJustificationLogQueueKey(payload);
  const items = readPendingJustificationLogs().filter((item) => getJustificationLogQueueKey(item) !== key);
  writePendingJustificationLogs(items);
  return items;
};

export const getPendingAttendanceScopeStatus = (payload: any) => {
  const attendanceKey = getAttendanceLogQueueKey(payload);
  const pending = readPendingAttendanceLogs().filter(
    (item) => getAttendanceLogQueueKey(item) === attendanceKey
  ).length;
  return { pending };
};

export const flushPendingAttendanceLogs = async () => {
  const attendanceQueue = readPendingAttendanceLogs();
  logPersistenceDebug("flush:start", {
    attendanceQueued: attendanceQueue.length,
  });
  if (attendanceQueue.length === 0) {
    return { flushed: 0, pending: 0 };
  }

  const remainingAttendance: any[] = [];
  let flushed = 0;

  for (const payload of attendanceQueue) {
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
      remainingAttendance.push(payload);
      logPersistenceDebug("flush:item_fail", {
        turmaCodigo: payload?.turmaCodigo || "",
        turmaLabel: payload?.turmaLabel || "",
        horario: payload?.horario || "",
        professor: payload?.professor || "",
        mes: payload?.mes || "",
      });
    }
  }

  writePendingAttendanceLogs(remainingAttendance);
  const pending = remainingAttendance.length;
  logPersistenceDebug("flush:end", { flushed, pending });
  return { flushed, pending };
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
  API.get("/exclusions", { ...noCacheConfig, params: { _ts: Date.now() } })
    .then(async (response) => {
      const remoteItems = Array.isArray(response?.data) ? response.data : [];
      writeExcludedStudentsLocal(remoteItems);
      setExclusionsWriteFailed(false);
      return { ...response, data: remoteItems, _fromFallback: false };
    })
    .catch(() => {
      // Read-only failure: allow showing cached data without blocking
      return { data: readExcludedStudentsLocal(), _fromFallback: true };
    });

export const addExclusion = (data: any) => {
  return API.post("/exclusions", data)
    .then((response) => {
      upsertExcludedStudentLocal(data, false);
      setExclusionsWriteFailed(false);
      return response;
    })
    .catch((err) => {
      setExclusionsWriteFailed(true);
      return Promise.reject({
        status: err?.response?.status || 503,
        data: { ok: false, fallback: true, error: "Falha ao salvar exclusão no backend." },
      });
    });
};

export const addExclusionsBulk = (items: any[], replace = false) => {
  const payloadItems = (Array.isArray(items) ? items : []).map((item) => normalizeExcludedStudentRecord(item));
  if (payloadItems.length === 0) {
    return Promise.resolve({ data: { ok: true, added: 0, updated: 0, skipped: 0, total: readExcludedStudentsLocal().length } });
  }

  return API.post("/exclusions/bulk", { items: payloadItems, replace })
    .then((response) => {
      const current = replace ? [] : readExcludedStudentsLocal();
      const next = [...current];
      payloadItems.forEach((item) => {
        const idx = next.findIndex((existing) => exclusionMatches(existing, item));
        const normalized = normalizeExcludedStudentRecord({ ...item, _pendingSync: false });
        if (idx >= 0) {
          next[idx] = normalizeExcludedStudentRecord({ ...next[idx], ...normalized, _pendingSync: false });
        } else {
          next.push(normalized);
        }
      });
      writeExcludedStudentsLocal(next);
      return response;
    })
    .catch(() => {
      const current = replace ? [] : readExcludedStudentsLocal();
      const next = [...current];
      payloadItems.forEach((item) => {
        const idx = next.findIndex((existing) => exclusionMatches(existing, item));
        const normalized = normalizeExcludedStudentRecord({ ...item, _pendingSync: true });
        if (idx >= 0) {
          next[idx] = normalizeExcludedStudentRecord({ ...next[idx], ...normalized, _pendingSync: true });
        } else {
          next.push(normalized);
        }
      });
      writeExcludedStudentsLocal(next);
      return { data: { ok: true, fallback: true, items: next, queued: payloadItems.length } };
    });
};

export const restoreStudent = (data: any) => {
  return API.post("/exclusions/restore", data)
    .then((response) => {
      removeExcludedStudentLocal(data);
      setExclusionsWriteFailed(false);
      return response;
    })
    .catch((err) => {
      setExclusionsWriteFailed(true);
      return Promise.reject({
        status: err?.response?.status || 503,
        data: { ok: false, fallback: true, error: "Falha ao restaurar aluno no backend." },
      });
    });
};

export const deleteExclusion = (data: any) => {
  return API.post("/exclusions/delete", data)
    .then((response) => {
      removeExcludedStudentLocal(data);
      setExclusionsWriteFailed(false);
      return response;
    })
    .catch((err) => {
      setExclusionsWriteFailed(true);
      return Promise.reject({
        status: err?.response?.status || 503,
        data: { ok: false, fallback: true, error: "Falha ao deletar exclusão no backend." },
      });
    });
};

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
    .then(() => {
      const normalizedParams = {
        ...(params || {}),
        _ts: Date.now(),
      };
      return API.get("/reports", { ...noCacheConfig, params: normalizedParams }).catch(() => ({ data: [] }));
    });
export const generateReport = (data: any) => API.post("/reports", data).catch(() => ({ data: { ok: true } }));
export const getFilters = () => API.get("/filters").catch(() => ({ data: { turmas: [], horarios: [], professores: [], meses: [], anos: [] } }));
export const generateExcelReport = (data: any) => API.post("/reports/excel", data).catch(() => ({ data: { ok: true } }));
export const downloadExcelReport = (data: any) =>
  API.post("/reports/excel-file", data, { responseType: "blob" });
export const downloadMultiClassExcelReport = (data: any) =>
  API.post("/reports/excel-file", data, { responseType: "blob" });
export const downloadChamadaPdfReport = (data: any) =>
  API.post("/reports/chamada-pdf-file", data, { responseType: "blob" });
export const downloadVacanciesExcelReport = (data: any) =>
  API.post("/reports/vacancies-excel-file", data, { responseType: "blob" });
export const downloadVacanciesPdfReport = (data: any) =>
  API.post("/reports/vacancies-pdf-file", data, { responseType: "blob" });
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
  const query = new URLSearchParams({ date });
  Object.entries(params || {}).forEach(([key, value]) => {
    const normalized = String(value || "").trim();
    if (normalized) query.set(key, normalized);
  });
  return API.get(`/pool-log?${query.toString()}`);
};

export const saveAttendanceLog = (data: any) =>
  (() => {
    const payload = {
      ...data,
      clientSavedAt: String(data?.clientSavedAt || "").trim() || new Date().toISOString(),
    };
    logPersistenceDebug("save:start", {
      turmaCodigo: payload?.turmaCodigo || "",
      turmaLabel: payload?.turmaLabel || "",
      horario: payload?.horario || "",
      professor: payload?.professor || "",
      mes: payload?.mes || "",
    });
    return API.post("/attendance-log", payload)
      .then(async (response) => {
        const staleSnapshot = Boolean(response?.data?.skipped && response?.data?.reason === "stale_snapshot");
        if (staleSnapshot) {
          const retryPayload = {
            ...payload,
            clientSavedAt: new Date().toISOString(),
          };
          try {
            const retryResponse = await API.post("/attendance-log", retryPayload);
            removePendingAttendanceLog(retryPayload);
            logPersistenceDebug("save:retry_ok", {
              turmaCodigo: retryPayload?.turmaCodigo || "",
              turmaLabel: retryPayload?.turmaLabel || "",
              horario: retryPayload?.horario || "",
              professor: retryPayload?.professor || "",
              mes: retryPayload?.mes || "",
              pending: readPendingAttendanceLogs().length,
            });
            return retryResponse;
          } catch {
            const queued = upsertPendingAttendanceLog(retryPayload);
            logPersistenceDebug("save:retry_queued", {
              turmaCodigo: retryPayload?.turmaCodigo || "",
              turmaLabel: retryPayload?.turmaLabel || "",
              horario: retryPayload?.horario || "",
              professor: retryPayload?.professor || "",
              mes: retryPayload?.mes || "",
              pending: queued.length,
            });
            return { data: { ok: true, fallback: true, queued: true, pending: queued.length } };
          }
        }

        removePendingAttendanceLog(payload);
        logPersistenceDebug("save:ok", {
          turmaCodigo: payload?.turmaCodigo || "",
          turmaLabel: payload?.turmaLabel || "",
          horario: payload?.horario || "",
          professor: payload?.professor || "",
          mes: payload?.mes || "",
          pending: readPendingAttendanceLogs().length,
        });
        return response;
      })
      .catch((error) => {
        const queued = upsertPendingAttendanceLog(payload);
        logPersistenceDebug("save:queued", {
          turmaCodigo: payload?.turmaCodigo || "",
          turmaLabel: payload?.turmaLabel || "",
          horario: payload?.horario || "",
          professor: payload?.professor || "",
          mes: payload?.mes || "",
          pending: queued.length,
          error: error?.message || "request_failed",
        });
        return { data: { ok: true, fallback: true, queued: true, pending: queued.length } };
      });
  })();

export const forceAttendanceSync = (data: any) =>
  API.post("/attendance-log/force-sync", data).catch(() => ({ data: { ok: false, hasLog: false } }));

export const saveJustificationLog = (data: any) =>
  (() => {
    const entries = (Array.isArray(data) ? data : [])
      .map((item) => ({
        ...item,
        data: String(item?.data || "").trim(),
        motivo: String(item?.motivo || "").trim(),
      }))
      .filter((item) => item.data && item.motivo);

    if (entries.length === 0) {
      return Promise.resolve({ data: { ok: true, count: 0 } });
    }

    return API.post("/justifications-log", entries)
      .then((response) => {
        entries.forEach((entry) => removePendingJustificationLog(entry));
        return response;
      })
      .catch((error) => {
        let pending = readPendingJustificationLogs().length;
        entries.forEach((entry) => {
          const queued = upsertPendingJustificationLog(entry);
          pending = queued.length;
        });
        logPersistenceDebug("save:justification_queued", {
          count: entries.length,
          pending,
          error: error?.message || "request_failed",
        });
        return { data: { ok: true, fallback: true, queued: true, pending } };
      });
  })();

// Academic calendar (reports summary)
export const getAcademicCalendar = (params?: Record<string, any>) =>
  API.get("/academic-calendar", { ...noCacheConfig, params }).catch(() => ({
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
export const getBootstrap = (unitId?: number, options?: { professor?: string }) => {
  const params = new URLSearchParams();
  if (typeof unitId === "number") {
    params.set("unit_id", String(unitId));
  }

  const professorScope = String(options?.professor || "").trim() || readScopedProfessorName();
  if (professorScope) {
    params.set("professor", professorScope);
  }

  const query = params.toString();
  return API.get(`/api/bootstrap${query ? `?${query}` : ""}`);
};

export const createImportStudent = (data: any) =>
  API.post("/api/import-students", data);

export const updateImportStudent = (id: string, data: any) =>
  API.put(`/api/import-students/${id}`, data);

export const bulkAllocateImportStudents = (data: {
  student_ids: number[];
  turma: string;
  horario: string;
  professor: string;
  movement_type?: "correction" | "transfer";
}) => API.post("/api/import-students/bulk-allocate", data);

export const importDataFile = (file: File, options?: { applyOverrides?: boolean }) => {
  const formData = new FormData();
  formData.append("file", file);
  if (typeof options?.applyOverrides === "boolean") {
    formData.append("apply_overrides", String(options.applyOverrides));
  }
  return API.post("/api/import-data", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getImportDataStatus = () =>
  API.get("/api/import-data/status");

export const getMaintenanceDiagnostics = () =>
  API.get("/maintenance/diagnostics");

export const clearTransferOverrides = () =>
  API.post("/maintenance/clear-transfer-overrides", {}).catch(() => ({ data: { ok: false, removed: 0 } }));

// Login
export const login = (username: string, password: string, unitName?: string) =>
  API.post("/token", new URLSearchParams({ username, password, unit_name: String(unitName || "") }), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

export default API;