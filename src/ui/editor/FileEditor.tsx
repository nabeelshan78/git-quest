/**
 * File editor: tree of files on the left, editor on the right.
 * Also the git-opened editor (commit message etc.).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import type { EditorRequest } from '../../shared/types';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { fileTreeRoot, folderTree } from '../world/derive';
import { conflictCount } from '../files/conflicts';

export interface FileEditorProps {
  session: GameSession;
  snapshot: SessionSnapshot;
}

export function FileEditor({ session, snapshot }: FileEditorProps) {
  const machine = snapshot.world.activeMachine;
  const m = snapshot.world.machines[machine];
  const root = useMemo(() => fileTreeRoot(snapshot.world, machine), [snapshot.world, machine]);
  const nodes = useMemo(
    () => (root ? folderTree(m, root, { showGitDir: false, maxEntries: 200 }) : []),
    [m, root],
  );
  const files = nodes.filter((n) => !n.isDir);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [newFileMode, setNewFileMode] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Load file content
  const selectedFile = selectedPath ? m.fs.files[selectedPath] : undefined;
  useEffect(() => {
    if (selectedPath && selectedFile !== undefined) {
      setEditContent(selectedFile);
      setDirty(false);
    }
  }, [selectedPath, selectedFile]);

  const onSave = useCallback(() => {
    if (!selectedPath) return;
    session.saveFile(selectedPath, editContent);
    setDirty(false);
  }, [session, selectedPath, editContent]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

  const onCreateFile = useCallback(() => {
    const name = newFileName.trim();
    if (!name || !root) return;
    const path = `${root}/${name}`;
    session.saveFile(path, '');
    setNewFileMode(false);
    setNewFileName('');
    setSelectedPath(path);
  }, [session, root, newFileName]);

  const conflicts = selectedPath && selectedFile ? conflictCount(selectedFile) : 0;

  return (
    <div className="gq-file-editor" data-testid={TID.editor}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* File tree */}
        <div className="gq-file-tree" data-testid={TID.fileTree} style={{ width: 160, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {root && (
            <div className="gq-small gq-muted" style={{ padding: '4px 8px' }}>
              {fmt(STRINGS.files.rootLabel, { path: root.split('/').pop() ?? root })}
            </div>
          )}
          {files.map((n) => (
            <button
              key={n.path}
              type="button"
              className="gq-file-tree-item"
              style={{ paddingLeft: n.depth * 12 + 8 }}
              aria-selected={n.path === selectedPath}
              onClick={() => setSelectedPath(n.path)}
              data-testid={TID.fileTreeItem(n.rel)}
            >
              <Icon name="file" size={12} />
              <span>{n.name}</span>
            </button>
          ))}
          {files.length === 0 && (
            <p className="gq-small gq-muted" style={{ padding: 8 }}>{STRINGS.files.noFiles}</p>
          )}
          {/* New file */}
          {!newFileMode ? (
            <button
              type="button"
              className="gq-icon-btn"
              style={{ margin: 4, fontSize: '0.8em' }}
              onClick={() => setNewFileMode(true)}
              data-testid={TID.newFileButton}
              aria-label={STRINGS.files.newFile}
            >
              <Icon name="plus" size={14} /> {STRINGS.files.newFile}
            </button>
          ) : (
            <div style={{ padding: 4 }}>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={STRINGS.files.newFileHint}
                data-testid={TID.newFileName}
                autoFocus
                style={{ width: '100%', padding: '4px 6px', fontSize: '0.8em', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                onKeyDown={(e) => { if (e.key === 'Enter') onCreateFile(); if (e.key === 'Escape') { setNewFileMode(false); setNewFileName(''); } }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button type="button" className="gq-btn gq-btn-sm" onClick={onCreateFile} data-testid={TID.newFileCreate}>{STRINGS.files.create}</button>
                <button type="button" className="gq-btn gq-btn-sm" onClick={() => { setNewFileMode(false); setNewFileName(''); }} data-testid={TID.newFileCancel}>{STRINGS.common.cancel}</button>
              </div>
            </div>
          )}
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedPath ? (
            <>
              <div className="gq-file-editor-toolbar">
                <span style={{ flex: 1 }}>
                  {fmt(STRINGS.files.editorLabel, { path: selectedPath.split('/').pop() ?? selectedPath })}
                </span>
                <span data-testid={TID.editorStatus} className="gq-small">
                  {dirty ? STRINGS.files.unsaved : STRINGS.files.saved}
                </span>
                <button type="button" className="gq-btn gq-btn-sm" onClick={onSave} data-testid={TID.editorSave}>
                  <Icon name="save" size={12} /> {STRINGS.files.save}
                </button>
                <button type="button" className="gq-icon-btn" onClick={() => setSelectedPath(null)} data-testid={TID.editorClose} aria-label={STRINGS.files.closeFile}>
                  <Icon name="close" size={14} />
                </button>
              </div>
              {conflicts > 0 && (
                <div style={{ padding: '4px 10px', background: 'var(--danger-bg)', fontSize: '0.8em', color: 'var(--danger)' }}>
                  {fmt(STRINGS.files.conflictBanner, { count: conflicts })}
                </div>
              )}
              <textarea
                className="gq-file-editor-textarea"
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); setDirty(true); }}
                onKeyDown={onKeyDown}
                aria-label={fmt(STRINGS.files.editorLabel, { path: selectedPath })}
                spellCheck={false}
              />
            </>
          ) : (
            <p className="gq-muted" style={{ padding: 16 }}>{STRINGS.files.pickFile}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Git-opened editor (commit message, rebase todo). */
export function GitEditor({ session, snapshot }: { session: GameSession; snapshot: SessionSnapshot }) {
  const editor = snapshot.editor;
  if (!editor) return null;

  return <GitEditorInner session={session} editor={editor} />;
}

function GitEditorInner({ session, editor }: { session: GameSession; editor: EditorRequest }) {
  const [text, setText] = useState(editor.initialContent);

  const onSave = useCallback(() => {
    session.submitEditor(text);
  }, [session, text]);

  const onAbort = useCallback(() => {
    session.submitEditor(null);
  }, [session]);

  return (
    <Modal
      title={STRINGS.gitEditor.title}
      testId={TID.gitEditor}
      onEscape={onAbort}
    >
      <p className="gq-small gq-muted">
        {fmt(STRINGS.gitEditor.intro, { command: editor.command })}
      </p>
      <p className="gq-small gq-muted">{fmt(STRINGS.gitEditor.file, { file: editor.file })}</p>
      <div className="gq-git-editor">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid={TID.gitEditorText}
          aria-label={STRINGS.gitEditor.textLabel}
          rows={8}
          autoFocus
        />
        <div className="gq-git-editor-actions">
          <button type="button" className="gq-btn gq-btn-primary" onClick={onSave} data-testid={TID.gitEditorSave}>
            <Icon name="save" size={14} /> {STRINGS.gitEditor.save}
          </button>
          <button type="button" className="gq-btn" onClick={onAbort} data-testid={TID.gitEditorAbort}>
            {STRINGS.gitEditor.abort}
          </button>
        </div>
      </div>
    </Modal>
  );
}
