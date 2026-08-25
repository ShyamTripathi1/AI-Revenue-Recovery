import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { db } from './db';
import { processEvent } from './agent';
import { seed } from './seed';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize DB on start
try {
  seed();
} catch (e) {
  console.log("DB already initialized or error", e);
}

app.get('/api/events', (req, res) => {
  const events = db.prepare(`
    SELECT e.*, a.action_type, a.classified_root_cause, a.classifier_confidence, a.reasoning, a.guardrail_checks_passed, a.result
    FROM revenue_events e
    LEFT JOIN recovery_actions a ON e.id = a.event_id
    ORDER BY e.created_at DESC
  `).all();
  res.json(events);
});

app.get('/api/events/:id', (req, res) => {
  const event = db.prepare(`
    SELECT e.*, a.action_type, a.classified_root_cause, a.classifier_confidence, a.reasoning, a.guardrail_checks_passed, a.result, a.amount_recovered, a.executed_at
    FROM revenue_events e
    LEFT JOIN recovery_actions a ON e.id = a.event_id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

app.post('/api/run-batch', async (req, res) => {
  const openEvents = db.prepare("SELECT id FROM revenue_events WHERE status = 'open' LIMIT 10").all() as {id: string}[];
  // Start background processing
  (async () => {
    for (const event of openEvents) {
      await processEvent(event.id);
    }
  })();
  res.json({ message: "Batch started", count: openEvents.length });
});

app.post('/api/reset', (req, res) => {
  try {
    seed();
    res.json({ message: "Database reset and re-seeded successfully" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/metrics', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as count FROM revenue_events").get() as any;
  const recovered = db.prepare("SELECT COUNT(*) as count, SUM(amount) as sum FROM revenue_events WHERE status = 'recovered'").get() as any;
  const atRisk = db.prepare("SELECT SUM(amount) as sum FROM revenue_events WHERE status = 'open'").get() as any;
  const escalated = db.prepare("SELECT COUNT(*) as count FROM revenue_events WHERE status = 'escalated'").get() as any;
  const open = db.prepare("SELECT COUNT(*) as count FROM revenue_events WHERE status = 'open'").get() as any;
  
  // Calculate accuracy on holdout
  const holdoutEvents = db.prepare("SELECT e.ground_truth_root_cause, a.classified_root_cause FROM revenue_events e JOIN recovery_actions a ON e.id = a.event_id WHERE e.split = 'holdout'").all() as any[];
  let correct = 0;
  for (const h of holdoutEvents) {
    if (h.ground_truth_root_cause === h.classified_root_cause) correct++;
  }
  const accuracy = holdoutEvents.length > 0 ? (correct / holdoutEvents.length) * 100 : 0;

  res.json({
    total_events: total.count,
    amount_recovered: recovered.sum || 0,
    recovered_count: recovered.count || 0,
    amount_at_risk: atRisk.sum || 0,
    escalated_count: escalated.count,
    open_count: open.count,
    holdout_accuracy: accuracy.toFixed(1),
    holdout_evaluated: holdoutEvents.length
  });
});

app.get('/api/charts', (req, res) => {
  // Root cause distribution (of processed events)
  const rootCauses = db.prepare(`
    SELECT a.classified_root_cause as name, COUNT(*) as value
    FROM recovery_actions a
    WHERE a.classified_root_cause IS NOT NULL
    GROUP BY a.classified_root_cause
    ORDER BY value DESC
  `).all() as any[];

  // Action type breakdown with success rates
  const actionBreakdown = db.prepare(`
    SELECT 
      a.action_type as action,
      COUNT(*) as total,
      SUM(CASE WHEN a.result = 'success' THEN 1 ELSE 0 END) as successes
    FROM recovery_actions a
    WHERE a.action_type IS NOT NULL
    GROUP BY a.action_type
    ORDER BY total DESC
  `).all() as any[];

  const actionStats = actionBreakdown.map((row: any) => ({
    action: row.action.replace(/_/g, ' '),
    total: row.total,
    success_rate: row.total > 0 ? parseFloat(((row.successes / row.total) * 100).toFixed(1)) : 0,
    successes: row.successes,
  }));

  // Recovery by event type
  const byEventType = db.prepare(`
    SELECT 
      e.event_type,
      SUM(CASE WHEN e.status = 'recovered' THEN e.amount ELSE 0 END) as recovered,
      SUM(CASE WHEN e.status != 'recovered' THEN e.amount ELSE 0 END) as lost,
      COUNT(*) as total
    FROM revenue_events e
    GROUP BY e.event_type
  `).all() as any[];

  // Status distribution
  const statusDist = db.prepare(`
    SELECT status as name, COUNT(*) as value
    FROM revenue_events
    GROUP BY status
    ORDER BY value DESC
  `).all() as any[];

  // Amount recovery funnel (simulate 7-day trend using event ordering)
  const events = db.prepare(`
    SELECT e.created_at, e.amount, e.status
    FROM revenue_events e
    ORDER BY e.created_at ASC
  `).all() as any[];

  // Group into 8 buckets to simulate time progression
  const BUCKETS = 7;
  const bucketSize = Math.ceil(events.length / BUCKETS);
  const trend = Array.from({ length: BUCKETS }, (_, i) => {
    const slice = events.slice(i * bucketSize, (i + 1) * bucketSize) as any[];
    const recovered = slice.filter((e: any) => e.status === 'recovered').reduce((sum: number, e: any) => sum + e.amount, 0);
    const atRisk = slice.filter((e: any) => e.status === 'open' || e.status === 'escalated').reduce((sum: number, e: any) => sum + e.amount, 0);
    const dayLabel = `Day ${i + 1}`;
    return { day: dayLabel, recovered: Math.round(recovered), at_risk: Math.round(atRisk) };
  });

  res.json({
    root_causes: rootCauses,
    action_stats: actionStats,
    by_event_type: byEventType,
    status_distribution: statusDist,
    recovery_trend: trend,
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`RecoverAI Backend running on http://localhost:${PORT}`);
});
