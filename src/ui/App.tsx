/**
 * App shell: top bar, router, theme, skip link, live region.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TID } from '../shared/testids';
import { STRINGS, fmt } from '../strings';
import { Icon } from './components/Icon';
import { Logo } from './components/Logo';
import { Stars } from './components/Stars';
import { AppEnvContext, detectEnv } from './env';
import { routeHref, useRoute } from './router';
import type { Route } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { SandboxScreen } from './screens/SandboxScreen';
import { GlossaryScreen } from './screens/GlossaryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfessorScreen } from './screens/ProfessorScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { DevScreen } from './screens/DevScreen';
import { ProfileDialog } from './screens/ProfileDialog';
import { MotionPrefsContext, motionPrefsFrom } from './state/motion';
import { ProgressProvider, getDefaultProgressStore, useProgress } from './state/progress';
import { useAnnouncer } from './state/announcer';
import { useAppStatus } from './state/appStatus';
import {
  prefersReducedMotion,
  prefersDarkScheme,
  resolveTheme,
  speedFactor,
  useSettings,
} from './state/settings';
import { totalStars } from './state/rewards';
import './styles.css';

const env = detectEnv();
const progressStore = getDefaultProgressStore();

export function App() {
  return (
    <AppEnvContext.Provider value={env}>
      <ProgressProvider store={progressStore}>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </ProgressProvider>
    </AppEnvContext.Provider>
  );
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [sysDark, setSysDark] = useState(prefersDarkScheme);
  const resolved = resolveTheme(settings.theme, sysDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => setSysDark(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  }, [resolved, settings.fontScale]);

  const prefs = useMemo(
    () =>
      motionPrefsFrom({
        testMode: env.testMode,
        reducedMotionSetting: settings.reducedMotion,
        systemReducedMotion: prefersReducedMotion(),
        factor: speedFactor(settings.animationSpeed),
      }),
    [settings.reducedMotion, settings.animationSpeed],
  );

  return <MotionPrefsContext.Provider value={prefs}>{children}</MotionPrefsContext.Provider>;
}

function AppInner() {
  const route = useRoute();
  const progress = useProgress();
  const appStatus = useAppStatus();
  const announceMsg = useAnnouncer((s) => s.message);
  const announceSeq = useAnnouncer((s) => s.seq);
  const mainRef = useRef<HTMLElement>(null);

  const needsProfile = !env.testMode && !progress.player.name;
  const stars = totalStars(progress);

  return (
    <div
      data-testid={TID.app}
      data-phase={appStatus.phase ?? undefined}
      data-ready={appStatus.ready || undefined}
      data-level={appStatus.level ?? undefined}
    >
      <a href="#main-content" className="gq-skip-link">
        {STRINGS.common.skipToContent}
      </a>

      {needsProfile && <ProfileDialog />}

      {route.name !== 'play' && route.name !== 'sandbox' && <TopBar stars={stars} />}

      <main id="main-content" ref={mainRef} tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', outline: 'none' }}>
        <RoutePage route={route} />
      </main>

      <div
        className="gq-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid={TID.liveRegion}
        key={announceSeq}
      >
        {announceMsg}
      </div>
    </div>
  );
}

function TopBar({ stars }: { stars: number }) {
  return (
    <nav className="gq-topbar" aria-label={STRINGS.topBar.mainNav} data-testid={TID.topBar}>
      <a href={routeHref({ name: 'home' })} className="gq-topbar-brand" data-testid={TID.homeButton}>
        <Logo size={24} />
        <span>{STRINGS.common.appName}</span>
      </a>
      <span className="gq-topbar-title" data-testid={TID.starsTotal} aria-label={fmt(STRINGS.topBar.totalStars, { count: stars })}>
        <Stars value={Math.min(stars, 3)} max={3} size={14} />
        {' '}{stars}
      </span>
      <div className="gq-topbar-actions">
        <a href={routeHref({ name: 'glossary' })} className="gq-icon-btn" aria-label={STRINGS.topBar.glossary} data-testid={TID.glossaryButton}>
          <Icon name="book" />
        </a>
        <a href={routeHref({ name: 'sandbox', preset: null })} className="gq-icon-btn" aria-label={STRINGS.topBar.sandbox} data-testid={TID.sandboxButton}>
          <Icon name="sandbox" />
        </a>
        <a href={routeHref({ name: 'settings' })} className="gq-icon-btn" aria-label={STRINGS.topBar.settings} data-testid={TID.settingsButton}>
          <Icon name="gear" />
        </a>
      </div>
    </nav>
  );
}

function RoutePage({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'play':
      return <PlayScreen key={route.levelId} levelId={route.levelId} />;
    case 'sandbox':
      return <SandboxScreen preset={route.preset} />;
    case 'glossary':
      return <GlossaryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'professor':
      return <ProfessorScreen />;
    case 'dev':
      return env.dev ? <DevScreen variant={route.variant} /> : <NotFoundScreen path="/dev" />;
    case 'notFound':
      return <NotFoundScreen path={route.path} />;
  }
}
