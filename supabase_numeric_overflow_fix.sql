-- =====================================================
-- Supabase Database Schema Fix for Numeric Overflow
-- =====================================================
-- This script fixes the numeric field overflow issue by increasing
-- precision and scale for all numeric columns in the trades table
-- 
-- Error: "numeric field overflow" - precision 8, scale 4 must round 
-- to an absolute value less than 10^4
-- 
-- Solution: Increase precision to handle larger trading amounts
-- =====================================================

-- Begin transaction
BEGIN;

-- =====================================================
-- 1. ALTER TRADES TABLE - PRICE FIELDS
-- =====================================================
-- Increase precision for price fields from NUMERIC(8,4) to NUMERIC(12,4)
-- This allows values up to 99,999,999.9999 instead of 9,999.9999

ALTER TABLE trades ALTER COLUMN entry TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN avg_entry TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN sl TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN tsl TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN cmp TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN pyramid1_price TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN pyramid2_price TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit1_price TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit2_price TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit3_price TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN avg_exit_price TYPE NUMERIC(12,4);

-- =====================================================
-- 2. ALTER TRADES TABLE - QUANTITY FIELDS
-- =====================================================
-- Increase precision for quantity fields to handle large position sizes

ALTER TABLE trades ALTER COLUMN initial_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN pyramid1_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN pyramid2_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit1_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit2_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exit3_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN open_qty TYPE NUMERIC(12,4);
ALTER TABLE trades ALTER COLUMN exited_qty TYPE NUMERIC(12,4);

-- =====================================================
-- 3. ALTER TRADES TABLE - LARGE AMOUNT FIELDS
-- =====================================================
-- Increase precision for amount fields that can be very large

ALTER TABLE trades ALTER COLUMN position_size TYPE NUMERIC(15,4);
ALTER TABLE trades ALTER COLUMN realised_amount TYPE NUMERIC(15,4);
ALTER TABLE trades ALTER COLUMN pl_rs TYPE NUMERIC(15,4);

-- =====================================================
-- 4. ALTER TRADES TABLE - PERCENTAGE FIELDS
-- =====================================================
-- Increase precision for percentage fields to handle large percentages

ALTER TABLE trades ALTER COLUMN allocation TYPE NUMERIC(10,4);
ALTER TABLE trades ALTER COLUMN sl_percent TYPE NUMERIC(10,4);
ALTER TABLE trades ALTER COLUMN pf_impact TYPE NUMERIC(10,4);
ALTER TABLE trades ALTER COLUMN cumm_pf TYPE NUMERIC(10,4);
ALTER TABLE trades ALTER COLUMN stock_move TYPE NUMERIC(10,4);
ALTER TABLE trades ALTER COLUMN open_heat TYPE NUMERIC(10,4);

-- =====================================================
-- 5. ALTER TRADES TABLE - RATIO AND OTHER FIELDS
-- =====================================================
-- Increase precision for ratio and other numeric fields

ALTER TABLE trades ALTER COLUMN reward_risk TYPE NUMERIC(12,4);

-- =====================================================
-- 6. ALTER OTHER TABLES (if they exist and have similar issues)
-- =====================================================
-- Check if yearly_starting_capitals table exists and fix it
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'yearly_starting_capitals') THEN
        -- Fix capitals field if it has numeric constraints
        EXECUTE 'ALTER TABLE yearly_starting_capitals ALTER COLUMN capitals TYPE JSONB';
    END IF;
END $$;

-- Check if capital_changes table exists and fix it
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'capital_changes') THEN
        -- Fix amount field if it has numeric constraints
        EXECUTE 'ALTER TABLE capital_changes ALTER COLUMN amount TYPE NUMERIC(15,4)';
    END IF;
END $$;

-- =====================================================
-- 7. UPDATE CONSTRAINTS AND INDEXES (if needed)
-- =====================================================
-- Add check constraints to prevent extremely large values while allowing reasonable trading amounts

