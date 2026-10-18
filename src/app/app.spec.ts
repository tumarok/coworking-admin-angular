import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('creates the root component', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeInstanceOf(App);
  });
});
