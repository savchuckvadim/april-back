import { PBXService } from '@/modules/pbx/pbx.service';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PbxZprSmartService } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { IColdHookSilenceHandlerData } from '../../type/cold-hook-silence.interface';
import { ColdCallV2UseCase } from '../../use-cases/cold-call.use-case';
import { getErrorDetails } from '@/shared';

import {
    ColdStartDecision,
    decideColdStart,
} from '../../lib/cold-force.decision';
import { ColdRelationsCollectorV2Service } from '../relations/cold-relations-collector.service';
import {
    ColdCloseResult,
    ColdRelationsCloserV2Service,
} from '../relations/cold-relations-closer.service';
import { ColdSmartInfos } from '../relations/cold-relations.types';
import { ColdTargetResolverV2Service } from '../target/cold-target-resolver.service';
import { ColdTarget, ResolvedColdTarget } from '../target/cold-target.types';
import {
    buildColdCallMissingNote,
    resolveColdCallData,
} from '../../lib/cold-call-intent';
import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { XoDispatchMarkerModel } from '../../../shared/xo-dispatch/xo-dispatch-marker.model';
import { EnumColdCallEntityType } from '../../dto/cold.dto';
import dayjs from 'dayjs';
import {
    buildColdStartPushes,
    buildColdStartTimeline,
    ColdStartTimelineInput,
} from '../timeline/cold-start-timeline.formatter';
import { ColdStartNotifyV2Service } from '../timeline/cold-start-notify.service';
import { ColdStartTimelineV2Service } from '../timeline/cold-start-timeline.service';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../shared/batch';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import {
    ColdAddressedXoPlan,
    ColdAddressedXoV2Service,
    EMPTY_ADDRESSED_XO_PLAN,
} from '../addressed-xo/cold-addressed-xo.service';

/** Что решено по хуку в фазе чтения — вход фазы записи. */
interface PreparedTarget {
    target: ResolvedColdTarget;
    decision: ColdStartDecision;
    closed: ColdCloseResult;
    noteInput: ColdStartTimelineInput;
    /** Лиды и контакты клиента, которые адресный ХО переназначит. */
    addressed: ColdAddressedXoPlan;
}

/**
 * Обрабатывает множество хуков одного окна тишины.
 *
 * v2 (шаги 2–7 плана): на каждый хук — цель ({@link ColdTargetResolverV2Service})
 * → связи клиента ({@link ColdRelationsCollectorV2Service}) → решение по
 * `force` ({@link decideColdStart}) → закрытие ({@link ColdRelationsCloserV2Service})
 * → записи таймлайна и создание холодной работы (use-case, только `proceed`)
 * → push тем, у кого забрали / попытались забрать. v1 матчил хук по
 * `company.ID === entityId` и закрывал только сделки и задачи компании;
 * здесь закрываются ещё элементы смартов и даты планов, а чужая работа при
 * `force=N` уступается.
 *
 * ДВЕ ФАЗЫ, как в v1 (ревью 02.09): сначала ВСЁ чтение и закрытие по всем
 * хукам, потом ВСЯ запись группами в общий буфер и один flush. Иначе группа
 * создания хука N, уже закоммиченная `endGroup`, уезжала бы ЧУЖИМ батчем —
 * следующим же чтением хука N+1: `bitrix.api` держит одну карту команд на
 * все `batch.*`-сервисы, и любой `callBatchWithConcurrency` отправляет и
 * очищает её целиком, ломая учёт буфера и атомарность `$result[...]`.
 *
 * Корень-сделка без компании (шаг 6) идёт той же цепочкой: связи от
 * входной сделки, новые сделки без COMPANY_ID с контактом/лидом входной.
 */
@Injectable()
export class ColdHooksHandlerV2Service {
    private readonly logger = new Logger(ColdHooksHandlerV2Service.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly presSmart: PbxPresentationSmartService,
        private readonly zprSmart: PbxZprSmartService,
        private readonly userNames: UserNameResolver,
    ) {
        this.logger.log('Cold Hooks Silence Handler initialized');
    }

