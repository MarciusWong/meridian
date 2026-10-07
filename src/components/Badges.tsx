import type { MetricStatus, Severity } from '../../shared/types';
import { SEVERITY_LABEL, STATUS_LABEL } from '../lib/format';
import { Icon } from './Icon';

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge badge-${severity}`}>
      <Icon name={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const STATUS_ICON = { good: 'good', 'needs-improvement': 'medium', poor: 'critical' } as const;

export function StatusBadge({ status, label }: { status: MetricStatus | 'failed'; label?: string }) {
  if (status === 'failed') {
    return (
      <span className="badge badge-poor">
        <Icon name="fail" />
        {label ?? 'Failed'}
      </span>
    );
  }
  return (
    <span className={`badge badge-${status}`}>
      <Icon name={STATUS_ICON[status]} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
