import type { InvoiceTemplate } from 'generated/prisma';
import type { InvoiceTemplateTypeValue } from '../dto/invoice-template.enums';
import type { InvoiceTemplateLike } from '../dto/invoice-template-response.dto';
import { InvoiceTemplateResponseDto } from '../dto/invoice-template-response.dto';

export function mapInvoiceTemplateToResponseDto(
    row: InvoiceTemplate,
    getTemplateDownloadPath: (id: string) => string,
): InvoiceTemplateResponseDto {
    return InvoiceTemplateResponseDto.fromEntity(
        row as InvoiceTemplateLike,
        getTemplateDownloadPath(row.id),
    );
}

export function mapInvoiceTemplateRowToDownloadMeta(row: InvoiceTemplate): {
    file_path: string;
    name: string;
    type: InvoiceTemplateTypeValue;
} {
    return {
        file_path: row.file_path,
        name: row.name,
        type: row.type as InvoiceTemplateTypeValue,
    };
}
