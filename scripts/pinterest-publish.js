// Pinterest Auto-Publisher — Publica pins automaticamente via API v5
// Fluxo: Lê pinterest-pins.json → Cria boards se necessário → Publica pins
// Requer: PINTEREST_TOKEN com escopo pins:write + boards:write

const fs = require('fs');
const path = require('path');

const PINTEREST_TOKEN = process.env.PINTEREST_TOKEN;
const API_BASE = 'https://api.pinterest.com/v5';
const PINS_FILE = path.join(__dirname, '..', 'pinterest-pins.json');
const PUBLISHED_FILE = path.join(__dirname, '..', 'pinterest-published.json');

// Board mapping — normaliza nomes para IDs após criação
const boardCache = {};

async function apiCall(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${PINTEREST_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Pinterest API ${res.status}: ${JSON.stringify(data).substring(0, 300)}`);
  }
  return data;
}

async function getExistingBoards() {
  const data = await apiCall('/boards?page_size=100');
  const boards = data.items || [];
  for (const board of boards) {
    boardCache[board.name.toLowerCase()] = board.id;
  }
  console.log(`📋 ${boards.length} boards existentes encontrados`);
  return boards;
}

async function getOrCreateBoard(boardName) {
  const key = boardName.toLowerCase();

  if (boardCache[key]) {
    return boardCache[key];
  }

  console.log(`  📁 Criando board: "${boardName}"`);
  try {
    const board = await apiCall('/boards', 'POST', {
      name: boardName,
      description: `Conteúdo curado sobre ${boardName} — Marina Veauvy`,
      privacy: 'PUBLIC',
    });
    boardCache[key] = board.id;
    return board.id;
  } catch (err) {
    // Se já existe, tentar buscar
    if (err.message.includes('409') || err.message.includes('already')) {
      await getExistingBoards();
      return boardCache[key] || null;
    }
    throw err;
  }
}

function getPublishedUrls() {
  if (fs.existsSync(PUBLISHED_FILE)) {
    return JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf8'));
  }
  return [];
}

function savePublished(published) {
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2));
}

// Gera imagem placeholder via HTML pin template
function getPinImageUrl(pin) {
  // Pinterest API requer URL de imagem pública
  // Opção 1: Usar imagem do artigo do WordPress (Open Graph)
  // Opção 2: Usar thumbnail gerado
  // Por enquanto, usar a imagem featured do WP ou placeholder
  return pin.image_url || null;
}

async function fetchArticleImage(articleUrl) {
  try {
    const res = await fetch(articleUrl);
    const html = await res.text();
    // Extrair og:image do artigo
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (match) return match[1];
    // Tentar encontrar primeira imagem no conteúdo
    const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+)"/);
    if (imgMatch) return imgMatch[1];
  } catch (e) {
    // Silently fail
  }
  return null;
}

async function createPin(pin, boardId) {
  // Tentar obter imagem do artigo
  let imageUrl = pin.image_url;
  if (!imageUrl) {
    imageUrl = await fetchArticleImage(pin.article_url);
  }

  if (!imageUrl) {
    console.log(`  ⚠️ Sem imagem para "${pin.pin_title.substring(0, 40)}..." — pulando`);
    return null;
  }

  const pinData = {
    title: pin.pin_title.substring(0, 100),
    description: pin.description.substring(0, 500),
    link: pin.article_url,
    board_id: boardId,
    alt_text: pin.alt_text || pin.pin_title,
    media_source: {
      source_type: 'image_url',
      url: imageUrl,
    },
  };

  const result = await apiCall('/pins', 'POST', pinData);
  return result;
}

async function main() {
  if (!PINTEREST_TOKEN) {
    console.log('❌ PINTEREST_TOKEN não configurado.');
    console.log('Configure com: export PINTEREST_TOKEN=pina_...');
    console.log('Necessário escopos: pins:write, boards:write');
    process.exit(1);
  }

  // Verificar conexão
  try {
    const user = await apiCall('/user_account');
    console.log(`🔗 Conectado como: ${user.username || user.id}`);
  } catch (err) {
    console.error('❌ Erro de autenticação:', err.message);
    console.log('O token pode não ter permissão de escrita ainda (Trial pendente).');
    process.exit(1);
  }

  // Carregar pins
  if (!fs.existsSync(PINS_FILE)) {
    console.log('❌ pinterest-pins.json não encontrado. Execute primeiro:');
    console.log('   node scripts/pinterest-pins.js');
    process.exit(1);
  }

  const allPins = JSON.parse(fs.readFileSync(PINS_FILE, 'utf8'));
  const published = getPublishedUrls();
  const publishedUrls = new Set(published.map(p => p.article_url));

  // Filtrar pins já publicados
  const pendingPins = allPins.filter(p => !publishedUrls.has(p.article_url));
  const maxPins = parseInt(process.env.PIN_BATCH_SIZE || '5');
  const pinsToPublish = pendingPins.slice(0, maxPins);

  console.log(`\n📊 Total: ${allPins.length} | Publicados: ${published.length} | Pendentes: ${pendingPins.length} | Batch: ${pinsToPublish.length}`);

  if (pinsToPublish.length === 0) {
    console.log('✅ Todos os pins já foram publicados!');
    console.log('Gere novos pins com: node scripts/pinterest-pins.js');
    process.exit(0);
  }

  // Buscar boards existentes
  await getExistingBoards();

  let successCount = 0;

  for (const pin of pinsToPublish) {
    console.log(`\n📌 "${pin.pin_title.substring(0, 50)}..."`);

    try {
      // Criar/encontrar board
      const boardId = await getOrCreateBoard(pin.board);
      if (!boardId) {
        console.log(`  ❌ Não foi possível criar/encontrar board "${pin.board}"`);
        continue;
      }

      // Criar pin
      const result = await createPin(pin, boardId);
      if (result && result.id) {
        console.log(`  ✅ Publicado! Pin ID: ${result.id}`);
        published.push({
          article_url: pin.article_url,
          pin_id: result.id,
          board: pin.board,
          published_at: new Date().toISOString(),
        });
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    // Rate limit: 1 pin a cada 3 segundos
    await new Promise(r => setTimeout(r, 3000));
  }

  // Salvar registro de publicados
  savePublished(published);

  console.log(`\n📊 Resultado: ${successCount}/${pinsToPublish.length} pins publicados`);
  console.log(`📁 Registro salvo em pinterest-published.json`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
