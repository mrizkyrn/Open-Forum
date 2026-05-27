/**
 * Discussion Space Service Tests
 *
 * Comprehensive test suite for the DiscussionSpaceService class
 * Testing all CRUD operations, following/unfollowing functionality,
 * popular spaces retrieval, and error handling scenarios.
 *
 * @author Open Forum Team
 * @version 1.0.0
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { SortOrder } from '../../common/dto/search.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { FileService } from '../../core/file/file.service';
import { AnalyticService } from '../analytic/analytic.service';
import { ActivityEntityType, ActivityType } from '../analytic/entities/user-activity.entity';
import { User } from '../user/entities/user.entity';
import { DiscussionSpaceService } from './discusison-space.service';
import { CreateDiscussionSpaceDto } from './dto/create-discussion-space.dto';
import { DiscussionSpaceResponseDto } from './dto/discussion-space-response.dto';
import { SearchSpaceDto, SpaceSortBy } from './dto/search-space.dto';
import { UpdateDiscussionSpaceDto } from './dto/update-discussion-space.dto';
import { DiscussionSpace, SpaceType } from './entities/discussion-space.entity';

describe('DiscussionSpaceService', () => {
  let service: DiscussionSpaceService;
  let spaceRepository: jest.Mocked<Repository<DiscussionSpace>>;
  let fileService: jest.Mocked<FileService>;
  let analyticService: jest.Mocked<AnalyticService>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<DiscussionSpace>>;
  let queryRunner: any;

  // Mock data factory for DiscussionSpace
  const createMockDiscussionSpace = (overrides: Partial<DiscussionSpace> = {}): DiscussionSpace => {
    const baseSpace = {
      id: 1,
      name: 'Test Space',
      description: 'Test description',
      slug: 'test-space',
      creatorId: 1,
      spaceType: SpaceType.GENERAL,
      followerCount: 0,
      iconUrl: null,
      bannerUrl: null,
      followers: [],
      discussions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      ...overrides,
    };
    return baseSpace as DiscussionSpace;
  };

  // Mock data factory for User
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
    user.deletedAt = undefined;

    return Object.assign(user, overrides);
  };

  beforeEach(async () => {
    // Create mock data
    const mockSpace = createMockDiscussionSpace();
    const mockUser = createMockUser();

    // Mock QueryBuilder
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockSpace], 1]),
      getMany: jest.fn().mockResolvedValue([mockSpace]),
      getCount: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SelectQueryBuilder<DiscussionSpace>>;

    // Mock QueryRunner
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        save: jest.fn().mockResolvedValue(mockSpace),
        findOne: jest.fn().mockResolvedValue(mockUser),
        remove: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionSpaceService,
        {
          provide: getRepositoryToken(DiscussionSpace),
          useValue: {
            create: jest.fn().mockReturnValue(mockSpace),
            save: jest.fn().mockResolvedValue(mockSpace),
            findOne: jest.fn().mockResolvedValue(mockSpace),
            find: jest.fn().mockResolvedValue([mockSpace]),
            count: jest.fn().mockResolvedValue(1),
            softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            manager: {
              connection: {
                createQueryRunner: jest.fn().mockReturnValue(queryRunner),
              },
            },
          },
        },
        {
          provide: FileService,
          useValue: {
            uploadSpaceIcon: jest.fn().mockResolvedValue('https://example.com/icon.png'),
            uploadSpaceBanner: jest.fn().mockResolvedValue('https://example.com/banner.png'),
            deleteFile: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AnalyticService,
          useValue: {
            recordActivity: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DiscussionSpaceService>(DiscussionSpaceService);
    spaceRepository = module.get(getRepositoryToken(DiscussionSpace));
    fileService = module.get(FileService) as jest.Mocked<FileService>;
    analyticService = module.get(AnalyticService) as jest.Mocked<AnalyticService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDiscussionSpaceDto: CreateDiscussionSpaceDto = {
      name: 'Test Space',
      description: 'Test description',
      slug: 'test-space',
      spaceType: SpaceType.GENERAL,
    };

    const mockUser = createMockUser();

    it('should create a discussion space successfully', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null); // No existing space

      const result = await service.create(createDiscussionSpaceDto, mockUser);

      expect(spaceRepository.create).toHaveBeenCalledWith({
        name: createDiscussionSpaceDto.name,
        description: createDiscussionSpaceDto.description,
        slug: createDiscussionSpaceDto.slug,
        creatorId: mockUser.id,
        spaceType: createDiscussionSpaceDto.spaceType,
        followerCount: 0,
      });
      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(result).toBeInstanceOf(DiscussionSpaceResponseDto);
    });

    it('should create a space with icon and banner files', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);
      const mockIconFile = { filename: 'icon.png' } as Express.Multer.File;
      const mockBannerFile = { filename: 'banner.png' } as Express.Multer.File;

      const files = {
        icon: [mockIconFile],
        banner: [mockBannerFile],
      };

      await service.create(createDiscussionSpaceDto, mockUser, files);

      expect(fileService.uploadSpaceIcon).toHaveBeenCalledWith(mockIconFile);
      expect(fileService.uploadSpaceBanner).toHaveBeenCalledWith(mockBannerFile);
    });

    it('should throw ConflictException if slug already exists', async () => {
      const existingSpace = createMockDiscussionSpace();
      spaceRepository.findOne.mockResolvedValueOnce(existingSpace);

      await expect(service.create(createDiscussionSpaceDto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('should cleanup files on error', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);
      queryRunner.manager.save.mockRejectedValueOnce(new Error('Database error'));

      const mockIconFile = { filename: 'icon.png' } as Express.Multer.File;
      const files = { icon: [mockIconFile] };

      await expect(service.create(createDiscussionSpaceDto, mockUser, files)).rejects.toThrow();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const searchDto: SearchSpaceDto = {
      page: 1,
      limit: 10,
      sortBy: SpaceSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    const mockUser = createMockUser();

    it('should return paginated spaces', async () => {
      const mockSpace = createMockDiscussionSpace();
      queryBuilder.getManyAndCount.mockResolvedValueOnce([[mockSpace], 1]);

      const result = await service.findAll(searchDto, mockUser);

      expect(spaceRepository.createQueryBuilder).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(10);
    });

    it('should apply search filters', async () => {
      const searchDtoWithFilters: SearchSpaceDto = {
        ...searchDto,
        search: 'test',
        spaceType: SpaceType.GENERAL,
        following: true,
      };

      await service.findAll(searchDtoWithFilters, mockUser);

      expect(queryBuilder.where).toHaveBeenCalled();
      expect(queryBuilder.andWhere).toHaveBeenCalled();
      expect(queryBuilder.innerJoin).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    const mockUser = createMockUser();

    it('should return space by ID', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      const result = await service.findById(1, mockUser);

      expect(spaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['followers'],
      });
      expect(result).toBeInstanceOf(DiscussionSpaceResponseDto);
    });

    it('should throw NotFoundException if space not found', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findById(999, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    const mockUser = createMockUser();

    it('should return space by slug', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      const result = await service.findBySlug('test-space', mockUser);

      expect(spaceRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'test-space' },
        relations: ['followers'],
      });
      expect(result).toBeInstanceOf(DiscussionSpaceResponseDto);
    });

    it('should throw NotFoundException if space not found', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findBySlug('nonexistent', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateDiscussionSpaceDto = {
      name: 'Updated Space',
      description: 'Updated description',
    };

    const mockUser = createMockUser();

    it('should update space successfully', async () => {
      const mockSpace = createMockDiscussionSpace({ creatorId: mockUser.id, followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      const result = await service.update(1, updateDto, mockUser);

      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(result).toBeInstanceOf(DiscussionSpaceResponseDto);
    });

    it('should throw BadRequestException if no fields to update', async () => {
      await expect(service.update(1, {}, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user is not creator', async () => {
      const mockSpace = createMockDiscussionSpace({ creatorId: 999 });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await expect(service.update(1, updateDto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should handle icon and banner updates', async () => {
      const mockSpace = createMockDiscussionSpace({ creatorId: mockUser.id, followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      const mockIconFile = { filename: 'new-icon.png' } as Express.Multer.File;
      const files = { icon: [mockIconFile] };

      await service.update(1, updateDto, mockUser, files);

      expect(fileService.uploadSpaceIcon).toHaveBeenCalledWith(mockIconFile);
    });
  });

  describe('delete', () => {
    const mockUser = createMockUser();

    it('should delete space successfully', async () => {
      const mockSpace = createMockDiscussionSpace({
        creatorId: mockUser.id,
        discussions: [],
      });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await service.delete(1, mockUser);

      expect(queryRunner.manager.remove).toHaveBeenCalledWith(mockSpace);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if space not found', async () => {
      spaceRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.delete(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not creator', async () => {
      const mockSpace = createMockDiscussionSpace({ creatorId: 999 });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await expect(service.delete(1, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if space has discussions', async () => {
      const mockSpace = createMockDiscussionSpace({
        creatorId: mockUser.id,
        discussions: [{ id: 1 }] as any[],
      });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await expect(service.delete(1, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('followSpace', () => {
    const mockUser = createMockUser();

    it('should follow space successfully', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await service.followSpace(1, mockUser.id);

      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(analyticService.recordActivity).toHaveBeenCalledWith(
        mockUser.id,
        ActivityType.FOLLOW_SPACE,
        ActivityEntityType.DISCUSSION_SPACE,
        1,
        expect.any(Object),
      );
    });

    it('should not follow if already following', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await service.followSpace(1, mockUser.id);

      expect(queryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);
      queryRunner.manager.findOne.mockResolvedValueOnce(null);

      await expect(service.followSpace(1, mockUser.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unfollowSpace', () => {
    const mockUser = createMockUser();

    it('should unfollow space successfully', async () => {
      const mockSpace = createMockDiscussionSpace({
        followers: [mockUser],
        followerCount: 1,
      });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await service.unfollowSpace(1, mockUser.id);

      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(analyticService.recordActivity).toHaveBeenCalledWith(
        mockUser.id,
        ActivityType.UNFOLLOW_SPACE,
        ActivityEntityType.DISCUSSION_SPACE,
        1,
        expect.any(Object),
      );
    });

    it('should not unfollow if not following', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);

      await service.unfollowSpace(1, mockUser.id);

      expect(queryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      const mockSpace = createMockDiscussionSpace({ followers: [mockUser] });
      spaceRepository.findOne.mockResolvedValueOnce(mockSpace);
      queryRunner.manager.save.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.unfollowSpace(1, mockUser.id)).rejects.toThrow(InternalServerErrorException);
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('isFollowing', () => {
    it('should return true if user is following', async () => {
      queryBuilder.getCount.mockResolvedValueOnce(1);

      const result = await service.isFollowing(1, 1);

      expect(result).toBe(true);
      expect(spaceRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return false if user is not following', async () => {
      queryBuilder.getCount.mockResolvedValueOnce(0);

      const result = await service.isFollowing(1, 1);

      expect(result).toBe(false);
    });
  });

  describe('getPopularSpaces', () => {
    const mockUser = createMockUser();

    it('should return popular spaces', async () => {
      const mockSpaces = [createMockDiscussionSpace({ followerCount: 10 })];
      queryBuilder.getMany.mockResolvedValueOnce(mockSpaces);

      // Mock isFollowing method
      jest.spyOn(service, 'isFollowing').mockResolvedValueOnce(true);

      const result = await service.getPopularSpaces(10, mockUser);

      expect(spaceRepository.createQueryBuilder).toHaveBeenCalled();
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('space.followerCount', 'DESC');
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
    });

    it('should work without current user', async () => {
      const mockSpaces = [createMockDiscussionSpace()];
      queryBuilder.getMany.mockResolvedValueOnce(mockSpaces);

      const result = await service.getPopularSpaces(5);

      expect(result).toHaveLength(1);
      // No need to check isFollowing calls since no user was provided
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      spaceRepository.findOne.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.findById(1)).rejects.toThrow();
    });

    it('should handle file service errors', async () => {
      fileService.uploadSpaceIcon.mockRejectedValueOnce(new Error('Upload failed'));
      spaceRepository.findOne.mockResolvedValueOnce(null);

      const mockUser = createMockUser();
      const createDto: CreateDiscussionSpaceDto = {
        name: 'Test Space',
        description: 'Test description',
        slug: 'test-space',
        spaceType: SpaceType.GENERAL,
      };

      const files = {
        icon: [{ filename: 'icon.png' } as Express.Multer.File],
      };

      await expect(service.create(createDto, mockUser, files)).rejects.toThrow();
    });
  });
});
