import { IsNumber } from 'class-validator';
import { IsString } from 'class-validator';
import { IsBoolean } from 'class-validator';
import {
    INVOICE_QUESTION,
    InvoiceSettings,
    Questions,
} from '../type/invoice-settings.type';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class InvoiceQuestionDto {
    @IsNumber() id: number;
    @IsString() title: string;
    @IsBoolean() isActive: boolean;
    @IsBoolean() value: boolean;
    @IsBoolean() isAnswered: boolean;
}
export class InvoiseQuestionsDto {
    @ValidateNested()
    @Type(() => InvoiceQuestionDto)
    [INVOICE_QUESTION.ONE]: InvoiceQuestionDto;
    @ValidateNested()
    @Type(() => InvoiceQuestionDto)
    [INVOICE_QUESTION.MANY]: InvoiceQuestionDto;
    @ValidateNested()
    @Type(() => InvoiceQuestionDto)
    [INVOICE_QUESTION.PRESENTATION]: InvoiceQuestionDto;
}
export class InvoiceSettingsDto implements InvoiceSettings {
    // status: boolean,
    @ValidateNested()
    @Type(() => InvoiseQuestionsDto)
    questions: InvoiseQuestionsDto;
}
