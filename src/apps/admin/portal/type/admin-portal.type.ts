import { PrismaService } from "@/core";
import { agents, Ai, bitrix_apps, bitrixlists, btx_companies, btx_contacts, btx_deals, btx_leads, btx_rpas, bx_rqs, BxDocumentDeal, callings, Client, deals, departaments, offer_zakupki_settings, OfferTemplatePortal, Portal, portal_contracts, portal_measure, portal_region, provider_currents, smarts, Template, timezones, Transcription } from "generated/prisma";

export interface AdminPortalWithRelations extends Portal {
    agents?: agents[];

    client?: Client | null;
    portal_measures?: portal_measure[] | null;
    portal_smarts?: smarts[] | null;
    portal_timezones?: timezones[] | null;
    portal_contracts?: portal_contracts[] | null;
    portal_regions?: portal_region[] | null;
    portal_templates?: Template[] | null;

    bitrix_apps?: bitrix_apps[] | null;
    bitrixlists?: bitrixlists[] | null;
    btx_companies?: btx_companies[] | null;
    btx_contacts?: btx_contacts[] | null;
    btx_deals?: btx_deals[] | null;
    btx_leads?: btx_leads[] | null;
    btx_rpas?: btx_rpas[] | null;
    callings?: callings[] | null;
    departaments?: departaments[] | null;
    offerTemplatePortal?: OfferTemplatePortal[] | null;
    offer_zakupki_settings?: offer_zakupki_settings[] | null;
    provider_currents?: provider_currents[] | null;
    bx_document_deals?: BxDocumentDeal[] | null;
    deals?: deals[] | null;
    ais?: Ai[] | null;
    bx_rqs?: bx_rqs[] | null;
    transcriptions?: Transcription[] | null;
}
