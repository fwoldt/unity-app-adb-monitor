/**
 * LineBuffer - Handles partial lines from streaming data
 * Accumulates data chunks and returns complete lines only
 */
export class LineBuffer {
  constructor() {
    this.buffer = '';
  }

  /**
   * Push new data chunk and return complete lines
   * @param {string} chunk - New data chunk
   * @returns {string[]} Array of complete lines
   */
  push(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    
    // Keep the last (potentially incomplete) line in buffer
    this.buffer = lines.pop() || '';
    
    return lines;
  }

  /**
   * Flush remaining buffer content
   * @returns {string|null} Remaining buffer content or null if empty
   */
  flush() {
    const remaining = this.buffer;
    this.buffer = '';
    return remaining || null;
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = '';
  }

  /**
   * Get current buffer size
   * @returns {number} Buffer length in characters
   */
  size() {
    return this.buffer.length;
  }
}
