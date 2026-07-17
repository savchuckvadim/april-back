import {
    IDepartment,
    IPCallingTasksGroup,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalAggregate } from '../repositories/portal-aggregate.types';
import {
    BitrixListModel,
    CompanyModel,
    ContactModel,
    DealModel,
    LeadModel,
    RpaModel,
    SmartModel,
    UserModel,
    mapBitrixList,
    mapCompany,
    mapContact,
    mapDeal,
    mapLead,
    mapRpa,
    mapSmart,
    mapUser,
} from './pbx-entity.mapper';
import { mapCallingGroup, mapDepartament } from './portal-parts.mapper';

/** Все смапленные коллекции портала — общий материал для front- и backend-моделей. */
export interface PortalParts {
    smarts: SmartModel[];
    deals: DealModel[];
    leads: LeadModel[];
    companies: CompanyModel[];
    contacts: ContactModel[];
    users: UserModel[];
    rpas: RpaModel[];
    lists: BitrixListModel[];
    departaments: IDepartment[];
    callingGroups: IPCallingTasksGroup[];
}

/** Маппит все relations агрегата в коллекции формы Laravel. */
export const buildPortalParts = (aggregate: PortalAggregate): PortalParts => {
    const { portal } = aggregate;
    return {
        smarts: portal.smarts.map(row => mapSmart(row, aggregate)),
        deals: portal.btx_deals.map(row => mapDeal(row, aggregate)),
        leads: portal.btx_leads.map(row => mapLead(row, aggregate)),
        companies: portal.btx_companies.map(row => mapCompany(row, aggregate)),
        contacts: portal.btx_contacts.map(row => mapContact(row, aggregate)),
        users: portal.btx_users.map(row => mapUser(row, aggregate)),
        rpas: portal.btx_rpas.map(row => mapRpa(row, aggregate)),
        lists: portal.bitrixlists.map(row => mapBitrixList(row, aggregate)),
        departaments: portal.departaments.map(mapDepartament),
        callingGroups: portal.callings.map(mapCallingGroup),
    };
};
