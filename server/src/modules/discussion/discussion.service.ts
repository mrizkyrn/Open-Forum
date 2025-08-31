import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Between, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { Pageable } from '../../common/interfaces/pageable.interface';
import { WebsocketGateway } from '../../core/websocket/websocket.gateway';
import { AnalyticService } from '../analytic/analytic.service';
import { ActivityEntityType, ActivityType } from '../analytic/entities/user-activity.entity';
import { AttachmentService } from '../attachment/attachment.service';
import { AttachmentType } from '../attachment/entities/attachment.entity';
import { User } from '../user/entities/user.entity';
import { VoteEntityType } from '../vote/entities/vote.entity';
import { VoteService } from '../vote/vote.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { DiscussionResponseDto, PopularTagsResponseDto } from './dto/discussion-response.dto';
import { DiscussionSortBy, SearchDiscussionDto } from './dto/search-discussion.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';
import { Bookmark } from './entities/bookmark.entity';
import { DiscussionSpace } from './entities/discussion-space.entity';
import { Discussion } from './entities/discussion.entity';

@Injectable()
export class DiscussionService {
  private readonly logger = new Logger(DiscussionService.name);

  // Configuration constants
  private static readonly MAX_CONTENT_LENGTH = 10000;
  private static readonly MAX_TAGS_COUNT = 10;
  private static readonly MAX_TAG_LENGTH = 50;
  private static readonly DEFAULT_PAGE_SIZE = 10;
  private static readonly MAX_PAGE_SIZE = 100;

  constructor(
    @InjectRepository(Discussion)
    private readonly discussionRepository: Repository<Discussion>,
    @InjectRepository(Bookmark)
    private readonly bookmarkRepository: Repository<Bookmark>,
    @InjectRepository(DiscussionSpace)
    private readonly spaceRepository: Repository<DiscussionSpace>,
    private readonly attachmentService: AttachmentService,
    @Inject(forwardRef(() => VoteService))
    private readonly voteService: VoteService,
    private readonly analyticService: AnalyticService,
    private readonly webSocketGateway: WebsocketGateway,
  ) {}

  // ==================== CORE CRUD OPERATIONS ====================

  /**
   * Create a new discussion
   * @param createDiscussionDto - Discussion creation data
   * @param currentUser - Current authenticated user
   * @param files - Optional file attachments
   * @returns Created discussion
   * @throws BadRequestException if user information is missing or space not found
   */

  async create(
    createDiscussionDto: CreateDiscussionDto,
    currentUser: User,
    files?: Express.Multer.File[],
  ): Promise<DiscussionResponseDto> {
    if (!currentUser?.id) {
      throw new BadRequestException('User information is required');
    }

    this.logger.log(`Creating discussion for user: ${currentUser.id}`);

    // Validate input data
    await this.validateDiscussionCreationData(createDiscussionDto, files);

    const createdFilePaths: string[] = [];

    try {
      // Validate space if provided
      if (createDiscussionDto.spaceId) {
        await this.validateSpaceExists(createDiscussionDto.spaceId);
      }

      const queryRunner = this.discussionRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const discussion = this.discussionRepository.create({
          ...createDiscussionDto,
          authorId: currentUser.id,
          commentCount: 0,
          upvoteCount: 0,
          downvoteCount: 0,
        });

        // Process tags if provided
        if (createDiscussionDto.tags && createDiscussionDto.tags.length > 0) {
          discussion.tags = this.processTags(createDiscussionDto.tags);
        }

        const savedDiscussion = await queryRunner.manager.save(Discussion, discussion);

        // Process attachments if any
        if (files && files.length > 0) {
          const attachments = await this.attachmentService.createMultipleAttachments(
            files,
            AttachmentType.DISCUSSION,
            discussion.id,
            queryRunner.manager,
          );

          // Track created files for cleanup
          createdFilePaths.push(...this.extractFilePaths(attachments));
        }

        await queryRunner.commitTransaction();

        // Handle websocket notification
        this.webSocketGateway.notifyNewDiscussion(currentUser.id, savedDiscussion.id, savedDiscussion.spaceId);

        // Record analytics
        await this.recordDiscussionActivity(currentUser.id, ActivityType.CREATE_DISCUSSION, savedDiscussion, {
          hasTags: (discussion.tags?.length || 0) > 0,
          hasAttachments: files && files.length > 0,
        });

        const createdDiscussion = await this.getDiscussionById(savedDiscussion.id);
        this.logger.log(`Successfully created discussion with ID: ${savedDiscussion.id}`);

        return DiscussionResponseDto.fromEntity(createdDiscussion, currentUser);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      await this.cleanupFiles(createdFilePaths);
      throw error;
    }
  }

