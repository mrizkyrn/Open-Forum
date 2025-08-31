import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';

import { SortOrder } from '../../common/dto/search.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { WebsocketGateway } from '../../core/websocket/websocket.gateway';
import { AnalyticService } from '../analytic/analytic.service';
import { ActivityEntityType, ActivityType } from '../analytic/entities/user-activity.entity';
import { AttachmentService } from '../attachment/attachment.service';
import { AttachmentType } from '../attachment/entities/attachment.entity';
import { User } from '../user/entities/user.entity';
import { VoteEntityType } from '../vote/entities/vote.entity';
import { VoteService } from '../vote/vote.service';
import { DiscussionService } from './discussion.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { DiscussionResponseDto } from './dto/discussion-response.dto';
import { DiscussionSortBy, SearchDiscussionDto } from './dto/search-discussion.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';
import { Bookmark } from './entities/bookmark.entity';
import { DiscussionSpace } from './entities/discussion-space.entity';
import { Discussion } from './entities/discussion.entity';

describe('DiscussionService', () => {
  let service: DiscussionService;
  let discussionRepository: jest.Mocked<Repository<Discussion>>;
  let bookmarkRepository: jest.Mocked<Repository<Bookmark>>;
  let spaceRepository: jest.Mocked<Repository<DiscussionSpace>>;
  let attachmentService: jest.Mocked<AttachmentService>;
  let voteService: jest.Mocked<VoteService>;
  let analyticService: jest.Mocked<AnalyticService>;
  let webSocketGateway: jest.Mocked<WebsocketGateway>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<Discussion>>;
  let entityManager: jest.Mocked<EntityManager>;
  let repositoryManager: any;

  // Mock data factory for Discussion
  const createMockDiscussion = (overrides: Partial<Discussion> = {}): Discussion => {
    const baseDiscussion = {
      id: 1,
      content: 'Test discussion content',
      isAnonymous: false,
      authorId: 1,
      commentCount: 0,
      upvoteCount: 0,
      downvoteCount: 0,
      tags: ['test'],
      spaceId: 1,
      isEdited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      author: createMockUser(),
      space: createMockDiscussionSpace(),
      comments: [],
      attachments: [],
      isAnonymousAuthor: jest.fn().mockReturnValue(false),
      hasTags: jest.fn().mockReturnValue(true),
      markEdited: jest.fn(),
      ...overrides,
    };
    return baseDiscussion as unknown as Discussion;
  };

  // Mock data factory for User
  const createMockUser = (overrides: Partial<User> = {}): User => {
    const user = new User();
    user.id = 1;
    user.username = 'testuser';
    user.fullName = 'Test User';
    user.email = 'test@example.com';
    user.password = 'hashedPassword';
    user.role = UserRole.USER;
    user.avatarUrl = null;
    user.lastActiveAt = new Date();
    user.oauthProvider = null;
    user.createdAt = new Date();
    user.updatedAt = new Date();
    user.deletedAt = undefined;

    return Object.assign(user, overrides);
  };

  // Mock data factory for DiscussionSpace
  const createMockDiscussionSpace = (overrides: Partial<DiscussionSpace> = {}): DiscussionSpace => {
    const baseSpace = {
      id: 1,
      name: 'Test Space',
      description: 'Test space description',
      slug: 'test-space',
      iconUrl: null,
      bannerUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      ...overrides,
    };
    return baseSpace as unknown as DiscussionSpace;
  };

  // Mock data factory for Bookmark
  const createMockBookmark = (overrides: Partial<Bookmark> = {}): Bookmark => {
    const baseBookmark = {
      id: 1,
      discussionId: 1,
      userId: 1,
      createdAt: new Date(),
      ...overrides,
    };
    return baseBookmark as unknown as Bookmark;
  };

  const mockDiscussion = createMockDiscussion();
  const mockUser = createMockUser();
  const mockSpace = createMockDiscussionSpace();
  const mockBookmark = createMockBookmark();

  beforeEach(async () => {
    // Create mock query builder
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockDiscussion], 1]),
      getMany: jest.fn().mockResolvedValue([mockDiscussion]),
      getRawMany: jest.fn().mockResolvedValue([{ date: '2023-01-01', count: '5' }]),
      subQuery: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('subquery'),
    } as unknown as jest.Mocked<SelectQueryBuilder<Discussion>>;

    // Create mock entity manager
    entityManager = {
      save: jest.fn().mockResolvedValue(mockDiscussion),
      remove: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(mockDiscussion),
      increment: jest.fn().mockResolvedValue(undefined),
      decrement: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;

    // Create mock repository manager (different from entityManager)
    repositoryManager = {
      connection: {
        createQueryRunner: jest.fn().mockReturnValue({
          connect: jest.fn().mockResolvedValue(undefined),
          startTransaction: jest.fn().mockResolvedValue(undefined),
          commitTransaction: jest.fn().mockResolvedValue(undefined),
          rollbackTransaction: jest.fn().mockResolvedValue(undefined),
          release: jest.fn().mockResolvedValue(undefined),
          manager: entityManager,
        }),
      },
      increment: jest.fn().mockResolvedValue(undefined),
      decrement: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(mockDiscussion),
      save: jest.fn().mockResolvedValue(mockDiscussion),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionService,
        {
          provide: getRepositoryToken(Discussion),
          useValue: {
            create: jest.fn().mockReturnValue(mockDiscussion),
            save: jest.fn().mockResolvedValue(mockDiscussion),
            findOne: jest.fn().mockResolvedValue(mockDiscussion),
            find: jest.fn().mockResolvedValue([mockDiscussion]),
            count: jest.fn().mockResolvedValue(1),
            softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            query: jest.fn().mockResolvedValue([{ tag: 'test', count: '5' }]),
            manager: repositoryManager,
          },
        },
        {
          provide: getRepositoryToken(Bookmark),
          useValue: {
            create: jest.fn().mockReturnValue(mockBookmark),
            save: jest.fn().mockResolvedValue(mockBookmark),
            findOne: jest.fn().mockResolvedValue(null),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(DiscussionSpace),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockSpace),
          },
        },
        {
          provide: AttachmentService,
          useValue: {
            createMultipleAttachments: jest.fn().mockResolvedValue([]),
            getAttachmentsByEntity: jest.fn().mockResolvedValue([]),
            getAttachmentById: jest.fn().mockResolvedValue(null),
            deleteAttachment: jest.fn().mockResolvedValue(undefined),
            deleteAttachmentsByEntity: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: VoteService,
          useValue: {
            getUserVoteStatus: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AnalyticService,
          useValue: {
            recordActivity: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WebsocketGateway,
          useValue: {
            notifyNewDiscussion: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DiscussionService>(DiscussionService);
    discussionRepository = module.get(getRepositoryToken(Discussion));
    bookmarkRepository = module.get(getRepositoryToken(Bookmark));
    spaceRepository = module.get(getRepositoryToken(DiscussionSpace));
    attachmentService = module.get(AttachmentService);
    voteService = module.get(VoteService);
    analyticService = module.get(AnalyticService);
    webSocketGateway = module.get(WebsocketGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDiscussionDto: CreateDiscussionDto = {
      content: 'Test discussion content',
      tags: ['test', 'discussion'],
      isAnonymous: false,
      spaceId: 1,
    };

    it('should create a discussion successfully', async () => {
      const result = await service.create(createDiscussionDto, mockUser);

      expect(discussionRepository.create).toHaveBeenCalledWith({
        ...createDiscussionDto,
        authorId: mockUser.id,
        commentCount: 0,
        upvoteCount: 0,
        downvoteCount: 0,
      });
      expect(webSocketGateway.notifyNewDiscussion).toHaveBeenCalledWith(
        mockUser.id,
        mockDiscussion.id,
        mockDiscussion.spaceId,
      );
      expect(analyticService.recordActivity).toHaveBeenCalled();
      expect(result).toBeInstanceOf(DiscussionResponseDto);
    });

    it('should throw BadRequestException if user is not provided', async () => {
      await expect(service.create(createDiscussionDto, null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if space does not exist', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.create(createDiscussionDto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle file attachments', async () => {
      const files = [{ originalname: 'test.jpg' } as Express.Multer.File];
      attachmentService.createMultipleAttachments.mockResolvedValueOnce([{ id: 1, url: '/uploads/test.jpg' } as any]);

      await service.create(createDiscussionDto, mockUser, files);

      expect(attachmentService.createMultipleAttachments).toHaveBeenCalledWith(
        files,
        AttachmentType.DISCUSSION,
        mockDiscussion.id,
        entityManager,
      );
    });

    it('should validate discussion content', async () => {
      const invalidDto = { ...createDiscussionDto, content: '' };

      await expect(service.create(invalidDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should validate maximum content length', async () => {
      const invalidDto = { ...createDiscussionDto, content: 'a'.repeat(10001) };

      await expect(service.create(invalidDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should validate maximum tags count', async () => {
      const invalidDto = { ...createDiscussionDto, tags: new Array(11).fill('tag') };

      await expect(service.create(invalidDto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const searchDto: SearchDiscussionDto = {
      page: 1,
      limit: 10,
      sortBy: DiscussionSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    it('should return paginated discussions', async () => {
      const result = await service.findAll(searchDto, mockUser);

      expect(discussionRepository.createQueryBuilder).toHaveBeenCalledWith('discussion');
      expect(result.items).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.currentPage).toBe(1);
    });

    it('should handle search without user', async () => {
      const result = await service.findAll(searchDto);

      expect(result.items).toHaveLength(1);
      expect(voteService.getUserVoteStatus).not.toHaveBeenCalled();
    });

    it('should load user-specific data when user is provided', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(mockBookmark);
      voteService.getUserVoteStatus.mockResolvedValueOnce(1);

      await service.findAll(searchDto, mockUser);

      expect(bookmarkRepository.findOne).toHaveBeenCalledWith({
        where: { discussionId: mockDiscussion.id, userId: mockUser.id },
      });
      expect(voteService.getUserVoteStatus).toHaveBeenCalledWith(
        mockUser.id,
        VoteEntityType.DISCUSSION,
        mockDiscussion.id,
      );
    });
  });

  describe('findById', () => {
    it('should return discussion by id', async () => {
      const result = await service.findById(1, mockUser);

      expect(discussionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['author', 'space'],
      });
      expect(result).toBeInstanceOf(DiscussionResponseDto);
    });

    it('should throw NotFoundException if discussion not found', async () => {
      discussionRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findById(999, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateDiscussionDto = {
      content: 'Updated content',
      tags: ['updated'],
      isAnonymous: true,
    };

    it('should update discussion successfully', async () => {
      const result = await service.update(1, updateDto, mockUser);

      expect(discussionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['author'],
      });
      expect(entityManager.save).toHaveBeenCalled();
      expect(analyticService.recordActivity).toHaveBeenCalledWith(
        mockUser.id,
        ActivityType.EDIT_DISCUSSION,
        ActivityEntityType.DISCUSSION,
        1,
        expect.any(Object),
      );
      expect(result).toBeInstanceOf(DiscussionResponseDto);
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      const otherUser = createMockUser({ id: 2 });
      const discussion = createMockDiscussion({ authorId: 1 });
      discussionRepository.findOne.mockResolvedValueOnce(discussion);

      await expect(service.update(1, updateDto, otherUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update any discussion', async () => {
      const adminUser = createMockUser({ id: 2, role: UserRole.ADMIN });
      const discussion = createMockDiscussion({ authorId: 1 });
      discussionRepository.findOne.mockResolvedValueOnce(discussion);

      await service.update(1, updateDto, adminUser);

      expect(entityManager.save).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft delete discussion successfully', async () => {
      await service.delete(1, mockUser);

      expect(discussionRepository.softDelete).toHaveBeenCalledWith(1);
      expect(analyticService.recordActivity).toHaveBeenCalledWith(
        mockUser.id,
        ActivityType.DELETE_DISCUSSION,
        ActivityEntityType.DISCUSSION,
        1,
        { softDelete: true },
      );
    });

    it('should allow deletion without user for admin operations', async () => {
      await service.delete(1);

      expect(discussionRepository.softDelete).toHaveBeenCalledWith(1);
      expect(analyticService.recordActivity).not.toHaveBeenCalled();
    });
  });

  describe('bookmarkDiscussion', () => {
    it('should bookmark discussion successfully', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(null);

      await service.bookmarkDiscussion(1, 1);

      expect(bookmarkRepository.create).toHaveBeenCalledWith({
        discussionId: 1,
        userId: 1,
      });
      expect(bookmarkRepository.save).toHaveBeenCalled();
      expect(analyticService.recordActivity).toHaveBeenCalled();
    });

    it('should not create duplicate bookmark', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(mockBookmark);

      await service.bookmarkDiscussion(1, 1);

      expect(bookmarkRepository.create).not.toHaveBeenCalled();
      expect(bookmarkRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if discussion not found', async () => {
      discussionRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.bookmarkDiscussion(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unbookmarkDiscussion', () => {
    it('should unbookmark discussion successfully', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(mockBookmark);

      await service.unbookmarkDiscussion(1, 1);

      expect(bookmarkRepository.remove).toHaveBeenCalledWith(mockBookmark);
      expect(analyticService.recordActivity).toHaveBeenCalled();
    });

    it('should throw NotFoundException if bookmark not found', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.unbookmarkDiscussion(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBookmarkedDiscussions', () => {
    const searchDto: SearchDiscussionDto = {
      page: 1,
      limit: 10,
      sortBy: DiscussionSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    it('should return bookmarked discussions', async () => {
      const result = await service.getBookmarkedDiscussions(1, searchDto);

      expect(discussionRepository.createQueryBuilder).toHaveBeenCalledWith('discussion');
      expect(queryBuilder.innerJoin).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].isBookmarked).toBe(true);
    });
  });

  describe('isDiscussionBookmarked', () => {
    it('should return true if discussion is bookmarked', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(mockBookmark);

      const result = await service.isDiscussionBookmarked(1, 1);

      expect(result).toBe(true);
    });

    it('should return false if discussion is not bookmarked', async () => {
      bookmarkRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.isDiscussionBookmarked(1, 1);

      expect(result).toBe(false);
    });
  });

  describe('getPopularTags', () => {
    it('should return popular tags', async () => {
      const result = await service.getPopularTags(1, 10);

      expect(discussionRepository.query).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].tag).toBe('test');
      expect(result.items[0].count).toBe(5);
    });
  });

  describe('Statistics methods', () => {
    describe('countTotal', () => {
      it('should return total count', async () => {
        const result = await service.countTotal();

        expect(discussionRepository.count).toHaveBeenCalled();
        expect(result).toBe(1);
      });
    });

    describe('countByDateRange', () => {
      it('should return count by date range', async () => {
        const start = new Date('2023-01-01');
        const end = new Date('2023-01-31');

        const result = await service.countByDateRange(start, end);

        expect(discussionRepository.count).toHaveBeenCalledWith({
          where: { createdAt: expect.any(Object) },
        });
        expect(result).toBe(1);
      });
    });

    describe('getTimeSeries', () => {
      it('should return time series data', async () => {
        const start = new Date('2023-01-01');
        const end = new Date('2023-01-31');

        const result = await service.getTimeSeries(start, end);

        expect(discussionRepository.createQueryBuilder).toHaveBeenCalledWith('discussion');
        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('2023-01-01');
        expect(result[0].count).toBe('5');
      });
    });
  });

  describe('Counter methods', () => {
    describe('incrementCommentCount', () => {
      it('should increment comment count', async () => {
        await service.incrementCommentCount(1);

        expect(repositoryManager.increment).toHaveBeenCalledWith(Discussion, { id: 1 }, 'commentCount', 1);
        expect(entityManager.increment).not.toHaveBeenCalled(); // Uses default manager
      });

      it('should increment comment count with entity manager', async () => {
        await service.incrementCommentCount(1, entityManager);

        expect(entityManager.increment).toHaveBeenCalledWith(Discussion, { id: 1 }, 'commentCount', 1);
      });
    });

    describe('decrementCommentCount', () => {
      it('should decrement comment count', async () => {
        const discussionWithComments = createMockDiscussion({ commentCount: 5 });
        entityManager.findOne.mockResolvedValueOnce(discussionWithComments);

        await service.decrementCommentCount(1, entityManager);

        expect(entityManager.findOne).toHaveBeenCalledWith(Discussion, { where: { id: 1 } });
        expect(entityManager.decrement).toHaveBeenCalledWith(Discussion, { id: 1 }, 'commentCount', 1);
      });

      it('should not decrement below zero', async () => {
        const discussionWithZeroComments = createMockDiscussion({ commentCount: 0 });
        entityManager.findOne.mockResolvedValueOnce(discussionWithZeroComments);

        await service.decrementCommentCount(1, entityManager);

        expect(entityManager.decrement).not.toHaveBeenCalled();
      });
    });

    describe('incrementUpvoteCount', () => {
      it('should increment upvote count', async () => {
        await service.incrementUpvoteCount(1, entityManager);

        expect(entityManager.increment).toHaveBeenCalledWith(Discussion, { id: 1 }, 'upvoteCount', 1);
      });
    });

    describe('decrementUpvoteCount', () => {
      it('should decrement upvote count', async () => {
        const discussionWithUpvotes = createMockDiscussion({ upvoteCount: 5 });
        entityManager.findOne.mockResolvedValueOnce(discussionWithUpvotes);

        await service.decrementUpvoteCount(1, entityManager);

        expect(entityManager.findOne).toHaveBeenCalledWith(Discussion, { where: { id: 1 } });
        expect(entityManager.decrement).toHaveBeenCalledWith(Discussion, { id: 1 }, 'upvoteCount', 1);
      });
    });

    describe('incrementDownvoteCount', () => {
      it('should increment downvote count', async () => {
        await service.incrementDownvoteCount(1, entityManager);

        expect(entityManager.increment).toHaveBeenCalledWith(Discussion, { id: 1 }, 'downvoteCount', 1);
      });
    });

    describe('decrementDownvoteCount', () => {
      it('should decrement downvote count', async () => {
        const discussionWithDownvotes = createMockDiscussion({ downvoteCount: 5 });
        entityManager.findOne.mockResolvedValueOnce(discussionWithDownvotes);

        await service.decrementDownvoteCount(1, entityManager);

        expect(entityManager.findOne).toHaveBeenCalledWith(Discussion, { where: { id: 1 } });
        expect(entityManager.decrement).toHaveBeenCalledWith(Discussion, { id: 1 }, 'downvoteCount', 1);
      });
    });
  });

  describe('getDiscussionEntity', () => {
    it('should return discussion entity', async () => {
      const result = await service.getDiscussionEntity(1, ['author']);

      expect(discussionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['author'],
      });
      expect(result).toBe(mockDiscussion);
    });

    it('should throw NotFoundException if not found', async () => {
      discussionRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.getDiscussionEntity(999)).rejects.toThrow(NotFoundException);
    });
  });
});
