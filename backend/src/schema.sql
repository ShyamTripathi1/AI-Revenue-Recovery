CREATE TABLE IF NOT EXISTS revenue_events (
  id TEXT PRIMARY KEY,
  event_type TEXT CHECK(event_type IN ('subscription_failure', 'checkout_dropoff')),
  merchant_id TEXT,
  customer_id TEXT,
  amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  failure_reason_raw TEXT,
  checkout_stage_reached TEXT,
  ground_truth_root_cause TEXT,
  split TEXT CHECK(split IN ('train', 'holdout')),
  retry_count INTEGER DEFAULT 0,
  status TEXT CHECK(status IN ('open', 'in_progress', 'recovered', 'exhausted', 'escalated', 'excluded')) DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS recovery_actions (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  action_type TEXT CHECK(action_type IN ('retry_payment', 'send_reminder_email', 'send_reminder_sms', 'offer_alt_payment_method', 'escalate_human', 'stop_no_action')),
  classified_root_cause TEXT,
  classifier_confidence REAL,
  reasoning TEXT,
  guardrail_checks_passed TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  result TEXT CHECK(result IN ('success', 'failed', 'pending', 'skipped')),
  amount_recovered REAL,
  FOREIGN KEY(event_id) REFERENCES revenue_events(id)
);
