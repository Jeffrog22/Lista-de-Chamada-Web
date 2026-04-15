import { useCallback, useEffect, useRef, useState } from "react";
import { flushPendingAttendanceLogs, forceAttendanceSync, getPendingAttendanceScopeStatus } from "../api";

type AttendanceSyncStatus = "sincronizado" | "pendente" | "erro";

type AttendanceSyncScope = {
  turmaCodigo: string;
  turmaLabel: string;
  horario: string;
  professor: string;
  mes: string;
};

type AttendanceSyncIndicator = {
  status: AttendanceSyncStatus;
  detail: string;
  updatedAt: string;
};

type UseAttendanceSyncEngineParams = {
  scope: AttendanceSyncScope;
  enabled?: boolean;
};

const DEBOUNCE_FLUSH_MS = 650;
const DEBOUNCE_REFRESH_MS = 800;
const MIN_REFRESH_INTERVAL_MS = 2000;

const isScopeValid = (scope: AttendanceSyncScope) =>
  Boolean(scope.turmaCodigo && scope.turmaLabel && scope.horario && scope.professor && scope.mes);

const buildScopeLabel = (scope: AttendanceSyncScope) =>
  [scope.turmaCodigo || scope.turmaLabel, scope.horario, scope.professor, scope.mes]
    .filter(Boolean)
    .join(" | ");

export const useAttendanceSyncEngine = ({ scope, enabled = true }: UseAttendanceSyncEngineParams) => {
  const [syncIndicator, setSyncIndicator] = useState<AttendanceSyncIndicator | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const flushTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const debounceRefreshTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(0);

  const clearScheduledFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const clearScheduledDebounceRefresh = useCallback(() => {
    if (debounceRefreshTimerRef.current !== null) {
      window.clearTimeout(debounceRefreshTimerRef.current);
      debounceRefreshTimerRef.current = null;
    }
  }, []);

  const refreshSyncIndicator = useCallback(
    async (fromDebouncedFlush = false) => {
      if (!enabled || !isScopeValid(scope)) {
        setSyncIndicator(null);
        clearScheduledDebounceRefresh();
        return;
      }

      // Prevent throttling: if a refresh just happened within MIN_REFRESH_INTERVAL_MS, skip it
      const now = performance.now();
      const timeSinceLastRefresh = now - lastRefreshAtRef.current;
      
      if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL_MS && !fromDebouncedFlush) {
        // Reschedule for later
        clearScheduledDebounceRefresh();
        debounceRefreshTimerRef.current = window.setTimeout(() => {
          refreshSyncIndicator(false);
        }, DEBOUNCE_REFRESH_MS);
        return;
      }

      // If refresh is already in-flight, return that promise
      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      lastRefreshAtRef.current = now;
      clearScheduledDebounceRefresh();

      const run = (async () => {
        const scopeLabel = buildScopeLabel(scope);
        const pendingInfo = getPendingAttendanceScopeStatus(scope);
        const pendingCount = Number(pendingInfo?.pending || 0);

        try {
          const probe = await forceAttendanceSync(scope).catch(() => ({ data: { ok: false, hasLog: false } }));
          const hasRemoteLog = Boolean(probe?.data?.hasLog);
          const updatedAt = new Date().toISOString();

          if (pendingCount > 0) {
            setSyncIndicator({
              status: "pendente",
              detail: `Pendente: ${pendingCount} item(ns) na fila local para esta turma/mês.`,
              updatedAt,
            });
            if (!fromDebouncedFlush && navigator.onLine) {
              clearScheduledFlush();
              flushTimerRef.current = window.setTimeout(() => {
                flushPendingAttendanceLogs()
                  .then(() => refreshSyncIndicator(true))
                  .catch(() => refreshSyncIndicator(true));
              }, DEBOUNCE_FLUSH_MS);
            }
            return;
          }

          if (hasRemoteLog) {
            setSyncIndicator({
              status: "sincronizado",
              detail: `Sincronizado para ${scopeLabel}.`,
              updatedAt,
            });
            return;
          }

          setSyncIndicator({
            status: "pendente",
            detail: `Ainda não há confirmação remota para ${scopeLabel}.`,
            updatedAt,
          });
        } catch {
          setSyncIndicator({
            status: "erro",
            detail: `Não foi possível verificar o sync agora para ${scopeLabel}.`,
            updatedAt: new Date().toISOString(),
          });
        }
      })();

      refreshInFlightRef.current = run.finally(() => {
        refreshInFlightRef.current = null;
      });

      return refreshInFlightRef.current;
    },
    [clearScheduledFlush, clearScheduledDebounceRefresh, enabled, scope]
  );

  const syncNow = useCallback(async () => {
    if (!enabled || !isScopeValid(scope) || isSyncing) return;

    setIsSyncing(true);
    clearScheduledFlush();
    try {
      await flushPendingAttendanceLogs();
      await refreshSyncIndicator(true);
    } finally {
      setIsSyncing(false);
    }
  }, [clearScheduledFlush, enabled, isSyncing, refreshSyncIndicator, scope]);

  useEffect(() => {
    if (!enabled || !isScopeValid(scope)) {
      setSyncIndicator(null);
      clearScheduledFlush();
      clearScheduledDebounceRefresh();
      return;
    }

    refreshSyncIndicator();

    const onFocus = () => {
      // Debounce focus events to avoid rapid re-checks
      clearScheduledDebounceRefresh();
      debounceRefreshTimerRef.current = window.setTimeout(() => {
        refreshSyncIndicator();
      }, DEBOUNCE_REFRESH_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Debounce visibility change to avoid rapid re-checks
        clearScheduledDebounceRefresh();
        debounceRefreshTimerRef.current = window.setTimeout(() => {
          refreshSyncIndicator();
        }, DEBOUNCE_REFRESH_MS);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "pendingAttendanceLogs" || event.key === null) {
        // Debounce storage events to avoid Oscillation
        clearScheduledDebounceRefresh();
        debounceRefreshTimerRef.current = window.setTimeout(() => {
          refreshSyncIndicator();
        }, DEBOUNCE_REFRESH_MS);
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);

    return () => {
      clearScheduledFlush();
      clearScheduledDebounceRefresh();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [clearScheduledFlush, clearScheduledDebounceRefresh, enabled, refreshSyncIndicator, scope]);

  return {
    syncIndicator,
    isSyncing,
    refreshSyncIndicator,
    syncNow,
  };
};
