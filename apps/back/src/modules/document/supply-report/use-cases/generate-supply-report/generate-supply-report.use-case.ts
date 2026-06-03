// application/use-cases/generate-supply-report.use-case.ts
import { Injectable } from '@nestjs/common';
import { GenerateSupplyReportDto } from '../../dto/generate-supply-report.dto';
// import { DocxTemplateService } from '../../infrastructure/services/docx-template.service';
// import { LibreOfficeService } from '../../infrastructure/services/libreoffice.service';
// import { BitrixGateway } from '../../infrastructure/services/supply-report.gateway';

@Injectable()
export class GenerateSupplyReportUseCase {
    constructor() {} // private readonly bitrixGateway: BitrixGateway, // private readonly libreOfficeService: LibreOfficeService, // private readonly docxService: DocxTemplateService,

    execute(dto: GenerateSupplyReportDto): unknown {
        const v = (dto.bxCompanyItems as { id: number }[]).find(
            item => item.id == 2,
        );
        console.log(v);

        return v;
        // const docxPath = await this.docxService.generate(dto);
        // const pdfPath = await this.libreOfficeService.convertToPdf(docxPath);
        // await this.bitrixGateway.sendTimelineComment(dto.domain, dto.dealId, pdfPath);
        // return { link: this.docxService.getDownloadLink(pdfPath) };
    }
}
