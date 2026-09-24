// Setup guides for non-technical readers. The guide text is readable MDX in the
// page body, so Mintlify renders and indexes it; these components add the frame
// and enhance their own DOM (tabs, progress, zoom, print). Authoring rules:
// docs-guidelines/client-setup-guides.md; styles: /client-setup-guide.css.
// Mintlify injects React hooks; snippets allow no external packages or cross-snippet imports.
// The components' own UI strings are English; a localized page needs a labels prop first.

// Mintlify copies each imported export into the page on its own, so every
// helper below is exported and the page imports it too (see the standard's
// import template). Tags live in local variables so MDX does not route them
// through Mintlify's component overrides (figure, img and a gain wrappers otherwise).

export const kcgIcon = (name) => {
  const paths = {
    apple: <path d="M16.7 1.8c0 2.1-1.7 4.4-3.7 4.2-.4-2.1 1.8-4.3 3.7-4.2ZM20.4 17.3c-.5 1.2-.8 1.7-1.5 2.7-1 1.5-2.4 3.3-4.2 3.3-1.6 0-2-1-4.1-.9-2.1 0-2.5 1-4.2.9-1.8-.1-3.1-1.7-4.1-3.2C-.5 15.9-.7 10.4 1 7.6c1.2-2 3.1-3.1 4.9-3.1 1.9 0 3.1 1 4.7 1 1.5 0 2.5-1 4.7-1 1.6 0 3.3.9 4.5 2.3-4 2.2-3.3 8 0 10.5Z" fill="currentColor" stroke="none" transform="translate(2 0) scale(.87)" />,
    android: <><path d="M5 12a7 7 0 0 1 14 0v6H5Zm2-6L5 3m12 3 2-3M2 12v5m20-5v5M8 18v4m8-4v4" /><path d="M8.5 9h.01M15.5 9h.01" /></>,
    browser: <><rect height="16" rx="2" width="20" x="2" y="4" /><path d="M2 9h20M6 6.5h.01M9 6.5h.01" /></>,
    desktop: <><rect height="14" rx="2" width="20" x="2" y="3" /><path d="M8 22h8M12 17v5" /></>,
    web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    server: <><rect height="7" rx="2" width="18" x="3" y="3" /><rect height="7" rx="2" width="18" x="3" y="14" /><path d="M7 6.5h.01M7 17.5h.01M16 6.5h2M16 17.5h2" /></>,
    phone: <><rect height="20" rx="3" width="12" x="6" y="2" /><path d="M10 5h4M11 19h2" /></>,
    steps: <><rect height="7" rx="1.5" width="7" x="3" y="3" /><rect height="7" rx="1.5" width="7" x="14" y="3" /><rect height="7" rx="1.5" width="7" x="3" y="14" /><rect height="7" rx="1.5" width="7" x="14" y="14" /></>,
    book: <path d="M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1Z" />,
    print: <><path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6Z" /><path d="M17 11h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    back: <path d="m15 5-7 7 7 7" />,
    external: <><path d="M14 4h6v6m0-6L10 14" /><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7h.01" /></>,
    ok: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z" /><circle cx="12" cy="13" r="4" /></>,
    zoom: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M7 10.5h7M10.5 7v7" /></>,
    shield: <><path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z" /><path d="m8 12 3 3 5-6" /></>,
    spark: <path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z" />,
    wifi: <path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">{paths[name] || paths.info}</svg>;
};
export const kcgExternal = (href) => /^https:\/\//.test(href || '');
export const kcgNewTab = <><span className="sr-only"> (opens in a new tab)</span></>;
export const kcgList = (children) => [].concat(children).flat(Infinity).filter((child) => child && child.props);
// Mintlify wraps every MDX component in an error boundary element ({ name, children }); read the inner props.
export const kcgProps = (child) => {
  const inner = child && child.props && child.props.name && child.props.children;
  return inner && inner.props && !Array.isArray(inner) ? inner.props : (child && child.props) || {};
};

// Root frame: print button, zoom dialog, external-link attributes, print expansion, reset.
export const ClientSetupGuide = ({ id, children }) => {
  const Dialog = 'dialog', Img = 'img';
  const rootRef = useRef(null);
  const zoomRef = useRef(null);
  const [zoom, setZoom] = useState(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    // Markdown links in the guide body open vendor pages in a new tab, announced to screen readers.
    root.querySelectorAll('a[href^="https://"]:not([data-kcg-ext])').forEach((link) => {
      link.setAttribute('data-kcg-ext', '');
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      const hint = document.createElement('span');
      hint.className = 'sr-only';
      hint.textContent = ' (opens in a new tab)';
      link.appendChild(hint);
    });
    const openAll = () => root.querySelectorAll('details').forEach((node) => { node.open = true; });
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);
  const onClick = (event) => {
    const zoomButton = event.target.closest('[data-kcg-zoom]');
    if (zoomButton) {
      setZoom(JSON.parse(zoomButton.getAttribute('data-kcg-zoom')));
      if (zoomRef.current && !zoomRef.current.open) zoomRef.current.showModal();
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (link) {
      zoomRef.current?.close();
      const target = rootRef.current?.querySelector(`[id="${link.getAttribute('href').slice(1)}"]`);
      const details = target && (target.tagName === 'DETAILS' ? target : target.querySelector('details'));
      if (details) details.open = true;
      return;
    }
    if (event.target.closest('[data-kcg-reset]')) window.dispatchEvent(new CustomEvent('kcg-reset', { detail: id }));
  };
  const closeOnBackdrop = (event) => {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  };
  return (
    <div className="kombify-client-guide not-prose" id={id} lang="en" onClick={onClick} ref={rootRef}>
      <div className="guide-content">{children}</div>
      <Dialog aria-labelledby={`${id}-zoom-title`} className="zoom-dialog" onClick={closeOnBackdrop} ref={zoomRef}>
        <div className="dialog-header">
          <h2 id={`${id}-zoom-title`}>{zoom?.vendor ? 'Vendor screenshot' : 'Screenshot'}</h2>
          <button aria-label="Close image" className="dialog-close" onClick={() => zoomRef.current?.close()} type="button">{kcgIcon('close')}</button>
        </div>
        <div className="zoom-content">{zoom ? <Img alt={zoom.alt} src={zoom.src} /> : null}</div>
      </Dialog>
    </div>
  );
};

export const GuideMeta = ({ items = [] }) => (
  <div className="page-top">
    <div className="intro-meta">{items.map((item, i) => <span key={i}>{kcgIcon(item.icon)} {item.text}</span>)}</div>
    <div className="page-tools"><button aria-label="Print guide" className="tool-button" onClick={() => window.print()} type="button">{kcgIcon('print')}</button></div>
  </div>
);

export const GuideNeeds = ({ helpHref, helpLabel, children }) => {
  const Anchor = 'a';
  return (
  <div className="ready-strip">
    <strong>What you need</strong>
    {kcgList(children).map((child, i) => <span key={i}>{kcgIcon('check')} {kcgProps(child).children}</span>)}
    {helpHref ? <Anchor href={helpHref}>{helpLabel} {kcgIcon('arrow')}</Anchor> : null}
  </div>
);
};
export const GuideNeed = ({ children }) => <span>{children}</span>;

export const GuideApps = ({ id, title = 'First, get the app.', vendorHref, vendorLabel, children }) => {
  const Anchor = 'a';
  return (
  <section aria-labelledby={`${id}-title`} className="downloads" id={id}>
    <div className="section-top">
      <h2 id={`${id}-title`}>{title}</h2>
      {vendorHref ? <Anchor className="small-link" href={vendorHref} rel="noopener noreferrer" target="_blank">{vendorLabel} {kcgIcon('external')}{kcgNewTab}</Anchor> : null}
    </div>
    <div className="downloads-grid">{children}</div>
  </section>
);
};
// official: made by the vendor. Third-party apps get a visible badge.
export const GuideApp = ({ platform, label, detail, store, href, vendor, official }) => {
  const Anchor = 'a';
  return (
  <Anchor className="download-card" href={href} rel="noopener noreferrer" target="_blank">
    <span className="platform-icon">{kcgIcon(platform)}</span>
    <span className="download-text">
      <strong>{label}</strong>
      <small>{detail}</small>
      <span className="store-name">{store} {kcgIcon('external')}</span>
      <span className={`badge ${official ? 'official' : 'unofficial'}`}>{official ? `Official · ${vendor}` : `Third-party · ${vendor}`}</span>
    </span>
    {kcgNewTab}
  </Anchor>
);
};
export const GuideHint = ({ children }) => <div className="download-hint">{children}</div>;

// Step container: tabs, one visible step, progress kept in this browser.
export const GuideSteps = ({ id, title = 'Connect step by step.', provenance, sourcesHref, children }) => {
  const Article = 'article', Anchor = 'a';
  const steps = kcgList(children).filter((child) => kcgProps(child).tab);
  const count = steps.length;
  const last = count - 1;
  const storageKey = `kombify-client-guide:${id}:v2`;
  const boxRef = useRef(null);
  const focusTab = useRef(false);
  const toastTimer = useRef(null);
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState(() => steps.map(() => false));
  const [toast, setToast] = useState('');

  const ticks = (index) => Array.from(boxRef.current?.querySelectorAll(`[id="${id}-panel-${index}"] input[data-kcg-tick]`) || []);
  const persist = (nextCompleted) => {
    const verified = steps.map((_, i) => ticks(i).map((input) => input.checked));
    try { localStorage.setItem(storageKey, JSON.stringify({ completed: nextCompleted, verified })); } catch (_) { /* storage is optional */ }
  };
  const say = (text) => {
    setToast('');
    clearTimeout(toastTimer.current);
    setTimeout(() => setToast(text), 60);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && Array.isArray(saved.completed) && saved.completed.length === count) setCompleted(saved.completed.map(Boolean));
      if (saved && Array.isArray(saved.verified)) saved.verified.forEach((list, i) => ticks(i).forEach((input, j) => { input.checked = Boolean(list && list[j]); }));
    } catch (_) { /* storage is optional, including private browsing */ }
    const onReset = (event) => {
      if (event.detail !== undefined && boxRef.current && !boxRef.current.closest(`[id="${event.detail}"]`)) return;
      boxRef.current?.querySelectorAll('input[data-kcg-tick]').forEach((input) => { input.checked = false; });
      const cleared = steps.map(() => false);
      setCompleted(cleared);
      setCurrent(0);
      try { localStorage.removeItem(storageKey); } catch (_) { /* storage is optional */ }
      say('Your progress in this browser was reset.');
    };
    window.addEventListener('kcg-reset', onReset);
    return () => { window.removeEventListener('kcg-reset', onReset); clearTimeout(toastTimer.current); };
  }, []);

  // Move focus after React committed the new tab (ARIA tabs pattern).
  useEffect(() => {
    if (!focusTab.current) return;
    focusTab.current = false;
    boxRef.current?.querySelector(`[id="${id}-tab-${current}"]`)?.focus();
  }, [current]);

  if (!count) return <div className="guide-section">{children}</div>;

  const go = (index, focus) => { focusTab.current = Boolean(focus); setCurrent(Math.max(0, Math.min(last, index))); };
  const onTabKey = (event) => {
    const moves = { ArrowRight: (c) => (c + 1) % count, ArrowLeft: (c) => (c - 1 + count) % count, Home: () => 0, End: () => last };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusTab.current = true;
    // Functional update: fast repeated key presses must not read a stale step.
    setCurrent(move);
  };
  const onNext = () => {
    const open = ticks(current).filter((input) => input.checked === false);
    if (open.length) {
      say('Tick each point after you checked it yourself.');
      open[0].focus();
      return;
    }
    const nextCompleted = completed.map((done, i) => (i === current ? true : done));
    setCompleted(nextCompleted);
    persist(nextCompleted);
    if (current < last) go(current + 1, true);
    else {
      const done = nextCompleted.filter(Boolean).length;
      say(done === count ? 'All steps are marked as done in this browser.' : `${done} of ${count} steps are marked as done. Open the other tabs to finish them.`);
    }
  };
  const onTick = (event) => {
    if (!event.target.matches || !event.target.matches('input[data-kcg-tick]')) return;
    const nextCompleted = completed.map((done, i) => (i === current && !event.target.checked ? false : done));
    setCompleted(nextCompleted);
    persist(nextCompleted);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="guide-section" id={id} ref={boxRef}>
      <div className="guide-heading"><h2 id={`${id}-title`}>{title}</h2></div>
      <div className="wizard" style={{ '--kcg-steps': count }}>
        <div aria-label="Setup steps" className="step-tabs" onKeyDown={onTabKey} role="tablist">
          {steps.map((step, i) => (
            <button aria-controls={`${id}-panel-${i}`} aria-selected={i === current} className={`step-tab${completed[i] ? ' done' : ''}`} id={`${id}-tab-${i}`} key={i} onClick={() => go(i)} role="tab" tabIndex={i === current ? 0 : -1} type="button">
              <span className="step-dot">{completed[i] ? '✓' : i + 1}</span><span>{kcgProps(step).tab}</span>
            </button>
          ))}
        </div>
        {steps.map((step, i) => (
          <Article aria-labelledby={`${id}-tab-${i}`} className={`guide-panel${i === current ? ' active' : ''}`} id={`${id}-panel-${i}`} key={i} onChange={onTick} role="tabpanel">
            <div aria-hidden="true" className="step-kicker">STEP {String(i + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</div>
            {step}
          </Article>
        ))}
        <div className="wizard-bottom">
          <div className="progress-note">
            <span>{completed.filter(Boolean).length} of {count} steps done</span>
            <div aria-hidden="true" className="progress-meter">{steps.map((_, i) => <span className={completed[i] ? 'done' : undefined} key={i} />)}</div>
          </div>
          <button className="prev" disabled={current === 0} onClick={() => go(current - 1, true)} type="button">{kcgIcon('back')} Back</button>
          <button className="next" onClick={onNext} type="button"><span>{current === last ? 'Finish' : 'Done · next'}</span>{kcgIcon('arrow')}</button>
        </div>
      </div>
      {provenance ? <p className="provenance-inline">{provenance} {sourcesHref ? <Anchor href={sourcesHref}>Image sources and date</Anchor> : null}</p> : null}
      <div aria-live="polite" className="sr-only" role="status">{toast}</div>
      <div aria-hidden="true" className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </section>
  );
};

// A step visual is a GuideShot or GuideLinks child; both carry a kcgVisual marker prop by default.
export const kcgIsVisual = (child) => { const p = kcgProps(child); return Boolean(p.src || p.links || p.kcgVisual); };

// One step: MDX body on the left (### title, intro, numbered clicks, notes),
// one GuideShot or GuideLinks child on the right.
export const GuideStep = ({ children }) => {
  const all = [].concat(children).flat(Infinity);
  const visual = all.find(kcgIsVisual);
  return (
    <>
      <div className="panel-copy">{all.filter((child) => !kcgIsVisual(child))}</div>
      <div className="panel-visual">{visual || null}</div>
    </>
  );
};

export const UI = ({ children }) => <span className="key">{children}</span>;
export const GuideNote = ({ icon = 'info', children }) => <div className="micro-note">{kcgIcon(icon)}<div>{children}</div></div>;
export const GuideCheck = ({ children }) => <div className="step-check">{kcgIcon('ok')} <div>{children}</div></div>;
export const GuideFaq = ({ id, q, children }) => {
  const Details = 'details', Summary = 'summary';
  return (
  <Details id={id}><Summary>{q}</Summary><div className="answer">{children}</div></Details>
);
};
export const GuideTicks = ({ children }) => <div className="verify-list">{children}</div>;
export const GuideTick = ({ children }) => <label><input data-kcg-tick="" type="checkbox" /><span>{children}</span></label>;

// Screenshot with annotation rings. Vendor images never get markers (licenses may forbid changes).
export const GuideShot = ({ src, srcDark, alt, width, height, caption, credit, creditHref, version, captured, annotations = [], vendor, frame }) => {
  const Anchor = 'a', Figure = 'figure', Figcaption = 'figcaption', Img = 'img';
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);
  useEffect(() => {
    const image = imgRef.current;
    if (image && image.complete && !image.naturalWidth) setFailed(true);
  }, []);
  return (
    <>
      <span className="screenshot-tag">{kcgIcon('camera')} {vendor ? 'VENDOR SCREENSHOT' : 'KOMBIFY SCREENSHOT'}</span>
      <Figure className={`screen-figure${frame === 'phone' ? ' phone' : ''}${failed ? ' image-unavailable' : ''}`}>
        <div className="screen-image">
          <Img alt={alt} className={srcDark ? 'only-light has-dark' : undefined} decoding="async" height={height} loading="lazy" onError={() => setFailed(true)} ref={imgRef} src={src} width={width} />
          {srcDark ? <Img alt={alt} className="only-dark" decoding="async" height={height} loading="lazy" src={srcDark} width={width} /> : null}
          {(vendor ? [] : annotations).map((mark, i) => <span aria-hidden="true" className="annotation" data-n={mark.n === null ? undefined : mark.n} key={i} style={{ top: `${mark.top}%`, left: `${mark.left}%`, width: `${mark.width}%`, height: `${mark.height}%` }} />)}
          <Anchor className="image-fallback" href={vendor && creditHref ? creditHref : src} rel="noopener noreferrer" target="_blank">{kcgIcon('external')} {vendor ? 'Open the vendor page' : 'Open the screenshot'}<span>The image did not load.</span></Anchor>
          <button aria-label={`Enlarge screenshot: ${alt}`} className="zoom-button" data-kcg-zoom={JSON.stringify({ src, alt, vendor: Boolean(vendor) })} type="button">{kcgIcon('zoom')}</button>
        </div>
        <Figcaption>
          {caption}{credit ? <> · {creditHref ? <Anchor href={creditHref}>{credit}</Anchor> : credit}</> : null}
          {version || captured ? <span className="meta">{[version, captured ? `captured ${captured}` : null].filter(Boolean).join(' · ')}</span> : null}
        </Figcaption>
      </Figure>
    </>
  );
};

