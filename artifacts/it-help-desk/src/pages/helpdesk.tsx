import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  Copy,
  FileText,
  Gauge,
  Info,
  Laptop,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetHelpdeskOverviewQueryKey,
  getSearchKnowledgeQueryKey,
  useDiagnoseIssue,
  useGetHelpdeskOverview,
  useRunDiagnosticTool,
  useSearchKnowledge,
  type DiagnosticReport,
  type DiagnosticStep,
  type KnowledgeArticle,
  type ToolCheckResult,
} from '@workspace/api-client-react';

const urgencyOptions = [
  { value: 'low', label: 'Low impact', note: 'I can keep working' },
  { value: 'normal', label: 'Normal', note: 'Work is slowed down' },
  { value: 'high', label: 'High impact', note: 'I am blocked' },
];

const categoryOptions = ['All topics', 'Access', 'Devices', 'Network', 'Applications', 'Performance'];

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scoreLabel(score: number) {
  if (score >= 0.85) return 'Strong match';
  if (score >= 0.65) return 'Good match';
  return 'Related';
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const isGood = ['passed', 'pass', 'success', 'complete', 'completed', 'healthy', 'verified'].some((word) => normalized.includes(word));
  const isBad = ['failed', 'fail', 'error', 'blocked', 'critical'].some((word) => normalized.includes(word));
  return (
    <span className={`status-pill ${isGood ? 'status-good' : isBad ? 'status-bad' : 'status-neutral'}`} data-testid={`status-pill-${status}`}>
      <span className="status-dot" />
      {titleCase(status)}
    </span>
  );
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string | number; detail: string; icon: typeof Gauge; accent?: string }) {
  return (
    <div className={`metric-card ${accent ?? ''}`} data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="metric-icon"><Icon size={17} strokeWidth={1.8} /></div>
      <div className="metric-content">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function SkeletonOverview() {
  return (
    <div className="metrics-grid" aria-label="Loading workspace metrics" data-testid="loading-overview">
      {[1, 2, 3, 4].map((item) => <div className="metric-card skeleton-card" key={item}><div className="skeleton skeleton-icon" /><div><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line large" /><div className="skeleton skeleton-line medium" /></div></div>)}
    </div>
  );
}

function StepRow({
  step,
  result,
  isRunning,
  onRun,
}: {
  step: DiagnosticStep;
  result?: ToolCheckResult;
  isRunning: boolean;
  onRun: () => void;
}) {
  const completed = result || ['complete', 'completed', 'passed', 'verified'].some((status) => step.status.toLowerCase().includes(status));
  return (
    <div className={`step-row ${completed ? 'step-complete' : ''}`} data-testid={`diagnostic-step-${step.id}`}>
      <div className="step-index">{completed ? <Check size={14} /> : <span>{step.id.slice(0, 2).toUpperCase()}</span>}</div>
      <div className="step-main">
        <div className="step-title-line">
          <strong>{step.title}</strong>
          <StatusPill status={result?.status ?? step.status} />
        </div>
        <p>{step.detail}</p>
        {result && <div className="tool-result"><span>{result.summary}</span><small>{formatDate(result.checkedAt)}</small></div>}
      </div>
      {step.tool && !result && (
        <button className="quiet-button" onClick={onRun} disabled={isRunning} data-testid={`button-run-check-${step.id}`}>
          {isRunning ? <Loader2 size={14} className="spin" /> : <Terminal size={14} />}
          {isRunning ? 'Checking' : 'Run check'}
        </button>
      )}
    </div>
  );
}

function ArticleCard({ article, onOpen }: { article: KnowledgeArticle; onOpen: () => void }) {
  return (
    <button className="article-card" onClick={onOpen} data-testid={`button-article-${article.id}`}>
      <div className="article-card-top"><span className="article-category">{article.category}</span><ArrowUpRight size={15} /></div>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      <div className="article-meta"><span>{scoreLabel(article.relevance)}</span><span>{article.tags.slice(0, 2).join(' · ')}</span></div>
    </button>
  );
}

export default function Helpdesk() {
  const [issue, setIssue] = useState('');
  const [device, setDevice] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [toolResults, setToolResults] = useState<Record<string, ToolCheckResult>>({});
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('All topics');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const overviewQuery = useGetHelpdeskOverview({ query: { queryKey: getGetHelpdeskOverviewQueryKey() } });
  const searchParams = useMemo(() => ({
    ...(search ? { q: search } : {}),
    ...(category !== 'All topics' ? { category } : {}),
  }), [search, category]);
  const knowledgeQuery = useSearchKnowledge(searchParams, { query: { queryKey: getSearchKnowledgeQueryKey(searchParams) } });
  const diagnose = useDiagnoseIssue();
  const runTool = useRunDiagnosticTool();

  const handleDiagnose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (issue.trim().length < 3 || diagnose.isPending) return;
    setReport(null);
    setToolResults({});
    diagnose.mutate({ data: { issue: issue.trim(), device: device.trim() || undefined, urgency } }, {
      onSuccess: (nextReport) => setReport(nextReport),
    });
  };

  const handleRunTool = (step: DiagnosticStep) => {
    if (!step.tool || runTool.isPending) return;
    setRunningTool(step.id);
    runTool.mutate({ data: { tool: step.tool, target: device.trim() || 'Current workstation' } }, {
      onSuccess: (result) => {
        setToolResults((current) => ({ ...current, [step.id]: result }));
        setRunningTool(null);
      },
      onError: () => setRunningTool(null),
    });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const copyReply = async () => {
    if (!report?.suggestedReply) return;
    await navigator.clipboard?.writeText(report.suggestedReply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const overview = overviewQuery.data;
  const articles = knowledgeQuery.data ?? [];
  const isInitial = !report && !diagnose.isPending;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Command size={19} /></div>
          <div><strong>Northstar</strong><span>IT operations</span></div>
        </div>
        <div className="workspace-switcher"><span className="online-dot" /><span>Employee help desk</span><ChevronRight size={15} /></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-label">Workspace</span>
          <button className="nav-item active" onClick={() => announce('Ask Northstar is the active workspace.')} data-testid="button-nav-workspace"><Sparkles size={17} /> Ask Northstar <span className="nav-count">1</span></button>
          <button className="nav-item" onClick={() => { document.getElementById('knowledge-base')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); announce('Knowledge base is ready below.'); }} data-testid="button-nav-knowledge"><BookOpen size={17} /> Knowledge base</button>
          <button className="nav-item" onClick={() => announce('Recent checks will appear here after you run a safe check.')} data-testid="button-nav-history"><Clock3 size={17} /> My recent checks</button>
          <span className="nav-label nav-label-spaced">Support team</span>
          <button className="nav-item" onClick={() => announce('Desk insights are available to support leads.')} data-testid="button-nav-insights"><Activity size={17} /> Desk insights</button>
          <button className="nav-item" onClick={() => announce('Coverage is currently live and source-backed.')} data-testid="button-nav-coverage"><ShieldCheck size={17} /> Coverage & safety</button>
        </nav>
        <div className="sidebar-foot">
          <div className="coverage-card"><div className="coverage-head"><span>System coverage</span><span className="coverage-live">Live</span></div><div className="coverage-bar"><span /></div><p>Knowledge sources are current</p></div>
          <div className="user-chip"><div className="avatar">AC</div><div><strong>Alex Chen</strong><span>Employee</span></div><button aria-label="Open account menu" onClick={() => announce('Account controls are managed by your workspace administrator.')} data-testid="button-account-menu"><ChevronRight size={15} /></button></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>Ask Northstar</strong></div>
          <div className="topbar-actions"><span className="secure-label"><span className="online-dot" /> Secure workspace</span><button className="icon-button" onClick={() => announce('Northstar only runs non-destructive checks on request.')} aria-label="View workspace information" data-testid="button-workspace-info"><Info size={17} /></button></div>
        </header>

        <div className="content-wrap">
          {notice && <div className="workspace-notice" role="status" data-testid="status-workspace-notice"><CheckCircle2 size={15} /> {notice}</div>}
          <section className="intro-row">
            <div><p className="eyebrow">Technical support, with receipts</p><h1>What’s getting in your way?</h1><p className="intro-copy">Describe the problem in your own words. Northstar will reason through it, show its sources, and only suggest checks that are safe to run.</p></div>
            <div className="trust-note"><ShieldCheck size={18} /><div><strong>Source-backed answers</strong><span>Every diagnosis is tied to internal guidance.</span></div></div>
          </section>

          {overviewQuery.isLoading ? <SkeletonOverview /> : overviewQuery.isError ? (
            <div className="inline-error" data-testid="error-overview"><AlertCircle size={18} /><div><strong>Workspace metrics are unavailable</strong><span>Try again when your connection is stable.</span></div><button onClick={() => overviewQuery.refetch()} data-testid="button-retry-overview">Retry</button></div>
          ) : overview ? (
            <div className="metrics-grid">
              <MetricCard label="Knowledge articles" value={overview.articles} detail="Available to Northstar" icon={BookOpen} />
              <MetricCard label="Issue patterns" value={overview.issueTypes} detail="Recognized issue types" icon={Zap} accent="metric-accent" />
              <MetricCard label="Average resolution" value={overview.avgResolution} detail="Across recent requests" icon={Gauge} />
              <MetricCard label="Solved this week" value={overview.solvedThisWeek} detail={`${overview.toolChecks} safe checks run`} icon={CheckCircle2} accent="metric-success" />
            </div>
          ) : null}

          <div className="workspace-grid">
            <section className="diagnosis-column">
              <div className="section-heading"><div><span className="section-kicker"><span className="kicker-line" /> New request</span><h2>Start with the signal</h2></div><span className="shortcut-hint"><Command size={13} /> Enter to diagnose</span></div>
              <form className="issue-form panel" onSubmit={handleDiagnose}>
                <div className="field-block"><label htmlFor="issue">What’s happening?</label><textarea id="issue" value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Example: I can connect to Wi-Fi, but every internal site times out…" data-testid="input-issue" /><div className="field-hint"><span>Be specific about what changed, if you know.</span><span>{issue.length}/500</span></div></div>
                <div className="form-row">
                  <div className="field-block"><label htmlFor="device">Device or system <span className="optional">Optional</span></label><div className="input-with-icon"><Laptop size={16} /><input id="device" value={device} onChange={(event) => setDevice(event.target.value)} placeholder="MacBook Pro, VPN, Outlook…" data-testid="input-device" /></div></div>
                  <div className="field-block"><label htmlFor="urgency">Impact</label><select id="urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)} data-testid="select-urgency">{urgencyOptions.map((option) => <option value={option.value} key={option.value}>{option.label} — {option.note}</option>)}</select></div>
                </div>
                <div className="form-submit-row"><div className="safe-note"><ShieldCheck size={15} /><span>No changes will be made to your device</span></div><button className="primary-button" type="submit" disabled={issue.trim().length < 3 || diagnose.isPending} data-testid="button-diagnose">{diagnose.isPending ? <><Loader2 size={16} className="spin" /> Reasoning through it</> : <><Sparkles size={16} /> Diagnose issue <ArrowUpRight size={16} /></>}</button></div>
                {diagnose.isError && <div className="form-error" data-testid="error-diagnose"><AlertCircle size={16} /> We couldn’t complete that diagnosis. Check your connection and try again.</div>}
              </form>

              <section className="report-section" aria-live="polite">
                {diagnose.isPending && <div className="report-loading panel" data-testid="loading-diagnosis"><div className="loading-orbit"><Sparkles size={20} /></div><div><strong>Reading the signal</strong><span>Comparing your issue with verified support guidance…</span></div><div className="loading-lines"><i /><i /><i /></div></div>}
                {isInitial && <div className="empty-report panel" data-testid="empty-diagnosis"><div className="empty-graphic"><div className="empty-ring ring-one" /><div className="empty-ring ring-two" /><div className="empty-core"><CrosshairIcon /></div></div><div><span className="section-kicker">Your diagnosis will appear here</span><h3>Clear steps, not chatbot fog</h3><p>Once you describe an issue, you’ll get a likely cause, confidence level, safe checks, and the internal sources behind the recommendation.</p></div></div>}
                {report && <div className="report-card panel" data-testid={`report-${report.id}`}>
                  <div className="report-header"><div><span className="section-kicker"><span className="kicker-line" /> Latest diagnosis</span><h2>{report.issue}</h2></div><div className="report-time"><span>Created {formatDate(report.createdAt)}</span><StatusPill status={report.severity} /></div></div>
                  <div className="diagnosis-callout"><div className="diagnosis-icon"><Network size={19} /></div><div><span className="callout-label">Likely cause</span><p>{report.diagnosis}</p></div><div className="confidence"><span>Confidence</span><strong>{Math.round(report.confidence * 100)}%</strong><div className="confidence-bar"><span style={{ width: `${Math.round(report.confidence * 100)}%` }} /></div></div></div>
                  <div className="steps-heading"><h3>Recommended path</h3><span>{report.steps.length} steps · reversible first</span></div>
                  <div className="steps-list">{report.steps.map((step) => <StepRow key={step.id} step={step} result={toolResults[step.id]} isRunning={runningTool === step.id} onRun={() => handleRunTool(step)} />)}</div>
                  <div className="reply-block"><div className="reply-head"><div><span className="callout-label">Suggested reply</span><p>Ready to send to your support channel</p></div><button className="quiet-button" onClick={copyReply} data-testid="button-copy-reply">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy reply'}</button></div><blockquote>{report.suggestedReply}</blockquote></div>
                  <div className="sources-block"><div className="sources-heading"><h3>Sources used</h3><span>Internal knowledge only</span></div><div className="source-list">{report.sources.map((source) => <button key={source.id} className="source-item" onClick={() => setSelectedArticle(source)} data-testid={`button-source-${source.id}`}><FileText size={15} /><span>{source.title}</span><ArrowUpRight size={14} /></button>)}</div></div>
                </div>}
              </section>
            </section>

            <aside className="knowledge-column" id="knowledge-base">
              <div className="section-heading knowledge-heading"><div><span className="section-kicker"><span className="kicker-line copper" /> Reference desk</span><h2>Knowledge base</h2></div><span className="article-count">{knowledgeQuery.data?.length ?? 0} results</span></div>
              <div className="knowledge-panel panel">
                <form className="search-box" onSubmit={handleSearch}><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search internal guidance…" data-testid="input-knowledge-search" /><button type="submit" aria-label="Search knowledge base" data-testid="button-search-knowledge"><ArrowUpRight size={15} /></button></form>
                <div className="category-tabs" role="tablist">{categoryOptions.map((option) => <button key={option} className={category === option ? 'category-tab active' : 'category-tab'} onClick={() => setCategory(option)} data-testid={`button-category-${option.toLowerCase().replace(/\s/g, '-')}`}>{option}</button>)}</div>
                {knowledgeQuery.isLoading ? <div className="article-loading" data-testid="loading-knowledge">{[1, 2, 3].map((item) => <div className="article-skeleton" key={item}><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line large" /><div className="skeleton skeleton-line medium" /></div>)}</div> : knowledgeQuery.isError ? <div className="knowledge-empty" data-testid="error-knowledge"><AlertCircle size={20} /><strong>Search is taking a break</strong><p>The knowledge service didn’t respond.</p><button className="quiet-button" onClick={() => knowledgeQuery.refetch()} data-testid="button-retry-knowledge">Retry search</button></div> : articles.length === 0 ? <div className="knowledge-empty" data-testid="empty-knowledge"><Search size={21} /><strong>No matching guidance</strong><p>Try a broader phrase or clear the topic filter.</p><button className="quiet-button" onClick={() => { setSearch(''); setSearchInput(''); setCategory('All topics'); }} data-testid="button-clear-knowledge">Clear filters</button></div> : <div className="article-list">{articles.map((article) => <ArticleCard key={article.id} article={article} onOpen={() => setSelectedArticle(article)} />)}</div>}
                <div className="knowledge-footer"><BookOpen size={15} /><span>Guidance is maintained by the IT operations team.</span></div>
              </div>
              <div className="checks-note"><div className="checks-note-icon"><Terminal size={17} /></div><div><strong>Safe checks, visible results</strong><p>Northstar can run non-destructive checks against your stated device or system. You stay in control.</p></div></div>
            </aside>
          </div>
        </div>
      </main>

      {selectedArticle && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedArticle(null)}><article className="article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title" onClick={(event) => event.stopPropagation()} data-testid="article-detail"><div className="modal-top"><span className="article-category">{selectedArticle.category}</span><button className="icon-button" onClick={() => setSelectedArticle(null)} aria-label="Close article" data-testid="button-close-article"><X size={17} /></button></div><h2 id="article-title">{selectedArticle.title}</h2><p className="modal-summary">{selectedArticle.summary}</p><div className="modal-tags">{selectedArticle.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="modal-content">{selectedArticle.content}</div></article></div>}
    </div>
  );
}

function CrosshairIcon() {
  return <span className="crosshair-icon"><span /></span>;
}