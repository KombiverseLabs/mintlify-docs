import { appendFileSync } from 'node:fs';
import { redactDeliveryAnnotation } from './delivery-failure-diagnostic.mjs';

// One of our own refusal codes (`delivery_dispatch_binding_<check>`, `test_window_prepared_<check>`,
// `delivery_app_token_window_exceeded`). The summary redaction takes any 32-character word for a
// credential and so erased these whole (StackKits Delivery 45385917695, 2026-11-24); only this fixed
// shape bypasses it.
const OWN_CODE = /^(?:delivery|test_window_prepared)_[a-z0-9]+(?:_[a-z0-9]+)*$/;

// Known-error intake consumes this annotation on green as well as red runs.
export function reportDeliveryFinding({ cause, summary, group = process.env.DELIVERY_GROUP ?? process.env.EXECUTION_GROUP_ID ?? '', child = '', code = '' }) {
  const finding = { cause, group, summary: redactDeliveryAnnotation(summary, process.env.GH_TOKEN) };
  if (typeof code === 'string' && code.length <= 96 && OWN_CODE.test(code)) finding.code = code;
  if (/^https:\/\/github\.com\/KombiverseLabs\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9]\d*$/.test(child)) finding.child = child;
  const data = JSON.stringify(finding).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write(`::warning title=Delivery report::${data}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${finding.cause}: ${finding.code ? `${finding.code} ` : ''}${finding.summary}\n`); }
    catch { process.stderr.write('Delivery summary unavailable; finding remains in the annotation.\n'); }
  }
}
