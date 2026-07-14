// Shared attack-FX engine for the Stride Quest previews (battlefield-ui.html,
// fx-test.html). Choreography per attack: play the character's anim → at the
// measured release frame spawn the class projectile at the weapon tip → fly
// straight right at constant speed → impact burst + flash + damage number.
// Anchors come from fx-anchors.js / fx-special-anchors.js (pixel-measured).
window.FXEngine = (function () {
  const FX = {
    idleFps: 6, attackFps: 12, specialFps: 12,
    restFps: 5,                            // 6-frame kneel loop → ~1.2s breath
    projFps: 12, impactFps: 14,
    speedPxMs: 1.5, minTravelPx: 80,
    projFrames: 5, impactFrames: 7, specialProjFrames: 5,
    fxScale: 1.7, specialScale: 1.5,       // special projectile/impact multiplier
    bossChestX: 0.40,
  };

  // Per-class art config. angle rotates the projectile sprite so it faces its
  // flight direction (set after eyeballing each generated sprite).
  const CLASS_FX = {
    warrior:  { basicAngle: -30, specialAngle: 0 },
    mage:     { basicAngle: 0,   specialAngle: 0 },
    medic:    { basicAngle: 0,   specialAngle: 0 },
    archer:   { basicAngle: 0,   specialAngle: 0 },
    assassin: { basicAngle: 0,   specialAngle: 0 },
    paladin:  { basicAngle: 0,   specialAngle: 0 },
    warlock:  { basicAngle: 0,   specialAngle: 0 },
    bard:     { basicAngle: 0,   specialAngle: 0 },
  };

  const pad = (n) => String(n).padStart(3, '0');
  const framesOf = (dir, c) => Array.from({ length: c }, (_, i) => `${dir}/frame_${pad(i)}.png`);
  const preload = (fs) => fs.forEach((f) => { const im = new Image(); im.src = f; });

  let bossImg = null, bossEl = null, bossBaseTransform = '', bossBaseFilter = '';
  function setBoss(img, el) {
    bossImg = img; bossEl = el;
    bossBaseTransform = el.style.transform || '';
    bossBaseFilter = img.style.filter || '';
  }

  function classFxFrames(cls) {
    return {
      basic: framesOf(`assets/effects/${cls}/basic`, FX.projFrames),
      special: framesOf(`assets/effects/${cls}/special`, FX.specialProjFrames),
      impact: framesOf(`assets/effects/${cls}/impact`, FX.impactFrames),
    };
  }

  function fireProjectile(fromImg, frames, angle, sizePx, onHit) {
    const w = fromImg.getBoundingClientRect(), b = bossImg.getBoundingClientRect();
    const a = fromImg._fxAnchor || { tipX: 0.8, tipY: 0.45 };
    const cx0 = w.left + w.width * a.tipX, cy = w.top + w.height * a.tipY;
    const cx1 = Math.max(b.left + b.width * FX.bossChestX, cx0 + FX.minTravelPx);
    const p = document.createElement('img'); p.className = 'sprite';
    p.style.cssText = `position:fixed;top:${cy - sizePx / 2}px;width:${sizePx}px;height:${sizePx}px;z-index:60;pointer-events:none;transform:rotate(${angle}deg);`;
    (api.layer || document.body).appendChild(p);
    let fi = 0; p.src = frames[0];
    const flicker = setInterval(() => { fi = (fi + 1) % frames.length; p.src = frames[fi]; }, 1000 / FX.projFps);
    const dur = Math.max(120, Math.min(320, (cx1 - cx0) / FX.speedPxMs));
    const t0 = performance.now();
    (function fly(now) {
      const t = Math.min((now - t0) / dur, 1);
      p.style.left = (cx0 - sizePx / 2 + (cx1 - cx0) * t) + 'px';
      if (t < 1) requestAnimationFrame(fly);
      else { clearInterval(flicker); p.remove(); onHit(cx1, cy); }
    })(t0);
  }

  function impactAt(cx, cy, frames, sizePx, big) {
    const isize = sizePx * 1.3;
    const im = document.createElement('img'); im.className = 'sprite';
    im.style.cssText = `position:fixed;left:${cx - isize / 2}px;top:${cy - isize / 2}px;width:${isize}px;height:${isize}px;z-index:61;pointer-events:none;`;
    (api.layer || document.body).appendChild(im);
    let fi = 0; im.src = frames[0];
    const iv = setInterval(() => {
      fi++;
      if (fi >= frames.length) { clearInterval(iv); im.remove(); return; }
      im.src = frames[fi];
    }, 1000 / FX.impactFps);
    const flashMs = big ? 220 : 120, bump = big ? 9 : 4;
    bossImg.style.filter = bossBaseFilter + ' brightness(2.2)';
    bossEl.style.transform = bossBaseTransform + ` translateY(-${bump}px)`;
    setTimeout(() => { bossImg.style.filter = bossBaseFilter; bossEl.style.transform = bossBaseTransform; }, flashMs);
    const amount = big ? (9000 + Math.floor(Math.random() * 3000)) : (1800 + Math.floor(Math.random() * 900));
    if (api.onDamage) api.onDamage(amount, big);   // optional page hook (e.g. HUD boss HP bar)
    const dmg = document.createElement('div');
    dmg.textContent = '-' + amount;
    dmg.style.cssText = `position:fixed;left:${cx - 12}px;top:${cy - isize / 2 - 8}px;z-index:62;pointer-events:none;
      font-weight:800;font-size:${big ? 30 : 22}px;color:${big ? '#ffe9a3' : '#ffd166'};text-shadow:0 2px 3px #000;
      transition:transform .8s ease-out,opacity .8s ease-out;`;
    (api.layer || document.body).appendChild(dmg);
    requestAnimationFrame(() => { dmg.style.transform = 'translateY(-46px)'; dmg.style.opacity = '0'; });
    setTimeout(() => dmg.remove(), 850);
  }

  // A fighter drives one on-screen character img: idle loop + attack/special.
  function makeFighter(img, cls, jobKey) {
    const f = { img, cls, job: jobKey, mode: 'idle', frame: 0, alive: true };
    let fx = classFxFrames(cls);
    let idleF, restF, atkF, atkAnchor, spcF, spcAnchor;

    function loadJob() {
      const key = `${f.cls}/${f.job}`;
      atkAnchor = window.FX_ANCHORS[key];
      const spc = (window.FX_SPECIAL_ANCHORS || {})[key];
      idleF = framesOf(`characters/${f.cls}/${f.job}/animations/idle`, 4);
      restF = framesOf(`characters/${f.cls}/${f.job}/animations/rest`, 6);
      atkF = framesOf(`characters/${f.cls}/${f.job}/animations/attack`, atkAnchor.frames);
      spcF = spc ? framesOf(`characters/${f.cls}/${f.job}/animations/special`, spc.frames) : null;
      spcAnchor = spc || null;
      preload([...idleF, ...restF, ...atkF, ...(spcF || []), ...fx.basic, ...fx.special, ...fx.impact]);
      img.src = (f.mode === 'rest' ? restF : idleF)[0];
    }
    loadJob();

    function step() {
      if (!f.alive) return;
      if (f.mode === 'idle' || f.mode === 'rest') {
        // Both are loops; rest = the kneeling breather (out-of-fuel state).
        const seq = f.mode === 'rest' ? restF : idleF;
        const fps = f.mode === 'rest' ? FX.restFps : FX.idleFps;
        f.frame = (f.frame + 1) % seq.length; img.src = seq[f.frame];
        setTimeout(step, 1000 / fps);
        return;
      }
      const seq = f.mode === 'special' && spcF ? spcF : atkF;
      const anchor = f.mode === 'special' && spcAnchor ? spcAnchor : atkAnchor;
      const fps = f.mode === 'special' ? FX.specialFps : FX.attackFps;
      f.frame++;
      if (f.frame >= seq.length) { f.mode = 'idle'; f.frame = 0; img.src = idleF[0]; setTimeout(step, 1000 / FX.idleFps); return; }
      img.src = seq[f.frame];
      if (f.frame === anchor.release) {
        img._fxAnchor = anchor;
        const cf = CLASS_FX[f.cls], big = f.mode === 'special';
        const frames = big ? fx.special : fx.basic;
        const angle = big ? cf.specialAngle : cf.basicAngle;
        const sizePx = (big ? 96 : 64) * FX.fxScale * (big ? FX.specialScale / 1.5 : 1);
        fireProjectile(img, frames, angle, sizePx, (cx, cy) =>
          impactAt(cx, cy, fx.impact, sizePx * (big ? 1.25 : 1), big));
      }
      setTimeout(step, 1000 / fps);
    }
    step();

    // Drifting "z" particles while resting — the kneel pose alone reads subtle,
    // so the z's carry the "asleep" legibility. PIXEL z's: a 5x5-block glyph
    // with a 1px pixel drop-shadow drawn on a tiny canvas and scaled up crisp —
    // grid-pure like the sprites, no fonts, no art regeneration. Stops on wake.
    let zzzTimer = null;
    function makeZCanvas(scale) {
      const c = document.createElement('canvas');
      c.width = 6; c.height = 6;                 // 5x5 glyph + 1px shadow offset
      const ctx = c.getContext('2d');
      const glyph = (ox, oy, color) => {         // classic Z: bar, diagonal, bar
        ctx.fillStyle = color;
        ctx.fillRect(ox, oy, 5, 1);
        ctx.fillRect(ox + 3, oy + 1, 1, 1);
        ctx.fillRect(ox + 2, oy + 2, 1, 1);
        ctx.fillRect(ox + 1, oy + 3, 1, 1);
        ctx.fillRect(ox, oy + 4, 5, 1);
      };
      glyph(1, 1, 'rgba(0,0,0,.55)');
      glyph(0, 0, '#cfd6e4');
      return c;
    }
    function spawnZ() {
      const r = img.getBoundingClientRect();
      const scale = 2 + Math.floor(Math.random() * 2);   // 12px or 18px on screen
      const z = makeZCanvas(scale);
      const x = r.left + r.width * (0.50 + Math.random() * 0.14);
      const y = r.top + r.height * 0.30;
      z.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:60;pointer-events:none;
        width:${6 * scale}px;height:${6 * scale}px;image-rendering:pixelated;opacity:0;
        transition:transform 2.2s ease-out,opacity .6s ease-in;`;
      (api.layer || document.body).appendChild(z);
      requestAnimationFrame(() => {
        z.style.opacity = '.9';
        z.style.transform = `translate(${8 + Math.random() * 10}px,-34px)`;
      });
      setTimeout(() => { z.style.opacity = '0'; }, 1400);
      setTimeout(() => z.remove(), 2400);
    }
    function stopZzz() { if (zzzTimer) { clearInterval(zzzTimer); zzzTimer = null; } }

    // basic/special only fire from 'idle', so a resting hero ignores attack
    // orders by construction — no extra guards needed.
    f.basic = () => { if (f.mode === 'idle') { f.mode = 'attack'; f.frame = -1; } };
    f.special = () => { if (f.mode === 'idle') { f.mode = 'special'; f.frame = -1; } };
    f.setResting = (on) => {
      if (on) {
        f.mode = 'rest'; f.frame = 0; img.src = restF[0];
        if (!zzzTimer) { spawnZ(); zzzTimer = setInterval(spawnZ, 1500 + Math.random() * 700); }
      } else if (f.mode === 'rest') {
        f.mode = 'idle'; f.frame = 0; img.src = idleF[0];
        stopZzz();
      }
    };
    f.setJob = (jobKey) => {
      const wasResting = f.mode === 'rest';
      f.job = jobKey; f.mode = wasResting ? 'rest' : 'idle'; f.frame = 0; loadJob();
    };
    f.destroy = () => { f.alive = false; stopZzz(); };
    return f;
  }

  // api.layer: optional mount node for projectiles/impacts/damage numbers.
  // Default (null) = document.body. Pages with a fixed-position stage should set
  // it to the stage so effect z-indexes (60-62) slot BELOW HUD chrome (100+)
  // inside the same stacking context instead of painting over popovers/toasts.
  const api = { FX, CLASS_FX, makeFighter, setBoss, framesOf, preload, onDamage: null, layer: null };
  return api;
})();
