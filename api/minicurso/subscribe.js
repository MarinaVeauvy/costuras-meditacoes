// Vercel Serverless Function: Mini-Course Subscribe + Schedule All Emails
// POST /api/minicurso/subscribe
// Uses Resend API with scheduled_at for drip delivery (Days 2-5)

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const COURSE_CONFIG = {
  'ia-negocios': {
    audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51',
    from: 'Impulso IA <impulso@marinaveauvy.com.br>',
  },
  'financas-pessoais': {
    audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1',
    from: 'Dinheiro Simples <dinheiro@marinaveauvy.com.br>',
  },
  'renda-extra': {
    audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555',
    from: 'Renda Extra Report <renda@marinaveauvy.com.br>',
  },
};

// ---------- EMAIL TEMPLATES ----------

function emailWrapper(headerTitle, headerSub, headerColor, bodyContent, footerText) {
  return `<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body style='margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;'><table width='100%' cellpadding='0' cellspacing='0' style='background:#f4f4f7;'><tr><td align='center' style='padding:40px 16px;'><table width='600' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;'><tr><td style='background:#1a1a2e;padding:32px 40px;text-align:center;'><h1 style='color:#ffffff;font-size:22px;margin:0;'>${headerTitle}</h1><p style='color:${headerColor};font-size:14px;margin:8px 0 0;'>${headerSub}</p></td></tr><tr><td style='padding:40px;'>${bodyContent}</td></tr><tr><td style='background:#f8f8fa;padding:24px 40px;text-align:center;'><p style='font-size:12px;color:#999;margin:0;'>${footerText}</p></td></tr></table></td></tr></table></body></html>`;
}

function p(text) {
  return `<p style='font-size:16px;color:#333;line-height:1.7;margin:0 0 20px;'>${text}</p>`;
}

function pSmall(text) {
  return `<p style='font-size:16px;color:#333;line-height:1.7;margin:0 0 8px;'>${text}</p>`;
}

function hr() {
  return `<hr style='border:none;border-top:1px solid #eee;margin:32px 0;'>`;
}

function teaser(text) {
  return `<p style='font-size:15px;color:#666;line-height:1.6;margin:0;'>${text}</p>`;
}

function codeBlock(text) {
  return `<p style='font-size:14px;color:#1a1a2e;background:#f0f0f5;padding:16px;border-radius:8px;line-height:1.6;margin:0 0 20px;font-family:monospace;'>${text}</p>`;
}

function link(url, text, color) {
  return `<a href='${url}' style='color:${color};font-weight:bold;'>${text}</a>`;
}

// ---------- IA NEGOCIOS EMAILS ----------