  /**
   * Find all discussions with pagination and filtering
   * @param searchDto - Search and pagination parameters
   * @param currentUser - Current authenticated user for personalized data
   * @returns Paginated list of discussions
   */
  async findAll(searchDto: SearchDiscussionDto, currentUser?: User): Promise<Pageable<DiscussionResponseDto>> {
    this.logger.debug(`Finding discussions with search params: ${JSON.stringify(searchDto)}`);

    const { page, limit } = searchDto;
    const offset = (page - 1) * limit;

    const queryBuilder = this.buildDiscussionSearchQuery(searchDto, offset, limit, currentUser);
    const [discussions, totalItems] = await queryBuilder.getManyAndCount();

    await this.loadAttachmentsForDiscussions(discussions);

    const responseItems = await this.buildDiscussionResponseItems(discussions, currentUser);

    const result = this.createPaginatedResponse(responseItems, totalItems, page, limit);

    this.logger.debug(`Found ${discussions.length} discussions out of ${totalItems} total`);
    return result;
  }

  /**
   * Find discussion by ID
   * @param id - Discussion ID
   * @param currentUser - Current authenticated user for personalized data
   * @returns Discussion details
   * @throws NotFoundException if discussion not found
   */
  async findById(id: number, currentUser?: User): Promise<DiscussionResponseDto> {
    this.logger.debug(`Finding discussion by ID: ${id}`);

    const discussion = await this.getDiscussionById(id);
    const isBookmarked = currentUser ? await this.isDiscussionBookmarked(discussion.id, currentUser.id) : false;
    const voteStatus = currentUser
      ? await this.voteService.getUserVoteStatus(currentUser.id, VoteEntityType.DISCUSSION, discussion.id)
      : null;

    return DiscussionResponseDto.fromEntity(discussion, currentUser, isBookmarked, voteStatus);
  }

  /**
   * Update an existing discussion
   * @param id - Discussion ID
   * @param updateDiscussionDto - Update data
   * @param currentUser - Current authenticated user
   * @param files - Optional new file attachments
   * @returns Updated discussion
   * @throws ForbiddenException if user doesn't own the discussion
   * @throws NotFoundException if discussion not found
   */

