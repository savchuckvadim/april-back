import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    NO_REPORT_TAKEOVER,
    parseProtectFromStage,
    protectedStageIds,
    ReportTakeoverSettings,
    takeoverOptionsFor,
} from '../services/takeover/takeover.settings';

/** Настройки перехвата клиента: когда он действует и какие стадии защищены. */
const settings = (
    over: Partial<ReportTakeoverSettings>,
): ReportTakeoverSettings => ({
    ...NO_REPORT_TAKEOVER,
    ...over,
});

describe('takeoverOptionsFor — когда перехват всей работы действует', () => {
    it('force с подтверждением — только после явного «Забрать себе»', () => {
        const s = settings({ force: true, confirm: true });

        expect(takeoverOptionsFor(s, true).force).toBe(true);
        expect(takeoverOptionsFor(s, false).force).toBe(false);
        expect(takeoverOptionsFor(s, undefined).force).toBe(false);
    });

    it('force без подтверждения — всегда', () => {
        expect(
            takeoverOptionsFor(
                settings({ force: true, confirm: false }),
                undefined,
            ).force,
        ).toBe(true);
    });

    it('force выключен — ответ менеджера ничего не включает', () => {
        expect(takeoverOptionsFor(settings({ force: false }), true).force).toBe(
            false,
        );
    });

    it('боты и защита передаются как есть', () => {
        const options = takeoverOptionsFor(
            settings({
                botOwnerIds: [643],
                protectFromStage: 'sales_offer_create',
            }),
            undefined,
        );

        expect(options.botOwnerIds).toEqual([643]);
        expect(options.protectFromStage).toBe('sales_offer_create');
    });
});

describe('parseProtectFromStage', () => {
    it('код стадии лестницы — принимается', () => {
        expect(parseProtectFromStage('sales_money_await')).toBe(
            'sales_money_await',
        );
    });

    it('пусто и мусор — защиты нет', () => {
        expect(parseProtectFromStage('')).toBeNull();
        // «Без защиты» в админке — непустой код (Radix Select).
        expect(parseProtectFromStage('none')).toBeNull();
        expect(parseProtectFromStage('sales_unknown')).toBeNull();
        expect(parseProtectFromStage(undefined)).toBeNull();
    });
});

describe('protectedStageIds', () => {
    const stage = (code: string, bitrixId: string) => ({
        code,
        bitrixId,
        name: code,
        order: 0,
    });
    const category = {
        bitrixId: 97,
        code: 'sales_base',
        stages: [
            stage('sales_warm', 'WARM'),
            stage('sales_offer_create', 'OFFER_CREATE'),
            stage('sales_money_await', 'MONEY_AWAIT'),
            stage('sales_success', 'WON'),
            stage('sales_fail', 'LOSE'),
        ],
    } as unknown as IPCategory;

    it('от стадии настройки и до «Успеха» (не включая)', () => {
        expect([...protectedStageIds(category, 'sales_offer_create')]).toEqual([
            'C97:OFFER_CREATE',
            'C97:MONEY_AWAIT',
        ]);
    });

    it('настройки нет — ничего не защищено', () => {
        expect(protectedStageIds(category, null).size).toBe(0);
    });
});
