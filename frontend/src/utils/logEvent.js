/**
 * Frontend structured logging shim — FEAT-014
 *
 * Per DESIGN.md §14.1 and §14.4:
 * - Emits a §14.1-conformant JSON envelope to console.info.
 * - Until GAP-8 is closed, events go only to console (no server sink).
 * - Never log PII: no email, full_name, file contents, or question text.
 *
 * Usage:
 *   import { logEvent } from '../utils/logEvent.js';
 *   logEvent('auth.session.started', {});
 *   logEvent('profile.updated', { fields_changed: ['full_name', 'avatar_url'] });
 */

/**
 * Emit a structured event envelope to console.info.
 *
 * @param {string} event  - Dot-separated event name from §14.3 catalog.
 * @param {Object} fields - Non-PII fields to include in `meta`. Do NOT pass email,
 *                          full_name, file contents, or any secrets.
 */
export function logEvent(event, fields = {}) {
  // Strip any PII that might accidentally be passed
  const { email, full_name, fullName, name, password, token, ...safeMeta } = fields;

  const envelope = {
    timestamp: new Date().toISOString(),
    event,
    level: fields.level || 'INFO',
    outcome: fields.outcome || 'success',
    meta: safeMeta,
  };

  // eslint-disable-next-line no-console
  console.info(JSON.stringify(envelope));
}
