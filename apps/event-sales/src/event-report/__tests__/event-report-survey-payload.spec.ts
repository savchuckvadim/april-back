import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesPresentationDealService } from '../services/deal/sales-presentation-deal.service';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';
import {
    EEventReportEntityType,
    EventReportEntityType,
} from '../services/init/event-report-init.types';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Анкета «5К/Хвост» ИЗ PAYLOAD отчёта: основной поток пишет ответы в лид,
 * сделки и компанию своим батчем — вместе с отчётом.
 *
 * Проверяем ровно то, ради чего анкету увели в payload:
 *  - состав полей у каждой цели (лид/сделки — весь, компания — сводные);
 *  - неустановленное поле → warning и пропуск, остальные пишутся;
 *  - payload без блока `survey` → ни одной новой команды (состав батча
 *    прежний, до последнего ключа).
 */
const XVOST = 'UF_CRM_OP_PRESENTATION_XVOST';
const FIVE_K_SUMMARY = 'UF_CRM_OP_PRESENTATION_5K';
const CLIENT_BLOCK = 'UF_CRM_OP_5K_CLIENT';
const XVOST_DESIRE = 'UF_CRM_OP_XVOST_DESIRE';

const SURVEY = {
    xvost: '  Дожать по хвосту через неделю  ',
    fiveKSummary: 'Сводка 5К по последней презентации',
    fiveK: {
        op_5k_client: 'Хочет замену Консультанта',
        op_left_code: 'левый код — молча отбрасывается',
    },
    talk: { op_xvost_desire: 'Встретили хорошо' },
};

/**
 * Портал: анкета заведена на лиде, сделке и (в этом фейке) на компании —
 * так проверяется СОСТАВ полей у каждой цели, а не реестр конкретного
 * портала. `installedOn` сужает установку до нужных сущностей.
 */
