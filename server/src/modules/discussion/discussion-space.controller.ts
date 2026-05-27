/**
 * Discussion Space Controller
 *
 * This controller handles HTTP requests for discussion space operations including:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Following and unfollowing spaces
 * - Popular spaces retrieval
 * - Search and filtering capabilities
 *
 * All endpoints require authentication unless specified otherwise.
 *
 * @author Open Forum Team
 * @version 1.0.0
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReqUser } from '../../common/decorators/user.decorator';
import { Pageable } from '../../common/interfaces/pageable.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../user/entities/user.entity';
import { DiscussionSpaceService } from './discusison-space.service';
import { CreateDiscussionSpaceDto } from './dto/create-discussion-space.dto';
import { DiscussionSpaceResponseDto, PageableDiscussionSpaceResponseDto } from './dto/discussion-space-response.dto';
import { SearchSpaceDto } from './dto/search-space.dto';
import { UpdateDiscussionSpaceDto } from './dto/update-discussion-space.dto';

@ApiTags('Discussion Spaces')
@Controller('spaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DiscussionSpaceController {
  constructor(private readonly spaceService: DiscussionSpaceService) {}

  // ==========================================
  // CORE CRUD OPERATIONS
  // ==========================================

  /**
   * Create a new discussion space
   * Supports file uploads for space icon and banner images
   */
  @Post()
  @UseInterceptors(FilesInterceptor('files', 2))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new discussion space',
    description:
      'Creates a new discussion space with optional icon and banner uploads. The authenticated user becomes the creator of the space.',
  })
  @ApiResponse({
    status: 201,
    description: 'Discussion space created successfully',
    type: DiscussionSpaceResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 409, description: 'Conflict - Space slug already exists' })
  async createSpace(
    @Body() createDto: CreateDiscussionSpaceDto,
    @UploadedFiles() files: Express.Multer.File[],
    @ReqUser() currentUser: User,
  ): Promise<DiscussionSpaceResponseDto> {
    const filesByType = this.organizeUploadedFiles(files);
    return this.spaceService.create(createDto, currentUser, filesByType);
  }

  /**
   * Get all discussion spaces with optional filtering and pagination
   */
  @Get()
  @ApiOperation({
    summary: 'Get all discussion spaces',
    description:
      'Retrieves a paginated list of discussion spaces with optional filtering by search term, space type, and following status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of discussion spaces',
    type: PageableDiscussionSpaceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  async getAllSpaces(
    @Query() searchDto: SearchSpaceDto,
    @ReqUser() currentUser?: User,
  ): Promise<Pageable<DiscussionSpaceResponseDto>> {
    return this.spaceService.findAll(searchDto, currentUser);
  }

  /**
   * Get a discussion space by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a discussion space by ID',
    description:
      'Retrieves detailed information about a specific discussion space including following status for the authenticated user.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Returns discussion space details',
    type: DiscussionSpaceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async getSpaceById(
    @Param('id', ParseIntPipe) id: number,
    @ReqUser() currentUser?: User,
  ): Promise<DiscussionSpaceResponseDto> {
    return this.spaceService.findById(id, currentUser);
  }

  /**
   * Update a discussion space
   * Supports file uploads for updating space icon and banner images
   */
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 2))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update a discussion space',
    description:
      'Updates an existing discussion space. Only the creator of the space can perform this operation. Supports updating icon and banner images.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Discussion space updated successfully',
    type: DiscussionSpaceResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only creator can update the space' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  @ApiResponse({ status: 409, description: 'Conflict - New slug already exists' })
  async updateSpace(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateDiscussionSpaceDto,
    @UploadedFiles() files: Express.Multer.File[],
    @ReqUser() currentUser: User,
  ): Promise<DiscussionSpaceResponseDto> {
    const filesByType = this.organizeUploadedFiles(files);
    return this.spaceService.update(id, updateDto, currentUser, filesByType);
  }

  /**
   * Delete a discussion space
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a discussion space',
    description:
      'Permanently deletes a discussion space. Only the creator can perform this operation. The space must not contain any discussions.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({ status: 204, description: 'Discussion space deleted successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Space contains discussions and cannot be deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only creator can delete the space' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async deleteSpace(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.spaceService.delete(id, currentUser);
  }

  // ==========================================
  // SPACE DISCOVERY AND SEARCH
  // ==========================================

  /**
   * Get popular discussion spaces
   */
  @Get('popular')
  @ApiOperation({
    summary: 'Get popular discussion spaces',
    description: 'Retrieves the most popular discussion spaces ordered by follower count. Useful for space discovery.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of popular discussion spaces',
    type: [DiscussionSpaceResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  async getPopularSpaces(
    @Query('limit', ParseIntPipe) limit: number = 10,
    @ReqUser() currentUser?: User,
  ): Promise<DiscussionSpaceResponseDto[]> {
    return this.spaceService.getPopularSpaces(limit, currentUser);
  }

  /**
   * Get a discussion space by slug
   */
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get a discussion space by slug',
    description: 'Retrieves detailed information about a discussion space using its unique slug identifier.',
  })
  @ApiParam({ name: 'slug', description: 'Discussion space slug', type: 'string', example: 'web-development' })
  @ApiResponse({
    status: 200,
    description: 'Returns discussion space details',
    type: DiscussionSpaceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async getSpaceBySlug(
    @Param('slug') slug: string,
    @ReqUser() currentUser?: User,
  ): Promise<DiscussionSpaceResponseDto> {
    return this.spaceService.findBySlug(slug, currentUser);
  }

  // ==========================================
  // SPACE FOLLOWING OPERATIONS
  // ==========================================

  /**
   * Check if the current user is following a space
   */
  @Get(':id/is-following')
  @ApiOperation({
    summary: 'Check if user is following a space',
    description: 'Returns the following status of the authenticated user for a specific discussion space.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Returns following status',
    schema: {
      type: 'object',
      properties: {
        isFollowing: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async checkFollowingStatus(
    @Param('id', ParseIntPipe) id: number,
    @ReqUser() currentUser: User,
  ): Promise<{ isFollowing: boolean }> {
    return { isFollowing: await this.spaceService.isFollowing(id, currentUser.id) };
  }

  /**
   * Follow a discussion space
   */
  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Follow a discussion space',
    description:
      'Adds the authenticated user as a follower of the specified discussion space. This operation is idempotent.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully followed the discussion space' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async followSpace(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.spaceService.followSpace(id, currentUser.id);
  }

  /**
   * Unfollow a discussion space
   */
  @Post(':id/unfollow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfollow a discussion space',
    description:
      'Removes the authenticated user as a follower of the specified discussion space. This operation is idempotent.',
  })
  @ApiParam({ name: 'id', description: 'Discussion space ID', type: 'number', example: 1 })
  @ApiResponse({ status: 200, description: 'Successfully unfollowed the discussion space' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  @ApiResponse({ status: 404, description: 'Not Found - Discussion space does not exist' })
  async unfollowSpace(@Param('id', ParseIntPipe) id: number, @ReqUser() currentUser: User): Promise<void> {
    await this.spaceService.unfollowSpace(id, currentUser.id);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Organize uploaded files by type (icon/banner)
   * @param files - Array of uploaded files
   * @returns Object with files organized by type
   */
  private organizeUploadedFiles(files: Express.Multer.File[]): {
    icon?: Express.Multer.File[];
    banner?: Express.Multer.File[];
  } {
    const result: { icon?: Express.Multer.File[]; banner?: Express.Multer.File[] } = {};

    if (!files || files.length === 0) {
      return result;
    }

    // Group files by fieldname
    for (const file of files) {
      if (file.fieldname === 'icon') {
        if (!result.icon) result.icon = [];
        result.icon.push(file);
      } else if (file.fieldname === 'banner') {
        if (!result.banner) result.banner = [];
        result.banner.push(file);
      }
    }

    return result;
  }
}
