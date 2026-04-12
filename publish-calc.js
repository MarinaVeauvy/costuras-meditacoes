const https = require('https');
const fs = require('fs');

const toolHtml = fs.readFileSync('C:/Users/marin/Documents/costuras-meditacoes/calculadora-clt-pj.html', 'utf8');

const introSeo = `<p>Voce ja se perguntou se compensa mais trabalhar como CLT ou abrir um CNPJ? Essa e uma das duvidas mais comuns entre profissionais brasileiros, especialmente em 2026, com as novas aliquotas de INSS e IRRF em vigor. A decisao entre CLT e PJ vai muito alem do salario bruto: envolve beneficios como FGTS, 13o salario e ferias remuneradas de um lado, e a flexibilidade tributaria do Simples Nacional do outro.</p>

<p>Para ajudar voce a tomar essa decisao com clareza, criamos esta <strong>calculadora CLT vs PJ</strong> completa e atualizada. Basta informar seu salario bruto (CLT) ou faturamento mensal (PJ) para ver, lado a lado, todos os descontos, impostos e o valor liquido que realmente chega no seu bolso. A ferramenta calcula automaticamente INSS progressivo, IRRF com deducao por dependentes, FGTS, 13o, ferias com 1/3 constitucional, e os impostos do Simples Nacional (Anexo III). No final, voce recebe um veredicto personalizado mostrando exatamente quanto precisaria faturar como PJ para igualar os ganhos da CLT — ou vice-versa. Use a calculadora abaixo e tome decisoes financeiras com base em numeros reais.</p>

`;

const outroSeo = `
<h3>Como interpretar os resultados da calculadora CLT vs PJ</h3>

<p>Ao comparar CLT e PJ, nao olhe apenas para o liquido mensal. O regime CLT embute beneficios que somam de 30% a 40% ao seu salario ao longo do ano: o FGTS depositado mensalmente, o 13o salario e as ferias com adicional de 1/3. Ja o PJ oferece um liquido mensal geralmente maior, mas sem esses extras — o que significa que voce precisa se organizar financeiramente para cobrir periodos sem receita, aposentadoria e reservas.</p>

<p>A regra pratica e simples: para compensar a mudanca de CLT para PJ, seu faturamento mensal precisa ser, em media, 40% a 60% maior que o salario bruto CLT equivalente. A calculadora acima faz essa conta exata para o seu caso.</p>

<p>Gostou dessa ferramenta? Toda semana enviamos conteudos praticos sobre financas pessoais, planejamento tributario e estrategias para multiplicar seu patrimonio. <strong><a href="https://marinaveauvy.github.io/costuras-meditacoes/webinario.html" target="_blank" rel="noopener">Inscreva-se no nosso proximo webinario gratuito</a></strong> e receba dicas exclusivas direto no seu e-mail.</p>
`;

const fullContent = introSeo + toolHtml + outroSeo;

const token = Buffer.from(`${process.env.WP_USER || 'wp.marinaveauvy.com.br'}:${process.env.WP_APP_PASSWORD}`).toString('base64');

const postData = JSON.stringify({
  title: 'Calculadora CLT vs PJ: Descubra Qual Compensa Mais em 2026',
  slug: 'calculadora-clt-vs-pj',
  status: 'publish',
  content: fullContent
});

const options = {
  hostname: 'wp.marinaveauvy.com.br',
  port: 443,
  path: '/wp-json/wp/v2/posts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + token,
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const resp = JSON.parse(data);
      if (resp.link) {
        console.log('SUCCESS');
        console.log('Post ID: ' + resp.id);
        console.log('URL: ' + resp.link);
        console.log('Status: ' + resp.status);
      } else {
        console.log('RESPONSE:');
        console.log(data.substring(0, 2000));
      }
    } catch(e) {
      console.log('RAW RESPONSE (status ' + res.statusCode + '):');
      console.log(data.substring(0, 2000));
    }
  });
});

req.on('error', (e) => { console.error('Error: ' + e.message); });
req.write(postData);
req.end();
