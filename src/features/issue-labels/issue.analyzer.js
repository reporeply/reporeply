import logger from '../../core/utils/logger.utils.js';
import { getRuleByCondition } from './defaults.js';

/* -------------------- Pattern Matching -------------------- */

const PATTERNS = {
  duplicate_detected: {
    keywords: ['duplicate', 'already reported', 'same as', 'similar to'],
    titlePatterns: [/duplicate/i, /same as #\d+/i],
  },
  cannot_reproduce: {
    keywords: ['cannot reproduce', 'unable to replicate', 'works for me', 'cannot replicate'],
    titlePatterns: [/cannot reproduce/i, /can't reproduce/i],
  },
  missing_reproducer: {
    keywords: ['reproduction', 'reproducer', 'repro', 'stackblitz', 'codesandbox', 'minimal example'],
    titlePatterns: [],
    bodyCheck: true,
  },
  needs_more_info: {
    keywords: ['more info', 'additional details', 'clarification needed', 'incomplete'],
    titlePatterns: [],
  },
  bug_detected: {
    keywords: ['bug', 'error', 'crash', 'broken', 'not working', 'issue', 'problem'],
    titlePatterns: [/\[bug\]/i, /bug:/i],
  },
  feature_request_detected: {
    keywords: ['feature request', 'enhancement', 'suggestion', 'could you add', 'would be nice'],
    titlePatterns: [/\[feature\]/i, /feature:/i, /\[enhancement\]/i],
  },
};

/* -------------------- Analysis Functions -------------------- */

function containsKeywords(text, keywords) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

function matchesPatterns(text, patterns) {
  if (!text || !patterns || patterns.length === 0) return false;
  return patterns.some(pattern => pattern.test(text));
}

function isMissingReproducer(body) {
  if (!body || body.length < 50) return true;

  const hasCodeBlock = /```[\s\S]*```/.test(body);
  const hasReproLink = /(stackblitz|codesandbox|jsfiddle|codepen|github\.com.*\/tree\/)/i.test(body);
  const hasStepsToReproduce = /steps to reproduce/i.test(body);

  const seemsLikeBug = containsKeywords(body, PATTERNS.bug_detected.keywords);
  
  if (seemsLikeBug && !hasCodeBlock && !hasReproLink && !hasStepsToReproduce) {
    return true;
  }

  return false;
}

/* -------------------- Main Analysis -------------------- */

export async function analyzeIssue(issue) {
  const labelsToApply = [];
  const title = issue.title || '';
  const body = issue.body || '';
  const combinedText = `${title} ${body}`;

  logger.info(`[IssueAnalyzer] Analyzing issue #${issue.number}: ${title}`);

  /* -------------------- Check for Duplicates -------------------- */
  if (
    containsKeywords(combinedText, PATTERNS.duplicate_detected.keywords) ||
    matchesPatterns(title, PATTERNS.duplicate_detected.titlePatterns)
  ) {
    const rule = getRuleByCondition('duplicate_detected');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Duplicate`);
  }

  /* -------------------- Check Cannot Reproduce -------------------- */
  if (
    containsKeywords(combinedText, PATTERNS.cannot_reproduce.keywords) ||
    matchesPatterns(title, PATTERNS.cannot_reproduce.titlePatterns)
  ) {
    const rule = getRuleByCondition('cannot_reproduce');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Cannot Reproduce`);
  }

  /* -------------------- Check Missing Reproducer -------------------- */
  if (isMissingReproducer(body)) {
    const rule = getRuleByCondition('missing_reproducer');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Missing Reproducer`);
  }

  /* -------------------- Check Bug vs Feature Request -------------------- */
  const isBug = 
    containsKeywords(combinedText, PATTERNS.bug_detected.keywords) ||
    matchesPatterns(title, PATTERNS.bug_detected.titlePatterns);

  const isFeature = 
    containsKeywords(combinedText, PATTERNS.feature_request_detected.keywords) ||
    matchesPatterns(title, PATTERNS.feature_request_detected.titlePatterns);

  if (isBug && !isFeature) {
    const rule = getRuleByCondition('bug_detected');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Bug`);
  } else if (isFeature && !isBug) {
    const rule = getRuleByCondition('feature_request_detected');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Feature Request`);
  }

  /* -------------------- Check Needs More Info -------------------- */
  if (
    body.length < 100 && 
    !labelsToApply.length &&
    !containsKeywords(combinedText, ['works', 'fixed', 'resolved'])
  ) {
    const rule = getRuleByCondition('needs_more_info');
    if (rule) labelsToApply.push(rule.label);
    logger.info(`[IssueAnalyzer] Detected: Needs More Info`);
  }

  logger.info(`[IssueAnalyzer] Analysis complete for #${issue.number}: ${labelsToApply.join(', ') || 'No labels'}`);
  
  return labelsToApply;
}

/* -------------------- Confidence Scoring -------------------- */

export async function analyzeWithConfidence(issue) {
  const labels = await analyzeIssue(issue);
  
  return labels.map(label => ({
    label,
    confidence: 1.0,
    reason: 'Pattern match',
  }));
}

/* -------------------- Validation -------------------- */

export function shouldAnalyze(issue) {
  if (issue.state === 'closed') return false;
  if (issue.pull_request) return false;
  if (issue.labels?.some(label => label.name.startsWith('Resolution:'))) {
    return false;
  }
  
  return true;
}