import { createRowCipher } from '@echo/shared';
import { config } from './config.js';

/**
 * The row cipher for voice-channel chat messages, bound to this service's keys.
 * Same helper as groups-service and pers-chats-service — see
 * `@echo/shared/crypto` for what it does and why it is not written three times.
 */
export const { encryptForInsert, decryptRow, stripCiphertext } = createRowCipher(config.encryption);
