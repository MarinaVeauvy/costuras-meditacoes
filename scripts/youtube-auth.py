"""
YouTube OAuth2 Authentication
Run once to generate token. Opens browser for Google login.
After login, saves token to youtube/oauth-token.json
"""
import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/youtube.upload']
CLIENT_FILE = os.path.join(os.path.dirname(__file__), '..', 'youtube', 'oauth-client.json')
TOKEN_FILE = os.path.join(os.path.dirname(__file__), '..', 'youtube', 'oauth-token.json')

def main():
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

    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)

    print(f'✅ Token salvo em {TOKEN_FILE}')
    print('Agora pode rodar o upload script!')

if __name__ == '__main__':
    main()
