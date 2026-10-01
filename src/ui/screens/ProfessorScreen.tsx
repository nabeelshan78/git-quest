/**
 * Professor page: how to collect and read exported progress files.
 */
import { TID } from '../../shared/testids';
import { STRINGS } from '../../strings';
import { routeHref } from '../router';

const S = STRINGS.classroom.professorPage;

export function ProfessorScreen() {
  return (
    <div className="gq-professor" data-testid={TID.dashboard}>
      <h1>{S.title}</h1>
      <p>{S.lead}</p>

      <h2>{S.collectTitle}</h2>
      <ol>
        {S.collectSteps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      <h2>{S.readTitle}</h2>
      <ol>
        {S.readSteps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      <h2>{S.jsonTitle}</h2>
      <ol>
        {S.jsonSteps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      <h2>{S.privacyTitle}</h2>
      <p>{S.privacyBody}</p>

      <p className="gq-muted gq-small" style={{ marginTop: 16 }}>{S.guide}</p>

      <div style={{ marginTop: 16 }}>
        <a href={routeHref({ name: 'home' })} className="gq-btn">{S.backLink}</a>
      </div>
    </div>
  );
}
