import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReqUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Pageable } from '../../common/interfaces/pageable.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../user/entities/user.entity';
import { DiscussionService } from './discussion.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import {
  DiscussionResponseDto,
  PageableDiscussionResponseDto,
  PopularTagsResponseDto,
} from './dto/discussion-response.dto';
import { SearchDiscussionDto } from './dto/search-discussion.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';

/**
 * Discussion Controller
 *
 * Handles all discussion-related HTTP requests including:
 * - Discussion CRUD operations
 * - Bookmark management
 * - Tag operations
 * - Search and filtering
 */
@ApiTags('Discussions')
@Controller('discussions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DiscussionController {
  constructor(private readonly discussionService: DiscussionService) {}

  // ==================== DISCUSSION LISTING & SEARCH ====================

  @Get()
  @ApiOperation({
    summary: 'Get all discussions with pagination and filters',
    description: 'Retrieve a paginated list of discussions with optional search, filtering, and sorting capabilities',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved paginated list of discussions',
    type: PageableDiscussionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getAllDiscussions(
    @Query() searchDto: SearchDiscussionDto,
    @ReqUser() currentUser: User,
  ): Promise<Pageable<DiscussionResponseDto>> {
    return this.discussionService.findAll(searchDto, currentUser);
  }

  @Get('tags/popular')
  @ApiOperation({
    summary: 'Get popular tags',
    description: 'Retrieve a paginated list of popular discussion tags',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved popular tags',
    type: [PopularTagsResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getPopularTags(@Query() paginationDto: PaginationDto): Promise<Pageable<PopularTagsResponseDto>> {
    return this.discussionService.getPopularTags(paginationDto.page, paginationDto.limit);
  }

  // ==================== BOOKMARK OPERATIONS ====================

  @Get('bookmarked')
  @ApiOperation({
    summary: 'Get current user bookmarked discussions',
    description: 'Retrieve a paginated list of discussions bookmarked by the current user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved bookmarked discussions',
    type: PageableDiscussionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getBookmarkedDiscussions(
    @ReqUser() currentUser: User,
    @Query() searchDto: SearchDiscussionDto,
  ): Promise<Pageable<DiscussionResponseDto>> {
    return this.discussionService.getBookmarkedDiscussions(currentUser.id, searchDto);
  }

  // ==================== DISCUSSION CRUD OPERATIONS ====================

  @Post()
  @ApiOperation({
    summary: 'Create a new discussion',
    description: 'Create a new discussion with optional file attachments',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Discussion created successfully',
    type: DiscussionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @UseInterceptors(FilesInterceptor('files', 4))
  async createDiscussion(
    @Body() createDiscussionDto: CreateDiscussionDto,
    @ReqUser() currentUser: User,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<DiscussionResponseDto> {
    return this.discussionService.create(createDiscussionDto, currentUser, files);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get discussion by ID',
    description: 'Retrieve detailed information about a specific discussion',
  })
  @ApiParam({
    name: 'id',
    description: 'Discussion ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved discussion details',
    type: DiscussionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Discussion not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  async getDiscussionById(
    @Param('id', ParseIntPipe) id: number,
    @ReqUser() currentUser: User,
  ): Promise<DiscussionResponseDto> {
    return this.discussionService.findById(id, currentUser);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update discussion',
    description: 'Update an existing discussion with optional new file attachments',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'id',
    description: 'Discussion ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Discussion updated successfully',
    type: DiscussionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data or validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to update this discussion',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Discussion not found',
  })
  @UseInterceptors(FilesInterceptor('files', 4))
  async updateDiscussion(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDiscussionDto: UpdateDiscussionDto,
    @ReqUser() currentUser: User,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<DiscussionResponseDto> {
    return this.discussionService.update(id, updateDiscussionDto, currentUser, files);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete discussion',
    description: 'Soft delete a discussion (only the author or admin can delete)',
  })
  @ApiParam({
    name: 'id',
    description: 'Discussion ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Discussion deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to delete this discussion',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Discussion not found',
  })
  async deleteDiscussion(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.discussionService.delete(id, currentUser);
  }

  // ==================== BOOKMARK MANAGEMENT ====================

  @Post(':id/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bookmark a discussion',
    description: 'Add a discussion to the current user bookmarks',
  })
  @ApiParam({
    name: 'id',
    description: 'Discussion ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Discussion bookmarked successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Discussion not found',
  })
  async bookmarkDiscussion(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.discussionService.bookmarkDiscussion(id, currentUser.id);
  }

  @Delete(':id/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove bookmark from a discussion',
    description: 'Remove a discussion from the current user bookmarks',
  })
  @ApiParam({
    name: 'id',
    description: 'Discussion ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bookmark removed successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Discussion or bookmark not found',
  })
  async unbookmarkDiscussion(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.discussionService.unbookmarkDiscussion(id, currentUser.id);
  }
}
