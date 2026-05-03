from app.main import ExcelExportPayload, ReportClass, ReportStudent, _resolve_export_targets


def test_resolve_export_targets_falls_back_to_turma_and_horario_when_professor_differs():
    reports = [
        ReportClass(
            turma="Terça e Quinta",
            turmaCodigo="INF-A",
            horario="18:30",
            professor="Professor João",
            nivel="Iniciante",
            hasLog=True,
            alunos=[
                ReportStudent(
                    id="1",
                    student_uid=None,
                    nome="Ana Silva",
                    presencas=1,
                    faltas=0,
                    justificativas=0,
                    frequencia=100.0,
                    historico={},
                )
            ],
        )
    ]

    payload = ExcelExportPayload(
        month="2026-03",
        classes=[
            {
                "turma": "Terça e Quinta",
                "horario": "18:30",
                "professor": "Professor A",
            }
        ],
    )

    selected = _resolve_export_targets(payload, reports)

    assert len(selected) == 1
    assert selected[0].professor == "Professor João"
    assert selected[0].turmaCodigo == "INF-A"