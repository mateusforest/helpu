import {checkNode, checkDependencies, checkFiles, checkDataDirectory, findBrowser, loadConfiguration, startupMessage} from './runtime.mjs';

let config;
for (const [label, check] of [
  ['Node.js compatível', checkNode],
  ['Configuração local', () => { config = loadConfiguration(); }],
  ['Dependências instaladas', checkDependencies],
  ['Arquivos da aplicação', checkFiles],
  ['Acesso à pasta de dados', () => { if (!config) throw new Error('Corrija a configuração antes de conferir os dados.'); checkDataDirectory(config.dataDir); }],
]) {
  try { check(); console.log(`OK — ${label}`); }
  catch (error) { console.error(`ERRO — ${label}: ${startupMessage(error)}`); process.exitCode = 1; }
}
console.log(findBrowser()
  ? 'OK — Chrome ou Edge disponível para Contas conectadas'
  : 'AVISO — Chrome/Edge não encontrado. O portal pode abrir; para Contas conectadas, instale um navegador ou configure HELPU_BROWSER_EXECUTABLE.');
console.log('Diagnóstico concluído. Nenhum dado foi alterado.');
