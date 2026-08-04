import { createLogger } from '@echo/shared/logger';

// Service-wide logger. Every record carries name=pers-chats-service plus the requestId/userId
// of the request in flight (see @echo/shared/logger).
export const log = createLogger('pers-chats-service');
