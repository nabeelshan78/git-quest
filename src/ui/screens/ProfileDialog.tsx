/**
 * First-launch dialog: asks the player for their name and an optional class code.
 */
import { useCallback, useState } from 'react';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Modal } from '../components/Modal';
import { Logo } from '../components/Logo';
import { deriveHandle, profileFromForm } from '../state/profile';
import { useProgressApi } from '../state/progress';

export function ProfileDialog() {
  const api = useProgressApi();
  const [name, setName] = useState('');
  const [classCode, setClassCode] = useState('');
  const [error, setError] = useState('');

  const handle = deriveHandle(name);
  const preview = name.trim() ? fmt(STRINGS.profile.handlePreview, { handle }) : '';

  const onSave = useCallback(() => {
    if (!name.trim()) {
      setError(STRINGS.profile.nameRequired);
      return;
    }
    const patch = profileFromForm(name, classCode);
    api.setProfile(patch);
  }, [name, classCode, api]);

  return (
    <Modal title={<><Logo size={28} /> {STRINGS.profile.title}</>} testId={TID.profileDialog}>
      <p>{STRINGS.profile.intro}</p>
      <form className="gq-profile-form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <label>
          {STRINGS.profile.nameLabel}
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            data-testid={TID.profileName}
            autoFocus
            maxLength={60}
          />
          <span className="gq-hint">{STRINGS.profile.nameHint}</span>
          {preview && <span className="gq-hint">{preview}</span>}
          {error && <span className="gq-hint" style={{ color: 'var(--danger)' }}>{error}</span>}
        </label>
        <label>
          {STRINGS.profile.classCodeLabel}
          <input
            type="text"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            data-testid={TID.profileClassCode}
            maxLength={40}
          />
          <span className="gq-hint">{STRINGS.profile.classCodeHint}</span>
        </label>
        <button type="submit" className="gq-btn gq-btn-primary gq-btn-lg" data-testid={TID.profileSave}>
          {STRINGS.profile.save}
        </button>
      </form>
    </Modal>
  );
}
