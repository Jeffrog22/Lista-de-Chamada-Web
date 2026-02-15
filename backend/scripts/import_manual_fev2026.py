import unicodedata
from typing import Any

import requests

BASE_URL = "http://localhost:8000"
MONTH = "2026-02"


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.lower().strip().split())


def norm_horario(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 3:
        return f"0{digits}"
    if len(digits) >= 4:
        return digits[:4]
    return digits


def status_from_symbol(symbol: str) -> str:
    mapping = {
        "c": "Presente",
        "f": "Falta",
        "j": "Justificado",
        "*": "",
        "": "",
    }
    return mapping.get((symbol or "").strip().lower(), "")


CLIMATE_ENTRIES = [
    {"day": 3, "clima1": "Nublado", "clima2": "Agradavel", "temp": "32", "cloro": 6.0, "nota": "aula", "status": "normal"},
    {"day": 5, "clima1": "Sol", "clima2": "Agradavel", "temp": "31", "cloro": 4.0, "nota": "aula", "status": "normal"},
    {"day": 10, "clima1": "Chuvoso", "clima2": "Frio", "temp": "29", "cloro": 3.0, "nota": "aula", "status": "normal"},
    {"day": 12, "clima1": "Parcialmente Nublado", "clima2": "Calor", "temp": "29", "cloro": 2.5, "nota": "aula", "status": "normal"},
    {"day": 17, "clima1": "", "clima2": "", "temp": "", "cloro": None, "nota": "feriado", "status": "cancelada"},
]


BLOCKS = [
    {
        "turma": "Terça e Quinta",
        "horario": "08h00",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Ana Julia Bonfim dos Santos": ["j", "c", "j", "j", "*"],
            "Henry Brito de Oliveira": ["j", "c", "j", "c", "*"],
            "Kevin Miguel do Nascimento Pardinho": ["j", "f", "j", "f", "*"],
            "Kleber Vinicius Gonçalves": ["j", "f", "c", "c"],
            "Luara Karolina de Torres": ["j", "f", "j", "c", "*"],
            "Pietro dos Santos Cruz": ["j", "f", "j", "c", "*"],
            "Samuel Marino Ribeiro": ["j", "c", "j", "c", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "08h45",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Arthur Abreu Pinho": ["j", "c", "c", "f", "*"],
            "Erick Gabriel Pereira da Souza": ["j", "c", "j", "c", "*"],
            "Larissa Araujo Pereira": ["j", "f", "c", "c", "*"],
            "Lucas Bernardo Carvalho Silva": ["j", "c", "j", "f", "*"],
            "Matheus Henrique Araújo Oliveira": ["j", "c", "j", "c", "*"],
            "Paulo Manoel Oliveira Braga": ["c", "c", "c", "c", "*"],
            "Rafael Nascimento dos Anjos": ["j", "c", "j", "c", "*"],
            "Yasmin Gabrielly Teófilo de Souza": ["c", "c", "j", "c", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "10h15",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Davi Luis Araujo Pereira": ["j", "f", "j", "c", "*"],
            "Emilly Araújo Silva": ["j", "c", "j", "c", "*"],
            "Lucas Matias dos Santos": ["j", "f", "j", "f", "*"],
            "Nicole Oliveira da Silva": ["j", "c", "j", "f", "*"],
            "Roberta Costa Soares": ["c", "f", "c", "j"],
            "Vinícius Oliveira da Silva": ["j", "c", "c", "f", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "11h00",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Elson Herly da Silva": ["c", "c", "c", "c"],
            "Geise Ribeiro Souza": ["c", "c", "j", "c", "*"],
            "José Carlos da Silva": ["c", "c", "j", "c", "*"],
            "Ricardo Ferragut Gallo": ["c", "j", "c", "c"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "13h00",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Evellyn Carolline Alves da Silva": ["j", "c", "j", "f", "*"],
            "Fernando Ribeiro de Lima": ["c", "c", "c", "c", "*"],
            "Guilherme Henrique Meira de Oliveira": ["j", "f", "j", "f", "*"],
            "Heloísa Anderson Navero": ["c", "c", "j", "c", "*"],
            "Joaquim Miguel": ["j", "c", "c", "c", "*"],
            "Matheus Alves Martins": ["c", "c", "j", "c", "*"],
            "Sophia Characomo Albino": ["j", "f", "j", "f", "*"],
            "Yasmin de Oliveira Silva Pereira": ["c", "c", "j", "c", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "13h45",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Allana Micaela dos Santos Oliveira": ["j", "c", "j", "c", "*"],
            "Arthur Tonetti de Andrade": ["j", "f", "j", "f", "*"],
            "Bianca Rodrigues Franco": ["j", "f", "c", "f", "*"],
            "Davi Lorenzo de Araújo": ["c", "c", "j", "c", "*"],
            "João Cadorin Cintra": ["c", "c", "c", "c", "*"],
            "Juan Pablo Costa Silva": ["j", "f", "c", "c", "*"],
            "Julia Barros Camargo": ["j", "f", "j", "f", "*"],
            "Matheus Facundo de Carvalho": ["j", "f", "j", "f", "*"],
            "Miguel dos Santos Barreto": ["c", "c", "c", "c", "*"],
            "Miguel Vitor Alves dos Santos": ["j", "f", "j", "f", "*"],
            "Pedro Duarte Martins": ["c", "c", "c", "c", "*"],
            "Pedro Emanoel Alves de Souza": ["j", "f", "j", "f", "*"],
            "Suzana Oliveira de Lima": ["j", "j", "j", "j", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "15h15",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Ana Julia da Silva Almeida": ["j", "c", "c", "j", "*"],
            "Ana Laura Ramos Flores": ["j", "j", "", "", "*"],
            "Helena Bezerra de Oliveira Bispo": ["c", "c", "c", "c", "*"],
            "Isabelly Santos Cavalcante": ["j", "c", "j", "c", "*"],
            "Lorenna Marineide de Jesus": ["j", "c", "c", "c", "*"],
            "Maria Eduarda Garcia": ["j", "c", "j", "c", "*"],
            "Maria Luiza Presti Resende": ["j", "c", "j", "c", "*"],
            "Rebeca da Silva Santos": ["j", "c", "j", "c", "*"],
            "Sarah Barbosa da Silva": ["j", "c", "j", "j", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "16h00",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Nilton de Oliveira Fernandes": ["j", "f", "j", "j", "*"],
            "Reinaldo Pires do Prado": ["c", "f", "j", "j", "*"],
            "Renan Francisco Souza Oliveira": ["j", "f", "j", "j", "*"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "08h00",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Bianca Almeida de Moura Coelho": ["j", "c", "j", "f"],
            "Augusto de Almeida": ["j", "c", "j", "c"],
            "Bruno Nunes Marques": ["c", "c", "j", "f"],
            "José Francisco da Silva": ["c", "c", "j", "c"],
            "Katia Cilene Tibúrcio da Silva": ["c", "c", "j", "c"],
            "Liliam de Sales Cambraia": ["c", "c", "c", "c"],
            "Lucas Cordeiro da Silva": ["j", "c", "c", "c"],
            "Samuel Ometto Franco": ["c", "f", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "09h30",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "João Miguel de Souza Silva": ["c", "c", "j", "c"],
            "Helloisa de Jesus Inez": ["c", "f", "j", "c"],
            "João Miguel Lima França": ["c", "j", "c", "c", "j", "j"],
            "Laura Ferreira Barbosa": ["j", "f", "j", "f"],
            "Lua Machado Pereira": ["c", "c", "c", "c"],
            "Matheus Henrique de Souza Marciano": ["c", "c", "j", "c"],
            "Miguel Soares Bastos": ["c", "c", "j", "c"],
            "Pedro Henrique Carvalho de Araújo": ["c", "c", "c", "c"],
            "Rafaela Aguiar Prata": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "13h45",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Giovana Silva dos Santos": ["j", "c", "j", "f"],
            "Livia Oliveira Alexandre": ["j", "f", "j", "c"],
            "Raquel Siqueira Sabino": ["c", "c", "j", "c"],
            "Rebeca Siqueira Sabino": ["c", "c", "j", "c"],
            "Benjamin Nardi": ["c", "c", "c", "c"],
            "Gabriella Modenez Oliveira": ["c", "c", "c", "c"],
            "Helena Santos Machado": ["c", "c", "c", "c"],
            "Isadora Aparecida Barbosa": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "15h15",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Davi Gabriel Estevao": ["c", "j", "j", "c"],
            "Gabriella Ferrarezi Evangelista": ["j", "j", "j", "j"],
            "Guilherme Mancini de Moraes": ["j", "j", "c", "c"],
            "Heitor Josué de Queiroz": ["j", "j", "j", "f"],
            "Leonardo de Souza do Carmo": ["j", "c", "j", "c"],
            "Lorena dos Reis França Oliveira": ["j"],
            "Lucas Samuel Quintilho": ["j", "f", "j", "c"],
            "Thamyres Miranda Rodrigues": ["j", "j", "j", "f"],
            "Victor Hugo Oliveira dos Santos": ["j", "j", "j", "f"],
            "William Souza dos Santos Santana": ["c", "c", "j", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "16h00",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Anderson Cleiton Alves Garcia": ["c", "c", "c", "c"],
            "Daniel Carlos de Oliveira de Melo": ["j", "j", "j", "c"],
            "João Victor Oliveira Alexandre": ["j", "j", "j", "j"],
            "Rayssa de Oliveira de Melo": ["j", "j", "j", "c"],
            "Alana Oliveira de Melo": ["c", "c", "j", "j"],
        },
    },
]


def load_bootstrap() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    response = requests.get(f"{BASE_URL}/api/bootstrap", timeout=30)
    response.raise_for_status()
    payload = response.json()
    return payload.get("classes", []), payload.get("students", [])


def main() -> None:
    classes, students = load_bootstrap()

    class_by_id = {c["id"]: c for c in classes}

    students_by_name: dict[str, list[dict[str, Any]]] = {}
    students_by_class: dict[int, set[str]] = {}
    for st in students:
        name_key = normalize_name(st.get("nome", ""))
        if not name_key:
            continue
        students_by_name.setdefault(name_key, []).append(st)
        class_id = st.get("class_id")
        if class_id is not None:
            students_by_class.setdefault(class_id, set()).add(name_key)

    imported_blocks = 0
    imported_records = 0
    ignored_students = 0

    for block in BLOCKS:
        turma = block["turma"]
        horario_target = norm_horario(block["horario"])
        date_keys = [f"{MONTH}-{str(d).zfill(2)}" for d in block["dates"]]

        candidates = [
            c
            for c in classes
            if (c.get("turma_label") or "").strip() == turma
            and norm_horario(c.get("horario") or "") == horario_target
        ]
        if not candidates:
            continue

        bucket_by_class: dict[int, list[tuple[str, list[str]]]] = {c["id"]: [] for c in candidates}

        for student_name, symbols in block["rows"].items():
            name_key = normalize_name(student_name)
            matched_class_id = None

            candidate_students = students_by_name.get(name_key, [])
            for st in candidate_students:
                class_id = st.get("class_id")
                if class_id in bucket_by_class:
                    matched_class_id = class_id
                    break

            if matched_class_id is None:
                ignored_students += 1
                continue

            filled = list(symbols) + [""] * max(0, len(date_keys) - len(symbols))
            filled = filled[: len(date_keys)]
            bucket_by_class[matched_class_id].append((student_name, filled))

        for class_id, rows in bucket_by_class.items():
            if not rows:
                continue
            cls = class_by_id[class_id]
            registros = []
            for student_name, symbols in rows:
                attendance = {
                    date_key: status_from_symbol(symbol)
                    for date_key, symbol in zip(date_keys, symbols)
                }
                registros.append({
                    "aluno_nome": student_name,
                    "attendance": attendance,
                })

            payload = {
                "turmaCodigo": cls.get("codigo") or "",
                "turmaLabel": cls.get("turma_label") or cls.get("codigo") or "",
                "horario": str(cls.get("horario") or ""),
                "professor": cls.get("professor") or "",
                "mes": MONTH,
                "registros": registros,
            }
            response = requests.post(f"{BASE_URL}/attendance-log", json=payload, timeout=30)
            response.raise_for_status()
            imported_blocks += 1
            imported_records += len(registros)

    for item in CLIMATE_ENTRIES:
        day = str(item["day"]).zfill(2)
        payload = {
            "data": f"{MONTH}-{day}",
            "turmaCodigo": "",
            "turmaLabel": "",
            "horario": "",
            "professor": "",
            "clima1": item["clima1"],
            "clima2": item["clima2"],
            "statusAula": item["status"],
            "nota": item["nota"],
            "tipoOcorrencia": "",
            "tempExterna": item["temp"],
            "tempPiscina": "",
            "cloroPpm": item["cloro"],
        }
        response = requests.post(f"{BASE_URL}/pool-log", json=payload, timeout=30)
        response.raise_for_status()

    print("Import concluído")
    print(f"Blocos de chamada gravados: {imported_blocks}")
    print(f"Registros de alunos gravados: {imported_records}")
    print(f"Alunos ignorados (não encontrados no projeto): {ignored_students}")
    print(f"Climas gravados: {len(CLIMATE_ENTRIES)}")


if __name__ == "__main__":
    main()
