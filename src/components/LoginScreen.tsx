import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = isRegister
      ? await register(username, password)
      : await login(username, password);
    
    if (!result.success) {
      setError(result.error || 'Authentication failed');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Commons</CardTitle>
          <CardDescription>
            {isRegister
              ? 'Create an account to get started.'
              : 'Sign in to your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (isRegister ? 'Creating Account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
