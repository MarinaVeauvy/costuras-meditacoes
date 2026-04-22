#!/usr/bin/env node
/**
 * Midas — Publish via Publer API
 *
 * Substitui midas-publish-ig.js e midas-publish-yt-shorts.js.
 * Publica em IG + TikTok + YouTube numa chamada (ou plataforma específica via --platform).
 *
 * Pré-requisitos:
 *   - Publer Business plan ativo
 *   - PUBLER_API_KEY no env
 *   - PUBLER_WORKSPACE_ID no env
 *   - midas/config/accounts.json com publer_accounts por conta:
 *       publer_accounts: {
 *         instagram: "<publer_account_id>",
 *         tiktok: "<publer_account_id>",
 *         youtube: "<publer_account_id>"
 *       }
 *
 * Uso:
 *   node midas-publish-publer.js --account=pros_peridade_do_reino --video=corte_00001.mp4 \
 *     --videoUrl=https://cloudinary.com/.../corte_00001.mp4 --platform=all
 *
 *   --platform: all | instagram | tiktok | youtube
 *
 * Output: JSON no stdout com post_ids + atualiza midas/state/published-*.json
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://app.publer.io/api/v1';
const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_DIR = path.join(__dirname, '..', '..', 'midas', 'state');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function loadJson(filepath, defaultVal = null) {
  if (!fs.existsSync(filepath)) return defaultVal;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function appendPublished(platform, entry) {
  const file = path.join(STATE_DIR, `published-${platform}.json`);
  const data = loadJson(file, { published: [] });
  data.published = data.published || [];
  data.published.push(entry);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function publerPost({ apiKey, workspaceId, publerAccountId, text, mediaUrl }) {
  const payload = {
    bulk: false,
    posts: [
      {
        networks: {
          default: {
            details: {
              text,
              media: [{ path: mediaUrl }],
            },
          },
        },
        accounts: [publerAccountId],
        scheduled_at: null,
      },
    ],
  };

  const res = await fetch(`${API_BASE}/posts/schedule/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer-API ${apiKey}`,
      'Content-Type': 'application/json',
      'Publer-Workspace-Id': workspaceId,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Publer API erro ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const args = parseArgs();
  if (!args.account || !args.video || !args.videoUrl) {
    throw new Error('Uso: --account=X --video=Y --videoUrl=Z [--platform=all|instagram|tiktok|youtube]');
  }
  const platformFilter = args.platform || 'all';

  const apiKey = process.env.PUBLER_API_KEY;
  const workspaceId = process.env.PUBLER_WORKSPACE_ID;
  if (!apiKey) throw new Error('PUBLER_API_KEY ausente');
  if (!workspaceId) throw new Error('PUBLER_WORKSPACE_ID ausente');

  const config = loadJson(CONFIG_PATH);
  const account = config.accounts.find(a => a.id === args.account);
  if (!account) throw new Error(`Conta não encontrada: ${args.account}`);
  if (!account.publer_accounts) {
    throw new Error(`accounts.json[${args.account}].publer_accounts ausente. Rode midas-publer-list-accounts.js primeiro.`);
  }

  const videoBase = path.basename(args.video, '.mp4');
  const captionsPath = path.join(__dirname, '..', '..', 'midas', 'captions', `${videoBase}.json`);
  const captions = loadJson(captionsPath);
  if (!captions || !captions[account.id]) {
    throw new Error(`Captions ausentes pra ${account.id} em ${captionsPath}`);
  }

  const platforms = ['instagram', 'tiktok', 'youtube'];
  const targets = platformFilter === 'all' ? platforms : [platformFilter];
  const results = {};

  for (const platform of targets) {
    const publerAccountId = account.publer_accounts[platform];
    if (!publerAccountId || publerAccountId.startsWith('PENDING_')) {
      console.warn(`⏭️  ${platform}: sem publer_account_id válido pra ${account.id} (valor=${publerAccountId}), skip`);
      continue;
    }

    const captionKey = `caption_${platform === 'instagram' ? 'ig' : platform}`;
    const text = captions[account.id][captionKey] || captions[account.id].full_caption;

    try {
      console.log(`📤 [${account.id}] Publicando ${platform}...`);
      const result = await publerPost({
        apiKey,
        workspaceId,
        publerAccountId,
        text,
        mediaUrl: args.videoUrl,
      });
      const postId = result.posts?.[0]?.id || result.job_id || JSON.stringify(result).slice(0, 60);
      results[platform] = { status: 'success', postId, response: result };
      console.log(`   ✅ ${platform} ok. post_id=${postId}`);

      appendPublished(platform === 'youtube' ? 'yt' : platform, {
        account: account.id,
        video: args.video,
        platform,
        postId,
        caption: text,
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      results[platform] = { status: 'error', error: err.message };
      console.error(`   ❌ ${platform} falhou: ${err.message}`);
    }
  }

  console.log('\n📊 Resultado:');
  console.log(JSON.stringify(results, null, 2));

  const allFailed = Object.values(results).every(r => r.status === 'error');
  if (allFailed && Object.keys(results).length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
