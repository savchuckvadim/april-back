import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BtxCompanyService } from '../services/btx-company.service';
import { CreateBtxCompanyDto } from '../dto/create-btx-company.dto';
import { UpdateBtxCompanyDto } from '../dto/update-btx-company.dto';
import { BtxCompanyResponseDto } from '../dto/btx-company-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx Companies Management')
@Controller('admin/portals/btx-companies')
export class BtxCompanyController {
    constructor(private readonly companyService: BtxCompanyService) {}

    @ApiOperation({ summary: 'Create a new btx company' })
    @ApiResponse({
        status: 201,
        description: 'Company created successfully',
        type: BtxCompanyResponseDto,
    })
    @Post()
    async createCompany(@Body() createCompanyDto: CreateBtxCompanyDto): Promise<SuccessResponseDto> {
        const company = await this.companyService.create(createCompanyDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: company,
        };
    }

    @ApiOperation({ summary: 'Get company by ID' })
    @ApiResponse({
        status: 200,
        description: 'Company found',
        type: BtxCompanyResponseDto,
    })
    @Get(':id')
    async getCompanyById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const company = await this.companyService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: company,
        };
    }

    @ApiOperation({ summary: 'Get all companies' })
    @ApiResponse({
        status: 200,
        description: 'Companies found',
        type: [BtxCompanyResponseDto],
    })
    @Get()
    async getAllCompanies(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let companies;
        if (portalId) {
            companies = await this.companyService.findByPortalId(Number(portalId));
        } else {
            companies = await this.companyService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: companies,
        };
    }

    @ApiOperation({ summary: 'Update company' })
    @ApiResponse({
        status: 200,
        description: 'Company updated successfully',
        type: BtxCompanyResponseDto,
    })
    @Put(':id')
    async updateCompany(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateCompanyDto: UpdateBtxCompanyDto,
    ): Promise<SuccessResponseDto> {
        const company = await this.companyService.update(id, updateCompanyDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: company,
        };
    }

    @ApiOperation({ summary: 'Delete company' })
    @ApiResponse({
        status: 200,
        description: 'Company deleted successfully',
    })
    @Delete(':id')
    async deleteCompany(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.companyService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

