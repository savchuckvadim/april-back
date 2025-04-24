import { Injectable } from "@nestjs/common";
import { PortalService } from "../portal.service";
import { PortalContextService } from "./portal-context.service";
import { IPortal } from "../interfaces/portal.interface";
import { PortalModelFactory } from "../factory/potal-model.factory";
import { PortalModel } from "./portal.model";

@Injectable()
export class PortalProviderService {
  constructor(
    private readonly portalService: PortalService,
    private readonly portalContext: PortalContextService,
    private readonly portalModelFactory: PortalModelFactory
  ) {}

  async getPortal(domain?: string): Promise<IPortal> {
    if (domain) {
      return this.portalService.getPortalByDomain(domain);
    }
    return this.portalContext.getPortal();
    // try {
    //   return this.portalContext.getPortal();
    // } catch {
    //   if (!domain) throw new Error('Domain required for non-context access');
    //   return this.portalService.getPortalByDomain(domain);
    // }  
  }

  async getModel(domain?: string): Promise<PortalModel> {
    let portal: IPortal;

    if(domain){
      portal = await this.portalService.getPortalByDomain(domain);
      return this.portalModelFactory.create(portal);
    }
    try {
      portal = this.portalContext.getPortal(); // из контекста запроса
    } catch {
      if (!domain) throw new Error('Domain required for portal model outside request');
      portal = await this.portalService.getPortalByDomain(domain); // вручную
    }

    return this.portalModelFactory.create(portal); // модель с методами
  }
}
