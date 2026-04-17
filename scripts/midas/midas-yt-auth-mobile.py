"""
Midas YouTube OAuth — Fluxo manual pra quando conta Google só está no celular.

Uso:
  1. Python imprime uma URL
  2. User abre URL no celular (logada na conta certa)
  3. Autoriza
  4. Browser redireciona pra http://localhost:8095/?code=... (que vai dar erro)
  5. User copia a URL inteira da barra de endereço e cola de volta no script

python midas-yt-auth-mobile.py <account_id>
"""
import os
import sys
import json
from urllib.parse import urlparse, parse_qs
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from google_auth_oauthlib.flow import Flow

SCOPES = ['https://www.googleapis.com/auth/youtube.upload']
CLIENT_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'youtube', 'oauth-client.json')
REDIRECT_URI = 'http://localhost:8095/'

def main():
    if len(sys.argv) < 2:
        print('Uso: python midas-yt-auth-mobile.py <account_id>')
        sys.exit(1)

    account_id = sys.argv[1]
    token_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'midas', 'state')
    os.makedirs(token_dir, exist_ok=True)
    token_file = os.path.join(token_dir, f'yt-token-{account_id}.json')

    # Cria o flow
    flow = Flow.from_client_secrets_file(CLIENT_FILE, scopes=SCOPES, redirect_uri=REDIRECT_URI)

    # Gera URL de autorização
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        include_granted_scopes='true',
    )

    print('='*70)
    print('PASSO 1 — Abra esse URL no celular (logada em prosperidadedoreino2@gmail.com):')
    print()
    print(auth_url)
    print()
    print('='*70)
    print('PASSO 2 — Autorize o app')
    print('PASSO 3 — O navegador vai tentar ir pra localhost e dar erro (OK, normal)')
    print('PASSO 4 — Copia a URL COMPLETA da barra de endereço')
    print('           (vai ser algo como http://localhost:8095/?state=XXX&code=YYY&scope=...)')
    print('='*70)
    print()
    print('Cola a URL inteira aqui e aperta Enter:')
    pasted = input('> ').strip()

    # Extrai o code
    parsed = urlparse(pasted)
    params = parse_qs(parsed.query)
    code = params.get('code', [None])[0]

    if not code:
        print('❌ URL inválida, code não encontrado')
        sys.exit(1)

    # Troca code por tokens
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        print(f'❌ Falha ao trocar code: {e}')
        sys.exit(1)

    creds = flow.credentials
    token_data = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': list(creds.scopes),
    }

    with open(token_file, 'w', encoding='utf-8') as f:
        json.dump(token_data, f, indent=2)

    print(f'\n✅ Token salvo em: {token_file}')

if __name__ == '__main__':
    main()
