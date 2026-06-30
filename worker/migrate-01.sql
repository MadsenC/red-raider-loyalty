-- Migration 01: tier, sport_category, draw_at, draw_run
ALTER TABLE events ADD COLUMN tier TEXT;             -- '1' | '2' | '3' | 'sellout'
ALTER TABLE events ADD COLUMN sport_category TEXT DEFAULT 'other'; -- 'football_mbb' | 'other'
ALTER TABLE events ADD COLUMN draw_at TEXT;          -- ISO datetime for auto-draw
ALTER TABLE events ADD COLUMN draw_run INTEGER DEFAULT 0; -- 1 once auto-draw has fired
