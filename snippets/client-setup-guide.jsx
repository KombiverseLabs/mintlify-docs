// Data-driven setup guide for non-technical readers. The authoring rules live in
// docs-guidelines/client-setup-guides.md; styles in /client-setup-guide.css.
// Mintlify injects React hooks; snippets allow no external packages or cross-snippet imports.
//
// Text props accept a small markup: [[UI label]] for an on-screen label,
// **bold**, and [link text](https://...). External links open in a new tab.
export const ClientSetupGuide = ({
  id,
  meta = [],
  requirements = [],
  requirementsHelp,
  appsTitle = 'First, get the app.',
  vendor,
  apps = [],
  appsNote,
  stepsTitle = 'Connect step by step.',
  steps = [],
  help = [],
  helpTitle = 'Stuck?',
  next = [],
  nextTitle = 'What comes next.',
  attribution,
  sources,
}) => {
  // Tags live in variables so MDX does not route them through Mintlify's
  // component overrides (figure, img and a gain wrappers otherwise).
  const Anchor = 'a', Article = 'article', Details = 'details', Dialog = 'dialog', Figcaption = 'figcaption', Figure = 'figure', Footer = 'footer', Img = 'img', Summary = 'summary';
  const count = steps.length;
  const last = count - 1;
  const storageKey = `kombify-client-guide:${id}:v1`;
  const rootRef = useRef(null);
  const zoomRef = useRef(null);
  const toastTimer = useRef(null);
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState(() => steps.map(() => false));
  const [verified, setVerified] = useState(() => steps.map((step) => (step.verify || []).map(() => false)));
  const [failed, setFailed] = useState({});
  const [zoom, setZoom] = useState(null);
  const [toast, setToast] = useState('');

  const isExternal = (href) => /^https?:\/\//.test(href || '');
  const icon = (name) => {
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
      clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
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
      close: <path d="m6 6 12 12M6 18 18 6" />,
    };
    return <svg aria-hidden="true" className="ico" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">{paths[name] || paths.info}</svg>;
  };
  const link = (href, children, className, key) => (isExternal(href)
    ? <Anchor className={className || ''} href={href} key={key} rel="noopener noreferrer" target="_blank">{children} {icon('external')}<span className="sr-only"> (opens in a new tab)</span></Anchor>
    : <Anchor className={className || ''} href={href} key={key}>{children}</Anchor>);
  const rich = (text) => {
    if (!text || !text.split) return text;
    return text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
      if (part.startsWith('[[')) return <span className="key" key={i}>{part.slice(2, -2)}</span>;
      if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (match) return link(match[2], match[1], undefined, i);
      return part;
    });
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved?.completed) && saved.completed.length === count) setCompleted(saved.completed.map(Boolean));
      if (Array.isArray(saved?.verified) && saved.verified.length === count) setVerified(saved.verified.map((list, i) => (steps[i].verify || []).map((_, j) => Boolean(list?.[j]))));
    } catch (_) { /* Storage is optional, including private browsing. */ }
    // Images that failed before hydration never fire onError; check them once.
    const root = rootRef.current;
    const timer = setTimeout(() => {
      if (!root) return;
      const broken = {};
      root.querySelectorAll('.screen-image > img').forEach((image) => { if (image.complete && !image.naturalWidth) broken[image.getAttribute('src')] = true; });
      if (Object.keys(broken).length) setFailed((old) => ({ ...old, ...broken }));
    }, 7000);
    return () => { clearTimeout(timer); clearTimeout(toastTimer.current); };
  }, []);

  const persist = (nextCompleted, nextVerified) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ completed: nextCompleted, verified: nextVerified })); } catch (_) {}
  };
  const say = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3800);
  };
  const select = (index, focus) => {
    const target = Math.max(0, Math.min(last, index));
    setCurrent(target);
    if (focus) setTimeout(() => rootRef.current?.querySelector(`[id="${id}-tab-${target}"]`)?.focus(), 0);
  };
  const markDone = (index) => {
    const nextCompleted = completed.map((done, i) => (i === index ? true : done));
    setCompleted(nextCompleted);
    persist(nextCompleted, verified);
  };
  const onNext = () => {
    const checks = verified[current] || [];
    if (checks.length && !checks.every(Boolean)) {
      say('Tick each point after you checked it yourself.');
      rootRef.current?.querySelector(`#${id}-verify-${current}-${checks.indexOf(false)}`)?.focus();
      return;
    }
    markDone(current);
    if (current < last) select(current + 1, true);
    else {
      say('All steps are marked as done in this browser.');
      rootRef.current?.querySelector(`#${id}-more, #${id}-help`)?.scrollIntoView({ block: 'start' });
    }
  };
  const onVerify = (stepIndex, checkIndex, value) => {
    const nextVerified = verified.map((list, i) => (i === stepIndex ? list.map((v, j) => (j === checkIndex ? value : v)) : list));
    const nextCompleted = completed.map((done, i) => (i === stepIndex && !value ? false : done));
    setVerified(nextVerified);
    setCompleted(nextCompleted);
    persist(nextCompleted, nextVerified);
  };
  const onReset = () => {
    const nextCompleted = steps.map(() => false);
    const nextVerified = steps.map((step) => (step.verify || []).map(() => false));
    setCompleted(nextCompleted); setVerified(nextVerified); persist(nextCompleted, nextVerified); select(0);
    say('Your progress in this browser was reset.');
  };
  const onTabKey = (event) => {
    const keys = { ArrowRight: current + 1, ArrowLeft: current - 1 + count, Home: 0, End: last };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target % count, true);
  };
  const openZoom = (shot) => {
    setZoom(shot);
    const dialog = zoomRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };
  const closeOnBackdrop = (event) => {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  };
  const reveal = (targetId) => {
    const node = rootRef.current?.querySelector(`[id="${targetId}"]`);
    if (node && node.tagName === 'DETAILS') node.open = true;
  };

  const renderShot = (shot, stepIndex) => {
    const unavailable = failed[shot.src];
    const label = shot.vendor ? 'VENDOR SCREENSHOT' : 'KOMBIFY SCREENSHOT';
    return (
      <>
        <span className="screenshot-tag">{icon('camera')} {label}</span>
        <Figure className={`screen-figure${shot.frame === 'phone' ? ' phone' : ''}${unavailable ? ' image-unavailable' : ''}`}>
          <div className="screen-image">
            <Img alt={shot.alt} className={shot.srcDark ? 'only-light has-dark' : undefined} decoding="async" height={shot.height} loading={stepIndex === 0 ? 'eager' : 'lazy'} onError={() => setFailed((old) => ({ ...old, [shot.src]: true }))} referrerPolicy="no-referrer" src={shot.src} width={shot.width} />
            {shot.srcDark ? <Img alt={shot.alt} className="only-dark" decoding="async" height={shot.height} loading="lazy" src={shot.srcDark} width={shot.width} /> : null}
            {(shot.annotations || []).map((mark, i) => <span aria-hidden="true" className="annotation" data-n={mark.n} key={i} style={{ top: `${mark.top}%`, left: `${mark.left}%`, width: `${mark.width}%`, height: `${mark.height}%` }} />)}
            <Anchor className="image-fallback" href={shot.vendor ? shot.creditHref || shot.src : shot.src} rel="noopener noreferrer" target="_blank">{icon('external')} {shot.vendor ? 'Open the vendor page' : 'Open the screenshot'}<span>{shot.vendor ? 'Loading it needs an internet connection.' : 'The image did not load.'}</span></Anchor>
            <button aria-label={`Enlarge screenshot: ${shot.alt}`} className="zoom-button" onClick={() => openZoom(shot)} type="button">{icon('zoom')}</button>
          </div>
          <Figcaption>
            {shot.caption}{shot.credit ? <> · {shot.creditHref ? link(shot.creditHref, shot.credit) : shot.credit}</> : null}
            {shot.version || shot.captured ? <span className="meta">{[shot.version, shot.captured ? `captured ${shot.captured}` : null].filter(Boolean).join(' · ')}</span> : null}
          </Figcaption>
        </Figure>
      </>
    );
  };
  const renderLinkVisual = (visual) => (
    <>
      <span className="screenshot-tag">{icon('external')} {visual.tag || 'VENDOR GUIDE'}</span>
      <div className="link-visual">
        {visual.title ? <strong>{visual.title}</strong> : null}
        {visual.text ? <p>{rich(visual.text)}</p> : null}
        {(visual.links || []).map((item) => (
          <Anchor className="vendor-link" href={item.href} key={item.href} rel="noopener noreferrer" target="_blank">
            {icon(item.icon || 'book')}<span>{item.label}{item.detail ? <small>{item.detail}</small> : null}</span>{icon('external')}<span className="sr-only"> (opens in a new tab)</span>
          </Anchor>
        ))}
      </div>
    </>
  );

  return (
    <div className="kombify-client-guide not-prose" id={id} lang="en" ref={rootRef} style={{ '--kcg-steps': count }}>
      <div className="guide-content">
        <div className="page-top">
          <div className="intro-meta">{meta.map((item) => <span key={item.text}>{icon(item.icon)} {item.text}</span>)}</div>
          <div className="page-tools"><button aria-label="Print guide" className="tool-button" onClick={() => window.print()} type="button">{icon('print')}</button></div>
        </div>
        {requirements.length ? (
          <div className="ready-strip">
            <strong>What you need</strong>
            {requirements.map((item) => <span key={item}>{icon('check')} {rich(item)}</span>)}
            {requirementsHelp ? <Anchor href={`#${requirementsHelp.target}`} onClick={() => reveal(requirementsHelp.target)}>{requirementsHelp.label} {icon('arrow')}</Anchor> : null}
          </div>
        ) : null}

        {apps.length ? (
          <section aria-labelledby={`${id}-apps-title`} className="downloads" id={`${id}-apps`}>
            <div className="section-top">
              <h2 id={`${id}-apps-title`}>{appsTitle}</h2>
              {vendor ? link(vendor.href, vendor.label, 'small-link') : null}
            </div>
            <div className="downloads-grid">
              {apps.map((app, i) => (
                <Anchor className={`download-card${i === 0 ? ' active' : ''}`} href={app.href} key={app.href} rel="noopener noreferrer" target="_blank">
                  <span className="platform-icon">{icon(app.platform)}</span>
                  <span className="download-text">
                    <strong>{app.label}</strong>
                    <small>{app.detail}</small>
                    <span className="store-name">{app.store} {icon('external')}</span>
                    <span className={`badge ${app.official ? 'official' : 'unofficial'}`}>{app.official ? `Official · ${app.vendor}` : `Third-party · ${app.vendor}`}</span>
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </Anchor>
              ))}
            </div>
            {appsNote ? <p className="download-hint">{rich(appsNote)}</p> : null}
          </section>
        ) : null}

        <section aria-labelledby={`${id}-guide-title`} className="guide-section" id={`${id}-guide`}>
          <div className="guide-heading"><h2 id={`${id}-guide-title`}>{stepsTitle}</h2></div>
          <div className="wizard">
            <div aria-label="Setup steps" className="step-tabs" onKeyDown={onTabKey} role="tablist">
              {steps.map((step, i) => (
                <button aria-controls={`${id}-panel-${i}`} aria-selected={i === current} className={`step-tab${completed[i] ? ' done' : ''}`} id={`${id}-tab-${i}`} key={step.tab} onClick={() => select(i)} role="tab" tabIndex={i === current ? 0 : -1} type="button">
                  <span className="step-dot">{completed[i] ? '✓' : i + 1}</span><span>{step.tab}</span>
                </button>
              ))}
            </div>
            {steps.map((step, i) => (
              <Article aria-labelledby={`${id}-tab-${i}`} className={`guide-panel${i === current ? ' active' : ''}`} id={`${id}-panel-${i}`} key={step.tab} role="tabpanel">
                <div className="panel-copy">
                  <div className="step-kicker">STEP {String(i + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</div>
                  <h3>{step.title}</h3>
                  {step.intro ? <p className="step-intro">{rich(step.intro)}</p> : null}
                  {step.clicks?.length ? (
                    <ol className="click-list">{step.clicks.map((click, j) => <li key={j}><span className="click-num">{j + 1}</span><span>{rich(click)}</span></li>)}</ol>
                  ) : null}
                  {step.verify?.length ? (
                    <div className="verify-list">
                      {step.verify.map((item, j) => (
                        <label key={item}><input checked={Boolean(verified[i]?.[j])} id={`${id}-verify-${i}-${j}`} onChange={(event) => onVerify(i, j, event.target.checked)} type="checkbox" /><span>{rich(item)}</span></label>
                      ))}
                    </div>
                  ) : null}
                  {step.note ? <div className="micro-note">{icon('info')}<span>{rich(step.note)}</span></div> : null}
                  {(step.faq ? [].concat(step.faq) : []).map((faq) => (
                    <Details key={faq.q}><Summary>{faq.q}</Summary><p>{rich(faq.a)}</p></Details>
                  ))}
                  {step.check ? <div className="step-check">{icon('ok')} {rich(step.check)}</div> : null}
                </div>
                <div className="panel-visual">
                  {step.screenshot ? renderShot(step.screenshot, i) : step.visual ? renderLinkVisual(step.visual) : null}
                </div>
              </Article>
            ))}
            <div className="wizard-bottom">
              <div className="progress-note">
                <span>{completed.filter(Boolean).length} of {count} steps done</span>
                <div aria-hidden="true" className="progress-meter">{steps.map((step, i) => <span className={completed[i] ? 'done' : undefined} key={step.tab} />)}</div>
              </div>
              <button className="prev" disabled={current === 0} onClick={() => select(current - 1, true)} type="button">{icon('back')} Back</button>
              <button className="next" onClick={onNext} type="button"><span>{current === last ? 'Finish' : 'Done · next'}</span>{icon('arrow')}</button>
            </div>
          </div>
          {sources ? <p className="provenance-inline">{sources.summary} <Anchor href={`#${id}-sources`} onClick={() => reveal(`${id}-sources-detail`)}>Image sources and date</Anchor></p> : null}
        </section>

        {next.length ? (
          <section aria-labelledby={`${id}-more-title`} className="more-section" id={`${id}-more`}>
            <div className="section-top"><h2 id={`${id}-more-title`}>{nextTitle}</h2></div>
            <div className="more-grid">
              {next.map((item) => (
                link(item.href, <>
                  <span className="more-icon">{icon(item.icon || 'arrow')}</span>
                  <span><strong>{item.title}</strong><small>{item.text}</small></span>
                </>, 'more-card', item.href)
              ))}
            </div>
          </section>
        ) : null}

        {help.length ? (
          <section aria-labelledby={`${id}-help-title`} className="faq-section" id={`${id}-help`}>
            <h2 id={`${id}-help-title`}>{helpTitle}</h2>
            {help.map((item) => (
              <Details className="faq" id={item.id} key={item.q}><Summary>{item.q}</Summary><div className="answer">{rich(item.a)}</div></Details>
            ))}
          </section>
        ) : null}

        <Footer className="footline">
          <div className="attribution">{attribution ? rich(attribution) : null}</div>
          <button className="reset" onClick={onReset} type="button">Reset progress</button>
        </Footer>

        {sources ? (
          <section className="source-section" id={`${id}-sources`}>
            <Details id={`${id}-sources-detail`}>
              <Summary>Image sources, checked links and date</Summary>
              <div className="source-content">
                {(sources.paragraphs || []).map((text) => <p key={text}>{rich(text)}</p>)}
                <div className="source-links">{(sources.links || []).map((item) => link(item.href, item.label, undefined, item.href))}</div>
              </div>
            </Details>
            <div className="dim">Guide by kombify · Product names, screenshots of vendor apps and trademarks belong to their respective owners.</div>
          </section>
        ) : null}
      </div>

      <Dialog aria-labelledby={`${id}-zoom-title`} className="zoom-dialog" onClick={closeOnBackdrop} ref={zoomRef}>
        <div className="dialog-header">
          <h2 id={`${id}-zoom-title`}>{zoom?.vendor ? 'Vendor screenshot' : 'Screenshot'}</h2>
          <button aria-label="Close image" className="dialog-close" onClick={() => zoomRef.current?.close()} type="button">{icon('close')}</button>
        </div>
        <div className="zoom-content">
          {zoom ? <Img alt={zoom.alt} src={zoom.src} /> : null}
          {zoom?.creditHref ? link(zoom.creditHref, zoom.vendor ? 'Open the original from the vendor' : 'About this screenshot') : null}
        </div>
      </Dialog>
      <div className="toast" hidden={!toast} role="status">{toast}</div>
    </div>
  );
};