function iaEmails(name) {
  const footer = 'Voce recebeu este email porque se inscreveu no mini-curso "5 Dias para Dominar IA no seu Negocio".';
  const accent = '#e94560';
  return [
    {
      day: 1,
      subject: 'Dia 1: Como a IA ja esta mudando pequenos negocios no Brasil',
      html: emailWrapper('Dia 1 de 5: IA no seu Negocio', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Vamos comecar pelo que importa: a inteligencia artificial nao e mais uma tecnologia do futuro. Ela ja esta transformando negocios reais, de gente como voce, aqui no Brasil.') +
        p('<strong>Caso 1: Loja de roupas em Belo Horizonte.</strong> A dona usava o ChatGPT para escrever descricoes de produtos no Instagram. Resultado: reduziu de 3 horas por semana para 30 minutos. O tempo livre ela investiu em atendimento ao cliente -- e as vendas subiram 22% em dois meses.') +
        p('<strong>Caso 2: Escritorio de contabilidade em Curitiba.</strong> Comecou a usar IA para redigir respostas padrao a clientes. Cada contador economiza cerca de 45 minutos por dia. Com 5 contadores, sao quase 4 horas diarias de produtividade recuperada.') +
        p('<strong>Caso 3: Restaurante delivery em Recife.</strong> O dono usou uma ferramenta de IA gratuita para analisar avaliacoes do iFood e identificar os 3 pratos com mais reclamacoes. Ajustou as receitas e a nota subiu de 4.2 para 4.7 em um mes.') +
        p('O padrao e o mesmo em todos os casos: IA nao substitui o dono do negocio. Ela elimina o trabalho repetitivo e libera tempo para o que realmente gera receita.') +
        p('<strong>Sua tarefa de hoje:</strong> Liste 3 tarefas no seu negocio que voce faz toda semana e que sao repetitivas. Pode ser responder perguntas similares, criar textos para redes sociais, organizar dados em planilhas. Guarde essa lista -- amanha vamos usar ela.') +
        hr() +
        teaser('<strong>Amanha no Dia 2:</strong> Vamos criar seu primeiro "funcionario virtual" no ChatGPT. Voce vai sair com um assistente configurado e funcionando para o seu negocio. Ate la!'),
        footer),
    },
    {
      day: 2,
      subject: 'Dia 2: Seu primeiro funcionario virtual no ChatGPT (tutorial)',
      html: emailWrapper('Dia 2 de 5: Seu Funcionario Virtual', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Ontem voce listou 3 tarefas repetitivas do seu negocio. Hoje vamos pegar uma delas e transformar o ChatGPT no seu assistente dedicado para essa tarefa.') +
        p('<strong>Passo 1: Acesse chat.openai.com</strong> (a versao gratuita ja serve). Crie uma conta se ainda nao tiver.') +
        p('<strong>Passo 2: Defina o papel do assistente.</strong> Cole este texto e adapte para seu negocio:') +
        codeBlock('"Voce e um assistente especializado em [SEU SETOR]. Seu tom e profissional e amigavel. Voce ajuda com [TAREFA ESPECIFICA]. Quando eu enviar [TIPO DE INPUT], voce deve responder com [FORMATO DESEJADO]. Sempre use linguagem simples e direta."') +
        p('<strong>Exemplo real:</strong> "Voce e um assistente de atendimento de uma loja de cosmeticos naturais. Seu tom e acolhedor e informativo. Quando eu enviar uma duvida de cliente, voce deve responder em ate 3 paragrafos curtos, sempre sugerindo um produto relacionado."') +
        p('<strong>Passo 3: Treine com exemplos.</strong> Envie 3 a 5 exemplos reais de situacoes que voce enfrenta. Exemplo: "Cliente perguntou: qual a diferenca entre o creme X e o Y?" -- e mostre como voce responderia. O ChatGPT aprende o padrao.') +
        p('<strong>Passo 4: Salve como modelo.</strong> Quando estiver satisfeito com as respostas, salve a conversa. Sempre que precisar, volte nela e continue a partir dali. Na versao paga, voce pode criar um GPT personalizado permanente.') +
        p('<strong>Sua tarefa de hoje:</strong> Configure seu assistente seguindo os 4 passos acima. Teste com pelo menos 3 situacoes reais do seu negocio. Se a resposta nao ficar boa, ajuste o prompt do Passo 2 adicionando mais contexto.') +
        hr() +
        teaser('<strong>Amanha no Dia 3:</strong> Vou te mostrar 5 ferramentas de IA gratuitas que vao alem do ChatGPT -- e que podem economizar horas do seu dia. Nao perca!'),
        footer),
    },
    {
      day: 3,
      subject: 'Dia 3: 5 ferramentas gratuitas de IA que voce deveria estar usando',
      html: emailWrapper('Dia 3 de 5: Ferramentas Gratuitas', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Voce ja tem seu assistente no ChatGPT. Agora vamos expandir seu arsenal. Estas 5 ferramentas sao gratuitas e resolvem problemas concretos do dia a dia:') +
        pSmall('<strong>1. Canva Magic Write (canva.com)</strong>') +
        p('Cria textos para posts, legendas e apresentacoes direto dentro do Canva. Voce ja monta o design e o texto ao mesmo tempo. Ideal para quem posta no Instagram e precisa de agilidade.') +
        pSmall('<strong>2. Gemini do Google (gemini.google.com)</strong>') +
        p('Alternativa ao ChatGPT integrada ao ecossistema Google. O diferencial: ele acessa informacoes atualizadas da internet. Otimo para pesquisa de mercado e analise de concorrentes.') +
        pSmall('<strong>3. Otter.ai (otter.ai)</strong>') +
        p('Transcreve reunioes e chamadas automaticamente. O plano gratuito da 300 minutos por mes. Se voce faz reunioes com clientes, nunca mais precisa anotar nada manualmente.') +
        pSmall('<strong>4. Remove.bg (remove.bg)</strong>') +
        p('Remove fundo de imagens em 5 segundos. Perfeito para fotos de produtos, artes para redes sociais e materiais de marketing.') +
        pSmall('<strong>5. Notion AI (notion.so)</strong>') +
        p('Organiza seu negocio inteiro em um so lugar com assistente de IA embutido. Cria resumos, gera listas de tarefas e ajuda a planejar projetos. O plano gratuito e generoso.') +
        p('<strong>Sua tarefa de hoje:</strong> Escolha 2 dessas ferramentas e crie uma conta em cada uma. Teste por pelo menos 10 minutos cada.') +
        hr() +
        teaser('<strong>Amanha no Dia 4:</strong> Vamos falar de automacao -- como conectar ferramentas para que tarefas se facam sozinhas, sem voce precisar intervir.'),
        footer),
    },
    {
      day: 4,
      subject: 'Dia 4: Como automatizar tarefas repetitivas com IA',
      html: emailWrapper('Dia 4 de 5: Automacao com IA', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Ate agora voce aprendeu a usar ferramentas de IA individualmente. Hoje vamos dar um salto: conectar ferramentas para criar fluxos automaticos. Isso se chama automacao, e muda completamente o jogo.') +
        p('<strong>O conceito e simples:</strong> "Quando acontecer X, faca Y automaticamente."') +
        p('A ferramenta que recomendo para comecar e o <strong>Make.com</strong> (antigo Integromat). O plano gratuito permite 1.000 operacoes por mes -- mais que suficiente para um negocio pequeno.') +
        p('<strong>3 automacoes que voce pode criar hoje:</strong>') +
        pSmall('<strong>Automacao 1: Resposta automatica inteligente.</strong>') +
        p('Cliente envia email com duvida > Make.com envia o texto para o ChatGPT via API > ChatGPT gera resposta personalizada > Resposta e enviada como rascunho para voce aprovar. Tempo economizado: 2-3 horas por semana.') +
        pSmall('<strong>Automacao 2: Conteudo para redes sociais.</strong>') +
        p('Toda segunda-feira > Make.com pede ao ChatGPT 5 ideias de posts > Ideias sao salvas automaticamente no Google Sheets > Voce so escolhe quais publicar. Tempo economizado: 1-2 horas por semana.') +
        pSmall('<strong>Automacao 3: Organizacao de leads.</strong>') +
        p('Novo contato chega pelo formulario do site > Make.com extrai os dados > Adiciona automaticamente na sua planilha de clientes > Envia email de boas-vindas personalizado.') +
        p('<strong>Sua tarefa de hoje:</strong> Crie uma conta no Make.com. Explore os templates prontos na categoria "Marketing" e "Sales". Escolha um template e ative.') +
        hr() +
        teaser('<strong>Amanha no Dia 5:</strong> Vamos juntar tudo em um plano de acao concreto para implementar IA no seu negocio esta semana. E o ultimo dia -- nao perca!'),
        footer),
    },
    {
      day: 5,
      subject: 'Dia 5: Seu plano de acao -- IA no seu negocio esta semana',
      html: emailWrapper('Dia 5 de 5: Seu Plano de Acao', 'Mini-Curso Gratuito -- Aula Final', accent,
        p(`Ola, ${name}!`) +
        p('Chegamos ao ultimo dia. Nos ultimos 4 dias voce aprendeu que a IA ja transforma negocios reais, criou seu assistente virtual, descobriu ferramentas gratuitas e conheceu o poder da automacao. Agora vamos transformar tudo isso em acao.') +
        p('<strong>Seu Plano de Acao para os proximos 7 dias:</strong>') +
        pSmall('<strong>Segunda e Terca: Fundacao.</strong>') +
        p('Revise seu assistente do ChatGPT (Dia 2). Teste com 10 situacoes reais. Refine o prompt ate as respostas ficarem 80% boas. Salve o prompt final em um documento.') +
        pSmall('<strong>Quarta: Ferramentas.</strong>') +
        p('Das 5 ferramentas do Dia 3, escolha a que mais faz sentido para seu negocio. Integre ela na sua rotina. Defina: "Todo dia, vou usar [FERRAMENTA] para [TAREFA] por [X] minutos."') +
        pSmall('<strong>Quinta e Sexta: Automacao.</strong>') +
        p('Configure uma automacao no Make.com (Dia 4). Comece pela mais simples. Teste ate funcionar sem erros.') +
        pSmall('<strong>Fim de semana: Avaliacao.</strong>') +
        p('Anote: Quanto tempo economizei? O que funcionou melhor? O que preciso ajustar?') +
        p('<strong>A regra de ouro:</strong> Nao tente implementar tudo ao mesmo tempo. Uma ferramenta por semana. Um processo por vez. Em um mes, voce tera 4 processos automatizados que trabalham para voce 24 horas por dia.') +
        hr() +
        p('<strong>Quer ir alem?</strong>') +
        p('Criei o <strong>Pack 10 Prompts de IA para Negocios</strong> -- prompts prontos e testados para as situacoes mais comuns de quem empreende: atendimento, vendas, conteudo, analise financeira e mais.') +
        p(link('https://marinaveauvy.gumroad.com', 'Acesse o Pack de Prompts aqui', accent)) +
        p('Obrigada por ter participado desse mini-curso. Se ele foi util, responda esse email me contando qual foi sua maior descoberta.') +
        p('Ate a proxima!'),
        footer),
    },
  ];
}

