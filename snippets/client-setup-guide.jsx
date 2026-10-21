// Native MDX is the source of every instruction, caption and verification label.
// This null-rendering component enhances only the guide with the matching id.
// Mintlify injects React hooks; no external packages or cross-snippet imports.
export const ClientSetupGuide = ({ id, labels, locale = 'en', checks = [] }) => {
  useEffect(() => {
    const root = document.getElementById(id);
    if (!root) return;
    const $ = (selector, scope = root) => scope.querySelector(selector);
    const $$ = (selector, scope = root) => Array.from(scope.querySelectorAll(selector));
    const panels = $$('.guide-panel');
    const tabs = $$('.step-tab');
    const count = panels.length;
    const last = count - 1;
    const number = new Intl.NumberFormat(locale);
    const message = (key, values = {}) => labels[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
    const storageKey = `kombify-client-guide:${id}:v1`;
    const abort = new AbortController();
    const listen = (node, event, handler, options = {}) => node?.addEventListener(event, handler, { ...options, signal: abort.signal });
    const dialog = $('.zoom-dialog');
    let current = 0;
    let completed = panels.map(() => false);
    let verified = panels.map((_, i) => Array(checks[i] || 0).fill(false));
    let toastTimer;
    let announceTimer;
    let hashFrame;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved?.completed) && saved.completed.length === count) completed = saved.completed.map(Boolean);
      if (Array.isArray(saved?.verified) && saved.verified.length === count) verified = verified.map((list, i) => list.map((_, j) => Boolean(saved.verified[i]?.[j])));
    } catch (_) { /* Storage is optional, including private browsing. */ }
    // A verification step cannot stay completed after a check is removed.
    completed = completed.map((done, i) => done && verified[i].every(Boolean));
    const persist = () => {
      try { localStorage.setItem(storageKey, JSON.stringify({ completed, verified })); } catch (_) {}
    };
    const say = (text) => {
      const live = $('[role="status"]');
      const toast = $('.toast');
      live.textContent = '';
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { live.textContent = text; }, 60);
      toast.textContent = text;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3800);
    };
    const updateProgress = () => {
      $('.progress-note > span').textContent = message('progress', { done: number.format(completed.filter(Boolean).length), count: number.format(count) });
      $$('.progress-meter span').forEach((node, i) => node.classList.toggle('done', completed[i]));
      tabs.forEach((node, i) => {
        node.classList.toggle('done', completed[i]);
        $('.step-dot', node).textContent = completed[i] ? '✓' : number.format(i + 1);
      });
      $$('input[data-guide-check]').forEach((input) => {
        input.checked = Boolean(verified[Number(input.dataset.guideStep)]?.[Number(input.dataset.guideCheck)]);
      });
    };
    const select = (index, focus = false) => {
      current = Math.max(0, Math.min(last, index));
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === current));
        tab.tabIndex = i === current ? 0 : -1;
      });
      panels.forEach((panel, i) => panel.classList.toggle('active', i === current));
      $('.prev').disabled = current === 0;
      $('.next > span').textContent = current === last ? labels.finish : labels.next;
      if (focus) tabs[current].focus();
    };
    const reveal = (hash, scroll = true) => {
      let targetId;
      try { targetId = decodeURIComponent(hash.replace(/^#/, '')); } catch (_) { return; }
      const target = document.getElementById(targetId);
      if (!target || !root.contains(target)) return;
      const disclosure = target.closest('[data-guide-disclosure]') || target.querySelector('[data-guide-disclosure]');
      if (disclosure) { disclosure.classList.remove('collapsed'); $('.disclosure-title', disclosure).setAttribute('aria-expanded', 'true'); }
      const panel = target.closest('.guide-panel');
      if (panel) select(panels.indexOf(panel));
      // Disclosures are optional; native prose remains readable without JS.
      for (let node = target; node && node !== root; node = node.parentElement) {
        if (node.tagName === 'DETAILS') node.open = true;
      }
      if (scroll) {
        cancelAnimationFrame(hashFrame);
        hashFrame = requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    };
    const followHash = () => {
      if (window.location.hash) reveal(window.location.hash);
      else select(0);
    };
    const next = () => {
      const missing = verified[current].indexOf(false);
      if (missing !== -1) {
        say(labels.verifyRequired);
        $(`input[data-guide-step="${current}"][data-guide-check="${missing}"]`)?.focus();
        return;
      }
      completed[current] = true;
      persist(); updateProgress();
      if (current < last) select(current + 1, true);
      else {
        const done = completed.filter(Boolean).length;
        say(done === count ? labels.allDone : message('remainingSteps', { done: number.format(done), count: number.format(count) }));
        $(`[id="${id}-more"], [id="${id}-help"]`)?.scrollIntoView({ block: 'start' });
      }
    };
    const openZoom = (button) => {
      const figure = button.closest('.screen-figure');
      const image = $('.screen-image > img', figure);
      const content = $('.zoom-content', dialog);
      const enlarged = document.createElement('img');
      enlarged.src = image.currentSrc || image.src;
      enlarged.alt = image.alt;
      content.replaceChildren(enlarged);
      const fallback = $('.image-fallback', figure);
      if (fallback) {
        const link = document.createElement('a');
        link.href = fallback.href;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = `${labels.openScreenshot} · ${labels.opensInNewTab}`;
        content.append(link);
      }
      if (!dialog.open) dialog.showModal();
    };
    listen(root, 'click', (event) => {
      const button = event.target.closest('button');
      if (button && root.contains(button)) {
        if (button.matches('.step-tab')) select(Number(button.dataset.guideTab));
        else if (button.matches('.next')) next();
        else if (button.matches('.prev')) select(current - 1, true);
        else if (button.matches('.reset')) {
          completed = panels.map(() => false);
          verified = panels.map((_, i) => Array(checks[i] || 0).fill(false));
          persist(); updateProgress(); select(0);
          say(labels.progressReset);
        } else if (button.dataset.guideAction === 'print') window.print();
        else if (button.dataset.guideAction === 'zoom') openZoom(button);
        else if (button.matches('.dialog-close')) dialog.close();
        else if (button.matches('.disclosure-title')) {
          const disclosure = button.closest('[data-guide-disclosure]');
          const collapsed = disclosure.classList.toggle('collapsed');
          button.setAttribute('aria-expanded', String(!collapsed));
        }
      }
      const anchor = event.target.closest('a[href^="#"]');
      if (anchor && root.contains(anchor)) { dialog?.close(); reveal(anchor.hash); }
    });
    listen(root, 'change', (event) => {
      const input = event.target;
      if (!input.matches('input[data-guide-check]')) return;
      const step = Number(input.dataset.guideStep);
      verified[step][Number(input.dataset.guideCheck)] = input.checked;
      if (!input.checked) completed[step] = false;
      persist(); updateProgress();
    });
    listen($('.step-tabs'), 'keydown', (event) => {
      const moves = { ArrowRight: (current + 1) % count, ArrowLeft: (current - 1 + count) % count, Home: 0, End: last };
      if (moves[event.key] === undefined) return;
      event.preventDefault(); select(moves[event.key], true);
    });
    listen(dialog, 'click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    const markBroken = (image) => image.closest('.screen-figure')?.classList.add('image-unavailable');
    listen(root, 'error', (event) => {
      if (event.target.matches('.screen-image > img')) markBroken(event.target);
    }, { capture: true });
    $$('.screen-image > img').forEach((image) => { if (image.complete && !image.naturalWidth) markBroken(image); });
    // Mint search and the TOC can handle same-page anchors without a native
    // hashchange. Observe their real link clicks as well, including repeat links.
    listen(document, 'click', (event) => {
      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.hash) reveal(url.hash);
    }, { capture: true });
    listen(window, 'hashchange', followHash);
    listen(window, 'popstate', followHash);
    $$('[data-guide-disclosure]').forEach((node, i) => {
      const button = $('.disclosure-title', node);
      const answer = $('.answer, .source-content', node);
      answer.id = `${id}-disclosure-${i}`;
      button.setAttribute('aria-controls', answer.id);
      button.setAttribute('aria-expanded', 'false');
      node.classList.add('collapsed');
    });
    updateProgress(); select(0);
    root.classList.add('guide-enhanced');
    // Initial links from Mint search/TOC must reveal their native heading too.
    followHash();
    return () => {
      abort.abort(); clearTimeout(toastTimer); clearTimeout(announceTimer);
      cancelAnimationFrame(hashFrame); dialog?.close(); root.classList.remove('guide-enhanced');
    };
  }, [id, labels, locale]);
  return null;
};

// Mintlify's native HTML allowlist omits dialog. This empty UI shell contains
// no guide prose; its children are only the zoom heading and close control.
export const ClientGuideDialog = ({ children, ...props }) => {
  const Dialog = 'dialog';
  return <Dialog {...props}>{children}</Dialog>;
};
