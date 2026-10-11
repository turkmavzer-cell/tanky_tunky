import { useEffect, useRef, useState } from 'react';
import { ABILITIES, COMBAT, TANKS, TANK_CLASSES, evalCurve, type TankClassId } from '../sim/config';
import { TEAM_PALETTES, drawTankSlices } from '../render/tankArt';
import type { Difficulty } from '../core/save';
import { t } from '../i18n';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'extreme'];

/** Rounded number for the cards (no trailing ",0"). */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('tr-TR');
}

/** Spinning sprite-stacked preview of a tank (same slices as in the game), drawn on a 2D canvas. */
function TankPreview({ cls, spin }: { cls: TankClassId; spin: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const sl = drawTankSlices(cls, TEAM_PALETTES[0]);
    const lift = 2.6;
    let raf = 0;
    let a = -0.6;
    let last = performance.now();
    const draw = (now: number): void => {
      if (spin) a += ((now - last) / 1000) * 0.9;
      last = now;
      g.clearRect(0, 0, c.width, c.height);
      const cx = c.width / 2;
      const cy = c.height / 2 + 14;
      const scale = c.width / 120;
      const layer = (img: HTMLCanvasElement, z: number, ang: number): void => {
        g.save();
        g.translate(cx, cy - z * lift * scale * 0.8);
        g.scale(scale, scale * 0.5);
        g.rotate(ang);
        g.drawImage(img, -img.width / 2, -img.height / 2);
        g.restore();
      };
      layer(sl.shadow, -0.3, a);
      sl.hull.forEach((h, i) => layer(h, i, a));
      sl.turret.forEach((tr, i) => layer(tr, sl.hull.length + i, a + 0.5 * Math.sin(now / 900)));
      if (spin) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cls, spin]);
  return <canvas ref={ref} className="tank-preview" width={240} height={180} />;
}

/** Card content: every number is read from the data files (tanks.json, combat.json, abilities.json). */
function Card({ cls, on, onPick }: { cls: TankClassId; on: boolean; onPick: () => void }) {
  const d = TANKS[cls];
  const ab = ABILITIES[d.ability];
  const full = evalCurve(COMBAT.scaling.damage, 1);
  const abDmg = Number(ab.damage ?? 0);
  const abShots = Number(ab.shots ?? 1);
  const abDur = Number(ab.duration);
  const rows: [string, string][] = [
    [t('card.hp'), fmt(d.hp)],
    [t('card.armor'), `%${Math.round(d.armor * 100)}`],
    [t('card.damage'), `${fmt(d.damage)} / ${fmt(d.damage * full)}`],
    [t('card.fireRate'), `${fmt(d.fireCooldown)} ${t('hud.sec')}`],
    [t('card.speed'), fmt(d.maxSpeed)],
    [t('card.range'), d.minRange > 0 ? `${fmt(d.minRange)}–${fmt(d.range)}` : fmt(d.range)],
    [t('card.vision'), cls === 'trapper' ? t('card.visionAll') : fmt(d.vision)],
  ];
  return (
    <button className={'tank-card' + (on ? ' on' : '')} data-testid={`class-${cls}`} data-cls={cls} onClick={onPick}>
      <div className="tc-left">
        <TankPreview cls={cls} spin={on} />
        <div className="tc-name">{t(`class.${cls}`)}</div>
        <div className="tc-role">{t(`class.${cls}.role`)}</div>
        <div className="tc-desc">{t(`class.${cls}.desc`)}</div>
      </div>
      <div className="tc-right">
        <dl className="tc-stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="tc-ability">
          <div className="tc-ab-head">
            <b>{String(ab.name)}</b>
            <span>
              {abDur > 0 ? `${fmt(abDur)} ${t('hud.sec')} · ` : ''}
              {t('card.cooldown')} {fmt(Number(ab.cooldown))} {t('hud.sec')}
              {abDmg > 0 ? ` · ${t('card.damage')} ${abShots > 1 ? `${abShots}×` : ''}${fmt(abDmg)}` : ''}
            </span>
          </div>
          <p>{t(`ability.${d.ability}.desc`)}</p>
        </div>
        <div className="tc-tree">
          <b>{t('card.tree')}</b> <span>{t('card.soon')}</span>
        </div>
      </div>
    </button>
  );
}

export function ClassSelect({
  initial,
  difficulty,
  onStart,
  onBack,
}: {
  initial: TankClassId;
  difficulty: Difficulty;
  onStart: (c: TankClassId, d: Difficulty) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState<TankClassId>(initial);
  const [diff, setDiff] = useState<Difficulty>(difficulty);
  const strip = useRef<HTMLDivElement>(null);
  const settling = useRef(false);

  const centre = (c: TankClassId, smooth: boolean): void => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-cls="${c}"]`);
    if (!el || !strip.current) return;
    const s = strip.current;
    s.scrollTo({ left: el.offsetLeft - (s.clientWidth - el.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    centre(initial, false);
  }, [initial]);

  // the card closest to the centre of the strip is the selected one (swipe to choose)
  const onScroll = (): void => {
    const s = strip.current;
    if (!s || settling.current) return;
    const mid = s.scrollLeft + s.clientWidth / 2;
    let best = sel;
    let bestD = Infinity;
    s.querySelectorAll<HTMLElement>('.tank-card').forEach((el) => {
      const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = el.dataset.cls as TankClassId;
      }
    });
    if (best !== sel) setSel(best);
  };

  const pick = (c: TankClassId): void => {
    setSel(c);
    settling.current = true;
    centre(c, true);
    window.setTimeout(() => (settling.current = false), 450);
  };

  return (
    <div className="screen class-select">
      <h2>{t('menu.chooseClass')}</h2>
      <div className="tank-strip" ref={strip} onScroll={onScroll} data-testid="tank-strip">
        {TANK_CLASSES.map((c) => (
          <Card key={c} cls={c} on={c === sel} onPick={() => pick(c)} />
        ))}
      </div>
      <div className="strip-dots">
        {TANK_CLASSES.map((c) => (
          <i key={c} className={c === sel ? 'on' : ''} onClick={() => pick(c)} />
        ))}
      </div>
      <div className="row select-bar">
        <button className="btn" onClick={onBack}>
          {t('menu.back')}
        </button>
        <div className="seg" role="radiogroup" data-testid="difficulty">
          {DIFFICULTIES.map((d) => (
            <button key={d} role="radio" aria-checked={d === diff} className={d === diff ? 'on' : ''} data-testid={`diff-${d}`} onClick={() => setDiff(d)}>
              {t(`diff.${d}`)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" data-testid="start" onClick={() => onStart(sel, diff)}>
          {t('menu.start')}
        </button>
      </div>
    </div>
  );
}
