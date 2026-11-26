import { POLYANSKY_METHODOLOGY, type ResolvedMethodology } from '@lib/call-lib';
import { DOMAIN, makeFocusService } from './call-focus-analysis.long.fixture';
import { markerOf, noLongCall, withLongCall } from './call-long-input.fake';

/**
 * Этап 4г: проход методики из проверки черновика (runMethodologyPass) тоже
 * получает текст длинного пути; расход подготовки входит в токены ответа.
 */
const FULL = 'ПОЛНАЯ-РАСШИФРОВКА: алло, добрый день';
const RESOLVED: ResolvedMethodology = {
    methodology: POLYANSKY_METHODOLOGY,
    scope: 'portal',
    source: 'table',
    versionTag: 'polyansky@1.0.0',
};
const ANSWER = { call_focus_methodology: { checkpoints: [], spirals: null } };

describe('CallFocusAnalysisService.runMethodologyPass: длинный разговор', () => {
    it('длинный путь: проход получает текст методики, токены включают подготовку', async () => {
        const { service, userOf, longCall } = makeFocusService({
            longCall: withLongCall(),
            responses: ANSWER,
        });

        const outcome = await service.runMethodologyPass(
            DOMAIN,
            FULL,
            'cold',
            RESOLVED,
            'ПАСПОРТ ЗВОНКА',
            { model: 'bitrix/own' },
        );

        const user = userOf('call_focus_methodology');
        expect(user).toContain('ПАСПОРТ ЗВОНКА');
        expect(user).toContain(
            `Разбери звонок по расшифровке:\n\n${markerOf('methodology')}`,
        );
        expect(user).not.toContain(FULL);
        expect(longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: 'bitrix/own',
            force: false,
        });
        // Ответ прохода 120 токенов и два ответа подготовки по 60.
        expect(outcome?.tokens).toBe(240);
    });

    it('longParts: force доходит до подготовки как force: true', async () => {
        const { service, longCall } = makeFocusService({
            longCall: withLongCall(),
            responses: ANSWER,
        });

        await service.runMethodologyPass(
            DOMAIN,
            FULL,
            'cold',
            RESOLVED,
            undefined,
            { longParts: 'force' },
        );

        expect(longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: undefined,
            force: true,
        });
    });

    it('короткий разговор (prepare → null): запрос и токены как раньше', async () => {
        const { service, userOf } = makeFocusService({
            longCall: noLongCall(),
            responses: ANSWER,
        });

        const outcome = await service.runMethodologyPass(
            DOMAIN,
            'текст разговора',
            'cold',
            RESOLVED,
        );

        expect(userOf('call_focus_methodology')).toBe(
            'Тип звонка по классификатору: Холодный (выход на ЛПР) ' +
                '(код для поля callType: cold).\n\n' +
                'Разбери звонок по расшифровке:\n\nтекст разговора',
        );
        expect(outcome?.tokens).toBe(120);
    });

    it('у методики нет прохода для типа звонка — подготовка не зовётся', async () => {
        const { service, longCall } = makeFocusService({
            longCall: withLongCall(),
        });

        const outcome = await service.runMethodologyPass(
            DOMAIN,
            FULL,
            'event_invite',
            {
                ...RESOLVED,
                methodology: {
                    ...POLYANSKY_METHODOLOGY,
                    types: [],
                    checkpoints: [],
                    spirals: { enabled: false, minFull: 0, types: [] },
                },
            },
        );

        expect(outcome).toBeNull();
        expect(longCall.prepare).not.toHaveBeenCalled();
    });
});
