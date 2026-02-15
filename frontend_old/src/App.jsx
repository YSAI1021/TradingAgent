import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimezoneProvider } from './context/TimezoneContext'
import Auth from './pages/Auth'
import Home from './pages/Home'
import PostDetail from './pages/PostDetail'
import UserProfile from './pages/UserProfile'
import Competition from './pages/Competition'
import AIChat from './pages/AIChat'
import './App.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  return user ? children : <Navigate to="/auth" />
}

function App() {
  return (
    <AuthProvider>
      <TimezoneProvider>
        <Router>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/post/:id"
              element={
                <ProtectedRoute>
                  <PostDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <UserProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/competition"
              element={
                <ProtectedRoute>
                  <Competition />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ai-chat"
              element={
                <ProtectedRoute>
                  <AIChat />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </TimezoneProvider>
    </AuthProvider>
  )
}

export default App