const makePortal = (
    installedOn: readonly string[] = ['lead', 'deal', 'company'],
) => ({
    getTimezone: () => 'Europe/Moscow',
    getEntityFieldByCode: (entity: string, code: string) => {
        const isSurvey =
            code === 'op_presentation_xvost' ||
            code === 'op_presentation_5k' ||
            code.startsWith('op_5k_') ||
            code.startsWith('op_xvost_');
        if (!isSurvey || !installedOn.includes(entity)) return undefined;
        return { bitrixId: code.toUpperCase(), items: [] };
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getPortal: () => ({ domain: 'd.b24.ru' }),
});

const makeCtx = (
    survey: Record<string, unknown> | undefined,
    portal: unknown = makePortal(),
    // Лид БЕЗ анкеты по умолчанию: на новом пути фрейм в него не пишет —
    // единственный источник ответов здесь payload отчёта. Заполненный лид
    // нужен кейсам легаси-пути (перенос «лид → сделки»).
    lead: Record<string, unknown> = { ID: '42' },
) =>
    new EventReportContext(
        {
            presentation: { isPresentationDone: true, survey },
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            report: { resultStatus: 'result' },
        } as never,
        portal as never,
        {
            entityType: 'company',
            entityId: 7,
            lead,
            company: { ID: '7' },
            currentPresDeal: null,
        } as never,
        new Date('2026-08-14T09:00:00.000Z'),
    );

const fieldsOf = (
    ctx: EventReportContext,
    entityType: EventReportEntityType,
    dealOptions: Record<string, unknown> | null = null,
    portal: unknown = makePortal(),
) =>
    new EventReportEntityFieldsModel(
        portal as never,
        ctx,
        entityType,
        dealOptions as never,
    ).toFields();

describe('Анкета 5К/Хвост из payload отчёта', () => {
    it('ЛИД получает весь состав: детальные «5К», «Разговор» и сводные', () => {
        const out = fieldsOf(
            makeCtx(SURVEY),
            EEventReportEntityType.LEAD,
            null,
        );

        expect(out[CLIENT_BLOCK]).toBe('Хочет замену Консультанта');
        expect(out[XVOST_DESIRE]).toBe('Встретили хорошо');
        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
        expect(out[FIVE_K_SUMMARY]).toBe('Сводка 5К по последней презентации');
    });

    it.each([EDealRole.BASE, EDealRole.PRESENTATION] as const)(
        'СДЕЛКА роли %s получает тот же состав, что и лид',
        role => {
            const out = fieldsOf(makeCtx(SURVEY), EEventReportEntityType.DEAL, {
                deal: null,
                role,
                presentationHappenedHere: true,
            });

            expect(out[CLIENT_BLOCK]).toBe('Хочет замену Консультанта');
            expect(out[XVOST_DESIRE]).toBe('Встретили хорошо');
            expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
            expect(out[FIVE_K_SUMMARY]).toBe(
                'Сводка 5К по последней презентации',
            );
        },
    );

    /*
     * На компании детальных полей нет по реестру намеренно: там они
     * означали бы «последний ответ по любой из сделок». Даже когда поля
     * установлены (этот фейк), в компанию едут ТОЛЬКО сводные.
     */
    it('КОМПАНИЯ получает только сводные, детальных не пишем', () => {
        const out = fieldsOf(
            makeCtx(SURVEY),
            EEventReportEntityType.COMPANY,
            null,
        );

        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
        expect(out[FIVE_K_SUMMARY]).toBe('Сводка 5К по последней презентации');
        expect(out[CLIENT_BLOCK]).toBeUndefined();
        expect(out[XVOST_DESIRE]).toBeUndefined();
    });

    /*
     * Спонтанную сделку презентации создаёт САМ поток
     * (`set_unplanned_pres_deal`), уже держа ответы в руках, — женить её с
     * анкетой через Redis больше не нужно.
     */
    it('спонтанная pres-сделка получает ответы тем же батчем', () => {
        const out = fieldsOf(makeCtx(SURVEY), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: true,
        });

        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
    });

    it('плановая pres-сделка того же отчёта ответов НЕ получает', () => {
        const out = fieldsOf(makeCtx(SURVEY), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: false,
        });

        expect(out[XVOST]).toBeUndefined();
        expect(out[CLIENT_BLOCK]).toBeUndefined();
    });

    it.each([EDealRole.XO, EDealRole.TMC] as const)(
        'сделка роли %s к презентации отношения не имеет — ответов нет',
        role => {
            const out = fieldsOf(makeCtx(SURVEY), EEventReportEntityType.DEAL, {
                deal: null,
                role,
                presentationHappenedHere: false,
            });

            expect(out[XVOST]).toBeUndefined();
            expect(out[CLIENT_BLOCK]).toBeUndefined();
        },
    );

    it('левый код в payload не доезжает ни до одной цели', () => {
        const out = fieldsOf(
            makeCtx(SURVEY),
            EEventReportEntityType.LEAD,
            null,
        );

        expect(out['UF_CRM_OP_LEFT_CODE']).toBeUndefined();
    });

    /*
     * Ответы многострочны по построению, а поля сущностей уезжают
     * batch-командой: сырой `\n` доехал бы до карточки подчёркиванием
     * (ровно так же экранирует легаси-ручка — toBatchText).
     */
    it('многострочный ответ экранируется для батча (%0A)', () => {
        const out = fieldsOf(
            makeCtx({ xvost: 'Первая строка\nвторая строка' }),
            EEventReportEntityType.LEAD,
            null,
        );

        expect(out[XVOST]).toBe('Первая строка%0Aвторая строка');
        expect(String(out[XVOST])).not.toContain('\n');
    });

    /*
     * Ответ анкеты — СВОБОДНЫЙ текст менеджера, а значения batch-команд
     * вклеиваются в query-строку сырыми: `&` разрезал бы её на параметры
     * (в поле уехало бы «Сравнивают с Гарантом », а хвост — мусорным
     * параметром команды), `+` декодировался бы пробелом, `%` съел бы
     * начало следующей escape-последовательности. Поток пишет ПОСЛЕ
     * фрейма, так что порча ПЕРЕЗАТЁРЛА БЫ чистое значение фрейма —
     * поэтому экранирование строгое (toBatchSafeText), а не только
     * переносы строк.
     */
    it('спецсимволы свободного текста экранируются строго: & + %', () => {
        const out = fieldsOf(
            makeCtx({
                xvost: 'Сравнивают с Гарантом & КонсультантПлюс',
                fiveKSummary: 'Скидка 50% при оплате до 1 числа',
                fiveK: { op_5k_client: 'Звонить на +7 900 123-45-67' },
                talk: { op_xvost_desire: '100% + бонус & тел. +7\nконец' },
            }),
            EEventReportEntityType.LEAD,
            null,
        );

        expect(out[XVOST]).toBe('Сравнивают с Гарантом %26 КонсультантПлюс');
        expect(out[FIVE_K_SUMMARY]).toBe('Скидка 50%25 при оплате до 1 числа');
        expect(out[CLIENT_BLOCK]).toBe('Звонить на %2B7 900 123-45-67');
        expect(out[XVOST_DESIRE]).toBe(
            '100%25 %2B бонус %26 тел. %2B7%0Aконец',
        );
    });

    /*
     * Мягкая деградация: поля анкеты на компании по реестру нет вовсе —
     * пишем warning и идём дальше, остальные цели не страдают.
     */
    it('неустановленное поле — warning и пропуск, остальное пишется', () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const portal = makePortal(['lead', 'deal']);

        const company = fieldsOf(
            makeCtx(SURVEY, portal),
            EEventReportEntityType.COMPANY,
            null,
            portal,
        );
        const lead = fieldsOf(
            makeCtx(SURVEY, portal),
            EEventReportEntityType.LEAD,
            null,
            portal,
        );

        expect(company[XVOST]).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('op_presentation_xvost'),
        );
        expect(lead[XVOST]).toBe('Дожать по хвосту через неделю');
        warn.mockRestore();
    });

    /*
     * Старые сборки фрейма блок `survey` не шлют — поток обязан вести себя
     * ровно как раньше. Сверяем СОСТАВ полей: без анкеты он не содержит ни
     * одного её ключа, с анкетой отличается ровно на них.
     */
    it('payload без анкеты — ни одной новой команды', () => {
        const surveyKeys = [
            XVOST,
            FIVE_K_SUMMARY,
            CLIENT_BLOCK,
            XVOST_DESIRE,
        ];
        const without = fieldsOf(
            makeCtx(undefined),
            EEventReportEntityType.LEAD,
            null,
        );
        const withSurvey = fieldsOf(
            makeCtx(SURVEY),
            EEventReportEntityType.LEAD,
            null,
        );

        for (const key of surveyKeys) {
            expect(without[key]).toBeUndefined();
        }
        expect(new Set(Object.keys(withSurvey))).toEqual(
            new Set([...Object.keys(without), ...surveyKeys]),
        );
    });

    it('пустые значения в блоке анкеты полей не добавляют', () => {
        const out = fieldsOf(
            makeCtx({ xvost: '   ', fiveK: { op_5k_client: '' } }),
            EEventReportEntityType.LEAD,
            null,
        );

        expect(out[XVOST]).toBeUndefined();
        expect(out[CLIENT_BLOCK]).toBeUndefined();
    });
});

