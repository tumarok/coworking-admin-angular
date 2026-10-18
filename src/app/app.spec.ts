import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import { App } from './app';

@Component({ template: '<h1>Home page</h1>' })
class Home {}

@Component({ template: '<h1>Other page</h1>' })
class Other {}

describe('App', () => {
  it('creates the root component', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeInstanceOf(App);
  });

  it('renders the component of the matched route', async () => {
    await render(App, { providers: provideTestApp([{ path: '', component: Home }]) });

    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
  });

  it('swaps the rendered component when the route changes', async () => {
    await render(App, {
      providers: provideTestApp([
        { path: '', component: Home },
        { path: 'other', component: Other },
      ]),
    });
    await screen.findByRole('heading', { name: 'Home page' });

    await TestBed.inject(Router).navigateByUrl('/other');

    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home page' })).not.toBeInTheDocument();
  });
});
