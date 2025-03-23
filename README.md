# URL Shortener API

A robust URL shortening service built with Express.js and PostgreSQL. This service allows you to create shortened URLs with optional custom aliases, track usage statistics, and manage redirections.

## Features

- URL Shortening with custom aliases
- Usage statistics tracking
- Fast redirections
- PostgreSQL persistence
- Duplicate URL detection
- Custom alias support
- Input validation and sanitization

## Installation

1. Clone the repository:
```bash
git clone https://github.com/varshaa17/giva_urlshortener
cd giva_urlshortener
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment file and configure it:
```bash
cp .env.example .env
```

4. Update the `.env` file with your PostgreSQL database credentials.

5. Start the server:
```bash
npm start
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:
- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: PostgreSQL connection string

## API Endpoints

### 1. Shorten URL
```http
POST /shorten
```
Query Parameters:
- `alias` (optional): Custom alias for the shortened URL (3-30 characters)

Request Body:
```json
{
  "url": "https://example.com/very-long-url"
}
```

### 2. Access Shortened URL
```http
GET /:code
```
Redirects to the original URL

### 3. Get URL Statistics
```http
GET /stats/:code
```
Returns usage statistics for the shortened URL

### 4. Health Check
```http
GET /health
```
Returns server health status

## Database Schema

The service uses a PostgreSQL database with the following schema:

```sql
CREATE TABLE urls (
  id SERIAL PRIMARY KEY,
  original_url TEXT NOT NULL,
  short_code VARCHAR(10) NOT NULL UNIQUE,
  alias VARCHAR(30) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE
);
```




