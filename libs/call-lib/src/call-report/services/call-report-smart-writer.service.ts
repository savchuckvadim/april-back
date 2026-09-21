import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import { callReportSmartUfName } from '../config/call-report-smart.config';
import { CallReportSmartDegradation } from './call-report-smart-degradation';
import { buildCallReportSmartFields } from './call-report-smart-fields.builder';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';
import { CallReportSmartTimelineWriter } from './call-report-smart-timeline.writer';
import { CallReportSmartItemInput } from './call-report-smart-writer.types';

// Контракт входа вынесен в .types (лимит файла); прежний путь импорта и
// барель @lib/call-lib сохраняются реэкспортом.
export * from './call-report-smart-writer.types';

/**
 * Писатель элементов смарт-процесса «AI-анализ звонков».
 *
 * НЕ Injectable: создаётся через `new CallReportSmartWriterService(bitrix, info)`
 * под конкретный домен (правило CLAUDE.md — никакого this.bitrix в Injectable).
 *
 * Запись — строго одиночным crm.item.add (POST JSON), НЕ батчем:
 * batch-путь библиотеки не URL-кодирует значения, длинные тексты
 * анализа с '&'/'=' молча ломают команду.
 *
 * Разложено по ответственностям (лимит файла): раскладка входа по полям —
 * call-report-smart-fields.builder, форматы значений — field-set,
 * деградация под row size — call-report-smart-degradation, полные тексты
 * выброшенных полей — call-report-smart-timeline.writer. Здесь — upsert по
 * xmlId и контроль факта сохранения связей.
 */
