import {
    EnumOrkEventAction,
    EnumOrkEventCommunication,
    EnumOrkEventInitiative,
    EnumOrkEventType,
    EnumOrkFieldCode,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { OrkFieldResolver } from '../ork/ork-field.resolver';
import { compareDates } from './utils/date.util';

/** Числовые/строковые/множественные поля одного клиента (контакт или компания). */
export interface ISmartClientFields {
    countCommunicationFact: number;
    countCommunicationIncoming: number;
    countCommunicationOutgoing: number;
    countPresentation: number;
    countEdu: number;
    countFirstEdu: number;
    countSignal: number;
    countSuccessSignal: number;
    countCall: number;
    countFace: number;
    dateLastEdu: string;
    dateNextEdu: string;
    dateLastCall: string;
    dateNextCall: string;
    responsibleFirstEdu: string[];
    responsibleEdu: string[];
    responsiblePresentation: string[];
    typeClient: string;
    position: string;
    phone: string;
    email: string;
    countCommunicationPlan: number;
    degreeNeed: number;
}

/** Клиент смарт-отчёта: компания или контакт + агрегированные поля. */
export interface ISmartClient {
    bxId: number;
    fields: ISmartClientFields;
}

/** Создаёт пустой набор полей клиента. */
export function createEmptyClientFields(): ISmartClientFields {
    return {
        countCommunicationFact: 0,
        countCommunicationIncoming: 0,
        countCommunicationOutgoing: 0,
        countPresentation: 0,
        countEdu: 0,
        countFirstEdu: 0,
        countSignal: 0,
        countSuccessSignal: 0,
        countCall: 0,
        countFace: 0,
        dateLastEdu: '',
        dateNextEdu: '',
        dateLastCall: '',
        dateNextCall: '',
        responsibleFirstEdu: [],
        responsibleEdu: [],
        responsiblePresentation: [],
        typeClient: '',
        position: '',
        phone: '',
        email: '',
        countCommunicationPlan: 0,
        degreeNeed: 0,
    };
}

/**
 * Чистая модель агрегации истории ОРК в поля смарт-отчёта (аналог legacy
 * `find_field_list` + слияние контактов в компанию). Без обращений к Bitrix —
 * только резолвер портальных полей и сырые элементы списка.
 */
export class SmartReportClientAggregator {
    constructor(private readonly resolver: OrkFieldResolver) {}

    /**
     * Разбирает один элемент списка ОРК-история в {@link ISmartClient}.
     * Считает результативные/запланированные события по типам, коммуникации,
     * датам и ответственным; определяет принадлежность к контакту/компании.
     */
    aggregateElement(element: Record<string, unknown>): ISmartClient {
        const fields = createEmptyClientFields();
        const actionValue = this.scalar(
            element,
            EnumOrkFieldCode.ork_event_action,
        );

        if (
            this.isItem(
                actionValue,
                EnumOrkFieldCode.ork_event_action,
                EnumOrkEventAction.ea_ork_done,
            )
        ) {
            this.applyDone(element, fields);
        } else if (
            this.isItem(
                actionValue,
                EnumOrkFieldCode.ork_event_action,
                EnumOrkEventAction.ea_ork_plan,
            )
        ) {
            this.applyPlan(element, fields);
        }

        return { bxId: this.resolveBxId(element), fields };
    }

    /**
     * Сливает разобранный элемент в накопленный список клиентов: либо добавляет
     * нового, либо суммирует поля существующего (по bxId).
     */
    mergeElementIntoClients(
        clients: ISmartClient[],
        element: ISmartClient,
    ): void {
        const existing = clients.find(c => c.bxId === element.bxId);
        if (!existing) {
            clients.push(element);
            return;
        }
        const e = element.fields;
        const t = existing.fields;
        t.countCommunicationFact += e.countCommunicationFact;
        t.countCommunicationIncoming += e.countCommunicationIncoming;
        t.countCommunicationOutgoing += e.countCommunicationOutgoing;
        t.countPresentation += e.countPresentation;
        t.countEdu += e.countEdu;
        t.countFirstEdu += e.countFirstEdu;
        t.countSignal += e.countSignal;
        t.countSuccessSignal += e.countSuccessSignal;
        t.countCall += e.countCall;
        t.countFace += e.countFace;
        if (e.dateLastEdu) t.dateLastEdu = e.dateLastEdu;
        if (e.dateNextEdu) t.dateNextEdu = e.dateNextEdu;
        if (e.dateLastCall) t.dateLastCall = e.dateLastCall;
        if (e.dateNextCall) t.dateNextCall = e.dateNextCall;
        this.mergeUnique(t.responsibleFirstEdu, e.responsibleFirstEdu);
        this.mergeUnique(t.responsibleEdu, e.responsibleEdu);
        this.mergeUnique(t.responsiblePresentation, e.responsiblePresentation);
    }

    /**
     * Сливает все контактные поля в поля компании (суммы счётчиков, уникальные
     * ответственные, поздние даты) — аналог блока company в legacy.
     */
    mergeContactsIntoCompany(
        company: ISmartClient,
        contacts: ISmartClient[],
    ): void {
        for (const contact of contacts) {
            if (contact.bxId === company.bxId) continue;
            const c = contact.fields;
            const t = company.fields;
            t.countCommunicationFact += c.countCommunicationFact;
            t.countCommunicationIncoming += c.countCommunicationIncoming;
            t.countCommunicationOutgoing += c.countCommunicationOutgoing;
            t.countPresentation += c.countPresentation;
            t.countEdu += c.countEdu;
            t.countFirstEdu += c.countFirstEdu;
            t.countSignal += c.countSignal;
            t.countSuccessSignal += c.countSuccessSignal;
            t.countCall += c.countCall;
            t.countFace += c.countFace;
            t.dateLastEdu = compareDates(t.dateLastEdu, c.dateLastEdu, true);
            t.dateLastCall = compareDates(t.dateLastCall, c.dateLastCall, true);
            this.mergeUnique(t.responsibleFirstEdu, c.responsibleFirstEdu);
            this.mergeUnique(t.responsibleEdu, c.responsibleEdu);
            this.mergeUnique(
                t.responsiblePresentation,
                c.responsiblePresentation,
            );
        }
    }

    // ---------- private ----------

    private applyDone(
        element: Record<string, unknown>,
        fields: ISmartClientFields,
    ): void {
        fields.countCommunicationFact += 1;

        const initiative = this.scalar(
            element,
            EnumOrkFieldCode.ork_event_initiative,
        );
        if (
            this.isItem(
                initiative,
                EnumOrkFieldCode.ork_event_initiative,
                EnumOrkEventInitiative.ei_ork_incoming,
            )
        ) {
            fields.countCommunicationIncoming += 1;
        } else if (
            this.isItem(
                initiative,
                EnumOrkFieldCode.ork_event_initiative,
                EnumOrkEventInitiative.ei_ork_outgoing,
            )
        ) {
            fields.countCommunicationOutgoing += 1;
        }

        const type = this.scalar(element, EnumOrkFieldCode.ork_event_type);
        const responsible = this.scalar(element, EnumOrkFieldCode.responsible);
        const eventDate = this.scalar(element, EnumOrkFieldCode.ork_event_date);

        if (
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_presentation,
            )
        ) {
            fields.countPresentation += 1;
            this.pushUnique(fields.responsiblePresentation, responsible);
        } else if (
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_edu_first,
            )
        ) {
            fields.countFirstEdu += 1;
            this.pushUnique(fields.responsibleFirstEdu, responsible);
        } else if (
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_edu,
            )
        ) {
            fields.countEdu += 1;
            if (eventDate) fields.dateLastEdu = eventDate;
            this.pushUnique(fields.responsibleEdu, responsible);
        } else if (
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_signal,
            )
        ) {
            fields.countSuccessSignal += 1;
        }

        const communication = this.scalar(
            element,
            EnumOrkFieldCode.event_communication,
        );
        if (
            this.isItem(
                communication,
                EnumOrkFieldCode.event_communication,
                EnumOrkEventCommunication.ec_ork_call,
            )
        ) {
            fields.countCall += 1;
        } else if (
            this.isItem(
                communication,
                EnumOrkFieldCode.event_communication,
                EnumOrkEventCommunication.ec_ork_face,
            )
        ) {
            fields.countFace += 1;
        }

        if (eventDate) fields.dateLastCall = eventDate;
        const planDate = this.scalar(element, EnumOrkFieldCode.ork_plan_date);
        if (planDate) {
            fields.dateNextEdu = planDate;
            fields.dateNextCall = planDate;
        }
    }

    private applyPlan(
        element: Record<string, unknown>,
        fields: ISmartClientFields,
    ): void {
        const type = this.scalar(element, EnumOrkFieldCode.ork_event_type);
        if (
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_signal,
            )
        ) {
            fields.countSignal += 1;
            return;
        }
        const isEdu =
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_edu_first,
            ) ||
            this.isItem(
                type,
                EnumOrkFieldCode.ork_event_type,
                EnumOrkEventType.et_ork_edu,
            );
        if (isEdu) {
            const planDate = this.scalar(
                element,
                EnumOrkFieldCode.ork_plan_date,
            );
            if (planDate) fields.dateNextEdu = planDate;
        }
    }

    private resolveBxId(element: Record<string, unknown>): number {
        const contact = this.scalar(element, EnumOrkFieldCode.ork_crm_contact);
        if (contact) {
            const id = Number(String(contact).replace(/^C_/, ''));
            if (Number.isFinite(id) && id > 0) return id;
        }
        const company = this.scalar(element, EnumOrkFieldCode.ork_crm_company);
        if (company) {
            const id = Number(String(company).replace(/^CO_/, ''));
            if (Number.isFinite(id)) return id;
        }
        return 0;
    }

    private isItem(
        rawValue: string | undefined,
        fieldCode: EnumOrkFieldCode,
        itemCode: string,
    ): boolean {
        if (rawValue === undefined) return false;
        const bitrixId = this.resolver.itemBitrixId(fieldCode, itemCode);
        return bitrixId !== undefined && String(rawValue) === String(bitrixId);
    }

    /** Читает скалярное значение свойства элемента (учитывает формат `{id:value}`). */
    private scalar(
        element: Record<string, unknown>,
        fieldCode: EnumOrkFieldCode,
    ): string | undefined {
        const camelId = this.resolver.camelId(fieldCode);
        if (!camelId) return undefined;
        const raw = element[camelId];
        if (typeof raw === 'object' && raw !== null) {
            const values = Object.values(raw as Record<string, unknown>);
            return values.length ? this.toScalar(values[0]) : undefined;
        }
        return this.toScalar(raw);
    }

    /** Безопасно приводит примитив к строке; объекты/пустые значения → undefined. */
    private toScalar(value: unknown): string | undefined {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        return undefined;
    }

    private pushUnique(list: string[], value: string | undefined): void {
        if (value && !list.includes(value)) {
            list.push(value);
        }
    }

    private mergeUnique(target: string[], source: string[]): void {
        for (const item of source) {
            if (!target.includes(item)) target.push(item);
        }
    }
}
