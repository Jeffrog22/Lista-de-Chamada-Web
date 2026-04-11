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

  const clearScheduledFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const refreshSyncIndicator = useCallback(
    async (fromDebouncedFlush = false) => {
      if (!enabled || !isScopeValid(scope)) {
        setSyncIndicator(null);
        return;
      }

      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

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
    [clearScheduledFlush, enabled, scope]
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
      return;
    }

    refreshSyncIndicator();

    const onFocus = () => {
      refreshSyncIndicator();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSyncIndicator();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "pendingAttendanceLogs" || event.key === null) {
        refreshSyncIndicator();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);

    return () => {
      clearScheduledFlush();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [clearScheduledFlush, enabled, refreshSyncIndicator, scope]);

  return {
    syncIndicator,
    isSyncing,
    refreshSyncIndicator,
    syncNow,
  };
};
