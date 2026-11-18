import { configManager } from '../config-manager.js';
import { handleUltra } from './engine.js';
async function main() {
  await configManager.init();
  const option = process.argv[2];
  const action = option === 'enable' ? 'enable' : option === 'disable' ? 'disable' : 'status';
  const result = await handleUltra({ action });
  console.log(result.content[0].text);
  if (result.isError) process.exitCode = 1;
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });