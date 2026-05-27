/**
 * Discussion Space Service
 *
 * This service handles all business logic related to discussion spaces including:
 * - CRUD operations for discussion spaces
 * - Space following/unfollowing functionality
 * - Popular spaces and search functionality
 * - File management for space icons and banners
 *
 * @author Open Forum Team
 * @version 1.0.0
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pageable } from '../../common/interfaces/pageable.interface';
import { FileService } from '../../core/file/file.service';
import { AnalyticService } from '../analytic/analytic.service';
import { ActivityEntityType, ActivityType } from '../analytic/entities/user-activity.entity';
import { User } from '../user/entities/user.entity';
import { CreateDiscussionSpaceDto } from './dto/create-discussion-space.dto';
import { DiscussionSpaceResponseDto } from './dto/discussion-space-response.dto';
import { SearchSpaceDto, SpaceSortBy } from './dto/search-space.dto';
import { UpdateDiscussionSpaceDto } from './dto/update-discussion-space.dto';
import { DiscussionSpace } from './entities/discussion-space.entity';

@Injectable()
export class DiscussionSpaceService {
  private readonly logger = new Logger(DiscussionSpaceService.name);

  constructor(
    @InjectRepository(DiscussionSpace)
    private readonly spaceRepository: Repository<DiscussionSpace>,
    private readonly fileService: FileService,
    private readonly analyticService: AnalyticService,
  ) {}

  // ==========================================
  // CORE CRUD OPERATIONS
  // ==========================================

  /**
   * Create a new discussion space
   * @param createDto - Space creation data
   * @param currentUser - Current authenticated user
   * @param files - Optional icon and banner files
   * @returns Created discussion space
   * @throws ConflictException if slug already exists
   * @throws BadRequestException if validation fails
   */
  async create(
    createDto: CreateDiscussionSpaceDto,
    currentUser: User,
    files?: { icon?: Express.Multer.File[]; banner?: Express.Multer.File[] },
  ): Promise<DiscussionSpaceResponseDto> {
    this.logger.log(`Creating discussion space: ${createDto.name} for user: ${currentUser.id}`);

    // Check for duplicate slug
    const existingSpace = await this.spaceRepository.findOne({ where: { slug: createDto.slug } });
    if (existingSpace) {
      throw new ConflictException(`Space with slug "${createDto.slug}" already exists`);
    }

    const queryRunner = this.spaceRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedSpace: DiscussionSpace;
    let iconUrl: string | null = null;
    let bannerUrl: string | null = null;

    try {
      const space = this.spaceRepository.create({
        name: createDto.name,
        description: createDto.description,
        slug: createDto.slug,
        creatorId: currentUser.id,
        spaceType: createDto.spaceType,
        followerCount: 0,
      });

      savedSpace = await queryRunner.manager.save(DiscussionSpace, space);

      // Handle icon upload
      if (files?.icon && files.icon.length > 0) {
        iconUrl = await this.fileService.uploadSpaceIcon(files.icon[0]);
        savedSpace.iconUrl = iconUrl;
      }

      // Handle banner upload
      if (files?.banner && files.banner.length > 0) {
        bannerUrl = await this.fileService.uploadSpaceBanner(files.banner[0]);
        savedSpace.bannerUrl = bannerUrl;
      }

      // Save with file URLs
      await queryRunner.manager.save(DiscussionSpace, savedSpace);
      await queryRunner.commitTransaction();

      this.logger.log(`Successfully created discussion space with ID: ${savedSpace.id}`);
      return DiscussionSpaceResponseDto.fromEntity(savedSpace, false);
    } catch (error) {
      this.logger.error(`Failed to create discussion space: ${error.message}`, error.stack);
      await queryRunner.rollbackTransaction();
      await this.cleanupFiles(iconUrl, bannerUrl);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all discussion spaces with filtering and pagination
   * @param searchDto - Search and pagination parameters
   * @param currentUser - Current authenticated user (optional)
   * @returns Paginated list of discussion spaces
   */
  async findAll(searchDto: SearchSpaceDto, currentUser?: User): Promise<Pageable<DiscussionSpaceResponseDto>> {
    this.logger.log(`Fetching discussion spaces with filters: ${JSON.stringify(searchDto)}`);

    try {
      const { page, limit } = searchDto;
      const offset = (page - 1) * limit;

      const queryBuilder = this.buildSpaceSearchQuery(searchDto, offset, limit, currentUser);
      const [spaces, totalItems] = await queryBuilder.getManyAndCount();

      // Format the response
      const formattedSpaces = spaces.map((space) => {
        const isFollowing = currentUser ? (space as any).isFollowedByCurrentUser > 0 : false;
        return DiscussionSpaceResponseDto.fromEntity(space, isFollowing);
      });

      const result = this.createPaginatedResponse(formattedSpaces, totalItems, page, limit);
      this.logger.log(`Successfully fetched ${formattedSpaces.length} spaces out of ${totalItems} total`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch discussion spaces: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a discussion space by ID
   * @param id - Space ID
   * @param currentUser - Current authenticated user (optional)
   * @returns Discussion space details
   * @throws NotFoundException if space not found
   */
  async findById(id: number, currentUser?: User): Promise<DiscussionSpaceResponseDto> {
    this.logger.log(`Fetching discussion space with ID: ${id}`);

    try {
      const space = await this.getSpaceWithFollowers(id);
      const isFollowing = currentUser ? space.followers.some((follower) => follower.id === currentUser.id) : false;

      return DiscussionSpaceResponseDto.fromEntity(space, isFollowing);
    } catch (error) {
      this.logger.error(`Failed to fetch discussion space: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a discussion space by slug
   * @param slug - Space slug
   * @param currentUser - Current authenticated user (optional)
   * @returns Discussion space details
   * @throws NotFoundException if space not found
   */
  async findBySlug(slug: string, currentUser?: User): Promise<DiscussionSpaceResponseDto> {
    this.logger.log(`Fetching discussion space with slug: ${slug}`);

    try {
      const space = await this.spaceRepository.findOne({
        where: { slug },
        relations: ['followers'],
      });
      if (!space) {
        throw new NotFoundException(`Discussion space with slug "${slug}" not found`);
      }

      const isFollowing = currentUser ? space.followers.some((follower) => follower.id === currentUser.id) : false;

      return DiscussionSpaceResponseDto.fromEntity(space, isFollowing);
    } catch (error) {
      this.logger.error(`Failed to fetch discussion space by slug: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a discussion space
   * @param id - Space ID
   * @param updateDto - Update data
   * @param currentUser - Current authenticated user
   * @param files - Optional icon and banner files
   * @returns Updated discussion space
   * @throws NotFoundException if space not found
   * @throws ForbiddenException if user is not the creator
   * @throws BadRequestException if no fields to update
   * @throws ConflictException if new slug already exists
   */
  async update(
    id: number,
    updateDto: UpdateDiscussionSpaceDto,
    currentUser: User,
    files?: { icon?: Express.Multer.File[]; banner?: Express.Multer.File[] },
  ): Promise<DiscussionSpaceResponseDto> {
    this.logger.log(`Updating discussion space ${id} for user: ${currentUser.id}`);

    // Validate input if no fields are provided
    if (
      !updateDto.name &&
      !updateDto.description &&
      !updateDto.slug &&
      !updateDto.spaceType &&
      !files?.icon &&
      !files?.banner
    ) {
      throw new BadRequestException('No fields to update');
    }

    const space = await this.getSpaceWithFollowers(id);
    this.verifyCreator(space, currentUser.id);
    await this.validateSlugUniqueness(updateDto.slug, space.slug, id);

    const queryRunner = this.spaceRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (updateDto.name) space.name = updateDto.name;
      if (updateDto.description !== undefined) space.description = updateDto.description;
      if (updateDto.slug) space.slug = updateDto.slug;
      if (updateDto.spaceType) space.spaceType = updateDto.spaceType;

      // Handle icon update/removal
      if (files?.icon && files.icon.length > 0) {
        await this.updateSpaceImage(space, 'icon', files.icon[0]);
      } else if (updateDto.removeIcon) {
        await this.removeSpaceImage(space, 'icon');
      }

      // Handle banner update/removal
      if (files?.banner && files.banner.length > 0) {
        await this.updateSpaceImage(space, 'banner', files.banner[0]);
      } else if (updateDto.removeBanner) {
        await this.removeSpaceImage(space, 'banner');
      }

      await queryRunner.manager.save(space);
      await queryRunner.commitTransaction();

      // Check if current user is following
      const isFollowing = space.followers.some((follower) => follower.id === currentUser.id);

      this.logger.log(`Successfully updated discussion space with ID: ${space.id}`);
      return DiscussionSpaceResponseDto.fromEntity(space, isFollowing);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await this.cleanupFiles(files?.icon?.[0]?.filename, files?.banner?.[0]?.filename);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Delete a discussion space
   * @param id - Space ID
   * @param currentUser - Current authenticated user
   * @throws NotFoundException if space not found
   * @throws ForbiddenException if user is not the creator
   * @throws BadRequestException if space has existing discussions
   */
  async delete(id: number, currentUser: User): Promise<void> {
    this.logger.log(`Deleting discussion space ${id} for user: ${currentUser.id}`);

    try {
      const space = await this.spaceRepository.findOne({
        where: { id },
        relations: ['discussions'],
      });
      if (!space) {
        throw new NotFoundException(`Discussion space with ID ${id} not found`);
      }

      this.verifyCreator(space, currentUser.id);

      // Check if space has discussions
      if (space.discussions?.length > 0) {
        throw new BadRequestException('Cannot delete space with existing discussions');
      }

      const queryRunner = this.spaceRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Delete files
        await this.cleanupFiles(space.iconUrl, space.bannerUrl);

        // Remove follows relationships
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from('discussion_space_followers')
          .where('space_id = :id', { id })
          .execute();

        // Delete the space
        await queryRunner.manager.remove(space);
        await queryRunner.commitTransaction();

        this.logger.log(`Successfully deleted discussion space with ID: ${id}`);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Failed to delete discussion space: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ==========================================
  // SPACE FOLLOWING OPERATIONS
  // ==========================================

  /**
   * Follow a discussion space
   * @param spaceId - Space ID
   * @param userId - User ID
   * @throws NotFoundException if space or user not found
   */
  async followSpace(spaceId: number, userId: number): Promise<void> {
    this.logger.log(`User ${userId} following space ${spaceId}`);

    try {
      const space = await this.getSpaceWithFollowers(spaceId);

      // Check if already following
      const isFollowing = space.followers.some((follower) => follower.id === userId);
      if (isFollowing) {
        this.logger.log(`User ${userId} already following space ${spaceId}`);
        return;
      }

      const queryRunner = this.spaceRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        if (!user) {
          throw new NotFoundException(`User with ID ${userId} not found`);
        }

        // Update followers and count
        space.followers.push(user);
        space.followerCount++;

        await queryRunner.manager.save(space);
        await queryRunner.commitTransaction();

        // Record follow activity - non-blocking
        try {
          await this.analyticService.recordActivity(
            userId,
            ActivityType.FOLLOW_SPACE,
            ActivityEntityType.DISCUSSION_SPACE,
            spaceId,
            {
              spaceName: space.name,
              spaceSlug: space.slug,
            },
          );
        } catch (analyticsError) {
          this.logger.warn('Failed to record follow activity', analyticsError);
        }

        this.logger.log(`User ${userId} successfully followed space ${spaceId}`);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Failed to follow discussion space: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Unfollow a discussion space
   * @param spaceId - Space ID
   * @param userId - User ID
   * @throws NotFoundException if space not found
   */
  async unfollowSpace(spaceId: number, userId: number): Promise<void> {
    this.logger.log(`User ${userId} unfollowing space ${spaceId}`);

    const space = await this.getSpaceWithFollowers(spaceId);

    // Check if already not following
    const followerIndex = space.followers.findIndex((follower) => follower.id === userId);
    if (followerIndex === -1) {
      this.logger.log(`User ${userId} not following space ${spaceId}`);
      return;
    }

    const queryRunner = this.spaceRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update followers and count
      space.followers.splice(followerIndex, 1);
      space.followerCount = Math.max(0, space.followerCount - 1);

      await queryRunner.manager.save(space);
      await queryRunner.commitTransaction();

      // Record unfollow activity
      try {
        await this.analyticService.recordActivity(
          userId,
          ActivityType.UNFOLLOW_SPACE,
          ActivityEntityType.DISCUSSION_SPACE,
          spaceId,
          {
            spaceName: space.name,
            spaceSlug: space.slug,
          },
        );
      } catch (analyticsError) {
        this.logger.warn('Failed to record unfollow activity', analyticsError);
      }

      this.logger.log(`User ${userId} successfully unfollowed space ${spaceId}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to unfollow space: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to unfollow space');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if user is following a space
   * @param spaceId - Space ID
   * @param userId - User ID
   * @returns Boolean indicating following status
   */
  async isFollowing(spaceId: number, userId: number): Promise<boolean> {
    try {
      const count = await this.spaceRepository
        .createQueryBuilder('space')
        .innerJoin('space.followers', 'follower')
        .where('space.id = :spaceId', { spaceId })
        .andWhere('follower.id = :userId', { userId })
        .getCount();

      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check following status: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ==========================================
  // POPULAR SPACES AND STATISTICS
  // ==========================================

  /**
   * Get popular discussion spaces ordered by follower count
   * @param limit - Maximum number of spaces to return
   * @param currentUser - Current authenticated user (optional)
   * @returns Array of popular discussion spaces
   */
  async getPopularSpaces(limit: number, currentUser?: User): Promise<DiscussionSpaceResponseDto[]> {
    this.logger.log(`Fetching ${limit} popular spaces`);

    try {
      const spaces = await this.spaceRepository
        .createQueryBuilder('space')
        .orderBy('space.followerCount', 'DESC')
        .addOrderBy('space.createdAt', 'DESC')
        .take(limit)
        .getMany();

      const formattedSpaces = await Promise.all(
        spaces.map(async (space) => {
          let isFollowing = false;

          if (currentUser) {
            isFollowing = await this.isFollowing(space.id, currentUser.id);
          }

          return DiscussionSpaceResponseDto.fromEntity(space, isFollowing);
        }),
      );

      this.logger.log(`Successfully fetched ${formattedSpaces.length} popular spaces`);
      return formattedSpaces;
    } catch (error) {
      this.logger.error(`Failed to fetch popular spaces: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ==========================================
  // VALIDATION METHODS
  // ==========================================

  /**
   * Build search query with filters and pagination
   * @param searchDto - Search parameters
   * @param offset - Pagination offset
   * @param limit - Pagination limit
   * @param currentUser - Current authenticated user
   * @returns Query builder instance
   */
  private buildSpaceSearchQuery(searchDto: SearchSpaceDto, offset: number, limit: number, currentUser?: User) {
    const { sortBy = 'createdAt', sortOrder = 'DESC' } = searchDto;

    let queryBuilder = this.spaceRepository
      .createQueryBuilder('space')
      .orderBy(`space.${sortBy}`, sortOrder)
      .skip(offset)
      .take(limit);

    if (sortBy === SpaceSortBy.FOLLOWER_COUNT) {
      queryBuilder = queryBuilder.addOrderBy('space.id', 'ASC');
    }

    // Filter by search term
    if (searchDto.search) {
      queryBuilder = queryBuilder.where('space.name ILIKE :search OR space.description ILIKE :search', {
        search: `%${searchDto.search}%`,
      });
    }

    // Filter by space type
    if (searchDto.spaceType) {
      queryBuilder = queryBuilder.andWhere('space.spaceType = :spaceType', {
        spaceType: searchDto.spaceType,
      });
    }

    // Filter by followed spaces
    if (searchDto.following && currentUser) {
      queryBuilder = queryBuilder
        .innerJoin('space.followers', 'follower')
        .andWhere('follower.id = :userId', { userId: currentUser.id });
    }

    // Add is_following flag for the current user
    if (currentUser) {
      queryBuilder = queryBuilder.loadRelationCountAndMap(
        'space.isFollowedByCurrentUser',
        'space.followers',
        'follower',
        (qb) => qb.where('follower.id = :currentUserId', { currentUserId: currentUser.id }),
      );
    }

    return queryBuilder;
  }

  /**
   * Get space entity with followers relation
   * @param id - Space ID
   * @returns Space entity with followers
   * @throws NotFoundException if space not found
   */
  private async getSpaceWithFollowers(id: number): Promise<DiscussionSpace> {
    const space = await this.spaceRepository.findOne({
      where: { id },
      relations: ['followers'],
    });

    if (!space) {
      throw new NotFoundException(`Discussion space with ID ${id} not found`);
    }

    return space;
  }

  /**
   * Verify if user is the creator of the space
   * @param space - Discussion space entity
   * @param userId - User ID to verify
   * @throws ForbiddenException if user is not the creator
   */
  private verifyCreator(space: DiscussionSpace, userId: number): void {
    if (space.creatorId !== userId) {
      throw new ForbiddenException('Only the creator can modify this space');
    }
  }

  /**
   * Validate that a slug is unique (excluding current space if updating)
   * @param newSlug - New slug to validate
   * @param currentSlug - Current slug (for updates)
   * @param spaceId - Space ID (for updates)
   * @throws ConflictException if slug already exists
   */
  private async validateSlugUniqueness(newSlug?: string, currentSlug?: string, spaceId?: number): Promise<void> {
    if (newSlug && newSlug !== currentSlug) {
      const existingSpace = await this.spaceRepository.findOne({ where: { slug: newSlug } });

      if (existingSpace && existingSpace.id !== spaceId) {
        throw new ConflictException(`Space with slug "${newSlug}" already exists`);
      }
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Update space icon or banner image
   * @param space - Discussion space entity
   * @param type - Image type ('icon' or 'banner')
   * @param file - New image file
   */
  private async updateSpaceImage(
    space: DiscussionSpace,
    type: 'icon' | 'banner',
    file: Express.Multer.File,
  ): Promise<void> {
    // Delete old file if exists
    const currentUrl = type === 'icon' ? space.iconUrl : space.bannerUrl;
    if (currentUrl) {
      await this.fileService.deleteFile(currentUrl);
    }

    // Upload new file
    const newUrl =
      type === 'icon' ? await this.fileService.uploadSpaceIcon(file) : await this.fileService.uploadSpaceBanner(file);

    // Update entity
    if (type === 'icon') {
      space.iconUrl = newUrl;
    } else {
      space.bannerUrl = newUrl;
    }
  }

  /**
   * Remove space icon or banner image
   * @param space - Discussion space entity
   * @param type - Image type ('icon' or 'banner')
   */
  private async removeSpaceImage(space: DiscussionSpace, type: 'icon' | 'banner'): Promise<void> {
    // Get current URL
    const currentUrl = type === 'icon' ? space.iconUrl : space.bannerUrl;

    // If URL exists, delete the file
    if (currentUrl) {
      await this.fileService.deleteFile(currentUrl);
    }

    // Update entity field to null
    if (type === 'icon') {
      space.iconUrl = null;
    } else {
      space.bannerUrl = null;
    }
  }

  /**
   * Clean up uploaded files in case of error
   * @param iconUrl - Icon file URL to cleanup
   * @param bannerUrl - Banner file URL to cleanup
   */
  private async cleanupFiles(iconUrl?: string | null, bannerUrl?: string | null): Promise<void> {
    try {
      if (iconUrl) {
        await this.fileService.deleteFile(iconUrl);
      }

      if (bannerUrl) {
        await this.fileService.deleteFile(bannerUrl);
      }
    } catch (error) {
      this.logger.warn('Error cleaning up files', error);
    }
  }

  /**
   * Create paginated response with metadata
   * @param items - Array of items
   * @param totalItems - Total number of items
   * @param page - Current page number
   * @param limit - Items per page
   * @returns Paginated response object
   */
  private createPaginatedResponse<T>(items: T[], totalItems: number, page: number, limit: number): Pageable<T> {
    const totalPages = Math.ceil(totalItems / limit);

    return {
      items,
      meta: {
        totalItems,
        itemsPerPage: limit,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
