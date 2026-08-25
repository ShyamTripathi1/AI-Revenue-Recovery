import { OpenAI } from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { db } from "./db";
import { decideAction, checkGuardrails, ActionType, RootCause } from "./decision-rules";
import { randomUUID } from "crypto";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "mock-key",
});

const ClassificationSchema = z.object({
  rootCause: z.enum([
    'insufficient_funds', 'card_expired', 'do_not_honor', 
    'abandoned_at_otp', 'fraud_suspected', 'limit_exceeded', 
    'network_error', 'invalid_details', 'unknown'
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

async function classifyEvent(failureReasonRaw: string, amount: number, stage: string | null) {
  if (process.env.OPENAI_API_KEY) {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI revenue recovery classifier. Determine the root cause of a payment failure based on raw logs." },
        { role: "user", content: `Raw reason: ${failureReasonRaw}\nAmount: ${amount}\nStage: ${stage}` }
      ],
      response_format: zodResponseFormat(ClassificationSchema, "classification"),
    });
    return completion.choices[0].message.parsed;
  }
  
  // Mock LLM call for predictable demo without key
  await new Promise(resolve => setTimeout(resolve, 500));
  let rootCause = 'unknown';
  const r = failureReasonRaw.toLowerCase();
  if (r.includes('insufficient') || r.includes('funds')) rootCause = 'insufficient_funds';
  else if (r.includes('expired')) rootCause = 'card_expired';
  else if (r.includes('declined') || r.includes('honor')) rootCause = 'do_not_honor';
  else if (r.includes('otp')) rootCause = 'abandoned_at_otp';
  else if (r.includes('fraud')) rootCause = 'fraud_suspected';
  else if (r.includes('limit')) rootCause = 'limit_exceeded';
  else if (r.includes('network') || r.includes('timeout')) rootCause = 'network_error';
  else if (r.includes('cvv') || r.includes('invalid')) rootCause = 'invalid_details';
  
  return {
    rootCause: rootCause as RootCause,
    confidence: rootCause === 'unknown' ? 0.4 : 0.85 + (Math.random() * 0.1),
    reasoning: `Based on the text "${failureReasonRaw}", this appears to be a ${rootCause} issue.`
  };
}

export async function processEvent(eventId: string) {
  const event = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(eventId) as any;
  if (!event || event.status !== 'open') return;

  db.prepare('UPDATE revenue_events SET status = ? WHERE id = ?').run('in_progress', eventId);

  try {
    const classification = await classifyEvent(event.failure_reason_raw, event.amount, event.checkout_stage_reached);
    const rootCause = classification?.rootCause || 'unknown';
    const confidence = classification?.confidence || 0;
    const reasoning = classification?.reasoning || 'Classification failed';

    const passedGuardrails = checkGuardrails(event.amount, event.retry_count, confidence);
    
    let action: ActionType = 'escalate_human';
    if (!passedGuardrails.includes('confidence_threshold_met')) {
      action = 'escalate_human';
    } else {
      action = decideAction(rootCause, event.amount, event.retry_count, event.checkout_stage_reached);
    }

    // Simulate execution
    let result = 'pending';
    let amountRecovered = null;
    if (action === 'escalate_human' || action === 'stop_no_action') {
      result = 'skipped';
    } else {
      // Simulate network request
      await new Promise(r => setTimeout(r, 600));
      if (Math.random() > 0.3) {
        result = 'success';
        amountRecovered = event.amount;
      } else {
        result = 'failed';
      }
    }

    const nextStatus = result === 'success' ? 'recovered' : 
                       (action === 'escalate_human' ? 'escalated' : 
                       (event.retry_count >= 2 ? 'exhausted' : 'open'));

    db.transaction(() => {
      db.prepare(`
        INSERT INTO recovery_actions (id, event_id, action_type, classified_root_cause, classifier_confidence, reasoning, guardrail_checks_passed, result, amount_recovered)
        VALUES (@id, @event_id, @action_type, @classified_root_cause, @classifier_confidence, @reasoning, @guardrail_checks_passed, @result, @amount_recovered)
      `).run({
        id: randomUUID(),
        event_id: eventId,
        action_type: action,
        classified_root_cause: rootCause,
        classifier_confidence: confidence,
        reasoning,
        guardrail_checks_passed: JSON.stringify(passedGuardrails),
        result,
        amount_recovered: amountRecovered
      });
      
      db.prepare('UPDATE revenue_events SET status = ?, retry_count = retry_count + 1 WHERE id = ?').run(nextStatus, eventId);
    })();
    
    return { eventId, nextStatus, action };
  } catch (err) {
    console.error("Error processing event", eventId, err);
    db.prepare('UPDATE revenue_events SET status = ? WHERE id = ?').run('open', eventId);
  }
}
