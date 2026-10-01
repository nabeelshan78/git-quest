import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** 0-3 stars with a text alternative ("2 of 3 stars"). */
export function Stars({ value, max = 3, size = 18, testId, className }: { value: number; max?: number; size?: number; testId?: string; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span className={`gq-stars ${className ?? ''}`} role="img" aria-label={t('starsOf', { count: value, max })} data-testid={testId} data-stars={value}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name={i < value ? 'star' : 'star-empty'} size={size} className={i < value ? 'gq-star-on' : 'gq-star-off'} />
      ))}
    </span>
  );
}
