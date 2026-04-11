import {
    BadRequestException,
    Controller,
    Post,
    Body,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { UserSelectedTemplateService } from '../services/user-selected-template.service';
import { CreateUserSelectedTemplateDto } from '../dtos/create-user-selected-template.dto';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';
import { UserSelectedTemplateIdParamsDto } from '../dtos/user-selected-template-params.dto';
import { UserSelectedTemplateEntityDto } from '../dtos/user-selected-entity.dto';

@Controller('user-selected-templates')
export class UserSelectedTemplateController {
    constructor(
        private readonly userSelectedTemplateService: UserSelectedTemplateService,
    ) {}

    @Post()
    async createUserSelectedTemplate(
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate> {
        return await this.userSelectedTemplateService.create(
            createUserSelectedTemplateDto,
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(
        @Param() params: UserSelectedTemplateIdParamsDto,
    ): Promise<void> {
        return this.userSelectedTemplateService.delete(BigInt(params.id));
    }

    @Post('current')
    async setCurrent(
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplateEntityDto | boolean> {
        const templateRelation =
            await this.userSelectedTemplateService.setCurrentByPortalUserTemplate(
                createUserSelectedTemplateDto,
            );

        if (templateRelation instanceof UserSelectedTemplate) {
            return new UserSelectedTemplateEntityDto(templateRelation);
        } else {
            return templateRelation;
        }
    }

    @Post('favorite')
    async setFavorite(
        @Query('is_favorite') is_favorite: string,
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplateEntityDto | boolean> {
        if (is_favorite !== 'true' && is_favorite !== 'false') {
            throw new BadRequestException(
                'Query parameter is_favorite is required and must be "true" or "false" (e.g. ?is_favorite=true)',
            );
        }

        return await this.userSelectedTemplateService.setFavoriteByPortalUserTemplate(
            createUserSelectedTemplateDto,
            is_favorite === 'true',
        );
    }

    @Post('active')
    async setActiveUserSelectedTemplate(
        @Query('is_active') is_active: string,
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplateEntityDto> {
        if (is_active !== 'true' && is_active !== 'false') {
            throw new BadRequestException(
                'Query parameter is_active is required and must be "true" or "false" (e.g. ?is_active=true)',
            );
        }
        const templateRelation =
            await this.userSelectedTemplateService.setActiveByPortalUserTemplate(
                createUserSelectedTemplateDto,
                is_active === 'true',
            );
        return new UserSelectedTemplateEntityDto(templateRelation);
    }
}