// ---------- FINANCAS PESSOAIS EMAILS ----------

function financasEmails(name) {
  const footer = 'Voce recebeu este email porque se inscreveu no mini-curso "5 Dias para Organizar suas Financas".';
  const accent = '#e8d5b7';
  return [
    {
      day: 1,
      subject: 'Dia 1: O custo invisivel de nao prestar atencao no seu dinheiro',
      html: emailWrapper('Dia 1 de 5: O Custo Invisivel', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Vou te fazer uma pergunta simples: quanto voce gastou com assinaturas no ultimo mes? Netflix, Spotify, aplicativos, academia que nao vai, seguro que nunca usou. Some tudo.') +
        p('A maioria das pessoas responde "uns R$100, R$150". Quando vao conferir, o numero real e o dobro ou mais. Isso e o que chamo de <strong>custo invisivel</strong> -- dinheiro que sai da sua conta todo mes e que voce nem percebe.') +
        p('<strong>Um estudo do SPC Brasil mostrou que 58% dos brasileiros nao sabem exatamente quanto gastam por mes.</strong> Nao porque sao irresponsaveis, mas porque ninguem ensinou a prestar atencao da forma certa.') +
        p('O problema nao e ganhar pouco. O problema e a atencao fragmentada. Quando voce nao olha para o dinheiro, ele escoa por rachaduras que voce nem sabe que existem.') +
        p('<strong>Exercicio de 5 minutos (faca agora):</strong>') +
        pSmall('1. Abra o extrato do seu cartao de credito do ultimo mes.') +
        pSmall('2. Circule toda cobranca recorrente: assinaturas, mensalidades, debitos automaticos.') +
        pSmall('3. Some tudo.') +
        p('4. Pergunte: "De tudo isso, o que eu realmente uso toda semana?"') +
        p('Esse exercicio sozinho costuma revelar entre R$50 e R$300 por mes que poderiam ser cortados ou renegociados. Por ano, estamos falando de R$600 a R$3.600.') +
        hr() +
        teaser('<strong>Amanha no Dia 2:</strong> Vou te mostrar uma acao de 15 minutos que pode render R$600 por ano. E mais simples do que voce imagina.'),
        footer),
    },
    {
      day: 2,
      subject: 'Dia 2: A acao de 15 minutos que pode render R$600/ano',
      html: emailWrapper('Dia 2 de 5: R$600 em 15 Minutos', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Ontem voce descobriu seus custos invisiveis. Hoje vamos agir sobre um deles: <strong>tarifas bancarias</strong>.') +
        p('O brasileiro medio paga entre R$30 e R$60 por mes em tarifas de conta corrente, cartao e servicos bancarios que muitas vezes nem usa. Isso da R$360 a R$720 por ano.') +
        p('<strong>A acao de hoje: migrar para uma conta digital gratuita.</strong>') +
        p('Bancos como Nubank, C6, Inter e PagBank oferecem contas sem tarifa, cartao sem anuidade e ate rendimento automatico.') +
        p('<strong>Passo a passo em 15 minutos:</strong>') +
        pSmall('1. Escolha um banco digital (abra uma conta no Nubank ou Inter -- leva 5 minutos pelo celular).') +
        pSmall('2. Liste todos os debitos automaticos da sua conta bancaria atual.') +
        pSmall('3. Migre a portabilidade de salario (ligue para o RH ou faca pelo app do banco digital).') +
        p('4. Redirecione os debitos automaticos para a nova conta ao longo da proxima semana.') +
        p('<strong>Dica extra:</strong> Ligue para seu banco atual e diga que quer encerrar a conta. Em muitos casos, eles oferecem isencao de tarifas para voce ficar. Negocie.') +
        p('<strong>Bonus:</strong> Ative o rendimento automatico do saldo no banco digital. No Nubank, por exemplo, seu dinheiro rende 100% do CDI automaticamente.') +
        hr() +
        teaser('<strong>Amanha no Dia 3:</strong> Vamos montar seu painel financeiro pessoal -- uma forma visual e simples de ver para onde vai seu dinheiro, sem planilha complicada.'),
        footer),
    },
    {
      day: 3,
      subject: 'Dia 3: Monte seu painel financeiro pessoal (sem planilha complicada)',
      html: emailWrapper('Dia 3 de 5: Seu Painel Financeiro', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Voce ja cortou custos invisiveis e otimizou suas tarifas. Agora precisa de uma ferramenta para manter o controle daqui para frente.') +
        p('<strong>O metodo dos 3 baldes.</strong> Em vez de categorizar cada centavo, voce divide seu dinheiro em apenas 3 grupos:') +
        pSmall('<strong>Balde 1 -- Essencial (50-60%):</strong> Moradia, alimentacao, transporte, saude. O que voce PRECISA pagar para viver.') +
        pSmall('<strong>Balde 2 -- Qualidade de vida (20-30%):</strong> Lazer, restaurantes, compras, hobbies. O que torna a vida boa.') +
        p('<strong>Balde 3 -- Futuro (10-20%):</strong> Reserva de emergencia, investimentos, quitacao de dividas. O que constroi seguranca.') +
        p('<strong>Como montar na pratica:</strong>') +
        pSmall('1. Pegue sua renda liquida mensal (o que cai na conta).') +
        pSmall('2. Multiplique por 0.55 (Balde 1), 0.25 (Balde 2) e 0.20 (Balde 3).') +
        pSmall('3. Compare com seus gastos reais do ultimo mes (use o extrato).') +
        p('4. Ajuste os percentuais para sua realidade.') +
        p('<strong>Para acompanhar:</strong> Use o app Organizze (gratuito) ou o Mobills. Ambos categorizam gastos automaticamente quando voce conecta sua conta bancaria. Uma olhada de 2 minutos por dia e suficiente.') +
        p('<strong>Sua tarefa de hoje:</strong> Calcule seus 3 baldes com base na sua renda. Baixe o Organizze ou Mobills e registre seus gastos dos ultimos 3 dias.') +
        hr() +
        teaser('<strong>Amanha no Dia 4:</strong> Investimentos para quem nunca investiu. Vou te mostrar como comecar com literalmente R$1.'),
        footer),
    },
    {
      day: 4,
      subject: 'Dia 4: Investimentos para quem nunca investiu (comece com R$1)',
      html: emailWrapper('Dia 4 de 5: Primeiro Investimento', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('"Investir e para quem tem muito dinheiro." Essa e a maior mentira financeira do Brasil. Hoje vou provar que esta errada.') +
        p('<strong>Voce pode comecar a investir com R$1.</strong> Literalmente. E a forma mais segura que existe: o Tesouro Direto.') +
        p('<strong>O que e o Tesouro Direto?</strong> E um emprestimo que voce faz ao governo brasileiro. Em troca, o governo paga juros. E o investimento mais seguro do pais.') +
        p('<strong>Passo a passo para seu primeiro investimento:</strong>') +
        pSmall('1. Acesse tesourodireto.com.br e crie sua conta (5 minutos, precisa de CPF).') +
        pSmall('2. Escolha o <strong>Tesouro Selic</strong> -- o mais simples e com liquidez diaria (voce pode resgatar a qualquer momento).') +
        pSmall('3. Invista R$30 (o minimo para Tesouro Selic). Muitos bancos digitais permitem investir a partir de R$1 em CDBs com liquidez diaria.') +
        p('4. Pronto. Voce e oficialmente um investidor.') +
        p('<strong>O mais importante nao e o valor. E o habito.</strong> Quem investe R$30 por mes durante 20 anos com rendimento de 10% ao ano acumula cerca de R$22.800. Com R$200 por mes, seriam R$152.000.') +
        p('<strong>Regra de ouro:</strong> So invista dinheiro que voce nao vai precisar nos proximos 6 meses. Primeiro monte sua reserva de emergencia (3 a 6 meses de gastos essenciais) no Tesouro Selic.') +
        p('<strong>Sua tarefa de hoje:</strong> Faca seu primeiro investimento. Qualquer valor. O ato de investir pela primeira vez quebra uma barreira psicologica importante.') +
        hr() +
        teaser('<strong>Amanha no Dia 5:</strong> Vamos montar seu plano financeiro completo para os proximos 30 dias -- passo a passo, dia a dia.'),
        footer),
    },
    {
      day: 5,
      subject: 'Dia 5: Seu plano financeiro de 30 dias (passo a passo)',
      html: emailWrapper('Dia 5 de 5: Plano de 30 Dias', 'Mini-Curso Gratuito -- Aula Final', accent,
        p(`Ola, ${name}!`) +
        p('Ultima aula. Voce ja descobriu custos invisiveis, otimizou tarifas, criou seu painel financeiro e fez seu primeiro investimento. Agora vamos consolidar tudo.') +
        p('<strong>Semana 1 (Dias 1-7): Limpeza.</strong>') +
        p('Cancele todas as assinaturas que voce nao usa semanalmente. Renegocie operadora de celular e seguro do carro. Meta: reduzir pelo menos R$100 em gastos mensais fixos.') +
        p('<strong>Semana 2 (Dias 8-14): Organizacao.</strong>') +
        p('Configure seu app financeiro com os 3 baldes. Ative notificacoes de gastos. Crie um alarme diario de 2 minutos para registrar gastos.') +
        p('<strong>Semana 3 (Dias 15-21): Crescimento.</strong>') +
        p('Configure investimento automatico mensal no Tesouro Selic (mesmo que R$50). O automatico e fundamental -- se depender de lembrar, nao vai acontecer.') +
        p('<strong>Semana 4 (Dias 22-30): Consolidacao.</strong>') +
        p('Faca sua primeira revisao mensal completa. Compare gastos reais com os 3 baldes planejados. Calcule: quanto economizei neste mes versus o anterior? Defina metas para o proximo mes.') +
        p('<strong>O segredo nao e intensidade, e consistencia.</strong> Esses 30 dias constroem habitos que funcionam no piloto automatico pelo resto da vida.') +
        hr() +
        p('<strong>Quer um atalho?</strong>') +
        p('Criei a <strong>Planilha Radiografia Financeira</strong> -- um modelo pronto com os 3 baldes pre-configurados, calculadora de custos invisiveis, rastreador de assinaturas e simulador de investimentos.') +
        p(link('https://marinaveauvy.gumroad.com', 'Acesse a Planilha Radiografia Financeira aqui', accent)) +
        p('Obrigada por participar desse mini-curso. Se ele fez diferenca para voce, responda esse email me contando.') +
        p('Ate a proxima!'),
        footer),
    },
  ];
}

