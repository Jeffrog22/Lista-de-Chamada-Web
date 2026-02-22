#!/usr/bin/env python3
import requests
import os
from pathlib import Path

BASE = os.getenv('API_BASE', 'http://127.0.0.1:8000')

def create_admin():
    # runs create_admin.py logic directly via import
    try:
        from create_admin import create_user
        create_user()
    except Exception:
        # fallback: try to execute script
        os.system(f'"{os.path.join(os.getcwd(), ".venv", "Scripts", "python.exe")}" create_admin.py')

def get_token(username='admin', password='123456'):
    url = f'{BASE}/token'
    resp = requests.post(url, data={'username': username, 'password': password}, timeout=10)
    resp.raise_for_status()
    return resp.json().get('access_token')

def post_csv(path: Path, token: str):
    url = f'{BASE}/api/import-data'
    headers = {'Authorization': f'Bearer {token}'}
    with open(path, 'rb') as f:
        files = {'file': (path.name, f, 'text/csv')}
        resp = requests.post(url, files=files, headers=headers, timeout=60)
    return resp

def main():
    create_admin()
    try:
        token = get_token()
    except Exception as e:
        print('Failed to get token:', e)
        return 2

    csv_path = Path(__file__).resolve().parent.parent.parent / 'data' / 'templates' / 'import-data.template.csv'
    if not csv_path.exists():
        print('CSV not found:', csv_path)
        return 3

    print('Uploading', csv_path)
    try:
        resp = post_csv(csv_path, token)
        print('status', resp.status_code)
        try:
            print(resp.json())
        except Exception:
            print(resp.text[:1000])
    except Exception as e:
        print('upload error', e)
        return 4

    return 0

if __name__ == '__main__':
    raise SystemExit(main())
