-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create scraping_jobs table
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_companies INTEGER DEFAULT 0,
    execution_time INTEGER, -- in milliseconds
    errors JSONB
);

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraping_job_id UUID NOT NULL REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    principal_contact TEXT,
    url TEXT NOT NULL,
    street_address TEXT,
    accreditation_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_created_at ON scraping_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_companies_scraping_job_id ON companies(scraping_job_id);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_name_search ON companies USING gin(to_tsvector('english', name));

-- Enable Row Level Security (RLS)
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your use case)
CREATE POLICY "Enable read access for all users" ON scraping_jobs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON scraping_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON scraping_jobs FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON companies FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON companies FOR UPDATE USING (true);

-- Create a function to update the total_companies count
CREATE OR REPLACE FUNCTION update_total_companies_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE scraping_jobs 
        SET total_companies = (
            SELECT COUNT(*) 
            FROM companies 
            WHERE scraping_job_id = NEW.scraping_job_id
        )
        WHERE id = NEW.scraping_job_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE scraping_jobs 
        SET total_companies = (
            SELECT COUNT(*) 
            FROM companies 
            WHERE scraping_job_id = OLD.scraping_job_id
        )
        WHERE id = OLD.scraping_job_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update company counts
CREATE TRIGGER trigger_update_companies_count_insert
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_total_companies_count();

CREATE TRIGGER trigger_update_companies_count_delete
    AFTER DELETE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_total_companies_count(); 