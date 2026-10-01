/**
 * 404 page.
 */
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { routeHref } from '../router';

export function NotFoundScreen({ path }: { path: string }) {
  return (
    <div className="gq-not-found" data-testid={TID.notFound}>
      <h1>{STRINGS.common.notFoundTitle}</h1>
      <p>{fmt(STRINGS.common.notFoundBody, { path })}</p>
      <a href={routeHref({ name: 'home' })} className="gq-btn">{STRINGS.common.backHome}</a>
    </div>
  );
}