/**
 * Приоритет источников на СДЕЛКАХ: payload отчёта → лид.
 *
 * Перенос «лид → сделки» (`copyPresentationSurvey`) остаётся ради
 * ЛЕГАСИ-пути: старый React-фронт шлёт анкету отдельным запросом в ручку
 * /presentation-survey, та пишет ответы в лид и в payload положить ничего
 * не может. Ответ, пришедший в payload, с лида не копируется вовсе.
 */
describe('Анкета: payload — источник, лид — фолбэк', () => {
    /** Лид, на котором анкета уже стоит (её записала легаси-ручка). */
    const LEAD_WITH_SURVEY = {
        ID: '42',
        [XVOST]: 'старый хвост с лида',
        [CLIENT_BLOCK]: 'старый ответ с лида',
        [XVOST_DESIRE]: 'старое впечатление с лида',
    };

    const dealFields = (
        survey: Record<string, unknown> | undefined,
        lead: Record<string, unknown> = LEAD_WITH_SURVEY,
    ) =>
        fieldsOf(
            makeCtx(survey, makePortal(), lead),
            EEventReportEntityType.DEAL,
            {
                deal: null,
                role: EDealRole.BASE,
                presentationHappenedHere: true,
            },
        );

    it('ответ этого отчёта побеждает значение, стоящее на лиде', () => {
        const out = dealFields(SURVEY);

        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
        expect(out[CLIENT_BLOCK]).toBe('Хочет замену Консультанта');
        expect(out[XVOST_DESIRE]).toBe('Встретили хорошо');
    });

    it('ответа нет в payload — он по-прежнему переносится с лида', () => {
        const out = dealFields({ xvost: 'Дожать по хвосту через неделю' });

        expect(out[XVOST]).toBe('Дожать по хвосту через неделю');
        // В payload этих двух нет — работает прежний перенос с лида.
        expect(out[CLIENT_BLOCK]).toBe('старый ответ с лида');
        expect(out[XVOST_DESIRE]).toBe('старое впечатление с лида');
    });

    it('payload без анкеты — перенос с лида работает как раньше', () => {
        const out = dealFields(undefined);

        expect(out[XVOST]).toBe('старый хвост с лида');
        expect(out[CLIENT_BLOCK]).toBe('старый ответ с лида');
        expect(out[XVOST_DESIRE]).toBe('старое впечатление с лида');
    });

    /*
     * ОБА ИСТОЧНИКА ЕДУТ ОДНОЙ КОМАНДОЙ. Перенос с лида и запись из payload
     * складываются в ОДИН объект `out`, который уезжает единственным
     * `deal.update`. Значит, экранирование у них обязано совпадать: одна
     * скопированная с лида строка с `&` рвала бы query-строку КОМАНДЫ, и
     * мусором уезжали бы не только соседние ответы, но и история, статусы и
     * счётчики того же отчёта.
     *
     * На лиде значения лежат уже РАСКОДИРОВАННЫМИ (Битрикс декодирует `%0A`
     * и остальное при записи) — поэтому здесь экранирование первое, а не
     * повторное.
     */
    it('ответ, скопированный с лида, экранируется так же, как ответ из payload', () => {
        const out = dealFields({ xvost: 'из payload: 100% + бонус & итог' }, {
            ID: '42',
            [CLIENT_BLOCK]: 'с лида: 100% + бонус & итог',
        } as Record<string, unknown>);

        // Одна и та же строка — одни и те же байты у обоих источников.
        expect(out[XVOST]).toBe('из payload: 100%25 %2B бонус %26 итог');
        expect(out[CLIENT_BLOCK]).toBe('с лида: 100%25 %2B бонус %26 итог');
        for (const value of Object.values(out)) {
            expect(String(value)).not.toContain('&');
        }
    });

    it('многострочный ответ с лида доезжает с %0A и без сырых переносов', () => {
        const out = dealFields(undefined, {
            ID: '42',
            [XVOST]: 'дожать:\r\n- хвост\n- договор',
        } as Record<string, unknown>);

        expect(out[XVOST]).toBe('дожать:%0A- хвост%0A- договор');
        expect(String(out[XVOST])).not.toMatch(/[\r\n]/);
    });
});

