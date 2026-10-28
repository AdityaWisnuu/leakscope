// Injected into every recorded page (Playwright addInitScript): captions, cursor, title cards, eased scroll.
(() => {
  const css = `
  #vc-cap{position:fixed;left:50%;bottom:34px;transform:translate(-50%,8px);z-index:2147483646;max-width:1060px;width:max-content;
    padding:13px 24px 14px 22px;background:rgba(9,11,10,.90);border:1px solid rgba(255,255,255,.08);border-left:3px solid #ff5a2c;
    color:#f2efe8;font:500 21px/1.4 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.005em;text-align:left;
    box-shadow:0 12px 40px rgba(0,0,0,.55);opacity:0;transition:opacity .28s ease,transform .28s ease;pointer-events:none}
  #vc-cap.on{opacity:1;transform:translate(-50%,0)}
  #vc-cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);
    transition:none}
  #vc-cur svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
  #vc-cur .ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid #ff5a2c;opacity:0;transform:scale(.4)}
  #vc-cur .ring.go{animation:vcring .5s ease-out}
  @keyframes vcring{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.8)}}
  #vc-card{position:fixed;inset:0;z-index:2147483645;background:#0b0d0c;display:flex;flex-direction:column;justify-content:center;
    padding:0 132px 60px;color:#ebe8e1;transition:opacity .9s ease;
    background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
    background-size:48px 48px}
  #vc-card.off{opacity:0;pointer-events:none}
  #vc-card .vc-kicker{font:500 15px/1 'IBM Plex Mono',monospace;letter-spacing:.22em;color:#ff7a55;margin-bottom:34px}
  #vc-card .vc-h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:124px;line-height:1.0;margin:0 0 44px;letter-spacing:-.01em}
  #vc-card .vc-h1 em{color:#ff5a2c;font-style:italic}
  #vc-card .vc-row{display:flex;gap:18px;flex-wrap:wrap;align-items:center;font:400 21px/1.4 'IBM Plex Mono',monospace;color:#b0b4ae}
  #vc-card .vc-row span{border:1px solid #323a37;padding:8px 14px}
  #vc-card .vc-row b{font-weight:500;color:#ebe8e1;margin-left:6px}
  #vc-card .vc-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px 48px;max-width:1150px}
  #vc-card .vc-grid div{border-top:1px solid #323a37;padding-top:16px}
  #vc-card .vc-grid span{display:block;font:500 13px/1 'IBM Plex Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:#868c86;margin-bottom:12px}
  #vc-card .vc-grid b{font:400 27px/1.3 'IBM Plex Sans',sans-serif;color:#ebe8e1}
  #vc-card [data-step]{opacity:0;transform:translateY(14px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.1,1);display:inline-block}
  #vc-card div[data-step]{display:block}
  #vc-card .vc-row[data-step]{display:flex}
  #vc-card [data-step].in{opacity:1;transform:none}
  html{scroll-behavior:auto!important}
  `;
  const init = () => {
    if (document.getElementById('vc-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'vc-cap'; document.body.appendChild(cap);
    const cur = document.createElement('div'); cur.id = 'vc-cur';
    cur.innerHTML = '<div class="ring"></div><svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.2 L18.5 15 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  let capTimer;
  window.__vc = {
    caption(t) {
      init(); return;
      const el = document.getElementById('vc-cap');
      clearTimeout(capTimer);
      el.classList.remove('on');
      if (!t) return;
      capTimer = setTimeout(() => { el.textContent = t; el.classList.add('on'); }, el.textContent ? 200 : 0);
    },
    card(html) {
      init();
      let c = document.getElementById('vc-card');
      if (!c) { c = document.createElement('div'); c.id = 'vc-card'; document.body.appendChild(c); }
      c.innerHTML = html; c.classList.remove('off');
      document.getElementById('vc-cur').style.opacity = '0';
    },
    cardStep(n) { document.querySelectorAll(`#vc-card [data-step="${n}"]`).forEach((e) => e.classList.add('in')); },
    cardHide() { document.getElementById('vc-card')?.classList.add('off'); document.getElementById('vc-cur').style.opacity = '1'; },
    highlight(el) {
      el.style.transition = 'box-shadow .5s ease, background-color .5s ease';
      el.style.boxShadow = '0 0 0 2px #ff5a2c';
      el.style.backgroundColor = 'rgba(255,90,44,.12)';
    },
    pulse() { const r = document.querySelector('#vc-cur .ring'); if (!r) return; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); },
    scrollTo(y, ms) {
      const y0 = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
      y = Math.max(0, Math.min(max, y));
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      return new Promise((res) => {
        const f = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          window.scrollTo(0, y0 + (y - y0) * ease(k));
          if (k < 1) requestAnimationFrame(f); else res();
        };
        requestAnimationFrame(f);
      });
    },
  };
})();
