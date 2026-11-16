import { clientCallStateOf } from '../client-calls/client-call-state.util';
import { CLIENT_CALL_ANALYSIS_GRACE_MS } from '../client-calls/client-calls.const';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

describe('clientCallStateOf', () => {
    it('строки расшифровки нет — звонок ещё не разбирался', () => {
        expect(
            clientCallStateOf({
                status: undefined,
                hasAnalysis: false,
                updatedAt: null,
                now: NOW,
            }),
        ).toBe('none');
    });

    it.each(['queued', 'processing'])('статус «%s» — разбирается', status => {
        expect(
            clientCallStateOf({
                status,
                hasAnalysis: false,
                updatedAt: ago(60_000),
                now: NOW,
            }),
        ).toBe('processing');
    });

    it('расшифровка упала — разобрать не удалось', () => {
        expect(
            clientCallStateOf({
                status: 'error',
                hasAnalysis: false,
                updatedAt: ago(60_000),
                now: NOW,
            }),
        ).toBe('failed');
    });

    it('расшифровка готова недавно, разбора ещё нет — разбирается', () => {
        expect(
            clientCallStateOf({
                status: 'done',
                hasAnalysis: false,
                updatedAt: ago(CLIENT_CALL_ANALYSIS_GRACE_MS - 1),
                now: NOW,
            }),
        ).toBe('processing');
    });

    it('расшифровка готова давно, разбора нет — разбор не делался', () => {
        expect(
            clientCallStateOf({
                status: 'done',
                hasAnalysis: false,
                updatedAt: ago(CLIENT_CALL_ANALYSIS_GRACE_MS),
                now: NOW,
            }),
        ).toBe('skipped');
        expect(
            clientCallStateOf({
                status: 'done',
                hasAnalysis: false,
                updatedAt: null,
                now: NOW,
            }),
        ).toBe('skipped');
    });

    it('готовый разбор важнее статуса строки: повторный разбор его не прячет', () => {
        expect(
            clientCallStateOf({
                status: 'processing',
                hasAnalysis: true,
                updatedAt: ago(60_000),
                now: NOW,
            }),
        ).toBe('analyzed');
    });

    it('незнакомый статус читается как «не разбирался»', () => {
        expect(
            clientCallStateOf({
                status: null,
                hasAnalysis: false,
                updatedAt: null,
                now: NOW,
            }),
        ).toBe('none');
    });
});