-- Add reasonable upper bounds for price fields (up to 1 million per share)
ALTER TABLE trades ADD CONSTRAINT check_entry_reasonable CHECK (entry >= 0 AND entry <= 1000000);
ALTER TABLE trades ADD CONSTRAINT check_avg_entry_reasonable CHECK (avg_entry >= 0 AND avg_entry <= 1000000);
ALTER TABLE trades ADD CONSTRAINT check_sl_reasonable CHECK (sl >= 0 AND sl <= 1000000);
ALTER TABLE trades ADD CONSTRAINT check_tsl_reasonable CHECK (tsl >= 0 AND tsl <= 1000000);
ALTER TABLE trades ADD CONSTRAINT check_cmp_reasonable CHECK (cmp >= 0 AND cmp <= 1000000);

-- Add reasonable upper bounds for quantity fields (up to 10 million shares)
ALTER TABLE trades ADD CONSTRAINT check_initial_qty_reasonable CHECK (initial_qty >= 0 AND initial_qty <= 10000000);
ALTER TABLE trades ADD CONSTRAINT check_open_qty_reasonable CHECK (open_qty >= 0 AND open_qty <= 10000000);
ALTER TABLE trades ADD CONSTRAINT check_exited_qty_reasonable CHECK (exited_qty >= 0 AND exited_qty <= 10000000);

-- Add reasonable upper bounds for amount fields (up to 1 billion)
ALTER TABLE trades ADD CONSTRAINT check_position_size_reasonable CHECK (position_size >= 0 AND position_size <= 1000000000);
ALTER TABLE trades ADD CONSTRAINT check_realised_amount_reasonable CHECK (realised_amount >= -1000000000 AND realised_amount <= 1000000000);
ALTER TABLE trades ADD CONSTRAINT check_pl_rs_reasonable CHECK (pl_rs >= -1000000000 AND pl_rs <= 1000000000);

-- Add reasonable bounds for percentage fields (-1000% to +1000%)
ALTER TABLE trades ADD CONSTRAINT check_allocation_reasonable CHECK (allocation >= 0 AND allocation <= 1000);
ALTER TABLE trades ADD CONSTRAINT check_sl_percent_reasonable CHECK (sl_percent >= 0 AND sl_percent <= 100);
ALTER TABLE trades ADD CONSTRAINT check_pf_impact_reasonable CHECK (pf_impact >= -1000 AND pf_impact <= 1000);
ALTER TABLE trades ADD CONSTRAINT check_cumm_pf_reasonable CHECK (cumm_pf >= -1000 AND cumm_pf <= 1000);
ALTER TABLE trades ADD CONSTRAINT check_stock_move_reasonable CHECK (stock_move >= -1000 AND stock_move <= 1000);
ALTER TABLE trades ADD CONSTRAINT check_open_heat_reasonable CHECK (open_heat >= 0 AND open_heat <= 100);

-- =====================================================
-- 8. COMMIT TRANSACTION
-- =====================================================
COMMIT;

-- =====================================================
-- 9. VERIFICATION QUERIES
-- =====================================================
-- Run these queries to verify the changes were applied successfully

-- Check column types
SELECT
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_name = 'trades'
    AND data_type = 'numeric'
ORDER BY column_name;

-- Check constraints
SELECT
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'trades'
    AND constraint_type = 'CHECK';

-- Test insert with previously problematic values
-- (Uncomment to test after running the migration)
/*
INSERT INTO trades (
    id, user_id, trade_no, date, name, entry, avg_entry,
    realised_amount, pl_rs, position_size
) VALUES (
    gen_random_uuid(),
    auth.uid(),
    'TEST001',
    '2024-01-01',
    'Test Large Values',
    25000.50,     -- Large stock price
    25000.50,     -- Large average entry
    2500000.75,   -- Large realised amount (2.5M)
    150000.25,    -- Large P&L (150K)
    1500000.00    -- Large position size (1.5M)
);
*/