    async handleHooks(
        domain: string,
        hooks: IColdHookSilenceHandlerData['collected'],
    ): Promise<void> {
        const startedAt = Date.now();
        const hooksCount = hooks ? Object.keys(hooks).length : 0;
        try {
            this.logger.log('Cold hooks handling started', {
                domain,
                hooksCount,
            });
            if (!hooks || hooksCount === 0) {
                this.logger.log('No Cold Hooks to create', { domain });
                return;
            }
            const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
            if (!portal) {
                throw new HttpException(
                    'Cold hook portal notfound for domain: ' + domain,
                    HttpStatus.BAD_REQUEST,
                );
            }
            const targetResolver = new ColdTargetResolverV2Service(
                PortalModel,
                bitrix,
            );
            const collector = new ColdRelationsCollectorV2Service(
                PortalModel,
                bitrix,
            );
            const closer = new ColdRelationsCloserV2Service(
                PortalModel,
                bitrix,
            );
            const timeline = new ColdStartTimelineV2Service(bitrix);
            const notify = new ColdStartNotifyV2Service(bitrix);
            const useCase = new ColdCallV2UseCase(PortalModel, bitrix);
            // Адресный ХО: лиды и контакты — новому ответственному. План
            // принятия — чистый расчёт, его единственная зависимость
            // (PBXService) у обработчика уже есть: модуль заявок не нужен.
            const addressedXo = new ColdAddressedXoV2Service(
                PortalModel,
                bitrix,
                new LeadRequestAcceptService(this.pbx),
            );
            // Резолв смартов — один на окно тишины, null = не установлен.
            const smarts: ColdSmartInfos = {
                pres: await this.presSmart.resolveInfo(domain),
                zpr: await this.zprSmart.resolveInfo(domain),
            };

            // ===== Фаза 1: чтение, решение, закрытие — по всем хукам =====
            const targets = await targetResolver.resolve(hooks);
            const prepared: PreparedTarget[] = [];
            /** Цели, по которым не хватило данных — объясняем в таймлайне. */
            const incomplete: { target: ColdTarget; note: string }[] = [];
            for (const target of targets) {
                /*
                 * Данные события: запрос ПЕРЕБИВАЕТ карточку. Робот мог не
                 * передать их в query (кириллица и '#' ломали URL), тогда
                 * берём из полей, которые он заполнил перед вызовом хука.
                 */
                /*
                 * Поля читаем с ВХОДА ХУКА, а не с вычисленного корня.
                 *
                 * Различие принципиальное: у входа-сделки с компанией
                 * `target.kind` становится 'company' (корнем работы будет
                 * компания), но робот-то заполнял `xo_responsible`,
                 * `xo_date` и метки НА СДЕЛКЕ. Читать по kind значило бы
                 * искать их в карточке компании, ничего не найти и молча
                 * отказать в постановке звонка.
                 */
                const hookEntityType =
                    target.hook.entityType === EnumColdCallEntityType.COMPANY
                        ? 'company'
                        : 'deal';
                const resolution = resolveColdCallData({
                    hook: target.hook,
                    entityRow: (hookEntityType === 'company'
                        ? target.company
                        : target.entryDeal) as Record<string, unknown> | null,
                    entityType: hookEntityType,
                    portal: PortalModel,
                });
                if (!resolution.data) {
                    /*
                     * Round-robin здесь нет (в отличие от lead-to-work), и
                     * придумывать ответственного молча нельзя — звонок уехал
                     * бы случайному человеку. Объясняем в карточке, чего не
                     * хватило и что заполнить, чтобы повторить.
                     */
                    this.logger.warn(
                        `[v2] hook=${target.hookKey}: не хватает данных — ` +
                            resolution.missing
                                .map(item => item.fieldCode)
                                .join(', '),
                    );
                    incomplete.push({
                        target,
                        note: buildColdCallMissingNote(resolution.missing),
                    });
                    continue;
                }
                const resolved: ResolvedColdTarget = {
                    ...target,
                    hook: resolution.data,
                };
                const relations = await collector.collect(resolved, smarts);
                const responsibleId = Number(resolved.hook.responsible);
                const decision = decideColdStart({
                    force: resolved.hook.force,
                    responsibleId,
                    entryDealId: resolved.entryDeal
                        ? Number(resolved.entryDeal.ID)
                        : null,
                    openBaseDeals: relations.openBaseDeals,
                });
                this.logger.log(
                    `[v2] hook=${resolved.hookKey} ${this.describe(resolved)}: ` +
                        `${decision.reason} | ${resolution.signals.join('; ')}`,
                );
                const closed = await closer.close(
                    resolved,
                    relations,
                    decision,
                );
                /*
                 * Адресный ХО: лиды и контакты клиента — новому ответственному.
                 * Уступили чужой работе — ничего не трогаем, читать незачем.
                 * Чтение здесь, в фазе 1: внутри уходит batch контактов.
                 */
                const addressed =
                    decision.mode === 'proceed'
                        ? await addressedXo.load(
                              resolved,
                              relations,
                              closed.preservedBaseDeal,
                          )
                        : EMPTY_ADDRESSED_XO_PLAN;
                const names = await this.userNames.resolve(domain, bitrix, [
                    responsibleId,
                    ...ColdAddressedXoV2Service.responsibleIds(addressed),
                    ...decision.foreign.map(item => item.responsibleId),
                    ...(decision.takenEntry
                        ? [decision.takenEntry.responsibleId]
                        : []),
                ]);
                prepared.push({
                    target: resolved,
                    decision,
                    closed,
                    addressed,
                    noteInput: {
                        domain,
                        target: resolved,
                        decision,
                        closed,
                        responsibleId,
                        names,
                    },
                });
            }

            /**
             * Отметка «хук отработал» (`op_xo_revive_sent_at`) на ТОЙ
             * сущности, которую пометил робот — то есть на входе хука, а не
             * на вычисленном владельце.
             *
             * Это вторая фаза подстраховки. Робот ставит
             * `op_xo_revive_queued_at` ПЕРЕД вызовом, бэкенд — `sent_at`
             * после обработки; крон досылает те элементы, где queued новее
             * sent. Без этой записи КАЖДЫЙ нормально отработавший хук
             * выглядел бы для крона недоехавшим, и клиент получал бы второй
             * холодный звонок через порог досылки.
             *
             * Ставится и на `yield` (хук решил уступить чужую работу), и на
             * цели без данных: хук ОТРАБОТАЛ и сказал результат. Повтор с
             * теми же данными дал бы тот же исход и только спамил бы
             * таймлайн — перевзводит подстраховку робот, записывая свежий
             * `queued_at`.
             */
            const queueSentMark = (target: ColdTarget): void => {
                const entityType =
                    target.hook.entityType === EnumColdCallEntityType.COMPANY
                        ? 'company'
                        : 'deal';
                const markers = new XoDispatchMarkerModel(
                    PortalModel,
                    entityType,
                );
                const fieldName = markers.fieldName('sentAt');
                const entityId = Number(target.hook.entityId);
                if (!fieldName || !Number.isFinite(entityId) || entityId <= 0) {
                    return;
                }
                const stamp = dayjs()
                    .tz(PortalModel.getTimezone())
                    .format('DD.MM.YYYY HH:mm:ss');
                const cmd = `xo2_sent_${target.hookKey}`;
                const fields = { [fieldName]: stamp };
                buffer.queue(() =>
                    entityType === 'company'
                        ? bitrix.batch.company.update(
                              cmd,
                              entityId,
                              fields as never,
                          )
                        : bitrix.batch.deal.update(
                              cmd,
                              entityId,
                              fields as never,
                          ),
                );
            };

            // ===== Фаза 2: запись — группа на хук, один flush =====
            /**
             * Каждый хук = одна атомарная группа batch-команд. Буфер
             * гарантирует, что группа уходит в один HTTP-batch (≤50) —
             * $result[cmdKey] работает между сделкой → задачей → элементом
             * списка. Записи таймлайна — первыми в группу; в yield группа
             * состоит только из них.
             */
            const buffer = new ColdHookBatchGroupBuffer(bitrix);
            let created = 0;
            let yielded = 0;
            // Объяснения по целям, которым не хватило данных — своей
            // группой: записи независимы и ссылок друг на друга не имеют.
            for (const item of incomplete) {
                /*
                 * Запись уходит НА ВХОД ХУКА, а не на вычисленный корень.
                 * Человек смотрит ту карточку, из которой запускал: у
                 * входа-сделки с компанией корнем становится компания, и
                 * объяснение «не хватает данных» уезжало бы в чужую
                 * карточку — со стороны это выглядит как «вообще ничего не
                 * произошло».
                 */
                const fromCompany =
                    item.target.hook.entityType ===
                    EnumColdCallEntityType.COMPANY;
                const entityType = fromCompany
                    ? BitrixEntityType.COMPANY
                    : BitrixEntityType.DEAL;
                const entityId = Number(item.target.hook.entityId);
                if (entityId) {
                    timeline.queue(
                        item.target.hookKey,
                        [{ entityType, entityId, comment: item.note }],
                        buffer,
                    );
                }
                queueSentMark(item.target);
                await buffer.endGroup();
            }
            for (const item of prepared) {
                timeline.queue(
                    item.target.hookKey,
                    buildColdStartTimeline(item.noteInput),
                    buffer,
                );
                if (item.decision.mode !== 'proceed') {
                    yielded += 1;
                    this.logger.log('Cold hook yielded to foreign work', {
                        telegram: true,
                        domain,
                        hookKey: item.target.hookKey,
                        foreign: item.decision.foreign,
                        closed: item.closed.closedDealIds,
                    });
                    // Уступили чужой работе — но хук ОТРАБОТАЛ: повтор дал
                    // бы то же решение и только спамил бы таймлайн.
                    queueSentMark(item.target);
                    await buffer.endGroup();
                    continue;
                }
                await useCase.flow(
                    item.target,
                    item.closed.preservedBaseDeal,
                    null,
                    buffer,
                );
                /*
                 * Строго ПОСЛЕ работы: flow() закрывает свою группу, и
                 * лиды, контакты и отметка уезжают своими группами, не
                 * вклиниваясь в цепочку $result[...] создания сделок и задачи.
                 *
                 * endGroup() здесь обязателен: buffer.queue() регистрирует
                 * ОТЛОЖЕННЫЙ enqueue, и группа без закрытия не уедет во
                 * flush вовсе — отметка просто потерялась бы.
                 */
                await addressedXo.queue(
                    item.target.hookKey,
                    item.addressed,
                    item.noteInput.responsibleId,
                    item.noteInput.names,
                    buffer,
                );
                queueSentMark(item.target);
                await buffer.endGroup();
                created += 1;
            }
            await buffer.flush();
            this.logger.log(
                `Batch result: ${JSON.stringify(buffer.getResults())}`,
            );

            // ===== Фаза 3: push — напрямую, когда всё уже записано =====
            for (const item of prepared) {
                await notify.send(buildColdStartPushes(item.noteInput));
            }

            this.logger.log('Cold hooks handling finished', {
                telegram: true,
                domain,
                hooksCount,
                targetsCount: targets.length,
                created,
                yielded,
                durationMs: Date.now() - startedAt,
            });
        } catch (err) {
            const { message, stack } = getErrorDetails(err);
            this.logger.error(
                'Error in Cold Hooks Silence Handler Service',
                { domain, hooksCount, durationMs: Date.now() - startedAt },
                message,
            );
            this.logger.error(stack);
        }
    }

    private describe(target: ColdTarget): string {
        return target.kind === 'company'
            ? `company=${target.companyId}${target.entryDeal ? ` entryDeal=${target.entryDeal.ID}` : ''}`
            : `deal=${target.entryDeal?.ID} root=${target.rootDealId ?? '-'}`;
    }
}