// ---------- RENDA EXTRA EMAILS ----------

function rendaExtraEmails(name) {
  const footer = 'Voce recebeu este email porque se inscreveu no mini-curso "5 Dias para Criar sua Primeira Renda Extra".';
  const accent = '#e94560';
  return [
    {
      day: 1,
      subject: 'Dia 1: Por que 31% dos brasileiros ja tem uma renda extra',
      html: emailWrapper('Dia 1 de 5: O Movimento da Renda Extra', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Segundo pesquisa do IBGE, quase 1 em cada 3 brasileiros ja tem alguma fonte de renda extra alem do trabalho principal. E esse numero cresce todo ano.') +
        p('<strong>Por que isso importa para voce?</strong>') +
        p('Depender de uma unica fonte de renda e o maior risco financeiro que existe. Nao importa se voce ganha R$3.000 ou R$15.000 -- se essa torneira fechar amanha, o que acontece?') +
        p('Renda extra nao e sobre "ganhar um trocado". E sobre <strong>construir seguranca financeira e liberdade de escolha</strong>.') +
        p('<strong>Os 3 tipos de renda extra que funcionam:</strong>') +
        pSmall('<strong>1. Servicos (troca tempo por dinheiro):</strong> Freelance, consultoria, aulas particulares. Comecar e rapido, mas tem limite de escala.') +
        pSmall('<strong>2. Produtos digitais (cria uma vez, vende varias):</strong> E-books, templates, planilhas, cursos online. Demora mais para comecar, mas escala sem limite.') +
        p('<strong>3. Intermediacao (conecta quem compra e quem vende):</strong> Afiliados, marketplace, dropshipping. Investimento baixo, aprende rapido sobre vendas.') +
        p('<strong>Sua tarefa de hoje:</strong> Responda mentalmente: "Se eu pudesse ganhar R$1.000 extras por mes fazendo algo que gosto, o que seria?" Nao precisa ser realista ainda.') +
        hr() +
        teaser('<strong>Amanha no Dia 2:</strong> Vou te ensinar um metodo para descobrir qual das suas habilidades e a mais lucrativa -- e como precifica-la.'),
        footer),
    },
    {
      day: 2,
      subject: 'Dia 2: Como descobrir sua habilidade mais lucrativa',
      html: emailWrapper('Dia 2 de 5: Sua Habilidade Lucrativa', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('"Mas eu nao tenho nenhuma habilidade especial." Escuto isso toda semana. E toda semana esta errado. Voce tem habilidades lucrativas -- so nao sabe quais sao.') +
        p('<strong>O Metodo da Intersecao.</strong> Sua renda extra ideal fica na intersecao de 3 circulos:') +
        pSmall('<strong>Circulo 1 -- O que voce sabe fazer:</strong> Habilidades tecnicas, experiencia profissional, hobbies que domina.') +
        pSmall('<strong>Circulo 2 -- O que as pessoas pedem para voce:</strong> Amigos pedem ajuda com o que? Colegas pedem conselho sobre o que?') +
        p('<strong>Circulo 3 -- O que tem demanda no mercado:</strong> Pessoas pagam por isso? Existe busca por esse servico?') +
        p('<strong>Exercicio pratico (15 minutos):</strong>') +
        pSmall('1. Liste 10 coisas que voce sabe fazer bem (inclua coisas "bobas" como organizar festas, montar moveis, escrever bem).') +
        pSmall('2. Mande mensagem para 3 amigos perguntando: "Se voce fosse me contratar para algo, seria para fazer o que?"') +
        pSmall('3. Para cada habilidade, pesquise no Google: "[habilidade] freelancer Brasil". Veja se existe mercado.') +
        p('4. Destaque as que aparecem nos 3 circulos. Essas sao suas candidatas.') +
        p('<strong>Como precificar:</strong> Pesquise em plataformas como 99Freelas, Workana ou Fiverr quanto profissionais cobram por servicos similares. Comece cobrando 20% abaixo da media para seus primeiros 3 clientes.') +
        p('<strong>Sua tarefa de hoje:</strong> Complete o exercicio acima. Ao final, escolha UMA habilidade para ser sua aposta de renda extra.') +
        hr() +
        teaser('<strong>Amanha no Dia 3:</strong> Vamos validar sua ideia em 24 horas, sem gastar um centavo.'),
        footer),
    },
    {
      day: 3,
      subject: 'Dia 3: Validando sua ideia em 24 horas (sem gastar nada)',
      html: emailWrapper('Dia 3 de 5: Validacao em 24h', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Voce escolheu sua habilidade. Agora a pergunta que salva meses de frustracao: <strong>alguem pagaria por isso?</strong> Vamos descobrir em 24 horas, sem gastar nada.') +
        p('<strong>O Teste do Pre-Venda.</strong> Em vez de criar o servico inteiro para depois tentar vender, voce inverte: tenta vender primeiro e cria depois.') +
        p('<strong>Passo 1: Crie uma oferta simples (30 minutos).</strong>') +
        p('Escreva em um paragrafo: O que voce faz + Para quem + Qual o resultado + Quanto custa. Exemplo: "Organizo a contabilidade de MEIs para que nao tenham surpresas no imposto de renda. R$200/mes."') +
        p('<strong>Passo 2: Publique em 3 canais (20 minutos).</strong>') +
        pSmall('-- Poste no seu Instagram/LinkedIn pessoal com a oferta.') +
        pSmall('-- Envie para 5 grupos de WhatsApp relevantes (nao spam -- oferta genuina).') +
        p('-- Publique em um grupo de Facebook do seu nicho.') +
        p('<strong>Passo 3: Avalie as respostas (24 horas depois).</strong>') +
        pSmall('-- 0 respostas: A oferta precisa de ajuste (nao a ideia inteira -- o formato, o preco ou o publico).') +
        pSmall('-- 1-3 interessados: Tem potencial. Converse com cada um para entender o que chamou atencao.') +
        p('-- 4+ interessados: Validado. Voce tem demanda real.') +
        p('<strong>Se ninguem responder, nao desista.</strong> Ajuste a oferta: mude o preco, mude o publico-alvo ou mude a forma como descreve o beneficio.') +
        p('<strong>Sua tarefa de hoje:</strong> Execute os Passos 1 e 2. Publique sua oferta. Nao espere ficar perfeito -- publique imperfeito.') +
        hr() +
        teaser('<strong>Amanha no Dia 4:</strong> Vou te ensinar como converter esses interessados no seu primeiro cliente pagante -- esta semana.'),
        footer),
    },
    {
      day: 4,
      subject: 'Dia 4: Conseguindo seu primeiro cliente esta semana',
      html: emailWrapper('Dia 4 de 5: Primeiro Cliente', 'Mini-Curso Gratuito', accent,
        p(`Ola, ${name}!`) +
        p('Voce publicou sua oferta. Hoje e dia de fechar seu primeiro cliente. E mais simples do que parece.') +
        p('<strong>A Estrategia do Primeiro -- Generoso e Estrategico.</strong>') +
        p('Seu primeiro cliente nao existe para dar lucro. Ele existe para provar que seu servico funciona e gerar um depoimento. Por isso:') +
        pSmall('<strong>1. Ofereca um desconto de lancamento (30-50%).</strong> Deixe claro que e preco de lancamento para os primeiros 3 clientes. Isso cria urgencia sem desvalorizar seu trabalho.') +
        pSmall('<strong>2. Procure nos circulos mais proximos primeiro.</strong> Amigos de amigos, ex-colegas, conhecidos que tem o problema que voce resolve. Mande mensagem direta, nao generica.') +
        p('<strong>3. Entregue mais do que prometeu.</strong> No primeiro cliente, va alem. Esse cliente vira seu evangelista.') +
        p('<strong>O script de venda que funciona:</strong>') +
        codeBlock('"Comecei a oferecer [SERVICO] para [PUBLICO]. O que eu faco e [BENEFICIO PRINCIPAL] em [PRAZO]. Estou com preco especial de lancamento: R$[VALOR] para os primeiros clientes. Conhece alguem que poderia se interessar?"') +
        p('Perceba: a pergunta "Conhece alguem?" tira a pressao de cima da pessoa. Ela pode indicar alguem ou se interessar -- ambos sao bons resultados.') +
        p('<strong>Onde encontrar clientes alem do seu circulo:</strong>') +
        pSmall('-- 99Freelas e Workana para servicos no Brasil.') +
        pSmall('-- Grupos de Facebook especificos do nicho.') +
        p('-- LinkedIn para servicos B2B (empresas).') +
        p('<strong>Sua tarefa de hoje:</strong> Envie o script acima para pelo menos 10 pessoas. Adapte para cada uma. Meta: 1 conversa de venda ate amanha.') +
        hr() +
        teaser('<strong>Amanha no Dia 5:</strong> Vamos transformar seu side hustle em algo que cresce. O plano de escala para ir de R$500 para R$5.000 por mes.'),
        footer),
    },
    {
      day: 5,
      subject: 'Dia 5: De side hustle a negocio -- o plano de escala',
      html: emailWrapper('Dia 5 de 5: O Plano de Escala', 'Mini-Curso Gratuito -- Aula Final', accent,
        p(`Ola, ${name}!`) +
        p('Ultima aula. Voce identificou sua habilidade, validou a ideia e buscou seu primeiro cliente. Agora vamos falar sobre o que separa uma renda extra ocasional de um negocio que cresce: <strong>sistemas</strong>.') +
        p('<strong>Os 4 niveis da renda extra:</strong>') +
        pSmall('<strong>Nivel 1 (R$500-1.000/mes):</strong> Voce faz tudo sozinho, encontra clientes por indicacao, cobra por projeto.') +
        pSmall('<strong>Nivel 2 (R$1.000-3.000/mes):</strong> Voce cria processos padrao, tem clientes recorrentes, comeca a cobrar por valor.') +
        pSmall('<strong>Nivel 3 (R$3.000-5.000/mes):</strong> Voce cria produtos digitais a partir do seu servico. Renda passiva comeca a aparecer.') +
        p('<strong>Nivel 4 (R$5.000+/mes):</strong> Voce tem marca pessoal, conteudo atraindo clientes organicamente, mix de servicos e produtos.') +
        p('<strong>Como ir do Nivel 1 ao Nivel 2 (proximo mes):</strong>') +
        pSmall('1. <strong>Documente seu processo.</strong> A cada servico, anote os passos. Em 5 projetos, voce tera um processo replicavel.') +
        pSmall('2. <strong>Peca depoimentos.</strong> Apos cada entrega: "O que estava acontecendo antes? O que mudou depois?" Depoimentos vendem mais que qualquer argumento.') +
        pSmall('3. <strong>Aumente o preco.</strong> A cada 3 clientes, aumente 15-20%. Se ninguem reclama, voce estava cobrando barato demais.') +
        p('4. <strong>Crie uma presenca online minima.</strong> Um perfil focado no que voce faz. Poste 2-3 vezes por semana.') +
        p('<strong>Seu plano para as proximas 4 semanas:</strong>') +
        pSmall('Semana 1: Feche 2 clientes com preco de lancamento.') +
        pSmall('Semana 2: Entregue com excelencia, peca depoimentos.') +
        pSmall('Semana 3: Publique os depoimentos, aumente o preco em 20%.') +
        p('Semana 4: Busque 3 novos clientes com o preco novo.') +
        hr() +
        p('<strong>Quer acelerar o processo?</strong>') +
        p('Criei o <strong>Template Planejador de Side Hustle</strong> -- um modelo completo com: canvas de ideia, planilha de precificacao, templates de proposta comercial, scripts de venda por WhatsApp, modelo de contrato simples e rastreador de clientes/receita.') +
        p(link('https://marinaveauvy.gumroad.com', 'Acesse o Template Planejador de Side Hustle aqui', accent)) +
        p('Obrigada por participar desse mini-curso. Se ele te ajudou a dar o primeiro passo, responda esse email me contando.') +
        p('Ate a proxima!'),
        footer),
    },
  ];
}

