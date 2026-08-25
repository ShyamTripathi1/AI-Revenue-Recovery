import { useState, useEffect, useRef } from 'react';
import {
  Play, Activity, ShieldAlert, BarChart3, Clock, CheckCircle2, XCircle,
  LayoutDashboard, ListFilter, AlertTriangle, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Zap, Target, DollarSign, Users,
  ArrowUpRight, ArrowDownRight, Circle, IndianRupee
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Event = {
  id: string;
  event_type: string;
  merchant_id: string;
  customer_id: string;
  amount: number;
  created_at: string;
  failure_reason_raw: string;
  checkout_stage_reached: string | null;
  ground_truth_root_cause: string;
  split: string;
  retry_count: number;
  status: string;
  action_type?: string;
  classified_root_cause?: string;
  classifier_confidence?: number;
  reasoning?: string;
  guardrail_checks_passed?: string;
  result?: string;
};

type Metrics = {
  total_events: number;
  amount_recovered: number;
  recovered_count: number;
  amount_at_risk: number;
  escalated_count: number;
  open_count: number;
  holdout_accuracy: string;
  holdout_evaluated: number;
};

type Charts = {
  root_causes: { name: string; value: number }[];
  action_stats: { action: string; total: number; success_rate: number; successes: number }[];
  by_event_type: { event_type: string; recovered: number; lost: number; total: number }[];
  status_distribution: { name: string; value: number }[];
  recovery_trend: { day: string; recovered: number; at_risk: number }[];
};

type Tab = 'dashboard' | 'events' | 'analytics' | 'exceptions';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#f43f5e', '#38bdf8', '#a78bfa', '#34d399'];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  recovered:    { label: 'Recovered',    color: 'text-success',   bg: 'bg-success/10',   dot: 'bg-success' },
  in_progress:  { label: 'In Progress',  color: 'text-info',      bg: 'bg-info/10',       dot: 'bg-info animate-pulse' },
  escalated:    { label: 'Escalated',    color: 'text-danger',    bg: 'bg-danger/10',    dot: 'bg-danger' },
  exhausted:    { label: 'Exhausted',    color: 'text-warning',   bg: 'bg-warning/10',   dot: 'bg-warning' },
  open:         { label: 'Open',         color: 'text-text-2',    bg: 'bg-white/5',       dot: 'bg-text-2' },
};

