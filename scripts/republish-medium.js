// Republish WordPress articles to Medium via API
// Medium Partner Program pays per read
// Uses canonical URL to avoid SEO duplicate penalty

const MEDIUM_TOKEN = process.env.MEDIUM_TOKEN;
const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

async function getMediumUser() {
  const res = await fetch('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${MEDIUM_TOKEN}` },
  });
  const data = await res.json();
  return data.data;
}

async function getRecentWPArticles(count = 5) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,content,link,excerpt`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function publishToMedium(userId, article) {
  const res = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MEDIUM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: article.title.rendered,
      contentFormat: 'html',
      content: article.content.rendered,
      canonicalUrl: article.link, // Prevents SEO duplicate penalty
      tags: ['artificial-intelligence', 'productivity', 'technology', 'business', 'finance'],
      publishStatus: 'public',
    }),
  });
  return res.json();
}

async function main() {
  if (!MEDIUM_TOKEN) {
    console.log('⚠️ MEDIUM_TOKEN not set. To enable Medium republishing:');
    console.log('1. Go to medium.com/me/settings/security');
    console.log('2. Generate an Integration Token');
    console.log('3. Set it as MEDIUM_TOKEN secret in GitHub');
    console.log('4. Join Medium Partner Program at medium.com/earn');
    process.exit(0);
  }

  const user = await getMediumUser();
  console.log(`Medium user: ${user.name} (${user.id})`);

  const articles = await getRecentWPArticles(3);
  console.log(`${articles.length} recent articles to republish`);

  for (const article of articles) {
    console.log(`\nPublishing: ${article.title.rendered}`);
    try {
      const result = await publishToMedium(user.id, article);
      if (result.data) {
        console.log(`✅ Published: ${result.data.url}`);
      } else {
        console.log(`❌ Error: ${JSON.stringify(result).substring(0, 200)}`);
      }
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
