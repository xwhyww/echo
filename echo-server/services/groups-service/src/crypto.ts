import { createRowCipher } from '@echo/shared';
import { config } from './config.js';

/**
 * The row cipher for group messages, bound to this service's keys.
 *
 * All the logic lives in `@echo/shared` — which fields are sensitive and how a
 * pre-migration row behaves are the same questions in every messages table, and
 * three answers to them is how one quietly stops matching the others.
 */
export const { encryptForInsert, decryptRow, stripCiphertext } = createRowCipher(config.encryption);