const ROOT_CAUSE_LABELS: Record<string, string> = {
  insufficient_funds: 'Insufficient Funds',
  card_expired: 'Card Expired',
  do_not_honor: 'Do Not Honor',
  abandoned_at_otp: 'Abandoned at OTP',
  fraud_suspected: 'Fraud Suspected',
  limit_exceeded: 'Limit Exceeded',
  network_error: 'Network Error',
  invalid_details: 'Invalid Details',
  unknown: 'Unknown',
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    ref.current = 0;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      {label && <div className="text-text-2 mb-2 font-medium">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-text-2 capitalize">{p.name}:</span>
          <span className="text-text font-medium font-mono">
            {typeof p.value === 'number' && p.name?.toLowerCase().includes('rate')
              ? `${p.value}%`
              : typeof p.value === 'number' && p.value > 100
              ? `₹${p.value.toLocaleString()}`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [liveIndicator, setLiveIndicator] = useState(true);

  const fetchState = async () => {
    try {
      const [mRes, eRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/metrics`),
        fetch(`${API_URL}/api/events`),
        fetch(`${API_URL}/api/charts`),
      ]);
      setMetrics(await mRes.json());
      setEvents(await eRes.json());
      setCharts(await cRes.json());
      setLiveIndicator(v => !v); // blink
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 4000);
    return () => clearInterval(interval);
  }, []);

  const runBatch = async () => {
    setBatchRunning(true);
    await fetch(`${API_URL}/api/run-batch`, { method: 'POST' });
    setTimeout(() => {
      setBatchRunning(false);
      fetchState();
    }, 2500);
  };

  const resetDb = async () => {
    setResetting(true);
    await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    setTimeout(() => {
      setResetting(false);
      fetchState();
    }, 500);
  };

  const exceptionEvents = events.filter(e => ['escalated', 'exhausted'].includes(e.status));

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary animate-pulse" />
        </div>
        <div className="text-text-2 text-sm">Initializing RecoverAI...</div>
      </div>
    );
  }

  const navItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard',  label: 'Dashboard',  icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'analytics',  label: 'Analytics',  icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'events',     label: 'Events',     icon: <ListFilter className="w-4 h-4" />, badge: metrics?.open_count },
    { id: 'exceptions', label: 'Exceptions', icon: <AlertTriangle className="w-4 h-4" />, badge: exceptionEvents.length },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — dark teal-navy from reference image */}
      <aside className="w-56 shrink-0 flex flex-col gap-1 p-3 sticky top-0 h-screen" style={{ background: '#124c6e', borderRight: '1px solid #0b324c' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style={{ background: '#ffcc00', border: '3px solid #000000' }}>
            <IndianRupee className="w-4 h-4" style={{ color: '#000000', strokeWidth: 3 }} />
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight" style={{ color: '#ffffff' }}>RecoverAI</div>
            <div className="text-[10px] font-semibold tracking-wider uppercase leading-none mt-0.5" style={{ color: '#8bb8d4' }}>Revenue Engine</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => setTab(item.id)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all duration-150 text-left w-full border"
              style={tab === item.id
                ? { background: 'rgba(255,255,255,0.15)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }
                : { color: '#8bb8d4', borderColor: 'transparent' }
              }
              onMouseEnter={e => { if (tab !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (tab !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={item.id === 'exceptions'
                    ? { background: '#e11d48', color: '#ffffff', boxShadow: '0 2px 8px rgba(225,29,72,0.4)' }
                    : { background: 'rgba(255,255,255,0.15)', color: '#ffffff' }
                  }
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Live indicator */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#8bb8d4' }}>
            <Circle className={cn("w-2 h-2 fill-current", liveIndicator ? "text-success" : "text-success/50")} />
            Live polling
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-8 h-16 shadow-sm" style={{ background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid rgba(11,41,68,0.08)', backdropFilter: 'blur(12px)' }}>
          <div>
            <h1 className="text-lg font-extrabold text-text capitalize tracking-tight">{tab}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="btn-reset"
              onClick={resetDb}
              disabled={resetting || batchRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-text-2 hover:text-text hover:bg-white/5 border border-border transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", resetting && "animate-spin")} />
              Reset DB
            </button>
            <button
              id="btn-run-batch"
              onClick={runBatch}
              disabled={batchRunning}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200",
                batchRunning
                  ? "bg-primary/40 text-white/70 cursor-wait"
                  : "bg-primary hover:bg-primary-dark text-white shadow-glow"
              )}
            >
              {batchRunning
                ? <Activity className="w-4 h-4 animate-pulse" />
                : <Play className="w-4 h-4 fill-current" />
              }
              {batchRunning ? 'Processing...' : 'Run Batch'}
            </button>
          </div>
        </header>

        <div className="p-8 animate-fade-in">
          {tab === 'dashboard' && <DashboardView metrics={metrics} events={events} charts={charts} />}
          {tab === 'analytics' && <AnalyticsView charts={charts} />}
          {tab === 'events' && <EventsView events={events} />}
          {tab === 'exceptions' && <ExceptionsView events={exceptionEvents} />}
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({ metrics, events, charts }: { metrics: Metrics | null; events: Event[]; charts: Charts | null }) {
  const amountRecovered = useCountUp(metrics?.amount_recovered ?? 0);
  const recoveredCount = useCountUp(metrics?.recovered_count ?? 0);
  const escalatedCount = useCountUp(metrics?.escalated_count ?? 0);
  const accuracy = useCountUp(parseFloat(metrics?.holdout_accuracy ?? '0'));

  const recoveryRate = metrics && metrics.total_events > 0
    ? ((metrics.recovered_count / metrics.total_events) * 100).toFixed(1)
    : '0';

  return (
    <div className="flex flex-col gap-8 animate-slide-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          id="card-recovered"
          title="Amount Recovered"
          value={`₹${amountRecovered.toLocaleString()}`}
          sub={`${recoveredCount} transactions`}
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-success/10 border-success/20"
          iconColor="text-success"
          trend={{ value: `${recoveryRate}%`, up: true, label: 'recovery rate' }}
        />
        <MetricCard
          id="card-at-risk"
          title="Amount at Risk"
          value={`₹${(metrics?.amount_at_risk ?? 0).toLocaleString()}`}
          sub={`${metrics?.open_count ?? 0} open events`}
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-warning/10 border-warning/20"
          iconColor="text-warning"
        />
        <MetricCard
          id="card-escalations"
          title="Escalations"
          value={String(escalatedCount)}
          sub="Human review required"
          icon={<ShieldAlert className="w-5 h-5" />}
          iconBg="bg-danger/10 border-danger/20"
          iconColor="text-danger"
          alert={escalatedCount > 0}
        />
        <MetricCard
          id="card-accuracy"
          title="Classifier Accuracy"
          value={`${accuracy}%`}
          sub={`On ${metrics?.holdout_evaluated ?? 0} holdout events`}
          icon={<Target className="w-5 h-5" />}
          iconBg="bg-primary/10 border-primary/20"
          iconColor="text-primary"
          trend={{ value: `${accuracy}%`, up: accuracy >= 80, label: 'vs 75% baseline' }}
        />
      </div>

      {/* Mini chart + recent events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recovery trend mini chart */}
        <div className="lg:col-span-2 glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm font-semibold text-text">Recovery Trend</div>
              <div className="text-xs text-muted mt-0.5">Amount recovered vs. at-risk over event batches</div>
            </div>
            <TrendingUp className="w-4 h-4 text-text-2" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={charts?.recovery_trend ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecovered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRisk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(21,67,96,0.08)" />
              <XAxis dataKey="day" tick={{ fill: '#3a4a5c', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#3a4a5c', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="recovered" stroke="#22c55e" strokeWidth={2} fill="url(#gradRecovered)" name="recovered" />
              <Area type="monotone" dataKey="at_risk" stroke="#f59e0b" strokeWidth={2} fill="url(#gradRisk)" name="at risk" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status distribution */}
        <div className="glass rounded-xl p-5">
          <div className="text-sm font-semibold text-text mb-1">Status Distribution</div>
          <div className="text-xs text-muted mb-4">All events by current status</div>
          <div className="flex flex-col gap-2.5 mt-2">
            {(charts?.status_distribution ?? []).map((s, i) => {
              const cfg = STATUS_CONFIG[s.name];
              const total = (charts?.status_distribution ?? []).reduce((acc, x) => acc + x.value, 0);
              const pct = total > 0 ? ((s.value / total) * 100).toFixed(0) : 0;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", cfg?.dot ?? "bg-white/30")} />
                  <span className="text-xs text-text-2 capitalize flex-1">{cfg?.label ?? s.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs font-mono text-text-2 w-6 text-right">{s.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent 5 events */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="text-sm font-semibold text-text">Recent Events</div>
          <div className="text-xs text-muted">{events.length} total</div>
        </div>
        <EventTable events={events.slice(0, 5)} compact />
      </div>
    </div>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView({ charts }: { charts: Charts | null }) {
  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Row 1: Root cause pie + Action bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Root cause distribution */}
        <div className="glass rounded-xl p-6">
          <div className="text-sm font-semibold text-text mb-1">Root Cause Distribution</div>
          <div className="text-xs text-muted mb-4">Classified failure categories across all processed events</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={charts?.root_causes ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(charts?.root_causes ?? []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {(charts?.root_causes ?? []).map((rc, i) => (
                <div key={rc.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-text-2 flex-1 truncate">{ROOT_CAUSE_LABELS[rc.name] ?? rc.name}</span>
                  <span className="text-xs font-mono text-text">{rc.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action success rates */}
        <div className="glass rounded-xl p-6">
          <div className="text-sm font-semibold text-text mb-1">Action Effectiveness</div>
          <div className="text-xs text-muted mb-4">Success rate per recovery action type</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts?.action_stats ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(21,67,96,0.08)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#3a4a5c', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="action" tick={{ fill: '#3a4a5c', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="success_rate" name="success rate" radius={[0, 4, 4, 0]} fill="#bf3b1e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Full recovery trend */}
      <div className="glass rounded-xl p-6">
        <div className="text-sm font-semibold text-text mb-1">Recovery vs. At-Risk Amount</div>
        <div className="text-xs text-muted mb-5">Event batch progression showing cumulative financial outcomes</div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={charts?.recovery_trend ?? []} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRec2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRisk2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(21,67,96,0.08)" />
            <XAxis dataKey="day" tick={{ fill: '#3a4a5c', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#3a4a5c', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: '#3a4a5c', fontSize: 12, paddingTop: 16 }} />
            <Area type="monotone" dataKey="recovered" stroke="#22c55e" strokeWidth={2.5} fill="url(#gradRec2)" name="Recovered" />
            <Area type="monotone" dataKey="at_risk" stroke="#f59e0b" strokeWidth={2.5} fill="url(#gradRisk2)" name="At Risk" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Action stats table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-sm font-semibold text-text">Action Breakdown</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted">Action</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted">Total</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted">Successes</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted">Success Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(charts?.action_stats ?? []).map(a => (
              <tr key={a.action} className="hover:bg-white/[0.02]">
                <td className="px-5 py-3 text-text capitalize font-medium">{a.action}</td>
                <td className="px-5 py-3 text-right font-mono text-text-2">{a.total}</td>
                <td className="px-5 py-3 text-right font-mono text-success">{a.successes}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${a.success_rate}%` }} />
                    </div>
                    <span className="font-mono text-xs text-text w-10 text-right">{a.success_rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Events View ──────────────────────────────────────────────────────────────

function EventsView({ events }: { events: Event[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortCol, setSortCol] = useState<'amount' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const filtered = events
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e =>
      !search || e.merchant_id.toLowerCase().includes(search.toLowerCase()) ||
      e.failure_reason_raw.toLowerCase().includes(search.toLowerCase()) ||
      e.customer_id.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'amount') return (a.amount - b.amount) * dir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });

  const toggleSort = (col: typeof sortCol) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const statuses = ['all', 'open', 'in_progress', 'recovered', 'escalated', 'exhausted'];

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="events-search"
          type="text"
          placeholder="Search merchant, customer, reason..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-surface-2 border border-border text-text text-sm rounded-lg px-3 py-2 w-64 placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
        />
        <div className="flex gap-1 flex-wrap">
          {statuses.map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                id={`filter-${s}`}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                  statusFilter === s
                    ? "bg-blue-900 text-white border border-transparent"
                    : "text-muted hover:text-text border border-border hover:border-border-strong"
                )}
              >
                {s === 'all' ? 'All' : (cfg?.label ?? s)}
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-muted">{filtered.length} events</div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <EventTable events={filtered} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
      </div>
    </div>
  );
}

// ─── Exceptions View ──────────────────────────────────────────────────────────

function ExceptionsView({ events }: { events: Event[] }) {
  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Banner */}
      <div className="glass border border-danger/20 rounded-xl p-5 flex gap-4">
        <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-text mb-1">
            {events.length} exception{events.length !== 1 ? 's' : ''} requiring human review
          </div>
          <div className="text-xs text-text-2">
            These events have been escalated either because the AI classifier confidence was below 60%, 
            the transaction amount exceeded ₹50,000, or they hit the maximum retry cap.
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-success/50" />
          <div className="text-text-2 text-sm">No exceptions at this time</div>
          <div className="text-muted text-xs">Run a batch to process open events</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map(event => (
            <ExceptionCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExceptionCard({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);
  const reasons: { label: string; triggered: boolean }[] = [
    { label: `Amount ₹${event.amount.toLocaleString()} exceeds ₹50,000 threshold`, triggered: event.amount > 50000 },
    { label: `Low classifier confidence (${event.classifier_confidence?.toFixed(2) ?? 'N/A'})`, triggered: !!event.classifier_confidence && event.classifier_confidence < 0.6 },
    { label: `Retry cap reached (${event.retry_count} retries)`, triggered: event.retry_count >= 3 },
  ];
  const triggeredReasons = reasons.filter(r => r.triggered);

  return (
    <div className="glass rounded-xl overflow-hidden border border-danger/10">
      <div
        className="flex items-start gap-4 p-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
        id={`exception-${event.id.slice(0, 8)}`}
      >
        <div className="w-8 h-8 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4 text-danger" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-semibold text-text font-mono">{event.merchant_id}</span>
            <span className="text-xs text-muted">→</span>
            <span className="text-sm font-mono text-text">₹{event.amount.toLocaleString()}</span>
            <StatusBadge status={event.status} />
          </div>
          <div className="text-xs text-text-2 mb-2 font-mono truncate">{event.failure_reason_raw}</div>
          <div className="flex flex-wrap gap-2">
            {triggeredReasons.map(r => (
              <span key={r.label} className="flex items-center gap-1.5 text-xs bg-danger/10 text-danger px-2 py-1 rounded-md">
                <XCircle className="w-3 h-3" />
                {r.label}
              </span>
            ))}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-border p-5 bg-black/20">
          <div className="grid grid-cols-2 gap-5 text-xs">
            <div>
              <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Raw Failure Reason</div>
              <div className="font-mono bg-black/40 p-3 rounded-lg text-text-2">{event.failure_reason_raw}</div>
              <div className="text-muted mt-3 mb-1.5 font-medium uppercase tracking-wider text-[10px]">Agent Reasoning</div>
              <div className="text-text-2 leading-relaxed">{event.reasoning || 'No reasoning available.'}</div>
            </div>
            <div>
              <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Guardrail Evaluation</div>
              <div className="flex flex-col gap-2">
                {reasons.map(r => (
                  <div key={r.label} className={cn("flex items-center gap-2", r.triggered ? "text-danger" : "text-success")}>
                    {r.triggered ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>{r.label}</span>
                  </div>
                ))}
                {event.guardrail_checks_passed && JSON.parse(event.guardrail_checks_passed).map((g: string) => (
                  <div key={g} className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="capitalize">{g.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Event Details</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Customer', event.customer_id],
                    ['Type', event.event_type.replace(/_/g, ' ')],
                    ['Split', event.split],
                    ['Retries', String(event.retry_count)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-muted text-[10px]">{k}</div>
                      <div className="text-text-2 font-mono">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function MetricCard({ id, title, value, sub, icon, iconBg, iconColor, trend, alert }: {
  id: string;
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; up: boolean; label: string };
  alert?: boolean;
}) {
  return (
    <div id={id} className={cn("glass rounded-xl p-5 flex flex-col gap-4 transition-all duration-300", alert && "border-danger/20")}>
      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center", iconBg, iconColor)}>
          {icon}
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trend.up ? "text-success" : "text-danger")}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </div>
        )}
      </div>
      <div>
        <div className="text-sm font-bold text-muted mb-1 uppercase tracking-wider">{title}</div>
        <div className="text-2xl font-bold font-mono text-black tracking-tight">{value}</div>
        {sub && <div className="text-xs font-medium text-text-2 mt-1">{sub}</div>}
        {trend && <div className="text-[10px] text-muted mt-1">{trend.label}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-text-2', bg: 'bg-white/5', dot: 'bg-text-2' };
  return (
    <span className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium", cfg.color, cfg.bg)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: 'asc' | 'desc' }) {
  if (col !== sortCol) return <ChevronDown className="w-3 h-3 text-muted opacity-40" />;
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
}

function EventTable({
  events,
  compact,
  sortCol,
  sortDir,
  onSort,
}: {
  events: Event[];
  compact?: boolean;
  sortCol?: 'amount' | 'created_at';
  sortDir?: 'asc' | 'desc';
  onSort?: (col: 'amount' | 'created_at') => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-surface-2/90 backdrop-blur-sm">
        <tr className="border-b border-border">
          <th className="text-left px-5 py-3 text-xs font-medium text-muted">Merchant</th>
          <th
            className={cn("text-right px-5 py-3 text-xs font-medium", onSort ? "text-muted cursor-pointer hover:text-text select-none" : "text-muted")}
            onClick={() => onSort?.('amount')}
          >
            <span className="flex items-center justify-end gap-1">
              Amount {onSort && <SortIcon col="amount" sortCol={sortCol!} sortDir={sortDir!} />}
            </span>
          </th>
          <th className="text-left px-5 py-3 text-xs font-medium text-muted">Status</th>
          <th className="text-left px-5 py-3 text-xs font-medium text-muted">Root Cause</th>
          {!compact && <th className="text-left px-5 py-3 text-xs font-medium text-muted">Action</th>}
          {!compact && <th className="text-left px-5 py-3 text-xs font-medium text-muted">Confidence</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {events.map(event => (
          <EventRow key={event.id} event={event} compact={compact} />
        ))}
        {events.length === 0 && (
          <tr>
            <td colSpan={6} className="px-5 py-12 text-center text-muted text-sm">No events found</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function EventRow({ event, compact }: { event: Event; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-white/[0.025] cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
        id={`event-${event.id.slice(0, 8)}`}
      >
        <td className="px-5 py-3.5">
          <div className="font-mono text-xs text-text font-medium">{event.merchant_id}</div>
          <div className="text-[10px] text-muted font-mono mt-0.5">{event.customer_id}</div>
        </td>
        <td className="px-5 py-3.5 text-right">
          <span className="font-mono font-semibold text-text">₹{event.amount.toLocaleString()}</span>
          {event.amount > 50000 && (
            <span className="ml-2 text-[9px] text-danger font-bold uppercase tracking-wider bg-danger/10 px-1 py-0.5 rounded">High Value</span>
          )}
        </td>
        <td className="px-5 py-3.5">
          <StatusBadge status={event.status} />
        </td>
        <td className="px-5 py-3.5 text-xs text-text-2">
          {event.classified_root_cause
            ? ROOT_CAUSE_LABELS[event.classified_root_cause] ?? event.classified_root_cause
            : <span className="text-muted italic">Unprocessed</span>}
        </td>
        {!compact && (
          <td className="px-5 py-3.5 text-xs text-text-2 capitalize">
            {event.action_type ? event.action_type.replace(/_/g, ' ') : <span className="text-muted">—</span>}
          </td>
        )}
        {!compact && (
          <td className="px-5 py-3.5">
            {event.classifier_confidence != null ? (
              <div className="flex items-center gap-2">
                <div className="w-14 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", event.classifier_confidence >= 0.6 ? "bg-success" : "bg-danger")}
                    style={{ width: `${event.classifier_confidence * 100}%` }}
                  />
                </div>
                <span className={cn("text-xs font-mono", event.classifier_confidence >= 0.6 ? "text-success" : "text-danger")}>
                  {(event.classifier_confidence * 100).toFixed(0)}%
                </span>
              </div>
            ) : <span className="text-muted text-xs">—</span>}
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="bg-black/20">
          <td colSpan={compact ? 4 : 6} className="px-5 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-5 text-xs border-t border-border pt-4">
              <div>
                <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Raw Failure Reason</div>
                <div className="font-mono bg-black/40 p-3 rounded-lg text-text-2 mb-3">{event.failure_reason_raw}</div>
                <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Agent Reasoning</div>
                <div className="text-text-2 leading-relaxed">{event.reasoning || <span className="italic text-muted">Not yet processed</span>}</div>
              </div>
              <div>
                <div className="text-muted mb-1.5 font-medium uppercase tracking-wider text-[10px]">Guardrail Checks</div>
                <div className="flex flex-col gap-1.5">
                  {event.guardrail_checks_passed
                    ? JSON.parse(event.guardrail_checks_passed).map((g: string) => (
                      <div key={g} className="flex items-center gap-2 text-success">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="capitalize">{g.replace(/_/g, ' ')}</span>
                      </div>
                    ))
                    : <div className="text-muted italic">Not evaluated</div>
                  }
                  {event.amount > 50000 && (
                    <div className="flex items-center gap-2 text-danger font-medium mt-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Amount exceeds ₹50,000 — human required
                    </div>
                  )}
                  {event.classifier_confidence != null && event.classifier_confidence < 0.6 && (
                    <div className="flex items-center gap-2 text-danger font-medium mt-1">
                      <XCircle className="w-3.5 h-3.5" />
                      Low confidence ({event.classifier_confidence.toFixed(2)}) — human required
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
                  {[
                    ['Ground Truth', ROOT_CAUSE_LABELS[event.ground_truth_root_cause] ?? event.ground_truth_root_cause],
                    ['Split', event.split],
                    ['Retries', String(event.retry_count)],
                    ['Event Type', event.event_type.replace(/_/g, ' ')],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-muted text-[10px] mb-0.5 uppercase tracking-wider">{k}</div>
                      <div className="text-text-2 font-mono capitalize">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
