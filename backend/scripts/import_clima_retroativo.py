import argparse
import os
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd


POOL_LOG_COLUMNS = [
    "Data",
    "TurmaCodigo",
    "TurmaLabel",
    "Horario",
    "Professor",
    "Clima 1",
    "Clima 2",
    "Status_aula",
    "Nota",
    "Tipo_ocorrencia",
    "Temp. (C)",
    "Piscina (C)",
    "Cloro (ppm)",
]

PT_MONTHS = {
    "jan": 1,
    "fev": 2,
    "mar": 3,
    "abr": 4,
    "mai": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "set": 9,
    "out": 10,
    "nov": 11,
    "dez": 12,
}


@dataclass
class ImportStats:
    read_rows: int = 0
    kept_rows: int = 0
    created: int = 0
    updated: int = 0
    skipped_invalid_date: int = 0
    removed_existing: int = 0



def _read_csv(path: str) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(path, sep=";", encoding=encoding, dtype=str)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(path, sep=";", dtype=str)



def _parse_retro_date(raw_value: Any, default_year: int) -> str:
    raw = str(raw_value or "").strip().lower()
    if not raw:
        return ""

    raw = raw.replace(".", "/").replace("-", "/")

    # YYYY/MM/DD or DD/MM/YYYY
    if re.fullmatch(r"\d{4}/\d{2}/\d{2}", raw):
        yyyy, mm, dd = raw.split("/")
        return f"{yyyy}-{mm}-{dd}"
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", raw):
        dd, mm, yyyy = raw.split("/")
        return f"{yyyy}-{mm}-{dd}"

    # DD/MM (fallback for numeric month)
    if re.fullmatch(r"\d{2}/\d{2}", raw):
        dd, mm = raw.split("/")
        return f"{default_year}-{mm}-{dd}"

    # DD/fev style
    match = re.fullmatch(r"(\d{1,2})/([a-z]{3})", raw)
    if match:
        dd = int(match.group(1))
        mm = PT_MONTHS.get(match.group(2), 0)
        if mm <= 0:
            return ""
        try:
            return date(default_year, mm, dd).isoformat()
        except ValueError:
            return ""

    return ""



def _normalize_horario(raw_value: Any) -> str:
    raw = str(raw_value or "").strip()
    if not raw:
        return ""

    # Retro file may send ranges (0600-1200 / 1300-1800). We persist start time.
    if "-" in raw:
        left = raw.split("-", 1)[0].strip()
        left_digits = re.sub(r"\D", "", left)
        if len(left_digits) == 3:
            left_digits = f"0{left_digits}"
        if len(left_digits) >= 4:
            return f"{left_digits[:2]}:{left_digits[2:4]}"
        return raw

    digits = re.sub(r"\D", "", raw)
    if len(digits) == 3:
        digits = f"0{digits}"
    if len(digits) >= 4:
        return f"{digits[:2]}:{digits[2:4]}"
    return raw



def _coerce_number(raw_value: Any) -> str | float:
    raw = str(raw_value or "").strip()
    if not raw:
        return ""

    raw = raw.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", raw)
    if not match:
        return ""

    try:
        value = float(match.group(0))
        if value.is_integer():
            return int(value)
        return value
    except ValueError:
        return ""



def _coerce_cloro(raw_value: Any) -> str | float:
    raw = str(raw_value or "").strip()
    if not raw:
        return ""

    raw = raw.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", raw)
    if not match:
        return ""

    try:
        value = float(match.group(0))
        return value
    except ValueError:
        return ""


def _coerce_number_or_zero(raw_value: Any) -> float | int:
    value = _coerce_number(raw_value)
    if value == "":
        return 0
    return value


def _coerce_cloro_or_zero(raw_value: Any) -> float | int:
    value = _coerce_cloro(raw_value)
    if value == "":
        return 0
    return value



def _load_pool_log(file_path: str) -> pd.DataFrame:
    if os.path.exists(file_path):
        df = pd.read_excel(file_path)
    else:
        df = pd.DataFrame(columns=POOL_LOG_COLUMNS)

    for col in POOL_LOG_COLUMNS:
        if col not in df.columns:
            df[col] = ""
        df[col] = df[col].astype("object")
    return df



def _row_key(row: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        str(row.get("Data", "")).strip(),
        str(row.get("TurmaCodigo", "")).strip(),
        str(row.get("TurmaLabel", "")).strip(),
        str(row.get("Horario", "")).strip(),
        str(row.get("Professor", "")).strip(),
    )



