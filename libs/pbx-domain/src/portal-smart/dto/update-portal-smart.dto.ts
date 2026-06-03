import { PartialType } from '@nestjs/mapped-types';
import { CreatePortalSmartDto } from './create-portal-smart.dto';

/** PATCH body — все поля опциональны (кроме тех, что исключены при необходимости). */
export class UpdatePortalSmartDto extends PartialType(CreatePortalSmartDto) {}
