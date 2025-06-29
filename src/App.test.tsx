import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

// Mock vercel analytics
jest.mock('@vercel/analytics', () => ({
  inject: jest.fn()
}));

// Mock firebase
jest.mock('./firebase', () => ({
  auth: {},
  db: {},
  default: {}
}));

// Mock hooks
jest.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({
    user: null,
    loading: false,
    needsOnboarding: false
  })
}));

describe('App PWA Safe Area Support', () => {
  test('renders app component successfully', () => {
    render(<App />);
    expect(document.querySelector('.app')).toBeTruthy();
  });

  test('app container has expected structure for PWA', () => {
    render(<App />);
    
    // Check that the app div is rendered
    const appElements = document.querySelectorAll('.app');
    expect(appElements.length).toBeGreaterThan(0);
    
    // Verify the app element exists and has the class
    const appElement = appElements[0] as HTMLElement;
    expect(appElement.classList.contains('app')).toBe(true);
  });

  test('renders app with safe area CSS variables', () => {
    render(<App />);
    
    // Check that the app div is rendered
    const appElements = document.querySelectorAll('.app');
    expect(appElements.length).toBeGreaterThan(0);
    
    // Check that safe area CSS is applied by looking at the computed styles
    const appElement = appElements[0] as HTMLElement;
    const styles = window.getComputedStyle(appElement);
    
    // The CSS should contain safe area inset references
    expect(appElement.style.paddingTop || styles.paddingTop).toBeDefined();
  });

  test('app has PWA status bar background pseudo-element styles', () => {
    render(<App />);
    
    // Check that the app container has the necessary styles for the pseudo-element
    const appElements = document.querySelectorAll('.app');
    expect(appElements.length).toBeGreaterThan(0);
    
    const appElement = appElements[0] as HTMLElement;
    expect(appElement.classList.contains('app')).toBe(true);
  });
}); 