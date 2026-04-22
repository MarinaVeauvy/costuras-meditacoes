"""
YouTube single video uploader.
Usage: python youtube-upload-single.py <video.mp4> <metadata.json>
Prints VIDEO_ID:<id> on success. Exits non-zero on error.
"""
import json
import os
import sys

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
TOKEN_FILE = os.path.join(REPO_ROOT, 'youtube', 'oauth-token.json')


def ensure_token():
    env_token = os.environ.get('YOUTUBE_OAUTH_TOKEN')
    if env_token and not os.path.exists(TOKEN_FILE):
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            f.write(env_token)


def get_credentials():
    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
        td = json.load(f)
    creds = Credentials(
        token=td['token'],
        refresh_token=td['refresh_token'],
        token_uri=td['token_uri'],
        client_id=td['client_id'],
        client_secret=td['client_secret'],
        scopes=td['scopes'],
    )
    if creds.expired:
        creds.refresh(Request())
        td['token'] = creds.token
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(td, f, indent=2)
    return creds


def main():
    if len(sys.argv) < 3:
        print('Usage: youtube-upload-single.py <video.mp4> <metadata.json>', file=sys.stderr)
        sys.exit(2)

    video_path = sys.argv[1]
    meta_path = sys.argv[2]

    if not os.path.exists(video_path):
        print(f'ERROR: video not found: {video_path}', file=sys.stderr)
        sys.exit(3)
    if not os.path.exists(meta_path):
        print(f'ERROR: metadata not found: {meta_path}', file=sys.stderr)
        sys.exit(4)

    ensure_token()
    creds = get_credentials()
    youtube = build('youtube', 'v3', credentials=creds)

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    title = (meta.get('youtube_title') or meta.get('article_title') or 'Video')[:100]
    yt_desc = meta.get('youtube_description')
    description = yt_desc or meta.get('description') or ''
    article_url = meta.get('article_url', '')

    # youtube_description já vem montada pelo factory (buildDescription com CTA afiliado)
    # se vier, usa direto — caso contrário adiciona footer legado
    if yt_desc:
        full_desc = description
    else:
        full_desc = f"{description}\n\n"
        if article_url:
            full_desc += f"Artigo completo: {article_url}\n\n"
        full_desc += "---\nMarina Veauvy - Financas e IA para Empreendedoras\n"
        full_desc += "Blog: https://wp.marinaveauvy.com.br\n"
        full_desc += "Ferramentas: https://marinaveauvy.github.io/costuras-meditacoes/links.html\n"

    body = {
        'snippet': {
            'title': title,
            'description': full_desc[:5000],
            'tags': (meta.get('tags') or [])[:15],
            'categoryId': '22',
            'defaultLanguage': 'pt-BR',
            'defaultAudioLanguage': 'pt-BR',
        },
        'status': {
            'privacyStatus': 'public',
            'selfDeclaredMadeForKids': False,
        },
    }

    media = MediaFileUpload(video_path, mimetype='video/mp4', resumable=True)
    request = youtube.videos().insert(part='snippet,status', body=body, media_body=media)

    try:
        response = request.execute()
    except HttpError as e:
        content = e.content.decode("utf-8", "replace") if hasattr(e, 'content') else str(e)
        print(f'ERROR: HttpError {e.resp.status}: {content[:1000]}', file=sys.stderr)
        sys.exit(5)
    except Exception as e:
        import traceback
        print(f'ERROR: {type(e).__name__}: {e}', file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(7)

    video_id = response.get('id') if response else None
    if not video_id:
        print(f'ERROR: no video id in response: {response}', file=sys.stderr)
        sys.exit(6)

    print(f'VIDEO_ID:{video_id}')


if __name__ == '__main__':
    main()
