import { t } from '../i18n';
import { requestLandscapeFullscreen } from '../core/platform';

/** Opening menu: Tek Oyunculu / Çok Oyunculu / Ayarlar (owner request 2026-10-10). */
export function MainMenu({ onSolo, onMulti, onSettings }: { onSolo: () => void; onMulti: () => void; onSettings: () => void }) {
  return (
    <div className="screen menu">
      <h1 className="logo">
        TANKY <span>TUNKY</span>
      </h1>
      <div className="menu-buttons">
        <button
          className="btn btn-primary"
          data-testid="solo"
          onClick={() => {
            void requestLandscapeFullscreen();
            onSolo();
          }}
        >
          {t('menu.solo')}
        </button>
        <button className="btn" data-testid="multi" onClick={onMulti}>
          {t('menu.multi')}
        </button>
        <button className="btn" data-testid="settings" onClick={onSettings}>
          {t('menu.settings')}
        </button>
      </div>
      <div className="version">v{__APP_VERSION__}</div>
    </div>
  );
}

/** Tek Oyunculu: Hızlı Maç works today; Kampanya, İlerleme and Garaj are placeholders until they are built (CLAUDE.md §7 D/E). */
export function SoloMenu({ onQuick, onBack }: { onQuick: () => void; onBack: () => void }) {
  return (
    <div className="screen menu">
      <h2 className="menu-title">{t('menu.solo')}</h2>
      <div className="menu-buttons">
        <button className="btn btn-primary" data-testid="play" onClick={onQuick}>
          {t('menu.quickMatch')}
        </button>
        <button className="btn soon" data-testid="campaign" disabled>
          {t('menu.campaign')} <small>{t('card.soon')}</small>
        </button>
        <button className="btn soon" data-testid="garage" disabled>
          {t('menu.garage')} <small>{t('card.soon')}</small>
        </button>
        <button className="btn" data-testid="back" onClick={onBack}>
          {t('menu.back')}
        </button>
      </div>
    </div>
  );
}

/** Çok Oyunculu: not built yet (decision K1: online relay or same Wi-Fi; needs the INTERNET permission). */
export function MultiMenu({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen menu">
      <h2 className="menu-title">{t('menu.multi')}</h2>
      <p className="menu-note" data-testid="multi-note">
        {t('menu.multiSoon')}
      </p>
      <div className="menu-buttons">
        <button className="btn soon" disabled>
          {t('menu.host')} <small>{t('card.soon')}</small>
        </button>
        <button className="btn soon" disabled>
          {t('menu.join')} <small>{t('card.soon')}</small>
        </button>
        <button className="btn" data-testid="back" onClick={onBack}>
          {t('menu.back')}
        </button>
      </div>
    </div>
  );
}
