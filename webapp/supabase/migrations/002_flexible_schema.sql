-- Migration 002: Add flexible schema support for multi-job dashboard
-- This migration transforms the BBB-specific scraper into a flexible multi-job system

-- 1. Create scraper_scripts table to store generated code and metadata
CREATE TABLE IF NOT EXISTS scraper_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    url TEXT NOT NULL,
    generated_code TEXT NOT NULL,
    requirements JSONB NOT NULL, -- Parsed requirements from prompt
    tool_type TEXT NOT NULL CHECK (tool_type IN ('stagehand', 'playwright', 'hybrid')),
    output_schema JSONB NOT NULL, -- Expected output fields and types
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    dependencies TEXT[], -- NPM packages required
    explanation TEXT -- Explanation of the approach
);

-- 2. Add new fields to scraping_jobs for prompt-based generation
ALTER TABLE scraping_jobs 
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS script_id UUID,
ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0; -- Rename from total_companies for genericity

-- 3. Add foreign key constraint linking jobs to scripts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_scraper_script' 
        AND table_name = 'scraping_jobs'
    ) THEN
        ALTER TABLE scraping_jobs 
        ADD CONSTRAINT fk_scraper_script 
        FOREIGN KEY (script_id) REFERENCES scraper_scripts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Create scraped_data table for flexible data storage
-- This replaces the companies table for new flexible jobs
CREATE TABLE IF NOT EXISTS scraped_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraping_job_id UUID NOT NULL REFERENCES scraping_jobs(id) ON DELETE CASCADE,
    data JSONB NOT NULL, -- Flexible data structure based on job's output schema
    data_hash TEXT, -- Hash of data for deduplication
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Add indexes for new tables and columns
CREATE INDEX IF NOT EXISTS idx_scraper_scripts_created_at ON scraper_scripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_scripts_title ON scraper_scripts(title);
CREATE INDEX IF NOT EXISTS idx_scraper_scripts_url ON scraper_scripts(url);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_script_id ON scraping_jobs(script_id);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_title ON scraping_jobs(title);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_prompt ON scraping_jobs USING gin(to_tsvector('english', prompt));

CREATE INDEX IF NOT EXISTS idx_scraped_data_job_id ON scraped_data(scraping_job_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_created_at ON scraped_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_data_hash ON scraped_data(data_hash);
CREATE INDEX IF NOT EXISTS idx_scraped_data_content ON scraped_data USING gin(data);

-- 6. Enable Row Level Security for new tables
ALTER TABLE scraper_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_data ENABLE ROW LEVEL SECURITY;

-- 7. Create policies for new tables (public access for demo)
CREATE POLICY "Enable read access for all users" ON scraper_scripts FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON scraper_scripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON scraper_scripts FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON scraped_data FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON scraped_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON scraped_data FOR UPDATE USING (true);

-- 8. Create function to update total_items count for flexible data
CREATE OR REPLACE FUNCTION update_total_items_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update count for both companies (legacy) and scraped_data (new)
        UPDATE scraping_jobs 
        SET total_items = (
            SELECT COALESCE(
                (SELECT COUNT(*) FROM companies WHERE scraping_job_id = NEW.scraping_job_id), 0
            ) + COALESCE(
                (SELECT COUNT(*) FROM scraped_data WHERE scraping_job_id = NEW.scraping_job_id), 0
            )
        )
        WHERE id = NEW.scraping_job_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE scraping_jobs 
        SET total_items = (
            SELECT COALESCE(
                (SELECT COUNT(*) FROM companies WHERE scraping_job_id = OLD.scraping_job_id), 0
            ) + COALESCE(
                (SELECT COUNT(*) FROM scraped_data WHERE scraping_job_id = OLD.scraping_job_id), 0
            )
        )
        WHERE id = OLD.scraping_job_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 9. Create triggers for new scraped_data table
CREATE TRIGGER trigger_update_items_count_insert_scraped_data
    AFTER INSERT ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_total_items_count();

CREATE TRIGGER trigger_update_items_count_delete_scraped_data
    AFTER DELETE ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_total_items_count();

-- 10. Update existing triggers to use new function
DROP TRIGGER IF EXISTS trigger_update_companies_count_insert ON companies;
DROP TRIGGER IF EXISTS trigger_update_companies_count_delete ON companies;

CREATE TRIGGER trigger_update_items_count_insert_companies
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_total_items_count();

CREATE TRIGGER trigger_update_items_count_delete_companies
    AFTER DELETE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_total_items_count();

-- 11. Create view for unified data access across legacy and new schemas
CREATE OR REPLACE VIEW unified_job_results AS
SELECT 
    sj.id as job_id,
    sj.title,
    sj.prompt,
    sj.url,
    sj.status,
    sj.created_at,
    sj.completed_at,
    sj.total_items,
    sj.execution_time,
    sj.errors,
    ss.output_schema,
    ss.tool_type,
    CASE 
        WHEN sj.script_id IS NOT NULL THEN 'flexible'
        ELSE 'legacy'
    END as job_type
FROM scraping_jobs sj
LEFT JOIN scraper_scripts ss ON sj.script_id = ss.id
ORDER BY sj.created_at DESC;

-- 12. Create function to get job results in unified format
CREATE OR REPLACE FUNCTION get_job_results(job_uuid UUID)
RETURNS TABLE(
    item_id UUID,
    job_id UUID,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    data_type TEXT
) AS $$
BEGIN
    -- Return both legacy companies and new flexible data
    RETURN QUERY
    SELECT 
        c.id as item_id,
        c.scraping_job_id as job_id,
        jsonb_build_object(
            'name', c.name,
            'phone', c.phone,
            'principal_contact', c.principal_contact,
            'url', c.url,
            'street_address', c.street_address,
            'accreditation_status', c.accreditation_status
        ) as data,
        c.created_at,
        'company'::TEXT as data_type
    FROM companies c 
    WHERE c.scraping_job_id = job_uuid
    
    UNION ALL
    
    SELECT 
        sd.id as item_id,
        sd.scraping_job_id as job_id,
        sd.data,
        sd.created_at,
        'flexible'::TEXT as data_type
    FROM scraped_data sd 
    WHERE sd.scraping_job_id = job_uuid
    
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 13. Add comments for documentation
COMMENT ON TABLE scraper_scripts IS 'Stores generated scraping code and metadata for each unique prompt/URL combination';
COMMENT ON TABLE scraped_data IS 'Flexible data storage for scraping results with variable schemas';
COMMENT ON COLUMN scraping_jobs.prompt IS 'Natural language prompt used to generate the scraper';
COMMENT ON COLUMN scraping_jobs.title IS 'Human-readable title for the scraping job';
COMMENT ON COLUMN scraping_jobs.script_id IS 'Reference to the generated scraper script';
COMMENT ON COLUMN scraper_scripts.output_schema IS 'JSON schema defining expected output fields and types';
COMMENT ON COLUMN scraped_data.data IS 'Actual scraped data in flexible JSON format';
COMMENT ON FUNCTION get_job_results(UUID) IS 'Returns unified results for both legacy companies and new flexible data'; 