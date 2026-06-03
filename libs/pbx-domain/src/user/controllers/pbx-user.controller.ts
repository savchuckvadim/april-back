import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PbxUserService } from '../services/pbx-user.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PbxUserEntityDto } from '../dto/pbx-user-entity.dto';
import { PbxUserCreateDto } from '../dto/pbx-user-create.dto';
import { PbxUserUpdateDto } from '../dto/pbx-user-update.dto';

@ApiTags('PBX User')
@Controller('pbx/user')
export class PbxUserController {
    constructor(private readonly pbxUserService: PbxUserService) {}

    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({
        status: 200,
        description: 'Users found',
        type: [PbxUserEntityDto],
    })
    @Get('all')
    async getAllUsers(): Promise<PbxUserEntityDto[]> {
        return await this.pbxUserService.findAll();
    }

    @ApiOperation({ summary: 'Get user by ID' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: PbxUserEntityDto,
    })
    @Get(':id')
    async getUserById(@Param('id') id: string): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.findById(id);
    }
    @ApiOperation({ summary: 'Get user by portal ID' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: PbxUserEntityDto,
    })
    @Get('portal/:portalId')
    async getUserByPortalId(
        @Param('portalId') portalId: string,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.findByPortalId(portalId);
    }
    @ApiOperation({ summary: 'Get user by portal domain' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: PbxUserEntityDto,
    })
    @Get('portal/:portalDomain')
    async getUserByPortalDomain(
        @Param('portalDomain') portalDomain: string,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.findByPortalDomain(portalDomain);
    }

    @ApiOperation({ summary: 'Create user by domain' })
    @ApiResponse({
        status: 201,
        description: 'User created',
        type: PbxUserEntityDto,
    })
    @Post('domain/:domain')
    async createUserByDomain(
        @Param('domain') domain: string,
        @Body() user: PbxUserUpdateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.createByDomain(user.code, domain);
    }

    @ApiOperation({ summary: 'Create user' })
    @ApiResponse({
        status: 201,
        description: 'User created',
        type: PbxUserEntityDto,
    })
    @Post()
    async createUser(
        @Body() user: PbxUserCreateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.create(
            user.code,
            user.portalId.toString(),
        );
    }

    @ApiOperation({ summary: 'Update user' })
    @ApiResponse({
        status: 200,
        description: 'User updated',
        type: PbxUserEntityDto,
    })
    @Put(':id')
    async updateUser(
        @Param('id') id: string,
        @Body() user: PbxUserUpdateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.update(id, user);
    }
}
