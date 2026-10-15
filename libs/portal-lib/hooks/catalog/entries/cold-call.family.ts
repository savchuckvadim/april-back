import { HookCatalogEntry } from '../hook-catalog.types';
import { COLD_CALL_V2_ENTRY } from './cold-call-v2.entry';
import { COLD_CALL_ENTRY } from './cold-call.entry';
import { XO_DISPATCH_RESCUE_ENTRY } from './xo-dispatch-rescue.entry';
import { REJECT_REVIVE_ENTRY } from './reject-revive.entry';
import { REJECT_BUFFER_ENTRY } from './reject-buffer.entry';

/**
 * Семейство холодного обзвона: cold-call-v2, cold-call (v1, заморожен),
 * подстраховка ХО, реанимация отказников, буфер отказников.
 */
export const COLD_CALL_FAMILY_ENTRIES: HookCatalogEntry[] = [
    COLD_CALL_V2_ENTRY,
    COLD_CALL_ENTRY,
    XO_DISPATCH_RESCUE_ENTRY,
    REJECT_REVIVE_ENTRY,
    REJECT_BUFFER_ENTRY,
];
