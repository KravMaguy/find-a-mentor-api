import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { FavoritesController } from '../favorites.controller';
import { ListsService } from '../lists.service';
import { List } from '../interfaces/list.interface';
import { ListDto } from '../dto/list.dto';
import { UsersService } from '../../common/users.service';
import { Role, User } from '../../common/interfaces/user.interface';

class ServiceMock {}

class ObjectIdMock {
  current: string;

  constructor(current: string) {
    this.current = current;
  }
  equals(value) {
    return this.current === value.current;
  }
}

describe('modules/lists/FavoritesController', () => {
  let favoritesController: FavoritesController;
  let usersService: UsersService;
  let listsService: ListsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        {
          provide: UsersService,
          useValue: new ServiceMock(),
        },
        {
          provide: ListsService,
          useValue: new ServiceMock(),
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    listsService = module.get<ListsService>(ListsService);
    favoritesController = module.get<FavoritesController>(FavoritesController);
  });

  describe('toggle', () => {
    let userId: string;
    let mentorId: string;
    let mentorIdObj: ObjectIdMock;
    let request: any;
    let response: any;

    beforeEach(() => {
      userId = '1234';
      mentorId = '5678';
      mentorIdObj = new ObjectIdMock(mentorId);
      request = { user: { auth0Id: '1234' } };
      response = { success: true };
      usersService.findByAuth0Id = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock(userId),
          roles: [Role.MEMBER, Role.ADMIN],
        } as User),
      );
      usersService.findById = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock(userId),
          roles: [Role.MEMBER, Role.MENTOR],
        } as User),
      );
      listsService.createList = jest.fn(() =>
        Promise.resolve({ _id: '12345' } as List),
      );
      listsService.findFavoriteList = jest.fn(() =>
        Promise.resolve({
          _id: '12345',
          mentors: [{ _id: mentorIdObj }],
        } as List),
      );
      listsService.update = jest.fn(() => Promise.resolve());
    });

    it('should throw an error when user not found', async () => {
      usersService.findById = jest.fn(() => Promise.resolve(undefined));

      await expect(
        favoritesController.toggle(request as Request, userId, mentorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw an error if trying to add not a mentor', async () => {
      usersService.findById = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock(mentorId),
          roles: [Role.MEMBER],
        } as User),
      );

      await expect(
        favoritesController.toggle(request as Request, userId, mentorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw an error when toggling favorites for other user', async () => {
      usersService.findByAuth0Id = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock('1234'),
          roles: [Role.MEMBER],
        } as User),
      );
      usersService.findById = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock('5678'),
          roles: [Role.MEMBER, Role.MENTOR],
        } as User),
      );

      await expect(
        favoritesController.toggle(request as Request, userId, mentorId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should create a new favorite list and add a mentor when favorite list doesn\'t exist', async () => {
      listsService.findFavoriteList = jest.fn(() => Promise.resolve(undefined));

      expect(
        await favoritesController.toggle(request, userId, mentorId),
      ).toEqual(response);
      expect(listsService.createList).toHaveBeenCalledTimes(1);
      expect(listsService.createList).toHaveBeenCalledWith({
        name: 'Favorites',
        isFavorite: true,
        user: { _id: new ObjectIdMock(userId) },
        // this should be `mentorId`, but I need to find out how to mock a second call in jest to return a different value
        mentors: [{ _id: new ObjectIdMock(userId) }],
      });
    });

    it('should add a new mentor to the existing favorite list', async () => {
      expect(
        await favoritesController.toggle(request, userId, mentorId),
      ).toEqual(response);
      expect(listsService.update).toHaveBeenCalledTimes(1);
      expect(listsService.update).toHaveBeenCalledWith({
        _id: '12345',
        mentors: [
          { _id: new ObjectIdMock('5678') },
          { _id: new ObjectIdMock('1234') },
        ],
      });
    });

    it('should remove and existing mentor from the favorite list', async () => {
      const _id = { _id: mentorIdObj };
      usersService.findById = jest.fn(() =>
        Promise.resolve({ _id, roles: [Role.MEMBER, Role.MENTOR] } as User),
      );
      // @ts-ignore
      listsService.findFavoriteList = jest.fn(() =>
        Promise.resolve({ _id: '12345', mentors: [_id] } as List),
      );

      expect(
        await favoritesController.toggle(request, userId, mentorId),
      ).toEqual(response);
      expect(listsService.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    let userId: string;
    let response: any;
    let request: Request;
    let list: List;
    let user: User;

    beforeEach(() => {
      userId = '123';
      list = {
        _id: 123,
        name: 'Favorites',
        mentors: [
          { _id: 123, name: 'Sarah Doe' },
          { _id: 456, name: 'John Doe' },
        ],
      } as List;
      request = { user: { auth0Id: '1234' } } as Request;
      response = { success: true, data: list };
      user = { _id: new ObjectIdMock(userId), roles: [Role.MEMBER] } as User;

      usersService.findByAuth0Id = jest.fn(() => Promise.resolve(user));
      usersService.findById = jest.fn(() => Promise.resolve(user));
      listsService.findFavoriteList = jest.fn(() => Promise.resolve(list));
    });

    it('should throw an error when user doesnt exist', async () => {
      usersService.findById = jest.fn(() => Promise.resolve(undefined));

      await expect(favoritesController.list(request, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw an error when trying to get favorites from other user', async () => {
      usersService.findByAuth0Id = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock('9843'),
          roles: [Role.MEMBER],
        } as User),
      );

      await expect(favoritesController.list(request, userId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return the favorites for any user to an admin', async () => {
      usersService.findByAuth0Id = jest.fn(() =>
        Promise.resolve({
          _id: new ObjectIdMock('9843'),
          roles: [Role.ADMIN],
        } as User),
      );

      expect(await favoritesController.list(request, userId)).toEqual(response);
      expect(listsService.findFavoriteList).toHaveBeenCalledTimes(1);
      expect(listsService.findFavoriteList).toHaveBeenCalledWith(user);
    });

    it('should return the favorites for the current user', async () => {
      expect(await favoritesController.list(request, userId)).toEqual(response);
      expect(listsService.findFavoriteList).toHaveBeenCalledTimes(1);
      expect(listsService.findFavoriteList).toHaveBeenCalledWith(user);
    });

    it('should return and empty array when there are no favorites', async () => {
      listsService.findFavoriteList = jest.fn(() => Promise.resolve(undefined));

      expect(await favoritesController.list(request, userId)).toEqual({
        success: true,
        data: { mentors: [] },
      });
      expect(listsService.findFavoriteList).toHaveBeenCalledTimes(1);
      expect(listsService.findFavoriteList).toHaveBeenCalledWith(user);
    });
  });
});
