/**
 * Test Configuration
 * 
 * This file contains all test-related data including:
 * - UI automation test scenarios
 * - Test endpoints and routes
 * - Test utilities and helpers
 */

/**
 * UI Automation Test Scenarios
 * 
 * Define test scenarios that automate UI interactions and verify expected elements.
 * Each test specifies:
 * - name: Test identifier
 * - description: What the test does
 * - tapBounds: Screen coordinates to tap (e.g., "[0,2028][216,2047]")
 * - waitMs: Milliseconds to wait after tap before verification
 * - expectedElements: Array of elements to verify using XPath
 *   - xpath: XPath expression (e.g., "//node[@text='Total Rewards']")
 *   - description: Human-readable description
 *   - text: Expected text value (optional, for verification)
 */
export const UI_TESTS = [
  {
    name: "Home Button Test",
    description: "Tap Home button and verify main screen elements appear",
    tapBounds: "[0,2028][216,2047]", // Home button (leftmost navigation)
    waitMs: 2000,
    expectedElements: [
      { xpath: "//node[@text='Total Rewards']", description: "Total Rewards text", text: "Total Rewards" },
      { xpath: "//node[@text='Proof of Work']", description: "Proof of Work section", text: "Proof of Work" },
      { xpath: "//node[@text='Daily Rewards']", description: "Daily Rewards text", text: "Daily Rewards" },
      { xpath: "//node[@text='Validation Node']/following-sibling::node[@index='12']", description: "Validation Node status (Connected)", text: "Connected" },
      { xpath: "//node[@text='Switch Node']/following-sibling::node[@index='14']", description: "Switch Node status (Connected)", text: "Connected" }
    ]
  }
];

/**
 * Test Endpoints Configuration
 * 
 * Defines the routes and handlers for test-related endpoints.
 * These are registered in server.js but configured here for easier management.
 */
export const TEST_ENDPOINTS = {
  // UI Test endpoints
  UI_TEST: {
    basePath: '/ui-test',
    routes: {
      DUMP: '/dump/:deviceId',
      RUN: '/run/:deviceId/:testName',
      LIST: '/list'
    }
  },
  
  // Telegram test endpoints
  TELEGRAM_TEST: {
    basePath: '/telegram',
    routes: {
      TEST: '/test'
    }
  }
};

/**
 * Test Utilities
 */
export const TEST_UTILS = {
  // Default timeout for test operations (ms)
  DEFAULT_TIMEOUT: 30000,
  
  // Wait time between test steps (ms)
  STEP_DELAY: 1000,
  
  // Retry configuration
  RETRY: {
    maxAttempts: 3,
    delayMs: 2000
  }
};
