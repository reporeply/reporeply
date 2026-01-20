/**
 * Default label rules configuration
 */
export const DEFAULT_LABEL_RULES = [
  {
    label: 'Resolution: Cannot Replicate',
    color: 'E4E669',
    description: 'Issue cannot be replicated by maintainers',
    when: 'cannot_reproduce',
    comment: `We're unable to replicate your issue. If you are able to create a reproducer or add details, please edit this issue. This issue will be closed if no activities in 20 days.`,
    autoCloseAfterDays: 20,
  },
  {
    label: 'Resolution: Duplicate',
    color: 'C5DEF5',
    description: 'This issue is a duplicate of an existing issue',
    when: 'duplicate_detected',
    comment: `This issue is a duplicate and has already been reported and possibly fixed. Please review other issues both open and closed for a similar issue to this one.`,
    autoCloseAfterDays: null,
  },
  {
    label: 'Status: Needs Reproducer',
    color: 'FBCA04',
    description: 'Issue needs a minimal reproduction case',
    when: 'missing_reproducer',
    comment: `Please fork the [Stackblitz project](https://stackblitz.com/edit/vitejs-vite-pekean1c?file=src%2FApp.tsx) and create a case demonstrating your bug report. This issue will be closed if no activities in 20 days.`,
    autoCloseAfterDays: 20,
  },
  {
    label: 'Status: Needs More Info',
    color: 'D4C5F9',
    description: 'Additional information is required',
    when: 'needs_more_info',
    comment: `Thank you for reporting this issue. We need more information to help diagnose the problem. Please provide additional details about your environment, steps to reproduce, or expected vs actual behavior.`,
    autoCloseAfterDays: 14,
  },
  {
    label: 'Type: Bug',
    color: 'D73A4A',
    description: 'Something is not working as expected',
    when: 'bug_detected',
    comment: null,
    autoCloseAfterDays: null,
  },
  {
    label: 'Type: Feature Request',
    color: 'A2EEEF',
    description: 'Request for new functionality',
    when: 'feature_request_detected',
    comment: null,
    autoCloseAfterDays: null,
  },
];

export function getRuleByLabel(labelName) {
  return DEFAULT_LABEL_RULES.find(rule => rule.label === labelName) || null;
}

export function getRuleByCondition(when) {
  return DEFAULT_LABEL_RULES.find(rule => rule.when === when) || null;
}

export function getAutoCloseLabels() {
  return DEFAULT_LABEL_RULES
    .filter(rule => rule.autoCloseAfterDays !== null)
    .map(rule => ({
      label: rule.label,
      days: rule.autoCloseAfterDays,
    }));
}

export function isValidRule(rule) {
  return (
    rule &&
    typeof rule.label === 'string' &&
    typeof rule.color === 'string' &&
    typeof rule.when === 'string' &&
    (rule.comment === null || typeof rule.comment === 'string') &&
    (rule.autoCloseAfterDays === null || typeof rule.autoCloseAfterDays === 'number')
  );
}
