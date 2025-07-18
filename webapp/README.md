# BBB Medical Billing Scraper - Web Application

A modern, full-stack web application that scrapes A-rated Medical Billing companies from the Better Business Bureau and stores them in a Supabase database with a beautiful React frontend.

## 🎯 Features

- **Modern Web Interface**: Clean, responsive UI built with Next.js and Tailwind CSS
- **Real-time Scraping**: LLM-powered web scraping using Stagehand for intelligent data extraction
- **Database Storage**: Persistent storage using Supabase with real-time updates
- **Job Management**: Track scraping jobs with status monitoring and error handling
- **Data Visualization**: Interactive tables with search, filtering, and detailed company information
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js UI   │────│   API Routes    │────│   Supabase DB   │
│                 │    │                 │    │                 │
│ • React Forms   │    │ • Scraper API   │    │ • Companies     │
│ • Data Tables   │    │ • Database API  │    │ • Scraping Jobs │
│ • Job History   │    │ • Error Handler │    │ • Job History   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │ Stagehand       │
                       │ LLM Scraper     │
                       │                 │
                       │ • BBB Navigator │
                       │ • Data Extract  │
                       │ • URL Discovery │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- A Supabase project
- An LLM API key (OpenAI or Anthropic)

### 1. Set up Supabase Database

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the migration script:

```sql
-- Run the content from supabase/migrations/001_initial_schema.sql
-- This creates the necessary tables, indexes, and policies
```

3. Get your Supabase credentials:
   - Project URL (found in Settings > API)
   - Anon Key (found in Settings > API)
   - Service Role Key (found in Settings > API)

### 2. Install Dependencies

```bash
# Clone and navigate to the webapp directory
cd webapp

# Install dependencies
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the webapp directory:

```bash
# Copy the example and fill in your credentials
cp env.example .env.local

# Edit .env.local with your actual values:
# OPENAI_API_KEY=sk-...
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Run the Application

```bash
# Start the development server
npm run dev

# Open http://localhost:3000
```

## 📋 Database Schema

### `scraping_jobs` Table
- `id` (UUID, Primary Key)
- `url` (TEXT) - BBB search URL
- `status` (TEXT) - pending | running | completed | failed
- `created_at` (TIMESTAMP)
- `completed_at` (TIMESTAMP, nullable)
- `total_companies` (INTEGER) - Auto-updated via triggers
- `execution_time` (INTEGER) - Duration in milliseconds
- `errors` (JSONB) - Array of error messages

### `companies` Table
- `id` (UUID, Primary Key)
- `scraping_job_id` (UUID, Foreign Key)
- `name` (TEXT) - Company name
- `phone` (TEXT, nullable) - Formatted as +1XXXXXXXXXX
- `principal_contact` (TEXT, nullable) - Contact person
- `url` (TEXT) - BBB profile URL
- `street_address` (TEXT, nullable) - Full address
- `accreditation_status` (TEXT, nullable) - BBB rating (A+, A, etc.)
- `created_at` (TIMESTAMP)

## 🎮 How to Use

### 1. Start a Scraping Job

1. Navigate to the "Start Scraping" tab
2. Enter a BBB search URL (or use the provided examples)
3. Click "Start Scraping"
4. Monitor the progress and results

**Example URLs:**
- Default: Medical Billing (A-rated, specific categories)
- Extended: Medical Billing (A-rated, all subcategories)

### 2. View Scraped Companies

1. Go to the "Companies" tab
2. Browse all scraped companies in an interactive table
3. Use the search bar to filter by name, phone, contact, address, or status
4. Click company links to view BBB profiles
5. View summary statistics at the bottom

### 3. Monitor Job History

1. Visit the "Job History" tab
2. See all scraping jobs with their status and results
3. View detailed error messages for failed jobs
4. Click "View Results" to see companies from specific jobs

## 📡 API Endpoints

### `POST /api/scrape`
Start a new scraping job.

**Request:**
```json
{
  "url": "https://www.bbb.org/search?filter_category=..."
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "result": {
    "totalFound": 25,
    "executionTime": 45000,
    "errors": []
  }
}
```

### `GET /api/scrape`
Get scraping job history.

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "url": "...",
      "status": "completed",
      "total_companies": 25,
      "execution_time": 45000,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### `GET /api/companies`
Get companies with optional filtering.

**Query Parameters:**
- `jobId` - Filter by specific job
- `search` - Search by name
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "companies": [
    {
      "id": "uuid",
      "name": "ABC Medical Billing",
      "phone": "+12345678901",
      "principal_contact": "John Smith",
      "url": "https://www.bbb.org/us/ca/profile/...",
      "street_address": "123 Main St, City, State",
      "accreditation_status": "A+",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## 🛠️ Development

### Project Structure

```
webapp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── scrape/route.ts      # Scraping API
│   │   │   └── companies/route.ts   # Companies API
│   │   ├── globals.css              # Global styles
│   │   ├── layout.tsx               # Root layout
│   │   └── page.tsx                 # Main page
│   ├── components/
│   │   ├── ScrapingForm.tsx         # URL submission form
│   │   ├── CompaniesTable.tsx       # Data display table
│   │   └── JobsHistory.tsx          # Job management
│   └── lib/
│       ├── supabase.ts              # Database client
│       └── scraper/                 # Scraper integration
│           ├── index.ts             # Main scraper API
│           ├── types.ts             # Type definitions
│           ├── utils.ts             # Utility functions
│           └── stagehand-scraper.ts # Core scraper
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Database schema
├── env.example                      # Environment template
├── package.json
└── README.md
```

### Key Technologies

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Stagehand (LLM-powered browser automation)
- **UI Components**: Lucide React (icons), Custom Tailwind components
- **Validation**: Zod schemas

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## 🔧 Configuration

### Scraper Settings

The scraper is configured for web app usage with reasonable defaults:

- **Pages**: Limited to 3 pages (configurable)
- **Rate Limiting**: 1 request per second (demo-friendly)
- **Timeout**: 60 seconds per page
- **Output**: Direct database storage (no CSV files)

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for Stagehand | Yes* |
| `ANTHROPIC_API_KEY` | Anthropic API key for Stagehand | Yes* |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |

*At least one LLM API key is required

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically

### Other Platforms

The app works on any platform that supports Next.js:
- Netlify
- Railway
- Render
- Self-hosted with Docker

## 🔍 Troubleshooting

### Common Issues

**Scraper fails with authentication errors:**
- Verify your LLM API keys are correct
- Check API key permissions and quotas

**Database connection errors:**
- Verify Supabase URL and keys
- Check database schema is properly set up
- Ensure Row Level Security policies allow access

**Scraping hangs or times out:**
- BBB may have anti-bot protection
- Try reducing the number of pages
- Check your internet connection

**No companies found:**
- Verify the BBB URL is correct and accessible
- Check the URL returns search results in a browser
- Some categories may have no A-rated companies

### Getting Help

1. Check the browser console for errors
2. Review the job history for detailed error messages
3. Verify all environment variables are set
4. Ensure the Supabase database schema is correctly applied

## 📊 Performance

- **Scraping Speed**: ~2-3 companies per minute (due to rate limiting)
- **Database**: Optimized with indexes for fast queries
- **UI**: Server-side rendering with client-side hydration
- **Responsive**: Sub-second page loads for typical datasets

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [Stagehand](https://github.com/browserbase/stagehand) for LLM-powered web scraping
- [Supabase](https://supabase.com) for the database and real-time features
- [Next.js](https://nextjs.org) for the full-stack framework
- [Tailwind CSS](https://tailwindcss.com) for the styling system
