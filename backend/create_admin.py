# -*- coding: utf-8 -*-
from sqlmodel import Session, select
# Ajuste os imports abaixo conforme seu projeto:
from app.database import engine  # ou de onde você exporta a engine
from app.models import User      # certifique-se que o model User existe
from app.auth import get_password_hash # se tiver função de hash

def create_user():
    with Session(engine) as session:
        # Verifica se já existe
        existing = session.exec(select(User).where(User.username == "admin")).first()
        if existing:
            print("Usuario admin ja existe.")
            return

        user = User(
            username="admin",
            # Se usar hash:
            password_hash=get_password_hash("123456"),
            role="admin"
        )
        session.add(user)
        session.commit()
        print("Usuario admin criado com sucesso!")

if __name__ == "__main__":
    create_user()
