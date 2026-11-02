import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxLeadStageCode } from '@lib/portal-lib/pbx-domain';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';

type BxRow = Record<string, unknown>;

/** Стадия, в которую робот ставит лид ПЕРЕД вызовом хука. */
const XO_QUEUE_STAGE_CODE: PbxLeadStageCode = 'lead_xo_queue';

/** Чем карточка лида является для хука: командой робота или эхом. */
export interface CardRoutingSource {
    /** true — поля маршрутизации карточки заполнил робот, их читаем. */
    command: boolean;
    /** Почему решили так — в signals операции и логи. */
    reason: string;
}

/**
 * КАРТОЧКА — КОМАНДА РОБОТА ТОЛЬКО В «ОЧЕРЕДИ В ХО».
 *
 * Поля маршрутизации (`xo_responsible`, `xo_name`, `xo_date`) робот пишет
 * перед постановкой лида в очередь и вызовом хука. Но ТЕ ЖЕ поля пишет и
 * сам хук после назначения (XoEventEntityModel): на карточке лида, уже
 * ушедшего в работу, лежит эхо прошлого назначения, а не команда.
 *
 * Авария garant 02.11.2026 (сделка 110469). SLA-передача слала хук без
 * ответственного, хук брал `xo_responsible` с карточки — того, кто заявку
 * и не принял, — считал его адресным ХО и «принимал» заявку за него, уводя
 * сделку в «Холодные». Тем же путём «Передать другому» без адресата
 * возвращало заявку передающему. Исключение прежнего на явного
 * ответственного не действует по контракту, так что ломалось именно
 * чтение карточки.
 *
 * Правило. Маршрутизацию с карточки читаем, только если лид стоит в
 * «Очереди в ХО»: туда его ставит робот прямо перед хуком (БП garant 353
 * круг и 343 адресный — оба). Из очереди хук сам уводит лид в «Назначена»,
 * поэтому второй вызов по тому же лиду карточку уже не читает.
 *
 * Стадия не сопоставлена на портале — судим по истории обработки заявки:
 * записей нет — назначения ещё не было, карточка команда; записи есть —
 * хук уже проходил, карточка эхо. Нет ни стадии, ни поля истории —
 * прежнее поведение (читаем), другого признака у нас нет.
 *
 * `department_string` правило не касается: хук его не пишет, его ставит
 * робот определения отдела, эхом оно быть не может.
 */
export function resolveCardRoutingSource(
    leadRow: BxRow,
    portal: PortalModel,
): CardRoutingSource {
    const queueStatusId = portal.getLeadStatusIdByCode(XO_QUEUE_STAGE_CODE);
    const statusId = text(leadRow.STATUS_ID);
    if (queueStatusId) {
        return statusId === queueStatusId
            ? {
                  command: true,
                  reason: 'лид в «Очереди в ХО» — поля карточки заполнил робот',
              }
            : {
                  command: false,
                  reason:
                      `лид не в «Очереди в ХО» (STATUS_ID=${statusId || '—'}) — ` +
                      'поля карточки считаются эхом прошлого назначения',
              };
    }

    const historyField = portal.getEntityFieldByCode(
        'lead',
        EnumLeadRequestFieldCode.op_lead_firstprepare_history,
    );
    if (!historyField) {
        return {
            command: true,
            reason:
                'стадия «Очередь в ХО» и история заявки не установлены — ' +
                'поля карточки читаются как раньше',
        };
    }
    const history = leadRow[portal.getFieldBitrixId(historyField)];
    const entries = (Array.isArray(history) ? history : [history]).filter(
        value => text(value) !== '',
    );
    return entries.length === 0
        ? {
              command: true,
              reason:
                  'стадия «Очередь в ХО» не сопоставлена, история заявки пуста — ' +
                  'первая постановка, поля карточки заполнил робот',
          }
        : {
              command: false,
              reason:
                  'стадия «Очередь в ХО» не сопоставлена, в истории заявки ' +
                  `${entries.length} записей — назначение уже было, поля карточки эхо`,
          };
}

function text(raw: unknown): string {
    return typeof raw === 'string' || typeof raw === 'number'
        ? String(raw).trim()
        : '';
}
