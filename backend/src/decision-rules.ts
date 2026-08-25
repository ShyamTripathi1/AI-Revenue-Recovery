export type RootCause = 
  | 'insufficient_funds'
  | 'card_expired'
  | 'do_not_honor'
  | 'abandoned_at_otp'
  | 'fraud_suspected'
  | 'limit_exceeded'
  | 'network_error'
  | 'invalid_details'
  | 'unknown';

export type ActionType = 
  | 'retry_payment'
  | 'send_reminder_email'
  | 'send_reminder_sms'
  | 'offer_alt_payment_method'
  | 'escalate_human'
  | 'stop_no_action';

export function decideAction(
  rootCause: RootCause,
  amount: number,
  retryCount: number,
  checkoutStage: string | null
): ActionType {
  // Hard limit escalation
  if (amount > 50000) {
    return 'escalate_human';
  }

  // Max retries
  if (retryCount >= 3) {
    return 'escalate_human';
  }

  // Decision table
  switch (rootCause) {
    case 'insufficient_funds':
    case 'limit_exceeded':
      return 'send_reminder_sms'; // Don't retry immediately if they have no money
    
    case 'network_error':
    case 'do_not_honor':
      return 'retry_payment';
      
    case 'abandoned_at_otp':
      return 'send_reminder_email';
      
    case 'card_expired':
    case 'invalid_details':
      return 'offer_alt_payment_method';
      
    case 'fraud_suspected':
      return 'escalate_human';
      
    case 'unknown':
    default:
      return 'escalate_human';
  }
}

export function checkGuardrails(amount: number, retryCount: number, confidence: number): string[] {
  const passed = [];
  if (amount <= 50000) passed.push('under_amount_threshold');
  if (retryCount < 3) passed.push('under_retry_cap');
  if (confidence >= 0.6) passed.push('confidence_threshold_met');
  return passed;
}
