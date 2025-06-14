import { Injectable } from '@nestjs/common';

interface Portal {
    domain: string;
    apiKey: string;
    C_REST_WEB_HOOK_URL: string;
    C_REST_CLIENT_SECRET: string;
    deals?: any;
    bitrixDeal?: any;
    bitrixLists?: any;
    smarts?: any[];
}

@Injectable()
export class PortalService {
    getPortal(domain: string): Portal {
        // TODO: Implement actual portal data retrieval
        return {
            domain,
            apiKey: '',
            C_REST_WEB_HOOK_URL: '',
            C_REST_CLIENT_SECRET: '',
            deals: {},
            bitrixDeal: {},
            bitrixLists: {},
            smarts: []
        };
    }
} 