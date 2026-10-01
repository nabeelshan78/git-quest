/**
 * Small pictures for predict cards and questions: a mini commit graph,
 * three mini boxes, or monospace text. Each has a text alternative.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Picture as PictureData } from '../../shared/level';
import { CommitGraph } from './CommitGraph';
import { describeGraph } from './describe';
import { graphFromPicture } from './model';

export function pictureDescription(p: PictureData, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (p.kind) {
    case 'graph':
      return describeGraph(graphFromPicture(p), t);
    case 'boxes': {
      const list = (xs: string[]) => (xs.length ? xs.join(', ') : t('picture.empty'));
      return t('picture.boxesDescription', { working: list(p.working), staging: list(p.staging), repository: list(p.repository) });
    }
    case 'text':
      return p.text;
  }
}

export function Picture({ picture }: { picture: PictureData }) {
  const { t } = useTranslation('world');
  const tr = (k: string, o?: Record<string, unknown>) => t(k, o);
  const graph = useMemo(() => (picture.kind === 'graph' ? graphFromPicture(picture) : null), [picture]);
  const description = pictureDescription(picture, tr);
  if (picture.kind === 'graph' && graph) {
    return (
      <figure className="gq-picture gq-picture-graph">
        <CommitGraph graph={graph} variant="mini" label={description} testIdPrefix="picture-commit" />
        <figcaption className="gq-sr-only">{description}</figcaption>
      </figure>
    );
  }
  if (picture.kind === 'boxes') {
    const box = (title: string, items: string[]) => (
      <div className="gq-mini-box">
        <div className="gq-mini-box-title">{title}</div>
        <ul>
          {items.length ? (
            items.map((x) => (
              <li key={x} className="gq-chip gq-chip-small">
                {x}
              </li>
            ))
          ) : (
            <li className="gq-muted gq-small">{t('picture.empty')}</li>
          )}
        </ul>
      </div>
    );
    return (
      <figure className="gq-picture gq-picture-boxes" aria-label={description}>
        {box(t('boxes.working'), picture.working)}
        {box(t('boxes.staging'), picture.staging)}
        {box(t('boxes.repository'), picture.repository)}
      </figure>
    );
  }
  return (
    <figure className="gq-picture gq-picture-text">
      <pre className="gq-pre">{picture.kind === 'text' ? picture.text : ''}</pre>
    </figure>
  );
}
