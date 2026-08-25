import { db, initDb } from './db';
import { randomUUID } from 'crypto';

const MERCHANTS = ['MERCH_SaaS_01', 'MERCH_D2C_02', 'MERCH_MKT_03', 'MERCH_SaaS_04', 'MERCH_D2C_05', 'MERCH_B2B_06'];

const SAMPLE_DATA = [
  // clean
  { raw: "insufficient_funds", truth: "insufficient_funds" },
  { raw: "card_expired", truth: "card_expired" },
  // messy
  { raw: "card declined by issuing bank pls retry", truth: "do_not_honor" },
  { raw: "usr closed tab at otp", truth: "abandoned_at_otp" },
  { raw: "fraud suspected by gateway", truth: "fraud_suspected" },
  { raw: "exceeded limit on card", truth: "limit_exceeded" },
  { raw: "network timeout during 3ds", truth: "network_error" },
  { raw: "wrong cvv entered twice", truth: "invalid_details" },
];

function generateEvents(count: number) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const isHoldout = i % 4 === 0; // 25% holdout
    const sample = SAMPLE_DATA[i % SAMPLE_DATA.length];
    const amount = Math.random() > 0.9 ? 55000 + Math.random() * 10000 : 500 + Math.random() * 5000;
    
    events.push({
      id: randomUUID(),
      event_type: Math.random() > 0.5 ? 'subscription_failure' : 'checkout_dropoff',
      merchant_id: MERCHANTS[i % MERCHANTS.length],
      customer_id: `CUST_${Math.floor(Math.random() * 10000)}`,
      amount: parseFloat(amount.toFixed(2)),
      failure_reason_raw: sample.raw,
      checkout_stage_reached: Math.random() > 0.5 ? 'otp_sent' : 'payment_method_selected',
      ground_truth_root_cause: sample.truth,
      split: isHoldout ? 'holdout' : 'train',
      retry_count: Math.floor(Math.random() * 3)
    });
  }
  return events;
}

export function seed() {
  initDb();
  
  db.exec('DELETE FROM recovery_actions');
  db.exec('DELETE FROM revenue_events');

  const insert = db.prepare(`
    INSERT INTO revenue_events (id, event_type, merchant_id, customer_id, amount, failure_reason_raw, checkout_stage_reached, ground_truth_root_cause, split, retry_count)
    VALUES (@id, @event_type, @merchant_id, @customer_id, @amount, @failure_reason_raw, @checkout_stage_reached, @ground_truth_root_cause, @split, @retry_count)
  `);

  const events = generateEvents(80);
  
  const insertMany = db.transaction((events) => {
    for (const event of events) {
      insert.run(event);
    }
  });

  insertMany(events);
  console.log(`Seeded ${events.length} events.`);
}

if (require.main === module) {
  seed();
}
