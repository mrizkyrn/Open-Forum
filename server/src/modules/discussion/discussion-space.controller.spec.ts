/**
 * Discussion Space Controller Tests
 * 
 * Comprehensive test suite for the DiscussionSpaceController class
 * Testing a    it('shou    it('should throw ConflictException', async () => {
      service.create.mockRejectedValueOnce(new ConflictException('Space already exists'));

      await expect(controller.createSpace(createDto, [], mockUser))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException', async () => {
      service.create.mockRejectedValueOnce(new BadRequestException('Invalid data'));

      await expect(controller.createSpace(createDto, [], mockUser))
        .rejects.toThrow(BadRequestException);
    });lictException', async () => {
      service.create.mockRejectedValueOnce(new ConflictException('Space already exists'));

      await expect(controller.createSpace(createDto, [], mockUser))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException', async () => {
      service.create.mockRejectedValueOnce(new BadRequestException('Invalid data'));

      await expect(controller.createSpace(createDto, [], mockUser))
        .rejects.toThrow(BadRequestException);
    });ndpoints for space management, following functionality,
 * file uploads, and authentication/authorization scenarios.
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

import { SortOrder } from '../../common/dto/search.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../user/entities/user.entity';
import { DiscussionSpaceService } from './discusison-space.service';
import { DiscussionSpaceController } from './discussion-space.controller';
import { CreateDiscussionSpaceDto } from './dto/create-discussion-space.dto';
import { DiscussionSpaceResponseDto } from './dto/discussion-space-response.dto';
import { SearchSpaceDto, SpaceSortBy } from './dto/search-space.dto';
import { UpdateDiscussionSpaceDto } from './dto/update-discussion-space.dto';
import { SpaceType } from './entities/discussion-space.entity';

describe('DiscussionSpaceController', () => {
  let controller: DiscussionSpaceController;
  let service: jest.Mocked<DiscussionSpaceService>;

  // Mock data factory for DiscussionSpaceResponseDto
  const createMockSpaceResponse = (overrides: Partial<DiscussionSpaceResponseDto> = {}): DiscussionSpaceResponseDto => {
    return {
      id: 1,
      name: 'Test Space',
      description: 'Test description',
      slug: 'test-space',
      creatorId: 1,
      spaceType: SpaceType.GENERAL,
      followerCount: 0,
      isFollowing: false,
      iconUrl: null,
      bannerUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as DiscussionSpaceResponseDto;
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
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscussionSpaceController],
      providers: [
        {
          provide: DiscussionSpaceService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            findBySlug: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            followSpace: jest.fn(),
            unfollowSpace: jest.fn(),
            isFollowing: jest.fn(),
            getPopularSpaces: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DiscussionSpaceController>(DiscussionSpaceController);
    service = module.get<DiscussionSpaceService>(DiscussionSpaceService) as jest.Mocked<DiscussionSpaceService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSpace', () => {
    const createDto: CreateDiscussionSpaceDto = {
      name: 'Test Space',
      description: 'Test description',
      slug: 'test-space',
      spaceType: SpaceType.GENERAL,
    };

    const mockUser = createMockUser();

    it('should create a space successfully', async () => {
      const mockResponse = createMockSpaceResponse();
      service.create.mockResolvedValueOnce(mockResponse);

      const result = await controller.createSpace(createDto, [], mockUser);

      expect(service.create).toHaveBeenCalledWith(createDto, mockUser, {});
      expect(result).toBe(mockResponse);
    });

    it('should create a space with files', async () => {
      const mockResponse = createMockSpaceResponse();
      const mockFiles = [
        { fieldname: 'icon', filename: 'icon.png' } as Express.Multer.File,
        { fieldname: 'banner', filename: 'banner.png' } as Express.Multer.File,
      ];
      service.create.mockResolvedValueOnce(mockResponse);

      const result = await controller.createSpace(createDto, mockFiles, mockUser);

      expect(service.create).toHaveBeenCalledWith(createDto, mockUser, expect.any(Object));
      expect(result).toBe(mockResponse);
    });

    it('should handle ConflictException', async () => {
      service.create.mockRejectedValueOnce(new ConflictException('Space already exists'));

      await expect(controller.createSpace(createDto, [], mockUser)).rejects.toThrow(ConflictException);
    });

    it('should handle BadRequestException', async () => {
      service.create.mockRejectedValueOnce(new BadRequestException('Invalid data'));

      await expect(controller.createSpace(createDto, [], mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAllSpaces', () => {
    const searchDto: SearchSpaceDto = {
      page: 1,
      limit: 10,
      sortBy: SpaceSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };

    const mockUser = createMockUser();

    it('should get all spaces without user', async () => {
      const mockResponse = {
        items: [createMockSpaceResponse()],
        meta: {
          totalItems: 1,
          itemsPerPage: 10,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      service.findAll.mockResolvedValueOnce(mockResponse);

      const result = await controller.getAllSpaces(searchDto, undefined);

      expect(service.findAll).toHaveBeenCalledWith(searchDto, undefined);
      expect(result).toBe(mockResponse);
    });

    it('should get all spaces with user', async () => {
      const mockResponse = {
        items: [createMockSpaceResponse({ isFollowing: true })],
        meta: {
          totalItems: 1,
          itemsPerPage: 10,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      service.findAll.mockResolvedValueOnce(mockResponse);

      const result = await controller.getAllSpaces(searchDto, mockUser);

      expect(service.findAll).toHaveBeenCalledWith(searchDto, mockUser);
      expect(result).toBe(mockResponse);
    });
  });

  describe('getSpaceById', () => {
    const mockUser = createMockUser();

    it('should get space by ID without user', async () => {
      const mockResponse = createMockSpaceResponse();
      service.findById.mockResolvedValueOnce(mockResponse);

      const result = await controller.getSpaceById(1, undefined);

      expect(service.findById).toHaveBeenCalledWith(1, undefined);
      expect(result).toBe(mockResponse);
    });

    it('should get space by ID with user', async () => {
      const mockResponse = createMockSpaceResponse({ isFollowing: true });
      service.findById.mockResolvedValueOnce(mockResponse);

      const result = await controller.getSpaceById(1, mockUser);

      expect(service.findById).toHaveBeenCalledWith(1, mockUser);
      expect(result).toBe(mockResponse);
    });

    it('should handle NotFoundException', async () => {
      service.findById.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.getSpaceById(999, undefined)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSpaceBySlug', () => {
    const mockUser = createMockUser();

    it('should get space by slug', async () => {
      const mockResponse = createMockSpaceResponse();
      service.findBySlug.mockResolvedValueOnce(mockResponse);

      const result = await controller.getSpaceBySlug('test-space', mockUser);

      expect(service.findBySlug).toHaveBeenCalledWith('test-space', mockUser);
      expect(result).toBe(mockResponse);
    });

    it('should handle NotFoundException', async () => {
      service.findBySlug.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.getSpaceBySlug('nonexistent', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSpace', () => {
    const updateDto: UpdateDiscussionSpaceDto = {
      name: 'Updated Space',
      description: 'Updated description',
    };

    const mockUser = createMockUser();

    it('should update space successfully', async () => {
      const mockResponse = createMockSpaceResponse({
        name: 'Updated Space',
        description: 'Updated description',
      });
      service.update.mockResolvedValueOnce(mockResponse);

      const result = await controller.updateSpace(1, updateDto, [], mockUser);

      expect(service.update).toHaveBeenCalledWith(1, updateDto, mockUser, {});
      expect(result).toBe(mockResponse);
    });

    it('should update space with files', async () => {
      const mockResponse = createMockSpaceResponse();
      const mockFiles = [{ fieldname: 'icon', filename: 'new-icon.png' } as Express.Multer.File];
      service.update.mockResolvedValueOnce(mockResponse);

      const result = await controller.updateSpace(1, updateDto, mockFiles, mockUser);

      expect(service.update).toHaveBeenCalledWith(1, updateDto, mockUser, expect.any(Object));
      expect(result).toBe(mockResponse);
    });

    it('should handle ForbiddenException', async () => {
      service.update.mockRejectedValueOnce(new ForbiddenException('Access denied'));

      await expect(controller.updateSpace(1, updateDto, [], mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should handle NotFoundException', async () => {
      service.update.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.updateSpace(999, updateDto, [], mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSpace', () => {
    const mockUser = createMockUser();

    it('should delete space successfully', async () => {
      service.delete.mockResolvedValueOnce(undefined);

      await controller.deleteSpace(1, mockUser);

      expect(service.delete).toHaveBeenCalledWith(1, mockUser);
    });

    it('should handle ForbiddenException', async () => {
      service.delete.mockRejectedValueOnce(new ForbiddenException('Access denied'));

      await expect(controller.deleteSpace(1, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should handle NotFoundException', async () => {
      service.delete.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.deleteSpace(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle BadRequestException for spaces with discussions', async () => {
      service.delete.mockRejectedValueOnce(new BadRequestException('Cannot delete space with discussions'));

      await expect(controller.deleteSpace(1, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('followSpace', () => {
    const mockUser = createMockUser();

    it('should follow space successfully', async () => {
      service.followSpace.mockResolvedValueOnce(undefined);

      await controller.followSpace(1, mockUser);

      expect(service.followSpace).toHaveBeenCalledWith(1, mockUser.id);
    });

    it('should handle NotFoundException', async () => {
      service.followSpace.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.followSpace(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle InternalServerErrorException', async () => {
      service.followSpace.mockRejectedValueOnce(new InternalServerErrorException('Database error'));

      await expect(controller.followSpace(1, mockUser)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('unfollowSpace', () => {
    const mockUser = createMockUser();

    it('should unfollow space successfully', async () => {
      service.unfollowSpace.mockResolvedValueOnce(undefined);

      await controller.unfollowSpace(1, mockUser);

      expect(service.unfollowSpace).toHaveBeenCalledWith(1, mockUser.id);
    });

    it('should handle NotFoundException', async () => {
      service.unfollowSpace.mockRejectedValueOnce(new NotFoundException('Space not found'));

      await expect(controller.unfollowSpace(999, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should handle InternalServerErrorException', async () => {
      service.unfollowSpace.mockRejectedValueOnce(new InternalServerErrorException('Database error'));

      await expect(controller.unfollowSpace(1, mockUser)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getPopularSpaces', () => {
    const mockUser = createMockUser();

    it('should get popular spaces without user', async () => {
      const mockSpaces = [createMockSpaceResponse({ followerCount: 10 })];
      service.getPopularSpaces.mockResolvedValueOnce(mockSpaces);

      const result = await controller.getPopularSpaces(5, undefined);

      expect(service.getPopularSpaces).toHaveBeenCalledWith(5, undefined);
      expect(result).toBe(mockSpaces);
    });

    it('should get popular spaces with user', async () => {
      const mockSpaces = [createMockSpaceResponse({ followerCount: 10, isFollowing: true })];
      service.getPopularSpaces.mockResolvedValueOnce(mockSpaces);

      const result = await controller.getPopularSpaces(10, mockUser);

      expect(service.getPopularSpaces).toHaveBeenCalledWith(10, mockUser);
      expect(result).toBe(mockSpaces);
    });

    it('should use default limit when not provided', async () => {
      const mockSpaces = [createMockSpaceResponse()];
      service.getPopularSpaces.mockResolvedValueOnce(mockSpaces);

      const result = await controller.getPopularSpaces(undefined, mockUser);

      expect(service.getPopularSpaces).toHaveBeenCalledWith(10, mockUser);
      expect(result).toBe(mockSpaces);
    });
  });

  describe('Error Handling', () => {
    const mockUser = createMockUser();

    it('should handle service method throwing unexpected error', async () => {
      service.findById.mockRejectedValueOnce(new Error('Unexpected error'));

      await expect(controller.getSpaceById(1, mockUser)).rejects.toThrow('Unexpected error');
    });

    it('should pass through all service errors correctly', async () => {
      const errors = [
        new BadRequestException('Bad request'),
        new NotFoundException('Not found'),
        new ForbiddenException('Forbidden'),
        new ConflictException('Conflict'),
        new InternalServerErrorException('Internal error'),
      ];

      for (const error of errors) {
        service.findById.mockRejectedValueOnce(error);
        await expect(controller.getSpaceById(1, mockUser)).rejects.toThrow(error);
      }
    });
  });

  describe('File Upload Scenarios', () => {
    const mockUser = createMockUser();

    it('should handle files with both icon and banner', async () => {
      const createDto: CreateDiscussionSpaceDto = {
        name: 'Test Space',
        description: 'Test description',
        slug: 'test-space',
        spaceType: SpaceType.GENERAL,
      };

      const mockFiles = [
        { fieldname: 'icon', filename: 'icon.png' } as Express.Multer.File,
        { fieldname: 'banner', filename: 'banner.png' } as Express.Multer.File,
      ];

      const mockResponse = createMockSpaceResponse({
        iconUrl: 'https://example.com/icon.png',
        bannerUrl: 'https://example.com/banner.png',
      });

      service.create.mockResolvedValueOnce(mockResponse);

      const result = await controller.createSpace(createDto, mockFiles, mockUser);

      expect(service.create).toHaveBeenCalledWith(createDto, mockUser, expect.any(Object));
      expect(result.iconUrl).toBe('https://example.com/icon.png');
      expect(result.bannerUrl).toBe('https://example.com/banner.png');
    });

    it('should handle empty files object', async () => {
      const createDto: CreateDiscussionSpaceDto = {
        name: 'Test Space',
        description: 'Test description',
        slug: 'test-space',
        spaceType: SpaceType.GENERAL,
      };

      const mockResponse = createMockSpaceResponse();
      service.create.mockResolvedValueOnce(mockResponse);

      const result = await controller.createSpace(createDto, [], mockUser);

      expect(service.create).toHaveBeenCalledWith(createDto, mockUser, {});
      expect(result).toBe(mockResponse);
    });
  });

  describe('Authentication/Authorization', () => {
    it('should handle authenticated vs unauthenticated users correctly', async () => {
      const authenticatedResponse = createMockSpaceResponse({ isFollowing: true });
      const unauthenticatedResponse = createMockSpaceResponse({ isFollowing: false });

      // Authenticated user
      service.findById.mockResolvedValueOnce(authenticatedResponse);
      const authResult = await controller.getSpaceById(1, createMockUser());
      expect(authResult.isFollowing).toBe(true);

      // Unauthenticated user
      service.findById.mockResolvedValueOnce(unauthenticatedResponse);
      const unauthResult = await controller.getSpaceById(1, undefined);
      expect(unauthResult.isFollowing).toBe(false);
    });
  });
});
