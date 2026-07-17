// Review verdict: strict structural validation of the ported trackB
// review-result payload, plus a deterministic PASS/FAIL/MALFORMED/
// INSUFFICIENT_CONTEXT classification computed from the findings list —
// never trusting the reviewer's own top-level verdict field on its own
// (spec §4.1-5, PLANNING §3.6).
//
// Node built-ins only — no dependencies (PLANNING §1-1).

// Severity ordering (spec §4.1-5, PLANNING §3.6): BLOCKER > MAJOR > MINOR >
// INFO. The ported schema's findings[].severity enum is still MINOR/MAJOR
// only (trackB's own 2-level model — additive-only policy for that file, see
// schemas/review-result.schema.json). validateResult() below deliberately
// does not enum-check severity against that narrower schema enum; legitimacy
// of a severity value is judged here instead, against the gate's own
// 4-level ordering, which is what the MAJOR-or-above/FAIL decision needs.
const SEVERITY_RANK = { INFO: 0, MINOR: 1, MAJOR: 2, BLOCKER: 3 };

// §3.1 exit code table.
const EXIT_CODES = {
  PASS: 0,
  FAIL: 1,
  MALFORMED: 2,
  INSUFFICIENT_CONTEXT: 3,
  TIMEOUT: 4,
  INFRA_ERROR: 5,
  INTERNAL_ERROR: 6,
  BLOCKED: 7,
};

/**
 * Minimal self-built structural validator (required / type / enum, used
 * fields only — PLANNING §1-2, no ajv or other external schema library).
 * Returns a list of violation strings; empty = valid.
 * @param {*} obj
 * @param {object} schema
 * @returns {string[]}
 */
export function validateResult(obj, schema) {
  const violations = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    violations.push('result must be a JSON object');
    return violations;
  }

  for (const key of schema.required || []) {
    if (!(key in obj)) violations.push(`missing required field: ${key}`);
  }
  if (violations.length > 0) return violations;

  const props = schema.properties || {};

  if (typeof obj.reviewed_spec_sha256 !== 'string') {
    violations.push('reviewed_spec_sha256 must be a string');
  }

  const verdictSchema = props.verdict || {};
  if (typeof obj.verdict !== 'string') {
    violations.push('verdict must be a string');
  } else if (Array.isArray(verdictSchema.enum) && !verdictSchema.enum.includes(obj.verdict)) {
    violations.push(`verdict must be one of ${verdictSchema.enum.join(', ')}`);
  }

  if (!Array.isArray(obj.findings)) {
    violations.push('findings must be an array');
  } else {
    const itemSchema = (props.findings && props.findings.items) || {};
    const itemRequired = itemSchema.required || [];
    const itemProps = itemSchema.properties || {};
    const bucketEnum = (itemProps.bucket && itemProps.bucket.enum) || null;

    obj.findings.forEach((f, idx) => {
      if (typeof f !== 'object' || f === null || Array.isArray(f)) {
        violations.push(`findings[${idx}] must be an object`);
        return;
      }
      for (const key of itemRequired) {
        if (!(key in f)) violations.push(`findings[${idx}] missing required field: ${key}`);
      }
      if ('bucket' in f) {
        if (typeof f.bucket !== 'string') {
          violations.push(`findings[${idx}].bucket must be a string`);
        } else if (Array.isArray(bucketEnum) && !bucketEnum.includes(f.bucket)) {
          violations.push(`findings[${idx}].bucket must be one of ${bucketEnum.join(', ')}`);
        }
      }
      // severity: type-checked only — see the SEVERITY_RANK comment above.
      if ('severity' in f && typeof f.severity !== 'string') {
        violations.push(`findings[${idx}].severity must be a string`);
      }
      if ('object' in f && (typeof f.object !== 'string' || f.object.length < 1)) {
        violations.push(`findings[${idx}].object must be a non-empty string`);
      }
      if ('finding' in f && (typeof f.finding !== 'string' || f.finding.length < 1)) {
        violations.push(`findings[${idx}].finding must be a non-empty string`);
      }
    });
  }

  if ('insufficient_context' in obj && typeof obj.insufficient_context !== 'boolean') {
    violations.push('insufficient_context must be a boolean');
  }

  return violations;
}

/**
 * Deterministic classification pipeline (spec §4.1-5, PLANNING §3.6):
 *  1. blank input / JSON parse failure -> MALFORMED
 *  2. validateResult() violations -> MALFORMED
 *  3. insufficient_context === true -> INSUFFICIENT_CONTEXT
 *  4. highest severity across findings (§3.6 order) decides FAIL/PASS
 *     (MAJOR-or-above -> FAIL, else -> PASS); an unrecognized severity
 *     value -> MALFORMED
 *  5. if the reviewer's own top-level verdict field is present, it must
 *     agree with the computed classification — a mismatch is never
 *     resolved in the reviewer's favor (AC-11) -> MALFORMED
 * @param {string} rawText
 * @param {object} schema
 * @returns {{classification: string, maxSeverity: string|null, findings: object[], violations: string[]}}
 */
export function evaluate(rawText, schema) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    return { classification: 'MALFORMED', maxSeverity: null, findings: [], violations: ['empty input'] };
  }

  let obj;
  try {
    obj = JSON.parse(rawText);
  } catch (err) {
    return { classification: 'MALFORMED', maxSeverity: null, findings: [], violations: [`JSON parse error: ${err.message}`] };
  }

  const violations = validateResult(obj, schema);
  if (violations.length > 0) {
    return {
      classification: 'MALFORMED',
      maxSeverity: null,
      findings: Array.isArray(obj.findings) ? obj.findings : [],
      violations,
    };
  }

  if (obj.insufficient_context === true) {
    return { classification: 'INSUFFICIENT_CONTEXT', maxSeverity: null, findings: obj.findings, violations: [] };
  }

  let maxSeverity = null;
  let maxRank = -1;
  for (const f of obj.findings) {
    const rank = SEVERITY_RANK[f.severity];
    if (rank === undefined) {
      return {
        classification: 'MALFORMED',
        maxSeverity: null,
        findings: obj.findings,
        violations: [`unknown severity: ${f.severity}`],
      };
    }
    if (rank > maxRank) {
      maxRank = rank;
      maxSeverity = f.severity;
    }
  }

  const classification = maxRank >= SEVERITY_RANK.MAJOR ? 'FAIL' : 'PASS';

  const reviewerSaysFail = obj.verdict === 'FAIL';
  if (reviewerSaysFail !== (classification === 'FAIL')) {
    return {
      classification: 'MALFORMED',
      maxSeverity,
      findings: obj.findings,
      violations: [`verdict field (${obj.verdict}) contradicts computed classification (${classification})`],
    };
  }

  return { classification, maxSeverity, findings: obj.findings, violations: [] };
}

/**
 * §3.1 exit code mapping.
 * @param {string} classification
 * @returns {number}
 */
export function exitFor(classification) {
  if (!(classification in EXIT_CODES)) {
    throw new Error(`exitFor: unknown classification: ${classification}`);
  }
  return EXIT_CODES[classification];
}
