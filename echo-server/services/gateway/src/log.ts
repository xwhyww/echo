import { createLogger } from '@echo/shared/logger';

// Service-wide logger. Every record carries name=gateway plus the requestId/userId
// of the request in flight (see @echo/shared/logger).
export const log = createLogger('gateway');