  async update(
    id: number,
    updateDiscussionDto: UpdateDiscussionDto,
    currentUser: User,
    files?: Express.Multer.File[],
  ): Promise<DiscussionResponseDto> {
    let createdFilePaths: string[] = [];

    try {
      const discussion = await this.validateDiscussionAccess(id, currentUser.id, currentUser.role);
      const existingAttachments = await this.attachmentService.getAttachmentsByEntity(AttachmentType.DISCUSSION, id);

      // Validate attachment limits
      const attachmentsToRemoveCount = updateDiscussionDto.attachmentsToRemove?.length || 0;
      const newAttachmentsCount = files?.length || 0;
      const remainingAttachmentsCount = existingAttachments.length - attachmentsToRemoveCount;

      if (remainingAttachmentsCount + newAttachmentsCount > 4) {
        throw new BadRequestException(
          'A discussion can have a maximum of 4 attachments. Please remove some existing attachments or upload fewer new ones.',
        );
      }

      // Validate that attachments being removed belong to this discussion
      if (updateDiscussionDto.attachmentsToRemove?.length) {
        for (const attachmentId of updateDiscussionDto.attachmentsToRemove) {
          const attachment = await this.attachmentService.getAttachmentById(attachmentId);

          if (
            !attachment ||
            attachment.entityId !== discussion.id ||
            attachment.entityType !== AttachmentType.DISCUSSION
          ) {
            throw new BadRequestException(`Invalid attachment ID: ${attachmentId}`);
          }
        }
      }

      const queryRunner = this.discussionRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Update discussion fields if provided
        if (updateDiscussionDto.content !== undefined) {
          discussion.content = updateDiscussionDto.content;
        }
        if (updateDiscussionDto.isAnonymous !== undefined) {
          discussion.isAnonymous = updateDiscussionDto.isAnonymous;
        }
        if (updateDiscussionDto.tags !== undefined) {
          discussion.tags = this.processTags(updateDiscussionDto.tags);
        }

        discussion.isEdited = true;
        await queryRunner.manager.save(discussion);

        // Remove attachments if specified
        if (updateDiscussionDto.attachmentsToRemove?.length) {
          for (const attachmentId of updateDiscussionDto.attachmentsToRemove) {
            await this.attachmentService.deleteAttachment(attachmentId);
          }
        }

        // Add new attachments if provided
        if (files?.length) {
          const newAttachments = await this.attachmentService.createMultipleAttachments(
            files,
            AttachmentType.DISCUSSION,
            discussion.id,
            queryRunner.manager,
          );

          createdFilePaths = this.extractFilePaths(newAttachments);
        }

        await queryRunner.commitTransaction();

        const updatedDiscussion = await this.getDiscussionById(id);

        // Record edit activity
        await this.analyticService.recordActivity(
          currentUser.id,
          ActivityType.EDIT_DISCUSSION,
          ActivityEntityType.DISCUSSION,
          id,
          {
            spaceId: updatedDiscussion.spaceId,
            isAnonymous: updatedDiscussion.isAnonymous,
            tagsChanged: updateDiscussionDto.tags !== undefined,
            contentChanged: updateDiscussionDto.content !== undefined,
            attachmentsChanged: (updateDiscussionDto.attachmentsToRemove?.length ?? 0) > 0 || (files?.length ?? 0) > 0,
          },
        );

        return DiscussionResponseDto.fromEntity(updatedDiscussion, currentUser);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      await this.cleanupFiles(createdFilePaths);
      throw error;
    }
  }

  /**
   * Delete an existing discussion (soft delete)
   * @param id - Discussion ID
   * @param currentUser - Current authenticated user (optional for admin operations)
   * @throws ForbiddenException if user doesn't own the discussion and isn't admin
   * @throws NotFoundException if discussion not found
   */
  async delete(id: number, currentUser?: User): Promise<void> {
    this.logger.log(`Deleting discussion: ${id}`);

    if (currentUser) {
      await this.validateDiscussionAccess(id, currentUser.id, currentUser.role);
    }
    await this.discussionRepository.softDelete(id);

    // Record delete activity if user is provided
    if (currentUser) {
      await this.analyticService.recordActivity(
        currentUser.id,
        ActivityType.DELETE_DISCUSSION,
        ActivityEntityType.DISCUSSION,
        id,
        { softDelete: true },
      );
    }

    this.logger.log(`Successfully deleted discussion: ${id}`);
  }

