// Publishes the latest evaluation summaries: docs/RELIABILITY.md, a machine-readable
// summary next to it, and the console's reliability card.
//   npx tsx evals/publish.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (set: string) => {
  const p = resolve(ROOT, `evals/results/${set}-latest.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const dev = read('dev');
const hold = read('holdout2') ?? read('holdout');
const pc = (x: number) => (x * 100).toFixed(1) + '%';
const ci = (w: number[]) => `${pc(w[0])}–${pc(w[1])}`;

writeFileSync(resolve(ROOT, 'apps/web/src/console/eval-summary.json'), JSON.stringify({ dev: dev?.summary ?? null, holdout: hold?.summary ?? null }, null, 1));
writeFileSync(resolve(ROOT, 'evals/results/summary-latest.json'), JSON.stringify({ dev: dev?.summary ?? null, holdout: hold?.summary ?? null }, null, 1));

function section(name: string, r: any) {
  if (!r) return `## ${name}\n\nNo run published.\n`;
  const s = r.summary;
  const fails = r.records.filter((x: any) => !x.pass);
  const failIds = [...new Set(fails.map((x: any) => x.id))] as string[];
  return `## ${name}

**Offline evaluation on synthetic scenarios.** This measures how reliably the system carries out scripted requests against the demo bank. It does not measure demand or financial impact.

- Set: \`evals/${s.set}/scenarios.yaml\` (sha256 \`${s.scenario_file_sha256.slice(0, 16)}…\`), ${s.scenarios} scenarios × ${s.repeats} repeats = ${s.runs} runs
- Model \`${s.model}\`, effort \`${s.effort}\`, thinking \`${s.thinking}\`, prompt \`${s.prompt_hash}\`, run ${s.started.slice(0, 16).replace('T', ' ')} UTC
${s.incomplete ? `- **Incomplete run:** ${s.incomplete.completed_runs} of ${s.incomplete.planned_runs} planned runs completed; ${s.incomplete.reason}. The figures cover only the completed runs (the first ${s.scenarios} scenarios of the set, all 5 repeats each).
` : ''}${s.reruns_after_infrastructure_errors ? `- ${s.reruns_after_infrastructure_errors} runs that had ended in an infrastructure error were re-run; no other run was repeated.
` : ''}- Oracle: Core Bank effects journal and the bank confirmation screens shown; no model grading. The simulated customer approves only screens that match an expected effect and declines anything else (counted as S2).

| Metric | Value |
|---|---|
| Task success | ${s.task_success.passed}/${s.runs} = ${pc(s.task_success.rate)} (95% Wilson ${ci(s.task_success.wilson95)}) |
| S1 critical (unwanted real effect) | ${s.severity.S1.count} (95% upper bound ${pc(s.severity.S1.wilson95[1])}) |
| S2 high (wrong value reached the bank screen, declined) | ${s.severity.S2.count} (${pc(s.severity.S2.rate)}) |
| S3 medium (failed safely) | ${s.severity.S3.count} (${pc(s.severity.S3.rate)}) |
| S4 low (needless question or slow) | ${s.severity.S4.count} |
| Unauthorized commits | ${s.unauthorized_commits} |
| pass^${s.repeats} (all repeats passed) | ${s.pass_hat_k.scenarios_all_repeats_passed}/${s.pass_hat_k.of} scenarios |
| Turn latency p50 / p95 | ${(s.latency_ms.turn_p50 / 1000).toFixed(1)} s / ${(s.latency_ms.turn_p95 / 1000).toFixed(1)} s |
| Task latency p50 / p95 | ${(s.latency_ms.task_p50 / 1000).toFixed(1)} s / ${(s.latency_ms.task_p95 / 1000).toFixed(1)} s |
| Model cost per task (mean) | $${s.cost_usd.per_task_mean.toFixed(4)} (total $${s.cost_usd.total.toFixed(2)}) |
| Clarification rate | ${pc(s.clarification_rate)} |
| Handoff rate | ${pc(s.handoff_rate)} |

### By scenario group

| Group | Runs | Passed | S1 | S2 | S3 |
|---|---|---|---|---|---|
${s.groups.map((g: any) => `| ${g.group} | ${g.runs} | ${g.passed} (${pc(g.passed / g.runs)}) | ${g.s1} | ${g.s2} | ${g.s3} |`).join('\n')}

### By expected effect

| Effect | Runs | Passed |
|---|---|---|
${s.effects.map((e: any) => `| ${e.effect} | ${e.runs} | ${e.passed} (${pc(e.passed / e.runs)}) |`).join('\n')}

Failing scenarios (${failIds.length}): ${failIds.length ? failIds.map((i) => `\`${i}\``).join(', ') : 'none'}.
`;
}

const md = `# Reliability

Every figure below comes from \`evals/runner.ts\` output (\`evals/results/summary-latest.json\`). Zero S1 in N runs only says the S1 rate is likely below the stated upper bound; it is not a guarantee.

${section(hold?.summary?.set === 'holdout2' ? 'Holdout 2 (reported numbers)' : 'Holdout 1 (contaminated after analysis; superseded by holdout 2)', hold)}
${section('Dev set (used while tuning, not for claims)', dev)}
## Method notes

- Scenarios run through the same session API the app uses, against the real model, with an isolated demo bank per run.
- Repeats of the same scenario are correlated; pass^k shows consistency, not independent coverage.
- Text-level only. Voice-level results are not measured yet.
- Each holdout was written by an author who never saw the system prompt and is frozen (\`evals/holdout/FROZEN.md\`, \`evals/holdout2/FROZEN.md\`).
- After the holdout 2 run, three of its safe failures were fixed (spelled amounts with qapik, a clarifying question after a confirmed step, "get rid of" as cancel). Those fixes are not in the figures above, and holdout 2 counts as contaminated for any later run.
- The model is reached through the event's gateway; runs that ended because the gateway was unreachable are infrastructure errors, not model failures, and are listed separately above.
`;
writeFileSync(resolve(ROOT, 'docs/RELIABILITY.md'), md);
console.log('published', { dev: !!dev, holdout: !!hold });
