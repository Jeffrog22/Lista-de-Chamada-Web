from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from sqlmodel import Session, select
from app.database import create_db_and_tables, get_session
from app import crud, models
from typing import List, Optional
import os
import pandas as pd
import requests
from pydantic import BaseModel
from app.etl.import_excel import import_from_excel
from app.auth import get_password_hash, create_access_token, authenticate_user, get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lista-de-Chamada - API")

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    data_dir = os.path.join(os.getcwd(), "data")
    os.makedirs(data_dir, exist_ok=True)

@app.get("/health")
def health():
    return {"status": "ok"}

class PoolLogEntryModel(BaseModel):
    data: str
    clima1: str
    clima2: str
    statusAula: str
    nota: str
    tipoOcorrencia: str
    tempExterna: Optional[str] = ""
    tempPiscina: Optional[str] = ""
    cloroPpm: Optional[float] = None

@app.get("/weather")
def get_weather(date: str):
    token = os.getenv("CLIMATEMPO_TOKEN")
    base_url = os.getenv("CLIMATEMPO_BASE_URL")
    lat = os.getenv("CLIMATEMPO_LAT", "-23.049194")
    lon = os.getenv("CLIMATEMPO_LON", "-47.007278")

    if not token or not base_url:
        return {"temp": "26", "condition": "Parcialmente Nublado"}

    try:
        resp = requests.get(
            base_url,
            params={"token": token, "lat": lat, "lon": lon, "date": date},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        temp = (
            data.get("temp")
            or data.get("temperature")
            or data.get("data", {}).get("temperature")
            or "26"
        )
        condition = (
            data.get("condition")
            or data.get("text")
            or data.get("data", {}).get("condition")
            or "Parcialmente Nublado"
        )
        return {"temp": str(temp), "condition": str(condition)}
    except Exception:
        return {"temp": "26", "condition": "Parcialmente Nublado"}

@app.post("/pool-log")
def append_pool_log(entry: PoolLogEntryModel):
    try:
        data_dir = os.path.join(os.getcwd(), "data")
        os.makedirs(data_dir, exist_ok=True)
        file_path = os.path.join(data_dir, "logPiscina.xlsx")

        columns = [
            "Data",
            "Clima 1",
            "Clima 2",
            "Status_aula",
            "Nota",
            "Tipo_ocorrencia",
            "Temp. (C)",
            "Piscina (C)",
            "Cloro (ppm)",
        ]

        if os.path.exists(file_path):
            df = pd.read_excel(file_path)
        else:
            df = pd.DataFrame(columns=columns)

        row = {
            "Data": entry.data,
            "Clima 1": entry.clima1,
            "Clima 2": entry.clima2,
            "Status_aula": entry.statusAula,
            "Nota": entry.nota,
            "Tipo_ocorrencia": entry.tipoOcorrencia,
            "Temp. (C)": entry.tempExterna or "",
            "Piscina (C)": entry.tempPiscina or "",
            "Cloro (ppm)": "" if entry.cloroPpm is None else entry.cloroPpm,
        }

        if "Data" in df.columns and (df["Data"].astype(str) == entry.data).any():
            df.loc[df["Data"].astype(str) == entry.data, columns] = [
                row["Data"],
                row["Clima 1"],
                row["Clima 2"],
                row["Status_aula"],
                row["Nota"],
                row["Tipo_ocorrencia"],
                row["Temp. (C)"],
                row["Piscina (C)"],
                row["Cloro (ppm)"],
            ]
            action = "updated"
        else:
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            action = "created"

        df.to_excel(file_path, index=False)
        return {"ok": True, "action": action, "file": file_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"pool-log error: {exc}")

@app.get("/pool-log")
def get_pool_log(date: str):
    try:
        data_dir = os.path.join(os.getcwd(), "data")
        file_path = os.path.join(data_dir, "logPiscina.xlsx")
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="log not found")

        df = pd.read_excel(file_path)
        if "Data" not in df.columns:
            raise HTTPException(status_code=404, detail="data column not found")

        match = df[df["Data"].astype(str) == date]
        if match.empty:
            raise HTTPException(status_code=404, detail="entry not found")

        row = match.iloc[0].to_dict()
        return {
            "data": str(row.get("Data", "")),
            "clima1": str(row.get("Clima 1", "")),
            "clima2": str(row.get("Clima 2", "")),
            "statusAula": str(row.get("Status_aula", "")),
            "nota": str(row.get("Nota", "")),
            "tipoOcorrencia": str(row.get("Tipo_ocorrencia", "")),
            "tempExterna": str(row.get("Temp. (C)", "")),
            "tempPiscina": str(row.get("Piscina (C)", "")),
            "cloroPpm": row.get("Cloro (ppm)", None),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"pool-log read error: {exc}")

