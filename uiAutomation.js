import { execSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import logger from './logger.js';

/**
 * Dump UI hierarchy from device using uiautomator
 * @param {string} deviceId - Device ID
 * @returns {string} XML content of UI hierarchy
 */
export function dumpUI(deviceId) {
    try {
        logger.debug(`Dumping UI hierarchy for device ${deviceId}`);

        // Dump UI to device storage
        execSync(`adb -s ${deviceId} shell uiautomator dump`, { encoding: 'utf8' });

        // Pull the XML file content
        const xmlContent = execSync(`adb -s ${deviceId} shell cat /sdcard/window_dump.xml`, { encoding: 'utf8' });

        logger.debug(`UI dump successful for device ${deviceId}, XML length: ${xmlContent.length}`);
        return xmlContent;
    } catch (error) {
        logger.error(`Failed to dump UI for device ${deviceId}: ${error.message}`);
        throw error;
    }
}

/**
 * Parse XML and find element by bounds
 * @param {string} xmlContent - UI dump XML content
 * @param {string} bounds - Bounds string e.g. "[0,2028][216,2047]"
 * @returns {object|null} Element object or null if not found
 */
export function findElementByBounds(xmlContent, bounds) {
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: ''
        });

        const parsed = parser.parse(xmlContent);

        // Recursively search for element with matching bounds
        function searchNode(node, path = '') {
            if (!node) return null;

            if (node.bounds === bounds) {
                logger.debug(`Found element at path: ${path}`);
                return node;
            }

            // Search in node children
            if (node.node) {
                if (Array.isArray(node.node)) {
                    for (let i = 0; i < node.node.length; i++) {
                        const child = node.node[i];
                        const found = searchNode(child, `${path}/node[${i}]`);
                        if (found) return found;
                    }
                } else {
                    return searchNode(node.node, `${path}/node`);
                }
            }

            return null;
        }

        const element = searchNode(parsed.hierarchy, '/hierarchy');
        if (element) {
            logger.debug(`Found element with bounds ${bounds}: ${JSON.stringify(element).substring(0, 200)}`);
        } else {
            logger.warn(`Element not found with bounds ${bounds}`);
        }

        return element;
    } catch (error) {
        logger.error(`Failed to parse XML or find element: ${error.message}`);
        return null;
    }
}

/**
 * Parse XML and find element by XPath
 * @param {string} xmlContent - UI dump XML content
 * @param {string} xpath - XPath expression e.g. "//node[@text='Total Rewards']" or "//node[@text='Validation Node']/following-sibling::node[@index='12']"
 * @returns {object|null} Element object or null if not found
 */
export function findElementByXPath(xmlContent, xpath) {
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: ''
        });

        const parsed = parser.parse(xmlContent);

        // Support simple XPath patterns: //node[@attribute='value']
        const simpleAttrMatch = xpath.match(/^\/\/node\[@([^=]+)=['"]([^'"]+)['"]\]$/);
        
        // Support following-sibling pattern: //node[@attribute='value']/following-sibling::node[@attribute='value']
        const followingSiblingMatch = xpath.match(/^\/\/node\[@([^=]+)=['"]([^'"]+)['"]\]\/following-sibling::node\[@([^=]+)=['"]([^'"]+)['"]\]$/);

        if (followingSiblingMatch) {
            const [, anchorAttr, anchorValue, siblingAttr, siblingValue] = followingSiblingMatch;
            
            // Find the anchor node first, then find its sibling
            function searchForAnchorAndSibling(node, parent = null, path = '') {
                if (!node) return null;

                // Check if current node matches the anchor condition
                if (node[anchorAttr] === anchorValue && parent) {
                    logger.debug(`Found anchor element at path: ${path} with ${anchorAttr}="${anchorValue}"`);
                    
                    // Now find the sibling with matching attribute in parent's children
                    if (parent.node && Array.isArray(parent.node)) {
                        const currentIndex = parent.node.indexOf(node);
                        
                        // Search through following siblings
                        for (let i = currentIndex + 1; i < parent.node.length; i++) {
                            const sibling = parent.node[i];
                            if (sibling[siblingAttr] === siblingValue) {
                                logger.debug(`Found sibling at index ${i} with ${siblingAttr}="${siblingValue}"`);
                                return sibling;
                            }
                        }
                    }
                    
                    logger.warn(`Anchor found but no matching sibling with ${siblingAttr}="${siblingValue}"`);
                    return null;
                }

                // Search in node children
                if (node.node) {
                    if (Array.isArray(node.node)) {
                        for (let i = 0; i < node.node.length; i++) {
                            const child = node.node[i];
                            const found = searchForAnchorAndSibling(child, node, `${path}/node[${i}]`);
                            if (found) return found;
                        }
                    } else {
                        return searchForAnchorAndSibling(node.node, node, `${path}/node`);
                    }
                }

                return null;
            }

            const element = searchForAnchorAndSibling(parsed.hierarchy, null, '/hierarchy');
            if (element) {
                logger.debug(`Found element with XPath ${xpath}: ${JSON.stringify(element).substring(0, 200)}`);
            } else {
                logger.warn(`Element not found with XPath ${xpath}`);
            }

            return element;
        } else if (simpleAttrMatch) {
            const [, attrName, attrValue] = simpleAttrMatch;

            // Recursively search for element with matching attribute
            function searchNode(node, path = '') {
                if (!node) return null;

                // Check if current node matches the attribute condition
                if (node[attrName] === attrValue) {
                    logger.debug(`Found element at path: ${path} with ${attrName}="${attrValue}"`);
                    return node;
                }

                // Search in node children
                if (node.node) {
                    if (Array.isArray(node.node)) {
                        for (let i = 0; i < node.node.length; i++) {
                            const child = node.node[i];
                            const found = searchNode(child, `${path}/node[${i}]`);
                            if (found) return found;
                        }
                    } else {
                        return searchNode(node.node, `${path}/node`);
                    }
                }

                return null;
            }

            const element = searchNode(parsed.hierarchy, '/hierarchy');
            if (element) {
                logger.debug(`Found element with XPath ${xpath}: ${JSON.stringify(element).substring(0, 200)}`);
            } else {
                logger.warn(`Element not found with XPath ${xpath}`);
            }

            return element;
        } else {
            logger.warn(`XPath pattern not supported: ${xpath}. Use format: //node[@attribute='value'] or //node[@attribute='value']/following-sibling::node[@attribute='value']`);
            return null;
        }
    } catch (error) {
        logger.error(`Failed to find element by XPath: ${error.message}`);
        return null;
    }
}

