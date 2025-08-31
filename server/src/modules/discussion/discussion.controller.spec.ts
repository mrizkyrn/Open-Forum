import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/dto/search.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { Pageable } from '../../common/interfaces/pageable.interface';
import { User } from '../user/entities/user.entity';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { DiscussionResponseDto, PopularTagsResponseDto } from './dto/discussion-response.dto';
import { DiscussionSortBy, SearchDiscussionDto } from './dto/search-discussion.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';

/**
 * Mock factory for creating User entities
 */
const createMockUser = (overrides: Partial<User> = {}): User => {
  const user = new User();
  user.id = 1;
  user.username = 'testuser';
  user.fullName = 'Test User';
  user.email = 'test@example.com';
  user.role = UserRole.USER;
  user.avatarUrl = null;
  user.lastActiveAt = new Date();
  user.createdAt = new Date();
  user.updatedAt = new Date();
  user.oauthProvider = null;

  return Object.assign(user, overrides);
};

/**
 * Mock factory for creating DiscussionResponseDto
 */
const createMockDiscussionResponseDto = (overrides: Partial<DiscussionResponseDto> = {}): DiscussionResponseDto => {
  const dto = new DiscussionResponseDto();
  dto.id = 1;
  dto.content = 'Test discussion content';
  dto.isAnonymous = false;
  dto.author = {
    id: 1,
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: null,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  dto.commentCount = 0;
  dto.upvoteCount = 0;
  dto.downvoteCount = 0;
  dto.tags = ['test'];
  dto.space = {
    id: 1,
    name: 'Test Space',
    slug: 'test-space',
  };
  dto.isEdited = false;
  dto.createdAt = new Date();
  dto.updatedAt = new Date();
  dto.attachments = [];
  dto.isBookmarked = false;
  dto.voteStatus = null;

  return Object.assign(dto, overrides);
};

/**
 * Mock factory for creating PopularTagsResponseDto
 */
const createMockPopularTagsResponseDto = (overrides: Partial<PopularTagsResponseDto> = {}): PopularTagsResponseDto => {
  const dto = new PopularTagsResponseDto();
  dto.tag = 'test';
  dto.count = 5;

  return Object.assign(dto, overrides);
};

/**
 * Mock factory for creating pageable response
 */
const createMockPageableResponse = <T>(items: T[], totalItems: number = items.length): Pageable<T> => {
  return {
    items,
    meta: {
      totalItems,
      itemsPerPage: 10,
      currentPage: 1,
      totalPages: Math.ceil(totalItems / 10),
      hasNextPage: totalItems > 10,
      hasPreviousPage: false,
    },
  };
};

describe('DiscussionController', () => {
  let controller: DiscussionController;
  let discussionService: jest.Mocked<DiscussionService>;

  const mockUser = createMockUser();
  const mockDiscussion = createMockDiscussionResponseDto();
  const mockPopularTag = createMockPopularTagsResponseDto();

  beforeEach(async () => {
    const mockDiscussionService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      bookmarkDiscussion: jest.fn(),
      unbookmarkDiscussion: jest.fn(),
      getBookmarkedDiscussions: jest.fn(),
      getPopularTags: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscussionController],
      providers: [
        {
          provide: DiscussionService,
          useValue: mockDiscussionService,
        },
      ],
    }).compile();

    controller = module.get<DiscussionController>(DiscussionController);
    discussionService = module.get(DiscussionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllDiscussions', () => {
    const searchDto: SearchDiscussionDto = {
      page: 1,
      limit: 10,
      sortBy: DiscussionSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    it('should return paginated discussions', async () => {
      const expectedResult = createMockPageableResponse([mockDiscussion]);
      discussionService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.getAllDiscussions(searchDto, mockUser);

      expect(discussionService.findAll).toHaveBeenCalledWith(searchDto, mockUser);
      expect(result).toBe(expectedResult);
      expect(result.items).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
    });

    it('should handle search with filters', async () => {
      const searchDtoWithFilters: SearchDiscussionDto = {
        ...searchDto,
        search: 'test query',
        authorId: 2,
        spaceId: 1,
        tags: ['javascript', 'nestjs'],
        isAnonymous: false,
      };

      const expectedResult = createMockPageableResponse([mockDiscussion]);
      discussionService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.getAllDiscussions(searchDtoWithFilters, mockUser);

      expect(discussionService.findAll).toHaveBeenCalledWith(searchDtoWithFilters, mockUser);
      expect(result).toBe(expectedResult);
    });

    it('should handle empty results', async () => {
      const emptyResult = createMockPageableResponse<DiscussionResponseDto>([]);
      discussionService.findAll.mockResolvedValue(emptyResult);

      const result = await controller.getAllDiscussions(searchDto, mockUser);

      expect(result.items).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('getPopularTags', () => {
    const paginationDto = { page: 1, limit: 10 };

    it('should return popular tags', async () => {
      const expectedResult = createMockPageableResponse([mockPopularTag]);
      discussionService.getPopularTags.mockResolvedValue(expectedResult);

      const result = await controller.getPopularTags(paginationDto);

      expect(discussionService.getPopularTags).toHaveBeenCalledWith(paginationDto.page, paginationDto.limit);
      expect(result).toBe(expectedResult);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].tag).toBe('test');
      expect(result.items[0].count).toBe(5);
    });

    it('should handle custom pagination', async () => {
      const customPagination = { page: 2, limit: 5 };
      const expectedResult = createMockPageableResponse([mockPopularTag]);
      discussionService.getPopularTags.mockResolvedValue(expectedResult);

      await controller.getPopularTags(customPagination);

      expect(discussionService.getPopularTags).toHaveBeenCalledWith(2, 5);
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
      const bookmarkedDiscussion = createMockDiscussionResponseDto({ isBookmarked: true });
      const expectedResult = createMockPageableResponse([bookmarkedDiscussion]);
      discussionService.getBookmarkedDiscussions.mockResolvedValue(expectedResult);

      const result = await controller.getBookmarkedDiscussions(mockUser, searchDto);

      expect(discussionService.getBookmarkedDiscussions).toHaveBeenCalledWith(mockUser.id, searchDto);
      expect(result).toBe(expectedResult);
      expect(result.items[0].isBookmarked).toBe(true);
    });

    it('should handle empty bookmarks', async () => {
      const emptyResult = createMockPageableResponse<DiscussionResponseDto>([]);
      discussionService.getBookmarkedDiscussions.mockResolvedValue(emptyResult);

      const result = await controller.getBookmarkedDiscussions(mockUser, searchDto);

      expect(result.items).toHaveLength(0);
    });
  });

  describe('createDiscussion', () => {
    const createDto: CreateDiscussionDto = {
      content: 'Test discussion content',
      tags: ['test', 'discussion'],
      isAnonymous: false,
      spaceId: 1,
    };

    it('should create discussion successfully', async () => {
      discussionService.create.mockResolvedValue(mockDiscussion);

      const result = await controller.createDiscussion(createDto, mockUser);

      expect(discussionService.create).toHaveBeenCalledWith(createDto, mockUser, undefined);
      expect(result).toBe(mockDiscussion);
    });

    it('should create discussion with file attachments', async () => {
      const files = [
        { originalname: 'test1.jpg', mimetype: 'image/jpeg' } as Express.Multer.File,
        { originalname: 'test2.png', mimetype: 'image/png' } as Express.Multer.File,
      ];
      discussionService.create.mockResolvedValue(mockDiscussion);

      const result = await controller.createDiscussion(createDto, mockUser, files);

      expect(discussionService.create).toHaveBeenCalledWith(createDto, mockUser, files);
      expect(result).toBe(mockDiscussion);
    });

    it('should handle anonymous discussion', async () => {
      const anonymousDto = { ...createDto, isAnonymous: true };
      const anonymousDiscussion = createMockDiscussionResponseDto({ isAnonymous: true });
      discussionService.create.mockResolvedValue(anonymousDiscussion);

      const result = await controller.createDiscussion(anonymousDto, mockUser);

      expect(discussionService.create).toHaveBeenCalledWith(anonymousDto, mockUser, undefined);
      expect(result.isAnonymous).toBe(true);
    });

    it('should propagate service errors', async () => {
      discussionService.create.mockRejectedValue(new BadRequestException('Invalid content'));

      await expect(controller.createDiscussion(createDto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDiscussionById', () => {
    it('should return discussion by id', async () => {
      discussionService.findById.mockResolvedValue(mockDiscussion);

      const result = await controller.getDiscussionById(1, mockUser);

      expect(discussionService.findById).toHaveBeenCalledWith(1, mockUser);
      expect(result).toBe(mockDiscussion);
    });

    it('should handle discussion not found', async () => {
      discussionService.findById.mockRejectedValue(new NotFoundException('Discussion not found'));

      await expect(controller.getDiscussionById(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should load user-specific data', async () => {
      const discussionWithUserData = createMockDiscussionResponseDto({
        isBookmarked: true,
        voteStatus: 1,
      });
      discussionService.findById.mockResolvedValue(discussionWithUserData);

      const result = await controller.getDiscussionById(1, mockUser);

      expect(result.isBookmarked).toBe(true);
      expect(result.voteStatus).toBe(1);
    });
  });

  describe('updateDiscussion', () => {
    const updateDto: UpdateDiscussionDto = {
      content: 'Updated content',
      tags: ['updated'],
      isAnonymous: true,
    };

    it('should update discussion successfully', async () => {
      const updatedDiscussion = createMockDiscussionResponseDto({
        content: 'Updated content',
        tags: ['updated'],
        isAnonymous: true,
        isEdited: true,
      });
      discussionService.update.mockResolvedValue(updatedDiscussion);

      const result = await controller.updateDiscussion(1, updateDto, mockUser);

      expect(discussionService.update).toHaveBeenCalledWith(1, updateDto, mockUser, undefined);
      expect(result).toBe(updatedDiscussion);
      expect(result.isEdited).toBe(true);
    });

    it('should update discussion with file attachments', async () => {
      const files = [{ originalname: 'updated.jpg' } as Express.Multer.File];
      const updatedDiscussion = createMockDiscussionResponseDto({ isEdited: true });
      discussionService.update.mockResolvedValue(updatedDiscussion);

      const result = await controller.updateDiscussion(1, updateDto, mockUser, files);

      expect(discussionService.update).toHaveBeenCalledWith(1, updateDto, mockUser, files);
      expect(result).toBe(updatedDiscussion);
    });

    it('should handle update with attachment removal', async () => {
      const updateDtoWithRemoval = {
        ...updateDto,
        attachmentsToRemove: [1, 2],
      };
      const updatedDiscussion = createMockDiscussionResponseDto({ isEdited: true });
      discussionService.update.mockResolvedValue(updatedDiscussion);

      const result = await controller.updateDiscussion(1, updateDtoWithRemoval, mockUser);

      expect(discussionService.update).toHaveBeenCalledWith(1, updateDtoWithRemoval, mockUser, undefined);
      expect(result).toBe(updatedDiscussion);
    });

    it('should propagate service errors', async () => {
      discussionService.update.mockRejectedValue(new NotFoundException('Discussion not found'));

      await expect(controller.updateDiscussion(999, updateDto, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDiscussion', () => {
    it('should delete discussion successfully', async () => {
      discussionService.delete.mockResolvedValue();

      await controller.deleteDiscussion(1, mockUser);

      expect(discussionService.delete).toHaveBeenCalledWith(1, mockUser);
    });

    it('should handle discussion not found', async () => {
      discussionService.delete.mockRejectedValue(new NotFoundException('Discussion not found'));

      await expect(controller.deleteDiscussion(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle forbidden deletion', async () => {
      discussionService.delete.mockRejectedValue(new Error('Forbidden'));

      await expect(controller.deleteDiscussion(1, mockUser)).rejects.toThrow();
    });
  });

  describe('bookmarkDiscussion', () => {
    it('should bookmark discussion successfully', async () => {
      discussionService.bookmarkDiscussion.mockResolvedValue();

      await controller.bookmarkDiscussion(1, mockUser);

      expect(discussionService.bookmarkDiscussion).toHaveBeenCalledWith(1, mockUser.id);
    });

    it('should handle discussion not found', async () => {
      discussionService.bookmarkDiscussion.mockRejectedValue(new NotFoundException('Discussion not found'));

      await expect(controller.bookmarkDiscussion(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle already bookmarked discussion', async () => {
      // Service should handle this gracefully without error
      discussionService.bookmarkDiscussion.mockResolvedValue();

      await controller.bookmarkDiscussion(1, mockUser);

      expect(discussionService.bookmarkDiscussion).toHaveBeenCalledWith(1, mockUser.id);
    });
  });

  describe('unbookmarkDiscussion', () => {
    it('should unbookmark discussion successfully', async () => {
      discussionService.unbookmarkDiscussion.mockResolvedValue();

      await controller.unbookmarkDiscussion(1, mockUser);

      expect(discussionService.unbookmarkDiscussion).toHaveBeenCalledWith(1, mockUser.id);
    });

    it('should handle bookmark not found', async () => {
      discussionService.unbookmarkDiscussion.mockRejectedValue(new NotFoundException('Bookmark not found'));

      await expect(controller.unbookmarkDiscussion(1, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle discussion not found', async () => {
      discussionService.unbookmarkDiscussion.mockRejectedValue(new NotFoundException('Discussion not found'));

      await expect(controller.unbookmarkDiscussion(999, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('Input Validation', () => {
    it('should validate discussion ID parameter', async () => {
      discussionService.findById.mockRejectedValueOnce(new BadRequestException('Invalid discussion ID'));

      await expect(controller.getDiscussionById(NaN as any, mockUser)).rejects.toBeDefined();
    });

    it('should validate pagination parameters', async () => {
      const invalidSearchDto = {
        page: -1, // Invalid page
        limit: 0, // Invalid limit
        sortBy: DiscussionSortBy.CREATED_AT,
        sortOrder: SortOrder.DESC,
      } as SearchDiscussionDto;

      // Service should handle validation
      discussionService.findAll.mockRejectedValue(new BadRequestException('Invalid pagination'));

      await expect(controller.getAllDiscussions(invalidSearchDto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable', async () => {
      discussionService.findAll.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        controller.getAllDiscussions(
          {
            page: 1,
            limit: 10,
            sortBy: DiscussionSortBy.CREATED_AT,
            sortOrder: SortOrder.DESC,
          },
          mockUser,
        ),
      ).rejects.toThrow('Service unavailable');
    });

    it('should handle malformed requests', async () => {
      const invalidDto = {} as CreateDiscussionDto;
      discussionService.create.mockRejectedValue(new BadRequestException('Content is required'));

      await expect(controller.createDiscussion(invalidDto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Authorization', () => {
    it('should pass user context to service methods', async () => {
      discussionService.findAll.mockResolvedValue(createMockPageableResponse([]));

      await controller.getAllDiscussions(
        {
          page: 1,
          limit: 10,
          sortBy: DiscussionSortBy.CREATED_AT,
          sortOrder: SortOrder.DESC,
        },
        mockUser,
      );

      expect(discussionService.findAll).toHaveBeenCalledWith(expect.any(Object), mockUser);
    });

    it('should work with admin users', async () => {
      const adminUser = createMockUser({ role: UserRole.ADMIN });
      discussionService.create.mockResolvedValue(mockDiscussion);

      await controller.createDiscussion(
        {
          content: 'Admin discussion',
          tags: [],
          isAnonymous: false,
        },
        adminUser,
      );

      expect(discussionService.create).toHaveBeenCalledWith(expect.any(Object), adminUser, undefined);
    });
  });
});
