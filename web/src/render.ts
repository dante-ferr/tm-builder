import {instance} from '@viz-js/viz';
async function main() {
  let dot = '';
  for await (const chunk of process.stdin) dot += chunk;
  const viz = await instance();
  process.stdout.write(viz.renderString(dot, {format: 'svg'}));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
