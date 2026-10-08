import { t } from '../i18n';
import { requestLandscapeFullscreen } from '../core/platform';

export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  return (
    <div className="screen menu">
      <h1 className="logo">
        TANKY <span>TUNKY</span>
      </h1>
      <div className="menu-buttons">
        <button
          className="btn btn-primary"
          data-testid="play"
          onClick={() => {
            void requestLandscapeFullscreen();
            onPlay();
          }}
        >
          {t('menu.quickMatch')}
        </button>
        <button className="btn" data-testid="settings" onClick={onSettings}>
          {t('menu.settings')}
        </button>
      </div>
      <div className="version">v{__APP_VERSION__}</div>
    </div>
  );
}