export class CallReportSmartWriterService {
    private readonly logger = new Logger(CallReportSmartWriterService.name);
    private readonly degradation: CallReportSmartDegradation;
    private readonly timeline: CallReportSmartTimelineWriter;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly smartInfo: CallReportSmartInfo,
    ) {
        // Один логгер на все части: алерты/предупреждения писателя видны
        // (и подменяются в тестах) через writer.logger.
        this.degradation = new CallReportSmartDegradation(
            smartInfo,
            this.logger,
        );
        this.timeline = new CallReportSmartTimelineWriter(
            bitrix,
            smartInfo,
            this.logger,
        );
    }

    /**
     * Создаёт элемент смарта, возвращает его id.
     *
     * Дедуп на уровне Bitrix: один разговор (activityId) = один элемент.
     * В `xmlId` (внешний код элемента crm.item) пишется `aicall_{activityId}`,
     * перед созданием ищется существующий элемент по этому коду — ретраи и
     * повторные push-back при потерянной связке в ais не плодят дубли.
     */
    async addItem(input: CallReportSmartItemInput): Promise<number> {
        const xmlId = input.activityId
            ? `aicall_${input.activityId}`
            : undefined;
        if (xmlId) {
            const existingId = await this.findIdByXmlId(xmlId);
            if (existingId) {
                // Upsert: существующий элемент ДОПОЛНЯЕТСЯ переданными полями
                // (частичный update) — базовый элемент из smoke-прогона
                // конвейера потом обогащается глубоким анализом агента.
                await this.updateItem(existingId, xmlId, input);
                this.logger.log(
                    `Элемент смарта уже существует: #${existingId} (${xmlId}) — обновил поля, дубль не создаю`,
                );
                return existingId;
            }
        }

        const fields = this.buildFields(input, { isCreate: true });
        if (xmlId) fields.xmlId = xmlId;
        const { response, dropped } = await this.degradation.write(
            fields as Record<string, unknown>,
            degraded =>
                this.bitrix.item.add(
                    String(this.smartInfo.entityTypeId),
                    degraded as Partial<IBXItem>,
                ),
        );
        const itemId = Number(
            (response as { result?: { item?: { id?: number } } } | undefined)
                ?.result?.item?.id,
        );
        if (!itemId) {
            throw new Error(
                `crm.item.add не вернул id элемента (activity ${input.activityId})`,
            );
        }
        this.verifyLinks(fields, response, input, itemId);
        await this.timeline.postDropped(itemId, dropped, input, {
            isCreate: true,
        });
        this.logger.log(
            `Создан элемент смарта #${itemId} (activity ${input.activityId})`,
        );
        return itemId;
    }

    /**
     * Обновление ТОЛЬКО существующего элемента по активности; null —
     * элемента нет, ничего не создаётся. Для дописывающих проходов
     * (ночной ревизор): создание элемента без разбора запрещено —
     * прод-инцидент 16.08.2026: ревизор плодил почти пустые карточки
     * «только рекомендации по сделке» для звонков без смарт-элемента.
     */
    async updateExisting(
        input: CallReportSmartItemInput,
    ): Promise<number | null> {
        if (!input.activityId) return null;
        const xmlId = `aicall_${input.activityId}`;
        const existingId = await this.findIdByXmlId(xmlId);
        if (!existingId) return null;
        await this.updateItem(existingId, xmlId, input);
        return existingId;
    }

    /** Частичный update существующего элемента (общий путь upsert-веток). */
    private async updateItem(
        existingId: number,
        xmlId: string,
        input: CallReportSmartItemInput,
    ): Promise<void> {
        try {
            const sent = this.buildFields(input) as Record<string, unknown>;
            const { response, dropped } = await this.degradation.write(
                sent,
                fields =>
                    this.bitrix.item.update(
                        existingId,
                        this.smartInfo.entityTypeId as never,
                        fields as Partial<IBXItem>,
                    ),
            );
            this.verifyLinks(sent, response, input, existingId);
            await this.timeline.postDropped(existingId, dropped, input, {
                isCreate: false,
            });
        } catch (error) {
            // Не фатально: транскрипт и ais уже в БД, разбор дольётся
            // повторным прогоном. { telegram: true } — алерт, иначе пустые
            // поля ищут неделями.
            this.logger.error(
                `Элемент #${existingId} не обновлён (${xmlId}): ${(error as Error).message}`,
                { telegram: true, itemId: existingId },
            );
        }
    }

    /**
     * Контроль факта сохранения связей (прод-урок 26.08.2026: «ни одной
     * привязанной сделки», а в логах всё зелёное).
     *
     * Bitrix на crm.item.add/update отвечает HTTP 200 и МОЛЧА отбрасывает
     * поля, которых у типа нет: нет relations.parent — нет parentId{N};
     * isClientEnabled='N' — нет companyId/contactId; crm-поле без settings
     * (привязки к DEAL) не сохраняет ['D_123']. Ошибки «неизвестное поле»
     * у метода не существует, тело запроса логируется только при отказе —
     * поэтому дроп связей был неотличим от «на портале нечего привязывать».
     *
     * Сверяем отправленное с эхом созданного/обновлённого элемента:
     * - связь отправляли, а в эхе её нет → дефект портала/установки (алерт);
     * - связей не было в input вовсе → нечего привязывать (warn, не алерт).
     * Сравнение мягкое: Битрикс возвращает id строкой, crm-поля — массивом.
     */
    private verifyLinks(
        sent: Record<string, unknown>,
        response: unknown,
        input: CallReportSmartItemInput,
        itemId: number,
    ): void {
        const echo = (
            response as { result?: { item?: Record<string, unknown> } } | null
        )?.result?.item;
        const linkKeys = [
            `parentId${BitrixOwnerTypeId.DEAL}`,
            `parentId${BitrixOwnerTypeId.LEAD}`,
            'companyId',
            'contactId',
            callReportSmartUfName(this.smartInfo, 'DEAL_MAIN'),
        ];
        const sentLinks = linkKeys.filter(key => sent[key] !== undefined);

        if (!sentLinks.length) {
            // Нечего привязывать: у звонка нет CRM-владельца/клиента.
            this.logger.warn(
                `Элемент #${itemId} (activity ${input.activityId}): связи НЕ отправлялись — ` +
                    `в разборе нет ни сделки, ни лида, ни компании/контакта`,
            );
            return;
        }
        // Эхо элемента доступно не во всех ответах библиотеки — без него
        // проверять нечего (молчим, чтобы не сыпать ложными алертами).
        if (!echo) return;

        // Связи — это id и ссылки вида 'D_555'; объектов тут не бывает,
        // но на всякий случай приводим их к JSON, а не к [object Object].
        const scalar = (value: unknown): string => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value as string | number | boolean);
        };
        const normalize = (value: unknown): string =>
            Array.isArray(value) ? value.map(scalar).join(',') : scalar(value);
        const lost = sentLinks.filter(
            key => normalize(echo[key]) !== normalize(sent[key]),
        );
        if (!lost.length) return;

        this.logger.error(
            `Элемент #${itemId} (activity ${input.activityId}): Битрикс НЕ СОХРАНИЛ связи ` +
                `[${lost.join(', ')}] — отправлено ${lost
                    .map(key => `${key}=${normalize(sent[key])}`)
                    .join(', ')}, в ответе ${lost
                    .map(key => `${key}=${normalize(echo[key]) || '—'}`)
                    .join(', ')}. ` +
                `Причина обычно в настройках смарта: нет relations.parent (сделка/лид), ` +
                `isClientEnabled='N' (компания/контакт) или crm-поле без привязки к DEAL — ` +
                `лечится переустановкой смарта (POST /call-report/install-smart)`,
            { telegram: true, itemId },
        );
    }

    /** id существующего элемента по внешнему коду xmlId; null — не найден. */
    private async findIdByXmlId(xmlId: string): Promise<number | null> {
        try {
            const response = (await this.bitrix.item.list(
                String(this.smartInfo.entityTypeId),
                { xmlId } as Partial<IBXItem>,
                ['id', 'xmlId'],
            )) as { result?: { items?: { id?: number }[] } };
            const id = Number(response?.result?.items?.[0]?.id);
            return id > 0 ? id : null;
        } catch (error) {
            // Fail-open: сломанный поиск не должен блокировать запись анализа —
            // выше по цепочке дедуп прикрывают ais.report_item_id и dedup_key.
            this.logger.warn(
                `Поиск элемента по xmlId=${xmlId} не выполнен: ${(error as Error).message}`,
            );
            return null;
        }
    }

    private buildFields(
        input: CallReportSmartItemInput,
        options?: { isCreate?: boolean },
    ): Partial<IBXItem> {
        return buildCallReportSmartFields(
            input,
            this.smartInfo,
            this.logger,
            options,
        );
    }
}