  /**
   * Permanently delete a discussion (hard delete)
   * @param id - Discussion ID
   * @param currentUser - Current authenticated user
   * @throws ForbiddenException if user doesn't own the discussion
   * @throws NotFoundException if discussion not found
   */
  async hardDelete(id: number, currentUser: User): Promise<void> {
    this.logger.log(`Hard deleting discussion: ${id}`);

    const discussion = await this.validateDiscussionAccess(id, currentUser.id);

    const queryRunner = this.discussionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.attachmentService.deleteAttachmentsByEntity(AttachmentType.DISCUSSION, id);
      await queryRunner.manager.remove(discussion);
      await queryRunner.commitTransaction();

      this.logger.log(`Successfully hard deleted discussion: ${id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== BOOKMARK OPERATIONS ====================

  /**
   * Add a discussion to user's bookmarks
   * @param discussionId - Discussion ID to bookmark
   * @param userId - User ID
   * @throws NotFoundException if discussion not found
   */
  async bookmarkDiscussion(discussionId: number, userId: number): Promise<void> {
    this.logger.debug(`Bookmarking discussion ${discussionId} for user ${userId}`);

    // Validate discussion exists
    const discussion = await this.getDiscussionById(discussionId);

    // Check if bookmark already exists
    const existingBookmark = await this.bookmarkRepository.findOne({
      where: { discussionId, userId },
    });

    if (!existingBookmark) {
      const bookmark = this.bookmarkRepository.create({
        discussionId,
        userId,
      });

      await this.bookmarkRepository.save(bookmark);

      // Record bookmark activity
      await this.analyticService.recordActivity(
        userId,
        ActivityType.BOOKMARK_DISCUSSION,
        ActivityEntityType.DISCUSSION,
        discussionId,
        {
          spaceId: discussion.spaceId,
          authorId: discussion.authorId,
        },
      );

      this.logger.debug(`Successfully bookmarked discussion ${discussionId} for user ${userId}`);
    }
  }

  /**
   * Remove a discussion from user's bookmarks
   * @param discussionId - Discussion ID to unbookmark
   * @param userId - User ID
   * @throws NotFoundException if discussion or bookmark not found
   */
  async unbookmarkDiscussion(discussionId: number, userId: number): Promise<void> {
    this.logger.debug(`Unbookmarking discussion ${discussionId} for user ${userId}`);

    const bookmark = await this.bookmarkRepository.findOne({
      where: { discussionId, userId },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    const discussion = await this.getDiscussionById(discussionId);
    await this.bookmarkRepository.remove(bookmark);

    await this.analyticService.recordActivity(
      userId,
      ActivityType.REMOVE_BOOKMARK,
      ActivityEntityType.DISCUSSION,
      discussionId,
      {
        spaceId: discussion.spaceId,
        authorId: discussion.authorId,
      },
    );

    this.logger.debug(`Successfully unbookmarked discussion ${discussionId} for user ${userId}`);
  }

  /**
   * Get user's bookmarked discussions with pagination
   * @param userId - User ID
   * @param searchDto - Search and pagination parameters
   * @returns Paginated list of bookmarked discussions
   */

  async getBookmarkedDiscussions(
    userId: number,
    searchDto: SearchDiscussionDto,
  ): Promise<Pageable<DiscussionResponseDto>> {
    this.logger.debug(`Getting bookmarked discussions for user: ${userId}`);

    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = searchDto;
      const offset = (page - 1) * limit;

      // Create bookmark-specific query
      const queryBuilder = this.discussionRepository
        .createQueryBuilder('discussion')
        .innerJoin('bookmarks', 'bookmark', 'bookmark.discussion_id = discussion.id AND bookmark.user_id = :userId', {
          userId,
        })
        .leftJoinAndSelect('discussion.author', 'author')
        .leftJoinAndSelect('discussion.space', 'space')
        .orderBy(`discussion.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit);

      this.applyDiscussionFilters(queryBuilder, searchDto);

      const [discussions, totalItems] = await queryBuilder.getManyAndCount();

      // Load attachments
      await this.loadAttachmentsForDiscussions(discussions);

      // Format response - all items are bookmarked by definition
      const currentUser = { id: userId } as User;
      const responseItems = discussions.map((discussion) => {
        const formatted = DiscussionResponseDto.fromEntity(discussion, currentUser, true);
        formatted.isBookmarked = true;
        return formatted;
      });

      const result = this.createPaginatedResponse(responseItems, totalItems, page, limit);
      this.logger.debug(`Found ${discussions.length} bookmarked discussions out of ${totalItems} total`);

      return result;
    } catch (error) {
      this.logger.error(`Error getting bookmarked discussions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a discussion is bookmarked by a user
   * @param discussionId - Discussion ID
   * @param userId - User ID
   * @returns Whether the discussion is bookmarked
   */
  async isDiscussionBookmarked(discussionId: number, userId: number): Promise<boolean> {
    const bookmark = await this.bookmarkRepository.findOne({
      where: { discussionId, userId },
    });
    return !!bookmark;
  }

  // ==================== TAG OPERATIONS ====================

  /**
   * Get popular tags with pagination
   * @param page - Page number
   * @param limit - Items per page
   * @returns Paginated list of popular tags
   */

  async getPopularTags(page: number = 1, limit: number = 10): Promise<Pageable<PopularTagsResponseDto>> {
    // For pagination parameters
    const offset = (page - 1) * limit;

    // Query to unnest the tags array and count occurrences
    const result = await this.discussionRepository.query(
      `
      SELECT tag, COUNT(*) as count
      FROM discussions, UNNEST(tags) as tag
      WHERE deleted_at IS NULL
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );

    // Get total count for pagination
    const totalCountResult = await this.discussionRepository.query(`
      SELECT COUNT(*) as total FROM (
        SELECT DISTINCT tag 
        FROM discussions, UNNEST(tags) as tag
        WHERE deleted_at IS NULL
      ) as unique_tags
    `);

    const totalItems = parseInt(totalCountResult[0].total) || 0;

    // Format results
    const formattedTags = result.map((item) => ({
      tag: item.tag,
      count: parseInt(item.count),
    }));

    return {
      items: formattedTags,
      meta: {
        totalItems,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page < Math.ceil(totalItems / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  // ==================== DISCUSSION STATISTICS ====================

  /**
   * Get discussion entity by ID with optional relations
   * @param id - Discussion ID
   * @param relations - Relations to load
   * @returns Discussion entity
   * @throws NotFoundException if discussion not found
   */
  async getDiscussionEntity(id: number, relations: string[] = []): Promise<Discussion> {
    const discussion = await this.discussionRepository.findOne({
      where: { id },
      relations,
    });

    if (!discussion) {
      throw new NotFoundException(`Discussion with ID ${id} not found`);
    }

    return discussion;
  }

  /**
   * Increment comment count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async incrementCommentCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    await manager.increment(Discussion, { id }, 'commentCount', 1);
  }

  /**
   * Decrement comment count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async decrementCommentCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    const discussion = await manager.findOne(Discussion, { where: { id } });

    if (discussion && discussion.commentCount > 0) {
      await manager.decrement(Discussion, { id }, 'commentCount', 1);
    }
  }

  /**
   * Increment upvote count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async incrementUpvoteCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    await manager.increment(Discussion, { id }, 'upvoteCount', 1);
  }

  /**
   * Decrement upvote count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async decrementUpvoteCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    const discussion = await manager.findOne(Discussion, { where: { id } });

    if (discussion && discussion.upvoteCount > 0) {
      await manager.decrement(Discussion, { id }, 'upvoteCount', 1);
    }
  }

  /**
   * Increment downvote count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async incrementDownvoteCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    await manager.increment(Discussion, { id }, 'downvoteCount', 1);
  }

  /**
   * Decrement downvote count for a discussion
   * @param id - Discussion ID
   * @param entityManager - Optional entity manager for transaction
   */
  async decrementDownvoteCount(id: number, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.discussionRepository.manager;
    const discussion = await manager.findOne(Discussion, { where: { id } });

    if (discussion && discussion.downvoteCount > 0) {
      await manager.decrement(Discussion, { id }, 'downvoteCount', 1);
    }
  }

  /**
   * Get total count of discussions
   * @returns Total number of discussions
   */
  async countTotal(): Promise<number> {
    return this.discussionRepository.count();
  }

  /**
   * Count discussions by date range
   * @param start - Start date
   * @param end - End date
   * @returns Number of discussions in the date range
   */
  async countByDateRange(start: Date, end: Date): Promise<number> {
    return this.discussionRepository.count({
      where: { createdAt: Between(start, end) },
    });
  }

  /**
   * Get time series data for discussions
   * @param start - Start date
   * @param end - End date
   * @returns Array of date/count pairs
   */
  async getTimeSeries(start: Date, end: Date): Promise<{ date: string; count: string }[]> {
    return this.discussionRepository
      .createQueryBuilder('discussion')
      .select(`DATE(discussion.created_at)`, 'date')
      .addSelect(`COUNT(discussion.id)`, 'count')
      .where('discussion.created_at BETWEEN :start AND :end', {
        start,
        end,
      })
      .groupBy(`DATE(discussion.created_at)`)
      .orderBy(`DATE(discussion.created_at)`, 'ASC')
      .getRawMany();
  }

  // ==================== VALIDATION METHODS ====================

  /**
   * Validate discussion creation data
   * @param createDto - Discussion creation data
   * @param files - Optional file attachments
   */
  private async validateDiscussionCreationData(
    createDto: CreateDiscussionDto,
    files?: Express.Multer.File[],
  ): Promise<void> {
    if (!createDto.content || createDto.content.trim().length === 0) {
      throw new BadRequestException('Discussion content is required');
    }

    if (createDto.content.length > DiscussionService.MAX_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Discussion content must not exceed ${DiscussionService.MAX_CONTENT_LENGTH} characters`,
      );
    }

    if (createDto.tags && createDto.tags.length > DiscussionService.MAX_TAGS_COUNT) {
      throw new BadRequestException(`Maximum ${DiscussionService.MAX_TAGS_COUNT} tags allowed`);
    }
  }

  /**
   * Validate that a space exists
   * @param spaceId - Space ID to validate
   */
  private async validateSpaceExists(spaceId: number): Promise<void> {
    const space = await this.spaceRepository.findOne({
      where: { id: spaceId },
    });

    if (!space) {
      throw new NotFoundException(`Discussion space with ID ${spaceId} not found`);
    }
  }

  /**
   * Record discussion-related analytics activity
   * @param userId - User ID
   * @param activityType - Type of activity
   * @param discussion - Discussion entity
   * @param metadata - Additional metadata
   */
  private async recordDiscussionActivity(
    userId: number,
    activityType: ActivityType,
    discussion: Discussion,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    await this.analyticService.recordActivity(userId, activityType, ActivityEntityType.DISCUSSION, discussion.id, {
      spaceId: discussion.spaceId,
      isAnonymous: discussion.isAnonymous,
      ...metadata,
    });
  }

  /**
   * Build discussion response items with user-specific data
   * @param discussions - Array of discussion entities
   * @param currentUser - Current authenticated user
   * @returns Array of discussion response DTOs
   */
  private async buildDiscussionResponseItems(
    discussions: Discussion[],
    currentUser?: User,
  ): Promise<DiscussionResponseDto[]> {
    return Promise.all(
      discussions.map(async (discussion) => {
        let isBookmarked: boolean = false;
        let voteStatus: number | null = null;

        if (currentUser) {
          const [bookmarkStatus, userVote] = await Promise.all([
            this.isDiscussionBookmarked(discussion.id, currentUser.id),
            this.voteService.getUserVoteStatus(currentUser.id, VoteEntityType.DISCUSSION, discussion.id),
          ]);

          isBookmarked = bookmarkStatus;
          voteStatus = userVote;
        }

        return DiscussionResponseDto.fromEntity(discussion, currentUser, isBookmarked, voteStatus);
      }),
    );
  }

  // ==================== HELPER METHODS ====================

  private async getDiscussionById(id: number): Promise<Discussion> {
    const discussion = await this.discussionRepository.findOne({
      where: { id },
      relations: ['author', 'space'],
    });

    if (!discussion) {
      throw new NotFoundException(`Discussion with ID ${id} not found`);
    }

    // Load attachments separately
    const attachments = await this.attachmentService.getAttachmentsByEntity(AttachmentType.DISCUSSION, id);
    discussion.attachments = attachments;

    return discussion;
  }

  private processTags(tags: string[]): string[] {
    return Array.from(new Set(tags.map((tag) => tag.toLowerCase().trim()))).filter(Boolean);
  }

  private async validateDiscussionAccess(
    discussionId: number,
    userId: number,
    userRole?: UserRole,
  ): Promise<Discussion> {
    const discussion = await this.discussionRepository.findOne({
      where: { id: discussionId },
      relations: ['author'],
    });

    if (!discussion) {
      throw new NotFoundException(`Discussion with ID ${discussionId} not found`);
    }

    if (discussion.authorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not have permission to modify this discussion');
    }

    return discussion;
  }

  private buildDiscussionSearchQuery(
    searchDto: SearchDiscussionDto,
    offset: number,
    limit: number,
    currentUser?: User,
  ) {
    const { sortBy = 'createdAt', sortOrder = 'DESC' } = searchDto;

    const queryBuilder = this.discussionRepository
      .createQueryBuilder('discussion')
      .leftJoinAndSelect('discussion.author', 'author')
      .leftJoinAndSelect('discussion.space', 'space');

    if (sortBy === DiscussionSortBy.VOTE_COUNT) {
      queryBuilder
        .addSelect('COALESCE(discussion.upvote_count, 0) - COALESCE(discussion.downvote_count, 0)', 'net_votes')
        .addOrderBy('net_votes', sortOrder);
    } else {
      queryBuilder.addOrderBy(`discussion.${sortBy}`, sortOrder);
    }

    queryBuilder.skip(offset).take(limit);

    this.applyDiscussionFilters(queryBuilder, searchDto, currentUser);

    return queryBuilder;
  }

  private applyDiscussionFilters(queryBuilder, searchDto: SearchDiscussionDto, currentUser?: User) {
    if (searchDto.search) {
      queryBuilder.andWhere('discussion.content ILIKE :search', { search: `%${searchDto.search}%` });
    }

    if (searchDto.authorId) {
      queryBuilder.andWhere('discussion.authorId = :authorId', { authorId: searchDto.authorId });
      if (currentUser && currentUser.id !== searchDto.authorId) {
        queryBuilder.andWhere('discussion.isAnonymous = false');
      }
    }

    if (searchDto.isAnonymous !== undefined) {
      queryBuilder.andWhere('discussion.isAnonymous = :isAnonymous', { isAnonymous: searchDto.isAnonymous });
    }

    if (searchDto.tags && searchDto.tags.length > 0) {
      queryBuilder.andWhere('discussion.tags && :tags', { tags: searchDto.tags });
    }

    if (searchDto.spaceId) {
      queryBuilder.andWhere('discussion.spaceId = :spaceId', { spaceId: searchDto.spaceId });
    }

    if (searchDto.onlyFollowedSpaces && currentUser?.id) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('space_id')
          .from('discussion_space_followers', 'followers')
          .where('followers.user_id = :userId', { userId: currentUser.id })
          .getQuery();
        return 'discussion.space_id IN ' + subQuery;
      });
    }
  }

  private async loadAttachmentsForDiscussions(discussions: Discussion[]): Promise<void> {
    for (const discussion of discussions) {
      discussion.attachments = await this.attachmentService.getAttachmentsByEntity(
        AttachmentType.DISCUSSION,
        discussion.id,
      );
    }
  }

  private extractFilePaths(attachments: any[]): string[] {
    return attachments.map((attachment) => path.join(process.cwd(), attachment.url.replace(/^\//, '')));
  }

  private async cleanupFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (error) {
        this.logger.warn(`Failed to clean up file ${filePath}:`, error);
      }
    }
  }

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

  private truncateContent(content: string, maxLength: number): string {
    if (!content) return '';
    return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
  }
}
