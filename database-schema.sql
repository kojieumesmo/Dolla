-- Dolla Expense Splitter Database Schema
-- Run these commands in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  venmo VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Groups table
CREATE TABLE groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  theme_color VARCHAR(7) DEFAULT '#38bdf8',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group members table
CREATE TABLE group_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, phone)
);

-- Non-members (invited users who haven't joined yet)
CREATE TABLE group_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_notified_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(group_id, phone)
);

-- Expenses table
CREATE TABLE expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  amount_cents INTEGER NOT NULL,
  payer_id UUID REFERENCES users(id),
  payer_phone VARCHAR(20) NOT NULL, -- Fallback if user is deleted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expense participants (who shares the cost)
CREATE TABLE expense_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL, -- Fallback if user is deleted
  UNIQUE(expense_id, phone)
);

-- Create indexes for better performance
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_expenses_group_id ON expenses(group_id);
CREATE INDEX idx_expense_participants_expense_id ON expense_participants(expense_id);
CREATE INDEX idx_group_invitations_group_id ON group_invitations(group_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_participants ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (we'll add proper auth later)
CREATE POLICY "Allow all operations" ON users FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON groups FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON group_members FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON group_invitations FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON expenses FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON expense_participants FOR ALL USING (true);
