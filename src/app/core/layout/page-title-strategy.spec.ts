import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy } from '@angular/router';
import { provideTestApp } from '@testing/test-providers';
import { PageTitleStrategy } from './page-title-strategy';

@Component({ template: '' })
class Page {}

describe('PageTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTestApp([
          { path: 'rooms', component: Page, title: 'Rooms' },
          {
            path: 'members',
            title: 'Members',
            children: [{ path: ':id', component: Page, title: 'Member' }],
          },
          { path: 'plain', component: Page },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
  });

  const titleAfter = async (url: string) => {
    await TestBed.inject(Router).navigateByUrl(url);
    return TestBed.inject(Title).getTitle();
  };

  it('puts the app name after the title of the page', async () => {
    expect(await titleAfter('/rooms')).toBe('Rooms · Coworking Admin');
  });

  it('uses the title of the deepest route that has one', async () => {
    expect(await titleAfter('/members/m1')).toBe('Member · Coworking Admin');
  });

  it('is just the app name for a page without a title', async () => {
    expect(await titleAfter('/plain')).toBe('Coworking Admin');
  });
});
