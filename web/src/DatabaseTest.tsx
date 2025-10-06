import { testDatabaseConnection, testCreateUser } from './lib/test-db'

export default function DatabaseTest() {
  const handleTestConnection = async () => {
    console.log('Testing database connection...')
    const success = await testDatabaseConnection()
    if (success) {
      alert('✅ Database connection successful!')
    } else {
      alert('❌ Database connection failed. Check console for details.')
    }
  }

  const handleTestCreateUser = async () => {
    console.log('Testing user creation...')
    const user = await testCreateUser()
    if (user) {
      alert(`✅ User created successfully! ID: ${user.id}`)
    } else {
      alert('❌ Failed to create user. Check console for details.')
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Database Test Page</h1>
      <p>This page tests the Supabase database connection.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleTestConnection}
          style={{ 
            padding: '10px 20px', 
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Connection
        </button>
        
        <button 
          onClick={handleTestCreateUser}
          style={{ 
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Create User
        </button>
      </div>
      
      <p><strong>Instructions:</strong></p>
      <ol>
        <li>Make sure you've run the database schema in Supabase</li>
        <li>Click "Test Connection" to verify the database is accessible</li>
        <li>Click "Test Create User" to test creating a user record</li>
        <li>Check the browser console for detailed logs</li>
      </ol>
    </div>
  )
}
