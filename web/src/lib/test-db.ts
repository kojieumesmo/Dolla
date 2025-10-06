// Test database connection
export async function testDatabaseConnection() {
  try {
    // Dynamic import to avoid module-level issues
    const { supabase } = await import('./supabase')
    
    const { error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    if (error) {
      console.error('Database connection failed:', error)
      return false
    }
    
    console.log('✅ Database connection successful!')
    return true
  } catch (err) {
    console.error('Database test failed:', err)
    return false
  }
}

// Test creating a user
export async function testCreateUser() {
  try {
    // Dynamic import to avoid module-level issues
    const { createUser } = await import('./database')
    
    const testUser = await createUser('+1234567890', 'Test User')
    console.log('✅ User created:', testUser)
    return testUser
  } catch (err) {
    console.error('Failed to create user:', err)
    return null
  }
}
