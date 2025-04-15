// application/use-cases/generate-supply-report.use-case.ts
import { Injectable } from '@nestjs/common';
import { GenerateSupplyReportDto } from '../../dto/generate-supply-report.dto';
// import { DocxTemplateService } from '../../infrastructure/services/docx-template.service';
// import { LibreOfficeService } from '../../infrastructure/services/libreoffice.service';
// import { BitrixGateway } from '../../infrastructure/services/supply-report.gateway';

@Injectable()
export class GenerateSupplyReportUseCase {
  constructor(
    // private readonly docxService: DocxTemplateService,
    // private readonly libreOfficeService: LibreOfficeService,
    // private readonly bitrixGateway: BitrixGateway,
  ) { }

  async execute(dto: GenerateSupplyReportDto) {
    const d = dto
    const v = dto.bxCompanyItems.find(item => item.id == 2)
    debugger
    console.log(v)

    return v
    // const docxPath = await this.docxService.generate(dto);
    // const pdfPath = await this.libreOfficeService.convertToPdf(docxPath);
    // await this.bitrixGateway.sendTimelineComment(dto.domain, dto.dealId, pdfPath);
    // return { link: this.docxService.getDownloadLink(pdfPath) };
  }
}
