"""
YouTube Backlog Drain — Upload pendentes em batch diário
Roda localmente via Task Scheduler do Windows
Limite: 5 vídeos por execução (quota diária YouTube ~6)
"""
import os
import sys
import json
import time

sys.path.insert(0, os.path.dirname(__file__))

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

YOUTUBE_DIR = os.path.join(os.path.dirname(__file__), '..', 'youtube')
TOKEN_FILE = os.path.join(YOUTUBE_DIR, 'oauth-token.json')
UPLOADED_FILE = os.path.join(YOUTUBE_DIR, 'uploaded-index.json')
BATCH_SIZE = 5


def load_json(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except UnicodeDecodeError:
        with open(filepath, 'r', encoding='latin-1') as f:
            return json.load(f)


def main():
    print(f"🎬 YouTube Backlog Drain — {time.strftime('%Y-%m-%d %H:%M')}")

    td = load_json(TOKEN_FILE)
    creds = Credentials(
        token=td['token'], refresh_token=td['refresh_token'],
        token_uri=td['token_uri'], client_id=td['client_id'],
        client_secret=td['client_secret'], scopes=td['scopes'],
    )
    if creds.expired:
        creds.refresh(Request())
        td['token'] = creds.token
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(td, f, indent=2)

    yt = build('youtube', 'v3', credentials=creds)

    uploaded = load_json(UPLOADED_FILE) if os.path.exists(UPLOADED_FILE) else []
    uploaded_slugs = set(u['slug'] for u in uploaded)

    # Collect pending from youtube/ and youtube/factory/
    pending = []
    for search_dir in [YOUTUBE_DIR, os.path.join(YOUTUBE_DIR, 'factory')]:
        if not os.path.isdir(search_dir):
            continue
        for f in sorted(os.listdir(search_dir)):
            if not f.endswith('.mp4'):
                continue
            slug = f.replace('.mp4', '')
            if slug in uploaded_slugs:
                continue
            jf = os.path.join(search_dir, slug + '.json')
            if os.path.exists(jf):
                pending.append((slug, os.path.join(search_dir, f), jf))

    print(f"📊 {len(uploaded)} enviados | {len(pending)} pendentes | batch: {BATCH_SIZE}")

    if not pending:
        print("✅ Todos os vídeos já foram enviados!")
        return

    batch = pending[:BATCH_SIZE]
    count = 0
    for slug, mp4_path, json_f in batch:
        meta = load_json(json_f)
        title = meta.get('youtube_title', meta.get('article_title', slug))[:100]
        desc = meta.get('youtube_description', meta.get('description', ''))[:4000]
        article_url = meta.get('article_url', '')
        if article_url:
            desc += f'\n\nArtigo completo: {article_url}'
        desc += '\n\nMarina Veauvy - Finanças e IA para Empreendedoras'
        desc += '\nBlog: https://wp.marinaveauvy.com.br'
        desc += '\nLivro: https://www.amazon.com.br/dp/B0F1Y3QKQ7?tag=marinaveauv04-20'
        tags = meta.get('tags', [])[:15]

        body = {
            'snippet': {
                'title': title, 'description': desc, 'tags': tags,
                'categoryId': '22', 'defaultLanguage': 'pt-BR',
                'defaultAudioLanguage': 'pt-BR',
            },
            'status': {'privacyStatus': 'public', 'selfDeclaredMadeForKids': False},
        }

        media = MediaFileUpload(mp4_path, mimetype='video/mp4', resumable=True)
        print(f"  {count+1}. {title[:60]}...")

        try:
            r = yt.videos().insert(part='snippet,status', body=body, media_body=media).execute()
            vid = r['id']
            print(f"     ✅ https://youtube.com/watch?v={vid}")
            uploaded.append({
                'slug': slug, 'video_id': vid,
                'url': f'https://youtube.com/watch?v={vid}',
                'title': title,
                'uploaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'source': 'backlog-drain'
            })
            uploaded_slugs.add(slug)
            with open(UPLOADED_FILE, 'w', encoding='utf-8') as uf:
                json.dump(uploaded, uf, indent=2, ensure_ascii=False)
            count += 1
            time.sleep(5)
        except Exception as e:
            err = str(e)
            print(f"     ❌ {err[:200]}")
            if 'uploadLimitExceeded' in err or 'quotaExceeded' in err:
                print("  ⏸️ Quota diária atingida. Tentará amanhã.")
                break

    remaining = len(pending) - count
    print(f"\n📤 {count} enviados nesta sessão | {len(uploaded)} total | {remaining} restantes")
    if remaining > 0:
        days = (remaining // BATCH_SIZE) + 1
        print(f"⏰ Estimativa: ~{days} dias para drenar todo o backlog")


if __name__ == '__main__':
    main()
