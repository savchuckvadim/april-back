import {
    decideTmcApprovalRescue,
    TMC_APPROVAL_BACKOFF_MINUTES,
    TMC_APPROVAL_MAX_ATTEMPTS,
    TmcApprovalRescueThresholds,
} from '../lib/tmc-approval-rescue.decision';

/**
 * Решение по утверждённой заявке: пауза роботу, признак «обработано»,
 * лестница повторов. Чистая функция — моменты задаются явно.
 */
const NOW = new Date('2026-11-02T12:00:00.000Z');
const minutesAgo = (minutes: number): Date =>
    new Date(NOW.getTime() - minutes * 60_000);

const thresholds: TmcApprovalRescueThresholds = {
    now: NOW,
    graceMinutes: 20,
    maxAttempts: TMC_APPROVAL_MAX_ATTEMPTS,
    backoffMinutes: TMC_APPROVAL_BACKOFF_MINUTES,
};

const decide = (
    over: Partial<Parameters<typeof decideTmcApprovalRescue>[0]> = {},
) =>
    decideTmcApprovalRescue(
        { movedAt: minutesAgo(45), processed: false, marker: null, ...over },
        thresholds,
    );

describe('decideTmcApprovalRescue', () => {
    it('утверждена 45 минут назад, не обработана, попыток не было — ставим', () => {
        expect(decide()).toEqual({ action: 'dispatch', reason: 'dispatch' });
    });

    it('без времени утверждения паузу роботу не отмерить — пропуск', () => {
        expect(decide({ movedAt: null }).reason).toBe('no-moved-time');
    });

    it('внутри паузы роботу — слишком свежая, даже если «не обработана»', () => {
        expect(decide({ movedAt: minutesAgo(10) }).reason).toBe('too-fresh');
        expect(decide({ movedAt: minutesAgo(20) }).reason).toBe('dispatch');
    });

    it('презентация уже запланирована — пропуск независимо от попыток', () => {
        expect(decide({ processed: true }).reason).toBe('processed');
    });

    it('лестница повторов: час после первой попытки, шесть часов после второй, после третьей — стоп', () => {
        const marker = (attempts: number, minutesSince: number) => ({
            attempts,
            lastAt: minutesAgo(minutesSince).toISOString(),
        });

        expect(decide({ marker: marker(1, 30) }).reason).toBe('backoff');
        expect(decide({ marker: marker(1, 61) }).reason).toBe('dispatch');
        expect(decide({ marker: marker(2, 5 * 60) }).reason).toBe('backoff');
        expect(decide({ marker: marker(2, 7 * 60) }).reason).toBe('dispatch');
        expect(decide({ marker: marker(3, 48 * 60) }).reason).toBe(
            'attempts-exhausted',
        );
    });

    it('метка с нечитаемым временем не блокирует повтор', () => {
        expect(
            decide({ marker: { attempts: 1, lastAt: 'мусор' } }).reason,
        ).toBe('dispatch');
    });
});