# Users endpoints (bootstrap)
@app.post("/users/register")
def register_user(username: str, password: str, session: Session = Depends(get_session)):
    stmt = select(models.User).where(models.User.username == username)
    existing = session.exec(stmt).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    user = models.User(username=username, password_hash=get_password_hash(password), role="admin")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"username": user.username, "id": user.id}

@app.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# Data endpoints
@app.get("/students", response_model=List[models.Student])
def list_students(limit: int = 100, session: Session = Depends(get_session)):
    return crud.get_students(session, limit)

@app.post("/students", response_model=models.Student)
def add_student(student: models.Student, session: Session = Depends(get_session)):
    return crud.create_student(session, student)

@app.delete("/students/{student_id}")
def delete_student(student_id: int, session: Session = Depends(get_session)):
    student = session.get(models.Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    session.delete(student)
    session.commit()
    return {"ok": True}

@app.get("/classes", response_model=List[models.ClassModel])
def list_classes(session: Session = Depends(get_session)):
    return crud.get_classes(session)

@app.post("/classes", response_model=models.ClassModel)
def add_class(class_model: models.ClassModel, session: Session = Depends(get_session)):
    return crud.create_class(session, class_model)

@app.get("/attendance", response_model=List[models.Attendance])
def list_attendance(session: Session = Depends(get_session)):
    statement = session.exec(select(models.Attendance))
    return statement.all()

@app.post("/attendance", response_model=models.Attendance)
def add_attendance(attendance: models.Attendance, session: Session = Depends(get_session)):
    return crud.create_attendance(session, attendance)

# Import endpoint (protected) - accepts uploaded file or file param (file must be in data/)
@app.post("/import")
def import_excel(
    file: Optional[str] = Query(None, description="Nome do arquivo em /app/data/"),
    out_clean: Optional[bool] = Query(False, description="Salvar arquivo cleaned em data/"),
    upload: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
):
    data_dir = os.path.join(os.getcwd(), "data")
    os.makedirs(data_dir, exist_ok=True)

    if upload:
        dest_path = os.path.join(data_dir, upload.filename)
        with open(dest_path, "wb") as f:
            f.write(upload.file.read())
        file_path = dest_path
    elif file:
        file_path = os.path.join(data_dir, file)
    else:
        raise HTTPException(status_code=400, detail="No file provided")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    out_cleaned_path = None
    if out_clean:
        base = os.path.basename(file_path)
        out_cleaned_path = os.path.join(data_dir, f"{base}.cleaned.xlsx")

    result = import_from_excel(file_path, session, out_cleaned=out_cleaned_path)
    response = {"imported": result["counts"], "mapping": result["mapping"]}
    if result.get("cleaned_path"):
        response["cleaned_path"] = os.path.basename(result["cleaned_path"])
    return response

# File download endpoint
@app.get("/files/{filename}")
def download_file(filename: str):
    data_dir = os.path.join(os.getcwd(), "data")
    path = os.path.join(data_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)
