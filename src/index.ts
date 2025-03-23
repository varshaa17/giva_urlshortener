import express, { Request, Response, RequestHandler } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import { body, param, query, validationResult } from 'express-validator';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
});

// Initialize the database
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create URL table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        original_url TEXT NOT NULL,
        short_code VARCHAR(10) NOT NULL UNIQUE,
        alias VARCHAR(30) UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        last_accessed TIMESTAMP WITH TIME ZONE
      );
      
      CREATE INDEX IF NOT EXISTS idx_original_url ON urls(original_url);
      CREATE INDEX IF NOT EXISTS idx_short_code ON urls(short_code);
      CREATE INDEX IF NOT EXISTS idx_alias ON urls(alias);
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Generate a short code for a URL
function generateShortCode(url: string, length: number = 7): string {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return hash.substring(0, length);
}

// Validate URL format
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
}

// API endpoint to shorten URL
app.post('/shorten', [
  body('url').notEmpty().withMessage('URL is required'),
  query('alias').optional().isLength({ min: 3, max: 30 }).withMessage('Alias must be between 3 and 30 characters')
], (async (req: Request, res: Response) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { url } = req.body;
  const alias = req.query.alias as string | undefined;

  // Validate URL format
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const client = await pool.connect();
  try {
    // Check if URL already exists
    const shortCode = generateShortCode(url);
    const existingUrlQuery = await client.query(
      'SELECT short_code, alias FROM urls WHERE original_url = $1',
      [url]
    );

    // If URL already exists, return the existing short code
    if (existingUrlQuery.rowCount && existingUrlQuery.rowCount > 0) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const existingAlias = existingUrlQuery.rows[0].alias;
      const path = existingAlias || existingUrlQuery.rows[0].short_code;
      
      return res.status(200).json({
        original_url: url,
        short_url: `${baseUrl}/${path}`,
        message: 'URL already exists'
      });
    }

    // Check if alias is provided and not already taken
    if (alias) {
      const aliasQuery = await client.query(
        'SELECT id FROM urls WHERE alias = $1',
        [alias]
      );
      
      if (aliasQuery.rowCount && aliasQuery.rowCount > 0) {
        return res.status(409).json({ error: 'Alias already in use' });
      }
    }

    // Insert new URL
    const insertQuery = await client.query(
      'INSERT INTO urls (original_url, short_code, alias) VALUES ($1, $2, $3) RETURNING short_code, alias',
      [url, shortCode, alias || null]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const path = alias || shortCode;
    
    res.status(201).json({
      original_url: url,
      short_url: `${baseUrl}/${path}`
    });
  } catch (err) {
    console.error('Error creating short URL:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}) as RequestHandler);

// Redirect endpoint
app.get('/:code', (async (req: Request, res: Response) => {
  const code = req.params.code;
  
  const client = await pool.connect();
  try {
    // Try to find by alias first, then by short code
    const query = await client.query(
      `SELECT id, original_url FROM urls WHERE alias = $1 OR short_code = $1`,
      [code]
    );

    if (query.rowCount === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Update access count and last accessed timestamp
    await client.query(
      `UPDATE urls SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE id = $1`,
      [query.rows[0].id]
    );

    // Redirect to the original URL
    res.redirect(query.rows[0].original_url);
  } catch (err) {
    console.error('Error redirecting:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}) as RequestHandler);

// Statistics endpoint
app.get('/stats/:code', (async (req: Request, res: Response) => {
  const code = req.params.code;
  
  const client = await pool.connect();
  try {
    const query = await client.query(
      `SELECT original_url, short_code, alias, created_at, access_count, last_accessed 
       FROM urls WHERE alias = $1 OR short_code = $1`,
      [code]
    );

    if (query.rowCount === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }

    res.json({
      stats: query.rows[0]
    });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}) as RequestHandler);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`Server running on port ${PORT}`);
});

export default app;