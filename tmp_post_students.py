import json, urllib.request
names=['Bruna Mendonça Fillol','Jéssica Fernanda Frassi']
url='https://lista-de-chamada-web.onrender.com/api/import-students'
for name in names:
    data=json.dumps({'nome':name}).encode('utf-8')
    req=urllib.request.Request(url, data=data, headers={'Content-Type':'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(req) as resp:
            body=resp.read().decode('utf-8')
            print('OK', name, body)
    except urllib.error.HTTPError as e:
        print('ERR', name, e.code, e.read().decode('utf-8'))
    except Exception as e:
        print('EXC', name, str(e))
