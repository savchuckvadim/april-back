import {
    toBatchSafeText,
    toMultiFieldEntryText,
} from '@lib/bitrix/consts/batch.consts';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    isPresentationSurveyEmpty,
    PRESENTATION_SURVEY_SUMMARY_CODES,
} from '../../../shared/presentation-survey';
import { EventReportContext } from '../context/event-report.context';
import { buildEventHistoryParts } from '../history/event-history-comment.builder';
import { EventReportContactMirrorModel } from './event-report-contact-mirror.model';
import { fitMultipleEntries, joinScalarHistory } from './history-text';

/** Роль контакта в отчёте: с кем говорили и кому планируют следующий шаг. */
export const EContactRole = {
    /** Контакт отчёта — собеседник ЭТОГО разговора. */
    REPORT: 'report',
    /** Контакт плана — тот, кому назначено следующее событие. */
    PLAN: 'plan',
} as const;

export type ContactRole = (typeof EContactRole)[keyof typeof EContactRole];

type ContactFieldValue = string | number | Array<string | number>;
export type ContactFieldsMap = Record<string, ContactFieldValue>;

/** Лимиты лент контакта — те же, что у сущностей-владельцев. */
const HISTORY_LIMIT_DEFAULT = 12;
const HISTORY_LIMIT_GSIRK = 30;
const FAIL_COMMENTS_LIMIT = 18;

/**
 * Модель полей КОНТАКТА события — отдельная от {@link EventReportEntityFieldsModel}
 * и не смешанная с ней (решение владельца 02.09.2026): у контакта свой
 * состав, свои роли и своя причина существования.
 *
 * ЗАЧЕМ. Отчёт всегда писался в компанию, лид и сделки — а разговор идёт с
 * ЧЕЛОВЕКОМ. Пока поля жили только на сущностях, ответить, кто именно в
 * компании что сказал и когда собирается покупать, было нечем: у компании
 * из десяти контактов одна история и одна дата на всех.
 *
 * ДВА КОНТАКТА НА ОДИН ОТЧЁТ. Контакт ОТЧЁТА (с кем говорили) получает
 * факты разговора: строку истории, ответы презентации, возражение, дату
 * покупки, отказ. Контакт ПЛАНА (кому назначен следующий звонок) — строку
 * истории и ось следующего звонка. Один и тот же человек в обеих ролях —
 * одна команда с объединённым составом.
 *
 * САМОГЕЙТ ПО СЛЕПКУ. Каждое поле пишется, только если установлено на
 * контакте (§5 доктрины pbx-fields-system). Сегодня на контакте стоят
 * возражение, его формулировка, дата покупки и причина отказа; история,
 * ответы презентации и счётчик появятся, как только владелец добавит их в
 * колонку контакта Excel — код менять не придётся.
 *
 * ИСТОЧНИКИ ЗНАЧЕНИЙ — ДВА, и это важно:
 *  - факты ЭТОГО отчёта (история, ответы анкеты, отказ, счётчик) берутся из
 *    контекста: строка сделки прочитана ДО записи и их ещё не содержит;
 *  - возражение, формулировка и дата покупки берутся со СДЕЛКИ через
 *    {@link EventReportContactMirrorModel}: их пишет ФРЕЙМ в момент ответа
 *    на вопрос анкеты, то есть ДО отправки отчёта, и читающий батч уже
 *    видит свежие значения.
 *
 * Модель чистая: собирает карту `UF_CRM_*` → значение, Битрикс не дёргает.
 */
