// Shared attack-FX engine for the Stride Quest previews (battlefield-ui.html,
// fx-test.html). Choreography per attack: play the character's anim → at the
// measured release frame spawn the class projectile at the weapon tip → fly
// straight right at constant speed → impact burst + flash + damage number.
// Anchors come from fx-anchors.js / fx-special-anchors.js (pixel-measured).
window.FXEngine = (function () {
  const FX = {
    idleFps: 6, attackFps: 12, specialFps: 12,
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
    document.body.appendChild(p);
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
    document.body.appendChild(im);
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
    const dmg = document.createElement('div');
    dmg.textContent = '-' + (big ? (9000 + Math.floor(Math.random() * 3000)) : (1800 + Math.floor(Math.random() * 900)));
    dmg.style.cssText = `position:fixed;left:${cx - 12}px;top:${cy - isize / 2 - 8}px;z-index:62;pointer-events:none;
      font-weight:800;font-size:${big ? 30 : 22}px;color:${big ? '#ffe9a3' : '#ffd166'};text-shadow:0 2px 3px #000;
      transition:transform .8s ease-out,opacity .8s ease-out;`;
    document.body.appendChild(dmg);
    requestAnimationFrame(() => { dmg.style.transform = 'translateY(-46px)'; dmg.style.opacity = '0'; });
    setTimeout(() => dmg.remove(), 850);
  }

  // A fighter drives one on-screen character img: idle loop + attack/special.
  function makeFighter(img, cls, jobKey) {
    const f = { img, cls, job: jobKey, mode: 'idle', frame: 0, alive: true };
    let fx = classFxFrames(cls);
    let idleF, atkF, atkAnchor, spcF, spcAnchor;

    function loadJob() {
      const key = `${f.cls}/${f.job}`;
      atkAnchor = window.FX_ANCHORS[key];
      const spc = (window.FX_SPECIAL_ANCHORS || {})[key];
      idleF = framesOf(`characters/${f.cls}/${f.job}/animations/idle`, 4);
      atkF = framesOf(`characters/${f.cls}/${f.job}/animations/attack`, atkAnchor.frames);
      spcF = spc ? framesOf(`characters/${f.cls}/${f.job}/animations/special`, spc.frames) : null;
      spcAnchor = spc || null;
      preload([...idleF, ...atkF, ...(spcF || []), ...fx.basic, ...fx.special, ...fx.impact]);
      img.src = idleF[0];
    }
    loadJob();

    function step() {
      if (!f.alive) return;
      if (f.mode === 'idle') {
        f.frame = (f.frame + 1) % idleF.length; img.src = idleF[f.frame];
        setTimeout(step, 1000 / FX.idleFps);
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

    f.basic = () => { if (f.mode === 'idle') { f.mode = 'attack'; f.frame = -1; } };
    f.special = () => { if (f.mode === 'idle') { f.mode = 'special'; f.frame = -1; } };
    f.setJob = (jobKey) => { f.job = jobKey; f.mode = 'idle'; f.frame = 0; loadJob(); };
    f.destroy = () => { f.alive = false; };
    return f;
  }

  return { FX, CLASS_FX, makeFighter, setBoss, framesOf, preload };
})();
