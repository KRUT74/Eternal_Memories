"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { User, Mail, Lock, UserPlus, LogIn, Sparkles } from "lucide-react"
import type { User as AppUser } from "../lib/types"

interface AuthFormProps {
  onAuth: (user: AppUser) => void
}

export default function AuthForm({ onAuth }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // Simple validation
      if (!formData.email || !formData.password) {
        throw new Error("Email and password are required")
      }

      if (!isLogin && !formData.name) {
        throw new Error("Name is required for registration")
      }

      // Normalize email
      const userEmail = formData.email.toLowerCase().trim()

      // Create user object
      const user = {
        id: `user_${userEmail.replace(/[^a-zA-Z0-9]/g, "_")}`,
        name: formData.name || formData.email.split("@")[0],
        email: userEmail,
      }

      // Demo-only sign-in: the user lives in localStorage. Real auth arrives with Supabase in Phase 2.
      // Call the onAuth callback
      onAuth(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="glass-card p-8 rounded-xl max-w-md mx-auto">
      <div className="flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 mr-2 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">{isLogin ? "Enter the Cosmos" : "Join the Universe"}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-white/80 mb-1">
              Cosmic Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-purple-400" />
              <Input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your cosmic identity"
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                required={!isLogin}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-1">
            Cosmic Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-purple-400" />
            <Input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="your@cosmic.email"
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-1">
            Cosmic Key
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-purple-400" />
            <Input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your secret key"
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-red-300 text-sm bg-red-500/20 p-2 rounded border border-red-500/30">{error}</div>
        )}

        <Button type="submit" disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
          {isLoading ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
              {isLogin ? "Entering cosmos..." : "Joining universe..."}
            </div>
          ) : (
            <div className="flex items-center justify-center">
              {isLogin ? <LogIn className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              {isLogin ? "Enter Cosmos" : "Join Universe"}
            </div>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="text-purple-300 hover:text-purple-200 text-sm"
        >
          {isLogin ? "New to the cosmos? Join the universe" : "Already cosmic? Enter the cosmos"}
        </button>
      </div>

      <div className="mt-4 text-xs text-white/60 text-center">
        <p>✨ Demo mode: use any email and password to continue ✨</p>
      </div>
    </div>
  )
}