export class EventReportContactFieldsModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly ctx: EventReportContext,
        private readonly contact: Record<string, unknown>,
        private readonly roles: ReadonlySet<ContactRole>,
    ) {}

    toFields(): ContactFieldsMap {
        const out: ContactFieldsMap = {};

        this.appendHistory(out);

        if (this.roles.has(EContactRole.REPORT)) {
            this.applyPresentation(out);
            this.applyFail(out);
            this.applyDealMirror(out);
        }
        if (this.roles.has(EContactRole.PLAN)) {
            this.applyNextCall(out);
        }

        return out;
    }

    // ===== История =====

    /**
     * Строка истории — та же, что у сущностей-владельцев (дата — что
     * сделано — что запланировано): `op_mhistory` лентой с лимитом по числу
     * и длине, `op_history` скаляром через « | ».
     */
    private appendHistory(out: ContactFieldsMap): void {
        const line = toMultiFieldEntryText(
            [this.nowCrmDate(), ...buildEventHistoryParts(this.ctx)].join(
                ' — ',
            ),
        );
        const limit = this.ctx.isGsirk
            ? HISTORY_LIMIT_GSIRK
            : HISTORY_LIMIT_DEFAULT;
        this.appendMultiple(out, 'op_mhistory', line, limit);

        const field = this.field('op_history');
        if (!field) return;
        const raw = this.contact[this.key(field)];
        out[this.key(field)] = toBatchSafeText(
            joinScalarHistory(line, typeof raw === 'string' ? raw : ''),
        );
    }

    // ===== Контакт отчёта =====

    /**
     * Презентация состоялась с ЭТИМ человеком: счётчик презентаций, сводки
     * «Хвост»/«5К» и блоки анкеты из payload отчёта.
     */
    private applyPresentation(out: ContactFieldsMap): void {
        if (!this.ctx.isPresentationDone) return;

        const counter = this.field('pres_count');
        if (counter) {
            out[this.key(counter)] = this.readNumber(counter) + 1;
        }

        const survey = this.ctx.presentationSurvey;
        if (isPresentationSurveyEmpty(survey)) return;
        this.setText(out, PRESENTATION_SURVEY_SUMMARY_CODES.xvost, survey.xvost);
        this.setText(
            out,
            PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
            survey.fiveKSummary,
        );
        for (const [code, value] of survey.fiveK) this.setText(out, code, value);
        for (const [code, value] of survey.talk) this.setText(out, code, value);
    }

    /**
     * Отказ, в котором ЭТОТ человек участвовал: причина справочником и
     * запись в ленту отказов — тем же текстом, что у сущности.
     */
    private applyFail(out: ContactFieldsMap): void {
        if (!this.ctx.isFail) return;

        const reasonCode = this.ctx.failReasonCode;
        if (reasonCode) {
            this.applyEnumeration(
                out,
                'op_efield_fail_reason',
                `op_efield_fail_${reasonCode}`,
            );
        }
        const label = this.ctx.isNotCa ? 'Не ЦА' : 'Отказ';
        this.appendMultiple(
            out,
            'op_fail_comments',
            `${this.nowCrmDate()} ${label}: ${this.ctx.reportComment}`,
            FAIL_COMMENTS_LIMIT,
        );
    }

    /** Возражение, формулировка, дата покупки — копией со сделки. */
    private applyDealMirror(out: ContactFieldsMap): void {
        const deal = this.ctx.currentBaseDeal as Record<string, unknown> | null;
        if (!deal) return;
        Object.assign(
            out,
            new EventReportContactMirrorModel(
                this.portal,
                this.contact,
                deal,
            ).toFields(),
        );
    }

    // ===== Контакт плана =====

    /** Следующий звонок назначен ЭТОМУ человеку: когда и что. */
    private applyNextCall(out: ContactFieldsMap): void {
        if (!this.ctx.isPlanned) return;
        const deadline = this.ctx.planDeadline?.toCrmDateTime();
        if (deadline) this.setText(out, 'call_next_date', deadline);
        if (this.ctx.planEventName) {
            this.setText(out, 'call_next_name', this.ctx.planEventName);
        }
    }

    // ===== helpers =====

    private field(code: string): IField | undefined {
        return this.portal.getEntityFieldByCode('contact', code);
    }

    private key(field: IField): string {
        return this.portal.getFieldBitrixId(field);
    }

    private nowCrmDate(): string {
        return this.ctx.dateTime.crmDateTime(this.ctx.nowDate);
    }

    private readNumber(field: IField): number {
        const n = Number(this.contact[this.key(field)]);
        return Number.isFinite(n) ? n : 0;
    }

    private readMultiple(field: IField): string[] {
        const raw = this.contact[this.key(field)];
        if (Array.isArray(raw)) return raw.map(v => String(v));
        if (typeof raw === 'string' && raw) return [raw];
        return [];
    }

    /**
     * Текст одним значением batch-команды — строгое экранирование: ответы
     * анкеты и имена событий — свободный текст, `&`/`+`/`%` рвут разбор.
     */
    private setText(
        out: ContactFieldsMap,
        code: string,
        value: string | null | undefined,
    ): void {
        if (!value) return;
        const field = this.field(code);
        if (!field) return;
        out[this.key(field)] = toBatchSafeText(value);
    }

    private applyEnumeration(
        out: ContactFieldsMap,
        code: string,
        itemCode: string,
    ): void {
        const field = this.field(code);
        if (!field) return;
        const item = this.portal.getFieldItemByCode(field, itemCode);
        if (!item || item.bitrixId == null) return;
        out[this.key(field)] = item.bitrixId;
    }

    /** Запись ленты — одной строкой, экранирование здесь и только здесь. */
    private appendMultiple(
        out: ContactFieldsMap,
        code: string,
        line: string,
        limit: number,
    ): void {
        const field = this.field(code);
        if (!field) return;
        out[this.key(field)] = fitMultipleEntries(
            [
                toBatchSafeText(toMultiFieldEntryText(line)),
                ...this.readMultiple(field).map(entry => toBatchSafeText(entry)),
            ],
            limit,
        );
    }
}

/**
 * Контакты события с их ролями: контакт отчёта и контакт плана, один
 * человек в обеих ролях — одна запись с объединёнными ролями.
 */
export const resolveEventContacts = (
    ctx: EventReportContext,
): Array<{ contact: Record<string, unknown>; roles: Set<ContactRole> }> => {
    const byId = new Map<
        number,
        { contact: Record<string, unknown>; roles: Set<ContactRole> }
    >();
    const add = (raw: unknown, role: ContactRole): void => {
        const contact = raw as Record<string, unknown> | null;
        const id = Number(contact?.ID);
        if (!contact || !Number.isFinite(id) || id <= 0) return;
        const entry = byId.get(id) ?? { contact, roles: new Set<ContactRole>() };
        entry.roles.add(role);
        byId.set(id, entry);
    };
    add(ctx.reportContact, EContactRole.REPORT);
    add(ctx.planContact, EContactRole.PLAN);
    return [...byId.values()];
};