def import_retro(
    csv_path: str,
    output_path: str,
    default_year: int,
    month_filter: str | None = None,
    replace_month_data: bool = False,
) -> ImportStats:
    df_in = _read_csv(csv_path).fillna("")
    df_out = _load_pool_log(output_path)
    stats = ImportStats(read_rows=len(df_in))

    if replace_month_data and month_filter:
        month_prefix = f"{month_filter}-"
        before = len(df_out)
        keep_mask = ~df_out["Data"].astype(str).str.startswith(month_prefix)
        df_out = df_out[keep_mask].copy()
        stats.removed_existing = before - len(df_out)

    existing_index: dict[tuple[str, str, str, str, str], int] = {}
    for idx, row in df_out.iterrows():
        key = _row_key(row.to_dict())
        existing_index[key] = idx

    for _, src in df_in.iterrows():
        data_iso = _parse_retro_date(src.get("Data", ""), default_year=default_year)
        if not data_iso:
            stats.skipped_invalid_date += 1
            continue

        if month_filter and not data_iso.startswith(month_filter):
            continue

        turma_codigo = str(src.get("TurmaCodigo", "") or "").strip()
        turma_label = str(src.get("TurmaLabel", "") or "").strip()
        professor = ""
        horario = _normalize_horario(src.get("período/horario", ""))

        status_aula = str(src.get("Status_aula", "") or "normal").strip().lower() or "normal"
        nota = str(src.get("Nota", "") or "").strip().lower() or "aula"
        tipo_ocorrencia = str(src.get("Tipo_ocorrencia", "") or "").strip() or "nenhuma"

        row = {
            "Data": data_iso,
            "TurmaCodigo": turma_codigo,
            "TurmaLabel": turma_label,
            "Horario": horario,
            "Professor": professor,
            "Clima 1": str(src.get("Clima 1", "") or "").strip(),
            "Clima 2": str(src.get("Clima 2", "") or "").strip(),
            "Status_aula": status_aula,
            "Nota": nota,
            "Tipo_ocorrencia": tipo_ocorrencia,
            "Temp. (C)": _coerce_number(src.get("Temp. (C)", "")),
            "Piscina (C)": _coerce_number_or_zero(src.get("Piscina (C)", "")),
            "Cloro (ppm)": _coerce_cloro_or_zero(src.get("Cloro (ppm)", "")),
        }

        key = _row_key(row)
        if key in existing_index:
            df_out.loc[existing_index[key], POOL_LOG_COLUMNS] = [row[col] for col in POOL_LOG_COLUMNS]
            stats.updated += 1
        else:
            df_out = pd.concat([df_out, pd.DataFrame([row])], ignore_index=True)
            existing_index[key] = len(df_out) - 1
            stats.created += 1

        stats.kept_rows += 1

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df_out.to_excel(output_path, index=False)
    return stats



def main() -> None:
    parser = argparse.ArgumentParser(description="Importa clima retroativo para logPiscina.xlsx")
    parser.add_argument("--csv", required=True, help="Caminho do clima retroativo.csv")
    parser.add_argument("--year", type=int, default=2026, help="Ano padrão para datas no formato dd/mes")
    parser.add_argument("--month", default="", help="Filtro YYYY-MM (ex: 2026-02)")
    parser.add_argument(
        "--replace-month-data",
        action="store_true",
        help="Remove registros existentes do mês filtrado antes de importar",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "logPiscina.xlsx"),
        help="Caminho do arquivo logPiscina.xlsx",
    )

    args = parser.parse_args()
    month_filter = str(args.month or "").strip() or None

    stats = import_retro(
        csv_path=args.csv,
        output_path=args.output,
        default_year=args.year,
        month_filter=month_filter,
        replace_month_data=bool(args.replace_month_data),
    )

    print("Importacao concluida")
    print(f"linhas_lidas={stats.read_rows}")
    print(f"linhas_validas={stats.kept_rows}")
    print(f"criados={stats.created}")
    print(f"atualizados={stats.updated}")
    print(f"datas_invalidas={stats.skipped_invalid_date}")
    print(f"removidos_mes={stats.removed_existing}")
    print(f"arquivo_saida={args.output}")


if __name__ == "__main__":
    main()
