import { Injectable, BadRequestException, InternalServerErrorException, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { appConfig } from '../../config';
import { v4 as uuidv4 } from 'uuid';

export enum FileType {
  USER_AVATAR = 'avatars',
  SPACE_ICON = 'space-icons',
  SPACE_BANNER = 'space-banners',
  DISCUSSION_ATTACHMENT = 'discussion-attachments',
  COMMENT_ATTACHMENT = 'comment-attachments',
}

interface FileUploadOptions {
  maxSizeMB?: number;
  allowedTypes?: string[];
  width?: number;
  height?: number;
  quality?: number;
}

@Injectable()
export class FileService {
  private readonly uploadDir: string;

  constructor(
    @Inject(appConfig.KEY)
    private readonly appConfigService: ConfigType<typeof appConfig>,
  ) {
    this.uploadDir = this.appConfigService.uploadDir || path.join(process.cwd(), 'uploads');
    this.ensureDirectoryExists(this.uploadDir);
  }

  /**
  * Upload a file with type-specific validations
   */
  async uploadFile(file: Express.Multer.File, fileType: FileType, options?: FileUploadOptions): Promise<string> {
    try {
      // Apply default options based on file type
      const validationOptions = this.getDefaultOptions(fileType, options);

      // Validate the file
      this.validateFile(file, validationOptions);

      // Create directory path by file type and date
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const dirPath = path.join(this.uploadDir, fileType, year, month);

      // Ensure directory exists
      this.ensureDirectoryExists(dirPath);

      // Generate unique filename
      const fileExt = path.extname(file.originalname).toLowerCase();
      const uniqueFilename = `${Date.now()}-${uuidv4()}${fileExt}`;
      const filePath = path.join(dirPath, uniqueFilename);
      const relativePath = path.join(fileType, year, month, uniqueFilename).replace(/\\/g, '/');

      // Write file to disk
      await fs.promises.writeFile(filePath, file.buffer);

      // Return the URL to the file
      return `/uploads/${relativePath}`;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error uploading file:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
  * Delete a file by its URL
   */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    try {
      // Strip the /uploads/ prefix if present
      const relativePath = fileUrl.replace(/^\/uploads\//, '');
      const filePath = path.join(this.uploadDir, relativePath);

      // Check if file exists before trying to delete
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
  * Helper to replace a file - deletes old file and uploads a new one
   */
  async replaceFile(
    oldFileUrl: string | null | undefined,
    newFile: Express.Multer.File,
    fileType: FileType,
    options?: FileUploadOptions,
  ): Promise<string> {
    // Delete the old file if it exists
    if (oldFileUrl) {
      await this.deleteFile(oldFileUrl);
    }

    // Upload the new file
    return this.uploadFile(newFile, fileType, options);
  }

  /**
  * Shortcut for user avatar upload
   */
  async uploadUserAvatar(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, FileType.USER_AVATAR, {
      maxSizeMB: 3, // 3MB max
      allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    });
  }

  /**
  * Shortcut for space icon upload
   */
  async uploadSpaceIcon(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, FileType.SPACE_ICON, {
      maxSizeMB: 0.5, // 500KB max
      allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    });
  }

  /**
  * Shortcut for space banner upload
   */
  async uploadSpaceBanner(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, FileType.SPACE_BANNER, {
      maxSizeMB: 2, // 2MB max
      allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    });
  }

  /**
  * Shortcut for discussion attachment upload
   */
  async uploadDiscussionAttachment(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, FileType.DISCUSSION_ATTACHMENT, {
      maxSizeMB: 3,
      allowedTypes: [
        'image/jpg',
        'image/jpeg',
        'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-rar-compressed',
      ],
    });
  }

  /**
  * Upload a comment attachment
   */
  async uploadCommentAttachment(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, FileType.COMMENT_ATTACHMENT, {
      maxSizeMB: 3,
      allowedTypes: [
        'image/jpg',
        'image/jpeg',
        'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-rar-compressed',
      ],
    });
  }

  /**
  * Get default options based on file type
   */
  private getDefaultOptions(fileType: FileType, userOptions?: FileUploadOptions): FileUploadOptions {
    const defaultOptions: Record<FileType, FileUploadOptions> = {
      [FileType.USER_AVATAR]: {
        maxSizeMB: 3,
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
      },
      [FileType.SPACE_ICON]: {
        maxSizeMB: 0.5,
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
      },
      [FileType.SPACE_BANNER]: {
        maxSizeMB: 2,
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
      },
      [FileType.DISCUSSION_ATTACHMENT]: {
        maxSizeMB: 3,
        allowedTypes: [
          'image/jpg',
          'image/jpeg',
          'image/png',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/zip',
          'application/x-rar-compressed',
        ],
      },
      [FileType.COMMENT_ATTACHMENT]: {
        maxSizeMB: 3,
        allowedTypes: [
          'image/jpg',
          'image/jpeg',
          'image/png',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/zip',
          'application/x-rar-compressed',
        ],
      },
    };

    // Return merged options (user options override defaults)
    return {
      ...defaultOptions[fileType],
      ...userOptions,
    };
  }

  /**
  * Validate file based on options
   */
  private validateFile(file: Express.Multer.File, options: FileUploadOptions): void {
    const { maxSizeMB = 2, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'] } = options;

    // Check file size
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds maximum allowed (${maxSizeMB}MB)`);
    }

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedTypes.map((t) => t.replace('image/', '')).join(', ')}`,
      );
    }
  }

  /**
  * Create directory if it doesn't exist
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
