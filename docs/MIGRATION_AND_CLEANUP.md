**Migration & Cleanup — Frontend/Backend**

Summary
- The frontend should source its class and student lists from the persistent backend endpoints `/classes` and `/students`.
- LocalStorage keys previously used: `activeClasses`, `activeStudents` — these are now populated from the API on login/startup. Clear them in browser to avoid stale/demo data.

Commands
- Start backend (from repo root):
  - `cd backend` 
  - `.\.venv\Scripts\activate` (if using venv)
  - `uvicorn app.main:app --reload --port 8000`

- Start frontend (from repo root):
  - `cd frontend`
  - `npm install` (if needed)
  - `npm run dev`

- Clear client stale cache (open browser DevTools console):
  - `localStorage.removeItem('activeClasses'); localStorage.removeItem('activeStudents'); location.reload();`

DB Safety & Cleanup
- A backup of the DB was created before changes: `backend/dev.db.bak`.
- To archive/remove legacy classes again (dry-run):
  - `python backend/scripts/fix_legacy_classes.py --dry-run`
  - To apply: `python backend/scripts/fix_legacy_classes.py`

Import testing
- To run the automated import test (posts `data/templates/import-data.template.csv`):
  - Ensure dev server running and run: `python backend/scripts/run_import_test.py`

Notes for developers
- The frontend entry `src/App.tsx` now fetches `/classes` and `/students` and repopulates the former `localStorage` keys to preserve small legacy components while ensuring API is the source-of-truth. Consider progressively refactoring pages to call the API directly (remove localStorage dependency).
- Backend `app/main.py` now canonicalizes `turma_label` and upserts into persistent tables during CSV import. `app/crud.py` does upserts for `ClassModel` and `Student`.
