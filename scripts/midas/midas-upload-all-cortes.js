#!/usr/bin/env node
/**
 * Midas Bulk Uploader
 *
 * Sobe todos os cortes da pasta local pro Cloudinary e gera manifest.
 * Idempotente — pula arquivos que já estão no Cloudinary.
 *
 * Output: midas/config/cortes-manifest.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');

function signParams(params, apiSecret) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

async function uploadOne(videoPath, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'midas';
  const paramsToSign = { folder, public_id: publicId, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  const form = new FormData();
  const buffer = fs.readFileSync(videoPath);
  form.append('file', new Blob([buffer]), path.basename(videoPath));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function checkExists(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/video/upload/midas/${publicId}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (res.ok) return await res.json();
  return null;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { cortes: [] };
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function main() {
  const manifest = loadManifest();
  const existingIds = new Set(manifest.cortes.map(c => c.public_id));

  const files = fs.readdirSync(CORTES_DIR).filter(f => f.endsWith('.mp4')).sort();
  console.log(`Encontrados ${files.length} cortes locais`);

  let uploaded = 0, skipped = 0, failed = 0;
  for (const file of files) {
    const publicId = path.basename(file, '.mp4');
    if (existingIds.has(publicId)) {
      skipped++;
      continue;
    }

    const existing = await checkExists(publicId);
    if (existing) {
      console.log(`⏭️  ${file} já existe no Cloudinary`);
      manifest.cortes.push({
        file,
        public_id: publicId,
        url: existing.secure_url,
        duration: existing.duration,
        bytes: existing.bytes,
        uploaded_at: existing.created_at,
      });
      saveManifest(manifest);
      skipped++;
      continue;
    }

    try {
      const videoPath = path.join(CORTES_DIR, file);
      const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
      console.log(`📤 Subindo ${file} (${sizeMB}MB)...`);
      const result = await uploadOne(videoPath, publicId);
      manifest.cortes.push({
        file,
        public_id: result.public_id,
        url: result.secure_url,
        duration: result.duration,
        bytes: result.bytes,
        uploaded_at: new Date().toISOString(),
      });
      saveManifest(manifest);
      uploaded++;
      console.log(`   ✅ ${result.secure_url}`);
    } catch (err) {
      console.error(`   ❌ Falhou: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Skipped (já existia): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total no manifest: ${manifest.cortes.length}`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
