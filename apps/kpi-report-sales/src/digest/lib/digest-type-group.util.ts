import {
    KPI_DIGEST_CALL_TYPE_CODES,
    KPI_DIGEST_DOCUMENT_TYPE_CODES,
    KPI_DIGEST_FAIL_TYPE_CODE,
    KPI_DIGEST_MEETING_TYPE_CODES,
    KPI_DIGEST_PRESENTATION_TYPE_CODE,
    KPI_DIGEST_SUCCESS_TYPE_CODE,
    KpiDigestTypeGroup,
} from '../constants/digest.const';

const CALL_TYPES = new Set<string>(KPI_DIGEST_CALL_TYPE_CODES);
const MEETING_TYPES = new Set<string>(KPI_DIGEST_MEETING_TYPE_CODES);
const DOCUMENT_TYPES = new Set<string>(KPI_DIGEST_DOCUMENT_TYPE_CODES);

/** Группа типа события по коду item'а (без префикса списка). */
export function typeGroupOf(code: string | null | undefined): KpiDigestTypeGroup {
    if (!code) return 'other';
    if (CALL_TYPES.has(code)) return 'call';
    if (code === KPI_DIGEST_PRESENTATION_TYPE_CODE) return 'presentation';
    if (MEETING_TYPES.has(code)) return 'meeting';
    if (DOCUMENT_TYPES.has(code)) return 'document';
    if (code === KPI_DIGEST_SUCCESS_TYPE_CODE || code === KPI_DIGEST_FAIL_TYPE_CODE) {
        return 'outcome';
    }
    return 'other';
}