/**
 * ГЕЙТ ПРОВЕДЁННОЙ ПРЕЗЕНТАЦИИ. Анкета есть только у СОСТОЯВШЕЙСЯ
 * презентации — как счётчик `pres_count`, штамп проведения и перенос
 * «лид → сделки». Новый фрейм шлёт блок только при проведённой, но контракт
 * DTO этого не требует, а поток обязан держать инвариант сам.
 *
 * Гейт стоит ВНУТРИ applyPresentationSurveyAnswers, поэтому проверяем ОБА
 * входа: полную модель (`toFields`) и зеркало лида
 * (`toPresentationSurveyFields`).
 */
describe('Анкета пишется только при проведённой презентации', () => {
    const notDoneCtx = () =>
        new EventReportContext(
            {
                presentation: { isPresentationDone: false, survey: SURVEY },
                currentTask: { eventType: 'call', name: 'ООО Ромашка' },
                report: { resultStatus: 'result' },
            } as never,
            makePortal() as never,
            {
                entityType: 'lead',
                entityId: 42,
                lead: { ID: '42' },
                company: null,
                currentPresDeal: null,
            } as never,
            new Date('2026-08-14T09:00:00.000Z'),
        );

    it('презентация не проведена → полная модель ответов не пишет', () => {
        const out = fieldsOf(notDoneCtx(), EEventReportEntityType.LEAD, null);

        expect(out[XVOST]).toBeUndefined();
        expect(out[FIVE_K_SUMMARY]).toBeUndefined();
        expect(out[CLIENT_BLOCK]).toBeUndefined();
        expect(out[XVOST_DESIRE]).toBeUndefined();
    });

    it('презентация не проведена → зеркало лида не ставит ни одной команды', () => {
        const mirror = new EventReportEntityFieldsModel(
            makePortal() as never,
            notDoneCtx(),
            EEventReportEntityType.LEAD,
        ).toPresentationSurveyFields();

        expect(mirror).toEqual({});
    });
});

