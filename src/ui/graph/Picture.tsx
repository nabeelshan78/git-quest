/**
 * Small pictures for predict cards and questions: a mini commit graph,
 * three mini boxes, or monospace text. Each has a text alternative.
 */
import { useMemo } from 'react';
import type { Picture as PictureData } from '../../shared/level';
import { STRINGS, fmt } from '../../strings';
import { CommitGraph } from './CommitGraph';
import { describeGraph } from './describe';
import { graphFromPicture } from './model';

export function pictureDescription(p: PictureData): string {
  switch (p.kind) {
    case 'graph':
      return describeGraph(graphFromPicture(p));
    case 'boxes': {
      const list = (xs: string[]) => (xs.length ? xs.join(', ') : STRINGS.picture.empty);
      return fmt(STRINGS.picture.boxesDescription, { working: list(p.working), staging: list(p.staging), repository: list(p.repository) });
    }
    case 'text':
      return p.text;
  }
}

function MiniBox({ title, items }: { title: string; items: string[] }) {
  return (
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
          <li className="gq-muted gq-small">{STRINGS.picture.empty}</li>
        )}
      </ul>
    </div>
  );
}

export function Picture({ picture }: { picture: PictureData }) {
  const graph = useMemo(() => (picture.kind === 'graph' ? graphFromPicture(picture) : null), [picture]);
  const description = pictureDescription(picture);
  if (picture.kind === 'graph' && graph) {
    return (
      <figure className="gq-picture gq-picture-graph">
        <CommitGraph graph={graph} variant="mini" label={description} testIdPrefix="picture-commit" />
        <figcaption className="gq-sr-only">{description}</figcaption>
      </figure>
    );
  }
  if (picture.kind === 'boxes') {
    return (
      <figure className="gq-picture gq-picture-boxes" aria-label={description}>
        <MiniBox title={STRINGS.world.working} items={picture.working} />
        <MiniBox title={STRINGS.world.staging} items={picture.staging} />
        <MiniBox title={STRINGS.world.repository} items={picture.repository} />
      </figure>
    );
  }
  return (
    <figure className="gq-picture gq-picture-text">
      <pre className="gq-pre">{picture.kind === 'text' ? picture.text : ''}</pre>
    </figure>
  );
}
