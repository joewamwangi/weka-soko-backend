/**
 * Weka Soko - Base Agent Class
 * All agents extend this base class
 */

const axios = require('axios');

class BaseAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      groqApiKey: process.env.GROQ_API_KEY,
      huggingFaceKey: process.env.HUGGINGFACE_API_KEY,
      maxRetries: 3,
      timeout: 30000,
      ...config
    };
    
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      tokensUsed: 0
    };
  }

  /**
   * Main processing method - must be implemented by subclasses
   * @param {string} eventType - Type of event
   * @param {Object} payload - Event data
   * @returns {Promise<Object>} Processing result
   */
  async process(eventType, payload) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * Call Groq API (free tier)
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async callGroq(prompt, options = {}) {
    const { model = 'llama3-8b-8192', jsonMode = true, temperature = 0.3 } = options;
    
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          response_format: jsonMode ? { type: 'json_object' } : undefined,
          max_tokens: 1024
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.groqApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.config.timeout
        }
      );

      this.stats.totalCalls++;
      this.stats.successfulCalls++;
      this.stats.tokensUsed += response.data.usage?.total_tokens || 0;

      return {
        success: true,
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
        duration: Date.now() - startTime
      };
    } catch (error) {
      this.stats.totalCalls++;
      this.stats.failedCalls++;
      
      console.error(`[${this.name}] Groq API error:`, error.message);
      throw error;
    }
  }

  /**
   * Call Hugging Face Inference API (free, rate-limited)
   * @param {string} model - Model ID
   * @param {Object} inputs - Model inputs
   * @returns {Promise<Object>} API response
   */
  async callHuggingFace(model, inputs) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${model}`,
        { inputs },
        {
          headers: {
            'Authorization': `Bearer ${this.config.huggingFaceKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        result: response.data,
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error(`[${this.name}] HF API error:`, error.message);
      throw error;
    }
  }

  /**
   * Create text embedding (local-like via HF)
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} Embedding vector
   */
  async createEmbedding(text) {
    return this.callHuggingFace(
      'sentence-transformers/all-MiniLM-L6-v2',
      text
    );
  }

  /**
   * Classify sentiment (free via HF)
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} Sentiment analysis
   */
  async analyzeSentiment(text) {
    return this.callHuggingFace(
      'distilbert-base-uncased-finetuned-sst-2-english',
      text
    );
  }

  /**
   * Check if agent is healthy
   * @returns {boolean}
   */
  isHealthy() {
    return this.stats.failedCalls < this.stats.successfulCalls * 0.5; // < 50% failure rate
  }

  /**
   * Get agent statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalCalls > 0 
        ? (this.stats.successfulCalls / this.stats.totalCalls * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Format price for Kenyan market
   * @param {number} amount - Amount in KSh
   * @returns {string} Formatted price
   */
  formatPrice(amount) {
    return `KSh ${amount.toLocaleString('en-KE')}`;
  }

  /**
   * Parse JSON safely
   * @param {string} jsonString - JSON string
   * @param {Object} defaultValue - Default if parsing fails
   * @returns {Object} Parsed JSON
   */
  safeParseJSON(jsonString, defaultValue = {}) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`[${this.name}] JSON parse error:`, error);
      return defaultValue;
    }
  }
}

module.exports = BaseAgent;
