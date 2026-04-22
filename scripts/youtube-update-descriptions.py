#!/usr/bin/env python3
"""
Atualiza em massa a descrição dos vídeos já publicados no canal Marina Veauvy,
adicionando CTA + link afiliado MAC no topo (antes da descrição atual).

Usa YouTube Data API v3 — requer scope youtube.force-ssl (edit).

Uso:
  python scripts/youtube-update-descriptions.py [--dry-run] [--limit=10]

Flags:
  --dry-run: só mostra o que faria, não altera nada no YT
  --limit=N: processa só N vídeos (pra testar antes do batch completo)
"""

import os
import sys
import json
import time
from datetime import datetime

YOUTUBE_DIR = os.path.join(os.path.dirname(__file__), '..', 'youtube')
TOKEN_FILE = os.path.join(YOUTUBE_DIR, 'oauth-token.json')
UPLOADED_INDEX = os.path.join(YOUTUBE_DIR, 'uploaded-index.json')

AFFILIATE_LINK = 'https://novavidaprospera.com.br/?ref=yt_marina'
BLOG = 'https://wp.marinaveauvy.com.br'
CHANNEL = 'https://www.youtube.com/@marinaveauvy'
AMAZON_BOOK = 'https://www.amazon.com.br/dp/B0F1Y3QKQ7?tag=marinaveauv04-20'

CTA_BLOCK = f"""💡 Método completo passo a passo no link:
👉 {AFFILIATE_LINK}

━━━━━━━━━━━━━━━━━━━━━━━
🎯 QUER IR MAIS FUNDO?
━━━━━━━━━━━━━━━━━━━━━━━

📝 Blog com conteúdo novo toda semana:
{BLOG}

📚 Meu livro na Amazon:
{AMAZON_BOOK}

📧 Newsletters gratuitas (assina direto no blog):
• Dinheiro Simples (toda quinta 07h)
• Impulso IA (toda terça 07h)
• Renda Extra Report (todo sábado 09h)

📺 Inscreva-se pra mais conteúdo:
{CHANNEL}

━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Conteúdo educativo. Não é recomendação de investimento. Decisões financeiras são pessoais — estude e consulte profissional qualificado.

#financas #investimentos #iaparamulheres #empreendedorismo #educacaofinanceira

---
"""


def parse_args():
    dry_run = '--dry-run' in sys.argv
    limit = None
    for arg in sys.argv:
        if arg.startswith('--limit='):
            limit = int(arg.split('=', 1)[1])
    return dry_run, limit


def get_youtube_service():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    if not os.path.exists(TOKEN_FILE):
        print(f"❌ Token não encontrado: {TOKEN_FILE}")
        sys.exit(1)

    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
        token_data = json.load(f)

    creds = Credentials.from_authorized_user_info(token_data)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(json.loads(creds.to_json()), f, indent=2)

    # Precisa scope de edit — youtube.force-ssl ou youtube
    scopes = token_data.get('scopes', [])
    if not any(s in scopes for s in [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.force-ssl',
    ]):
        print(f"❌ Token só tem upload scope. Precisa re-autenticar com youtube.force-ssl")
        print(f"   Scopes atuais: {scopes}")
        sys.exit(1)

    return build('youtube', 'v3', credentials=creds)


def update_description(youtube, video_id, new_description, title):
    """Atualiza descrição de um vídeo via videos.update"""
    body = {
        'id': video_id,
        'snippet': {
            'title': title,
            'description': new_description[:5000],
            'categoryId': '22',
        }
    }
    return youtube.videos().update(part='snippet', body=body).execute()


def already_has_cta(description):
    """Detecta se descrição já foi atualizada pra evitar duplicar"""
    return AFFILIATE_LINK in (description or '')


def main():
    dry_run, limit = parse_args()
    print(f"🎬 YouTube Update Descriptions — dry_run={dry_run}, limit={limit}")

    if not os.path.exists(UPLOADED_INDEX):
        print(f"❌ {UPLOADED_INDEX} não encontrado")
        sys.exit(1)

    with open(UPLOADED_INDEX, 'r', encoding='utf-8') as f:
        videos = json.load(f)

    if not isinstance(videos, list):
        videos = list(videos.values()) if isinstance(videos, dict) else []

    print(f"📊 Total vídeos no index: {len(videos)}")

    youtube = get_youtube_service() if not dry_run else None

    updated = 0
    skipped = 0
    errors = 0

    for idx, v in enumerate(videos):
        if limit and updated >= limit:
            break

        video_id = v.get('video_id')
        if not video_id:
            continue

        # Busca descrição atual
        if not dry_run:
            try:
                resp = youtube.videos().list(part='snippet', id=video_id).execute()
                items = resp.get('items', [])
                if not items:
                    print(f"  [{idx+1}/{len(videos)}] {video_id}: não encontrado no YT, skip")
                    skipped += 1
                    continue
                current = items[0]['snippet']
                current_desc = current.get('description', '')
                current_title = current.get('title', v.get('title', ''))
            except Exception as e:
                print(f"  [{idx+1}/{len(videos)}] {video_id}: erro ao buscar: {e}")
                errors += 1
                continue
        else:
            current_desc = ''
            current_title = v.get('title', 'Title')

        if already_has_cta(current_desc):
            print(f"  [{idx+1}/{len(videos)}] {video_id}: já tem CTA, skip")
            skipped += 1
            continue

        # Nova descrição = CTA block + descrição atual
        new_desc = CTA_BLOCK + (current_desc or '')

        if dry_run:
            print(f"  [{idx+1}/{len(videos)}] [DRY] {video_id} — {current_title[:50]}")
            updated += 1
            continue

        try:
            update_description(youtube, video_id, new_desc, current_title)
            updated += 1
            print(f"  [{idx+1}/{len(videos)}] ✅ {video_id} — {current_title[:50]}")
            time.sleep(1)  # rate limit
        except Exception as e:
            errors += 1
            print(f"  [{idx+1}/{len(videos)}] ❌ {video_id}: {e}")

    print(f"\n📊 Resumo: {updated} atualizados, {skipped} pulados, {errors} erros")


if __name__ == '__main__':
    main()