// ---------- MAIN HANDLER ----------

function getEmails(courseId, name) {
  switch (courseId) {
    case 'ia-negocios': return iaEmails(name);
    case 'financas-pessoais': return financasEmails(name);
    case 'renda-extra': return rendaExtraEmails(name);
    default: return null;
  }
}

module.exports = async function handler(req, res) {
  // CORS
  const allowedOrigins = [
    'https://marinaveauvy.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const { name, email, course_id } = req.body || {};

    if (!name || !email || !course_id) {
      return res.status(400).json({ error: 'Campos obrigatorios: name, email, course_id' });
    }

    const config = COURSE_CONFIG[course_id];
    if (!config) {
      return res.status(400).json({ error: 'course_id invalido. Opcoes: ia-negocios, financas-pessoais, renda-extra' });
    }

    const emails = getEmails(course_id, name);
    if (!emails) {
      return res.status(500).json({ error: 'Erro ao gerar emails do curso' });
    }

    // 1. Add contact to Resend audience
    try {
      await fetch(`https://api.resend.com/audiences/${config.audienceId}/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          first_name: name,
          unsubscribed: false,
        }),
      });
    } catch (audienceErr) {
      console.error('Erro ao adicionar contato na audience:', audienceErr);
      // Continue even if audience add fails - still send emails
    }

    // 2. Send Day 1 immediately
    const day1 = emails[0];
    const day1Res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: day1.subject,
        html: day1.html,
        tags: [
          { name: 'course', value: course_id },
          { name: 'day', value: '1' },
        ],
      }),
    });

    if (!day1Res.ok) {
      const errBody = await day1Res.text();
      console.error('Erro ao enviar Dia 1:', errBody);
      return res.status(500).json({ error: 'Erro ao enviar email do Dia 1' });
    }

    // 3. Schedule Days 2-5 using Resend scheduled_at
    const now = Date.now();
    const scheduleResults = [];

    for (let i = 1; i < emails.length; i++) {
      const emailData = emails[i];
      const scheduledAt = new Date(now + (i * 24 * 60 * 60 * 1000)).toISOString();

      try {
        const schedRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: config.from,
            to: [email],
            subject: emailData.subject,
            html: emailData.html,
            scheduled_at: scheduledAt,
            tags: [
              { name: 'course', value: course_id },
              { name: 'day', value: String(emailData.day) },
            ],
          }),
        });

        const schedBody = await schedRes.json();
        scheduleResults.push({
          day: emailData.day,
          scheduled_at: scheduledAt,
          success: schedRes.ok,
          id: schedBody.id || null,
        });
      } catch (schedErr) {
        console.error(`Erro ao agendar Dia ${emailData.day}:`, schedErr);
        scheduleResults.push({
          day: emailData.day,
          scheduled_at: scheduledAt,
          success: false,
          error: schedErr.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Inscricao realizada com sucesso',
      course: course_id,
      email: email,
      day1_sent: true,
      scheduled: scheduleResults,
    });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};