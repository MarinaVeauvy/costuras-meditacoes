#!/usr/bin/env node
/**
 * Midas Cloudinary Uploader
 *
 * Sobe vídeo local pro Cloudinary e devolve URL pública (requerida pelo IG Graph API).
 *
 * Env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Uso: node midas-upload-cloudinary.js --video=corte_00001.mp4
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function signParams(params, apiSecret) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

async function uploadVideo(videoPath, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars ausentes: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { folder: 'midas', public_id: publicId, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  const form = new FormData();
  const buffer = fs.readFileSync(videoPath);
  form.append('file', new Blob([buffer]), path.basename(videoPath));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', 'midas');
  form.append('public_id', publicId);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${JSON.stringify(json)}`);

  return {
    url: json.secure_url,
    publicId: json.public_id,
    duration: json.duration,
    bytes: json.bytes,
  };
}

async function main() {
  const args = parseArgs();
  if (!args.video) {
    console.error('Uso: node midas-upload-cloudinary.js --video=corte_00001.mp4');
    process.exit(1);
  }

  const videoPath = path.join(CORTES_DIR, args.video);
  if (!fs.existsSync(videoPath)) throw new Error(`Vídeo não encontrado: ${videoPath}`);

  const publicId = path.basename(args.video, '.mp4');
  console.log(`Subindo ${args.video} pro Cloudinary...`);
  const result = await uploadVideo(videoPath, publicId);
  console.log(`✅ URL: ${result.url}`);
  console.log(`   Duração: ${result.duration}s | Tamanho: ${(result.bytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { uploadVideo };
