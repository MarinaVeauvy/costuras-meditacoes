"""
YouTube Video Uploader
Uploads MP4 videos with metadata from JSON files
Uses OAuth2 token from youtube-auth.py or YOUTUBE_OAUTH_TOKEN env var
"""
import os
import sys
import json
import time
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

YOUTUBE_DIR = os.path.join(os.path.dirname(__file__), '..', 'youtube')
TOKEN_FILE = os.path.join(YOUTUBE_DIR, 'oauth-token.json')
UPLOADED_FILE = os.path.join(YOUTUBE_DIR, 'uploaded-index.json')

# Support token from env (GitHub Actions) or file (local)
def ensure_token_file():
    env_token = os.environ.get('YOUTUBE_OAUTH_TOKEN')
    if env_token:
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            f.write(env_token)

def get_credentials():
    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
        token_data = json.load(f)

    creds = Credentials(
        token=token_data['token'],
        refresh_token=token_data['refresh_token'],
        token_uri=token_data['token_uri'],
        client_id=token_data['client_id'],
        client_secret=token_data['client_secret'],
        scopes=token_data['scopes'],
    )

    if creds.expired:
        creds.refresh(Request())
        token_data['token'] = creds.token
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(token_data, f, indent=2)

    return creds

def load_json_safe(filepath):
    """Load JSON with fallback encoding handling."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except UnicodeDecodeError:
        with open(filepath, 'r', encoding='latin-1') as f:
            return json.load(f)

def get_uploaded():
    if os.path.exists(UPLOADED_FILE):
        return load_json_safe(UPLOADED_FILE)
    return []

def save_uploaded(uploaded):
    with open(UPLOADED_FILE, 'w', encoding='utf-8') as f:
        json.dump(uploaded, f, indent=2, ensure_ascii=False)

def upload_video(youtube, mp4_path, metadata):
    title = metadata.get('youtube_title', metadata.get('article_title', 'Video'))[:100]
    description = metadata.get('youtube_description', '')
    tags = metadata.get('tags', [])[:15]
    article_url = metadata.get('article_url', '')

    # Add article link and channel info to description
    full_description = f"{description}\n\n"
    full_description += f"Artigo completo: {article_url}\n\n"
    full_description += "---\n"
    full_description += "Marina Veauvy - Financas e IA para Empreendedoras\n"
    full_description += "Inscreva-se no canal para mais conteudo!\n\n"
    full_description += "Links uteis:\n"
    full_description += "Blog: https://wp.marinaveauvy.com.br\n"
    full_description += "Ferramentas: https://marinaveauvy.github.io/costuras-meditacoes/links.html\n"
    full_description += "Livro: https://www.amazon.com.br/dp/B0F1Y3QKQ7?tag=marinaveauv04-20\n"

    body = {
        'snippet': {
            'title': title,
            'description': full_description[:5000],
            'tags': tags,
            'categoryId': '22',  # People & Blogs (or 27 for Education)
            'defaultLanguage': 'pt-BR',
            'defaultAudioLanguage': 'pt-BR',
        },
        'status': {
            'privacyStatus': 'public',
            'selfDeclaredMadeForKids': False,
        },
    }

    media = MediaFileUpload(mp4_path, mimetype='video/mp4', resumable=True)

    request = youtube.videos().insert(
        part='snippet,status',
        body=body,
        media_body=media,
    )

    response = request.execute()
    return response

def main():
    max_uploads = int(os.environ.get('UPLOAD_COUNT', '10'))

    ensure_token_file()
    print(f"Carregando credenciais...")
    creds = get_credentials()
    youtube = build('youtube', 'v3', credentials=creds)
    print("Conectado ao YouTube!\n")

    # Find MP4 files with matching JSON metadata (root + factory/)
    uploaded = get_uploaded()
    uploaded_slugs = set(u['slug'] for u in uploaded)

    pending = []
    # Scan youtube/ root
    for mp4 in os.listdir(YOUTUBE_DIR):
        if not mp4.endswith('.mp4'):
            continue
        slug = mp4.replace('.mp4', '')
        if slug in uploaded_slugs:
            continue
        json_file = os.path.join(YOUTUBE_DIR, f"{slug}.json")
        if os.path.exists(json_file):
            pending.append((slug, os.path.join(YOUTUBE_DIR, mp4), json_file))

    # Scan youtube/factory/
    factory_dir = os.path.join(YOUTUBE_DIR, 'factory')
    if os.path.isdir(factory_dir):
        for mp4 in os.listdir(factory_dir):
            if not mp4.endswith('.mp4'):
                continue
            slug = mp4.replace('.mp4', '')
            if slug in uploaded_slugs:
                continue
            json_file = os.path.join(factory_dir, f"{slug}.json")
            if os.path.exists(json_file):
                pending.append((slug, os.path.join(factory_dir, mp4), json_file))

    to_upload = pending[:max_uploads]
    print(f"{len(pending)+len(uploaded_slugs)} videos | {len(uploaded)} ja enviados | {len(to_upload)} a enviar\n")

    if not to_upload:
        print("Todos os videos ja foram enviados!")
        return

    created = 0
    for slug, mp4_path, json_file in to_upload:
        metadata = load_json_safe(json_file)

        title = metadata.get('youtube_title', slug)[:50]
        print(f"Enviando: {title}...")

        try:
            response = upload_video(youtube, mp4_path, metadata)
            video_id = response['id']
            video_url = f"https://youtube.com/watch?v={video_id}"
            print(f"  OK! {video_url}")

            uploaded.append({
                'slug': slug,
                'video_id': video_id,
                'url': video_url,
                'title': metadata.get('youtube_title', slug),
                'uploaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            })
            save_uploaded(uploaded)
            created += 1

            # Rate limit between uploads
            if created < len(to_upload):
                time.sleep(5)

        except Exception as e:
            err = str(e)
            print(f"  ERRO: {err[:300]}")
            if 'uploadLimitExceeded' in err or 'quotaExceeded' in err or 'dailyLimitExceeded' in err:
                print("Quota diaria atingida. Tentara novamente amanha.")
                break

    print(f"\n{created}/{len(to_upload)} videos enviados ao YouTube")

if __name__ == '__main__':
    main()