// Link card for screens we may not show (vendor terms) or cannot capture.
export const GuideLinks = ({ tag = 'VENDOR GUIDE', title, text, links = [] }) => {
  const Anchor = 'a';
  return (
  <>
    <span className="screenshot-tag">{kcgIcon('external')} {tag}</span>
    <div className="link-visual">
      {title ? <strong>{title}</strong> : null}
      {text ? <p>{text}</p> : null}
      {links.map((item, i) => (
        <Anchor className="vendor-link" href={item.href} key={i} rel="noopener noreferrer" target="_blank">
          {kcgIcon(item.icon || 'book')}<span>{item.label}{item.detail ? <small>{item.detail}</small> : null}</span>{kcgIcon('external')}{kcgNewTab}
        </Anchor>
      ))}
    </div>
  </>
);
};

export const GuideWarning = ({ title, children }) => {
  const Aside = 'aside';
  return (
  <Aside className="warning">{kcgIcon('shield')}<div><strong>{title}</strong><div>{children}</div></div></Aside>
);
};

export const GuideNext = ({ id, title = 'What comes next.', children }) => (
  <section aria-labelledby={`${id}-title`} className="more-section" id={id}>
    <div className="section-top"><h2 id={`${id}-title`}>{title}</h2></div>
    <div className="more-grid">{children}</div>
  </section>
);
export const GuideNextCard = ({ href, icon = 'arrow', title, children }) => {
  const Anchor = 'a';
  return (
  <Anchor className="more-card" href={href} rel={kcgExternal(href) ? 'noopener noreferrer' : undefined} target={kcgExternal(href) ? '_blank' : undefined}>
    <span className="more-icon">{kcgIcon(icon)}</span>
    <span><strong>{title}</strong><small>{children}</small></span>
    {kcgIcon(kcgExternal(href) ? 'external' : 'arrow')}
    {kcgExternal(href) ? kcgNewTab : null}
  </Anchor>
);
};

export const GuideHelp = ({ id, title = 'Stuck?', children }) => (
  <section aria-labelledby={`${id}-title`} className="faq-section" id={id}>
    <h2 id={`${id}-title`}>{title}</h2>
    {children}
  </section>
);

export const GuideFooter = ({ children }) => {
  const Footer = 'footer';
  return (
  <Footer className="footline">
    <div className="attribution">{children}</div>
    <button className="reset" data-kcg-reset="" type="button">Reset progress</button>
  </Footer>
);
};

export const GuideSources = ({ id, children }) => {
  const Details = 'details', Summary = 'summary';
  return (
  <section className="source-section" id={id}>
    <Details><Summary>Image sources, checked links and date</Summary><div className="source-content">{children}</div></Details>
    <div className="dim">Guide by kombify · Product names, screenshots of vendor apps and trademarks belong to their respective owners.</div>
  </section>
);
};
