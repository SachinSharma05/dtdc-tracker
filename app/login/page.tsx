"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, User, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      username,
      password,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid username or password");
      return;
    }

    router.replace("/admin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 p-4">
      <Card className="w-full max-w-md shadow-xl backdrop-blur-sm bg-white/80">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold tracking-tight">
            Welcome Back
          </CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Sign in to continue to the Admin Panel
          </p>
        </CardHeader>

        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Username */}
            <div className="space-y-1">
              <Label>Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter username"
                  className="pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />

                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Enter password"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <button
                  type="button"
                  className="absolute right-3 top-2.5 text-muted-foreground"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full py-2 text-base"
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-6">
            © {new Date().getFullYear()} Admin System — All Rights Reserved
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
