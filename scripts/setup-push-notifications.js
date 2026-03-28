// Setup Push Notifications via OneSignal (free tier: unlimited subscribers)
// Installs OneSignal SDK on WordPress and sends push for new articles
//
// SETUP (one-time):
// 1. Create account at onesignal.com
// 2. Create app → Web Push → enter domain wp.marinaveauvy.com.br
// 3. Get App ID and REST API Key
// 4. Run this script with ONESIGNAL_APP_ID and ONESIGNAL_API_KEY
// 5. Add the WordPress plugin "OneSignal Push Notifications" OR use the code snippet below
//
// After setup, new visitors see a prompt to allow notifications.
// Each new article triggers a push automatically via the send-push.js script.

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

async function sendPush({ title, message, url }) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    console.log('⚠️ OneSignal não configurado. Variáveis necessárias:');
    console.log('  ONESIGNAL_APP_ID — do painel OneSignal');
    console.log('  ONESIGNAL_API_KEY — REST API Key do painel');
    console.log('\nSetup:');
    console.log('1. Crie conta em onesignal.com (grátis)');
    console.log('2. Crie app → Web Push → domínio: wp.marinaveauvy.com.br');
    console.log('3. Instale plugin "OneSignal Push Notifications" no WordPress');
    console.log('4. Configure App ID no plugin');
    console.log('5. Adicione ONESIGNAL_APP_ID e ONESIGNAL_API_KEY nos GitHub Secrets');
    process.exit(0);
  }

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      included_segments: ['Subscribed Users'],
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      url: url,
      chrome_web_icon: 'https://wp.marinaveauvy.com.br/wp-content/uploads/logo-192.png',
      ttl: 86400, // 24h
    }),
  });

  const data = await res.json();
  if (data.id) {
    console.log(`✅ Push enviado! ID: ${data.id} | Recipients: ${data.recipients || 'pending'}`);
  } else {
    console.error('❌ Erro:', JSON.stringify(data).substring(0, 300));
  }
  return data;
}

// Send push for latest article
async function pushLatestArticle() {
  const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
  const res = await fetch('https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts?per_page=1&orderby=date&order=desc&_fields=title,link,excerpt', {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  const [post] = await res.json();

  if (!post) {
    console.log('❌ Nenhum artigo encontrado');
    return;
  }

  const excerpt = post.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 100).trim();

  console.log(`📰 Enviando push para: ${post.title.rendered}`);
  await sendPush({
    title: post.title.rendered,
    message: excerpt + '...',
    url: post.link,
  });
}

// If run directly
if (require.main === module) {
  pushLatestArticle().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { sendPush, pushLatestArticle };
