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


BLOCKS = [
    {
        "turma": "Terça e Quinta",
        "horario": "08h00",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Ana Cristina Goldberger": ["j", "c", "j", "c"],
            "Arthur Macienti": ["j", "f", "j", "c"],
            "Fabiola Santos Marques da Silva": ["j", "c", "j", "f", "*"],
            "Felipe Gonçalves dos Santos": ["j", "c", "c", "f"],
            "Heloísa Rainha Stradioto": ["c", "c", "j", "f"],
            "Karen Pereira Martins": ["j", "f", "j", "c", "*"],
            "Lavinia Evangelista dos Santos": ["j", "c", "j", "f"],
            "Maria Laura Paiva da Silva": ["j", "j", "j", "j"],
            "Matheus Henrique Liboni dos Santos": ["c", "c", "c", "c"],
            "Nicholas de Araújo Silva": ["c", "c", "j", "c"],
            "Welpy Pereira Nunes Rodrigues": ["j", "f", "j", "f"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "08h45",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Alice Marino Ribeiro": ["j", "c", "j", "c"],
            "Arielly Luiza Machado Silva": ["j", "f", "c", "c"],
            "Gabrielly Leal Marino": ["j", "c", "j", "c"],
            "Isabelly Pires da Silva Leopoldo": ["c", "c", "c", "c"],
            "Lorena Galdino Leal Ferres": ["j", "f", "j", ""],
            "Lucas Oliveira dos Santos": ["c", "f", "j", "f"],
            "Maria Eduarda de Carvalho Falaschi": ["c", "c", "j", "f"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "10h15",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Heloísa Silva Nascimento da Costa": ["j", "c", "j", "c"],
            "Kaleo de Oliveira Almeida": ["c", "f", "c", "c"],
            "Lucas Henrique de Assis": ["c", "c", "c", "c"],
            "Luiz Felipe Lima Ladeia": ["j", "f", "j", "f"],
            "Pedro Henrique Silva Souza": ["c", "c", "c", "c"],
            "Samuel Martins Cortiella de Moraes": ["j", "c", "j", "c"],
            "Sofia Helena Silva Santos": ["j", "f", "j", "f"],
            "Yasmim Vitória de Oliveira": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "11h00",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Ana Paula Pinto Liboni": ["c", "c", "c", "c"],
            "Eldirlei Cruz": ["j", "c", "c", "f", "*"],
            "Fabio Antunes de Oliveira Ramos": ["c", "c", "c", "c"],
            "Larissa Cristina Cruz": ["j", "f", "j", "f"],
            "Lécia Francisca da Silva": ["c", "c", "j", "c", "*"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "13h00",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Alice Soares Batista": ["c", "c", "c", "c"],
            "Alice Sophia Dias Silva": ["j", "c", "c", "c"],
            "Lorena Costalonga": ["j", "c", "c", "c"],
            "Manuella Ferreira Lima": ["j", "c", "c", "f"],
            "Maria Heloísa Vieira Dutra": ["c", "j", "f", "f"],
            "Maria Raphaelly Candida Silva": ["j", "j", "j", "j"],
            "Otávio Azi de Matos": ["j", "c", "c", "c"],
            "Pedro Silva de Oliveira Neto": ["c", "c", "c", "c"],
            "Raphaella Agatha Candida Silva": ["j", "j", "j", "j"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "13h45",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Alice Gabrielly de Souza": ["j", "f", "c", "c"],
            "Ana Clara Batista": ["j", "c", "j", "c"],
            "Caíque Amorim Torezin": ["j", "f", "j", "c"],
            "Davi Francisco da Silva Sousa": ["c", "c", "j", "f"],
            "Guilherme Santos Cavalcante": ["c", "c", "j", "j"],
            "Isabella Aparecida Quintilho": ["c", "c", "c", "c"],
            "Julia Quintilho Carrera": ["c", "c", "c", "c"],
            "Luisa Barbosa Santos": ["j", "f", "c", "c"],
            "Manuella Eduarda Padilha de Souza": ["j", "c", "c", "c"],
            "Mateus Gomes Pacheco": ["c", "c", "c", "c"],
            "Ricardo Henrique Goldberger": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "15h15",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Augusto Lira Cruvinel Machado": ["c", "c", "c"],
            "Arthur de Souza Leal": ["c", "c", "j"],
            "Daniel Ribeiro Ventura": ["j", "c", "j"],
            "Emmanuel Bernardo da Silva": ["c", "c", "j"],
            "Isabelle Felix dos Santos": ["j", "f", "c"],
            "Marcos do Nascimento Leal": ["j", "f", "j"],
            "Marcos José Oliveira Alexandre": ["j", "f", "j"],
            "Patrick Iezo Antunes Ramos": ["c", "c", "c"],
            "Pedro Henrique Godoy Filho": ["j", "c", "j"],
            "Pedro Oliveira Malveiro": ["j", "j", "j"],
            "Rafaela Gomes Carvalho": ["j", "f", "j"],
            "Vitoria Santos Cavalcante": ["j", "c", "j"],
            "Yane Mendonça Oliveira": ["j", "c", "c"],
        },
    },
    {
        "turma": "Terça e Quinta",
        "horario": "16h00",
        "professor": "Daniela",
        "dates": [3, 5, 10, 12, 17, 19, 24, 26],
        "rows": {
            "Beatriz Feitosa Bezerra": ["j", "f", "f", "c"],
            "Ed Carlos de Oliveira": ["c", "f", "c", "f"],
            "Edna Lucia de Almeida Cruz": ["j", "c", "j", "j"],
            "Glaucia Yoko Baba": ["c", "c", "j", "c"],
            "Luis Pereira de Oliveira": ["c", "c", "c", "c"],
            "Matheus Araujo dos Santos Toquero": ["j", "f", "j", "c"],
            "Willian Silva Oliveira": ["j", "j", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "08h00",
        "professor": "Daniela",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Elza Pereira Amorim Torezin": ["j", "f", "j", "c"],
            "Priscila Moraes Lopes": ["j", "f", "j", "j"],
            "Rodrigo Gregório da Silva": ["c", "f", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "10h15",
        "professor": "Daniela/Jefferson",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Allana Beatriz da Cruz Francisco": ["c", "c", "j", "c"],
            "Alice Soares Cunha": ["c", "c", "j", "f"],
            "Ana Clara Pereira de Souza": ["c", "c", "c", "c"],
            "Aylla Victória Silva Souza": ["c", "c", "j", "c"],
            "Isaque Galdino Autor": ["c", "c", "c", "c"],
            "Lorenna Silva Ribeiro": ["c", "c", "c", "c"],
            "Natalia Silva de Souza": ["c", "c", "c", "c"],
            "Nicole Yasmin Silveira dos Santos": ["c", "c", "c", "c"],
            "Lorena Vitória Silveira dos Santos": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "13h00",
        "professor": "Daniela/Jefferson",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Alice Lohane Silva": ["c", "c", "c", "c"],
            "Arthur Guilherme Lima Santos": ["c", "c", "c", "c"],
            "Felipe Marques de Melo": ["c", "c", "c", "j"],
            "Ingrid Lohana Silva": ["c", "c", "c", "c"],
            "Lívia Meira de Oliveira": ["j", "c", "c", "f"],
            "Nayla Mota de Matos": ["c", "c", "j", "c"],
            "Sophia Marques Forner": ["c", "c", "c", "c"],
            "Valentina Marques de Melo": ["c", "c", "c", "c"],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "15h15",
        "professor": "Daniela",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Eduarda Ferreira Gomes Gregório": ["j", "j", "j", "j"],
            "Gabriel Souza de Oliveira": ["c", "j", "j", "c"],
            "Kamilly Vitória da Silva Melo": ["j", "j", "j", "c"],
            "Lucas Quintilho de Sousa": ["c", "c", "c", "j"],
            "Matheus Henrique Bonfim dos Santos": ["c", "c", "j", "f"],
            "Rebecca de Amorim Meggiato": ["j", "c", "j", "c"],
            "Victória Souza de Oliveira": ["c", "c", "j", "c"],
            "Vitor Alves Godoi": ["", "", "", ""],
        },
    },
    {
        "turma": "Quarta e Sexta",
        "horario": "16h00",
        "professor": "Daniela",
        "dates": [4, 6, 11, 13, 18, 20, 25, 27],
        "rows": {
            "Aline Manoela Ferreira": ["j", "j", "j", "f"],
            "Luiza Araujo de Oliveira de Melo": ["j", "j", "j", "f"],
            "Raimunda Maria da Silva Souza": ["j", "j", "j", "c"],
        },
    },
]


def load_bootstrap() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    response = requests.get(f"{BASE_URL}/api/bootstrap", timeout=30)
    response.raise_for_status()
    payload = response.json()
    return payload.get("classes", []), payload.get("students", [])


def professor_matches(class_professor: str, block_professor: str) -> bool:
    class_norm = normalize_name(class_professor)
    tokens = [normalize_name(part) for part in str(block_professor or "").split("/") if part.strip()]
    if not tokens:
        return True
    return any(token and token in class_norm for token in tokens)


def main() -> None:
    classes, students = load_bootstrap()
    class_by_id = {c["id"]: c for c in classes}

    students_by_name: dict[str, list[dict[str, Any]]] = {}
    for st in students:
        name_key = normalize_name(st.get("nome", ""))
        if not name_key:
            continue
        students_by_name.setdefault(name_key, []).append(st)

    imported_blocks = 0
    imported_records = 0
    ignored: list[tuple[str, str, str]] = []

    for block in BLOCKS:
        turma = block["turma"]
        horario_target = norm_horario(block["horario"])
        date_keys = [f"{MONTH}-{str(d).zfill(2)}" for d in block["dates"]]

        candidates = [
            c
            for c in classes
            if (c.get("turma_label") or "").strip() == turma
            and norm_horario(c.get("horario") or "") == horario_target
            and professor_matches(c.get("professor") or "", block.get("professor") or "")
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
                ignored.append((block["turma"], block["horario"], student_name))
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

    print("Import Daniela concluído")
    print(f"Blocos gravados: {imported_blocks}")
    print(f"Registros de alunos gravados: {imported_records}")
    print(f"Alunos ignorados: {len(ignored)}")
    if ignored:
        for turma, horario, nome in ignored:
            print(f"- {turma} {horario}: {nome}")


if __name__ == "__main__":
    main()
