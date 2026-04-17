"""
Midas YouTube OAuth2 — autenticação por conta

Uso:
  python midas-yt-auth.py pros_peridade_do_reino

Gera token em: midas/state/yt-token-<account_id>.json
Reusa o oauth-client.json existente (mesma Google Cloud OAuth app).

IMPORTANTE: Antes de rodar, faça logout de todas as contas Google no navegador
padrão e deixe apenas a conta que é DONA do canal YouTube alvo.
"""
import os
import sys
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/youtube.upload']
CLIENT_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'youtube', 'oauth-client.json')

def main():
    if len(sys.argv) < 2:
        print('Uso: python midas-yt-auth.py <account_id>')
        print('Exemplo: python midas-yt-auth.py pros_peridade_do_reino')
        sys.exit(1)

    account_id = sys.argv[1]
    token_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'midas', 'state')
    os.makedirs(token_dir, exist_ok=True)
    token_file = os.path.join(token_dir, f'yt-token-{account_id}.json')

    if not os.path.exists(CLIENT_FILE):
        print(f'❌ oauth-client.json não encontrado em {CLIENT_FILE}')
        print('   Precisa criar no Google Cloud Console primeiro.')
        sys.exit(1)

    print(f'🔐 Iniciando OAuth pra conta: {account_id}')
    print(f'   Abrindo browser — faça login com a conta Google dona do canal\n')

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_FILE, SCOPES)
    credentials = flow.run_local_server(port=8095, prompt='consent')

    token_data = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': list(credentials.scopes),
    }

    with open(token_file, 'w', encoding='utf-8') as f:
        json.dump(token_data, f, indent=2)

    print(f'\n✅ Token salvo em: {token_file}')
    print(f'\nPara usar no pipeline, adicione ao .env:')
    print(f'YT_OAUTH_1=$(cat "{token_file}" | jq -c .)')

if __name__ == '__main__':
    main()