/**
 * Спонтанная презентация — тот самый случай, ради которого на легаси-пути
 * живёт Redis-rendezvous: сделки презентации в момент отчёта ещё нет.
 * Новому пути женить нечего с чем — сделку создаёт САМ поток
 * (`set_unplanned_pres_deal`), уже держа ответы в руках, и ответы уезжают
 * тем же батчем, что и сама сделка.
 */
describe('Спонтанная pres-сделка: ответы уезжают вместе с созданием', () => {
    const makeFlowPortal = () => ({
        ...makePortal(),
        getDealCategoryByCode: () => ({
            bitrixId: '5',
            stages: [
                // «Презентация состоялась» ложится в spres_success.
                { code: 'spres_success', bitrixId: 'DONE' },
            ],
        }),
    });

    const queueUnplanned = (survey: Record<string, unknown> | undefined) => {
        const created: Record<string, unknown>[] = [];
        const bitrix = {
            batch: {
                deal: {
                    set: (_cmd: string, fields: Record<string, unknown>) =>
                        created.push(fields),
                    update: () => undefined,
                },
            },
        };
        const portal = makeFlowPortal();
        // currentPresDeal нет → отчёт по презентации считается спонтанным.
        const ctx = makeCtx(survey, portal);
        new SalesPresentationDealService(
            bitrix as never,
            portal as never,
        ).queue(ctx, 'D_100');
        return created;
    };

    it('созданная сделка несёт весь состав ответов из payload', () => {
        const [fields] = queueUnplanned(SURVEY);

        expect(fields.TITLE).toBe('Презентация (незапланированная)');
        expect(fields[XVOST]).toBe('Дожать по хвосту через неделю');
        expect(fields[FIVE_K_SUMMARY]).toBe(
            'Сводка 5К по последней презентации',
        );
        expect(fields[CLIENT_BLOCK]).toBe('Хочет замену Консультанта');
        expect(fields[XVOST_DESIRE]).toBe('Встретили хорошо');
    });

    it('payload без анкеты — сделка создаётся без её полей', () => {
        const [fields] = queueUnplanned(undefined);

        expect(fields.TITLE).toBe('Презентация (незапланированная)');
        expect(fields[XVOST]).toBeUndefined();
        expect(fields[CLIENT_BLOCK]).toBeUndefined();
    });
});

/**
 * МАРШРУТИЗАЦИЯ анкеты потоком, а не состав модели.
 *
 * `EventReportEntityFlowService.queue` строит полную модель полей РОВНО ОДИН
 * раз — для `ctx.entityType`, а владельцем отчёта при живой компании
 * `resolveEntity` делает компанию всегда. Проверки выше зовут модель
 * напрямую (`fieldsOf(ctx, LEAD)`) и этот слой не видят: без зеркала анкеты
 * у обычного клиента «компания + заявка» ответы не доезжали до лида ни разу,
 * хотя легаси-ручка /presentation-survey писала туда весь состав.
 */
