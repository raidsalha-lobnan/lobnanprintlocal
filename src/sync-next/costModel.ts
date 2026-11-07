export interface CostEstimate {
  minWrites: number;
  minTransactionReads: number;
  perReceivingDeviceEventReads: number;
}

export function estimateCommandCost(
  entityWrites: number,
  receivingDevices = 1
): CostEstimate {
  if (
    !Number.isSafeInteger(entityWrites) ||
    entityWrites < 1 ||
    entityWrites > 80
  ) {
    throw new Error('Invalid write count');
  }

  if (
    !Number.isSafeInteger(receivingDevices) ||
    receivingDevices < 0
  ) {
    throw new Error('Invalid device count');
  }

  return {
    minWrites: entityWrites + 2, // event receipt + sequential feed counter
    minTransactionReads: entityWrites + 2, // idempotency receipt + feed counter
    perReceivingDeviceEventReads: receivingDevices
  };
}

export function pacificQuotaDay(
  date: Date = new Date()
): string {
  const parts = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(date);

  const get = (key: string) =>
    parts.find(p => p.type === key)?.value ?? '';

  return [
    get('year'),
    get('month'),
    get('day')
  ].join('-');
}
