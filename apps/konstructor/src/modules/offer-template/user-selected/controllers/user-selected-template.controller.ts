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
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@Controller('user-selected-templates')
export class UserSelectedTemplateController {
    constructor(
        private readonly userSelectedTemplateService: UserSelectedTemplateService,
    ) {}
    @ApiOperation({
        summary: 'Create user selected template',
        description: 'Create a new user selected template',
    })
    @ApiResponse({
        status: 201,
        description: 'User selected template created successfully',
    })
    @ApiBody({
        type: CreateUserSelectedTemplateDto,
        description: 'User selected template data',
    })
    @Post()
    async createUserSelectedTemplate(
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate> {
        return await this.userSelectedTemplateService.create(
            createUserSelectedTemplateDto,
        );
    }
    @ApiOperation({
        summary: 'Delete user selected template',
        description: 'Delete a user selected template',
    })
    @ApiResponse({
        status: 204,
        description: 'User selected template deleted successfully',
    })
    @ApiParam({
        name: 'id',
        description: 'The user selected template id',
        example: 1,
    })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(
        @Param() params: UserSelectedTemplateIdParamsDto,
    ): Promise<void> {
        return this.userSelectedTemplateService.delete(BigInt(params.id));
    }

    @ApiOperation({
        summary: 'Set current user selected template',
        description: 'Set the current user selected template',
    })
    @ApiResponse({
        status: 200,
        description: 'Current user selected template set successfully',
    })
    @Post('current')
    @ApiBody({
        type: CreateUserSelectedTemplateDto,
        description: 'User selected template data',
    })
    @ApiResponse({
        status: 200,
        description: 'Current user selected template set successfully',
        type: UserSelectedTemplateEntityDto,
    })
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

    @ApiOperation({
        summary: 'Set favorite user selected template',
        description: 'Set the favorite user selected template',
    })
    @ApiResponse({
        status: 200,
        description: 'Favorite user selected template set successfully',
    })
    @Post('favorite')
    @ApiBody({
        type: CreateUserSelectedTemplateDto,
        description: 'User selected template data',
    })
    @ApiResponse({
        status: 200,
        description: 'Favorite user selected template set successfully',
        type: UserSelectedTemplateEntityDto,
    })
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

    @ApiOperation({
        summary: 'Set active user selected template',
        description: 'Set the active user selected template',
    })
    @ApiResponse({
        status: 200,
        description: 'Active user selected template set successfully',
    })
    @ApiBody({
        type: CreateUserSelectedTemplateDto,
        description: 'User selected template data',
    })
    @ApiResponse({
        status: 200,
        description: 'Active user selected template set successfully',
        type: UserSelectedTemplateEntityDto,
    })
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