/**
 * Calculate center coordinates from bounds string
 * @param {string} bounds - Bounds string e.g. "[0,2028][216,2047]"
 * @returns {object} {x, y} center coordinates
 */
export function boundsToCenter(bounds) {
    // Parse bounds [x1,y1][x2,y2]
    const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) {
        throw new Error(`Invalid bounds format: ${bounds}`);
    }

    const [, x1, y1, x2, y2] = match.map(Number);
    const x = Math.floor((x1 + x2) / 2);
    const y = Math.floor((y1 + y2) / 2);

    return { x, y };
}

/**
 * Tap element at specific bounds
 * @param {string} deviceId - Device ID
 * @param {string} bounds - Bounds string e.g. "[0,2028][216,2047]"
 * @returns {boolean} Success status
 */
export function tapElement(deviceId, bounds) {
    try {
        const { x, y } = boundsToCenter(bounds);
        logger.info(`Tapping element at bounds ${bounds} -> coordinates (${x}, ${y}) on device ${deviceId}`);

        execSync(`adb -s ${deviceId} shell input tap ${x} ${y}`, { encoding: 'utf8' });

        logger.debug(`Tap successful at (${x}, ${y})`);
        return true;
    } catch (error) {
        logger.error(`Failed to tap element at bounds ${bounds}: ${error.message}`);
        return false;
    }
}

/**
 * Run a UI test scenario
 * @param {string} deviceId - Device ID
 * @param {object} testScenario - Test configuration object
 * @returns {object} Test result {success, message, details}
 */
export async function runTestScenario(deviceId, testScenario) {
    const result = {
        success: false,
        message: '',
        details: [],
        testName: testScenario.name,
        deviceId
    };

    try {
        logger.info(`Running UI test "${testScenario.name}" on device ${deviceId}`);

        // Step 0: Ensure app is launched
        result.details.push(`Step 0: Launching app io.unitynodes.unityapp`);
        try {
            execSync(`adb -s ${deviceId} shell monkey -p io.unitynodes.unityapp -c android.intent.category.LAUNCHER 1`, { encoding: 'utf8' });
            result.details.push(`✓ App launched successfully`);

            // Wait for app to fully load
            await new Promise(resolve => setTimeout(resolve, 3000));
            result.details.push(`✓ Waited 3s for app to load`);
        } catch (launchError) {
            result.message = `Failed to launch app: ${launchError.message}`;
            result.details.push(`✗ Launch failed: ${launchError.message}`);
            return result;
        }

        // Step 1: Tap the target element
        result.details.push(`Step 1: Tapping element at bounds ${testScenario.tapBounds}`);
        const tapSuccess = tapElement(deviceId, testScenario.tapBounds);

        if (!tapSuccess) {
            result.message = 'Failed to tap element';
            return result;
        }

        // Step 2: Wait for UI to update
        const waitMs = testScenario.waitMs || 2000;
        result.details.push(`Step 2: Waiting ${waitMs}ms for UI to update`);
        await new Promise(resolve => setTimeout(resolve, waitMs));

        // Step 3: Dump UI and verify expected elements
        result.details.push(`Step 3: Dumping UI to verify expected elements`);
        const xmlContent = dumpUI(deviceId);

        // Step 4: Check for expected elements
        const expectedElements = testScenario.expectedElements || [];
        const foundElements = [];
        const missingElements = [];

        for (const expected of expectedElements) {
            result.details.push(`Checking for: ${expected.description}`);

            const element = findElementByXPath(xmlContent, expected.xpath);

            if (element) {
                foundElements.push(expected);
                result.details.push(`✓ Found: ${expected.description || expected.xpath}`);

                // Optionally verify text content
                if (expected.text && element.text !== expected.text) {
                    missingElements.push(expected);
                    result.details.push(`✗ Text mismatch: expected "${expected.text}", found "${element.text}"`);
                }
            } else {
                missingElements.push(expected);
                result.details.push(`✗ Missing: ${expected.description || expected.xpath}`);
            }
        }

        // Determine test success
        if (missingElements.length === 0) {
            result.success = true;
            result.message = `Test passed: All ${foundElements.length} expected elements found`;
        } else {
            result.success = false;
            result.message = `Test failed: ${missingElements.length} of ${expectedElements.length} elements missing`;
        }

        logger.info(`Test "${testScenario.name}" completed: ${result.message}`);

    } catch (error) {
        result.success = false;
        result.message = `Test error: ${error.message}`;
        result.details.push(`Error: ${error.message}`);
        logger.error(`Test "${testScenario.name}" failed with error: ${error.message}`);
    }

    return result;
}