describe('Маршрутизация: владелец — компания, лид анкету всё равно получает', () => {
    type QueuedCommand = {
        entity: 'company' | 'lead' | 'deal';
        cmd: string;
        id: number;
        fields: Record<string, unknown>;
    };

    const queueEntityFlow = (
        survey: Record<string, unknown> | undefined,
        portal: unknown = makePortal(),
        ctx?: EventReportContext,
    ): QueuedCommand[] => {
        const commands: QueuedCommand[] = [];
        const collect =
            (entity: QueuedCommand['entity']) =>
            (cmd: string, id: number, fields: Record<string, unknown>) => {
                commands.push({ entity, cmd, id, fields });
            };
        const bitrix = {
            batch: {
                company: { update: collect('company') },
                lead: { update: collect('lead') },
                deal: { update: collect('deal') },
            },
        };
        new EventReportEntityFlowService(
            bitrix as never,
            portal as never,
        ).queue(ctx ?? makeCtx(survey, portal));
        return commands;
    };

    const leadCommandOf = (commands: QueuedCommand[]) =>
        commands.find(command => command.entity === 'lead');

    it('в ЛИД уезжает отдельная команда с полным составом ответов', () => {
        const commands = queueEntityFlow(SURVEY);
        const lead = leadCommandOf(commands);

        // Владелец-компания обновляется как раньше — зеркало ему не мешает.
        expect(commands.some(command => command.entity === 'company')).toBe(
            true,
        );
        expect(lead).toBeDefined();
        expect(lead?.id).toBe(42);
        expect(lead?.fields[CLIENT_BLOCK]).toBe('Хочет замену Консультанта');
        expect(lead?.fields[XVOST_DESIRE]).toBe('Встретили хорошо');
        expect(lead?.fields[XVOST]).toBe('Дожать по хвосту через неделю');
        expect(lead?.fields[FIVE_K_SUMMARY]).toBe(
            'Сводка 5К по последней презентации',
        );
    });

    /*
     * Лид здесь НЕ вторая сущность-владелец: счётчики, штампы, история и
     * ASSIGNED_BY_ID остаются делом владельца отчёта.
     */
    it('в лид едет ТОЛЬКО анкета, а не второй полный update', () => {
        const lead = leadCommandOf(queueEntityFlow(SURVEY));

        expect(new Set(Object.keys(lead?.fields ?? {}))).toEqual(
            new Set([CLIENT_BLOCK, XVOST_DESIRE, XVOST, FIVE_K_SUMMARY]),
        );
    });

    /*
     * Старые сборки фрейма блок `survey` не шлют: батч обязан остаться
     * прежним. У этого фейка портала установлены ТОЛЬКО поля анкеты —
     * поэтому без неё поток не ставит ни одной команды вообще.
     */
    it('payload без анкеты — команды лиду не появляется вовсе', () => {
        const commands = queueEntityFlow(undefined);

        expect(leadCommandOf(commands)).toBeUndefined();
        expect(commands).toHaveLength(0);
    });

    it('владелец-ЛИД зеркала не получает — анкету несёт основной update', () => {
        const portal = makePortal();
        const ctx = new EventReportContext(
            {
                presentation: { isPresentationDone: true, survey: SURVEY },
                currentTask: {
                    eventType: 'presentation',
                    name: 'ООО Ромашка',
                },
                report: { resultStatus: 'result' },
            } as never,
            portal as never,
            {
                entityType: 'lead',
                entityId: 42,
                lead: { ID: '42' },
                company: null,
                currentPresDeal: null,
            } as never,
            new Date('2026-08-14T09:00:00.000Z'),
        );

        const leadCommands = queueEntityFlow(SURVEY, portal, ctx).filter(
            command => command.entity === 'lead',
        );

        // Ровно одна: основной update владельца, зеркало сверху не легло.
        expect(leadCommands).toHaveLength(1);
        expect(leadCommands[0].fields[XVOST]).toBe(
            'Дожать по хвосту через неделю',
        );
    });

    it('лида в контексте нет — команда не появляется', () => {
        const portal = makePortal();
        const commands = queueEntityFlow(
            SURVEY,
            portal,
            makeCtx(SURVEY, portal, null as never),
        );

        expect(leadCommandOf(commands)).toBeUndefined();
    });
});
