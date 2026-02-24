#!/bin/bash
# Para Linux/Mac - coloque em ~/.bashrc ou ~/.zshrc

alias run-backend='cd "$HOME/Lista-de-Chamada-Web/backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000'
alias run-frontend='cd "$HOME/Lista-de-Chamada-Web/frontend" && npm run dev'
