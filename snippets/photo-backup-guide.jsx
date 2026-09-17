// The approved guide is readable MDX. This wrapper enhances only its own DOM.
// Mintlify injects React hooks; there are no external packages or cross-snippet imports.
export const PhotoGuide = ({ children }) => {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (selector, scope = root) => scope.querySelector(selector);
    const $$ = (selector, scope = root) => Array.from(scope.querySelectorAll(selector));
    const byId = (id) => $('[id="' + id + '"]');
    const abort = new AbortController();
    const listen = (node, event, handler) => node && node.addEventListener(event, handler, { signal: abort.signal });
    const storageKey = 'kombify-photo-guide-v3';
    let current = 0;
    let completed = [false, false, false, false];
    let verified = [false, false, false];
    let toastTimer;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved?.completed) && saved.completed.length === 4) completed = saved.completed.map(Boolean);
      if (Array.isArray(saved?.verified) && saved.verified.length === 3) verified = saved.verified.map(Boolean);
    } catch (_) { /* Storage is optional, including private browsing. */ }
    if (!verified.every(Boolean)) completed[3] = false;
    const save = () => {
      try { localStorage.setItem(storageKey, JSON.stringify({ completed, verified })); } catch (_) {}
    };
    const toast = (text) => {
      const node = $('#kpg-toast');
      node.textContent = text;
      node.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { node.hidden = true; }, 3800);
    };
    const updateProgress = () => {
      $('#kpg-progress-label').textContent = `${completed.filter(Boolean).length} von 4 Schritten abgehakt`;
      $$('.progress-meter span').forEach((node, i) => node.classList.toggle('done', completed[i]));
      $$('.step-tab').forEach((node, i) => {
        node.classList.toggle('done', completed[i]);
        $('.step-dot', node).textContent = completed[i] ? '✓' : String(i + 1);
      });
      $('#kpg-done-message').hidden = !completed[3];
    };
    const selectStep = (index, focus = false) => {
      current = Math.max(0, Math.min(3, index));
      $$('.step-tab').forEach((node, i) => {
        node.setAttribute('aria-selected', String(i === current));
        node.tabIndex = i === current ? 0 : -1;
      });
      $$('.guide-panel').forEach((node, i) => { node.hidden = i !== current; });
      $('#kpg-prev').disabled = current === 0;
      $('#kpg-next span').textContent = current === 3 ? (completed[3] ? 'Weitere Themen' : 'Prüfung abschließen') : 'Erledigt · weiter';
      if (focus) $('[data-step="' + current + '"]').focus();
    };
    $$('[data-step]').forEach((node) => listen(node, 'click', () => selectStep(Number(node.dataset.step))));
    listen($('.step-tabs'), 'keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectStep(event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (current + (event.key === 'ArrowRight' ? 1 : 3)) % 4, true);
    });
    listen($('#kpg-prev'), 'click', () => selectStep(current - 1));
    listen($('#kpg-next'), 'click', () => {
      if (current < 3) {
        completed[current] = true;
        save(); updateProgress(); selectStep(current + 1, true);
      } else if (completed[3]) {
        $('#kpg-mehr').scrollIntoView({ block: 'start' });
        $('.more-card').focus({ preventScroll: true });
      } else if (verified.every(Boolean)) {
        completed[3] = true;
        save(); updateProgress(); selectStep(3);
        toast('Deine Prüfung wurde lokal als erledigt markiert.');
      } else {
        toast('Bitte prüfe zuerst die drei Punkte auf deinem Fotoserver.');
        $('#kpg-verify-' + verified.indexOf(false)).focus();
      }
    });
    $$('.verify-list input').forEach((node, i) => {
      node.checked = verified[i];
      listen(node, 'change', () => {
        verified[i] = node.checked;
        if (!verified.every(Boolean)) completed[3] = false;
        save(); updateProgress(); selectStep(current);
      });
    });
    listen($('#kpg-reset-progress'), 'click', () => {
      completed = [false, false, false, false];
      verified = [false, false, false];
      $$('.verify-list input').forEach((node) => { node.checked = false; });
      save(); updateProgress(); selectStep(0);
      toast('Dein lokaler Fortschritt wurde zurückgesetzt.');
    });
    listen($('#kpg-print'), 'click', () => window.print());
    const openDialog = (id) => {
      const dialog = byId(id);
      if (dialog && !dialog.open) dialog.showModal();
    };
    $$('[data-open]').forEach((node) => listen(node, 'click', (event) => {
      event.preventDefault(); openDialog(node.dataset.open);
    }));
    $$('[data-close]').forEach((node) => listen(node, 'click', () => node.closest('dialog').close()));
    $$('dialog').forEach((dialog) => listen(dialog, 'click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }));
    $$('[data-zoom]').forEach((node) => listen(node, 'click', () => {
      const image = $('img', node.closest('figure'));
      $('#kpg-zoom-image').src = image.currentSrc || image.src;
      $('#kpg-zoom-image').alt = image.alt;
      $('#kpg-zoom-source').href = image.src;
      openDialog('kpg-zoom-dialog');
    }));
    $$('[data-reveal]').forEach((node) => listen(node, 'click', () => {
      const details = byId(node.dataset.reveal);
      if (details) details.open = true;
    }));
    const checkImage = (image) => image.closest('.screen-figure').classList.toggle('image-unavailable', !image.complete || !image.naturalWidth);
    $$('.screen-image > img').forEach((image) => {
      listen(image, 'load', () => checkImage(image));
      listen(image, 'error', () => checkImage(image));
      if (image.complete) checkImage(image);
    });
    const imageTimer = setTimeout(() => $$('.screen-image > img').forEach(checkImage), 7000);
    updateProgress(); selectStep(0);
    return () => {
      abort.abort();
      clearTimeout(toastTimer); clearTimeout(imageTimer);
      $$('dialog[open]').forEach((dialog) => dialog.close());
    };
  }, []);
  return <div className="kombify-photo-guide not-prose" lang="de" ref={rootRef}>{children}</div>;
};
export const PhotoGuideIcon = ({ name }) => {
  const icons = {
    icon0: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><rect height="20" rx="3" width="12" x="6" y="2"></rect><path d="M10 5h4M11 19h2"></path></svg>),
    icon1: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><rect height="7" rx="1.5" width="7" x="3" y="3"></rect><rect height="7" rx="1.5" width="7" x="14" y="3"></rect><rect height="7" rx="1.5" width="7" x="3" y="14"></rect><rect height="7" rx="1.5" width="7" x="14" y="14"></rect></svg>),
    icon2: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1Z"></path></svg>),
    icon3: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6Z"></path><path d="M17 11h.01"></path></svg>),
    icon4: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>),
    icon5: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>),
    icon6: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6L10 14"></path><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"></path></svg>),
    icon7: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M16.7 1.8c0 2.1-1.7 4.4-3.7 4.2-.4-2.1 1.8-4.3 3.7-4.2ZM20.4 17.3c-.5 1.2-.8 1.7-1.5 2.7-1 1.5-2.4 3.3-4.2 3.3-1.6 0-2-1-4.1-.9-2.1 0-2.5 1-4.2.9-1.8-.1-3.1-1.7-4.1-3.2C-.5 15.9-.7 10.4 1 7.6c1.2-2 3.1-3.1 4.9-3.1 1.9 0 3.1 1 4.7 1 1.5 0 2.5-1 4.7-1 1.6 0 3.3.9 4.5 2.3-4 2.2-3.3 8 0 10.5Z" fill="currentColor" stroke="none" transform="translate(2 0) scale(.87)"></path></svg>),
    icon8: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 14 0v6H5Zm2-6L5 3m12 3 2-3M2 12v5m20-5v5M8 18v4m8-4v4"></path><path d="M8.5 9h.01M15.5 9h.01"></path></svg>),
    icon9: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><rect height="7" rx="2" width="18" x="3" y="3"></rect><rect height="7" rx="2" width="18" x="3" y="14"></rect><path d="M7 6.5h.01M7 17.5h.01M16 6.5h2M16 17.5h2"></path></svg>),
    icon10: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 7h.01"></path></svg>),
    icon11: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path></svg>),
    icon12: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3Z"></path><circle cx="12" cy="13" r="4"></circle></svg>),
    icon13: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5M7 10.5h7M10.5 7v7"></path></svg>),
    icon14: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"></path></svg>),
    icon15: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="3"></rect><path d="M8 22h8M12 17v5"></path></svg>),
    icon16: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"></path></svg>),
    icon17: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z"></path><path d="m8 12 3 3 5-6"></path></svg>),
    icon18: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"></path></svg>),
    icon19: (<svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"></path></svg>),
  };
  return icons[name] || null;
};
// Mintlify replaces block-level HTML elements outside its component allowlist with a
// comment. These pass-throughs render the same element, so the guide keeps its markup.
// The tag lives in a variable so MDX does not route it through Mintlify's component
// overrides (figure, for example, would gain an image-zoom wrapper).
export const PhotoGuideArticle = ({ children, ...props }) => { const Tag = "article"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideAside = ({ children, ...props }) => { const Tag = "aside"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideDetails = ({ children, ...props }) => { const Tag = "details"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideDialog = ({ children, ...props }) => { const Tag = "dialog"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideFigcaption = ({ children, ...props }) => { const Tag = "figcaption"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideFigure = ({ children, ...props }) => { const Tag = "figure"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideFooter = ({ children, ...props }) => { const Tag = "footer"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideStrong = ({ children, ...props }) => { const Tag = "strong"; return <Tag {...props}>{children}</Tag>; };
export const PhotoGuideSummary = ({ children, ...props }) => { const Tag = "summary"; return <Tag {...props}>{children}</Tag>; };
