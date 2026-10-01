/**
 * The page for professors (#/professor): how to collect and read the
 * progress files students export. There is no server, so there is nothing
 * to log in to; the page only explains the steps.
 */
import { useId } from 'react';
import { TID } from '../shared/testids';
import { STRINGS } from '../strings';
import './professor.css';

function StepSection({ title, steps, ordered }: { title: string; steps: readonly string[]; ordered: boolean }) {
  const id = useId();
  const items = steps.map((step) => <li key={step}>{step}</li>);
  return (
    <section className="gq-prof-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {ordered ? <ol>{items}</ol> : <ul>{items}</ul>}
    </section>
  );
}

export function ProfessorDashboard() {
  const text = STRINGS.classroom.professorPage;
  const titleId = useId();
  const privacyId = useId();
  return (
    <main className="gq-prof" data-testid={TID.dashboard} aria-labelledby={titleId}>
      <h1 id={titleId}>{text.title}</h1>
      <p className="gq-prof-lead">{text.lead}</p>
      <StepSection title={text.collectTitle} steps={text.collectSteps} ordered />
      <StepSection title={text.readTitle} steps={text.readSteps} ordered={false} />
      <StepSection title={text.jsonTitle} steps={text.jsonSteps} ordered={false} />
      <section className="gq-prof-section gq-prof-privacy" aria-labelledby={privacyId}>
        <h2 id={privacyId}>{text.privacyTitle}</h2>
        <p>{text.privacyBody}</p>
      </section>
      <p className="gq-prof-guide">{text.guide}</p>
      <p>
        <a href="#/">{text.backLink}</a>
      </p>
    </main>
  );
}
