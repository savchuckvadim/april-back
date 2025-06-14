import { Injectable } from "@nestjs/common";

import { DepartmentBitrixService } from "@/modules/bitrix/domain/department/services/department-bitrxi.service";
import { PBXService } from "@/modules/pbx";

@Injectable()
export class BxAllDepartmentsService {


  constructor(


    private readonly pbx: PBXService

  ) {


  }

  async getAll(domain: string) {
    const { bitrix } = await this.pbx.init(domain);


    const departmentService = new DepartmentBitrixService(bitrix.api);

    const departments = await departmentService.getDepartmentsAll();
    return departments;
  }

}
