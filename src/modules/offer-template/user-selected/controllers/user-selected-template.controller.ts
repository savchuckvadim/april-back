import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { UserSelectedTemplateService } from '../services/user-selected-template.service';
import { CreateUserSelectedTemplateDto } from '../dtos/create-user-selected-template.dto';
import { UpdateUserSelectedTemplateDto } from '../dtos/update-user-selected-template.dto';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';
import { UserSelectedTemplateIdParamsDto } from '../dtos/user-selected-template-params.dto';

@Controller('user-selected-templates')
export class UserSelectedTemplateController {
    constructor(
        private readonly userSelectedTemplateService: UserSelectedTemplateService,
    ) { }

    @Post()
    async createUserSelectedTemplate(
        @Body() createUserSelectedTemplateDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate> {
        return this.userSelectedTemplateService.create(
            createUserSelectedTemplateDto,
        );
    }

    // @Get()
    // async findAll(
    //     @Query('bitrix_user_id') bitrix_user_id?: string,
    //     @Query('portal_id') portal_id?: string,
    //     @Query('offer_template_id') offer_template_id?: string,
    //     @Query('is_current') is_current?: string,
    //     @Query('is_favorite') is_favorite?: string,
    //     @Query('is_active') is_active?: string,
    // ): Promise<UserSelectedTemplate[]> {
    //     const filters: any = {};

    //     if (bitrix_user_id) filters.bitrix_user_id = BigInt(bitrix_user_id);
    //     if (portal_id) filters.portal_id = BigInt(portal_id);
    //     if (offer_template_id)
    //         filters.offer_template_id = BigInt(offer_template_id);
    //     if (is_current !== undefined)
    //         filters.is_current = is_current === 'true';
    //     if (is_favorite !== undefined)
    //         filters.is_favorite = is_favorite === 'true';
    //     if (is_active !== undefined) filters.is_active = is_active === 'true';

    //     return this.userSelectedTemplateService.findMany(filters);
    // }

    // @Get('user/:user_id/portal/:portal_id')
    // async findByUser(
    //     @Param('user_id', ParseIntPipe) user_id: number,
    //     @Param('portal_id', ParseIntPipe) portal_id: number,
    // ): Promise<UserSelectedTemplate[]> {
    //     return this.userSelectedTemplateService.findByUser(
    //         BigInt(user_id),
    //         BigInt(portal_id),
    //     );
    // }

    // @Get('user/:user_id/portal/:portal_id/current')
    // async findCurrentByUser(
    //     @Param('user_id', ParseIntPipe) user_id: number,
    //     @Param('portal_id', ParseIntPipe) portal_id: number,
    // ): Promise<UserSelectedTemplate | null> {
    //     return this.userSelectedTemplateService.findCurrentByUser(
    //         BigInt(user_id),
    //         BigInt(portal_id),
    //     );
    // }

    // @Get('user/:user_id/portal/:portal_id/favorites')
    // async findFavoritesByUser(
    //     @Param('user_id', ParseIntPipe) user_id: number,
    //     @Param('portal_id', ParseIntPipe) portal_id: number,
    // ): Promise<UserSelectedTemplate[]> {
    //     return this.userSelectedTemplateService.findFavoritesByUser(
    //         BigInt(user_id),
    //         BigInt(portal_id),
    //     );
    // }

    // @Get('user/:user_id/template/:template_id')
    // async findByUserAndTemplate(
    //     @Param('user_id', ParseIntPipe) user_id: number,
    //     @Param('template_id', ParseIntPipe) template_id: number,
    // ): Promise<UserSelectedTemplate | null> {
    //     return this.userSelectedTemplateService.findByUserAndTemplate(
    //         BigInt(user_id),
    //         BigInt(template_id),
    //     );
    // }

    // @Get(':id')
    // async findOne(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<UserSelectedTemplate> {
    //     return this.userSelectedTemplateService.findById(BigInt(id));
    // }

    // @Get(':id/full')
    // async findOneWithRelations(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<UserSelectedTemplate> {
    //     return this.userSelectedTemplateService.findWithRelations(BigInt(id));
    // }

    // @Patch(':id')
    // async update(
    //     @Param('id', ParseIntPipe) id: number,
    //     @Body() updateUserSelectedTemplateDto: UpdateUserSelectedTemplateDto,
    // ): Promise<UserSelectedTemplate> {
    //     return this.userSelectedTemplateService.update(
    //         BigInt(id),
    //         updateUserSelectedTemplateDto,
    //     );
    // }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: UserSelectedTemplateIdParamsDto): Promise<void> {
        return this.userSelectedTemplateService.delete(BigInt(params.id));
    }

    @Patch(':id/current')
    async setCurrent(
        @Param() params: UserSelectedTemplateIdParamsDto,
    ): Promise<UserSelectedTemplate> {
        return this.userSelectedTemplateService.setCurrent(BigInt(params.id));
    }

    @Patch(':id/favorite')
    async setFavorite(
        @Param() params: UserSelectedTemplateIdParamsDto,
        @Body('is_favorite') is_favorite: boolean,
    ): Promise<UserSelectedTemplate> {
        return this.userSelectedTemplateService.setFavorite(
            BigInt(params.id),
            is_favorite,
        );
    }

    @Patch(':id/active')
    async setActiveUserSelectedTemplate(
        @Param() params: UserSelectedTemplateIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<UserSelectedTemplate> {
        return this.userSelectedTemplateService.setActive(
            BigInt(params.id),
            is_active,
        );
    }
}
