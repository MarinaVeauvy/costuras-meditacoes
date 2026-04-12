const TOKEN = Buffer.from(`${process.env.WP_USER || 'wp.marinaveauvy.com.br'}:${process.env.WP_APP_PASSWORD}`).toString('base64');

async function publish(title, slug, content) {
  const res = await fetch('https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, slug, content, status: 'publish' })
  });
  const data = await res.json();
  if (data.id) {
    console.log(`OK | ${data.id} | ${data.slug} | ${data.link}`);
  } else {
    console.log(`ERRO | ${slug} | ${JSON.stringify(data)}`);
  }
  return data;
}

function formatBRL(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNum(val) {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =============================================
// TEMPLATE 1: CDB vs Poupanca
// =============================================
function generateCDBPage(valor, valorLabel, slug) {
  const SELIC = 0.15;
  const POUPANCA_ANUAL = 0.0617;
  const CDI_ANUAL = 0.149;
  const IR_1ANO = 0.175; // 17.5% apos 720 dias (simplificado para 1 ano+)

  const rendPoupancaAnual = valor * POUPANCA_ANUAL;
  const rendPoupancaMensal = rendPoupancaAnual / 12;
  const rendCDBBrutoAnual = valor * CDI_ANUAL;
  const irCDB = rendCDBBrutoAnual * IR_1ANO;
  const rendCDBLiquidoAnual = rendCDBBrutoAnual - irCDB;
  const rendCDBMensal = rendCDBLiquidoAnual / 12;
  const diferenca = rendCDBLiquidoAnual - rendPoupancaAnual;
  const diferencaMensal = diferenca / 12;
  const totalPoupanca12 = valor + rendPoupancaAnual;
  const totalCDB12 = valor + rendCDBLiquidoAnual;

  const title = `Quanto Rende ${valorLabel} no CDB vs Poupanca em 2026`;

  const content = `
<p>Se voce tem <strong>${valorLabel}</strong> guardados e esta em duvida entre deixar na poupanca ou investir em um CDB, este artigo traz os calculos exatos para 2026, com a Selic a 15% ao ano.</p>

<p>A resposta curta: com ${valorLabel} no CDB, voce ganha <strong>${formatBRL(diferenca)} a mais por ano</strong> do que na poupanca. Isso representa <strong>${formatBRL(diferencaMensal)} a mais por mes</strong>.</p>

<h2>Cenario Atual: Selic a 15% em 2026</h2>

<p>Com a taxa Selic em 15% ao ano, o rendimento dos investimentos de renda fixa esta em patamares historicamente elevados. O CDI acompanha de perto a Selic, operando em torno de 14,9% ao ano. Ja a poupanca segue a regra antiga (quando a Selic esta acima de 8,5%): rende 0,5% ao mes + TR, totalizando aproximadamente 6,17% ao ano.</p>

<p>Essa diferenca de rendimento entre CDB e poupanca nunca foi tao grande quanto agora. Veja os numeros para ${valorLabel}:</p>

<h2>Simulacao: ${valorLabel} na Poupanca</h2>

<ul>
<li><strong>Rendimento anual:</strong> ${formatBRL(rendPoupancaAnual)}</li>
<li><strong>Rendimento mensal (medio):</strong> ${formatBRL(rendPoupancaMensal)}</li>
<li><strong>Total apos 12 meses:</strong> ${formatBRL(totalPoupanca12)}</li>
<li><strong>Imposto de Renda:</strong> Isento</li>
</ul>

<p>A poupanca tem a vantagem de ser isenta de IR. Porem, mesmo com essa isencao, o rendimento liquido fica muito abaixo do CDB.</p>

<h2>Simulacao: ${valorLabel} no CDB 100% CDI</h2>

<ul>
<li><strong>Rendimento bruto anual:</strong> ${formatBRL(rendCDBBrutoAnual)}</li>
<li><strong>Imposto de Renda (17,5% apos 720 dias):</strong> -${formatBRL(irCDB)}</li>
<li><strong>Rendimento liquido anual:</strong> ${formatBRL(rendCDBLiquidoAnual)}</li>
<li><strong>Rendimento liquido mensal (medio):</strong> ${formatBRL(rendCDBMensal)}</li>
<li><strong>Total apos 12 meses:</strong> ${formatBRL(totalCDB12)}</li>
</ul>

<p>O IR sobre CDB segue a tabela regressiva: 22,5% ate 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias e 15% acima de 720 dias. Na simulacao acima, consideramos a aliquota de 17,5% para investimentos mantidos por mais de 1 ano.</p>

<h2>Comparativo Direto: CDB vs Poupanca</h2>

<table>
<thead>
<tr><th>Item</th><th>Poupanca</th><th>CDB 100% CDI</th></tr>
</thead>
<tbody>
<tr><td>Valor investido</td><td>${formatBRL(valor)}</td><td>${formatBRL(valor)}</td></tr>
<tr><td>Rendimento bruto (12 meses)</td><td>${formatBRL(rendPoupancaAnual)}</td><td>${formatBRL(rendCDBBrutoAnual)}</td></tr>
<tr><td>Imposto de Renda</td><td>R$ 0,00</td><td>${formatBRL(irCDB)}</td></tr>
<tr><td>Rendimento liquido (12 meses)</td><td>${formatBRL(rendPoupancaAnual)}</td><td>${formatBRL(rendCDBLiquidoAnual)}</td></tr>
<tr><td>Total acumulado</td><td>${formatBRL(totalPoupanca12)}</td><td>${formatBRL(totalCDB12)}</td></tr>
<tr><td>Rendimento mensal medio</td><td>${formatBRL(rendPoupancaMensal)}</td><td>${formatBRL(rendCDBMensal)}</td></tr>
</tbody>
</table>

<h2>Quanto Voce Perde Deixando ${valorLabel} na Poupanca</h2>

<p>Ao optar pela poupanca ao inves do CDB, voce deixa de ganhar:</p>

<ul>
<li><strong>${formatBRL(diferenca)} por ano</strong></li>
<li><strong>${formatBRL(diferencaMensal)} por mes</strong></li>
</ul>

<p>Em 5 anos, essa diferenca se acumula significativamente por conta dos juros compostos. Nao se trata apenas de "um pouco mais": e dinheiro real que voce esta deixando na mesa.</p>

<h2>Evolucao Mensal do Investimento</h2>

<p>Veja como ${valorLabel} evolui mes a mes em cada aplicacao:</p>

<table>
<thead>
<tr><th>Mes</th><th>Poupanca</th><th>CDB (liquido)</th><th>Diferenca</th></tr>
</thead>
<tbody>
${[1,3,6,9,12].map(m => {
  const poup = valor * Math.pow(1 + POUPANCA_ANUAL/12, m);
  const cdbBruto = valor * Math.pow(1 + CDI_ANUAL/12, m);
  const rendBruto = cdbBruto - valor;
  const irRate = m <= 6 ? 0.225 : m <= 12 ? 0.20 : 0.175;
  const cdbLiq = valor + rendBruto * (1 - irRate);
  const diff = cdbLiq - poup;
  return `<tr><td>${m}</td><td>${formatBRL(poup)}</td><td>${formatBRL(cdbLiq)}</td><td>+${formatBRL(diff)}</td></tr>`;
}).join('\n')}
</tbody>
</table>

<h2>CDB e Seguro? Tem Liquidez?</h2>

<p>Sim. CDBs emitidos por bancos sao protegidos pelo FGC (Fundo Garantidor de Creditos) ate R$ 250.000 por CPF por instituicao. Isso significa que, em caso de quebra do banco, voce recebe seu dinheiro de volta, ate esse limite.</p>

<p>Quanto a liquidez, existem CDBs com liquidez diaria (voce pode resgatar a qualquer momento) e CDBs com vencimento fixo (que costumam pagar taxas maiores). Para quem precisa de flexibilidade, o CDB com liquidez diaria e a melhor alternativa a poupanca.</p>

<h2>Quando a Poupanca Pode Valer a Pena?</h2>

<p>A poupanca so faz sentido em situacoes muito especificas: valores muito pequenos (abaixo de R$ 1.000) onde a diferenca e irrisoria, ou quando voce precisa de dinheiro disponivel para saque imediato em caixa eletronico. Fora esses casos, o CDB com liquidez diaria oferece a mesma praticidade com rendimento superior.</p>

<h2>Faca Sua Propria Simulacao</h2>

<p>Quer calcular com outros valores ou prazos diferentes? Use nosso <a href="/simulador-cdb-vs-poupanca/">Simulador CDB vs Poupanca</a> e descubra exatamente quanto seu dinheiro pode render.</p>

<hr>

<h3>Receba Dicas de Financas no Seu Email</h3>

<p>Assine a newsletter <strong>Dinheiro Simples</strong> e receba toda semana conteudos praticos sobre investimentos, economia de impostos e organizacao financeira. Sem enrolacao, direto ao ponto.</p>
`;

  return { title, slug, content };
}

// =============================================
// TEMPLATE 2: CLT vs PJ
// =============================================
function calcINSS(salario) {
  // Tabela INSS 2026 (progressiva)
  const faixas = [
    { limite: 1518.00, aliquota: 0.075 },
    { limite: 2793.88, aliquota: 0.09 },
    { limite: 4190.83, aliquota: 0.12 },
    { limite: 8157.41, aliquota: 0.14 }
  ];
  let inss = 0;
  let anterior = 0;
  for (const faixa of faixas) {
    const base = Math.min(salario, faixa.limite) - anterior;
    if (base <= 0) break;
    inss += base * faixa.aliquota;
    anterior = faixa.limite;
  }
  return inss;
}

function calcIRRF(baseIR) {
  // Tabela IRRF 2026 (progressiva)
  const faixas = [
    { limite: 2259.20, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 169.44 },
    { limite: 3751.05, aliquota: 0.15, deducao: 381.44 },
    { limite: 4664.68, aliquota: 0.225, deducao: 662.77 },
    { limite: Infinity, aliquota: 0.275, deducao: 896.00 }
  ];
  for (const faixa of faixas) {
    if (baseIR <= faixa.limite) {
      return Math.max(0, baseIR * faixa.aliquota - faixa.deducao);
    }
  }
  return 0;
}

function calcSimplesNacional(faturamentoAnual) {
  // Anexo III - Servicos (mais comum para PJ prestador)
  const faixas = [
    { limite: 180000, aliquota: 0.06, deducao: 0 },
    { limite: 360000, aliquota: 0.112, deducao: 9360 },
    { limite: 720000, aliquota: 0.135, deducao: 17640 },
    { limite: 1800000, aliquota: 0.16, deducao: 35640 },
    { limite: 3600000, aliquota: 0.21, deducao: 125640 },
    { limite: 4800000, aliquota: 0.33, deducao: 648000 }
  ];
  for (const faixa of faixas) {
    if (faturamentoAnual <= faixa.limite) {
      const aliqEfetiva = (faturamentoAnual * faixa.aliquota - faixa.deducao) / faturamentoAnual;
      return aliqEfetiva;
    }
  }
  return 0.33;
}

function generateCLTvsPJPage(salario, salarioLabel, slug) {
  const inss = calcINSS(salario);
  const baseIR = salario - inss;
  const irrf = calcIRRF(baseIR);
  const liquidoCLT = salario - inss - irrf;

  // Beneficios CLT anuais
  const fgts = salario * 0.08 * 12;
  const decimoTerceiro = salario;
  const ferias = salario * (1 + 1/3);
  const custoCLTEmpregador = salario * 12 + fgts + decimoTerceiro + ferias;
  const recebeTotalAnualCLT = liquidoCLT * 12 + decimoTerceiro + ferias + fgts;

  // PJ - faturamento equivalente (geralmente 1.0 a 1.4x do salario CLT)
  const faturamentoPJ = salario; // mesmo valor nominal
  const faturamentoAnualPJ = faturamentoPJ * 12;
  const aliqSimples = calcSimplesNacional(faturamentoAnualPJ);
  const impostoPJMensal = faturamentoPJ * aliqSimples;
  const contabilidade = 200; // custo mensal estimado
  const liquidoPJ = faturamentoPJ - impostoPJMensal - contabilidade;
  const liquidoPJAnual = liquidoPJ * 12;

  // Faturamento PJ necessario para igualar CLT (incluindo beneficios)
  const recebeCLTMesEquiv = recebeTotalAnualCLT / 12;
  // Para igualar, PJ precisa faturar mais
  const fatorNecessario = recebeCLTMesEquiv / liquidoPJ;
  const faturamentoNecessario = faturamentoPJ * fatorNecessario;

  const aliqPercent = (aliqSimples * 100).toFixed(1);

  let veredicto = '';
  let veredictoCurto = '';
  if (salario <= 5000) {
    veredicto = `Para um salario de ${salarioLabel}, a CLT tende a ser mais vantajosa. Os beneficios trabalhistas (FGTS, 13o, ferias) representam um acrescimo significativo proporcionalmente. Como PJ, a economia tributaria nao compensa a perda desses beneficios, a menos que voce consiga negociar um valor de contrato substancialmente maior.`;
    veredictoCurto = 'CLT tende a compensar mais';
  } else if (salario <= 10000) {
    veredicto = `Na faixa de ${salarioLabel}, a decisao depende muito do valor negociado como PJ. Se voce conseguir um contrato PJ de pelo menos ${formatBRL(faturamentoNecessario)}, a modalidade PJ se torna mais interessante. Caso contrario, os beneficios da CLT ainda pesam bastante.`;
    veredictoCurto = 'Depende do valor negociado como PJ';
  } else {
    veredicto = `Com salario de ${salarioLabel}, o regime PJ tende a ser mais vantajoso financeiramente, desde que voce tenha disciplina para criar sua propria reserva (equivalente ao FGTS) e provisionar ferias e 13o. A carga tributaria do Simples Nacional nessa faixa (${aliqPercent}%) e significativamente menor que os descontos da CLT.`;
    veredictoCurto = 'PJ tende a compensar mais';
  }

  const title = `Salario ${salarioLabel}: CLT vs PJ - O que Compensa Mais em 2026`;

  const content = `
<p>Recebeu uma proposta de ${salarioLabel} e precisa decidir entre CLT e PJ? Este artigo mostra os calculos completos para 2026, considerando todos os impostos, beneficios e custos de cada regime.</p>

<p><strong>Veredicto rapido:</strong> ${veredictoCurto}. Continue lendo para entender todos os numeros.</p>

<h2>Calculo CLT: Salario de ${salarioLabel}</h2>

<h3>Descontos Mensais do Empregado</h3>

<ul>
<li><strong>Salario bruto:</strong> ${formatBRL(salario)}</li>
<li><strong>INSS (progressivo):</strong> -${formatBRL(inss)}</li>
<li><strong>Base para IR:</strong> ${formatBRL(baseIR)}</li>
<li><strong>IRRF:</strong> -${formatBRL(irrf)}</li>
<li><strong>Salario liquido mensal:</strong> ${formatBRL(liquidoCLT)}</li>
</ul>

<p>O calculo do INSS segue a tabela progressiva de 2026: 7,5% ate R$ 1.518,00; 9% de R$ 1.518,01 a R$ 2.793,88; 12% de R$ 2.793,89 a R$ 4.190,83; e 14% de R$ 4.190,84 a R$ 8.157,41 (teto).</p>

<h3>Beneficios Anuais CLT</h3>

<ul>
<li><strong>13o salario:</strong> ${formatBRL(decimoTerceiro)}</li>
<li><strong>Ferias + 1/3:</strong> ${formatBRL(ferias)}</li>
<li><strong>FGTS anual (8%/mes):</strong> ${formatBRL(fgts)}</li>
<li><strong>Remuneracao total anual estimada:</strong> ${formatBRL(recebeTotalAnualCLT)}</li>
</ul>

<p>Alem desses valores, a CLT garante estabilidade em caso de doenca (auxilio-doenca), licenca maternidade/paternidade, seguro-desemprego em caso de demissao sem justa causa e multa de 40% sobre o FGTS.</p>

<h2>Calculo PJ: Faturamento de ${salarioLabel}/mes</h2>

<h3>Custos Mensais como PJ (Simples Nacional - Anexo III)</h3>

<ul>
<li><strong>Faturamento mensal:</strong> ${formatBRL(faturamentoPJ)}</li>
<li><strong>Faturamento anual:</strong> ${formatBRL(faturamentoAnualPJ)}</li>
<li><strong>Aliquota efetiva Simples Nacional:</strong> ${aliqPercent}%</li>
<li><strong>Imposto mensal:</strong> -${formatBRL(impostoPJMensal)}</li>
<li><strong>Contabilidade (estimativa):</strong> -${formatBRL(contabilidade)}</li>
<li><strong>Liquido mensal PJ:</strong> ${formatBRL(liquidoPJ)}</li>
</ul>

<p>O Simples Nacional no Anexo III (prestacao de servicos) tem aliquotas que variam de 6% a 33%, dependendo do faturamento anual. Para um faturamento de ${formatBRL(faturamentoAnualPJ)}/ano, a aliquota efetiva fica em ${aliqPercent}%.</p>

<h2>Comparativo Direto: CLT vs PJ</h2>

<table>
<thead>
<tr><th>Item</th><th>CLT</th><th>PJ</th></tr>
</thead>
<tbody>
<tr><td>Valor bruto mensal</td><td>${formatBRL(salario)}</td><td>${formatBRL(faturamentoPJ)}</td></tr>
<tr><td>Descontos/impostos mensais</td><td>${formatBRL(inss + irrf)}</td><td>${formatBRL(impostoPJMensal + contabilidade)}</td></tr>
<tr><td>Liquido mensal</td><td>${formatBRL(liquidoCLT)}</td><td>${formatBRL(liquidoPJ)}</td></tr>
<tr><td>13o salario</td><td>Sim</td><td>Nao</td></tr>
<tr><td>Ferias remuneradas</td><td>Sim (+ 1/3)</td><td>Nao</td></tr>
<tr><td>FGTS</td><td>Sim (8%/mes)</td><td>Nao</td></tr>
<tr><td>Seguro-desemprego</td><td>Sim</td><td>Nao</td></tr>
<tr><td>INSS (aposentadoria)</td><td>Automatico</td><td>Incluido no Simples</td></tr>
</tbody>
</table>

<h2>Quanto Precisa Faturar como PJ para Compensar?</h2>

<p>Considerando todos os beneficios da CLT, a remuneracao total equivale a aproximadamente ${formatBRL(recebeCLTMesEquiv)} por mes. Para igualar esse valor como PJ, voce precisaria faturar cerca de <strong>${formatBRL(faturamentoNecessario)}/mes</strong>.</p>

<p>Isso significa que, se a empresa oferece ${salarioLabel} na CLT, voce deveria pedir pelo menos <strong>${formatBRL(faturamentoNecessario)}</strong> como PJ para nao sair perdendo.</p>

<h2>Veredicto: ${salarioLabel} - CLT ou PJ?</h2>

<p>${veredicto}</p>

<h3>Fatores Alem do Dinheiro</h3>

<p>A decisao entre CLT e PJ nao e puramente financeira. Considere tambem:</p>

<ul>
<li><strong>Estabilidade:</strong> CLT oferece protecao trabalhista; PJ pode ser encerrado a qualquer momento</li>
<li><strong>Disciplina financeira:</strong> como PJ, voce precisa provisionar ferias, 13o e reserva de emergencia por conta propria</li>
<li><strong>Plano de saude:</strong> muitas empresas oferecem na CLT; como PJ, voce paga do proprio bolso</li>
<li><strong>Flexibilidade:</strong> PJ geralmente permite atender mais de um cliente</li>
<li><strong>Aposentadoria:</strong> na CLT e automatica; como PJ no Simples, o INSS ja esta embutido</li>
</ul>

<h2>Faca Sua Simulacao Personalizada</h2>

<p>Os calculos acima usam valores padrao. Sua situacao pode ter particularidades (dependentes, plano de saude, outros beneficios). Use nossa <a href="/calculadora-clt-vs-pj/">Calculadora CLT vs PJ</a> para um resultado personalizado.</p>

<hr>

<h3>Receba Dicas de Financas no Seu Email</h3>

<p>Assine a newsletter <strong>Dinheiro Simples</strong> e receba toda semana conteudos praticos sobre impostos, investimentos e planejamento financeiro. Sem complicacao.</p>
`;

  return { title, slug, content };
}

// =============================================
// TEMPLATE 3: Prompts IA por Profissao
// =============================================
function generatePromptsPage(profissao, slug, prompts) {
  const title = `Melhores Prompts de IA para ${profissao} em 2026`;

  let promptsHTML = '';
  for (let i = 0; i < prompts.length; i++) {
    promptsHTML += `
<h3>${i + 1}. ${prompts[i].titulo}</h3>

<p><strong>Prompt:</strong></p>
<blockquote><p>${prompts[i].prompt}</p></blockquote>

<p><strong>Como ajuda no dia a dia:</strong> ${prompts[i].beneficio}</p>
`;
  }

  const content = `
<p>A inteligencia artificial esta transformando a rotina de ${profissao.toLowerCase()} em todo o Brasil. Com os prompts certos, voce pode automatizar tarefas repetitivas, melhorar a qualidade do seu trabalho e ganhar horas no seu dia.</p>

<p>Reunimos 7 prompts testados e otimizados para a realidade de ${profissao.toLowerCase()} brasileiros. Cada prompt foi elaborado para gerar respostas uteis e aplicaveis imediatamente.</p>

<h2>Como Usar Estes Prompts</h2>

<p>Antes de comecar, algumas dicas para obter melhores resultados:</p>

<ul>
<li>Copie o prompt e cole no ChatGPT, Claude ou Gemini</li>
<li>Substitua os trechos entre colchetes pelas informacoes do seu caso</li>
<li>Sempre revise a resposta da IA antes de usar profissionalmente</li>
<li>Adapte o tom e a linguagem para o seu publico</li>
</ul>

<h2>7 Prompts Essenciais para ${profissao}</h2>

${promptsHTML}

<h2>Dicas para Melhorar Seus Resultados com IA</h2>

<p>Os prompts acima sao pontos de partida. Para obter resultados ainda melhores:</p>

<ul>
<li><strong>Seja especifico:</strong> quanto mais contexto voce fornecer, melhor sera a resposta</li>
<li><strong>Itere:</strong> se a primeira resposta nao ficou ideal, peca ajustes especificos</li>
<li><strong>Combine prompts:</strong> use a saida de um prompt como entrada para outro</li>
<li><strong>Salve seus melhores prompts:</strong> crie uma biblioteca pessoal das versoes que funcionam melhor</li>
</ul>

<h2>Crie Prompts Personalizados</h2>

<p>Quer gerar prompts sob medida para sua especialidade? Use nosso <a href="/gerador-prompts-chatgpt/">Gerador de Prompts para ChatGPT</a> e crie prompts otimizados para qualquer tarefa da sua rotina profissional.</p>

<hr>

<h3>Receba Prompts Exclusivos por Email</h3>

<p>Assine a newsletter <strong>Impulso IA</strong> e receba toda semana novos prompts, ferramentas e estrategias de inteligencia artificial para profissionais. Conteudo pratico, sem jargao tecnico.</p>
`;

  return { title, slug, content };
}

// =============================================
// DATA
// =============================================

const cdbPages = [
  { valor: 5000, label: 'R$5.000', slug: 'quanto-rende-5-mil-cdb' },
  { valor: 10000, label: 'R$10.000', slug: 'quanto-rende-10-mil-cdb' },
  { valor: 20000, label: 'R$20.000', slug: 'quanto-rende-20-mil-cdb' },
  { valor: 30000, label: 'R$30.000', slug: 'quanto-rende-30-mil-cdb' },
  { valor: 50000, label: 'R$50.000', slug: 'quanto-rende-50-mil-cdb' },
  { valor: 100000, label: 'R$100.000', slug: 'quanto-rende-100-mil-cdb' },
  { valor: 200000, label: 'R$200.000', slug: 'quanto-rende-200-mil-cdb' },
  { valor: 500000, label: 'R$500.000', slug: 'quanto-rende-500-mil-cdb' },
];

const cltPjPages = [
  { salario: 3000, label: 'R$3.000', slug: 'salario-3000-clt-vs-pj' },
  { salario: 5000, label: 'R$5.000', slug: 'salario-5000-clt-vs-pj' },
  { salario: 7000, label: 'R$7.000', slug: 'salario-7000-clt-vs-pj' },
  { salario: 10000, label: 'R$10.000', slug: 'salario-10000-clt-vs-pj' },
  { salario: 15000, label: 'R$15.000', slug: 'salario-15000-clt-vs-pj' },
  { salario: 20000, label: 'R$20.000', slug: 'salario-20000-clt-vs-pj' },
  { salario: 30000, label: 'R$30.000', slug: 'salario-30000-clt-vs-pj' },
];

const promptsData = [
  {
    profissao: 'Advogados',
    slug: 'prompts-ia-advogados',
    prompts: [
      {
        titulo: 'Resumo de Jurisprudencia',
        prompt: 'Analise a seguinte decisao judicial e faca um resumo estruturado contendo: (1) partes envolvidas, (2) fatos relevantes, (3) fundamentos juridicos, (4) decisao e (5) impacto pratico para casos semelhantes. Decisao: [cole o texto da decisao aqui]',
        beneficio: 'Economiza horas de leitura e analise de decisoes judiciais. Em vez de ler paginas de acordaos, voce recebe um resumo estruturado que facilita a pesquisa e a fundamentacao de pecas.'
      },
      {
        titulo: 'Minutas de Contratos',
        prompt: 'Elabore uma minuta de [tipo de contrato: prestacao de servicos / locacao / compra e venda] entre [parte A] e [parte B], considerando: objeto do contrato: [descreva], valor: [R$], prazo: [meses/anos], jurisdicao: [cidade/estado]. Inclua clausulas de rescisao, multa, foro competente e disposicoes gerais conforme a legislacao brasileira vigente.',
        beneficio: 'Gera uma primeira versao completa do contrato que voce pode revisar e adaptar, reduzindo o tempo de elaboracao de horas para minutos.'
      },
      {
        titulo: 'Argumentacao para Peticoes',
        prompt: 'Preciso construir argumentos juridicos para uma [tipo de peca: peticao inicial / contestacao / recurso] sobre [tema]. Os fatos sao: [descreva os fatos]. A tese principal e: [sua tese]. Liste 5 argumentos juridicos solidos, citando artigos de lei e principios aplicaveis do direito brasileiro.',
        beneficio: 'Ajuda a estruturar a argumentacao e identificar fundamentos legais que voce pode nao ter considerado, fortalecendo suas pecas processuais.'
      },
      {
        titulo: 'Analise de Riscos Contratuais',
        prompt: 'Analise o seguinte contrato e identifique: (1) clausulas potencialmente abusivas, (2) riscos para [parte que voce representa], (3) clausulas ausentes que deveriam constar, (4) sugestoes de alteracao para proteger os interesses do meu cliente. Contrato: [cole o texto]',
        beneficio: 'Funciona como uma segunda opiniao automatizada na revisao de contratos, ajudando a identificar riscos que podem passar despercebidos em uma leitura rapida.'
      },
      {
        titulo: 'Calculo de Prazos Processuais',
        prompt: 'Considerando a legislacao processual brasileira (CPC/CPP), calcule os prazos para as seguintes situacoes: tipo de processo: [civel/criminal/trabalhista], ato processual: [citacao/intimacao/publicacao], data do ato: [dd/mm/aaaa], comarca: [cidade/estado]. Liste todos os prazos aplicaveis, considerando feriados e dias uteis.',
        beneficio: 'Reduz o risco de perda de prazos e serve como conferencia dupla para o controle de prazos do escritorio.'
      },
      {
        titulo: 'Comunicacao com Clientes',
        prompt: 'Redija um email profissional para meu cliente [nome] explicando em linguagem acessivel (sem jargao juridico) o seguinte andamento processual: [descreva o que aconteceu no processo]. O tom deve ser [tranquilizador/objetivo/urgente]. Inclua proximos passos e prazo estimado.',
        beneficio: 'Melhora a comunicacao com clientes que nao entendem termos juridicos, aumentando a satisfacao e reduzindo ligacoes de acompanhamento.'
      },
      {
        titulo: 'Pesquisa Legislativa Comparada',
        prompt: 'Compare a legislacao brasileira sobre [tema: protecao de dados / direito do consumidor / direito trabalhista] com a de [pais/bloco: Uniao Europeia / EUA / Argentina]. Destaque: (1) semelhancas, (2) diferencas principais, (3) lacunas na legislacao brasileira, (4) tendencias internacionais que podem influenciar mudancas no Brasil.',
        beneficio: 'Util para pareceres que exigem perspectiva comparada e para antecipar tendencias regulatorias que podem afetar seus clientes.'
      }
    ]
  },
  {
    profissao: 'Dentistas',
    slug: 'prompts-ia-dentistas',
    prompts: [
      {
        titulo: 'Plano de Tratamento Explicativo',
        prompt: 'Elabore uma explicacao em linguagem simples para um paciente sobre o seguinte plano de tratamento odontologico: procedimento: [descreva], numero de sessoes: [X], valor aproximado: [R$]. Explique por que o tratamento e necessario, o que acontece em cada etapa, cuidados pos-procedimento e riscos de nao realizar o tratamento.',
        beneficio: 'Ajuda a converter orcamentos em tratamentos aceitos. Pacientes que entendem o procedimento tem mais confianca e maior taxa de adesao ao plano de tratamento.'
      },
      {
        titulo: 'Posts Educativos para Instagram',
        prompt: 'Crie 5 posts educativos para Instagram de um consultorio odontologico sobre [tema: clareamento / implantes / ortodontia / prevencao]. Cada post deve ter: titulo chamativo, texto informativo de ate 200 palavras, sugestao de imagem e 5 hashtags relevantes. Tom: profissional mas acessivel.',
        beneficio: 'Mantem as redes sociais do consultorio ativas com conteudo de qualidade, atraindo novos pacientes organicamente sem precisar de uma agencia de marketing.'
      },
      {
        titulo: 'Anamnese Detalhada',
        prompt: 'Crie um roteiro de anamnese odontologica completo para pacientes com [condicao: diabetes / hipertensao / gravidez / uso de anticoagulantes]. Inclua perguntas especificas sobre medicamentos, interacoes com anestesicos, cuidados especiais durante procedimentos e contraindicacoes.',
        beneficio: 'Garante que nenhuma pergunta importante seja esquecida durante a anamnese de pacientes com condicoes especiais, reduzindo riscos clinicos.'
      },
      {
        titulo: 'Protocolos Clinicos',
        prompt: 'Descreva o protocolo clinico passo a passo para [procedimento: extracao de terceiro molar incluso / endodontia de molar / instalacao de implante]. Inclua: materiais necessarios, sequencia de procedimentos, doses de anestesico, cuidados transoperatorios e prescricao pos-operatoria padrao.',
        beneficio: 'Serve como referencia rapida e material de treinamento para a equipe do consultorio, padronizando procedimentos e reduzindo erros.'
      },
      {
        titulo: 'Mensagens de Follow-up',
        prompt: 'Crie 5 mensagens de WhatsApp para acompanhamento pos-procedimento odontologico: (1) logo apos o procedimento, (2) 24 horas depois, (3) 1 semana depois, (4) lembrete de retorno, (5) pesquisa de satisfacao. Procedimento realizado: [descreva]. Tom: cuidadoso e profissional.',
        beneficio: 'Automatiza o acompanhamento do paciente, demonstrando cuidado e profissionalismo, alem de reduzir complicacoes por falta de orientacao pos-operatoria.'
      },
      {
        titulo: 'Gestao Financeira do Consultorio',
        prompt: 'Monte uma planilha de controle financeiro para consultorio odontologico contendo: categorias de receita (por procedimento), categorias de despesa (aluguel, materiais, pessoal, marketing), indicadores-chave (ticket medio, taxa de conversao de orcamentos, custo por procedimento). Inclua formulas sugeridas.',
        beneficio: 'Ajuda dentistas que nao tem formacao em gestao a organizar as financas do consultorio e identificar onde estao ganhando ou perdendo dinheiro.'
      },
      {
        titulo: 'Laudos e Relatorios',
        prompt: 'Redija um laudo odontologico [tipo: pericial / para plano de saude / para documentacao] com base nas seguintes informacoes: paciente: [nome, idade], achados clinicos: [descreva], exames realizados: [radiografia/tomografia], diagnostico: [CID]. Use terminologia tecnica adequada e formato profissional.',
        beneficio: 'Acelera a producao de laudos e relatorios, que sao tarefas burocraticas que tomam tempo do atendimento clinico.'
      }
    ]
  },
  {
    profissao: 'Contadores',
    slug: 'prompts-ia-contadores',
    prompts: [
      {
        titulo: 'Planejamento Tributario',
        prompt: 'Analise o seguinte cenario empresarial e sugira o regime tributario mais vantajoso (Simples Nacional, Lucro Presumido ou Lucro Real): atividade: [CNAE], faturamento anual: [R$], folha de pagamento: [R$], despesas dedutiveis: [R$], margem de lucro: [%]. Compare a carga tributaria em cada regime.',
        beneficio: 'Oferece uma analise comparativa rapida que serve como base para a consultoria tributaria, ajudando clientes a economizar impostos legalmente.'
      },
      {
        titulo: 'Explicacao de Obrigacoes Acessorias',
        prompt: 'Explique em linguagem simples para um empresario [segmento: comercio / servicos / industria] no regime [Simples Nacional / Lucro Presumido / Lucro Real] quais sao todas as obrigacoes acessorias mensais e anuais, com datas de vencimento e consequencias do nao cumprimento. Faturamento: [R$].',
        beneficio: 'Facilita a comunicacao com clientes que nao entendem a complexidade fiscal brasileira, reduzindo atrasos e multas por falta de informacao.'
      },
      {
        titulo: 'Analise de Balanco',
        prompt: 'Analise os seguintes dados do balanco patrimonial e DRE e gere um relatorio gerencial simplificado: ativo total: [R$], passivo total: [R$], patrimonio liquido: [R$], receita: [R$], custos: [R$], despesas: [R$], lucro liquido: [R$]. Calcule os indicadores: liquidez corrente, endividamento, margem liquida e ROE. Interprete os resultados.',
        beneficio: 'Transforma dados contabeis em informacao gerencial que o empresario consegue entender e usar para tomar decisoes, agregando valor ao servico contabil.'
      },
      {
        titulo: 'Classificacao Contabil',
        prompt: 'Classifique as seguintes despesas na contabilidade de uma empresa [segmento] segundo o plano de contas padrao e as normas brasileiras de contabilidade (NBC): [liste as despesas]. Para cada item, indique: conta contabil, centro de custo sugerido e se e dedutivel para IRPJ/CSLL.',
        beneficio: 'Agiliza a classificacao de lancamentos contabeis, especialmente para novos clientes ou despesas atipicas que exigem consulta.'
      },
      {
        titulo: 'Respostas a Fiscalizacao',
        prompt: 'Elabore uma resposta para a seguinte intimacao fiscal: orgao: [Receita Federal / SEFAZ / Prefeitura], assunto: [descreva], prazo: [dias], documentos solicitados: [liste]. A resposta deve ser formal, fundamentada na legislacao aplicavel e conter todos os elementos necessarios para atender a intimacao.',
        beneficio: 'Acelera a elaboracao de respostas a intimacoes fiscais com a fundamentacao legal adequada, reduzindo o risco de autuacoes por resposta insuficiente.'
      },
      {
        titulo: 'Calculo de Rescisao Trabalhista',
        prompt: 'Calcule a rescisao trabalhista com os seguintes dados: tipo de rescisao: [sem justa causa / pedido de demissao / acordo], salario: [R$], data de admissao: [dd/mm/aaaa], data de demissao: [dd/mm/aaaa], ferias vencidas: [sim/nao], saldo de FGTS: [R$]. Detalhe cada verba: saldo de salario, aviso previo, 13o proporcional, ferias proporcionais + 1/3, multa FGTS.',
        beneficio: 'Fornece um calculo detalhado e conferivel de rescisoes, util tanto para o departamento pessoal quanto para orientar o cliente sobre os custos de desligamento.'
      },
      {
        titulo: 'Newsletter para Clientes',
        prompt: 'Crie um informativo mensal (newsletter) para clientes do escritorio contabil com: (1) principais mudancas tributarias do mes, (2) prazos importantes do proximo mes, (3) uma dica pratica de gestao financeira, (4) FAQ sobre um tema recorrente: [tema]. Maximo 500 palavras, linguagem acessivel.',
        beneficio: 'Mantem os clientes informados e demonstra proatividade do escritorio, fortalecendo o relacionamento e reduzindo perguntas repetitivas.'
      }
    ]
  },
  {
    profissao: 'Corretores de Imoveis',
    slug: 'prompts-ia-corretores',
    prompts: [
      {
        titulo: 'Descricao de Imovel para Anuncio',
        prompt: 'Crie uma descricao profissional e atrativa para o seguinte imovel: tipo: [apartamento/casa/sala comercial], area: [m2], quartos: [X], banheiros: [X], vagas: [X], bairro: [nome], cidade: [nome], diferenciais: [liste], valor: [R$]. A descricao deve ter 150-200 palavras, destacar os pontos fortes e incluir palavras-chave para SEO imobiliario.',
        beneficio: 'Gera descricoes profissionais em segundos que normalmente levariam 20-30 minutos para escrever. Descricoes bem escritas aumentam os contatos em ate 40%.'
      },
      {
        titulo: 'Analise Comparativa de Mercado',
        prompt: 'Com base nos seguintes dados de imoveis vendidos recentemente na regiao [bairro, cidade]: [liste 3-5 imoveis com tipo, area, quartos e valor de venda]. Estime o valor de mercado justo para um imovel com as seguintes caracteristicas: [descreva o imovel]. Justifique o valor sugerido e indique a faixa recomendada para anuncio.',
        beneficio: 'Ajuda a fundamentar a avaliacao de imoveis com dados comparativos, dando mais credibilidade na hora de apresentar o preco ao proprietario.'
      },
      {
        titulo: 'Script de Atendimento por WhatsApp',
        prompt: 'Crie um script de atendimento por WhatsApp para leads interessados em [tipo de imovel] na faixa de [R$] em [regiao]. Inclua: (1) mensagem de boas-vindas, (2) perguntas de qualificacao (orcamento, prazo, financiamento), (3) apresentacao do imovel, (4) tratamento de objecoes comuns (preco, localizacao, condicoes), (5) agendamento de visita.',
        beneficio: 'Padroniza o atendimento e garante que nenhum lead seja perdido por falta de follow-up. Scripts bem estruturados aumentam a taxa de agendamento de visitas.'
      },
      {
        titulo: 'Simulacao de Financiamento',
        prompt: 'Explique em linguagem simples para um cliente as opcoes de financiamento imobiliario disponiveis em 2026 para: valor do imovel: [R$], entrada: [R$], renda familiar: [R$], tipo: [SAC/Price/ambos]. Compare as parcelas iniciais e finais, custo total e prazo. Inclua os bancos com melhores taxas atualmente.',
        beneficio: 'Permite apresentar simulacoes claras ao cliente, posicionando-se como consultor e nao apenas vendedor. Clientes informados tomam decisoes mais rapidas.'
      },
      {
        titulo: 'Email Marketing Segmentado',
        prompt: 'Crie 3 emails de nurturing para leads do segmento [primeiro imovel / investidor / upgrade] interessados em imoveis em [regiao]. Cada email deve ter: assunto chamativo, corpo de 100-150 palavras, CTA claro. Sequencia: (1) conteudo educativo, (2) opcoes de imoveis, (3) urgencia/escassez.',
        beneficio: 'Automatiza o relacionamento com leads que nao converteram imediatamente, mantendo o corretor presente ate o momento da decisao de compra.'
      },
      {
        titulo: 'Checklist de Documentacao',
        prompt: 'Gere um checklist completo de documentacao necessaria para [compra / venda / locacao] de imovel [residencial / comercial] em [estado]. Separe em: documentos do comprador/vendedor, documentos do imovel, certidoes necessarias e documentos para financiamento (se aplicavel). Inclua onde obter cada documento e prazo de validade.',
        beneficio: 'Evita atrasos no fechamento por falta de documentos e demonstra profissionalismo ao guiar o cliente por todo o processo burocratico.'
      },
      {
        titulo: 'Analise de Investimento Imobiliario',
        prompt: 'Analise o seguinte imovel como investimento: valor de aquisicao: [R$], aluguel estimado: [R$], condominio: [R$], IPTU: [R$], taxa de vacancia estimada: [%]. Calcule: rentabilidade bruta e liquida, payback, comparacao com renda fixa (Selic ${15}%) e CDI. De um parecer sobre a viabilidade do investimento.',
        beneficio: 'Oferece uma analise profissional que diferencia o corretor da concorrencia, especialmente ao atender investidores que comparam imoveis com outros ativos.'
      }
    ]
  },
  {
    profissao: 'Nutricionistas',
    slug: 'prompts-ia-nutricionistas',
    prompts: [
      {
        titulo: 'Plano Alimentar Personalizado',
        prompt: 'Elabore uma sugestao de cardapio diario para um paciente com as seguintes caracteristicas: sexo: [M/F], idade: [anos], peso: [kg], altura: [cm], objetivo: [emagrecimento / ganho de massa / manutencao], restricoes: [intolerancia a lactose / vegetariano / celiacos / nenhuma], calorias alvo: [kcal]. Inclua 6 refeicoes com horarios, alimentos, quantidades em medidas caseiras e macronutrientes.',
        beneficio: 'Gera um rascunho de cardapio que pode ser ajustado rapidamente, reduzindo o tempo de elaboracao de planos alimentares de 40 minutos para 10 minutos por paciente.'
      },
      {
        titulo: 'Lista de Substituicoes',
        prompt: 'Crie uma tabela de substituicoes alimentares para os seguintes alimentos do plano alimentar: [liste os alimentos]. Para cada alimento, ofereca 3 substituicoes equivalentes em termos de macronutrientes e calorias, usando alimentos acessiveis no Brasil. Inclua as quantidades equivalentes.',
        beneficio: 'Oferece flexibilidade ao paciente sem comprometer os resultados nutricionais, aumentando a adesao ao plano alimentar.'
      },
      {
        titulo: 'Conteudo Educativo para Pacientes',
        prompt: 'Crie um material educativo de 1 pagina sobre [tema: leitura de rotulos / hidratacao / alimentacao pre e pos treino / introducao alimentar] para entregar ao paciente. Use linguagem simples, inclua exemplos praticos do dia a dia e evite termos tecnicos. Formato: titulo, 5 topicos principais com explicacao curta e 3 dicas praticas.',
        beneficio: 'Material pronto para imprimir e entregar ao paciente durante a consulta, reforçando orientacoes importantes e demonstrando cuidado profissional.'
      },
      {
        titulo: 'Analise de Recordatorio Alimentar',
        prompt: 'Analise o seguinte recordatorio alimentar de 24h de um paciente: [descreva todas as refeicoes com alimentos e quantidades]. Calcule aproximadamente: calorias totais, distribuicao de macronutrientes (% carboidratos, proteinas, gorduras), fibras, sodio. Identifique: pontos positivos, deficiencias nutricionais e sugestoes de melhoria prioritarias.',
        beneficio: 'Acelera a analise do recordatorio alimentar e gera insights que podem ser discutidos durante a consulta, tornando o atendimento mais produtivo.'
      },
      {
        titulo: 'Posts para Redes Sociais',
        prompt: 'Crie 5 posts para Instagram sobre [tema: mitos alimentares / receitas saudaveis / dicas para emagrecer / alimentacao infantil]. Cada post deve ter: titulo (gancho), texto informativo de ate 150 palavras com base cientifica simplificada, sugestao de imagem e 5 hashtags. Tom: educativo mas leve.',
        beneficio: 'Mantem as redes sociais atualizadas com conteudo de qualidade, atraindo novos pacientes e posicionando o nutricionista como referencia na area.'
      },
      {
        titulo: 'Receitas Funcionais',
        prompt: 'Crie 3 receitas [cafe da manha / almoço / lanche / jantar] que atendam aos seguintes criterios: calorias por porcao: [kcal], restricoes: [sem gluten / sem lactose / vegano / low carb], ingredientes faceis de encontrar no Brasil, tempo de preparo maximo: [minutos]. Inclua informacao nutricional aproximada por porcao.',
        beneficio: 'Oferece opcoes praticas e saborosas que aumentam a adesao do paciente ao plano alimentar. Receitas personalizadas sao um diferencial competitivo.'
      },
      {
        titulo: 'Relatorio de Evolucao',
        prompt: 'Elabore um relatorio de evolucao nutricional para o paciente [nome] com base nos seguintes dados: consulta inicial - peso: [kg], % gordura: [%], circunferencia abdominal: [cm], data: [dd/mm]. Consulta atual - peso: [kg], % gordura: [%], circunferencia abdominal: [cm], data: [dd/mm]. Objetivos: [descreva]. Analise o progresso, destaque conquistas e sugira ajustes para a proxima fase.',
        beneficio: 'Profissionaliza o acompanhamento e motiva o paciente ao visualizar seu progresso de forma clara e documentada.'
      }
    ]
  }
];

// =============================================
// MAIN
// =============================================
async function main() {
  const results = [];

  // Template 1: CDB pages
  console.log('=== TEMPLATE 1: CDB vs Poupanca (8 pages) ===');
  for (const page of cdbPages) {
    const { title, slug, content } = generateCDBPage(page.valor, page.label, page.slug);
    const result = await publish(title, slug, content);
    results.push({ slug, id: result.id, link: result.link });
    await new Promise(r => setTimeout(r, 500));
  }

  // Template 2: CLT vs PJ pages
  console.log('\n=== TEMPLATE 2: CLT vs PJ (7 pages) ===');
  for (const page of cltPjPages) {
    const { title, slug, content } = generateCLTvsPJPage(page.salario, page.label, page.slug);
    const result = await publish(title, slug, content);
    results.push({ slug, id: result.id, link: result.link });
    await new Promise(r => setTimeout(r, 500));
  }

  // Template 3: Prompts IA pages
  console.log('\n=== TEMPLATE 3: Prompts IA (5 pages) ===');
  for (const page of promptsData) {
    const { title, slug, content } = generatePromptsPage(page.profissao, page.slug, page.prompts);
    const result = await publish(title, slug, content);
    results.push({ slug, id: result.id, link: result.link });
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== RESUMO: TODAS AS 20 PAGINAS ===');
  results.forEach((r, i) => {
    console.log(`${i + 1}. ID: ${r.id} | ${r.slug} | ${r.link}`);
  });
}

main().catch(console.error);
